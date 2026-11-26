// ============================================================================
// pod-wallet.js  —  Core Insight: Pay on Delivery (POD) + Seller Wallet
// ----------------------------------------------------------------------------
// ONE file that replaces ALL the old POD / wallet code that was scattered
// through index.js. See INSTALL.md for the exact blocks to delete.
//
// HOW POD WORKS
//   1. Buyer picks "Pay on Delivery" on a physical product.
//   2. Seller has 24h to accept. Accepting RESERVES 10% of the order total from
//      the seller's wallet (so the platform's share is already secured).
//   3. Seller ships -> buyer gets a 6-digit delivery code by email.
//   4. Buyer pays the seller CASH and gives the code -> order = delivered.
//   5. 7-day refund window starts. If nobody raises a problem, the sweep job
//      takes the reserved 10% from the wallet for the platform.
//   6. Cancelled / refunded / never shipped -> the reserve goes back to the
//      seller's available balance.
// ============================================================================
"use strict";

const crypto = require("crypto");

module.exports = function mountPodWallet(app, deps) {
  const { db, sendEmail, createBuyerNotification, createSellerNotification } = deps;
  if (!app || !db) throw new Error("pod-wallet: app and db are required");

  // ------------------------------------------------------------------ config
  const FEE_RATE = 0.10;               // platform share
  const REFUND_WINDOW_DAYS = 7;        // after delivery
  const SELLER_RESPONSE_HOURS = 24;    // seller must accept within this
  const SHIP_DEADLINE_DAYS = 7;        // accepted but never shipped -> auto cancel
  const MIN_TOPUP = 1;
  const MAX_TOPUP = 5000;
  const MAX_CODE_ATTEMPTS = 5;
  const SITE_URL = (process.env.SITE_URL || "https://coreinsightmarket.com").replace(/\/+$/, "");

  // ----------------------------------------------------------------- helpers
  // db.query in this project sometimes returns rows and sometimes [rows, fields]
  const rows = (r) => {
    if (!r) return [];
    if (Array.isArray(r) && r.length === 2 && Array.isArray(r[0])) return r[0];
    if (Array.isArray(r)) return r;
    return [];
  };
  const affected = (r) =>
    Number((r && (r.affectedRows ?? (Array.isArray(r) ? r[0]?.affectedRows : 0))) || 0);
  const insertIdOf = (r) =>
    (r && (r.insertId ?? (Array.isArray(r) ? r[0]?.insertId : null))) || null;
  const one = async (sql, params) => rows(await db.query(sql, params))[0] || null;
  const money = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const isDup = (e) => !!e && (e.code === "ER_DUP_ENTRY" || /duplicate/i.test(e.message || ""));
  const fmt = (n) => "$" + money(n).toFixed(2);

  const needLogin = (req, res, next) =>
    req.session && req.session.user ? next() : res.status(401).json({ error: "Please log in" });

  const fail = (res, err, label) => {
    console.error(`❌ POD ${label}:`, err && err.message ? err.message : err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  };

  const mail = (to, subject, html) => {
    if (!to || typeof sendEmail !== "function") return;
    Promise.resolve(sendEmail(to, subject, html)).catch((e) =>
      console.error("POD email failed:", e && e.message)
    );
  };
  const wrapMail = (title, body) =>
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e2329">
       <h2 style="margin:0 0 12px">${title}</h2>${body}
       <p style="margin-top:24px;font-size:12px;color:#6b7a8f">Core Insight · coreinsightmarket.com</p>
     </div>`;
  const notifySeller = (sellerId, orderId, type, title, msg) => {
    if (typeof createSellerNotification !== "function") return;
    Promise.resolve(createSellerNotification(sellerId, orderId, type, title, msg)).catch(() => {});
  };
  const notifyBuyer = (buyerId, orderId, type, title, msg) => {
    if (typeof createBuyerNotification !== "function") return;
    Promise.resolve(createBuyerNotification(buyerId, orderId, type, title, msg)).catch(() => {});
  };

  // -------------------------------------------------------------- migrations
  async function migrate() {
    const run = async (sql, label) => {
      try { await db.query(sql); }
      catch (e) {
        if (!/duplicate|already exists/i.test(e.message || ""))
          console.error(`❌ POD migration failed (${label}):`, e.message);
      }
    };

    await run(`CREATE TABLE IF NOT EXISTS seller_wallets (
      user_id INT PRIMARY KEY,
      available_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      reserved_balance  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(10) DEFAULT 'USD',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, "seller_wallets");

    await run(`CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type VARCHAR(30) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      balance_after DECIMAL(12,2),
      order_id INT NULL,
      description VARCHAR(255),
      reference VARCHAR(120) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id, created_at)
    )`, "wallet_transactions");
    await run(`ALTER TABLE wallet_transactions ADD COLUMN reference VARCHAR(120) NULL`, "wallet_transactions.reference");
    await run(`ALTER TABLE wallet_transactions ADD UNIQUE INDEX uq_wallet_reference (reference)`, "wallet_transactions unique reference");

    const cols = [
      ["is_pay_on_delivery", "TINYINT(1) DEFAULT 0"],
      ["pod_fee_amount", "DECIMAL(10,2) NULL"],
      ["pod_fee_mode", "VARCHAR(20) NULL"],
      ["pod_fee_release_at", "DATETIME NULL"],
      ["pod_fee_released", "TINYINT(1) DEFAULT 0"],
      ["pod_fee_returned", "TINYINT(1) DEFAULT 0"],
      ["pod_accepted_at", "DATETIME NULL"],
      ["seller_response_deadline", "DATETIME NULL"],
      ["delivery_code_attempts", "INT DEFAULT 0"],
      ["city", "VARCHAR(120) NULL"],
      ["state", "VARCHAR(120) NULL"],
      ["country", "VARCHAR(120) NULL"],
      ["notes", "TEXT NULL"],
    ];
    for (const [c, def] of cols)
      await run(`ALTER TABLE physical_orders ADD COLUMN ${c} ${def}`, `physical_orders.${c}`);
    console.log("✅ POD wallet migrations checked");
  }
  migrate().catch((e) => console.error("POD migrate error:", e.message));

  // ----------------------------------------------------------- wallet engine
  // Every balance change is a single atomic SQL statement (no read-modify-write),
  // and every order-level money move is "claimed" with a flag first so it can
  // never happen twice, even if the user double-clicks or two cron runs overlap.
  async function ensureWallet(userId) {
    await db.query(`INSERT IGNORE INTO seller_wallets (user_id) VALUES (?)`, [userId]);
  }

  async function getWallet(userId) {
    await ensureWallet(userId);
    const w = await one(
      `SELECT user_id, available_balance, reserved_balance, currency, updated_at
         FROM seller_wallets WHERE user_id = ?`, [userId]);
    return {
      user_id: Number(userId),
      available_balance: money(w && w.available_balance),
      reserved_balance: money(w && w.reserved_balance),
      currency: (w && w.currency) || "USD",
      updated_at: w && w.updated_at,
    };
  }

  async function logTx(userId, type, amount, balanceAfter, orderId, description, reference) {
    await db.query(
      `INSERT INTO wallet_transactions
         (user_id, type, amount, balance_after, order_id, description, reference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, type, money(amount), balanceAfter == null ? null : money(balanceAfter),
       orderId || null, description ? String(description).slice(0, 250) : null, reference || null]
    );
  }

  async function creditTopup(userId, amount, reference, description) {
    // claim the reference first -> the same payment can never be credited twice
    try {
      await logTx(userId, "topup", amount, null, null, description, reference);
    } catch (e) {
      if (isDup(e)) return { duplicate: true };
      throw e;
    }
    try {
      await ensureWallet(userId);
      await db.query(
        `UPDATE seller_wallets SET available_balance = available_balance + ?, updated_at = NOW()
          WHERE user_id = ?`, [money(amount), userId]);
    } catch (e) {
      await db.query(`DELETE FROM wallet_transactions WHERE reference = ?`, [reference]).catch(() => {});
      throw e;
    }
    const w = await getWallet(userId);
    await db.query(`UPDATE wallet_transactions SET balance_after = ? WHERE reference = ?`,
      [w.available_balance, reference]).catch(() => {});
    return { duplicate: false, balance: w.available_balance };
  }

  // available -> reserved (fails if available < fee)
  async function reserveFee(sellerId, fee) {
    await ensureWallet(sellerId);
    const r = await db.query(
      `UPDATE seller_wallets
          SET available_balance = available_balance - ?,
              reserved_balance  = reserved_balance + ?,
              updated_at = NOW()
        WHERE user_id = ? AND available_balance >= ?`,
      [fee, fee, sellerId, fee]);
    return affected(r) > 0;
  }
  // reserved -> available
  async function unreserveFee(sellerId, fee) {
    await db.query(
      `UPDATE seller_wallets
          SET available_balance = available_balance + ?,
              reserved_balance  = GREATEST(reserved_balance - ?, 0),
              updated_at = NOW()
        WHERE user_id = ?`, [fee, fee, sellerId]);
  }
  // reserved -> platform
  async function dropReserved(sellerId, fee) {
    await db.query(
      `UPDATE seller_wallets
          SET reserved_balance = GREATEST(reserved_balance - ?, 0), updated_at = NOW()
        WHERE user_id = ?`, [fee, sellerId]);
  }

  // Give the reserved fee back to the seller (cancel / refund). Runs once per order.
  async function returnFeeToSeller(order, reason) {
    const claim = await db.query(
      `UPDATE physical_orders SET pod_fee_returned = 1
        WHERE id = ? AND pod_fee_mode = 'reserved'
          AND COALESCE(pod_fee_released,0) = 0 AND COALESCE(pod_fee_returned,0) = 0`,
      [order.id]);
    if (!affected(claim)) return false;
    const fee = money(order.pod_fee_amount);
    await unreserveFee(order.seller_id, fee);
    const w = await getWallet(order.seller_id);
    await logTx(order.seller_id, "release_back", fee, w.available_balance, order.id,
      reason || `Reserve returned for order #${order.id}`);
    return true;
  }

  // Platform takes its 10% out of the reserve. Runs once per order.
  async function collectFeeForPlatform(order) {
    const claim = await db.query(
      `UPDATE physical_orders SET pod_fee_released = 1
        WHERE id = ? AND pod_fee_mode = 'reserved'
          AND COALESCE(pod_fee_released,0) = 0 AND COALESCE(pod_fee_returned,0) = 0`,
      [order.id]);
    if (!affected(claim)) return false;
    const fee = money(order.pod_fee_amount);
    await dropReserved(order.seller_id, fee);
    const w = await getWallet(order.seller_id);
    await logTx(order.seller_id, "release_to_platform", fee, w.available_balance, order.id,
      `Platform fee (10%) collected for order #${order.id}`);
    return true;
  }

  // how much of the seller's available balance is already "spoken for" by
  // requests that are waiting for their answer
  async function pendingExposure(sellerId) {
    const r = await one(
      `SELECT COUNT(*) AS n, COALESCE(SUM(pod_fee_amount),0) AS fee
         FROM physical_orders
        WHERE seller_id = ? AND is_pay_on_delivery = 1
          AND order_status = 'pending_seller_approval'
          AND (seller_response_deadline IS NULL OR seller_response_deadline > NOW())`,
      [sellerId]);
    return { count: Number(r && r.n) || 0, fee: money(r && r.fee) };
  }

  const ORDER_SELECT =
    `SELECT o.*, us.email AS seller_email, us.username AS seller_name,
            ub.email AS buyer_email, ub.username AS buyer_username
       FROM physical_orders o
       LEFT JOIN users us ON us.id = o.seller_id
       LEFT JOIN users ub ON ub.id = o.buyer_id`;
  const getOrder = (id) => one(`${ORDER_SELECT} WHERE o.id = ?`, [id]);
  const orderTitle = (o) => esc(o.product_name || `Order #${o.id}`);

  // ============================================================== WALLET API
  app.get("/api/wallet/balance", needLogin, async (req, res) => {
    try {
      const uid = req.session.user.id;
      const w = await getWallet(uid);
      const p = await pendingExposure(uid);
      res.json({
        ...w,
        credit_owed: 0, // kept so older dashboard code never shows "NaN"
        pending_requests_count: p.count,
        pending_requests_fee: p.fee,
        spare_after_pending: money(w.available_balance - p.fee),
        fee_rate: FEE_RATE,
        refund_window_days: REFUND_WINDOW_DAYS,
        min_topup: MIN_TOPUP,
      });
    } catch (e) { fail(res, e, "balance"); }
  });

  const TX_META = {
    topup:               { label: "Wallet top-up",           direction: "in"  },
    release_back:        { label: "Reserve returned",        direction: "in"  },
    reserve:             { label: "Reserved for an order",   direction: "out" },
    release_to_platform: { label: "Platform fee collected",  direction: "out" },
  };

  app.get("/api/wallet/transactions", needLogin, async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const list = rows(await db.query(
        `SELECT id, type, amount, balance_after, order_id, description, created_at
           FROM wallet_transactions WHERE user_id = ?
          ORDER BY created_at DESC, id DESC LIMIT ${limit}`, [req.session.user.id]));
      res.json(list.map((t) => ({
        ...t,
        amount: money(t.amount),
        balance_after: t.balance_after == null ? null : money(t.balance_after),
        label: (TX_META[t.type] || {}).label || t.type,
        direction: (TX_META[t.type] || {}).direction || "out",
      })));
    } catch (e) { fail(res, e, "transactions"); }
  });

  app.post("/api/wallet/fund", needLogin, async (req, res) => {
    try {
      const amount = money(parseFloat((req.body || {}).amount));
      if (!amount || amount < MIN_TOPUP || amount > MAX_TOPUP)
        return res.status(400).json({ error: `Enter an amount between $${MIN_TOPUP} and $${MAX_TOPUP}.` });
      if (!process.env.FLW_SECRET_KEY)
        return res.status(500).json({ error: "Payment system not configured." });

      const user = req.session.user;
      const txRef = `WALLET_${user.id}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const flw = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_ref: txRef,
          amount,
          currency: "USD",
          // profile.html finishes the job (verifies the payment) when the buyer lands back here
          redirect_url: `${SITE_URL}/profile.html?tab=wallet`,
          customer: { email: user.email, name: user.username },
          meta: { purpose: "wallet_topup", user_id: String(user.id) },
          customizations: {
            title: "Core Insight Wallet Top-Up",
            description: `Add ${fmt(amount)} to your seller wallet`,
          },
        }),
      });
      const data = await flw.json();
      if (data.status !== "success" || !data.data || !data.data.link)
        return res.status(502).json({ error: "Could not start the payment. Please try again." });
      res.json({ success: true, payment_link: data.data.link, tx_ref: txRef });
    } catch (e) { fail(res, e, "fund"); }
  });

  app.get("/api/wallet/verify-topup", needLogin, async (req, res) => {
    try {
      const txRef = String(req.query.tx_ref || "");
      const txId = String(req.query.transaction_id || "").replace(/\D/g, "");
      const m = /^WALLET_(\d+)_/.exec(txRef);
      if (!m || !txId) return res.status(400).json({ error: "Invalid reference." });
      if (Number(m[1]) !== Number(req.session.user.id))
        return res.status(403).json({ error: "This payment belongs to another account." });

      const vr = await fetch(`https://api.flutterwave.com/v3/transactions/${txId}/verify`, {
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
      });
      const v = await vr.json();
      const d = v && v.data;
      // The payment must be successful, be the SAME tx_ref we issued (stops people
      // reusing someone else's transaction id), and be in USD.
      if (!d || d.status !== "successful" || d.tx_ref !== txRef || d.currency !== "USD")
        return res.status(400).json({ success: false, error: "Payment not successful." });

      const amount = money(d.amount);
      const result = await creditTopup(req.session.user.id, amount, `flw_${d.id}`, `Top-up ${txRef}`);
      if (result.duplicate) {
        const w = await getWallet(req.session.user.id);
        return res.json({ success: true, already_processed: true, new_balance: w.available_balance });
      }
      res.json({ success: true, credited: amount, new_balance: result.balance });
    } catch (e) { fail(res, e, "verify-topup"); }
  });

  // ============================================================ CREATE ORDER
  async function handleCreatePodOrder(req, res) {
    try {
      const user = req.session.user;
      const b = req.body || {};
      const qty = Math.min(Math.max(parseInt(b.quantity, 10) || 1, 1), 100);
      const address = String(b.deliveryAddress || "").trim();
      const phone = String(b.deliveryPhone || "").trim();
      if (!b.productId) return res.status(400).json({ error: "Product is required." });
      if (!address) return res.status(400).json({ error: "Please enter a delivery address." });
      if (!phone) return res.status(400).json({ error: "Please enter a phone number or email for delivery." });

      const product = await one(
        `SELECT * FROM products WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, [b.productId]);
      if (!product) return res.status(404).json({ error: "Product not found." });
      if (product.type !== "physical")
        return res.status(400).json({ error: "Pay on Delivery is only available for physical products." });
      if (!["pay_on_delivery", "both"].includes(product.payment_option))
        return res.status(400).json({ error: "This seller doesn't offer Pay on Delivery for this product." });

      const sellerId = product.user_id;
      if (Number(sellerId) === Number(user.id))
        return res.status(400).json({ error: "You can't order your own product." });

      const price = money(product.price);
      const total = money(price * qty);
      const fee = money(total * FEE_RATE);
      const earnings = money(total - fee);
      if (!(total > 0)) return res.status(400).json({ error: "This product has no valid price." });

      // Don't let buyers queue requests the seller could never accept.
      const wallet = await getWallet(sellerId);
      const exposure = await pendingExposure(sellerId);
      if (money(wallet.available_balance - exposure.fee) < fee) {
        notifySeller(sellerId, null, "order_update", "A customer tried Pay on Delivery",
          `A customer wanted to order "${product.title}" with Pay on Delivery, but your wallet needs ${fmt(fee)} free to take it. Top up your wallet so you don't miss orders.`);
        return res.status(409).json({
          code: "seller_unavailable",
          error: "This seller can't take Pay on Delivery orders right now. Please try again later or choose to pay online.",
        });
      }

      const txRef = `POD_${Date.now()}_${user.id}_${crypto.randomBytes(2).toString("hex")}`;
      const ins = await db.query(
        `INSERT INTO physical_orders (
           product_id, seller_id, buyer_id, product_name, quantity,
           price, total_amount,
           customer_name, customer_email, shipping_address, delivery_phone,
           city, state, country, notes,
           platform_fee, seller_earnings, fee_breakdown,
           transaction_ref, payment_provider, payment_status, order_status,
           is_pay_on_delivery, pod_fee_amount, pod_fee_released, seller_response_deadline, created_at
         ) VALUES (?,?,?,?,?, ?,?, ?,?,?,?, ?,?,?,?, ?,?,?, ?,'pay_on_delivery','pod_unpaid','pending_seller_approval',
                   1,?,0, DATE_ADD(NOW(), INTERVAL ? HOUR), NOW())`,
        [product.id, sellerId, user.id, product.title, qty,
         price, total,
         user.username, user.email, address, phone,
         b.city || null, b.state || null, b.country || null, b.notes || null,
         fee, earnings, JSON.stringify({ platformFee: fee, sellerEarnings: earnings, mode: "pay_on_delivery" }),
         txRef, fee, SELLER_RESPONSE_HOURS]);
      const orderId = insertIdOf(ins);

      notifySeller(sellerId, orderId, "new_order", "💵 New Pay on Delivery request",
        `${product.title} × ${qty} (${fmt(total)}). Accept within ${SELLER_RESPONSE_HOURS}h — ${fmt(fee)} will be reserved from your wallet.`);
      const seller = await one(`SELECT email FROM users WHERE id = ?`, [sellerId]);
      mail(seller && seller.email, `New Pay on Delivery order — #${orderId}`,
        wrapMail("New Pay on Delivery request",
          `<p><strong>${esc(product.title)}</strong> × ${qty} — ${fmt(total)}</p>
           <p>To accept, you need <strong>${fmt(fee)}</strong> available in your wallet. It is reserved until the
           customer has paid you cash and the ${REFUND_WINDOW_DAYS}-day refund window has passed.</p>
           <p>You have ${SELLER_RESPONSE_HOURS} hours to respond, or the order is cancelled automatically.</p>
           <p><a href="${SITE_URL}/profile.html?tab=wallet">Open your wallet</a></p>`));

      res.status(201).json({
        success: true,
        order_id: orderId, orderId,                 // both spellings: old + new frontend
        total_amount: total, totalAmount: total,
        platform_fee: fee,
        message: "Order sent to the seller. You pay cash when it arrives.",
      });
    } catch (e) { fail(res, e, "create"); }
  }

  app.post("/api/pod-orders/create", needLogin, handleCreatePodOrder);

  // The normal checkout posts to /api/physical-orders/create. If the buyer chose
  // Pay on Delivery (or the product is POD-only) we take over; otherwise we step
  // aside and the original online-payment route runs untouched.
  app.post("/api/physical-orders/create", async (req, res, next) => {
    try {
      const b = req.body || {};
      const wantsPod = String(b.payment_method || "").toLowerCase() === "pod" || b.pay_on_delivery === true;
      let podOnly = false;
      if (b.productId) {
        const p = await one(`SELECT payment_option FROM products WHERE id = ?`, [b.productId]);
        podOnly = !!p && p.payment_option === "pay_on_delivery";
      }
      if (!wantsPod && !podOnly) return next();
      if (!req.session || !req.session.user) return res.status(401).json({ error: "Please log in" });
      return handleCreatePodOrder(req, res);
    } catch (e) { next(e); }
  });

  // ============================================================ SELLER LISTS
  app.get("/api/my-pod-orders", needLogin, async (req, res) => {
    try {
      const scope = String(req.query.scope || "pending");
      const where =
        scope === "all" ? ""
        : scope === "active"
          ? "AND o.order_status IN ('pending_seller_approval','accepted_pod','shipped','delivered','refund_requested')"
          : "AND o.order_status = 'pending_seller_approval'";
      const list = rows(await db.query(
        `SELECT o.id, o.product_id, o.product_name, o.quantity, o.total_amount, o.platform_fee,
                o.seller_earnings, o.pod_fee_amount, o.pod_fee_mode, o.order_status, o.payment_status,
                o.pod_fee_release_at, COALESCE(o.pod_fee_released,0) AS pod_fee_released,
                COALESCE(o.pod_fee_returned,0) AS pod_fee_returned,
                o.seller_response_deadline, o.created_at, o.delivered_at, o.refund_reason,
                o.customer_name, o.shipping_address, o.delivery_phone, o.city, o.state, o.country
           FROM physical_orders o
          WHERE o.seller_id = ? AND o.is_pay_on_delivery = 1 ${where}
          ORDER BY o.created_at DESC LIMIT 100`, [req.session.user.id]));

      res.json(list.map((o) => {
        const out = { ...o };
        out.total_amount = money(o.total_amount);
        out.pod_fee_amount = money(o.pod_fee_amount);
        // Buyer's street address + phone are only shared once the seller has committed.
        if (o.order_status === "pending_seller_approval") {
          out.shipping_address = null;
          out.delivery_phone = null;
        }
        return out;
      }));
    } catch (e) { fail(res, e, "my-pod-orders"); }
  });

  // =========================================================== ACCEPT / REJECT
  app.post("/api/pod-orders/:orderId/accept", needLogin, async (req, res) => {
    try {
      const sellerId = req.session.user.id;
      const order = await getOrder(req.params.orderId);
      if (!order || Number(order.seller_id) !== Number(sellerId) || !order.is_pay_on_delivery)
        return res.status(404).json({ error: "Order not found" });
      if (order.order_status !== "pending_seller_approval")
        return res.status(400).json({ error: `This order is already ${String(order.order_status).replace(/_/g, " ")}.` });
      if (order.seller_response_deadline && new Date(order.seller_response_deadline) <= new Date())
        return res.status(400).json({ error: "The 24-hour response time has passed. This order is being cancelled." });

      const fee = money(order.pod_fee_amount);
      if (!(await reserveFee(sellerId, fee))) {
        const w = await getWallet(sellerId);
        return res.status(400).json({
          error: `You need ${fmt(fee)} available in your wallet to accept this order.`,
          required_fee: fee,
          available_balance: w.available_balance,
          shortfall: money(fee - w.available_balance),
        });
      }
      const claim = await db.query(
        `UPDATE physical_orders
            SET order_status = 'accepted_pod', pod_fee_mode = 'reserved', pod_accepted_at = NOW()
          WHERE id = ? AND seller_id = ? AND order_status = 'pending_seller_approval'`,
        [order.id, sellerId]);
      if (!affected(claim)) {                // somebody else got there first -> undo
        await unreserveFee(sellerId, fee);
        return res.status(409).json({ error: "This order was already handled." });
      }
      const w = await getWallet(sellerId);
      await logTx(sellerId, "reserve", fee, w.available_balance, order.id, `Fee reserved for order #${order.id}`);

      notifyBuyer(order.buyer_id, order.id, "order_accepted", "✅ Order accepted",
        `The seller accepted your Pay on Delivery order for ${order.product_name}. You pay cash when it arrives.`);
      mail(order.buyer_email, `Your order #${order.id} was accepted`,
        wrapMail("Your order was accepted",
          `<p>The seller accepted your order for <strong>${orderTitle(order)}</strong>.</p>
           <p>You pay <strong>${fmt(order.total_amount)}</strong> in cash when it is delivered. You'll get a delivery code by email when it ships.</p>`));
      res.json({ success: true, fee_mode: "reserved", reserved: fee, available_balance: w.available_balance, reserved_balance: w.reserved_balance });
    } catch (e) { fail(res, e, "accept"); }
  });

  app.post("/api/pod-orders/:orderId/reject", needLogin, async (req, res) => {
    try {
      const order = await getOrder(req.params.orderId);
      if (!order || Number(order.seller_id) !== Number(req.session.user.id) || !order.is_pay_on_delivery)
        return res.status(404).json({ error: "Order not found" });
      if (order.order_status !== "pending_seller_approval")
        return res.status(400).json({ error: "Only requests waiting for your answer can be rejected. Use Cancel for accepted orders." });
      const claim = await db.query(
        `UPDATE physical_orders SET order_status = 'cancelled'
          WHERE id = ? AND order_status = 'pending_seller_approval'`, [order.id]);
      if (!affected(claim)) return res.status(409).json({ error: "This order was already handled." });
      notifyBuyer(order.buyer_id, order.id, "order_rejected", "Order not accepted",
        `The seller couldn't take your Pay on Delivery order for ${order.product_name}. Nothing was charged.`);
      mail(order.buyer_email, `Order #${order.id} could not be fulfilled`,
        wrapMail("Order not accepted", `<p>The seller couldn't take your Pay on Delivery order for <strong>${orderTitle(order)}</strong>. Nothing was charged.</p>`));
      res.json({ success: true });
    } catch (e) { fail(res, e, "reject"); }
  });

  // Cancel: buyer (before shipping) or seller (before delivery). Reserve goes back.
  app.post("/api/pod-orders/:orderId/cancel", needLogin, async (req, res) => {
    try {
      const uid = Number(req.session.user.id);
      const order = await getOrder(req.params.orderId);
      const isSeller = order && Number(order.seller_id) === uid;
      const isBuyer = order && Number(order.buyer_id) === uid;
      if (!order || !order.is_pay_on_delivery || (!isSeller && !isBuyer))
        return res.status(404).json({ error: "Order not found" });

      const allowed = isSeller
        ? ["pending_seller_approval", "accepted_pod", "shipped"]
        : ["pending_seller_approval", "accepted_pod"];
      if (!allowed.includes(order.order_status))
        return res.status(400).json({ error: `An order that is "${String(order.order_status).replace(/_/g, " ")}" can't be cancelled here.` });

      const claim = await db.query(
        `UPDATE physical_orders SET order_status = 'cancelled' WHERE id = ? AND order_status = ?`,
        [order.id, order.order_status]);
      if (!affected(claim)) return res.status(409).json({ error: "This order was already handled." });

      const returned = await returnFeeToSeller(order, `Order #${order.id} cancelled — reserve returned`);
      if (isSeller) {
        notifyBuyer(order.buyer_id, order.id, "order_rejected", "Order cancelled",
          `The seller cancelled your Pay on Delivery order for ${order.product_name}. Nothing was charged.`);
        mail(order.buyer_email, `Order #${order.id} was cancelled`,
          wrapMail("Order cancelled", `<p>The seller cancelled your order for <strong>${orderTitle(order)}</strong>. You were not charged.</p>`));
      } else {
        notifySeller(order.seller_id, order.id, "order_update", "Order cancelled by customer",
          `The customer cancelled order #${order.id} (${order.product_name}).${returned ? " Your reserved fee was returned." : ""}`);
        mail(order.seller_email, `Order #${order.id} was cancelled`,
          wrapMail("Order cancelled by the customer", `<p>The customer cancelled <strong>${orderTitle(order)}</strong>.${returned ? " Your reserved fee is back in your available balance." : ""}</p>`));
      }
      res.json({ success: true, fee_returned: returned });
    } catch (e) { fail(res, e, "cancel"); }
  });

  // ========================================================= SHIP + DELIVERY
  async function shipPodOrder(req, res, orderId) {
    try {
      const order = await getOrder(orderId);
      if (!order || Number(order.seller_id) !== Number(req.session.user.id) || !order.is_pay_on_delivery)
        return res.status(404).json({ error: "Order not found or you don't have permission" });
      if (order.order_status === "shipped")
        return res.json({ success: true, message: "Already marked as shipped." });
      if (order.order_status !== "accepted_pod")
        return res.status(400).json({ error: `You can only ship accepted orders (this one is "${String(order.order_status).replace(/_/g, " ")}").` });

      const code = String(crypto.randomInt(100000, 1000000));
      const claim = await db.query(
        `UPDATE physical_orders
            SET delivery_code = ?, delivery_code_sent_at = NOW(), delivery_code_used = 0,
                delivery_code_attempts = 0, order_status = 'shipped'
          WHERE id = ? AND seller_id = ? AND order_status = 'accepted_pod'`,
        [code, order.id, order.seller_id]);
      if (!affected(claim)) return res.status(409).json({ error: "This order was already handled." });

      notifyBuyer(order.buyer_id, order.id, "order_shipped", "📦 Your order is on its way",
        `Your order for ${order.product_name} has shipped. Check your email for the delivery code — give it to the seller only after you have received the item and paid.`);
      mail(order.buyer_email, `Your order #${order.id} has shipped — delivery code inside`,
        wrapMail("Your order is on its way",
          `<p><strong>${orderTitle(order)}</strong> has shipped.</p>
           <p>Your delivery code is:</p>
           <p style="font-size:30px;letter-spacing:6px;font-weight:700;background:#f4f6fa;padding:14px 20px;display:inline-block;border-radius:10px">${code}</p>
           <p><strong>Only give this code to the seller after you have received the item and paid ${fmt(order.total_amount)} in cash.</strong>
           Giving the code confirms delivery. You then have ${REFUND_WINDOW_DAYS} days to raise any problem.</p>`));
      // NB: the code is deliberately NOT returned to the seller.
      res.json({
        success: true,
        order_status: "shipped",
        message: "Marked as shipped. The customer received a delivery code by email — ask for it when you hand over the item and collect payment.",
      });
    } catch (e) { fail(res, e, "ship"); }
  }

  async function confirmPodDelivery(req, res, orderId, actor) {
    try {
      const code = String((req.body || {}).delivery_code ?? (req.body || {}).code ?? "").trim();
      if (!/^\d{6}$/.test(code))
        return res.status(400).json({ error: "Please enter the 6-digit delivery code." });
      const order = await getOrder(orderId);
      const uid = Number(req.session.user.id);
      const mine = order && (actor === "seller" ? Number(order.seller_id) === uid : Number(order.buyer_id) === uid);
      if (!order || !order.is_pay_on_delivery || !mine)
        return res.status(404).json({ error: "Order not found or you don't have permission" });
      if (order.order_status !== "shipped")
        return res.status(400).json({ error: `Can't confirm delivery while the order is "${String(order.order_status).replace(/_/g, " ")}".` });
      if (Number(order.delivery_code_used) === 1)
        return res.status(400).json({ error: "This delivery code was already used." });
      if (!order.delivery_code)
        return res.status(400).json({ error: "No delivery code exists for this order yet." });
      if (Number(order.delivery_code_attempts || 0) >= MAX_CODE_ATTEMPTS)
        return res.status(429).json({ error: "Too many wrong codes. Please contact support." });

      const a = Buffer.from(String(order.delivery_code));
      const b = Buffer.from(code);
      const match = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!match) {
        await db.query(`UPDATE physical_orders SET delivery_code_attempts = COALESCE(delivery_code_attempts,0) + 1 WHERE id = ?`, [order.id]);
        const left = MAX_CODE_ATTEMPTS - (Number(order.delivery_code_attempts || 0) + 1);
        return res.status(400).json({ error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong codes. Please contact support." });
      }

      const claim = await db.query(
        `UPDATE physical_orders
            SET order_status = 'delivered', delivered_at = NOW(),
                pod_fee_release_at = DATE_ADD(NOW(), INTERVAL ? DAY),
                payment_status = 'pod_cash_collected',
                delivery_code_used = 1, delivery_code_used_at = NOW()
          WHERE id = ? AND order_status = 'shipped' AND COALESCE(delivery_code_used,0) = 0`,
        [REFUND_WINDOW_DAYS, order.id]);
      if (!affected(claim)) return res.status(409).json({ error: "This order was already handled." });

      const fresh = await getOrder(order.id);
      const until = fresh && fresh.pod_fee_release_at ? new Date(fresh.pod_fee_release_at) : null;
      const untilTxt = until ? until.toDateString() : `${REFUND_WINDOW_DAYS} days from now`;

      notifyBuyer(order.buyer_id, order.id, "delivery_confirmed", "✅ Delivery confirmed",
        `Delivery of ${order.product_name} is confirmed. You can request a refund until ${untilTxt}.`);
      notifySeller(order.seller_id, order.id, "delivery_confirmed", "✅ Delivery confirmed",
        `Order #${order.id} is delivered. After the ${REFUND_WINDOW_DAYS}-day window, ${fmt(order.pod_fee_amount)} (10%) is taken from your reserve.`);
      mail(order.buyer_email, `Delivery confirmed — order #${order.id}`,
        wrapMail("Delivery confirmed",
          `<p>Delivery of <strong>${orderTitle(order)}</strong> is confirmed.</p>
           <p>If something is wrong, you can request a refund until <strong>${esc(untilTxt)}</strong>.</p>`));
      mail(order.seller_email, `Delivered — order #${order.id}`,
        wrapMail("Delivery confirmed",
          `<p><strong>${orderTitle(order)}</strong> is delivered and you collected the cash.</p>
           <p>After ${esc(untilTxt)} (end of the ${REFUND_WINDOW_DAYS}-day refund window) the platform fee of ${fmt(order.pod_fee_amount)} is taken from your reserved balance. If the customer requests a refund, it is held until it is resolved.</p>`));

      res.json({
        success: true,
        message: "Delivery confirmed. The refund window has started.",
        order_status: "delivered",
        refund_window_ends: until,
        escrow_release_date: until,        // old frontend field name
        platform_fee: money(order.pod_fee_amount),
      });
    } catch (e) { fail(res, e, "confirm-delivery"); }
  }

  app.post("/api/pod-orders/:orderId/ship", needLogin, (req, res) => shipPodOrder(req, res, req.params.orderId));
  app.post("/api/pod-orders/:orderId/confirm-delivery", needLogin, (req, res) => {
    // seller or buyer may enter the code; figure out who this is
    return getOrder(req.params.orderId).then((o) => {
      const actor = o && Number(o.seller_id) === Number(req.session.user.id) ? "seller" : "buyer";
      return confirmPodDelivery(req, res, req.params.orderId, actor);
    }).catch((e) => fail(res, e, "confirm-delivery"));
  });

  // ---- Step in front of the generic order routes ONLY for POD orders --------
  // (so the existing dashboard buttons keep working, and POD orders can't be
  //  pushed through the online-payment/escrow code that expects held money)
  const podGate = (handler) => async (req, res, next) => {
    try {
      if (!req.session || !req.session.user) return next();
      const o = await one(`SELECT id, is_pay_on_delivery FROM physical_orders WHERE id = ?`, [req.params.orderId]);
      if (!o || !o.is_pay_on_delivery) return next();
      return handler(req, res, o);
    } catch (e) { return next(e); }
  };

  app.post("/api/orders/:orderId/generate-delivery-code",
    podGate((req, res, o) => shipPodOrder(req, res, o.id)));
  app.post("/api/orders/:orderId/verify-delivery-seller",
    podGate((req, res, o) => confirmPodDelivery(req, res, o.id, "seller")));
  app.post("/api/orders/:orderId/verify-delivery",
    podGate((req, res, o) => confirmPodDelivery(req, res, o.id, "buyer")));
  app.post("/api/orders/:orderId/confirm-delivery",
    podGate((req, res, o) => confirmPodDelivery(req, res, o.id, "buyer")));
  app.post("/api/orders/:orderId/release-funds",
    podGate((req, res) => res.status(400).json({
      error: "Pay on Delivery orders have no held funds to release. The platform fee is collected automatically from the seller's wallet reserve." })));
  app.post("/api/orders/:orderId/status",
    podGate((req, res) => res.status(400).json({
      error: "Pay on Delivery orders are moved forward with Ship, Delivery Code and Cancel only." })));

  // ======================================================== REFUND / DISPUTE
  async function requestPodRefund(req, res, orderId) {
    try {
      const reason = String((req.body || {}).reason || "").trim();
      if (reason.length < 10)
        return res.status(400).json({ error: "Please explain the problem (at least 10 characters)." });
      const order = await getOrder(orderId);
      if (!order || !order.is_pay_on_delivery || Number(order.buyer_id) !== Number(req.session.user.id))
        return res.status(404).json({ error: "Order not found" });

      if (["pending_seller_approval", "accepted_pod"].includes(order.order_status))
        return res.status(400).json({ error: "This order hasn't shipped yet. You can cancel it instead." });
      if (order.order_status === "shipped")
        return res.status(400).json({ error: "You haven't confirmed delivery yet — you only pay when you receive it. If you don't want it, refuse delivery and tell the seller to cancel." });
      if (order.order_status === "refund_requested")
        return res.status(400).json({ error: "A refund was already requested for this order." });
      if (order.order_status !== "delivered")
        return res.status(400).json({ error: `A refund can't be requested for an order that is "${String(order.order_status).replace(/_/g, " ")}".` });
      if (!order.pod_fee_release_at || new Date(order.pod_fee_release_at) <= new Date())
        return res.status(400).json({ error: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.` });

      const claim = await db.query(
        `UPDATE physical_orders
            SET order_status = 'refund_requested', refund_requested_at = NOW(), refund_reason = ?
          WHERE id = ? AND order_status = 'delivered'`, [reason.slice(0, 1000), order.id]);
      if (!affected(claim)) return res.status(409).json({ error: "This order was already handled." });

      notifySeller(order.seller_id, order.id, "refund_requested", "Refund requested",
        `The customer asked for a refund on order #${order.id}: "${reason.slice(0, 140)}". Your reserved fee is on hold until this is resolved.`);
      mail(order.seller_email, `Refund requested — order #${order.id}`,
        wrapMail("Refund requested",
          `<p>The customer asked for a refund on <strong>${orderTitle(order)}</strong>.</p>
           <blockquote style="border-left:3px solid #c9971f;margin:12px 0;padding:6px 12px">${esc(reason)}</blockquote>
           <p>Open your wallet to accept the return (you refund the customer directly and your reserve is returned) or wait for support to review it.</p>
           <p><a href="${SITE_URL}/profile.html?tab=wallet">Open your wallet</a></p>`));
      res.json({ success: true, message: "Refund requested. The seller and support have been notified." });
    } catch (e) { fail(res, e, "request-refund"); }
  }

  app.post("/api/pod-orders/:orderId/request-refund", needLogin, (req, res) => requestPodRefund(req, res, req.params.orderId));
  app.post("/api/physical-orders/:orderId/refund",
    podGate((req, res, o) => requestPodRefund(req, res, o.id)));

  // decision: 'refund'  -> seller (or admin) accepts the return; reserve goes back to seller
  //           'dismiss' -> admin only; refund denied, platform fee is collected now
  app.post("/api/pod-orders/:orderId/resolve", needLogin, async (req, res) => {
    try {
      const user = req.session.user;
      const decision = String((req.body || {}).decision || "");
      const order = await getOrder(req.params.orderId);
      if (!order || !order.is_pay_on_delivery) return res.status(404).json({ error: "Order not found" });
      const isAdmin = user.role === "admin";
      const isSeller = Number(order.seller_id) === Number(user.id);
      if (!isAdmin && !isSeller) return res.status(403).json({ error: "Not allowed" });
      if (order.order_status !== "refund_requested")
        return res.status(400).json({ error: "This order has no open refund request." });

      if (decision === "refund") {
        const claim = await db.query(
          `UPDATE physical_orders SET order_status = 'refunded' WHERE id = ? AND order_status = 'refund_requested'`, [order.id]);
        if (!affected(claim)) return res.status(409).json({ error: "This order was already handled." });
        await returnFeeToSeller(order, `Order #${order.id} refunded — reserve returned`);
        notifyBuyer(order.buyer_id, order.id, "refund_approved", "Refund approved",
          `Your refund for ${order.product_name} was approved. The seller will return your cash.`);
        mail(order.buyer_email, `Refund approved — order #${order.id}`,
          wrapMail("Refund approved", `<p>Your refund for <strong>${orderTitle(order)}</strong> was approved. The seller will return the ${fmt(order.total_amount)} you paid in cash.</p>`));
        return res.json({ success: true, order_status: "refunded" });
      }
      if (decision === "dismiss") {
        if (!isAdmin) return res.status(403).json({ error: "Only support can deny a refund request." });
        const claim = await db.query(
          `UPDATE physical_orders SET order_status = 'completed' WHERE id = ? AND order_status = 'refund_requested'`, [order.id]);
        if (!affected(claim)) return res.status(409).json({ error: "This order was already handled." });
        await collectFeeForPlatform(order);
        notifyBuyer(order.buyer_id, order.id, "refund_denied", "Refund request closed",
          `Support reviewed your refund request for ${order.product_name} and closed it.`);
        return res.json({ success: true, order_status: "completed" });
      }
      res.status(400).json({ error: "decision must be 'refund' or 'dismiss'." });
    } catch (e) { fail(res, e, "resolve"); }
  });

  // ================================================================== CRON
  const cronOk = (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) { res.status(503).json({ error: "CRON_SECRET is not configured on the server." }); return false; }
    const given = String(req.query.secret || req.get("x-cron-secret") || "");
    const a = Buffer.from(secret), b = Buffer.from(given);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: "Unauthorized" }); return false;
    }
    return true;
  };

  async function sweepStalePending() {
    const stale = rows(await db.query(
      `${ORDER_SELECT}
        WHERE o.is_pay_on_delivery = 1 AND o.order_status = 'pending_seller_approval'
          AND o.seller_response_deadline IS NOT NULL AND o.seller_response_deadline <= NOW() LIMIT 200`));
    let n = 0;
    for (const o of stale) {
      try {
        const c = await db.query(
          `UPDATE physical_orders SET order_status = 'cancelled' WHERE id = ? AND order_status = 'pending_seller_approval'`, [o.id]);
        if (!affected(c)) continue;
        n++;
        notifyBuyer(o.buyer_id, o.id, "order_rejected", "Order auto-cancelled",
          `The seller didn't respond in time for ${o.product_name}. Nothing was charged.`);
        mail(o.buyer_email, `Order #${o.id} auto-cancelled`,
          wrapMail("Order auto-cancelled", `<p>The seller didn't respond in time for <strong>${orderTitle(o)}</strong>. Nothing was charged.</p>`));
      } catch (e) { console.error("POD stale sweep", o.id, e.message); }
    }
    return n;
  }

  async function sweepUnshipped() {
    const list = rows(await db.query(
      `${ORDER_SELECT}
        WHERE o.is_pay_on_delivery = 1 AND o.order_status = 'accepted_pod'
          AND o.pod_accepted_at IS NOT NULL
          AND o.pod_accepted_at <= DATE_SUB(NOW(), INTERVAL ${SHIP_DEADLINE_DAYS} DAY) LIMIT 200`));
    let n = 0;
    for (const o of list) {
      try {
        const c = await db.query(
          `UPDATE physical_orders SET order_status = 'cancelled' WHERE id = ? AND order_status = 'accepted_pod'`, [o.id]);
        if (!affected(c)) continue;
        await returnFeeToSeller(o, `Order #${o.id} auto-cancelled (not shipped) — reserve returned`);
        n++;
        notifyBuyer(o.buyer_id, o.id, "order_rejected", "Order auto-cancelled",
          `${o.product_name} wasn't shipped within ${SHIP_DEADLINE_DAYS} days, so the order was cancelled. Nothing was charged.`);
        notifySeller(o.seller_id, o.id, "order_update", "Order auto-cancelled",
          `Order #${o.id} wasn't shipped within ${SHIP_DEADLINE_DAYS} days and was cancelled. Your reserve was returned.`);
      } catch (e) { console.error("POD unshipped sweep", o.id, e.message); }
    }
    return n;
  }

  async function sweepReleaseFees() {
    // (a) delivered orders that somehow have no release date (e.g. status was forced) -> start the window now
    await db.query(
      `UPDATE physical_orders SET pod_fee_release_at = DATE_ADD(NOW(), INTERVAL ${REFUND_WINDOW_DAYS} DAY)
        WHERE is_pay_on_delivery = 1 AND order_status = 'delivered' AND pod_fee_release_at IS NULL`).catch(() => {});

    // (b) window over -> complete the order, then take the fee
    const due = rows(await db.query(
      `SELECT * FROM physical_orders
        WHERE is_pay_on_delivery = 1 AND order_status = 'delivered'
          AND pod_fee_release_at IS NOT NULL AND pod_fee_release_at <= NOW()
          AND COALESCE(pod_fee_released,0) = 0 AND COALESCE(pod_fee_returned,0) = 0 LIMIT 200`));
    let released = 0;
    for (const o of due) {
      try {
        const c = await db.query(
          `UPDATE physical_orders SET order_status = 'completed' WHERE id = ? AND order_status = 'delivered'`, [o.id]);
        if (!affected(c)) continue;
        if (await collectFeeForPlatform(o)) released++;
      } catch (e) { console.error("POD release sweep", o.id, e.message); }
    }

    // (c) self-heal: completed POD orders whose fee was never collected (crash between steps)
    const orphans = rows(await db.query(
      `SELECT * FROM physical_orders
        WHERE is_pay_on_delivery = 1 AND order_status = 'completed' AND pod_fee_mode = 'reserved'
          AND COALESCE(pod_fee_released,0) = 0 AND COALESCE(pod_fee_returned,0) = 0 LIMIT 200`));
    for (const o of orphans) {
      try { if (await collectFeeForPlatform(o)) released++; }
      catch (e) { console.error("POD orphan sweep", o.id, e.message); }
    }
    return released;
  }

  // Original URLs kept, so any cron-job already pointing at them keeps working.
  app.get("/api/cron/reject-stale-pod-orders", async (req, res) => {
    if (!cronOk(req, res)) return;
    try { res.json({ success: true, cancelled: await sweepStalePending() }); }
    catch (e) { fail(res, e, "cron stale"); }
  });
  app.get("/api/cron/release-pod-fees", async (req, res) => {
    if (!cronOk(req, res)) return;
    try { res.json({ success: true, released: await sweepReleaseFees() }); }
    catch (e) { fail(res, e, "cron release"); }
  });
  // One URL that does everything — point a single cron-job at this one (every 15–60 min).
  app.get("/api/cron/pod-sweep", async (req, res) => {
    if (!cronOk(req, res)) return;
    try {
      const cancelled_stale = await sweepStalePending();
      const cancelled_unshipped = await sweepUnshipped();
      const released = await sweepReleaseFees();
      res.json({ success: true, cancelled_stale, cancelled_unshipped, released });
    } catch (e) { fail(res, e, "cron sweep"); }
  });

  console.log("✅ POD wallet module mounted");
  return { getWallet, ensureWallet };
};