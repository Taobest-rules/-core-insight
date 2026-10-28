const CourseCommunity = (() => {
 let courseId = null, rating = 0, onSummary = null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  const when = d => new Date(d).toLocaleDateString();

  async function api(url, opts = {}) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }
  function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ---------- Reviews ----------
  async function loadReviews() {
    const el = document.getElementById('previewReviews');
    el.innerHTML = '<p class="cc-note">Loading reviews…</p>';
    try {
      const d = await api(`/api/courses/${courseId}/reviews`);
      if (onSummary) onSummary(d.average, d.count);
      const mine = d.reviews.find(r => r.is_mine);
      rating = mine ? mine.rating : 0;

      el.innerHTML = `
        <div class="cc-summary">
          <span class="big">${d.count ? d.average.toFixed(1) : '–'}</span>
          <div><div class="cc-stars">${stars(d.average)}</div>
          <small>${d.count} review${d.count === 1 ? '' : 's'}</small></div>
        </div>
        ${d.can_review ? `
          <div class="cc-form">
            <strong>${mine ? 'Update your review' : 'Leave a review'}</strong>
            <div class="cc-star-input" id="ccStarInput">
              ${[1,2,3,4,5].map(n => `<button type="button" data-star="${n}" class="${n <= rating ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('')}
            </div>
            <textarea id="ccReviewText" maxlength="2000" placeholder="What did you think of this course?">${esc(mine ? mine.comment : '')}</textarea>
            <button class="btn-primary btn-inline" data-cc="save-review" type="button">${mine ? 'Update review' : 'Submit review'}</button>
          </div>` : `<div class="cc-note">${esc(d.reason)}</div>`}
        ${d.reviews.map(r => `
          <div class="cc-item">
            <div class="cc-meta"><strong>${esc(r.username)}</strong>
              <span class="cc-stars">${stars(r.rating)}</span><span>${when(r.created_at)}</span>
              ${r.is_mine ? `<button class="cc-link danger" data-cc="del-review" data-id="${r.id}">Delete</button>` : ''}
            </div>
            <div class="cc-text">${esc(r.comment)}</div>
          </div>`).join('') || (d.can_review ? '' : '<p class="cc-note">No reviews yet.</p>')}`;
    } catch (e) { el.innerHTML = `<p class="cc-note">${esc(e.message)}</p>`; }
  }

  // ---------- Q&A ----------
  async function loadQA() {
    const el = document.getElementById('previewDiscussion');
    el.innerHTML = '<p class="cc-note">Loading discussion…</p>';
    try {
      const d = await api(`/api/courses/${courseId}/questions`);
      el.innerHTML = `
        ${d.can_post ? `
          <div class="cc-form">
            <strong>Ask a question</strong>
            <textarea id="ccQuestionText" maxlength="1500" placeholder="What would you like to know?"></textarea>
            <button class="btn-primary btn-inline" data-cc="ask" type="button">Post question</button>
          </div>` : `<div class="cc-note">${esc(d.reason)}</div>`}
        ${d.questions.map(q => `
          <div class="cc-item">
            <div class="cc-meta"><strong>${esc(q.username)}</strong><span>${when(q.created_at)}</span>
              ${(q.is_mine || d.is_admin) ? `<button class="cc-link danger" data-cc="del-q" data-id="${q.id}">Delete</button>` : ''}
            </div>
            <div class="cc-text">${esc(q.question)}</div>
            <div class="cc-answers">
              ${q.answers.map(a => `
                <div>
                  <div class="cc-meta"><strong>${esc(a.username)}</strong>
                    ${a.is_instructor ? '<span class="cc-badge">Instructor</span>' : ''}
                    <span>${when(a.created_at)}</span>
                    ${(a.is_mine || d.is_admin) ? `<button class="cc-link danger" data-cc="del-a" data-id="${a.id}">Delete</button>` : ''}
                  </div>
                  <div class="cc-text">${esc(a.answer)}</div>
                </div>`).join('')}
            </div>
            ${d.can_post ? `
              <button class="cc-link" data-cc="toggle-reply" data-id="${q.id}">Reply</button>
              <div class="cc-reply" id="ccReply${q.id}">
                <textarea class="cc-reply-text" maxlength="2000" placeholder="Write an answer…" style="width:100%;padding:.6rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);"></textarea>
                <button class="btn-primary btn-inline" data-cc="answer" data-id="${q.id}" type="button" style="margin-top:.5rem">Post answer</button>
              </div>` : ''}
          </div>`).join('') || '<p class="cc-note">No questions yet. Be the first to ask!</p>'}`;
    } catch (e) { el.innerHTML = `<p class="cc-note">${esc(e.message)}</p>`; }
  }

  // ---------- Events (delegated, bound once) ----------
  async function onClick(e) {
    const star = e.target.closest('[data-star]');
    if (star) {
      rating = parseInt(star.dataset.star);
      document.querySelectorAll('#ccStarInput button').forEach(b => b.classList.toggle('on', +b.dataset.star <= rating));
      return;
    }
    const btn = e.target.closest('[data-cc]');
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      switch (btn.dataset.cc) {
        case 'save-review':
          btn.disabled = true;
          await api(`/api/courses/${courseId}/reviews`, { method: 'POST',
            body: JSON.stringify({ rating, comment: document.getElementById('ccReviewText').value }) });
          toast('Review saved', ''); return loadReviews();
        case 'del-review':
          if (!confirm('Delete your review?')) return;
          await api(`/api/courses/reviews/${id}`, { method: 'DELETE' }); return loadReviews();
        case 'ask':
          btn.disabled = true;
          await api(`/api/courses/${courseId}/questions`, { method: 'POST',
            body: JSON.stringify({ question: document.getElementById('ccQuestionText').value }) });
          toast('Question posted'); return loadQA();
        case 'toggle-reply':
          return document.getElementById('ccReply' + id).classList.toggle('open');
        case 'answer': {
          const box = document.querySelector(`#ccReply${id} .cc-reply-text`);
          btn.disabled = true;
          await api(`/api/courses/questions/${id}/answers`, { method: 'POST', body: JSON.stringify({ answer: box.value }) });
          toast('Answer posted'); return loadQA();
        }
        case 'del-q':
          if (!confirm('Delete this question and its answers?')) return;
          await api(`/api/courses/questions/${id}`, { method: 'DELETE' }); return loadQA();
        case 'del-a':
          if (!confirm('Delete this answer?')) return;
          await api(`/api/courses/answers/${id}`, { method: 'DELETE' }); return loadQA();
      }
    } catch (err) {
      btn.disabled = false;
      toast(err.message, 'error');
    }
  }

  ['previewReviews', 'previewDiscussion'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', onClick));

 return { open(id, cb) { courseId = id; onSummary = cb || null; loadReviews(); loadQA(); } };
})();