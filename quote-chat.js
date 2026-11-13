/* quote-chat.js — quote cards, send-quote sheet, pinned job panel, dispute + evidence */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Number(n || 0).toFixed(2);
  const fdate = d => d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const say = (m, bad) => (window.showToast ? window.showToast(bad ? 'Hold on' : 'Done', m) : alert(m));
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'include', ...opts });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Something went wrong');
    return d;
  }
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });

  let convId = null, panelTimer = null, panelOpen = true;
  const ctxCache = {}, quoteCache = new Map();

  /* ---------- styles ---------- */
  document.head.insertAdjacentHTML('beforeend', `<style>
  .cq-card{width:min(370px,86vw);background:var(--paper);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(37,35,31,.07);color:var(--ink);text-align:left}
  .cq-top{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;background:linear-gradient(135deg,var(--gold-tint),#fff 85%);border-bottom:1px solid var(--line);font:700 10.5px Inter,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--gold-deep)}
  .cq-body{padding:16px 16px 14px}
  .cq-sentence{font:500 17px/1.5 Fraunces,Georgia,serif}
  .cq-sentence b{color:var(--gold-deep);font-weight:600}
  .cq-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
  .cq-chip{display:inline-flex;align-items:center;gap:5px;font:600 11px Inter,sans-serif;padding:4px 10px;border-radius:20px;background:var(--cream);border:1px solid var(--line);color:var(--ink2)}
  .cq-chip.ok{background:#e4efe9;border-color:transparent;color:#3d6f5e}.cq-chip.warn{background:var(--gold-tint);border-color:transparent;color:var(--gold-deep)}
  .cq-chip.bad{background:#f6e3de;border-color:transparent;color:var(--danger)}.cq-chip.blue{background:#e3ecf5;border-color:transparent;color:#3c5c8a}
  .cq-note{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5}
  .cq-actions{display:flex;gap:8px;padding:0 16px 16px;flex-wrap:wrap}
  .cq-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:12px;padding:9px 15px;font:600 13px Inter,sans-serif;cursor:pointer;transition:.12s}
  .cq-btn:hover{background:var(--cream)}.cq-btn.primary{background:var(--ink);border-color:var(--ink);color:var(--cream)}.cq-btn.primary:hover{background:#000}
  .cq-btn.gold{background:var(--gold);border-color:var(--gold);color:var(--ink)}.cq-btn.gold:hover{background:var(--gold-deep)}
  .cq-btn.danger{color:var(--danger);border-color:#ecc9c0}.cq-btn.sm{padding:7px 12px;font-size:12px}.cq-btn:disabled{opacity:.5;cursor:default}
  .cq-overlay{position:fixed;inset:0;background:rgba(37,35,31,.45);backdrop-filter:blur(3px);z-index:9000;display:flex;align-items:flex-end;justify-content:center;padding:0}
  @media(min-width:560px){.cq-overlay{align-items:center;padding:20px}}
  .cq-sheet{background:var(--paper);width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.25);color:var(--ink)}
  @media(min-width:560px){.cq-sheet{border-radius:24px}}
  .cq-sheet h3{font:600 22px Fraunces,Georgia,serif;margin:0 0 4px}.cq-sub{font-size:13px;color:var(--ink2);margin:0 0 16px;line-height:1.5}
  .cq-types{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
  .cq-type{border:1.5px solid var(--line);border-radius:14px;padding:12px;cursor:pointer;font-size:13px;text-align:center;background:var(--cream)}
  .cq-type input{display:none}.cq-type b{display:block;font-size:14px;margin-bottom:2px}.cq-type.on{border-color:var(--gold);background:var(--gold-tint)}
  .cq-field{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}.cq-field>span{font:600 17px Fraunces,Georgia,serif;color:var(--gold-deep);padding-top:10px;min-width:44px}
  .cq-field textarea,.cq-field input,.cq-sheet textarea.cq-in,.cq-code{flex:1;width:100%;border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;font:14px Inter,sans-serif;background:var(--cream);color:var(--ink);resize:vertical}
  .cq-field textarea{min-height:84px}.cq-field textarea:focus,.cq-field input:focus,.cq-sheet textarea.cq-in:focus,.cq-code:focus{outline:none;border-color:var(--gold);background:#fff}
  .cq-preview{background:var(--cream);border:1px dashed var(--line);border-radius:14px;padding:12px 14px;font:500 15px/1.5 Fraunces,Georgia,serif;margin:6px 0 14px;min-height:46px;color:var(--ink2)}
  .cq-err{color:var(--danger);font-size:12.5px;min-height:18px;margin-bottom:8px}.cq-row{display:flex;gap:8px;justify-content:flex-end}
  .cq-drop{border:2px dashed var(--line);border-radius:16px;padding:18px;text-align:center;font-size:13px;color:var(--ink2);cursor:pointer;background:var(--cream)}.cq-drop:hover{border-color:var(--gold)}
  .cq-thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.cq-thumb{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--cream)}
  .cq-thumb img{width:100%;height:100%;object-fit:cover;cursor:zoom-in;display:block}.cq-thumb button{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,.65);color:#fff;cursor:pointer;font-size:13px;line-height:1}
  /* job panel */
  .cq-panel{margin:12px 16px 4px;background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:18px;box-shadow:0 4px 16px rgba(37,35,31,.05);overflow:hidden;flex-shrink:0}
  .cq-ph{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer}.cq-pt{flex:1;min-width:0;font:600 14px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cq-pt small{display:block;font-weight:500;font-size:11.5px;color:var(--muted)}.cq-pb{padding:0 14px 14px;border-top:1px solid var(--line)}
  .cq-steps{display:flex;align-items:flex-start;margin:14px 0 12px}.cq-step{flex:1;text-align:center;position:relative;font-size:10.5px;color:var(--muted);font-weight:600}
  .cq-step:before{content:'';position:absolute;top:9px;left:-50%;width:100%;height:3px;background:var(--line);z-index:0}.cq-step:first-child:before{display:none}
  .cq-step i{position:relative;z-index:1;display:block;width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid var(--line);margin:0 auto 5px;font-size:10px;line-height:16px;font-style:normal;color:#fff}
  .cq-step.done{color:var(--ink2)}.cq-step.done:before{background:var(--sage)}.cq-step.done i{background:var(--sage);border-color:var(--sage)}
  .cq-step.cur i{border-color:var(--gold);box-shadow:0 0 0 4px rgba(201,151,31,.18)}.cq-step.cur{color:var(--ink)}
  .cq-head{font:600 15px Fraunces,Georgia,serif;margin:4px 0 2px}.cq-head+p{margin:0 0 10px;font-size:12.5px;color:var(--ink2);line-height:1.5}
  .cq-codebox{background:var(--ink);color:var(--cream);border-radius:16px;text-align:center;padding:14px;margin:8px 0}
  .cq-codebox small{display:block;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}.cq-codebox b{display:block;font:600 30px Fraunces,Georgia,serif;letter-spacing:.2em;margin-top:2px}
  .cq-inline{display:flex;gap:8px;margin:8px 0}.cq-code{text-align:center;letter-spacing:.3em;font:600 18px Fraunces,Georgia,serif;max-width:170px;resize:none}
  .cq-timer{font-size:12.5px;color:var(--ink2);margin:6px 0}.cq-panel .cq-actions{padding:6px 0 0}
  .cq-dispute{background:#fbf1ee;border:1px solid #efd3ca;border-radius:14px;padding:12px;margin:8px 0;font-size:13px}.cq-dispute strong{color:var(--danger)}
  .cq-evid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;margin-top:8px}.cq-evid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;cursor:zoom-in;border:1px solid var(--line)}
  .cq-evnote{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-top:6px;font-size:12.5px}
  .cq-lb{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9500;display:flex;align-items:center;justify-content:center;cursor:zoom-out}.cq-lb img{max-width:94vw;max-height:92vh;border-radius:12px}
  </style>`);

  /* ---------- helpers ---------- */
  function sheet(html) {
    document.querySelectorAll('.cq-overlay').forEach(x => x.remove());
    const o = document.createElement('div'); o.className = 'cq-overlay';
    o.innerHTML = `<div class="cq-sheet">${html}</div>`;
    o.addEventListener('mousedown', e => { if (e.target === o) o.remove(); });
    document.body.appendChild(o); return o;
  }
  function zoom(url) {
    const lb = document.createElement('div'); lb.className = 'cq-lb'; lb.innerHTML = `<img src="${esc(url)}">`;
    lb.onclick = () => lb.remove(); document.body.appendChild(lb);
  }
  document.addEventListener('click', e => { const z = e.target.closest('[data-zoom]'); if (z) zoom(z.dataset.zoom); });
  function askText(title, sub, placeholder, cta, danger) {
    return new Promise(resolve => {
      const o = sheet(`<h3>${esc(title)}</h3><p class="cq-sub">${esc(sub)}</p>
        <textarea class="cq-in" id="cqAsk" rows="4" placeholder="${esc(placeholder)}"></textarea><div class="cq-err" id="cqAskErr"></div>
        <div class="cq-row"><button class="cq-btn" id="cqAskNo">Back</button><button class="cq-btn ${danger ? 'danger' : 'primary'}" id="cqAskGo">${esc(cta)}</button></div>`);
      o.querySelector('#cqAskNo').onclick = () => { o.remove(); resolve(null); };
      o.querySelector('#cqAskGo').onclick = () => {
        const v = o.querySelector('#cqAsk').value.trim();
        if (v.length < 5) { o.querySelector('#cqAskErr').textContent = 'Please add a short reason.'; return; }
        o.remove(); resolve(v);
      };
    });
  }
  async function context() {
    if (!convId) return null;
    if (!ctxCache[convId]) ctxCache[convId] = api(`/api/quotes/context?conversation_id=${convId}`).catch(() => null);
    return ctxCache[convId];
  }
  function refreshAll() {
    quoteCache.clear();
    if (window.refreshThreadMessages) window.refreshThreadMessages(true);
    refreshPanel();
  }

  /* ---------- send-quote sheet (freelancer) ---------- */
  async function openSend(opts) {            // opts: { prefill: {what, amount, job_type}, parentId }
  const c = await context();
  if (!c) return say('Open a conversation first', 1);
  if (!c.i_am_provider) return say('Only the freelancer sends a quote. As the client, use Counter on a quote you received.', 1);
  const pf = (opts && opts.prefill) || {};
  const o = sheet(`<h3>${opts && opts.parentId ? 'Counter back' : 'Send a quote'}</h3>
    <p class="cq-sub">Write it as a promise. When the client confirms, it becomes your written agreement for this job.</p>
    <div class="cq-types">
      <label class="cq-type ${pf.job_type !== 'online' ? 'on' : ''}"><input type="radio" name="cqT" value="onsite" ${pf.job_type !== 'online' ? 'checked' : ''}><b>📍 On-site</b>You go to the client. Arrival &amp; completion codes.</label>
      <label class="cq-type ${pf.job_type === 'online' ? 'on' : ''}"><input type="radio" name="cqT" value="online" ${pf.job_type === 'online' ? 'checked' : ''}><b>💻 Online</b>Remote work. No codes.</label>
    </div>
    <div class="cq-field"><span>I will</span><textarea id="cqWhat" placeholder="fix the leaking kitchen sink and replace the washer">${esc(pf.what || '')}</textarea></div>
    <div class="cq-field"><span>for</span><input id="cqPrice" type="number" min="1" step="0.01" placeholder="$ 0.00" value="${pf.amount || ''}"></div>
    <div class="cq-preview" id="cqPrev"></div><div class="cq-err" id="cqErr"></div>
    <div class="cq-row"><button class="cq-btn" id="cqCancel">Cancel</button><button class="cq-btn gold" id="cqSendGo">Send quote</button></div>`);
  const prev = () => { const w = o.querySelector('#cqWhat').value.trim().replace(/^i\s+will\s+/i, ''), p = o.querySelector('#cqPrice').value;
    o.querySelector('#cqPrev').innerHTML = w || p ? `“I will ${esc(w || '…')} for <b>${p ? money(p) : '…'}</b>”` : 'Your quote will appear here.'; };
  o.querySelectorAll('.cq-type').forEach(l => l.addEventListener('click', () => { o.querySelectorAll('.cq-type').forEach(x => x.classList.remove('on')); l.classList.add('on'); }));
  o.querySelector('#cqWhat').oninput = prev; o.querySelector('#cqPrice').oninput = prev; prev();
  o.querySelector('#cqCancel').onclick = () => o.remove();
  o.querySelector('#cqSendGo').onclick = async ev => {
    ev.target.disabled = true;
    try {
      await post('/api/quotes/send', { conversation_id: convId, what: o.querySelector('#cqWhat').value, amount: o.querySelector('#cqPrice').value,
        job_type: o.querySelector('input[name=cqT]:checked').value, parent_quote_id: (opts && opts.parentId) || null });
      o.remove(); say('Quote sent. Waiting for the client to confirm.'); refreshAll();
    } catch (e) { o.querySelector('#cqErr').textContent = e.message; ev.target.disabled = false; }
  };
}
async function openCounter(quoteId) {
  const q = await api(`/api/quotes/${quoteId}`), c = await context();
  if (c && c.i_am_provider) {                       // freelancer countering a client's counter → send a fresh quote
    return openSend({ parentId: quoteId, prefill: { what: q.description, amount: q.amount, job_type: q.job_type } });
  }
  const o = sheet(`<h3>Counter-offer</h3>
    <p class="cq-sub">Suggest different terms. ${esc(q.sender_name)} can agree, counter back, or decline. Nothing is charged until you both agree.</p>
    <div class="cq-field"><span>They will</span><textarea id="cqWhat">${esc(q.description || '')}</textarea></div>
    <div class="cq-field"><span>for</span><input id="cqPrice" type="number" min="1" step="0.01" value="${q.amount}"></div>
    <div class="cq-note" style="margin:-4px 0 10px">Their original offer: ${money(q.amount)}</div>
    <div class="cq-preview" id="cqPrev"></div><div class="cq-err" id="cqErr"></div>
    <div class="cq-row"><button class="cq-btn" id="cqCancel">Back</button><button class="cq-btn gold" id="cqGo">Send counter-offer</button></div>`);
  const prev = () => { const w = o.querySelector('#cqWhat').value.trim(), p = o.querySelector('#cqPrice').value;
    o.querySelector('#cqPrev').innerHTML = `“${esc(q.recipient_name)} will ${esc(w || '…')} for <b>${p ? money(p) : '…'}</b>”`; };
  o.querySelector('#cqWhat').oninput = prev; o.querySelector('#cqPrice').oninput = prev; prev();
  o.querySelector('#cqCancel').onclick = () => o.remove();
  o.querySelector('#cqGo').onclick = async ev => {
    ev.target.disabled = true;
    try { await post(`/api/quotes/${quoteId}/counter`, { what: o.querySelector('#cqWhat').value, amount: o.querySelector('#cqPrice').value });
      o.remove(); say('Counter-offer sent.'); refreshAll(); }
    catch (e) { o.querySelector('#cqErr').textContent = e.message; ev.target.disabled = false; }
  };
}
  /* ---------- quote card ---------- */
  const QCHIP = { pending: ['warn', 'Awaiting confirmation'], accepted: ['ok', 'Agreed'], declined: ['bad', 'Declined'], expired: ['', 'Expired'], superseded: ['', 'Replaced'], withdrawn: ['', 'Withdrawn'] };
  function cardHTML(q) {
  const mine = Number(q.me) === Number(q.sender_id), iAmRecipient = Number(q.me) === Number(q.recipient_id);
  const counter = q.proposed_by === 'client';
  const [cls, label] = QCHIP[q.status] || ['', q.status];
  const sentence = esc(q.agreement_text || '').replace(/(\$[\d,]+\.\d{2})$/, '<b>$1</b>');
  let actions = '', note = '';
  if (q.status === 'pending' && iAmRecipient) {
    actions = `<button class="cq-btn primary" data-qa="accept" data-id="${q.id}">Agree &amp; confirm</button>
               <button class="cq-btn" data-qa="counter" data-id="${q.id}">Counter</button>
               <button class="cq-btn danger" data-qa="decline" data-id="${q.id}">Decline</button>`;
    note = counter ? 'The client suggested different terms. Agreeing locks them in as your written agreement.'
                   : 'By confirming you agree to this exact scope and price. It is saved as your written agreement.';
  } else if (q.status === 'pending' && mine) {
    actions = `<button class="cq-btn sm" data-qa="withdraw" data-id="${q.id}">Withdraw</button>`;
    note = `Waiting for ${esc(q.recipient_name)} to respond. Expires in 48 hours.`;
  } else if (q.status === 'accepted') {
    note = `Agreed ${fdate(q.accepted_at)}${q.agreement_hash ? ' · Ref ' + q.agreement_hash.slice(0, 10) : ''}`;
    if (q.order_status === 'payment_pending' && q.client_id && Number(q.client_id) === Number(q.me))
      actions += `<button class="cq-btn gold" data-qa="pay" data-order="${q.order_id}">Pay ${money(q.amount)}</button>`;
    if (q.order_id) actions += `<button class="cq-btn sm" data-qa="agreement" data-order="${q.order_id}">View agreement</button>`;
  }
  return `<div class="cq-card"><div class="cq-top"><span>${counter ? '🔁 Counter-offer' : '📋 Quote'} from ${esc(q.sender_name)}</span><span class="cq-chip ${cls}">${label}</span></div>
    <div class="cq-body"><div class="cq-sentence">“${sentence}”</div>
    <div class="cq-meta"><span class="cq-chip">${q.job_type === 'online' ? '💻 Online job' : '📍 On-site job'}</span></div>
    ${note ? `<div class="cq-note">${esc(note)}</div>` : ''}</div>${actions ? `<div class="cq-actions">${actions}</div>` : ''}</div>`;
}
  function paint(el, q) { const s = JSON.stringify(q); if (el._s === s) return; el._s = s; el.innerHTML = cardHTML(q); }
  function scan() {
    document.querySelectorAll('[data-cq-quote]').forEach(async el => {
      const id = el.dataset.cqQuote, c = quoteCache.get(id);
      if (c) paint(el, c.q);
      if (!c || Date.now() - c.t > 6000) {
        try { const q = await api(`/api/quotes/${id}`); quoteCache.set(id, { q, t: Date.now() }); if (el.isConnected) paint(el, q); }
        catch (e) { if (!c) el.innerHTML = '<div class="cq-card"><div class="cq-body">Quote unavailable</div></div>'; }
      }
    });
  }

  async function showAgreement(orderId) {
  try {
    const d = await api(`/api/service-orders/${orderId}/agreement`), g = d.agreement;
    const stat = { accepted: ['ok', 'Agreed'], superseded: ['', 'Replaced by next offer'], declined: ['bad', 'Declined'], expired: ['', 'Expired'], withdrawn: ['', 'Withdrawn'], pending: ['warn', 'Open'] };
    const history = (d.negotiation || []).map(n => {
      const [cls, lbl] = stat[n.status] || ['', n.status];
      const who = n.proposed_by === 'client' ? '🔁 Client countered' : '📋 Freelancer offered';
      return `<div style="border-left:3px solid var(--line);padding:2px 0 2px 12px;margin:10px 0">
        <div style="font-size:12px;color:var(--muted)">${who} · ${esc(n.sender_name)} · ${new Date(n.created_at).toLocaleString()}</div>
        <div style="font:500 14.5px/1.45 Fraunces,Georgia,serif;margin:3px 0">“${n.proposed_by === 'client' ? 'Work: ' : 'I will '}${esc(n.description)} for <b>${money(n.amount)}</b>”</div>
        <span class="cq-chip ${cls}">${lbl}</span></div>`;
    }).join('');

    let dispute = '';
    if (d.dispute) {
      const ev = d.dispute.evidence || [];
      dispute = `<hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
        <div style="font:600 15px Fraunces,Georgia,serif;margin-bottom:6px">⚠️ Dispute (${esc(d.dispute.status)})</div>
        <div class="cq-note" style="margin:0 0 6px">${esc(d.dispute.reason)}</div>
        ${ev.filter(x => x.url).length ? `<div class="cq-evid">${ev.filter(x => x.url).map(x => `<img src="${esc(x.url)}" data-zoom="${esc(x.url)}">`).join('')}</div>` : ''}
        ${ev.filter(x => x.note).map(x => `<div class="cq-evnote">📝 ${esc(x.note)}</div>`).join('')}
        ${d.dispute.resolution ? `<div class="cq-note"><b>Decision:</b> ${esc(d.dispute.resolution)}</div>` : ''}`;
    }

    sheet(`<h3>Written agreement</h3>
      <p class="cq-sub">${esc(g.client)} (client) · ${esc(g.provider)} (freelancer)</p>
      <div class="cq-preview" style="color:var(--ink)">“I will ${esc(g.description)} for <b>${money(g.amount)}</b>”</div>
      <p class="cq-note">${g.job_type === 'online' ? 'Online job' : 'On-site job'} · agreed ${new Date(g.accepted_at).toLocaleString()}<br>Reference: <span style="word-break:break-all">${esc(g.hash || '')}</span></p>
      ${(d.negotiation || []).length > 1 ? `<hr style="border:none;border-top:1px solid var(--line);margin:14px 0"><div style="font:600 15px Fraunces,Georgia,serif">How you got here</div>${history}` : ''}
      ${dispute}
      <hr style="border:none;border-top:1px solid var(--line);margin:14px 0"><div style="font:600 15px Fraunces,Georgia,serif;margin-bottom:6px">Timeline</div>
      ${d.events.map(ev => `<div style="font-size:12.5px;margin:6px 0;color:var(--ink2)"><b style="color:var(--ink)">${esc(ev.event.replace(/_/g, ' '))}</b>${ev.actor ? ' · ' + esc(ev.actor) : ''}<br><span style="color:var(--muted)">${new Date(ev.created_at).toLocaleString()}${ev.detail ? ' · ' + esc(ev.detail) : ''}</span></div>`).join('')}
      <div class="cq-row" style="margin-top:14px"><button class="cq-btn" onclick="this.closest('.cq-overlay').remove()">Close</button></div>`);
  } catch (e) { say(e.message, 1); }
}

  /* ---------- job panel ---------- */
  const STEPS = { onsite: ['Agreed', 'Paid', 'Arrived', 'Work done', 'Approved', 'Released'], online: ['Agreed', 'Paid', 'Delivered', 'Released'] };
  const SCHIP = { payment_pending: ['warn', 'Awaiting payment'], escrow_funded: ['blue', 'Paid · escrow'], in_progress: ['blue', 'In progress'], client_review: ['warn', 'Inspection'], release_pending: ['ok', 'Releasing'], completed: ['ok', 'Complete'], disputed: ['bad', 'Disputed'], cancelled: ['', 'Cancelled'], refunded: ['', 'Refunded'], payout_failed: ['warn', 'Payout pending'], refund_failed: ['warn', 'Refund pending'] };
  const doneCount = o => { const s = o.status; return o.job_type === 'online'
    ? ({ payment_pending: 1, in_progress: 2, release_pending: 3, completed: 4 })[s] ?? 0
    : ({ payment_pending: 1, escrow_funded: 2, in_progress: 3, client_review: o.client_satisfied_at ? 5 : 4, release_pending: 5, completed: 6 })[s] ?? 0; };

  function headline(o) {
    const c = o.i_am_client, on = o.job_type !== 'online', rel = o.payment_held_until ? fdate(o.payment_held_until) : '';
    switch (o.status) {
      case 'payment_pending': return c ? ['Quote agreed. Pay to start the job', `Your ${money(o.agreed_price)} is held safely by Core Insight and only released once the job is done.`] : ['Waiting for the client to pay', 'You can start as soon as payment arrives.'];
      case 'escrow_funded': return c ? ['Paid. Share the arrival code when they arrive', 'Only give it to the freelancer once they are physically with you.'] : ['Paid. Enter the client’s arrival code on arrival', 'Entering it starts the job timer.'];
      case 'in_progress': return c ? ['Work in progress', 'You’ll be asked to inspect once the freelancer marks it complete.'] : ['Work in progress', on ? 'Press “Mark complete” when you’re done.' : 'Press “Mark delivered” when the work is handed over.'];
      case 'client_review': return c ? (o.client_satisfied_at ? ['You approved the work', 'Give the completion code to the freelancer to finish.'] : ['Inspect the work', 'Happy? Press “I’m satisfied”. Not right? Request a fix or open a dispute with photos.'])
        : (o.client_satisfied_at ? ['Client is satisfied', 'Enter the completion code they give you.'] : ['Waiting for the client to inspect', 'If they don’t respond within 7 days it’s approved automatically.']);
      case 'release_pending': return ['Payment is on its way', c ? `Released ${rel}. You can still open a dispute until then.` : `Releases ${rel}.`];
      case 'completed': return ['Job complete', 'Payment has been released to the freelancer.'];
      case 'disputed': return ['Dispute open', 'Funds are frozen while Core Insight reviews. Add photos or notes below.'];
      case 'cancelled': return ['Job cancelled', o.cancel_reason ? `Reason: ${o.cancel_reason}` : 'No payment was taken.'];
      case 'refunded': return ['Cancelled · client refunded in full', o.cancel_reason ? `Reason: ${o.cancel_reason}` : ''];
      case 'payout_failed': return ['Payout delayed', 'Support has been alerted and will complete it.'];
      case 'refund_failed': return ['Refund delayed', 'Support has been alerted and will complete it.'];
    } return [o.status, ''];
  }
  function panelHTML(o) {
    const c = o.i_am_client, on = o.job_type !== 'online', s = o.status, [chipCls, chipTxt] = SCHIP[s] || ['', s];
    const [h, p] = headline(o), steps = STEPS[on ? 'onsite' : 'online'], d = doneCount(o), showSteps = !['cancelled', 'refunded', 'disputed', 'payout_failed', 'refund_failed'].includes(s);
    const btn = (cls, a, t) => `<button class="cq-btn ${cls}" data-oa="${a}" data-order="${o.id}">${t}</button>`;
    let a = '';
    if (s === 'payment_pending' && c) a += btn('gold', 'pay', `Pay ${money(o.agreed_price)}`);
    if (s === 'in_progress' && !c) a += btn('primary', 'complete', on ? 'Mark complete' : 'Mark delivered');
    if (s === 'client_review' && c && !o.client_satisfied_at) a += btn('primary', 'satisfied', 'I’m satisfied') + btn('', 'fix', 'Request a fix');
    if (['in_progress', 'client_review', 'release_pending'].includes(s)) a += btn('danger', 'dispute', 'Open dispute');
    if (['payment_pending', 'escrow_funded', 'in_progress'].includes(s)) a += btn('danger sm', 'cancel', 'Cancel job');
    if (s === 'disputed') a += btn('primary', 'evidence', 'Add photos / notes');
    a += btn('sm', 'agreement', 'Agreement');

    let extra = '';
    if (s === 'escrow_funded' && c && o.arrival_code) extra += `<div class="cq-codebox"><small>Arrival code</small><b>${esc(o.arrival_code)}</b></div>`;
    if (s === 'escrow_funded' && !c) extra += `<div class="cq-inline"><input class="cq-code" id="cqArr" maxlength="6" inputmode="numeric" placeholder="······">${btn('primary', 'arrival', 'Confirm arrival')}</div>`;
    if (s === 'client_review' && c && o.client_satisfied_at && o.completion_code) extra += `<div class="cq-codebox"><small>Completion code</small><b>${esc(o.completion_code)}</b></div>`;
    if (s === 'client_review' && !c && o.client_satisfied_at) extra += `<div class="cq-inline"><input class="cq-code" id="cqComp" maxlength="6" inputmode="numeric" placeholder="······">${btn('primary', 'confirmcode', 'Finish job')}</div>`;
    if (o.started_at && ['in_progress', 'client_review'].includes(s)) extra += `<div class="cq-timer" data-start="${o.started_at}"></div>`;
    if (o.dispute && s === 'disputed') {
      const ev = o.dispute.evidence || [];
      extra += `<div class="cq-dispute"><strong>Reason given:</strong> ${esc(o.dispute.reason)}
        ${ev.length ? `<div class="cq-evid">${ev.filter(x => x.url).map(x => `<img src="${esc(x.url)}" data-zoom="${esc(x.url)}">`).join('')}</div>${ev.filter(x => x.note).map(x => `<div class="cq-evnote">📝 ${esc(x.note)}</div>`).join('')}` : '<div class="cq-note">No photos added yet.</div>'}</div>`;
    }
    return `<div class="cq-panel"><div class="cq-ph" data-oa="toggle"><span class="cq-chip ${chipCls}">${chipTxt}</span>
      <div class="cq-pt">${esc(o.description ? 'I will ' + o.description : o.title)}<small>${on ? '📍 On-site' : '💻 Online'} · ${money(o.agreed_price)}</small></div><span style="color:var(--muted)">${panelOpen ? '▴' : '▾'}</span></div>
      ${panelOpen ? `<div class="cq-pb">${showSteps ? `<div class="cq-steps">${steps.map((t, i) => `<div class="cq-step ${i < d ? 'done' : i === d ? 'cur' : ''}"><i>${i < d ? '✓' : ''}</i>${t}</div>`).join('')}</div>` : '<div style="height:10px"></div>'}
      <div class="cq-head">${esc(h)}</div><p>${esc(p)}</p>${extra}<div class="cq-actions">${a}</div></div>` : ''}</div>`;
  }
  function tick() {
    document.querySelectorAll('.cq-timer').forEach(el => {
      const t0 = new Date(el.dataset.start); if (isNaN(t0)) return;
      const m = Math.max(0, Math.floor((Date.now() - t0) / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
      el.innerHTML = `⏱ Started <b>${t0.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</b> at ${t0.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · running ${d ? d + 'd ' : ''}${h}h ${m % 60}m`;
    });
  }
  let lastPanel = '';
  async function refreshPanel() {
    const host = document.getElementById('jobPanel'); if (!host || !convId) return;
    try {
      const { order } = await api(`/api/service-orders/by-conversation/${convId}`);
      const html = order ? panelHTML(order) : '';
      const typing = document.activeElement && host.contains(document.activeElement);
      if (html !== lastPanel && !typing) { host.innerHTML = html; lastPanel = html; }
      tick();
    } catch (e) { /* silent */ }
  }
  function mount(id) { convId = id; lastPanel = ''; const h = document.getElementById('jobPanel'); if (h) h.innerHTML = ''; clearInterval(panelTimer); if (id) { refreshPanel(); panelTimer = setInterval(() => { refreshPanel(); tick(); }, 8000); } }

  /* ---------- dispute / evidence sheet ---------- */
  function openDispute(orderId, mode) {
    const add = mode === 'add', files = [];
    const o = sheet(`<h3>${add ? 'Add evidence' : 'Open a dispute'}</h3>
      <p class="cq-sub">${add ? 'Add photos or a note to support your side.' : 'Funds are frozen until Core Insight reviews. Photos help us decide fast: the problem, the work done, damage, or screenshots.'}</p>
      <textarea class="cq-in" id="cqDText" rows="4" placeholder="${add ? 'Add a note (optional)' : 'What went wrong? Be specific.'}"></textarea>
      <div class="cq-drop" id="cqDrop">📷 Tap to add photos (up to 6, 5 MB each)</div>
      <input type="file" id="cqDFile" accept="image/*" multiple style="display:none"><div class="cq-thumbs" id="cqThumbs"></div>
      <div class="cq-err" id="cqDErr"></div>
      <div class="cq-row"><button class="cq-btn" id="cqDNo">Back</button><button class="cq-btn ${add ? 'primary' : 'danger'}" id="cqDGo">${add ? 'Submit evidence' : 'Open dispute'}</button></div>`);
    const draw = () => { const t = o.querySelector('#cqThumbs'); t.innerHTML = ''; files.forEach((f, i) => { const d = document.createElement('div'); d.className = 'cq-thumb'; const u = URL.createObjectURL(f); d.innerHTML = `<img src="${u}" data-zoom="${u}"><button data-i="${i}">×</button>`; t.appendChild(d); }); };
    o.querySelector('#cqDrop').onclick = () => o.querySelector('#cqDFile').click();
    o.querySelector('#cqDFile').onchange = e => { for (const f of e.target.files) { if (f.size > 5 * 1024 * 1024) { say(`${f.name} is over 5 MB`, 1); continue; } if (files.length < 6) files.push(f); } e.target.value = ''; draw(); };
    o.querySelector('#cqThumbs').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) { files.splice(+b.dataset.i, 1); draw(); } };
    o.querySelector('#cqDNo').onclick = () => o.remove();
    o.querySelector('#cqDGo').onclick = async ev => {
      const txt = o.querySelector('#cqDText').value.trim(), err = o.querySelector('#cqDErr');
      if (!add && txt.length < 10) { err.textContent = 'Please explain what went wrong (10+ characters).'; return; }
      if (add && !txt && !files.length) { err.textContent = 'Add a photo or a note.'; return; }
      const fd = new FormData(); fd.append(add ? 'note' : 'reason', txt); files.forEach(f => fd.append('evidence', f));
      ev.target.disabled = true; ev.target.textContent = 'Uploading…';
      try {
        const r = await fetch(`/api/service-orders/${orderId}/dispute${add ? '/evidence' : ''}`, { method: 'POST', credentials: 'include', body: fd });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Failed');
        o.remove(); say(add ? 'Evidence added' : 'Dispute opened. Funds are frozen.'); refreshAll();
      } catch (e) { err.textContent = e.message; ev.target.disabled = false; ev.target.textContent = add ? 'Submit evidence' : 'Open dispute'; }
    };
  }

  /* ---------- click handling ---------- */
  document.addEventListener('click', async e => {
    const q = e.target.closest('[data-qa]'), a = e.target.closest('[data-oa]');
    try {
      if (q) {
        const id = q.dataset.id, act = q.dataset.qa;
        if (act === 'accept') { q.disabled = true; await post(`/api/quotes/${id}/accept`); say('Agreed. You can now pay to start the job.'); refreshAll(); }
        else if (act === 'decline') { if (confirm('Decline this quote?')) { await post(`/api/quotes/${id}/decline`); refreshAll(); } }
        else if (act === 'withdraw') { await post(`/api/quotes/${id}/withdraw`); refreshAll(); }
        else if (act === 'pay') { q.disabled = true; q.textContent = 'Opening payment…'; const d = await post(`/api/service-orders/${q.dataset.order}/pay`); window.location.href = d.paymentLink; }
        else if (act === 'agreement') showAgreement(q.dataset.order);
      } else if (a) {
        const id = a.dataset.order, act = a.dataset.oa, base = `/api/service-orders/${id}`;
        if (act === 'toggle') { panelOpen = !panelOpen; lastPanel = ''; refreshPanel(); }
        else if (act === 'pay') { a.disabled = true; a.textContent = 'Opening payment…'; const d = await post(`${base}/pay`); window.location.href = d.paymentLink; }
        else if (act === 'arrival') { await post(`${base}/verify-arrival`, { code: document.getElementById('cqArr').value }); say('Arrival confirmed. Timer started.'); refreshAll(); }
        else if (act === 'complete') { if (confirm('Mark this job as finished?')) { await post(`${base}/mark-completed`); refreshAll(); } }
        else if (act === 'satisfied') { await post(`${base}/satisfied`); say('Great. Give the completion code to the freelancer.'); refreshAll(); }
        else if (act === 'confirmcode') { await post(`${base}/confirm-completion`, { code: document.getElementById('cqComp').value }); say('Confirmed. Payment releases in 7 days.'); refreshAll(); }
        else if (act === 'fix') { const n = await askText('Request a fix', 'Tell the freelancer what needs to be put right.', 'e.g. The pipe under the sink still drips', 'Send request'); if (n) { await post(`${base}/request-fix`, { notes: n }); refreshAll(); } }
        else if (act === 'cancel') { const r = await askText('Cancel this job?', 'The client is refunded in full. Please give a short reason.', 'Reason for cancelling', 'Cancel job', true); if (r) { const d = await post(`${base}/cancel`, { reason: r }); say(d.refunded ? 'Cancelled. The client is being refunded in full.' : 'Cancelled.'); refreshAll(); } }
        else if (act === 'dispute') openDispute(id, 'new');
        else if (act === 'evidence') openDispute(id, 'add');
        else if (act === 'agreement') showAgreement(id);
        else if (act === 'counter') openCounter(id);
      }
    } catch (err) { say(err.message, 1); }
  });

  window.CoreQuote = {
    setConversation(id) { mount(id); },
    openSend, scan, zoom, refreshPanel,
    isProvider: async () => { const c = await context(); return !!(c && c.i_am_provider); },
  };
  window.CoreOrder = { refresh: refreshPanel };
})();