/* ============================================================
   MESSAGES.JS — unified inbox page
   Self-contained on purpose (doesn't load products.js) so this
   page never breaks due to product-grid-specific code running
   against a DOM it doesn't recognize. Talks to the same backend
   endpoints from unified-messaging-backend.js.
   ============================================================ */

let currentUser = null;
let conversations = [];
let activeConversationId = null;
let activeFilter = 'all';
let messagePollTimer = null;
let typingPollTimer = null;
let typingSendThrottle = null;

const ITEM_ICONS = { product: '📦', service: '🛠', course: '🎓', book: '📚', general: '💬', order_support: '🛒' };
const ITEM_LABELS = { product: 'Product', service: 'Service', course: 'Course', book: 'Book', general: 'General', order_support: 'Order Support' };

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtMoney(v) { return v == null ? '' : `$${Number(v).toFixed(2)}`; }
function formatTimeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function getCSRFToken() {
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}
function showToast(title, msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<strong>${escapeHtml(title)}</strong><br><span style="opacity:.85">${escapeHtml(msg)}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentUser();
  if (!currentUser) {
    document.getElementById('conversationList').innerHTML = `
      <div class="inbox-empty"><i class="fas fa-lock"></i><p>Please log in to view your messages.</p></div>`;
    return;
  }
  await loadConversations();

  // Deep link from the email button / bell: /messages.html?conversation=123
  const params = new URLSearchParams(window.location.search);
  const target = params.get('conversation');
  if (target) openConversation(Number(target));

  document.querySelectorAll('.inbox-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.inbox-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderConversationList();
    });
  });
});

async function loadCurrentUser() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.ok) currentUser = await res.json();
  } catch (e) { /* not logged in */ }
}

/* ---------- conversation list ---------- */
async function loadConversations() {
  try {
    const res = await fetch('/api/messages/conversations', { credentials: 'include' });
    conversations = res.ok ? await res.json() : [];
    renderConversationList();
  } catch (e) {
    document.getElementById('conversationList').innerHTML = `<div class="inbox-empty"><i class="fas fa-triangle-exclamation"></i><p>Couldn't load messages.</p></div>`;
  }
}

function renderConversationList() {
  const listEl = document.getElementById('conversationList');
  let filtered = conversations;

  if (activeFilter === 'unread') filtered = conversations.filter(c => Number(c.unread_count) > 0 && !c.is_archived);
  else if (activeFilter === 'archived') filtered = conversations.filter(c => c.is_archived);
  else if (activeFilter !== 'all') filtered = conversations.filter(c => c.item_type === activeFilter && !c.is_archived);
  else filtered = conversations.filter(c => !c.is_archived);

  if (!filtered.length) {
    listEl.innerHTML = `<div class="inbox-empty"><i class="fas fa-inbox"></i><p>No conversations here yet.</p></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const icon = ITEM_ICONS[c.item_type] || ITEM_ICONS.general;
    const unread = Number(c.unread_count) > 0;
    return `<div class="conversation-row ${activeConversationId === c.conversation_id ? 'active' : ''} ${unread ? 'unread' : ''}" data-id="${c.conversation_id}">
      <span class="badge-icon">${icon}</span>
      <div class="conv-body">
        <div class="conv-top">
          <span class="conv-name">${escapeHtml(c.other_user_name || 'User')}</span>
          <span class="conv-time">${formatTimeShort(c.last_message_time || c.created_at)}</span>
        </div>
        ${c.item_title ? `<div class="conv-item-title">${escapeHtml(c.item_title)}</div>` : ''}
        <div class="conv-preview">${escapeHtml(c.last_message || 'No messages yet')}</div>
      </div>
      ${unread ? '<span class="unread-dot"></span>' : ''}
    </div>`;
  }).join('');

  listEl.querySelectorAll('.conversation-row').forEach(row => {
    row.addEventListener('click', () => openConversation(Number(row.dataset.id)));
  });
}

/* ---------- thread pane ---------- */
async function openConversation(conversationId) {
  activeConversationId = conversationId;
  history.replaceState(null, '', `/messages.html?conversation=${conversationId}`);
  stopMessagePolling(); stopTypingPolling();

  const conv = conversations.find(c => c.conversation_id === conversationId);
  renderConversationList(); // to update the active highlight

  const threadEl = document.getElementById('inboxThread');
  const icon = conv ? (ITEM_ICONS[conv.item_type] || ITEM_ICONS.general) : '💬';
  const label = conv ? (ITEM_LABELS[conv.item_type] || 'General') : 'General';

  threadEl.innerHTML = `
    <div class="thread-header">
      <span class="other-user-name">${escapeHtml(conv?.other_user_name || 'Conversation')}</span>
      <div class="thread-header-actions">
        <button class="small-btn" id="archiveConvBtn"><i class="fas fa-box-archive"></i> ${conv?.is_archived ? 'Unarchive' : 'Archive'}</button>
      </div>
    </div>
    ${conv && conv.item_title ? `
      <div class="thread-context-card">
        <span class="ctx-icon">${icon}</span>
        <div class="ctx-body">
          <div class="ctx-label">${label}</div>
          <div class="ctx-title">${escapeHtml(conv.item_title)}</div>
          ${conv.item_price != null ? `<div class="ctx-price">${fmtMoney(conv.item_price)}</div>` : ''}
        </div>
        ${conv.item_url ? `<a href="${conv.item_url}" class="small-btn">View</a>` : ''}
      </div>` : ''}
    <div class="thread-messages" id="threadMessages">
      <p style="text-align:center;color:var(--text-muted);font-size:13px;">Loading…</p>
    </div>
    <div id="typingIndicatorRowInbox"></div>
    <div class="thread-composer">
      <input type="file" id="inboxAttachInput" accept="image/*,application/pdf" style="display:none;">
      <button class="composer-btn composer-attach" id="inboxAttachBtn" title="Attach image or PDF"><i class="fas fa-paperclip"></i></button>
      <textarea id="inboxComposerText" rows="1" placeholder="Write a message…"></textarea>
      <button class="composer-btn composer-send" id="inboxSendBtn" title="Send"><i class="fas fa-paper-plane"></i></button>
    </div>`;

  document.getElementById('archiveConvBtn').addEventListener('click', () => toggleArchive(conversationId, !conv?.is_archived));
  document.getElementById('inboxSendBtn').addEventListener('click', sendInboxMessage);
  document.getElementById('inboxComposerText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInboxMessage(); }
  });
  document.getElementById('inboxComposerText').addEventListener('input', notifyTyping);
  document.getElementById('inboxAttachBtn').addEventListener('click', () => document.getElementById('inboxAttachInput').click());
  document.getElementById('inboxAttachInput').addEventListener('change', (e) => sendInboxAttachment(e.target.files[0]));

  await refreshThreadMessages();
  startMessagePolling();
  startTypingPolling();
}

async function refreshThreadMessages() {
  if (!activeConversationId) return;
  try {
    const res = await fetch(`/api/messages/${activeConversationId}/messages`, { credentials: 'include' });
    const messages = res.ok ? await res.json() : [];
    renderThreadMessages(messages);
    fetch(`/api/messages/${activeConversationId}/mark-seen`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCSRFToken() } })
      .then(() => { loadConversations(); }) // refreshes unread counts/dots in the sidebar
      .catch(() => {});
  } catch (e) { /* non-fatal, will retry on next poll */ }
}

function renderThreadMessages(messages) {
  const el = document.getElementById('threadMessages');
  if (!el) return;
  if (!messages.length) {
    el.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px;">No messages yet — say hello.</p>`;
    return;
  }
  el.innerHTML = messages.map(m => {
    const mine = currentUser && parseInt(m.sender_id) === parseInt(currentUser.id);
    const receipt = mine ? (m.read_at ? '✓✓ Seen' : '✓ Sent') : '';
    let attachment = '';
    if (m.attachment_url) {
      attachment = m.attachment_type === 'pdf'
        ? `<a class="attach-pdf" href="${m.attachment_url}" target="_blank"><i class="fas fa-file-pdf"></i> View PDF</a>`
        : `<img class="attach-img" src="${m.attachment_url}">`;
    }
    return `<div class="msg-bubble-row ${mine ? 'mine' : 'theirs'}">
      <div class="msg-bubble">${escapeHtml(m.message || '')}${attachment}</div>
      <div class="msg-meta">${formatTimeShort(m.created_at)}${receipt ? ' · ' + receipt : ''}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

/* ---------- send ---------- */
async function sendInboxMessage() {
  const textarea = document.getElementById('inboxComposerText');
  const msg = textarea.value.trim();
  if (!msg || !activeConversationId) return;
  textarea.value = '';
  try {
    const res = await fetch('/api/messages/send', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() },
      body: JSON.stringify({ conversation_id: activeConversationId, message: msg }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Send failed'); }
    await refreshThreadMessages();
  } catch (e) {
    showToast('Could not send', e.message || 'Try again in a moment.');
  }
}

async function sendInboxAttachment(file) {
  if (!file || !activeConversationId) return;
  const formData = new FormData();
  formData.append('conversation_id', activeConversationId);
  formData.append('image', file);
  try {
    const res = await fetch('/api/messages/send-with-image', { method: 'POST', credentials: 'include', body: formData });
    if (!res.ok) throw new Error('Upload failed');
    document.getElementById('inboxAttachInput').value = '';
    await refreshThreadMessages();
  } catch (e) {
    showToast('Attachment failed', 'Could not send that file.');
  }
}

/* ---------- archive ---------- */
async function toggleArchive(conversationId, archived) {
  try {
    await fetch(`/api/messages/${conversationId}/archive`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() },
      body: JSON.stringify({ archived }),
    });
    await loadConversations();
    document.getElementById('inboxThread').innerHTML = `<div class="thread-placeholder"><i class="fas fa-comments"></i><p>Select a conversation to view it</p></div>`;
    activeConversationId = null;
    stopMessagePolling(); stopTypingPolling();
  } catch (e) {
    showToast('Could not update', 'Try again in a moment.');
  }
}

/* ---------- typing indicator ---------- */
function notifyTyping() {
  if (!activeConversationId || typingSendThrottle) return;
  typingSendThrottle = setTimeout(() => { typingSendThrottle = null; }, 2000);
  fetch(`/api/messages/${activeConversationId}/typing`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCSRFToken() } }).catch(() => {});
}
function startTypingPolling() {
  stopTypingPolling();
  typingPollTimer = setInterval(async () => {
    if (!activeConversationId) return;
    try {
      const res = await fetch(`/api/messages/${activeConversationId}/typing-status`, { credentials: 'include' });
      const data = await res.json();
      const row = document.getElementById('typingIndicatorRowInbox');
      if (!row) return;
      row.textContent = data.is_typing ? `${data.username || 'They'} are typing…` : '';
    } catch (e) { /* non-fatal */ }
  }, 2500);
}
function stopTypingPolling() { if (typingPollTimer) clearInterval(typingPollTimer); typingPollTimer = null; }

/* ---------- message polling ---------- */
function startMessagePolling() { stopMessagePolling(); messagePollTimer = setInterval(refreshThreadMessages, 4000); }
function stopMessagePolling() { if (messagePollTimer) clearInterval(messagePollTimer); messagePollTimer = null; }