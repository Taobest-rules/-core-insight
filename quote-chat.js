/* ============================================================
   quote-chat.js — quotes inside the chat (messages.html)
   Add before </body> of messages.html:  <script src="quote-chat.js"></script>

   - Adds a "Quote" button next to Send in the chat box.
   - Form: amount to be paid + what it covers -> review -> confirm & send.
   - Messages that the server stores as "quote:<id>" are drawn as a
     quote card. The other person can Accept (confirm), Counter or
     Decline. Either side can quote; a counter replaces the old one.
   Self-contained: its own styles and modal, no dependency on the
   page's CSS. Finds the chat box / conversation id by itself.
   ============================================================ */
(function () {
  'use strict';
  if (window.__coreQuoteLoaded) return;
  window.__coreQuoteLoaded = true;

  // Elements matching this are conversation-list previews: show a short label, not a card
  const LIST_PREVIEW_SELECTOR = '[class*="preview"], [class*="conversation-item"], [class*="conv-item"], [class*="chat-list"]';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const csrf = () => (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  async function api(url, opts) {
    opts = opts || {};
    const res = await fetch(url, Object.assign({ credentials: 'include' }, opts, {
      headers: Object.assign({ 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, opts.headers || {}),
    }));
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'cq-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  /* ---------------- styles ---------------- */
  const style = document.createElement('style');
  style.textContent = `
  .cq-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;border:1px solid #c9971f;background:#f8ecd2;color:#2b2b28;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
  .cq-btn:hover{background:#c9971f}
  .cq-btn.cq-float{position:fixed;right:16px;bottom:90px;z-index:2500;box-shadow:0 6px 18px rgba(0,0,0,.18)}
  .cq-overlay{position:fixed;inset:0;background:rgba(43,43,40,.45);display:flex;align-items:center;justify-content:center;z-index:9000;padding:16px}
  .cq-overlay[hidden]{display:none}
  .cq-box{background:#fff;color:#2b2b28;border-radius:18px;width:100%;max-width:460px;max-height:90vh;overflow:auto;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.25);font:14px/1.5 Inter,system-ui,sans-serif}
  .cq-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  .cq-head h3{margin:0;font:600 19px Fraunces,Georgia,serif}
  .cq-x{background:none;border:0;font-size:24px;line-height:1;cursor:pointer;color:#55524a}
  .cq-ctx{background:#faf9f6;border:1px solid #e9e5dc;border-radius:10px;padding:9px 12px;font-size:12.5px;color:#55524a;margin-bottom:14px}
  .cq-box label{display:block;font-weight:600;font-size:12.5px;margin:12px 0 5px}
  .cq-help{margin:0 0 8px;font-size:12px;color:#8a8578}
  .cq-money{position:relative}
  .cq-money span{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#8a8578}
  .cq-box input[type=number],.cq-box input[type=text]{width:100%;box-sizing:border-box;padding:11px 12px;border:1.5px solid #e2ddd2;border-radius:10px;font:inherit;background:#faf9f6;color:#2b2b28}
  .cq-money input{padding-left:26px!important;font-size:18px!important;font-weight:600}
  .cq-box input:focus{outline:none;border-color:#c9971f;background:#fff}
  .cq-item{display:flex;gap:6px;margin-bottom:6px}
  .cq-item button{border:1px solid #e2ddd2;background:#fff;border-radius:8px;width:36px;cursor:pointer;color:#b3492f}
  .cq-link{background:none;border:0;color:#3c5c8a;font:600 12.5px inherit;cursor:pointer;padding:4px 0}
  .cq-err{color:#b3492f;font-size:12.5px;min-height:18px;margin-top:8px}
  .cq-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
  .cq-primary{background:#c9971f;border:1px solid #c9971f;color:#2b2b28;font-weight:600;border-radius:10px;padding:11px 18px;cursor:pointer;font:600 13.5px inherit}
  .cq-primary:hover{background:#a97c15}
  .cq-primary:disabled{opacity:.6;cursor:wait}
  .cq-ghost{background:#fff;border:1px solid #ddd7ca;border-radius:10px;padding:11px 16px;cursor:pointer;font:500 13.5px inherit;color:#2b2b28}
  .cq-sum{border:1.5px solid #c9971f;background:#f8ecd2;border-radius:14px;padding:14px}
  .cq-sum .cq-amt{font:600 30px Fraunces,Georgia,serif}
  .cq-sum ul,.cq-card ul{list-style:none;margin:8px 0 0;padding:0}
  .cq-sum li,.cq-card li{font-size:13px;padding:2px 0;display:flex;gap:7px;color:#55524a}
  .cq-sum li:before,.cq-card li:before{content:"✓";color:#497363;font-weight:700}
  .cq-note{font-size:12px;color:#55524a;margin-top:10px}
  .cq-card{border:1.5px solid #c9971f;background:#f8ecd2;border-radius:14px;padding:13px 15px;width:300px;max-width:100%;margin:4px 0;color:#2b2b28;font:13px/1.45 Inter,system-ui,sans-serif;text-align:left}
  .cq-card.cq-accepted{border-color:#5a8d7d;background:#e6efe9}
  .cq-card.cq-dead{border-color:#ddd7ca;background:#f5f3ee;opacity:.85}
  .cq-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;color:#a97c15}
  .cq-pill{font-size:10.5px;padding:2px 8px;border-radius:20px;background:#fff;color:#55524a;text-transform:none;letter-spacing:0}
  .cq-card .cq-amt{font:600 24px Fraunces,Georgia,serif;margin:4px 0}
  .cq-meta{font-size:11.5px;color:#55524a;margin-top:8px}
  .cq-meta.cq-warn{color:#b3492f;font-weight:600}
  .cq-card-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
  .cq-card-actions button{flex:1;min-width:76px;padding:8px 6px;border-radius:8px;border:1px solid #ddd7ca;background:#fff;font:600 12px inherit;cursor:pointer;color:#2b2b28}
  .cq-card-actions .cq-accept{background:#5a8d7d;border-color:#5a8d7d;color:#fff}
  .cq-card-actions .cq-decline{border-color:#b3492f;color:#b3492f;background:transparent}
  .cq-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#2b2b28;color:#faf9f6;padding:11px 16px;border-radius:10px;z-index:9500;font:13px Inter,sans-serif}
  `;
  document.head.appendChild(style);

  /* ---------------- conversation context ---------------- */
  let manualConversationId = null;
  function currentConversationId() {
    const form = document.getElementById('sendMessageForm');
    const fromUrl = new URLSearchParams(location.search).get('conversation');
    return Number(manualConversationId || window.activeConversationId || (form && form.dataset.conversationId) || fromUrl) || null;
  }

  const ctxCache = new Map();
  async function getContext(convId) {
    if (!ctxCache.has(convId)) ctxCache.set(convId, api('/api/quotes/context?conversation_id=' + convId).catch(e => { ctxCache.delete(convId); throw e; }));
    return ctxCache.get(convId);
  }

  /* ---------------- modal ---------------- */
  let modal, state = null;
  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'cq-overlay';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="cq-box" role="dialog" aria-modal="true">
        <div class="cq-head"><h3 id="cqTitle">Send a quote</h3><button type="button" class="cq-x" data-cq="close" aria-label="Close">&times;</button></div>
        <div class="cq-ctx" id="cqCtx"></div>

        <div id="cqStepForm">
          <label for="cqAmount">Amount to be paid (USD)</label>
          <div class="cq-money"><span>$</span><input type="number" id="cqAmount" min="0.01" step="0.01" placeholder="0.00"></div>

          <label>What this amount covers</label>
          <p class="cq-help">List each thing included. This is the written record both of you agree to.</p>
          <div id="cqScope"></div>
          <button type="button" class="cq-link" data-cq="add-item">+ Add another item</button>

          <div class="cq-err" id="cqErr"></div>
          <div class="cq-actions">
            <button type="button" class="cq-ghost" data-cq="close">Cancel</button>
            <button type="button" class="cq-primary" data-cq="review">Review quote</button>
          </div>
        </div>

        <div id="cqStepReview" hidden>
          <div class="cq-sum" id="cqSummary"></div>
          <div class="cq-note" id="cqReviewNote"></div>
          <div class="cq-err" id="cqErr2"></div>
          <div class="cq-actions">
            <button type="button" class="cq-ghost" data-cq="back" id="cqBackBtn">Edit</button>
            <button type="button" class="cq-primary" data-cq="confirm" id="cqConfirmBtn">Confirm &amp; send</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', onModalClick);
  }

  function addScopeRow(value) {
    const row = document.createElement('div');
    row.className = 'cq-item';
    row.innerHTML = `<input type="text" class="cq-scope-input" maxlength="200" placeholder="e.g. Replace kitchen tap, test water pressure"><button type="button" data-cq="rm-item" aria-label="Remove">&times;</button>`;
    row.querySelector('input').value = value || '';
    modal.querySelector('#cqScope').appendChild(row);
  }

  const $m = id => modal.querySelector('#' + id);
  function showStep(step) {
    $m('cqStepForm').hidden = step !== 'form';
    $m('cqStepReview').hidden = step !== 'review';
  }
  function readForm() {
    const amount = Math.round(parseFloat($m('cqAmount').value) * 100) / 100;
    const items = [...modal.querySelectorAll('.cq-scope-input')].map(i => i.value.trim()).filter(Boolean);
    return { amount, items };
  }
  function renderSummary(amount, items) {
    $m('cqSummary').innerHTML = `
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;color:#a97c15">Total to be paid</div>
      <div class="cq-amt">${money(amount)}</div>
      <div style="font-size:12px;font-weight:600;margin-top:6px">This covers</div>
      <ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  }

  async function openSend(opts) {          // opts: {prefill:{amount,items}, parentQuoteId}
    const convId = currentConversationId();
    if (!convId) return toast('Open a conversation first.', 'warning');
    let ctx;
    try { ctx = await getContext(convId); } catch (e) { return toast(e.message, 'error'); }
    if (!modal) buildModal();
    state = { mode: 'send', convId, ctx, parentQuoteId: (opts && opts.parentQuoteId) || null };

    $m('cqTitle').textContent = state.parentQuoteId ? 'Counter-offer' : 'Send a quote';
    $m('cqCtx').innerHTML = `To <strong>${esc(ctx.other.username)}</strong>` + (ctx.service ? ` · for <strong>${esc(ctx.service.title)}</strong>` : '');
    $m('cqAmount').value = (opts && opts.prefill && opts.prefill.amount) || '';
    $m('cqScope').innerHTML = '';
    const items = (opts && opts.prefill && opts.prefill.items) || [];
    (items.length ? items : ['']).forEach(addScopeRow);
    $m('cqErr').textContent = '';
    $m('cqErr2').textContent = '';
    $m('cqBackBtn').hidden = false;
    $m('cqConfirmBtn').textContent = 'Confirm & send';
    $m('cqConfirmBtn').disabled = false;
    $m('cqReviewNote').textContent = `${ctx.other.username} can accept, counter, or decline. If they accept, an order is created for this amount. The quote expires in 48 hours.`;
    showStep('form');
    modal.hidden = false;
    $m('cqAmount').focus();
  }

  function openAccept(q) {
    if (!modal) buildModal();
    state = { mode: 'accept', quote: q };
    $m('cqTitle').textContent = 'Confirm quote';
    $m('cqCtx').innerHTML = `From <strong>${esc(q.sender_name)}</strong>`;
    renderSummary(q.amount, q.scope_items);
    $m('cqReviewNote').textContent = `By confirming you agree to pay ${money(q.amount)} for the work listed above. An order is created once you confirm.`;
    $m('cqErr2').textContent = '';
    $m('cqBackBtn').hidden = true;
    $m('cqConfirmBtn').textContent = `Accept ${money(q.amount)}`;
    $m('cqConfirmBtn').disabled = false;
    showStep('review');
    modal.hidden = false;
  }

  function closeModal() { if (modal) modal.hidden = true; state = null; }

  async function onModalClick(e) {
    const act = e.target.closest('[data-cq]');
    if (e.target === modal) return closeModal();
    if (!act) return;
    switch (act.dataset.cq) {
      case 'close': return closeModal();
      case 'add-item': addScopeRow(''); return;
      case 'rm-item': {
        const rows = modal.querySelectorAll('.cq-item');
        if (rows.length > 1) act.closest('.cq-item').remove(); else act.closest('.cq-item').querySelector('input').value = '';
        return;
      }
      case 'back': showStep('form'); return;
      case 'review': {
        const { amount, items } = readForm();
        if (!(amount > 0)) { $m('cqErr').textContent = 'Enter the amount to be paid.'; return; }
        if (!items.length) { $m('cqErr').textContent = 'Write at least one thing this amount covers.'; return; }
        $m('cqErr').textContent = '';
        renderSummary(amount, items);
        showStep('review');
        return;
      }
      case 'confirm': return confirmAction();
    }
  }

  async function confirmAction() {
    const btn = $m('cqConfirmBtn');
    btn.disabled = true;
    $m('cqErr2').textContent = '';
    try {
      if (state.mode === 'send') {
        const { amount, items } = readForm();
        await api('/api/quotes/send', {
          method: 'POST',
          body: JSON.stringify({ conversation_id: state.convId, amount, scope_items: items, parent_quote_id: state.parentQuoteId }),
        });
        closeModal();
        toast('Quote sent', 'success');
      } else {
        const q = state.quote;
        await api('/api/quotes/' + q.id + '/accept', { method: 'POST' });
        closeModal();
        toast('Quote accepted — order created', 'success');
        quoteCache.delete(q.id);
      }
      refreshChat();
      repaintAll(true);
    } catch (e) {
      $m('cqErr2').textContent = e.message;
      btn.disabled = false;
    }
  }

  function refreshChat() {
    const id = currentConversationId();
    ['loadMessagesForConversation', 'loadMessages'].forEach(fn => {
      if (typeof window[fn] === 'function') { try { window[fn](id); } catch (e) { /* host handles */ } }
    });
    document.dispatchEvent(new CustomEvent('cq:changed', { detail: { conversationId: id } }));
  }

  /* ---------------- quote cards ---------------- */
  const quoteCache = new Map();           // id -> {data, ts}
  const inflight = new Map();

  function loadQuote(id, force) {
    const hit = quoteCache.get(id);
    if (hit && !force && Date.now() - hit.ts < 8000) return Promise.resolve(hit.data);
    if (inflight.has(id)) return inflight.get(id);
    const p = api('/api/quotes/' + id).then(d => { quoteCache.set(id, { data: d, ts: Date.now() }); return d; })
      .finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  }

  function cardHtml(q) {
    const iAmRecipient = q.recipient_id === q.me;
    const pending = q.status === 'pending';
    const cls = q.status === 'accepted' ? 'cq-accepted' : (['declined', 'expired', 'superseded'].includes(q.status) ? 'cq-dead' : '');
    const label = { pending: 'Awaiting reply', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', superseded: 'Replaced' }[q.status] || q.status;

    let footer = '';
    if (pending && iAmRecipient) {
      footer = `<div class="cq-card-actions">
        <button type="button" class="cq-accept" data-cq-act="accept" data-q="${q.id}">Accept</button>
        <button type="button" data-cq-act="counter" data-q="${q.id}">Counter</button>
        <button type="button" class="cq-decline" data-cq-act="decline" data-q="${q.id}">Decline</button></div>`;
    } else if (pending) {
      footer = `<div class="cq-meta">Waiting for ${esc(q.recipient_name)} to respond</div>`;
    } else if (q.status === 'accepted') {
      const os = q.order_status, num = q.order_id ? ` (#${q.order_id})` : '';
      const iAmClient = q.client_id != null && Number(q.client_id) === Number(q.me);
      if (os === 'payment_pending' && iAmClient) {
        footer = `<div class="cq-meta">Agreed${num}. Pay now to hold the money in escrow so the work can start.</div>
          <div class="cq-card-actions"><button type="button" class="cq-accept" data-cq-act="pay" data-q="${q.id}" data-order="${q.order_id}">Pay ${money(q.amount)}</button></div>`;
      } else if (os === 'payment_pending') {
        footer = `<div class="cq-meta">Agreed${num}. Waiting for the client to pay.</div>`;
      } else if (os && os !== 'payment_pending') {
        footer = `<div class="cq-meta">✅ Paid &amp; held in escrow${num}. <a href="/services.html" style="color:#3c5c8a;font-weight:600">View in Active Orders</a></div>`;
      } else {
        footer = `<div class="cq-meta">Agreed${num}. <a href="/services.html" style="color:#3c5c8a;font-weight:600">View in Active Orders</a></div>`;
      }
    }
    let expiry = '';
    if (pending && q.expires_at) {
      const hrs = Math.max(0, Math.round((new Date(q.expires_at) - Date.now()) / 3600000));
      expiry = `<div class="cq-meta ${hrs <= 6 ? 'cq-warn' : ''}">Expires in ${hrs}h</div>`;
    }
    return `<div class="cq-card ${cls}">
      <div class="cq-top"><span>📋 Quote from ${esc(q.sender_name)}</span><span class="cq-pill">${esc(label)}</span></div>
      <div class="cq-amt">${money(q.amount)}</div>
      <div style="font-size:12px;font-weight:600">Covers</div>
      <ul>${(q.scope_items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      ${expiry}${footer}</div>`;
  }

  function paint(el, q) { el.innerHTML = cardHtml(q); }

  function repaintAll(force) {
    document.querySelectorAll('[data-cq-quote]').forEach(el => {
      const id = Number(el.dataset.cqQuote);
      loadQuote(id, force).then(q => { if (document.contains(el)) paint(el, q); }).catch(() => { });
    });
  }

  const QUOTE_RE = /^\s*quote:(\d+)\s*$/;
  const NATIVE = () => window.CORE_QUOTE_NATIVE === true;   // host renders <div data-cq-quote="ID"> slots itself

  function mountEl(el, id) {
    el.dataset.cqQuote = id;
    const hit = quoteCache.get(id);
    if (hit) paint(el, hit.data); else el.textContent = 'Loading quote…';
    loadQuote(id).then(q => { if (document.contains(el)) paint(el, q); }).catch(() => { el.textContent = 'Quote unavailable'; });
  }

  function scan() {
    // 1) slots the host page rendered for real quote messages
    document.querySelectorAll('[data-cq-quote]:not([data-cq-painted])').forEach(el => {
      el.dataset.cqPainted = '1';
      mountEl(el, Number(el.dataset.cqQuote));
    });
    // 2) plain "quote:ID" text: always shortened in list previews; turned into a card only in non-native mode
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => QUOTE_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const hits = [];
    while (walker.nextNode()) hits.push(walker.currentNode);
    hits.forEach(node => {
      const el = node.parentElement;
      if (!el || el.closest('.cq-card') || el.closest('.cq-overlay')) return;
      if (el.closest(LIST_PREVIEW_SELECTOR)) { node.nodeValue = '📋 Quote'; return; }
      if (NATIVE()) return;
      el.dataset.cqPainted = '1';
      mountEl(el, Number(node.nodeValue.match(QUOTE_RE)[1]));
    });
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cq-act]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const id = Number(b.dataset.q);
    try {
      const q = await loadQuote(id, true);
      if (b.dataset.cqAct === 'pay') {
        b.disabled = true; b.textContent = 'Opening payment…';
        try {
          const r = await api('/api/service-orders/' + b.dataset.order + '/pay', { method: 'POST' });
          window.location.href = r.paymentLink;
        } catch (err) { b.disabled = false; b.textContent = 'Pay ' + money(q.amount); toast(err.message, 'error'); }
        return;
      }
      if (b.dataset.cqAct === 'accept') openAccept(q);
      else if (b.dataset.cqAct === 'counter') openSend({ parentQuoteId: id, prefill: { amount: q.amount, items: q.scope_items } });
      else if (b.dataset.cqAct === 'decline') {
        if (!confirm('Decline this quote?')) return;
        await api('/api/quotes/' + id + '/decline', { method: 'POST' });
        toast('Quote declined', 'info');
        quoteCache.delete(id); refreshChat(); repaintAll(true);
      }
    } catch (err) { toast(err.message, 'error'); }
  });

  /* ---------------- the "Quote" button ---------------- */
  function ensureButton() {
    if (NATIVE()) return;     // host page has its own Quote button
    let btn = document.getElementById('cqOpenBtn');
    const convId = currentConversationId();
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'cqOpenBtn';
      btn.className = 'cq-btn';
      btn.innerHTML = '📋 Quote';
      btn.title = 'Send a price quote for this job';
      btn.addEventListener('click', () => openSend());
    }
    if (!btn.isConnected || !btn.dataset.placed) {
      const input = document.getElementById('messageInput') ||
        document.querySelector('textarea[placeholder*="essage" i], input[placeholder*="essage" i]');
      const form = input && input.closest('form');
      const submit = form && form.querySelector('button[type="submit"]');
      if (submit) { submit.parentNode.insertBefore(btn, submit); btn.classList.remove('cq-float'); btn.dataset.placed = 'form'; }
      else { btn.classList.add('cq-float'); document.body.appendChild(btn); btn.dataset.placed = 'float'; }
    }
    btn.style.display = convId ? '' : 'none';
  }

  /* ---------------- boot ---------------- */
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { scan(); ensureButton(); }, 120); })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(ensureButton, 1500);
  setInterval(() => repaintAll(true), 10000);      // keep pending cards fresh
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  scan(); ensureButton();

  // Returning from Flutterwave: confirm the payment, then clean the URL.
  (async function checkReturn() {
    const sp = new URLSearchParams(location.search), oid = sp.get('svc_pay');
    if (!oid) return;
    const clean = () => { sp.delete('svc_pay'); sp.delete('status'); sp.delete('tx_ref'); sp.delete('transaction_id');
      history.replaceState(null, '', location.pathname + (sp.toString() ? '?' + sp : '')); };
    if (sp.get('status') === 'cancelled') { toast('Payment cancelled', 'info'); clean(); return; }
    toast('Confirming your payment…', 'info');
    for (let i = 0; i < 4; i++) {
      try {
        const r = await api('/api/service-orders/' + oid + '/verify-payment', { method: 'POST' });
        if (r.success) { toast('Payment received — held in escrow', 'success'); clean(); quoteCache.clear(); refreshChat(); repaintAll(true); return; }
      } catch (e) { /* retry */ }
      await new Promise(r => setTimeout(r, 2500));
    }
    toast('Payment not confirmed yet — it will update shortly', 'info'); clean();
  })();

  window.CoreQuote = { openSend, scan, setConversation: id => { manualConversationId = Number(id) || null; ensureButton(); } };
})();