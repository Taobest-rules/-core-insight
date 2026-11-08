// verification-backend.js
// ---------------------------------------------------------------------------
// Temporary-verification flow + admin block/restore for Core Insight.
//
// Wire it in index.js RIGHT BEFORE the jobs/services backends so its routes
// (and guards) are registered first and win over the older duplicates:
//
//   require('./verification-backend')(app, db, { sendEmail });
//   require('./jobs-backend')(app, db);
//   require('./services-backend')(app, db);
//
// Statuses stored in users.verification_status:
//   unverified | temporary | verified | rejected
//   (temporary = documents submitted, can sell while admins review)
// Separate flag users.posting_blocked = 1 stops ALL posting, whatever the status.
// ---------------------------------------------------------------------------
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { uploadToImgbb } = require('./mega-storage');

module.exports = function (app, db, deps = {}) {
  const sendEmail = deps.sendEmail;
  const mail = (to, subject, html) => {
    if (!sendEmail || !to) return Promise.resolve();
    return Promise.resolve(sendEmail(to, subject, html)).catch(e => console.error('verification mail failed:', e.message));
  };
  const rows = (r) => {
    if (!r) return [];
    if (Array.isArray(r) && r.length === 2 && Array.isArray(r[0])) return r[0];
    if (Array.isArray(r)) return r;
    return [r];
  };
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ------------------------------ MIGRATIONS ------------------------------ */
  (async () => {
    const run = async (sql, label) => {
      try { await db.query(sql); console.log('✅ verification migration:', label); }
      catch (e) { if (!/duplicate|already exists/i.test(e.message)) console.error('❌ verification migration failed (' + label + '):', e.message); }
    };
    // Make sure 'temporary' / 'rejected' are storable even if the column was an ENUM
    await run(`ALTER TABLE users MODIFY verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified'`, 'verification_status -> VARCHAR');
    await run(`ALTER TABLE users ADD COLUMN posting_blocked TINYINT(1) NOT NULL DEFAULT 0`, 'users.posting_blocked');
    await run(`ALTER TABLE users ADD COLUMN blocked_reason VARCHAR(500) NULL`, 'users.blocked_reason');
    await run(`ALTER TABLE users ADD COLUMN blocked_at DATETIME NULL`, 'users.blocked_at');
    await run(`ALTER TABLE users ADD COLUMN blocked_by INT NULL`, 'users.blocked_by');
    await run(`ALTER TABLE users ADD COLUMN verification_notes VARCHAR(500) NULL`, 'users.verification_notes');
    await run(`ALTER TABLE users ADD COLUMN verification_reviewed_by INT NULL`, 'users.verification_reviewed_by');
    await run(`ALTER TABLE users ADD COLUMN verification_reviewed_at DATETIME NULL`, 'users.verification_reviewed_at');
    // Old "pending_review" users become temporarily verified under the new flow
    await run(`UPDATE users SET verification_status = 'temporary' WHERE verification_status = 'pending_review'`, 'pending_review -> temporary');
    // Columns the course upload wizard sends but the old INSERT dropped
    await run(`ALTER TABLE courses ADD COLUMN category VARCHAR(60) NULL`, 'courses.category');
    await run(`ALTER TABLE courses ADD COLUMN level VARCHAR(30) NULL`, 'courses.level');
    await run(`ALTER TABLE courses ADD COLUMN page_count INT NULL`, 'courses.page_count');
    await run(`ALTER TABLE courses ADD COLUMN language VARCHAR(40) NULL`, 'courses.language');
    await run(`ALTER TABLE courses ADD COLUMN preview_url VARCHAR(500) NULL`, 'courses.preview_url');
  })();

  /* ------------------------------ HELPERS ------------------------------ */
  async function getUserRow(id) {
    return rows(await db.query(
      `SELECT id, username, email, role, verification_status, posting_blocked, blocked_reason FROM users WHERE id = ?`, [id]
    ))[0] || null;
  }

  // Can this session user sell paid content? admin, verified or temporarily verified.
  app.locals.canSell = async function (sessionUser) {
    if (!sessionUser) return false;
    if (sessionUser.role === 'admin') return true;
    const u = await getUserRow(sessionUser.id);
    if (!u || Number(u.posting_blocked) === 1) return false;
    return u.verification_status === 'verified' || u.verification_status === 'temporary';
  };

  const adminOnly = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  };

  /* ------------------------- POSTING BLOCK GUARD ------------------------- */
  // Runs before the real handlers (and before multer), so blocked users can't post anything.
  const postingGuard = async (req, res, next) => {
    if (!req.session.user) return next();
    try {
      const u = await getUserRow(req.session.user.id);
      if (u && Number(u.posting_blocked) === 1) {
        return res.status(403).json({
          error: 'Your posting privileges are suspended.' + (u.blocked_reason ? ' Reason: ' + u.blocked_reason + '.' : '') + ' Contact support to appeal.',
          posting_blocked: true
        });
      }
    } catch (e) { console.error('postingGuard error:', e.message); }
    next();
  };
  ['/api/courses', '/api/upload-product', '/api/services', '/api/articles'].forEach(p => app.post(p, postingGuard));

  /* ------------------------------ UPLOADS ------------------------------ */
  const uploadDir = path.join(__dirname, 'uploads', 'verification');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40);
        cb(null, `${req.session.user ? req.session.user.id : 'anon'}_${Date.now()}_${Math.floor(Math.random() * 1e6)}_${base}${ext}`);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) =>
      ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'].includes(file.mimetype)
        ? cb(null, true) : cb(new Error('Only JPG, PNG or PDF files are allowed'))
  }).fields([
    { name: 'government_id', maxCount: 1 },
    { name: 'selfie_with_id', maxCount: 1 },
    { name: 'address_proof', maxCount: 1 }
  ]);

  /* ------------------------------ USER ROUTES ------------------------------ */
  app.get('/api/verification/status', async (req, res) => {
    try {
      if (!req.session.user) return res.status(401).json({ error: 'Please login' });
      const u = rows(await db.query(
        `SELECT verification_status, verification_type, verified_at, verification_submitted_at, verification_notes,
                phone_verified, phone_number, posting_blocked, blocked_reason
         FROM users WHERE id = ?`, [req.session.user.id]
      ))[0] || {};
      const docs = rows(await db.query(
        `SELECT document_type, uploaded_at, status FROM verification_documents WHERE user_id = ? ORDER BY uploaded_at DESC`,
        [req.session.user.id]
      ));
      let status = u.verification_status || 'unverified';
      if (status === 'pending_review') status = 'temporary';
      res.json({
        success: true,
        status,
        verification_type: u.verification_type || null,
        verified_at: u.verified_at || null,
        submitted_at: u.verification_submitted_at || null,
        rejection_reason: status === 'rejected' ? (u.verification_notes || null) : null,
        phone_verified: Number(u.phone_verified) === 1,
        phone_number: u.phone_number || null,
        documents_uploaded: docs.length,
        documents: docs,
        posting_blocked: Number(u.posting_blocked) === 1,
        blocked_reason: u.blocked_reason || null,
        hours_remaining: null,
        minutes_remaining: null
      });
    } catch (err) {
      console.error('verification status error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/verification/submit', (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Please login' });
    upload(req, res, (err) => err ? res.status(400).json({ error: err.message }) : next());
  }, async (req, res) => {
    const files = req.files || {};
    const cleanup = () => Object.values(files).flat().forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
    try {
      const user = req.session.user;
      const me = await getUserRow(user.id);
      if (!me) { cleanup(); return res.status(404).json({ error: 'User not found' }); }
      if (me.verification_status === 'verified') { cleanup(); return res.status(400).json({ error: 'You are already verified.' }); }

      const phone = rows(await db.query('SELECT phone_verified FROM users WHERE id = ?', [user.id]))[0];
      if (!phone || Number(phone.phone_verified) !== 1) { cleanup(); return res.status(400).json({ error: 'Please verify your phone number first' }); }
      for (const [field, label] of [['government_id', 'Government ID'], ['selfie_with_id', 'Selfie with ID'], ['address_proof', 'Proof of address']]) {
        if (!files[field]) { cleanup(); return res.status(400).json({ error: `${label} is required` }); }
      }

      const verificationType = req.body.verification_type === 'business' ? 'business' : 'individual';
      const businessName = (req.body.business_name || '').trim().slice(0, 150) || null;

      // Replace any earlier (e.g. rejected) submission's pending docs
      await db.query(`UPDATE verification_documents SET status = 'superseded' WHERE user_id = ? AND status IN ('pending','rejected')`, [user.id]);
      for (const field of ['government_id', 'selfie_with_id', 'address_proof']) {
        const f = files[field][0];
        const url = await uploadToImgbb(f.path, f.originalname);
        await db.query(
          `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at, status) VALUES (?, ?, ?, NOW(), 'pending')`,
          [user.id, field, url]
        );
        try { fs.unlinkSync(f.path); } catch (e) {}
      }

      // TEMPORARY verification: can sell right away while the team reviews.
      await db.query(
        `UPDATE users SET verification_status = 'temporary', verification_type = ?, verification_submitted_at = NOW(),
                business_name = ?, verification_notes = NULL WHERE id = ?`,
        [verificationType, businessName, user.id]
      );

      mail(user.email, 'You are temporarily verified - Core Insight', `
        <div style="font-family:Arial;max-width:560px;margin:0 auto;padding:24px;">
          <h2>✅ You're temporarily verified</h2>
          <p>Hello ${esc(user.username)},</p>
          <p>We received your documents. You can sell paid courses, books and products <strong>right now</strong> while our team reviews them.</p>
          <p>If anything in your documents doesn't check out, we'll email you and paid selling will be paused until it's fixed.</p>
        </div>`);
      try {
        const admins = rows(await db.query(`SELECT email FROM users WHERE role = 'admin'`));
        admins.forEach(a => mail(a.email, `Verification to review: ${user.username}`,
          `<p><strong>${esc(user.username)}</strong> submitted verification documents. Review them at <a href="https://coreinsightmarket.com/admin-verifications.html">admin-verifications.html</a>.</p>`));
      } catch (e) { /* non-fatal */ }

      res.json({
        success: true,
        status: 'temporary',
        message: "Documents received. You're temporarily verified while we review them - you can start selling now."
      });
    } catch (err) {
      cleanup();
      console.error('verification submit error:', err);
      res.status(500).json({ error: 'Could not submit verification: ' + err.message });
    }
  });

  /* ------------------------------ ADMIN ROUTES ------------------------------ */
  app.get('/api/admin/verifications', adminOnly, async (req, res) => {
    try {
      const tab = String(req.query.status || 'temporary');
      let where = `u.verification_status <> 'unverified' OR u.posting_blocked = 1`;
      if (tab === 'temporary') where = `u.verification_status = 'temporary'`;
      else if (tab === 'verified') where = `u.verification_status = 'verified'`;
      else if (tab === 'rejected') where = `u.verification_status = 'rejected'`;
      else if (tab === 'blocked') where = `u.posting_blocked = 1`;

      const list = rows(await db.query(
        `SELECT u.id, u.username, u.email, u.role, u.verification_status, u.verification_type, u.business_name,
                u.phone_number, u.verification_submitted_at, u.verified_at, u.verification_notes,
                u.posting_blocked, u.blocked_reason, u.blocked_at
         FROM users u WHERE ${where}
         ORDER BY COALESCE(u.verification_submitted_at, u.blocked_at, u.created_at) DESC LIMIT 100`
      ));
      for (const u of list) {
        u.documents = rows(await db.query(
          `SELECT document_type, document_url, uploaded_at, status FROM verification_documents
           WHERE user_id = ? AND status <> 'superseded' ORDER BY uploaded_at DESC`, [u.id]));
        u.posting_blocked = Number(u.posting_blocked) === 1;
      }
      const c = rows(await db.query(
        `SELECT SUM(verification_status = 'temporary') AS temporary, SUM(verification_status = 'verified') AS verified,
                SUM(verification_status = 'rejected') AS rejected, SUM(posting_blocked = 1) AS blocked FROM users`))[0] || {};
      res.json({
        success: true, users: list,
        counts: { temporary: Number(c.temporary) || 0, verified: Number(c.verified) || 0, rejected: Number(c.rejected) || 0, blocked: Number(c.blocked) || 0 }
      });
    } catch (err) {
      console.error('admin verifications error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/verifications/:userId/approve', adminOnly, async (req, res) => {
    try {
      const target = await getUserRow(req.params.userId);
      if (!target) return res.status(404).json({ error: 'User not found' });
      await db.query(
        `UPDATE users SET verification_status = 'verified', verified_at = NOW(), verification_notes = NULL,
                verification_reviewed_by = ?, verification_reviewed_at = NOW() WHERE id = ?`,
        [req.session.user.id, target.id]);
      await db.query(`UPDATE verification_documents SET status = 'approved' WHERE user_id = ? AND status = 'pending'`, [target.id]);
      mail(target.email, "You're fully verified - Core Insight",
        `<p>Hello ${esc(target.username)}, your documents were reviewed and your account is now <strong>fully verified</strong>. Thanks for your patience!</p>`);
      res.json({ success: true, message: `${target.username} is now verified.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/admin/verifications/:userId/reject', adminOnly, async (req, res) => {
    try {
      const reason = String(req.body.reason || '').trim().slice(0, 500);
      if (reason.length < 5) return res.status(400).json({ error: 'Give a short reason so the user knows what to fix.' });
      const target = await getUserRow(req.params.userId);
      if (!target) return res.status(404).json({ error: 'User not found' });
      await db.query(
        `UPDATE users SET verification_status = 'rejected', verification_notes = ?,
                verification_reviewed_by = ?, verification_reviewed_at = NOW() WHERE id = ?`,
        [reason, req.session.user.id, target.id]);
      await db.query(`UPDATE verification_documents SET status = 'rejected' WHERE user_id = ? AND status = 'pending'`, [target.id]);
      mail(target.email, 'Verification needs attention - Core Insight',
        `<p>Hello ${esc(target.username)}, we couldn't approve your verification:</p><blockquote>${esc(reason)}</blockquote>
         <p>Paid selling is paused until you resubmit at <a href="https://coreinsightmarket.com/verification.html">verification.html</a>. Free content is unaffected.</p>`);
      res.json({ success: true, message: 'Verification rejected. Paid selling is paused for this user.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // BLOCK: stop a user from posting anything. Optionally take their courses/books down too.
  app.post('/api/admin/users/:userId/block-posting', adminOnly, async (req, res) => {
    try {
      const reason = String(req.body.reason || '').trim().slice(0, 500);
      if (reason.length < 5) return res.status(400).json({ error: 'Please give a reason (min 5 characters).' });
      const target = await getUserRow(req.params.userId);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.role === 'admin') return res.status(400).json({ error: 'Admins cannot be blocked.' });

      await db.query(
        `UPDATE users SET posting_blocked = 1, blocked_reason = ?, blocked_at = NOW(), blocked_by = ? WHERE id = ?`,
        [reason, req.session.user.id, target.id]);

      let hidden = 0;
      if (req.body.hide_content === true || req.body.hide_content === 'true') {
        const r = await db.query(
          `UPDATE courses SET is_deleted = 1, deleted_at = NOW(), deleted_reason = 'Creator blocked'
           WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, [target.id]);
        hidden = (r && (r.affectedRows ?? (r[0] && r[0].affectedRows))) || 0;
      }
      mail(target.email, 'Your posting privileges were suspended - Core Insight',
        `<p>Hello ${esc(target.username)}, your ability to post on Core Insight has been suspended.</p><p><strong>Reason:</strong> ${esc(reason)}</p>
         <p>If you believe this is a mistake, reply to this email or contact support.</p>`);
      res.json({ success: true, hidden_courses: hidden, message: `${target.username} can no longer post.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // RESTORE: lift the block, and bring back anything we hid when blocking.
  app.post('/api/admin/users/:userId/restore-posting', adminOnly, async (req, res) => {
    try {
      const target = await getUserRow(req.params.userId);
      if (!target) return res.status(404).json({ error: 'User not found' });
      await db.query(`UPDATE users SET posting_blocked = 0, blocked_reason = NULL, blocked_at = NULL, blocked_by = NULL WHERE id = ?`, [target.id]);
      let restored = 0;
      if (req.body.restore_content === true || req.body.restore_content === 'true') {
        const r = await db.query(
          `UPDATE courses SET is_deleted = 0, deleted_at = NULL, deleted_reason = NULL
           WHERE user_id = ? AND deleted_reason = 'Creator blocked'`, [target.id]);
        restored = (r && (r.affectedRows ?? (r[0] && r[0].affectedRows))) || 0;
      }
      mail(target.email, 'Your posting privileges were restored - Core Insight',
        `<p>Hello ${esc(target.username)}, your posting privileges have been restored. You can publish again.</p>`);
      res.json({ success: true, restored_courses: restored, message: `${target.username} can post again.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
};