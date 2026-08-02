/* -------------------------- 1. GLOBAL STATE -------------------------- */
let userCurrency = 'USD';
let exchangeRates = {};
let currentUser = null;
let allCourses = [];

let activeTypeFilter = 'all';   // all | free | premium | video | featured | trending | bestselling | new | saved
let activeCategory = 'all';
let activeLevel = 'all';
let activeSort = 'newest';
let searchQuery = '';

const PAGE_SIZE = 9;
let visibleCount = PAGE_SIZE;

let bookmarkedIds = new Set(JSON.parse(localStorage.getItem('ci_bookmarked_courses') || '[]'));
let followedInstructors = new Set(JSON.parse(localStorage.getItem('ci_followed_instructors') || '[]'));
let recentlyViewedIds = JSON.parse(localStorage.getItem('ci_recently_viewed') || '[]');

let currentFlagCourseId = null;
let wizardCurrentStep = 1;

// Muted category-color system (mirrors the Knowledge Hub's CATEGORY_META pattern).
// Any course.category value not listed here still renders fine with a neutral dot.
const CATEGORY_META = {
  'technology': { label: 'Technology', color: '#4a6fa5' },
  'business': { label: 'Business', color: '#c9971f' },
  'design': { label: 'Design', color: '#8a6bb1' },
  'marketing': { label: 'Marketing', color: '#b17a5b' },
  'personal-growth': { label: 'Personal Growth', color: '#5a8d7d' },
  'health': { label: 'Health & Wellness', color: '#7d8f4a' },
  'photography': { label: 'Photography', color: '#5b8a9a' },
  'music': { label: 'Music', color: '#a15b7d' }
};

/* -------------------------- 2. UTILITIES -------------------------- */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function showLoading() { document.body.classList.add('loading'); }
function hideLoading() { document.body.classList.remove('loading'); }

function closeAllPopovers() {
  document.querySelectorAll('.dropdown-panel').forEach(p => p.hidden = true);
  document.querySelectorAll('.card-menu__dropdown').forEach(d => d.hidden = true);
}

document.addEventListener('click', closeAllPopovers);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeAllPopovers();
  closeFlagModal();
  closePreviewModal();
  closeUploadModal();
});

/* -------------------------- 3. CURRENCY -------------------------- */
async function detectUserCurrency() {
  try {
    const response = await fetch('https://ipapi.co/currency/');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const currency = await response.text();
    if (currency && currency.trim().length === 3) userCurrency = currency.trim();
  } catch (error) {
    userCurrency = 'USD';
  }
  updateCurrencySelector();
  await loadExchangeRates();
}

async function loadExchangeRates() {
  try {
    const response = await fetch('/api/currency-rates', { credentials: 'include', headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) throw new Error('Response is not JSON');
    const data = await response.json();
    if (data && data.rates) {
      exchangeRates = {
        USD: 1,
        NGN: data.rates.NGN || 1500, EUR: data.rates.EUR || 0.92, GBP: data.rates.GBP || 0.79,
        CAD: data.rates.CAD || 1.37, AUD: data.rates.AUD || 1.50, JPY: data.rates.JPY || 150,
        CNY: data.rates.CNY || 7.2, INR: data.rates.INR || 83, BRL: data.rates.BRL || 5.1,
        MXN: data.rates.MXN || 17, AED: data.rates.AED || 3.67, SAR: data.rates.SAR || 3.75,
        CHF: data.rates.CHF || 0.91, SEK: data.rates.SEK || 10.5, NOK: data.rates.NOK || 10.8,
        DKK: data.rates.DKK || 6.9, PLN: data.rates.PLN || 4.0, TRY: data.rates.TRY || 32,
        RUB: data.rates.RUB || 92, KRW: data.rates.KRW || 1350, SGD: data.rates.SGD || 1.35,
        HKD: data.rates.HKD || 7.82, NZD: data.rates.NZD || 1.65, ZMW: data.rates.ZMW || 25,
        TZS: data.rates.TZS || 2600, UGX: data.rates.UGX || 3800, RWF: data.rates.RWF || 1300,
        XOF: data.rates.XOF || 610, XAF: data.rates.XAF || 610, ETB: data.rates.ETB || 56,
        MAD: data.rates.MAD || 10, EGP: data.rates.EGP || 48, KES: data.rates.KES || 130,
        GHS: data.rates.GHS || 15, ZAR: data.rates.ZAR || 19
      };
    }
  } catch (error) {
    console.error('Error loading exchange rates:', error);
  } finally {
    updateAllPrices();
  }
}

function formatCurrency(amountNGN, currency) {
  if (!amountNGN && amountNGN !== 0) return `${currency} 0.00`;
  try {
    const amount = parseFloat(amountNGN);
    if (currency === 'NGN') {
      return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    }
    if (exchangeRates && exchangeRates.NGN && exchangeRates[currency]) {
      const usd = amount / exchangeRates.NGN;
      const converted = usd * exchangeRates[currency];
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(converted);
    }
    const fallbackRates = { USD: 1500, EUR: 1650, GBP: 1900, KES: 11, GHS: 100, ZAR: 80, CAD: 1100, AUD: 1000, JPY: 10, CNY: 210 };
    const rate = fallbackRates[currency] || 1500;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / rate);
  } catch (error) {
    return `${currency} ${parseFloat(amountNGN).toFixed(2)}`;
  }
}

function updateAllPrices() {
  document.querySelectorAll('[data-original-price]').forEach(el => {
    const ngn = parseFloat(el.getAttribute('data-original-price'));
    if (!isNaN(ngn)) {
      el.textContent = formatCurrency(ngn, userCurrency);
      el.title = `${ngn.toLocaleString()} NGN`;
    }
  });
  const label = document.getElementById('currentCurrencyLabel');
  if (label) label.textContent = userCurrency;
}

function updateCurrencySelector() {
  const sel = document.getElementById('currencySelect');
  if (sel) sel.value = userCurrency;
  const label = document.getElementById('currentCurrencyLabel');
  if (label) label.textContent = userCurrency;
}

function togglePreferences(event) {
  event.stopPropagation();
  const panel = document.getElementById('preferencesPopover');
  const wasHidden = panel.hidden;
  closeAllPopovers();
  panel.hidden = !wasHidden;
}

/* -------------------------- 4. AUTH / USER -------------------------- */
async function loadUser() {
  try {
    const res = await fetch('/api/me');
    const user = await res.json();
    currentUser = user || null;

    const headerAuthButtons = document.getElementById('headerAuthButtons');
    const teachBanner = document.getElementById('teachBanner');
    const notifBtn = document.getElementById('notifBtn');
    const adminNavLink = document.getElementById('adminNavLink');

    if (user) {
      headerAuthButtons.innerHTML = `
        <span class="welcome-text" style="display:inline;">
          Welcome, ${escapeHtml(user.username || 'User')}
          ${user.role === 'admin' ? '<a href="admin-dashboard.html" class="admin-badge">Admin</a>' : ''}
        </span>
        <a href="#" class="btn-login" onclick="logout(); return false;">Logout</a>
      `;
      teachBanner.hidden = false;
      notifBtn.hidden = false;
      adminNavLink.hidden = user.role !== 'admin';
    } else {
      headerAuthButtons.innerHTML = `
        <a href="login.html" class="btn-login">Login</a>
        <a href="signup.html" class="btn-signup">Sign Up</a>
      `;
      teachBanner.hidden = true;
      notifBtn.hidden = true;
      adminNavLink.hidden = true;
    }
  } catch (error) {
    console.error('Error loading user:', error);
  }
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    window.location.reload();
  }
}

function toggleNotifications(event) {
  event.stopPropagation();
  const panel = document.getElementById('notifDropdown');
  const wasHidden = panel.hidden;
  closeAllPopovers();
  panel.hidden = !wasHidden;
}

/* -------------------------- 5. HELPERS FOR COURSE DISPLAY -------------------------- */
function getCategoryMeta(rawCategory) {
  if (!rawCategory) return null;
  const slug = String(rawCategory).toLowerCase().trim().replace(/\s+/g, '-');
  return CATEGORY_META[slug] || { label: rawCategory, color: '#8f8a7c' };
}

function getFormatLabel(contentType, isVideo) {
  if (isVideo) return 'Video Course';
  switch ((contentType || '').toLowerCase()) {
    case 'book': return 'Book / PDF';
    case 'document': return 'Document';
    case 'presentation': return 'Presentation';
    default: return 'Course';
  }
}

function getFormatIcon(contentType, isVideo) {
  if (isVideo) return 'fa-video';
  switch ((contentType || '').toLowerCase()) {
    case 'book': return 'fa-book';
    case 'document': return 'fa-file-alt';
    case 'presentation': return 'fa-chalkboard';
    default: return 'fa-graduation-cap';
  }
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function isRecentlyAdded(course) {
  if (!course.created_at) return false;
  const created = new Date(course.created_at);
  if (isNaN(created)) return false;
  return (Date.now() - created.getTime()) < 30 * 24 * 60 * 60 * 1000;
}

/* -------------------------- 6. LOAD & ENRICH COURSES -------------------------- */
async function loadCourses() {
  try {
    showLoading();

    const [coursesRes, userRes] = await Promise.all([fetch('/api/courses'), fetch('/api/me')]);
    const rawCourses = await coursesRes.json();
    const user = await userRes.json();
    currentUser = user || currentUser;

    let usdRate = 1500;
    try {
      const rateRes = await fetch('/api/currency-rates');
      const rateData = await rateRes.json();
      if (rateData.success && rateData.rates && rateData.rates.NGN) usdRate = rateData.rates.NGN;
    } catch (e) { /* keep fallback */ }

    let flaggedSet = new Set();
    let purchasedSet = new Set();
    if (user) {
      try {
        const flaggedRes = await fetch('/api/courses/flagged-by-me');
        const flagged = await flaggedRes.json();
        (flagged || []).forEach(c => flaggedSet.add(Number(c.id)));
      } catch (e) { /* ignore */ }
      try {
        const purchasedRes = await fetch('/api/my-courses');
        const purchased = await purchasedRes.json();
        (purchased || []).forEach(c => purchasedSet.add(Number(c.id)));
      } catch (e) { /* ignore */ }
    }

    const isAdmin = user && user.role === 'admin';

    allCourses = (rawCourses || []).map(course => {
      const fileUrl = course.file_url || course.download_url || '';
      const fileName = course.file_path || '';
      const isVideo = !!(
        (fileUrl && fileUrl.match(/\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|mpg|mpeg)$/i)) ||
        (fileName && fileName.match(/\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|mpg|mpeg)$/i)) ||
        course.content_type === 'video'
      );
      const isFree = course.price === 0 || course.type === 'free' || course.type === 'Free';
      const isPremium = course.price > 0 && !isFree;
      const hasAccess = isFree || purchasedSet.has(Number(course.id));
      const isOwner = user && Number(course.user_id) === Number(user.id);
      const isUploadedByAdmin = course.user_role === 'admin';
      const showFlagButton = !!(user && !isUploadedByAdmin && !isOwner && user.role !== 'admin');
      const canDelete = !!(user && (user.role === 'admin' || Number(user.id) === Number(course.user_id)));

      let thumbnailSrc = course.thumbnail_url || course.thumbnail_path;
      if (!thumbnailSrc) {
        const colors = ['f5f3ee', 'e9e5dc', 'f0ece0'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const cleanTitle = (course.title || 'Course').substring(0, 25).replace(/[^\w\s]/gi, '');
        thumbnailSrc = `https://placehold.co/400x220/${color}/2b2b28?text=${encodeURIComponent(cleanTitle)}&font=montserrat`;
      }

      const hasProgress = typeof course.progress_percent === 'number' && course.progress_percent >= 0;
      const isCompleted = hasProgress && course.progress_percent >= 100;
      const isInProgress = hasProgress && course.progress_percent > 0 && course.progress_percent < 100;

      return {
        ...course,
        id: Number(course.id),
        isVideo, isFree, isPremium, hasAccess, isOwner, showFlagButton, canDelete,
        hasFlagged: flaggedSet.has(Number(course.id)),
        thumbnailSrc,
        safeTitle: escapeHtml(course.title),
        safeDescription: escapeHtml(course.description || 'No description available'),
        safeAuthor: escapeHtml(course.author || ''),
        usdPrice: isPremium ? Math.max(0.5, Math.round((course.price / usdRate) * 100) / 100) : 0,
        hasProgress, isCompleted, isInProgress
      };
    });

    populateCategoryOptions(allCourses);
    visibleCount = PAGE_SIZE;
    renderCourses();
    renderRecentlyViewed();

    const heroCount = document.getElementById('heroCourseCount');
    if (heroCount) heroCount.textContent = allCourses.length;

    hideLoading();
  } catch (error) {
    console.error('Error loading courses:', error);
    document.getElementById('coursesGrid').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>We couldn't load courses</h3>
        <p>Please check your connection and try again.</p>
        <button onclick="loadCourses()" class="btn-primary btn-inline"><i class="fas fa-redo"></i> Retry</button>
      </div>`;
    hideLoading();
  }
}

function populateCategoryOptions(courses) {
  const select = document.getElementById('categorySelect');
  if (!select) return;
  const current = select.value || 'all';
  const categories = new Set();
  courses.forEach(c => { if (c.category) categories.add(String(c.category).toLowerCase().trim()); });

  select.innerHTML = '<option value="all">All Categories</option>' +
    Array.from(categories).sort().map(slug => {
      const meta = getCategoryMeta(slug);
      return `<option value="${escapeHtml(slug)}">${escapeHtml(meta.label)}</option>`;
    }).join('');
  select.value = Array.from(select.options).some(o => o.value === current) ? current : 'all';
}

/* -------------------------- 7. FILTER / SORT / RENDER -------------------------- */
function courseMatchesTypeFilter(course, filter) {
  switch (filter) {
    case 'all': return true;
    case 'free': return course.isFree;
    case 'premium': return course.isPremium;
    case 'video': return course.isVideo;
    case 'featured': return course.featured === true;
    case 'trending': return course.trending === true;
    case 'bestselling': return course.bestselling === true;
    case 'new': return isRecentlyAdded(course);
    case 'saved': return bookmarkedIds.has(course.id);
    default: return true;
  }
}

function isChipDataAvailable(filter) {
  if (['all', 'free', 'premium', 'video', 'saved'].includes(filter)) return true;
  return allCourses.some(c => courseMatchesTypeFilter(c, filter));
}

function getFilteredSortedCourses() {
  let list = allCourses.filter(c => {
    if (!courseMatchesTypeFilter(c, activeTypeFilter)) return false;
    if (activeCategory !== 'all' && String(c.category || '').toLowerCase().trim() !== activeCategory) return false;
    if (activeLevel !== 'all' && String(c.level || '').toLowerCase().trim() !== activeLevel) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = `${c.title || ''} ${c.description || ''} ${c.author || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  list.sort((a, b) => {
    switch (activeSort) {
      case 'popular': return (b.student_count || 0) - (a.student_count || 0) || b.id - a.id;
      case 'rating': return (b.rating || 0) - (a.rating || 0) || b.id - a.id;
      case 'price-low': return (a.price || 0) - (b.price || 0);
      case 'price-high': return (b.price || 0) - (a.price || 0);
      case 'newest':
      default: {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : a.id;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : b.id;
        return bDate - aDate;
      }
    }
  });

  return list;
}

function renderCourses() {
  const grid = document.getElementById('coursesGrid');
  const countEl = document.getElementById('courseCount');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const filtered = getFilteredSortedCourses();

  countEl.textContent = `${filtered.length} Course${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    const noneAtAll = allCourses.length === 0;
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas ${noneAtAll ? 'fa-book-open' : 'fa-magnifying-glass'}"></i>
        <h3>${noneAtAll ? 'No courses available yet' : 'No courses match those filters'}</h3>
        <p>${noneAtAll ? 'Check back soon for new course offerings.' : 'Try a different search term or clear a filter.'}</p>
        ${!noneAtAll ? '<button class="btn-secondary btn-inline" onclick="resetAllFilters()">Clear filters</button>' : ''}
      </div>`;
    loadMoreBtn.hidden = true;
    return;
  }

  const slice = filtered.slice(0, visibleCount);
  grid.innerHTML = slice.map(courseCardHTML).join('');
  loadMoreBtn.hidden = visibleCount >= filtered.length;
}

function resetAllFilters() {
  activeTypeFilter = 'all';
  activeCategory = 'all';
  activeLevel = 'all';
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('categorySelect').value = 'all';
  document.getElementById('levelSelect').value = 'all';
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
  visibleCount = PAGE_SIZE;
  renderCourses();
}

/* -------------------------- 8. CARD MARKUP -------------------------- */
function courseCardHTML(course) {
  const categoryMeta = getCategoryMeta(course.category);
  const eyebrowParts = [];
  if (categoryMeta) eyebrowParts.push(`<span class="category-dot" style="background:${categoryMeta.color}"></span>${escapeHtml(categoryMeta.label)}`);
  if (course.level) eyebrowParts.push(escapeHtml(course.level));
  eyebrowParts.push(getFormatLabel(course.content_type, course.isVideo));
  const eyebrow = eyebrowParts.join(' &middot; ');

  const ratingRow = (course.rating)
    ? `<div class="rating-row"><span class="stars">${'★'.repeat(Math.round(course.rating))}${'☆'.repeat(5 - Math.round(course.rating))}</span> ${Number(course.rating).toFixed(1)}
        ${course.review_count ? `<span class="rv-count">(${course.review_count})</span>` : ''}
        ${course.student_count ? `<span class="rv-count">&middot; ${course.student_count.toLocaleString()} students</span>` : ''}</div>`
    : '';

  const tagsRow = Array.isArray(course.tags) && course.tags.length
    ? `<div class="tag-pills">${course.tags.slice(0, 3).map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}${course.tags.length > 3 ? `<span class="tag-pill">+${course.tags.length - 3}</span>` : ''}</div>`
    : '';

  let priceBlock;
  if (course.hasAccess && course.isPremium) {
    priceBlock = `<div class="price-block is-owned"><i class="fas fa-check-circle"></i> ${course.isCompleted ? 'Completed' : 'Enrolled'}</div>`;
  } else if (course.isFree) {
    priceBlock = `<div class="price-block is-free">Free</div>`;
  } else {
    priceBlock = `<div class="price-block" data-original-price="${course.price}">…</div>`;
  }

  let ctaLabel, ctaOnclick;
  if (course.hasAccess) {
    if (course.isInProgress) ctaLabel = course.isVideo ? 'Continue Watching' : 'Continue Learning';
    else if (course.isCompleted) ctaLabel = course.isVideo ? 'Watch Again' : 'Download Again';
    else ctaLabel = course.isVideo ? 'Watch Now' : 'Download Now';
    ctaOnclick = course.isVideo ? `watchVideo(${course.id})` : `handleDownload(${course.id})`;
  } else {
    ctaLabel = 'Enroll Now';
    ctaOnclick = `initiatePayment(${course.id})`;
  }

  const progressRail = course.hasProgress
    ? `<div class="progress-rail"><div class="progress-rail__fill" style="width:${course.progress_percent}%"></div></div>`
    : '';

  const playOverlay = course.isVideo ? `<button class="preview-play" onclick="openPreviewModal(${course.id})" aria-label="Preview"><i class="fas fa-play"></i></button>` : '';

  const menuItems = [
    `<button type="button" onclick="openPreviewModal(${course.id})"><i class="fas fa-eye"></i> Quick View</button>`,
    `<button type="button" onclick="shareCourse(${course.id})"><i class="fas fa-share-alt"></i> Share</button>`
  ];
  if (course.isPremium && !course.hasAccess) menuItems.push(`<button type="button" onclick="checkAccess(${course.id})"><i class="fas fa-shield-halved"></i> Verify Access</button>`);
  if (course.showFlagButton) menuItems.push(`<button type="button" onclick="openFlagModal(${course.id})" ${course.hasFlagged ? 'disabled' : ''}><i class="fas fa-flag"></i> ${course.hasFlagged ? 'Reported' : 'Report'}</button>`);
  if (course.canDelete) menuItems.push(`<button type="button" class="danger" onclick="deleteCourse(${course.id})"><i class="fas fa-trash"></i> Delete</button>`);

  return `
    <article class="course-card" data-course-id="${course.id}">
      <div class="course-card__media">
        <img src="${course.thumbnailSrc}" alt="${course.safeTitle}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x220/f0ece0/2b2b28?text=Course&font=montserrat'">
        <span class="format-icon"><i class="fas ${getFormatIcon(course.content_type, course.isVideo)}"></i></span>
        <button class="bookmark-btn ${bookmarkedIds.has(course.id) ? 'is-saved' : ''}" data-bookmark-id="${course.id}" onclick="toggleBookmark(${course.id})" aria-label="Save course">
          <i class="${bookmarkedIds.has(course.id) ? 'fas' : 'far'} fa-bookmark"></i>
        </button>
        ${playOverlay}
        ${progressRail}
      </div>
      <div class="course-card__body">
        <p class="eyebrow">${eyebrow}${course.isCompleted ? ' &middot; <span class="completed-tag">✓ Completed</span>' : ''}</p>
        <h3 class="course-card__title">${course.safeTitle}</h3>
        <p class="course-card__desc">${course.safeDescription}</p>
        ${ratingRow}
        ${tagsRow}
        <div class="byline">
          <div class="byline__avatar">${getInitials(course.author)}</div>
          <div class="byline__info">
            <span class="byline__name">${course.safeAuthor || 'Core Insight'}</span>
            <span class="byline__meta">${course.user_role === 'admin' ? 'Verified Instructor' : 'Instructor'}</span>
          </div>
          ${course.safeAuthor ? `<button type="button" class="follow-btn ${followedInstructors.has(course.author) ? 'is-following' : ''}" data-follow-author="${escapeHtml(course.author)}" onclick="toggleFollow(this)">${followedInstructors.has(course.author) ? 'Following' : 'Follow'}</button>` : ''}
        </div>
        <div class="course-card__footer">
          ${priceBlock}
          <div class="course-card__actions">
            <button type="button" class="btn-primary" onclick="${ctaOnclick}">${ctaLabel}</button>
            <div class="card-menu">
              <button type="button" class="icon-btn-ghost" onclick="toggleCardMenu(this, event)" aria-label="More options"><i class="fas fa-ellipsis"></i></button>
              <div class="card-menu__dropdown" hidden>${menuItems.join('')}</div>
            </div>
          </div>
        </div>
      </div>
    </article>`;
}

/* -------------------------- 9. SEARCH / SELECTS / CHIPS / PAGINATION -------------------------- */
function setupSearch() {
  const input = document.getElementById('searchInput');
  let debounceTimer;
  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      visibleCount = PAGE_SIZE;
      renderCourses();
    }, 250);
  });
}

function setupSelects() {
  document.getElementById('categorySelect').addEventListener('change', (e) => {
    activeCategory = e.target.value;
    visibleCount = PAGE_SIZE;
    renderCourses();
  });
  document.getElementById('levelSelect').addEventListener('change', (e) => {
    activeLevel = e.target.value;
    visibleCount = PAGE_SIZE;
    renderCourses();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    activeSort = e.target.value;
    renderCourses();
  });
  document.getElementById('currencySelect').addEventListener('change', (e) => {
    userCurrency = e.target.value;
    updateAllPrices();
  });
}

function setupChips() {
  document.getElementById('chipRow').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    const filter = btn.dataset.filter;

    if (!isChipDataAvailable(filter)) {
      const labels = { featured: 'Featured', trending: 'Trending', bestselling: 'Best-selling', new: 'New' };
      showToast(`${labels[filter] || 'This'} collection is coming soon — check back later!`, 'info');
      return;
    }

    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTypeFilter = filter;
    visibleCount = PAGE_SIZE;
    renderCourses();
  });
}

function setupLoadMore() {
  document.getElementById('loadMoreBtn').addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderCourses();
  });
}

/* -------------------------- 10. CARD MENU / BOOKMARK / FOLLOW / SHARE -------------------------- */
function toggleCardMenu(btn, event) {
  event.stopPropagation();
  const dropdown = btn.nextElementSibling;
  const wasHidden = dropdown.hidden;
  closeAllPopovers();
  dropdown.hidden = !wasHidden;
}

function toggleBookmark(courseId) {
  if (bookmarkedIds.has(courseId)) {
    bookmarkedIds.delete(courseId);
    showToast('Removed from saved courses', 'info');
  } else {
    bookmarkedIds.add(courseId);
    showToast('Saved to your courses', 'success');
  }
  localStorage.setItem('ci_bookmarked_courses', JSON.stringify(Array.from(bookmarkedIds)));

  document.querySelectorAll(`[data-bookmark-id="${courseId}"]`).forEach(btn => {
    const saved = bookmarkedIds.has(courseId);
    btn.classList.toggle('is-saved', saved);
    const icon = btn.querySelector('i');
    if (icon) icon.className = `${saved ? 'fas' : 'far'} fa-bookmark`;
  });

  if (activeTypeFilter === 'saved') renderCourses();
}

function toggleFollow(btnEl) {
  const author = btnEl.dataset.followAuthor;
  if (!author) return;
  if (followedInstructors.has(author)) {
    followedInstructors.delete(author);
    showToast(`Unfollowed ${author}`, 'info');
  } else {
    followedInstructors.add(author);
    showToast(`Following ${author}`, 'success');
  }
  localStorage.setItem('ci_followed_instructors', JSON.stringify(Array.from(followedInstructors)));

  document.querySelectorAll(`[data-follow-author="${CSS.escape(author)}"]`).forEach(btn => {
    const following = followedInstructors.has(author);
    btn.classList.toggle('is-following', following);
    btn.textContent = following ? 'Following' : 'Follow';
  });
}

async function shareCourse(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  if (!course) return;
  const shareUrl = `${location.origin}${location.pathname}?course=${courseId}`;
  const shareData = { title: course.title, text: `Check out "${course.title}" on Core Insight`, url: shareUrl };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied to clipboard!', 'success');
    }
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Could not share this course.', 'error');
  }
}

/* -------------------------- 11. RECENTLY VIEWED -------------------------- */
function trackRecentlyViewed(courseId) {
  recentlyViewedIds = [courseId, ...recentlyViewedIds.filter(id => id !== courseId)].slice(0, 8);
  localStorage.setItem('ci_recently_viewed', JSON.stringify(recentlyViewedIds));
  renderRecentlyViewed();
}

function renderRecentlyViewed() {
  const section = document.getElementById('recentlyViewedSection');
  const row = document.getElementById('recentlyViewedRow');
  const items = recentlyViewedIds.map(id => allCourses.find(c => c.id === id)).filter(Boolean);
  if (!items.length) { section.hidden = true; return; }
  section.hidden = false;
  row.innerHTML = items.map(c => `
    <div class="rv-card" onclick="openPreviewModal(${c.id})">
      <img src="${c.thumbnailSrc}" alt="${c.safeTitle}" loading="lazy">
      <p>${c.safeTitle}</p>
    </div>`).join('');
}

/* -------------------------- 12. PREVIEW / QUICK VIEW MODAL -------------------------- */
function openPreviewModal(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  if (!course) return;
  trackRecentlyViewed(courseId);

  const categoryMeta = getCategoryMeta(course.category);
  const eyebrowParts = [];
  if (categoryMeta) eyebrowParts.push(`<span class="category-dot" style="background:${categoryMeta.color}"></span>${escapeHtml(categoryMeta.label)}`);
  if (course.level) eyebrowParts.push(escapeHtml(course.level));
  eyebrowParts.push(getFormatLabel(course.content_type, course.isVideo));

  document.getElementById('previewMedia').innerHTML = `
    <img src="${course.thumbnailSrc}" alt="${course.safeTitle}">
    ${course.isVideo ? `<button class="preview-play" style="opacity:1;" onclick="watchVideo(${course.id})" aria-label="Play"><i class="fas fa-play"></i></button>` : ''}`;
  document.getElementById('previewEyebrow').innerHTML = eyebrowParts.join(' &middot; ');
  document.getElementById('previewTitle').textContent = course.title;

  const ratingEl = document.getElementById('previewRating');
  if (course.rating) {
    ratingEl.hidden = false;
    ratingEl.innerHTML = `<span class="stars">${'★'.repeat(Math.round(course.rating))}${'☆'.repeat(5 - Math.round(course.rating))}</span> ${Number(course.rating).toFixed(1)}
      ${course.review_count ? `<span class="rv-count">(${course.review_count} reviews)</span>` : ''}
      ${course.student_count ? `<span class="rv-count">&middot; ${course.student_count.toLocaleString()} students</span>` : ''}`;
  } else {
    ratingEl.hidden = true;
  }

  document.getElementById('previewByline').innerHTML = `
    <div class="byline__avatar">${getInitials(course.author)}</div>
    <div class="byline__info">
      <span class="byline__name">${course.safeAuthor || 'Core Insight'}</span>
      <span class="byline__meta">${course.user_role === 'admin' ? 'Verified Instructor' : 'Instructor'}</span>
    </div>
    ${course.safeAuthor ? `<button type="button" class="follow-btn ${followedInstructors.has(course.author) ? 'is-following' : ''}" data-follow-author="${escapeHtml(course.author)}" onclick="toggleFollow(this)">${followedInstructors.has(course.author) ? 'Following' : 'Follow'}</button>` : ''}`;

  document.getElementById('previewOverview').innerHTML = `
    <p>${course.safeDescription}</p>
    <div class="meta-grid">
      ${course.lesson_count ? `<div><strong>${course.lesson_count}</strong>Lessons</div>` : ''}
      ${course.duration ? `<div><strong>${escapeHtml(String(course.duration))}</strong>Duration</div>` : ''}
      <div><strong>${getFormatLabel(course.content_type, course.isVideo)}</strong>Format</div>
      ${course.level ? `<div><strong>${escapeHtml(course.level)}</strong>Level</div>` : ''}
      ${course.updated_at ? `<div><strong>${new Date(course.updated_at).toLocaleDateString()}</strong>Last updated</div>` : ''}
    </div>
    ${Array.isArray(course.learning_outcomes) && course.learning_outcomes.length ? `<p><strong>What you'll learn</strong></p><ul>${course.learning_outcomes.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : `<p class="stub-note"><i class="fas fa-graduation-cap"></i> Learning outcomes for this course will be added soon.</p>`}
    ${Array.isArray(course.requirements) && course.requirements.length ? `<p><strong>Requirements</strong></p><ul>${course.requirements.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : ''}
  `;

  const reviewsEl = document.getElementById('previewReviews');
  if (Array.isArray(course.reviews) && course.reviews.length) {
    reviewsEl.innerHTML = course.reviews.map(r => `<p><strong>${escapeHtml(r.author || 'Learner')}:</strong> ${escapeHtml(r.text || '')}</p>`).join('');
  } else {
    reviewsEl.innerHTML = `<p class="stub-note"><i class="fas fa-star"></i> No reviews yet — be the first to review this course after enrolling.</p>`;
  }

  let footerHtml;
  if (course.hasAccess && course.isPremium) {
    footerHtml = `<div class="price-block is-owned"><i class="fas fa-check-circle"></i> ${course.isCompleted ? 'Completed' : 'Enrolled'}</div>`;
  } else if (course.isFree) {
    footerHtml = `<div class="price-block is-free">Free</div>`;
  } else {
    footerHtml = `<div class="price-block" data-original-price="${course.price}">…</div>`;
  }
  let ctaLabel, ctaOnclick;
  if (course.hasAccess) {
    ctaLabel = course.isVideo ? (course.isInProgress ? 'Continue Watching' : 'Watch Now') : (course.isInProgress ? 'Continue Learning' : 'Download Now');
    ctaOnclick = course.isVideo ? `watchVideo(${course.id})` : `handleDownload(${course.id})`;
  } else {
    ctaLabel = 'Enroll Now';
    ctaOnclick = `initiatePayment(${course.id})`;
  }
  document.getElementById('previewFooter').innerHTML = `${footerHtml}<button type="button" class="btn-primary" onclick="${ctaOnclick}">${ctaLabel}</button>`;
  updateAllPrices();

  switchPreviewTab('overview');
  document.getElementById('previewModal').classList.add('is-open');
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.remove('is-open');
}

function switchPreviewTab(tab) {
  document.querySelectorAll('.modal-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.dataset.panel !== tab);
}

function setupModalTabs() {
  document.querySelectorAll('.modal-tabs').forEach(nav => {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (btn) switchPreviewTab(btn.dataset.tab);
    });
  });
}

/* -------------------------- 13. UPLOAD WIZARD (Teach on Core Insight) -------------------------- */
function openUploadModal() {
  if (!currentUser) {
    showToast('Please login to upload a course.', 'error');
    window.location.href = 'login.html';
    return;
  }
  wizardCurrentStep = 1;
  showWizardStep(1);

  const isAdmin = currentUser.role === 'admin';
  document.getElementById('wizPricingAdmin').hidden = !isAdmin;
  document.getElementById('wizPricingInfo').hidden = isAdmin;

  document.getElementById('uploadModal').classList.add('is-open');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('is-open');
}

function showWizardStep(step) {
  document.querySelectorAll('.wizard-panel').forEach(p => { p.hidden = (parseInt(p.dataset.panel, 10) !== step); });
  document.querySelectorAll('.wizard-steps .step').forEach(s => {
    const n = parseInt(s.dataset.step, 10);
    s.classList.toggle('active', n === step);
    s.classList.toggle('complete', n < step);
  });
  document.getElementById('wizardBackBtn').style.visibility = step === 1 ? 'hidden' : 'visible';
  document.getElementById('wizardNextBtn').hidden = step === 4;
  document.getElementById('wizardPublishBtn').hidden = step !== 4;
  document.getElementById('wizardDraftBtn').hidden = step === 4;
  if (step === 4) populateWizardReview();
}

function validateWizardStep(step) {
  if (step === 1) {
    const title = document.getElementById('wizTitle').value.trim();
    const desc = document.getElementById('wizDescription').value.trim();
    if (!title || !desc) { showToast('Please fill in the title and description.', 'error'); return false; }
    return true;
  }
  if (step === 2) {
    if (!document.getElementById('wizThumbnail').files[0]) { showToast('Please upload a thumbnail image.', 'error'); return false; }
    if (!document.getElementById('wizFile').files[0]) { showToast('Please upload a course file.', 'error'); return false; }
    return true;
  }
  if (step === 3) {
    if (currentUser && currentUser.role === 'admin') {
      const activeType = document.querySelector('.book-type-btn.active');
      if (activeType && activeType.dataset.type === 'paid') {
        const price = document.getElementById('wizPrice').value;
        if (!price || parseFloat(price) <= 0) { showToast('Please enter a valid price.', 'error'); return false; }
      }
    }
    return true;
  }
  return true;
}

function nextWizardStep() {
  if (!validateWizardStep(wizardCurrentStep)) return;
  if (wizardCurrentStep < 4) { wizardCurrentStep++; showWizardStep(wizardCurrentStep); }
}

function prevWizardStep() {
  if (wizardCurrentStep > 1) { wizardCurrentStep--; showWizardStep(wizardCurrentStep); }
}

function populateWizardReview() {
  const title = document.getElementById('wizTitle').value.trim();
  const desc = document.getElementById('wizDescription').value.trim();
  const author = document.getElementById('wizAuthor').value.trim();
  const contentType = document.querySelector('input[name="content_type"]:checked').value;
  const activeType = document.querySelector('.book-type-btn.active');
  const isPaid = currentUser.role === 'admin' && activeType && activeType.dataset.type === 'paid';
  const price = isPaid ? document.getElementById('wizPrice').value : null;

  document.getElementById('wizardReview').innerHTML = `
    <div><strong>Title:</strong> ${escapeHtml(title)}</div>
    <div><strong>Description:</strong> ${escapeHtml(desc.slice(0, 140))}${desc.length > 140 ? '…' : ''}</div>
    ${author ? `<div><strong>Author:</strong> ${escapeHtml(author)}</div>` : ''}
    <div><strong>Type:</strong> ${escapeHtml(contentType)}</div>
    <div><strong>Pricing:</strong> ${isPaid ? `₦${escapeHtml(price || '0')}` : 'Free'}</div>`;
}

function setupBookTypeSelector() {
  document.querySelectorAll('.book-type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.book-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const priceField = document.getElementById('wizPriceField');
      const priceInput = document.getElementById('wizPrice');
      if (btn.dataset.type === 'paid') {
        priceField.hidden = false;
        priceInput.required = true;
      } else {
        priceField.hidden = true;
        priceInput.required = false;
      }
    });
  });
}

function setupImagePreview() {
  const input = document.getElementById('wizThumbnail');
  const preview = document.getElementById('thumbnailPreview');
  input.addEventListener('change', (e) => {
    preview.innerHTML = '';
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        preview.innerHTML = `
          <div class="image-preview">
            <img src="${event.target.result}" alt="Thumbnail preview">
            <button type="button" class="remove-preview" onclick="document.getElementById('thumbnailPreview').innerHTML='';document.getElementById('wizThumbnail').value='';"><i class="fas fa-times"></i></button>
          </div>`;
      };
      reader.readAsDataURL(file);
    }
  });
}

function handleSaveDraft() {
  showToast('📝 Draft saving is coming soon — please publish for now.', 'info');
}

document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateWizardStep(1) || !validateWizardStep(2) || !validateWizardStep(3)) return;

  if (!currentUser) {
    showToast('Please login to upload a course.', 'error');
    window.location.href = 'login.html';
    return;
  }

  const formData = new FormData();
  formData.append('title', document.getElementById('wizTitle').value);
  formData.append('description', document.getElementById('wizDescription').value);
  formData.append('author', document.getElementById('wizAuthor').value);

  const contentType = document.querySelector('input[name="content_type"]:checked');
  if (contentType) formData.append('content_type', contentType.value);

  const thumbnailFile = document.getElementById('wizThumbnail').files[0];
  if (thumbnailFile) formData.append('thumbnail', thumbnailFile);

  const fileFile = document.getElementById('wizFile').files[0];
  if (fileFile) formData.append('file', fileFile);

  const activeType = document.querySelector('.book-type-btn.active');
  if (currentUser.role === 'admin' && activeType && activeType.dataset.type === 'paid') {
    const price = document.getElementById('wizPrice').value;
    if (price && parseFloat(price) > 0) formData.append('price', price);
  }

  try {
    showLoading();
    const response = await fetch('/api/courses', { method: 'POST', body: formData });
    const result = await response.json();

    if (response.ok) {
      showToast('✅ Course uploaded successfully!', 'success');
      document.getElementById('uploadForm').reset();
      document.getElementById('thumbnailPreview').innerHTML = '';
      closeUploadModal();
      loadCourses();
    } else {
      showToast('❌ ' + (result.error || 'Upload failed'), 'error');
    }
  } catch (error) {
    console.error('Upload error:', error);
    showToast('❌ Upload failed. Please check your connection.', 'error');
  } finally {
    hideLoading();
  }
});

/* -------------------------- 14. FLAG / REPORT -------------------------- */
function openFlagModal(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  currentFlagCourseId = courseId;
  document.getElementById('flagReason').value = '';
  document.getElementById('flagModal').classList.add('is-open');
}

function closeFlagModal() {
  document.getElementById('flagModal').classList.remove('is-open');
  currentFlagCourseId = null;
}

async function submitFlag() {
  const reason = document.getElementById('flagReason').value.trim();
  if (!reason) { showToast('Please provide a reason for flagging this content.', 'error'); return; }
  if (reason.length < 10) { showToast('Please provide a more detailed reason (minimum 10 characters).', 'error'); return; }
  if (!currentFlagCourseId) { showToast('Error: No course selected.', 'error'); closeFlagModal(); return; }

  try {
    showLoading();
    const response = await fetch('/api/courses/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: currentFlagCourseId, reason })
    });
    const result = await response.json();

    if (response.ok && result.success) {
      if (result.deleted) {
        showToast('⚠️ This course has been removed due to multiple reports.', 'info');
        loadCourses();
      } else if (result.warningIssued) {
        showToast('✅ Report submitted. A warning has been issued to the creator.', 'success');
      } else {
        showToast('✅ Report submitted. Thank you for helping maintain quality.', 'success');
      }
      const flagBtn = document.querySelector(`.course-card[data-course-id="${currentFlagCourseId}"] .card-menu__dropdown button[onclick*="openFlagModal"]`);
      if (flagBtn) { flagBtn.disabled = true; flagBtn.innerHTML = '<i class="fas fa-flag"></i> Reported'; }
      closeFlagModal();
    } else {
      showToast(result.error || 'Failed to submit report. Please try again.', 'error');
    }
  } catch (error) {
    console.error('Flag submission error:', error);
    showToast('Error submitting report. Please check your connection.', 'error');
  } finally {
    hideLoading();
  }
}

/* -------------------------- 15. DOWNLOAD / WATCH / ACCESS / PAYMENT / DELETE -------------------------- */
async function handleDownload(courseId) {
  try {
    window.location.href = `/api/download/${courseId}`;
    setTimeout(() => showToast('Download started! Check your downloads folder.', 'success'), 400);
  } catch (error) {
    console.error('Download error:', error);
    showToast('Error downloading file: ' + error.message, 'error');
  }
}

async function watchVideo(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  if (!course) return;
  try {
    showLoading();
    const accessRes = await fetch(`/api/check-access/${courseId}`);
    const accessData = await accessRes.json();
    if (!accessData.hasAccess) {
      showToast('You do not have access to this video yet.', 'error');
      hideLoading();
      return;
    }
    const fileUrl = course.file_url || course.download_url;
    if (fileUrl) {
      window.open(fileUrl, '_blank');
      showToast(`Playing: ${course.title}`, 'info');
    } else {
      showToast('Video file not found. Please contact support.', 'error');
    }
  } catch (error) {
    console.error('Watch video error:', error);
    showToast('Error playing video: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

async function initiatePayment(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  if (!course) return;

  if (!currentUser) {
    showToast('Please login to purchase content.', 'error');
    window.location.href = 'login.html';
    return;
  }

  let displayAmount = course.usdPrice || course.price;
  const confirmMessage = `Enroll in "${course.title}" for $${(course.usdPrice || 0).toFixed(2)} USD?`;
  if (!confirm(confirmMessage)) return;

  showLoading();
  try {
    const response = await fetch('/api/initiate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId })
    });
    const data = await response.json();
    hideLoading();

    if (response.ok && data.status === 'success' && data.paymentLink) {
      localStorage.setItem('pendingPayment', JSON.stringify({ courseId, title: course.title }));
      window.location.href = data.paymentLink;
    } else {
      showToast('Error: ' + (data.error || 'Failed to initiate payment. Please try again.'), 'error');
    }
  } catch (error) {
    console.error('Purchase error:', error);
    hideLoading();
    showToast('Network error: ' + error.message, 'error');
  }
}

async function checkAccess(courseId) {
  try {
    showLoading();
    const response = await fetch(`/api/check-access/${courseId}`);
    const data = await response.json();
    if (data.hasAccess) {
      showToast('You have access to this course!', 'success');
      loadCourses();
    } else {
      showToast('You do not have access to this content yet.', 'info');
    }
  } catch (error) {
    console.error('Access check error:', error);
    showToast('Error checking content access: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

async function deleteCourse(courseId) {
  if (!confirm('Are you sure you want to delete this upload? This action cannot be undone.')) return;
  try {
    const response = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
    const data = await response.json();
    if (response.ok) {
      showToast('✅ Course deleted successfully!', 'success');
      allCourses = allCourses.filter(c => c.id !== courseId);
      renderCourses();
    } else {
      showToast('❌ ' + (data.error || 'Failed to delete course.'), 'error');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Error deleting course. Please try again.', 'error');
  }
}

async function refreshCoursesAfterPurchase() {
  await loadCourses();
  showToast('✅ Purchase successful! Your new content is now available.', 'success');
}

async function checkPendingPayment() {
  const pendingPayment = localStorage.getItem('pendingPayment');
  if (!pendingPayment) return;

  const urlParams = new URLSearchParams(window.location.search);
  const transactionId = urlParams.get('transaction_id');
  const status = urlParams.get('status');

  if (status === 'successful' && transactionId) {
    showLoading();
    try {
      const verifyResponse = await fetch(`/api/verify-payment/${transactionId}`);
      const verifyData = await verifyResponse.json();
      if (verifyData.status === 'success') {
        localStorage.removeItem('pendingPayment');
        const paymentData = JSON.parse(pendingPayment);
        showToast(`✅ Payment successful! You now have access to "${paymentData.title}"`, 'success');
        await refreshCoursesAfterPurchase();
        if (window.location.search) window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        showToast('❌ Payment verification failed. Please contact support.', 'error');
      }
    } catch (error) {
      console.error('Verification error:', error);
      showToast('Error verifying payment. Please contact support.', 'error');
    } finally {
      hideLoading();
    }
  } else if (status === 'cancelled') {
    localStorage.removeItem('pendingPayment');
    showToast('Payment was cancelled.', 'info');
    if (window.location.search) window.history.replaceState({}, document.title, window.location.pathname);
  }
}

/* -------------------------- 16. MOBILE MENU -------------------------- */
function setupMobileMenu() {
  const toggle = document.querySelector('.mobile-menu-toggle');
  const nav = document.querySelector('nav');
  toggle.addEventListener('click', () => {
    nav.classList.toggle('active');
    const icon = toggle.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  });
  document.addEventListener('click', (event) => {
    if (nav.classList.contains('active') && !nav.contains(event.target) && !toggle.contains(event.target)) {
      nav.classList.remove('active');
      toggle.querySelector('i').classList.add('fa-bars');
      toggle.querySelector('i').classList.remove('fa-times');
    }
  });
}

/* -------------------------- 17. INIT -------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  detectUserCurrency();
  loadCourses();

  setupMobileMenu();
  setupSearch();
  setupSelects();
  setupChips();
  setupLoadMore();
  setupModalTabs();
  setupBookTypeSelector();
  setupImagePreview();
  checkPendingPayment();

  document.getElementById('preferencesBtn').addEventListener('click', togglePreferences);
  document.getElementById('notifBtn').addEventListener('click', toggleNotifications);
  document.getElementById('openUploadModalBtn').addEventListener('click', openUploadModal);

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('is-open'); });
  });
});