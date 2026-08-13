/* ============================================================
   CORE INSIGHT — PRODUCTS PAGE JAVASCRIPT
   products.js  =  original application logic (auth, products,
   orders, escrow, refunds, dashboard, admin) + the new feature
   set (cart, real product/seller routes, quick view, ask seller,
   recently viewed, similar products, advanced filters, order
   tracking shortcut, onboarding wizard nav) appended at the end.

   Load this single file from products.html — no second <script>
   tag needed.
   ============================================================ */

// ============================================
// GLOBAL VARIABLES - DECLARED FIRST
// ============================================
let currentUser = null;
let products = [];
let userFavorites = new Set();
let favoriteCounts = {};
let sellerMode = false;
let currentProductId = null;
let categoriesSet = new Set();
let selectedGateway = 'flutterwave';
let isSubmitting = false;
let currentProductForOrder = null;
let currentOrderTotal = 0;
let currentOrderQuantity = 1;
let phoneVerified = false;
// ============================================
// DOM HELPER FUNCTION - FIX MISSING $ FUNCTION
// ============================================
function $(id) {
    return document.getElementById(id);
}
// Currency variables
let userCurrency = 'USD';
let exchangeRates = {
    USD: 1, NGN: 1500, EUR: 0.92, GBP: 0.79, KES: 130, GHS: 15, ZAR: 19,
    CAD: 1.37, AUD: 1.50, JPY: 150, CNY: 7.2, INR: 83, BRL: 5.1, MXN: 17,
    AED: 3.67, SAR: 3.75
};

const currencySymbols = {
    'USD': '$', 'NGN': '₦', 'EUR': '€', 'GBP': '£', 'KES': 'KSh', 'GHS': 'GH₵',
    'ZAR': 'R', 'CAD': 'C$', 'AUD': 'A$', 'JPY': '¥', 'CNY': '¥', 'INR': '₹',
    'BRL': 'R$', 'MXN': '$', 'AED': 'د.إ', 'SAR': 'ر.س'
};

// ============================================
// CORE HELPER FUNCTIONS
// ============================================
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        if (m === "'") return '&#39;';
        return m;
    });
}



// Convert price from USD to target currency
function convertPrice(priceInUSD) {
    if (!priceInUSD || priceInUSD <= 0) return 0;
    
    if (userCurrency === 'USD') {
        return priceInUSD;
    }
    
    // Get the exchange rate for the target currency
    const rate = exchangeRates[userCurrency];
    
    if (!rate || rate <= 0) {
        console.warn(`No exchange rate for ${userCurrency}, using USD`);
        return priceInUSD;
    }
    
    // Convert USD to target currency
    // Example: $10 USD × 1500 = 15,000 NGN
    const convertedAmount = priceInUSD * rate;
    
    console.log(`💰 Conversion: $${priceInUSD} USD → ${convertedAmount.toFixed(2)} ${userCurrency} (rate: ${rate})`);
    
    return convertedAmount;
}

// Format price with proper currency symbol and decimals
function formatPrice(amount) {
    if (!amount && amount !== 0) return `${currencySymbols[userCurrency] || '$'}0.00`;
    
    try {
        let formattedAmount = amount;
        
        // amount is already converted to target currency from convertPrice()
        // Just format it with the correct symbol
        
        const symbol = currencySymbols[userCurrency] || '$';
        
        // Handle different symbol positions
        if (userCurrency === 'EUR') {
            return new Intl.NumberFormat('de-DE', {
                style: 'currency',
                currency: userCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(formattedAmount);
        } else if (userCurrency === 'GBP') {
            return new Intl.NumberFormat('en-GB', {
                style: 'currency',
                currency: userCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(formattedAmount);
        } else if (userCurrency === 'NGN') {
            // Special formatting for Naira
            return `${symbol} ${formattedAmount.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
        } else {
            return `${symbol}${formattedAmount.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
        }
        
    } catch (error) {
        console.error('Format error:', error);
        const symbol = currencySymbols[userCurrency] || '$';
        return `${symbol}${amount.toFixed(2)}`;
    }
}

function fmtPrice(amount) {
    if (!amount && amount !== 0) return formatPrice(0);
    // Convert from USD to user's currency first
    const converted = convertPrice(parseFloat(amount));
    return formatPrice(converted);
}

function getCSRFToken() {
    const el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.getAttribute('content') : '';
}

function debounce(fn, ms = 300) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function openModal(mod) { if (mod) { mod.classList.add('open'); mod.setAttribute('aria-hidden', 'false'); } }
function closeModal(mod) { if (mod) { mod.classList.remove('open'); mod.setAttribute('aria-hidden', 'true'); } }

function showToast(title, message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; background: var(--card-bg);
        border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'danger' ? '#ef4444' : '#3b82f6'};
        padding: 16px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000; max-width: 350px; animation: slideIn 0.3s ease;
    `;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'danger' ? 'fa-exclamation-circle' : 'fa-info-circle'}" 
               style="color: ${type === 'success' ? '#10b981' : type === 'danger' ? '#ef4444' : '#3b82f6'}; font-size: 20px;"></i>
            <div>
                <strong style="color: var(--text-light); display: block;">${escapeHtml(title)}</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-gray);">${escapeHtml(message)}</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: var(--text-gray); cursor: pointer; margin-left: auto;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
}

function showLoading(message) {
    const loading = document.createElement('div');
    loading.className = 'loading-overlay';
    loading.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); 
                    display: flex; align-items: center; justify-content: center; z-index: 9999;">
            <div style="background: var(--card-bg); padding: 30px; border-radius: var(--radius-lg); text-align: center;">
                <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--accent); margin-bottom: 15px;"></i>
                <p style="color: var(--text-light); margin: 0;">${escapeHtml(message)}</p>
            </div>
        </div>
    `;
    document.body.appendChild(loading);
}

function hideLoading() {
    const loading = document.querySelector('.loading-overlay');
    if (loading) loading.remove();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getProductStatus(product) {
    if (product.is_deleted || product.deleted_at) return "deleted";
    if (product.is_active === 0) return "inactive";
    if (product.is_published === 0) return "draft";
    if (product.quantity !== undefined && product.quantity <= 0) return "out_of_stock";
    return "active";
}

function formatStatusDisplay(status) {
    const statusMap = {
        'active': '✅ Active', 'inactive': '⏸️ Inactive', 'draft': '📝 Draft',
        'deleted': '❌ Deleted', 'out_of_stock': '📦 Out of Stock'
    };
    return statusMap[status] || status;
}

function getStatusClass(status) {
    return `status-${status}`;
}

// ============================================
// CURRENCY CONVERSION SYSTEM
// ============================================

  async function loadExchangeRates() {
    try {
        console.log("🌍 Fetching live exchange rates...");
        
        const response = await fetch('/api/currency-rates', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.rates) {
            // Update exchange rates - THESE ARE USD TO TARGET CURRENCY
            // Example: 1 USD = 1500 NGN
            exchangeRates = {
                USD: 1,
                NGN: data.rates.NGN || 1500,
                EUR: data.rates.EUR || 0.92,
                GBP: data.rates.GBP || 0.79,
                KES: data.rates.KES || 130,
                GHS: data.rates.GHS || 15,
                ZAR: data.rates.ZAR || 19,
                CAD: data.rates.CAD || 1.37,
                AUD: data.rates.AUD || 1.50,
                JPY: data.rates.JPY || 150,
                CNY: data.rates.CNY || 7.2,
                INR: data.rates.INR || 83,
                BRL: data.rates.BRL || 5.1,
                MXN: data.rates.MXN || 17,
                AED: data.rates.AED || 3.67,
                SAR: data.rates.SAR || 3.75
            };
            
            console.log(`✅ Live rates loaded: 1 USD = ${exchangeRates.NGN} NGN`);
            console.log(`✅ EUR rate: ${exchangeRates.EUR}, GBP rate: ${exchangeRates.GBP}`);
            
            // Update all prices on the page
            updateAllPrices();
            
        } else {
            throw new Error('Invalid rate data structure');
        }
        
    } catch (error) {
        console.error('❌ Error loading exchange rates:', error);
        console.log('⚠️ Using fallback exchange rates');
        
        // Still update prices with fallback rates
        updateAllPrices();
    }
}
async function detectUserCurrency() {
    try {
        const savedCurrency = localStorage.getItem('ci_currency');
        if (savedCurrency && currencySymbols[savedCurrency]) {
            userCurrency = savedCurrency;
        } else {
            const userLocale = navigator.language || navigator.userLanguage;
            const localeCurrencyMap = { 'en-NG': 'NGN', 'en-ZA': 'ZAR', 'en-KE': 'KES', 'en-GH': 'GHS', 'en': 'USD' };
            userCurrency = localeCurrencyMap[userLocale] || 'USD';
        }
        const currencySelect = document.getElementById('currencyHeader');
        if (currencySelect) currencySelect.value = userCurrency;
        await loadExchangeRates();
    } catch (error) { console.log('Using default currency:', userCurrency); }
}



function updateAllPrices() {
    const priceElements = document.querySelectorAll('.price');
    priceElements.forEach(element => {
        const originalPrice = element.getAttribute('data-original-price');
        if (originalPrice) {
            const newPrice = fmtPrice(parseFloat(originalPrice));
            element.textContent = newPrice;
        }
    });
}

async function initCurrency() {
    await detectUserCurrency();
    const currencySelect = document.getElementById('currencyHeader');
    if (currencySelect) {
        currencySelect.addEventListener('change', async (e) => {
            userCurrency = e.target.value;
            localStorage.setItem('ci_currency', userCurrency);
            await loadExchangeRates();
            updateAllPrices();
            showToast(`Currency changed to ${userCurrency}`, 'info');
        });
    }
}

// ============================================
// CLOUDINARY HELPER FUNCTIONS
// ============================================
function getOptimizedImageUrl(url, options = {}) {
    if (!url || !url.includes('cloudinary.com')) return url;
    const width = options.width || 400, height = options.height || 300, crop = options.crop || 'fill';
    const quality = options.quality || 'auto', format = options.format || 'auto';
    const transformations = [`w_${width}`, `h_${height}`, `c_${crop}`, `q_${quality}`, `f_${format}`];
    return url.replace('/upload/', `/upload/${transformations.join(',')}/`);
}

function getResponsiveSrcSet(url, widths = [400, 600, 800, 1200]) {
    if (!url || !url.includes('cloudinary.com')) return '';
    return widths.map(width => {
        const optimizedUrl = getOptimizedImageUrl(url, { width, height: Math.round(width * 0.75) });
        return `${optimizedUrl} ${width}w`;
    }).join(', ');
}

function getProductImage(images, index = 0) {
    if (!images) return 'https://placehold.co/400x250/1e293b/3b82f6/png?text=No+Image';
    let imageArray = [];
    if (typeof images === 'string') {
        try { imageArray = JSON.parse(images); } catch(e) { imageArray = [images]; }
    } else if (Array.isArray(images)) { imageArray = images; }
    const imagePath = imageArray[index] || imageArray[0] || null;
    if (!imagePath) return 'https://placehold.co/400x250/1e293b/3b82f6/png?text=No+Image';
    if (imagePath.includes('cloudinary.com')) return imagePath;
    return 'https://placehold.co/400x250/1e293b/3b82f6/png?text=Image+Not+Found';
}

function handleImageError(img) {
    img.onerror = null;
    img.src = 'https://placehold.co/400x250/1e293b/3b82f6/png?text=Image+Not+Found';
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================
async function loadUser() {
    try {
        const r = await fetch('/api/me');
        if (!r.ok) { currentUser = null; updateHeader(); updateReviewFormVisibility(); return; }
        const u = await r.json();
        currentUser = u || null;
        updateHeader();
        updateReviewFormVisibility();
        if (currentUser) {
            await loadUserFavorites();
            await loadSellerNotifications();
            setInterval(loadSellerNotifications, 30000);
        }
    } catch(err) { console.error('loadUser', err); currentUser = null; updateHeader(); updateReviewFormVisibility(); }
}

function updateHeader() {
    const hb = document.getElementById('headerAuthButtons');
    if (!hb) return;
    if (currentUser && currentUser.id) {
        hb.innerHTML = `<span style="color:var(--text-gray);margin-right:.5rem">Welcome, ${escapeHtml(currentUser.username || currentUser.email || 'User')}</span>
                        <button id="logoutBtn" class="auth-btn">Logout</button>`;
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            const newLogoutBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
            newLogoutBtn.addEventListener('click', async () => {
                await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                currentUser = null;
                userFavorites = new Set();
                updateHeader();
                updateReviewFormVisibility();
                loadProducts();
                showToast('Logged out successfully', 'success');
            });
        }
    } else {
        hb.innerHTML = `<button id="loginOpen" class="auth-btn">Login</button>
                        <a href="signup.html" id="signupOpen" class="auth-btn signup">Sign Up</a>`;
        setTimeout(() => {
            const loginBtn = document.getElementById('loginOpen');
            if (loginBtn) {
                const newLoginBtn = loginBtn.cloneNode(true);
                loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
                newLoginBtn.addEventListener('click', () => openModal(document.getElementById('loginModal')));
            }
        }, 0);
    }
    const sellerView = document.getElementById('sellerView');
    if (sellerView) {
        if (sellerMode && currentUser) sellerView.classList.add('active');
        else sellerView.classList.remove('active');
        sellerView.setAttribute('aria-hidden', !(sellerMode && currentUser));
    }
    const browseModeText = document.getElementById('browseModeText');
    if (browseModeText) browseModeText.innerHTML = sellerMode ? 'Seller' : 'Buyer';
}

function updateReviewFormVisibility() {
    const form = document.getElementById("reviewFormWrapper");
    if (!form) return;
    if (currentUser) form.classList.remove("hidden");
    else form.classList.add("hidden");
}

// ============================================
// FAVORITES FUNCTIONS
// ============================================
// ✅ FIXED VERSION:
async function loadUserFavorites() {
    try {
        const response = await fetch('/api/favorites', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            userFavorites = new Set();
            favoriteCounts = {};
            return;
        }
        
        if (!response.ok) {
            userFavorites = new Set();
            favoriteCounts = {};
            return;
        }
        
        const data = await response.json();
        userFavorites = new Set(data.favorites || []);
        favoriteCounts = data.favoriteCounts || {};
        updateFavoriteCountsOnCards();
        
    } catch(err) {
        console.error('loadUserFavorites error:', err);
        userFavorites = new Set();
        favoriteCounts = {};
    }
}
function updateFavoriteCountsOnCards() {
    document.querySelectorAll('.product-card').forEach(card => {
        const productId = card.getAttribute('data-id');
        if (productId && favoriteCounts[productId] !== undefined) {
            const countElement = card.querySelector('.favorite-count');
            if (countElement) countElement.textContent = favoriteCounts[productId];
        }
    });
}

async function toggleFavorite(productId) {
    if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
    try {
        const response = await fetch('/api/favorites/toggle', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() },
            body: JSON.stringify({ productId }), credentials: 'include'
        });
        const data = await response.json();
        if (data.action === 'added') {
            userFavorites.add(productId);
        } else {
            userFavorites.delete(productId);
        }
        if (data.favoriteCount !== undefined) {
            favoriteCounts[productId] = data.favoriteCount;
            const product = products.find(p => p.id == productId);
            if (product) product.favorite_count = data.favoriteCount;
            updateFavoriteCountsOnCards();
        }
    } catch(error) { console.error('Favorite toggle failed:', error); }
}

// ============================================
// PRODUCT LOADING & RENDERING
// ============================================
function showSkeletonLoader(count = 6) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    grid.innerHTML = Array(count).fill(`
        <div class="product-card skeleton">
            <div class="card-media skeleton"></div>
            <div class="card-body">
                <div class="skeleton-text"></div>
                <div class="skeleton-text short"></div>
                <div class="price-row"><div class="skeleton-text price"></div></div>
            </div>
        </div>
    `).join('');
}

function populateCategoryFilter() {
    const sel = document.getElementById('filterCategory');
    if (!sel) return;
    const existing = new Set(Array.from(sel.options).map(o => o.value));
    categoriesSet.forEach(cat => {
        if (!existing.has(cat)) {
            const opt = document.createElement('option');
            opt.value = cat; opt.textContent = cat;
            sel.appendChild(opt);
        }
    });
}

async function loadProducts() {
    try {
        console.log("🔄 Loading products from server...");
        showSkeletonLoader();
        const response = await fetch('/api/products', { credentials: 'include', headers: { 'Accept': 'application/json' } });
        if (!response.ok) { products = []; renderProducts(); return; }
        const data = await response.json();
        products = data || [];
        if (currentUser) await loadUserFavorites();
        const processedProducts = [];
        for (const p of products) {
            p.price = Number(p.price) || 0;
            p.original_price = Number(p.original_price) || p.price;
            p.favorite_count = Number(p.favorite_count) || 0;
            p.review_count = Number(p.review_count) || 0;
            p.rating = Number(p.rating) || 0;
            if (p.images && Array.isArray(p.images) && p.images.length > 0) {
                p._imageList = p.images;
            } else if (p.image_urls) {
                try {
                    if (typeof p.image_urls === 'string') {
                        if (p.image_urls.startsWith('[')) p._imageList = JSON.parse(p.image_urls);
                        else if (p.image_urls.startsWith('http')) p._imageList = [p.image_urls];
                        else p._imageList = [p.image_urls];
                    } else if (Array.isArray(p.image_urls)) p._imageList = p.image_urls;
                    else p._imageList = [];
                } catch(e) { p._imageList = []; }
            } else { p._imageList = []; }
            if (!p._imageList || p._imageList.length === 0) {
                p._imageList = ['https://placehold.co/400x250/1e293b/3b82f6/png?text=Product'];
            }
            p.seller_name = p.seller_name || p.username || p.seller || 'Seller';
            p.type = p.type || p.product_type || (p.affiliate_link ? 'affiliate' : 'physical');
            if (p.category) categoriesSet.add(p.category);
            if (favoriteCounts && favoriteCounts[p.id] !== undefined) p.favorite_count = favoriteCounts[p.id];
            processedProducts.push(p);
        }
        products = processedProducts;
        populateCategoryFilter();
        renderProducts();
    } catch (err) {
        console.error('❌ loadProducts error:', err);
        products = [];
        renderProducts();
        const grid = document.getElementById('productsGrid');
        if (grid) {
            grid.innerHTML = `<div class="error-message" style="text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--danger);"></i>
                <h3>Failed to load products</h3><p>${err.message || 'Please refresh the page.'}</p>
                <button onclick="loadProducts()" class="btn primary" style="margin-top: 20px;"><i class="fas fa-sync-alt"></i> Retry</button>
            </div>`;
        }
    }
}

 function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    const q = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const typeFilter = document.getElementById('filterType')?.value || '';
    const catFilter = document.getElementById('filterCategory')?.value || '';
    const countryFilter = document.getElementById('filterCountry')?.value || '';
    const sort = document.getElementById('sortSelect')?.value || 'newest';
    
    let list = products.slice();
    
    // Apply filters
    if (q) {
        list = list.filter(p => 
            (p.title || '').toLowerCase().includes(q) || 
            (p.description || '').toLowerCase().includes(q) || 
            (p.category || '').toLowerCase().includes(q)
        );
    }
    if (typeFilter) {
        list = list.filter(p => (p.type || '').toLowerCase() === typeFilter);
    }
    if (catFilter) {
        list = list.filter(p => (p.category || '') === catFilter);
    }
    if (countryFilter) {
        list = list.filter(p => {
            if (p.type !== 'physical') return true;
            const locations = p.delivery_locations || 'Worldwide';
            const countriesList = locations.split(',').map(l => l.trim());
            return countriesList.includes(countryFilter) || locations.includes('Worldwide');
        });
    }
    
    // Apply sorting
    if (sort === 'affordable') {
        list.sort((a, b) => a.price - b.price);
    } else if (sort === 'rated') {
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'favorites') {
        list.sort((a, b) => (b.favorite_count || 0) - (a.favorite_count || 0));
    } else {
        list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
    
    // Show/hide no products message
    const noProducts = document.getElementById('noProducts');
    if (noProducts) noProducts.style.display = list.length ? 'none' : 'block';
    if (!list.length) { 
        grid.innerHTML = ''; 
        return; 
    }
    
    // Check if current user is owner of a product
    const isOwner = (productUserId) => {
        return currentUser && (currentUser.id === productUserId || currentUser.role === 'admin');
    };
    
    // Generate product cards HTML
    grid.innerHTML = list.map(p => {
        // Handle images
        const imageList = p._imageList && Array.isArray(p._imageList) && p._imageList.length > 0 
            ? p._imageList 
            : (p.images && Array.isArray(p.images) && p.images.length > 0 ? p.images : []);
        
        const productImage = imageList.length > 0 ? imageList[0] : 'https://placehold.co/400x250/1e293b/3b82f6/png?text=No+Image';
        
        // Escape data for safety
        const seller = escapeHtml(p.seller_name || p.username || 'Seller');
        const title = escapeHtml(p.title || p.productName || p.name || 'Untitled');
        const desc = escapeHtml((p.description || '').slice(0, 120));
        
        const originalPriceUSD = p.original_price || p.price || 0;
        const formattedPrice = fmtPrice(originalPriceUSD);
        
        const isAffiliate = (p.type === 'affiliate' || p.type === 'affiliate_link' || p.affiliate_link);
        const isFavorite = userFavorites.has(p.id);
        const isPhysical = p.type === 'physical';
        const isDigital = p.type === 'digital';
        
        const badgeClass = p.type === 'digital' ? 'badge-digital' : 
                          p.type === 'physical' ? 'badge-physical' : 'badge-affiliate';
        
        const productOwner = isOwner(p.user_id);
        
        // Build delivery info HTML for physical products
        let deliveryInfoHtml = '';
        if (isPhysical) {
            const deliveryType = p.delivery_type || 'delivery';
            const deliveryCountries = p.delivery_countries || 'Worldwide';
            const deliveryStates = p.delivery_states || '';
            const pickupAddress = p.pickup_address || '';
            const pickupHours = p.pickup_hours || '';
            const estimatedDays = p.estimated_delivery_days || p.delivery_days || 7;
            
            deliveryInfoHtml = '<div class="product-details">';
            if (deliveryType === 'delivery' || deliveryType === 'both') {
                deliveryInfoHtml += `
                    <div class="detail-item">
                        <i class="fas fa-truck" style="color: var(--accent);"></i>
                        <span><strong>🚚 Home Delivery:</strong> Available</span>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-globe"></i>
                        <span><strong>Ships to:</strong> ${escapeHtml(deliveryCountries)}</span>
                    </div>
                    ${deliveryStates ? `
                    <div class="detail-item">
                        <i class="fas fa-map-pin"></i>
                        <span><strong>States:</strong> ${escapeHtml(deliveryStates)}</span>
                    </div>
                    ` : ''}
                    <div class="detail-item">
                        <i class="fas fa-calendar-day"></i>
                        <span><strong>Est. Delivery:</strong> ${estimatedDays} ${estimatedDays === 1 ? 'day' : 'days'}</span>
                    </div>
                `;
            }
            if (deliveryType === 'pickup' || deliveryType === 'both') {
                deliveryInfoHtml += `
                    <div class="detail-item" style="margin-top: 8px;">
                        <i class="fas fa-store" style="color: var(--success);"></i>
                        <span><strong>🏪 Store Pickup:</strong> Available</span>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-location-dot"></i>
                        <span><strong>Pickup Location:</strong> ${escapeHtml(pickupAddress)}</span>
                    </div>
                    ${pickupHours ? `
                    <div class="detail-item">
                        <i class="fas fa-clock"></i>
                        <span><strong>Pickup Hours:</strong> ${escapeHtml(pickupHours)}</span>
                    </div>
                    ` : ''}
                `;
            }
            deliveryInfoHtml += '</div>';
        }
        
        // Build thumbnails HTML
        let thumbHtml = '';
        if (imageList.length > 1) {
            thumbHtml = `
                <div class="thumbs">
                    ${imageList.slice(1, 4).map((thumbPath, idx) => {
                        return `<img src="${thumbPath}" alt="thumb${idx + 1}" 
                                  onclick="event.stopPropagation(); switchMainImage(${p.id}, ${idx + 1})" 
                                  loading="lazy"
                                  onerror="this.onerror=null; this.style.display='none';">`;
                    }).join('')}
                </div>
            `;
        }
        
        // Generate the product card HTML
        return `
            <div class="product-card" data-id="${p.id}" data-user-id="${p.user_id}">
                <!-- Product Type Badge -->
                <div class="product-badge ${badgeClass}">${p.type === 'digital' ? '📱 Digital' : p.type === 'physical' ? '📦 Physical' : '🔗 Affiliate'}</div>
                
                <!-- Card Media Section -->
                <div class="card-media">
                    <img id="mainimg-${p.id}" 
                         src="${productImage}" 
                         alt="${title}" 
                         loading="lazy"
                         onerror="this.onerror=null; this.src='https://placehold.co/400x250/1e293b/3b82f6/png?text=Image+Not+Found';">
                    
                    ${thumbHtml}
                    
                    <!-- Share Button (only for product owner) -->
                    ${productOwner ? `
                        <button class="share-btn" onclick="event.stopPropagation(); shareProduct(${p.id}, '${title.replace(/'/g, "\\'")}')" title="Share this product">
                            <i class="fas fa-share-alt"></i>
                            ${p.share_count > 0 ? `<span class="share-count">${p.share_count}</span>` : ''}
                        </button>
                    ` : ''}
                    
                    <!-- Favorite Button -->
                    <div style="position: absolute; bottom: 12px; right: 16px; display: flex; align-items: center; gap: 4px; background: rgba(15, 23, 42, 0.8); padding: 4px 8px; border-radius: 20px; border: 1px solid var(--border); z-index: 2;">
                        <button class="favorite-btn ${isFavorite ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite(${p.id})" style="position: static; width: auto; height: auto; background: transparent; border: none; padding: 0; margin-right: 4px;">
                            <i class="fas fa-heart" style="font-size: 14px; ${isFavorite ? 'color: var(--danger);' : ''}"></i>
                        </button>
                        <span class="favorite-count" data-product-id="${p.id}" style="color: var(--text-light); font-size: 12px; font-weight: 600;">${p.favorite_count || 0}</span>
                    </div>
                    
                    <!-- Delete Button (only for product owner) -->
                    ${productOwner ? `
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteProduct(${p.id})" title="Delete Product">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
                
                <!-- Card Body -->
                <div class="card-body">
                    <h3>${title}</h3>
                    <div class="seller-info">
                        <i class="fas fa-user"></i>
                        <span>By ${seller}</span>
                    </div>
                    <div class="meta">${desc}</div>
                    
                    ${deliveryInfoHtml}
                    
                    <div class="rating">
                        <span class="rating-stars">${'⭐'.repeat(Math.floor(p.rating || 0))}</span>
                        <span class="rating-count">(${p.review_count || 0} ${p.review_count === 1 ? 'review' : 'reviews'})</span>
                        <span style="color:var(--text-gray);margin-left:8px">• ${p.favorite_count || 0} ${p.favorite_count === 1 ? 'favorite' : 'favorites'}</span>
                    </div>
                    
                    <div class="price-row">
                        <div>
                            <div class="price" data-original-price="${originalPriceUSD}" data-usd-price="${originalPriceUSD}">${formattedPrice}</div>
                            ${isPhysical ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Free shipping</div>` : 
                              isDigital ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Instant delivery</div>` : ''}
                        </div>
                        <div class="card-actions">
                            ${isAffiliate ? `
                                <button class="small-btn primary" onclick="event.stopPropagation(); openAffiliate('${escapeHtml(p.affiliate_link || '')}')">
                                    <i class="fas fa-external-link-alt"></i> Visit
                                </button>
                            ` : isPhysical ? `
                                <button class="small-btn success" onclick="event.stopPropagation(); orderPhysicalProduct(${p.id})" title="Order with delivery">
                                    <i class="fas fa-shopping-cart"></i> Order Now
                                </button>
                                <button class="small-btn info" onclick="event.stopPropagation(); showProductFullDetails(${p.id})" title="View product details">
                                    <i class="fas fa-clipboard-list"></i> Details
                                </button>
                            ` : isDigital ? `
                                <button class="small-btn primary" onclick="event.stopPropagation(); buyProduct(${p.id})">
                                    <i class="fas fa-shopping-cart"></i> Buy Now
                                </button>
                                <button class="small-btn info" onclick="event.stopPropagation(); showProductFullDetails(${p.id})" title="View product details">
                                    <i class="fas fa-info-circle"></i> Details
                                </button>
                            ` : `
                                <button class="small-btn primary" onclick="event.stopPropagation(); buyProduct(${p.id})">
                                    <i class="fas fa-shopping-cart"></i> Buy Now
                                </button>
                            `}
                            <button class="small-btn" onclick="event.stopPropagation(); selectProductForReviews(${p.id})">
                                <i class="fas fa-eye"></i> View
                            </button>
                        </div>
                    </div>
                    
                    <!-- Owner Controls (Edit button for product owners) -->
                    <div class="owner-controls">
                        ${productOwner ? `
                            <button class="small-btn" onclick="event.stopPropagation(); editProduct(${p.id})">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Initialize owner-specific features after rendering
    initializeProductOwnership();
    
    // Start image carousels
    startProductCarousels();
    
    // Update all prices for currency conversion
    updateAllPrices();
}
function startProductCarousels() {
    const productImageIntervals = new Map();
    document.querySelectorAll('.product-card').forEach(card => {
        const id = card.getAttribute('data-id');
        if (!id) return;
        const prod = products.find(p => String(p.id) === String(id));
        if (!prod || !Array.isArray(prod._imageList) || prod._imageList.length <= 1) return;
        const mainImg = document.getElementById(`mainimg-${id}`);
        if (!mainImg) return;
        let idx = 0;
        const iv = setInterval(() => {
            idx = (idx + 1) % prod._imageList.length;
            const imgEl = document.getElementById(`mainimg-${id}`);
            if (imgEl) imgEl.src = prod._imageList[idx];
        }, 2500);
        productImageIntervals.set(id, iv);
        card.querySelector('.card-media')?.addEventListener('mouseenter', () => {
            const ivId = productImageIntervals.get(id);
            if (ivId) { clearInterval(ivId); productImageIntervals.delete(id); }
        });
        card.querySelector('.card-media')?.addEventListener('mouseleave', () => {
            if (productImageIntervals.has(id)) return;
            let idx2 = prod._imageList.indexOf((document.getElementById(`mainimg-${id}`)?.src) || '');
            if (idx2 < 0) idx2 = 0;
            const iv2 = setInterval(() => {
                idx2 = (idx2 + 1) % prod._imageList.length;
                const el = document.getElementById(`mainimg-${id}`);
                if (el) el.src = prod._imageList[idx2];
            }, 2500);
            productImageIntervals.set(id, iv2);
        });
    });
}

window.switchMainImage = function(productId, thumbIndex) {
    const prod = products.find(p => p.id == productId);
    if (!prod || !prod._imageList || !prod._imageList[thumbIndex]) return;
    const main = document.getElementById('mainimg-' + productId);
    if (main) main.src = prod._imageList[thumbIndex];
};

function initializeProductOwnership() {
    document.querySelectorAll('.product-card').forEach(card => {
        const productId = card.getAttribute('data-id');
        const productUserId = card.getAttribute('data-user-id');
        const isOwner = currentUser && (currentUser.id == productUserId || currentUser.role === 'admin');
        if (isOwner) {
            card.classList.add('is-owner');
            const deleteBtn = card.querySelector('.delete-btn');
            if (deleteBtn) deleteBtn.style.display = 'flex';
            const ownerControls = card.querySelector('.owner-controls');
            if (ownerControls) ownerControls.style.display = 'flex';
        }
    });
}
// ========== UPLOAD PRODUCT BUTTON HANDLER - COMPLETE ==========
$('uploadProductBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    console.log("🟢 Upload button CLICKED!");
    
    const productType = document.getElementById('p_type')?.value;
    
    // ========== HANDLE VIRTUAL ACCOUNT NAME BEFORE VALIDATION ==========
    const isVirtualAccount = document.getElementById('isVirtualAccount')?.checked || false;
    const manualAccountName = document.getElementById('manualAccountName')?.value.trim();
    const accountNameField = document.getElementById('p_accountName');
    
    // For virtual accounts, set the account name field to the manual name
    if (isVirtualAccount && manualAccountName) {
        if (accountNameField) {
            accountNameField.value = manualAccountName;
            accountNameField.readOnly = true;
            console.log("✅ Set account name from manual field:", manualAccountName);
        }
    }
    
    // ========== FOR AFFILIATE PRODUCTS - SKIP SUBACCOUNT CREATION AND BANK VALIDATION ==========
    if (productType === 'affiliate') {
        console.log("🔗 Affiliate product detected - skipping payment/subaccount setup");
        // Set a dummy payment provider for affiliate (backend will ignore it)
        const paymentProviderInput = document.getElementById('p_paymentProvider');
        if (paymentProviderInput && !paymentProviderInput.value) {
            paymentProviderInput.value = 'affiliate';
        }
        // Skip bank validation - continue directly to form validation
    } else {
        // ========== FOR PHYSICAL/DIGITAL PRODUCTS - CREATE SUBACCOUNT FIRST ==========
        console.log("💰 Physical/Digital product - checking subaccount...");
        
        // Check if bank details are filled
        const bankCode = document.getElementById('p_bankCode')?.value;
        const accountNumber = document.getElementById('p_accountNumber')?.value;
        const businessName = document.getElementById('p_businessName')?.value;
        
        if (!bankCode || !accountNumber || !businessName) {
            showToast('Please fill in all bank account details first', 'warning');
            document.getElementById('bankDetailsSection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        
        // Create subaccount for payout split (90/10)
        const subaccountResult = await createSubaccount();
        
        if (!subaccountResult) {
            showToast('Please verify your bank account details first', 'warning');
            return;
        }
        
        console.log("✅ Subaccount created/verified successfully");
    }
    
    // ========== VALIDATE FORM ==========
    if (!validateProductForm()) {
        console.log("❌ Form validation failed");
        return;
    }

    if (!currentUser) { 
        openModal(loginModal); 
        return; 
    }

    // ========== CREATE FORM DATA ==========
    const fd = new FormData();

    // Get form values
    const title = $('p_title')?.value.trim();
    const description = $('p_description')?.value.trim();
    const category = getSelectedCategory();
    const price = $('p_price')?.value || '0';
    const type = $('p_type')?.value;
    
    // Get payment provider - for affiliate, send a dummy value
    let paymentProvider = $('p_paymentProvider')?.value;
    if (type === 'affiliate' && !paymentProvider) {
        paymentProvider = 'affiliate';  // Dummy value for affiliate
    }
    
    // Physical product fields
    const deliveryDays = type === 'physical' ? $('p_deliveryDays')?.value || '7' : '';
    const productCost = type === 'physical' ? $('p_productCost')?.value || '3' : null;
    const deliveryLocations = type === 'physical' ? $('p_deliveryLocations')?.value.trim() || 'Worldwide' : '';
    
    // Affiliate product fields
    let affiliateLink = '';
    let externalImage = '';
    if (type === 'affiliate') {
        affiliateLink = document.getElementById('p_affiliate')?.value.trim() || '';
        externalImage = $('p_external_image')?.value.trim() || '';
    }

    // Get delivery method values
    const deliveryType = document.getElementById('p_deliveryType')?.value || 'delivery';
    const deliveryCountriesSelect = document.getElementById('p_deliveryCountries');
    const deliveryCountries = deliveryCountriesSelect ? Array.from(deliveryCountriesSelect.selectedOptions).map(opt => opt.value).join(', ') : 'Worldwide';
    const deliveryStates = document.getElementById('p_deliveryStates')?.value || '';
    const pickupAddress = document.getElementById('p_pickupAddress')?.value || '';
    const pickupHours = document.getElementById('p_pickupHours')?.value || '';
    const pickupInstructions = document.getElementById('p_pickupInstructions')?.value || '';

    // Product condition fields
    const conditionType = document.getElementById('p_condition_type')?.value || 'new';
    const conditionDescription = document.getElementById('p_condition_description')?.value || '';
    const manufacturingDate = document.getElementById('p_manufacturing_date')?.value || '';
    const warrantyMonths = document.getElementById('p_warranty_months')?.value || '0';
    const originalPackaging = document.getElementById('p_original_packaging')?.value || '1';
    const accessoriesIncluded = document.getElementById('p_accessories')?.value || '';
    const visibleDefects = document.getElementById('p_defects')?.value || '';

    // Business info (only for non-affiliate products)
    let businessName = '', businessEmail = '', businessPhone = '', country = '';
    let bankName = '', bankCode = '', accountNumber = '', accountNameValue = '';
    
    if (type !== 'affiliate') {
        businessName = $('p_businessName')?.value.trim() || '';
        businessEmail = $('p_businessEmail')?.value.trim() || '';
        businessPhone = $('p_businessPhone')?.value.trim() || '';
        country = $('p_country')?.value.trim() || '';
        bankName = $('p_bankName')?.value.trim() || '';
        bankCode = $('p_bankCode')?.value.trim() || '';
        accountNumber = $('p_accountNumber')?.value.trim() || '';
        accountNameValue = $('p_accountName')?.value.trim() || '';
        
        // Use manual account name for virtual accounts if accountName is empty
        if (isVirtualAccount && manualAccountName && !accountNameValue) {
            accountNameValue = manualAccountName;
        }
    }

    // ========== APPEND ALL FIELDS TO FORM DATA ==========
    // Basic info
    fd.append('title', title);
    fd.append('description', description || '');
    fd.append('category', category || '');
    fd.append('price', price);
    fd.append('type', type);
    fd.append('paymentProvider', paymentProvider || 'flutterwave');  // Always provide a value
    
    // Physical product fields
    if (type === 'physical') {
        fd.append('delivery_days', deliveryDays);
        fd.append('product_cost', productCost);
        fd.append('delivery_type', deliveryType);
        fd.append('payment_option', $('p_paymentOption')?.value || 'pay_before_delivery');
        fd.append('delivery_locations', deliveryLocations);
        fd.append('delivery_countries', deliveryCountries);
        fd.append('delivery_states', deliveryStates);
        fd.append('pickup_address', pickupAddress);
        fd.append('pickup_hours', pickupHours);
        fd.append('pickup_instructions', pickupInstructions);
    }
    
    // Digital product file
    if (type === 'digital') {
        const fileInput = document.getElementById('p_file');
        if (fileInput?.files.length > 0) fd.append('file', fileInput.files[0]);
    }
    
    // Affiliate product
    if (type === 'affiliate') {
        fd.append('affiliate_link', affiliateLink);
        if (externalImage) fd.append('external_image', externalImage);
    }
    
    // Product condition fields (all product types)
    fd.append('condition_type', conditionType);
    fd.append('condition_description', conditionDescription);
    fd.append('manufacturing_date', manufacturingDate);
    fd.append('warranty_months', warrantyMonths);
    fd.append('original_packaging', originalPackaging);
    fd.append('accessories_included', accessoriesIncluded);
    fd.append('visible_defects', visibleDefects);
    
    // Business info (only for non-affiliate)
    if (type !== 'affiliate') {
        fd.append('businessName', businessName);
        fd.append('businessEmail', businessEmail);
        fd.append('businessPhone', businessPhone);
        fd.append('country', country);
        fd.append('bankName', bankName);
        fd.append('bankCode', bankCode || '');
        fd.append('accountNumber', accountNumber);
        fd.append('accountName', accountNameValue);
        fd.append('is_virtual_account', isVirtualAccount ? '1' : '0');
    } else {
        // For affiliate, send empty placeholders
        fd.append('businessName', businessName || 'Affiliate Seller');
        fd.append('businessEmail', currentUser?.email || '');
        fd.append('businessPhone', '');
        fd.append('country', '');
        fd.append('bankName', '');
        fd.append('bankCode', '');
        fd.append('accountNumber', '');
        fd.append('accountName', '');
        fd.append('is_virtual_account', '0');
    }
    
    // Images
    const imagesInput = document.getElementById('p_images');
    if (imagesInput?.files.length > 0) {
        for (let i = 0; i < imagesInput.files.length; i++) {
            fd.append('images[]', imagesInput.files[i]);
        }
    }

    // ========== SHOW UPLOADING STATE ==========
    const uploadMessage = $('uploadMessage');
    uploadMessage.innerHTML = '<div class="form-success"><i class="fas fa-spinner fa-spin"></i> Uploading product...</div>';
    uploadMessage.classList.add('show');

    try {
        // ========== SUBMIT TO SERVER ==========
        const res = await fetch('/api/upload-product', { 
            method: 'POST', 
            body: fd,
            credentials: 'include'
        });
        
        const text = await res.text();
        console.log("📨 Response length:", text.length);
        
        if (!text || text.trim() === '') {
            throw new Error('Server returned empty response');
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.error("Failed to parse:", text.substring(0, 200));
            throw new Error('Invalid server response');
        }

        if (!res.ok) { 
            uploadMessage.innerHTML = `<div class="form-success" style="color:var(--danger)">❌ ${escapeHtml(data.error || 'Upload failed')}</div>`; 
            return; 
        }

        // ========== SUCCESS ==========
        uploadMessage.innerHTML = `<div class="form-success" style="color:var(--success)">✅ ${data.message}</div>`;

        // Reset form
        document.querySelectorAll('#sellerView input, #sellerView textarea, #sellerView select').forEach(el => {
            if (el.type !== 'button' && el.id !== 'uploadProductBtn') el.value = '';
        });
        
        const fileInput = document.getElementById('p_file');
        if (fileInput) fileInput.value = '';
        
        const imagesInputReset = document.getElementById('p_images');
        if (imagesInputReset) imagesInputReset.value = '';
        
        document.querySelectorAll('.provider-option').forEach(opt => opt.classList.remove('selected'));
        const paymentProviderInput = document.getElementById('p_paymentProvider');
        if (paymentProviderInput) paymentProviderInput.value = '';
        
        const businessInfoDiv = document.getElementById('businessInfo');
        if (businessInfoDiv) businessInfoDiv.classList.remove('show');
        
        const digitalBlockDiv = document.getElementById('digitalBlock');
        if (digitalBlockDiv) digitalBlockDiv.classList.remove('show');
        
        const physicalBlockDiv = document.getElementById('physicalBlock');
        if (physicalBlockDiv) physicalBlockDiv.classList.remove('show');
        
        const affiliateBlockDiv = document.getElementById('affiliateBlock');
        if (affiliateBlockDiv) affiliateBlockDiv.classList.remove('show');
        
        // Reset virtual account checkbox
        const virtualCheckbox = document.getElementById('isVirtualAccount');
        if (virtualCheckbox) virtualCheckbox.checked = false;
        
        const manualNameField = document.getElementById('manualAccountName');
        if (manualNameField) {
            manualNameField.value = '';
            manualNameField.style.display = 'none';
        }
        
        const virtualHelp = document.getElementById('virtualAccountHelp');
        if (virtualHelp) virtualHelp.style.display = 'none';

        // Reset payment section visibility based on product type
        const paymentSection = document.getElementById('paymentProviderSection');
        const bankDetailsSection = document.getElementById('bankDetailsSection');
        
        // For affiliate, keep payment sections hidden; for others, show them
        if (type === 'affiliate') {
            if (paymentSection) paymentSection.style.display = 'none';
            if (bankDetailsSection) bankDetailsSection.style.display = 'none';
        } else {
            if (paymentSection) paymentSection.style.display = 'block';
            if (bankDetailsSection) bankDetailsSection.style.display = 'block';
        }

        // Reload products and reset UI
        setTimeout(async () => {
            sellerMode = false;
            const becomeBtn = document.getElementById('becomeSeller');
            const sellerView = document.getElementById('sellerView');
            if (becomeBtn) becomeBtn.textContent = 'Become a Seller';
            if (sellerView) sellerView.classList.remove('active');
            uploadMessage.classList.remove('show');
            await loadProducts();
            
            // Refresh category dropdown
            const categorySelect = document.getElementById('p_category_select');
            if (categorySelect) {
                while (categorySelect.options.length > 1) categorySelect.remove(1);
                Array.from(categoriesSet).sort().forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    categorySelect.appendChild(option);
                });
            }
            
            showToast('Product uploaded successfully!', 'success');
        }, 3000);

    } catch(err) {
        console.error('❌ Upload error:', err);
        uploadMessage.innerHTML = `<div class="form-success" style="color:var(--danger)">❌ Upload failed: ${err.message}</div>`;
    }
});
// ============================================
// REVIEWS FUNCTIONS
// ============================================
// Select product for reviews (called when clicking "View" button)
function selectProductForReviews(productId) {
    currentProductId = productId;
    loadProductReviews(productId);
    // Scroll to reviews section
    const reviewsSection = document.getElementById('productReviewsSection');
    if (reviewsSection) {
        reviewsSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// Make it globally available
window.selectProductForReviews = selectProductForReviews;


    async function loadProductReviews(productId) {
    try {
        console.log('Loading reviews for product:', productId);
        
        const response = await fetch(`/api/reviews/${productId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load reviews');
        }
        
        const data = await response.json();
        const reviews = data.reviews || [];
        let averageRating = parseFloat(data.averageRating) || 0;
        const reviewCount = data.count || 0;
        
        // Update average rating display
        const averageRatingEl = document.getElementById('averageRating');
        if (averageRatingEl) {
            const fullStars = Math.floor(averageRating);
            const halfStar = averageRating % 1 >= 0.5;
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= fullStars) {
                    starsHtml += '<i class="fas fa-star" style="color: var(--warning);"></i>';
                } else if (i === fullStars + 1 && halfStar) {
                    starsHtml += '<i class="fas fa-star-half-alt" style="color: var(--warning);"></i>';
                } else {
                    starsHtml += '<i class="far fa-star" style="color: var(--text-gray);"></i>';
                }
            }
            averageRatingEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <div style="font-size: 28px; font-weight: 700; color: var(--text-light);">${averageRating.toFixed(1)}</div>
                    <div>${starsHtml}</div>
                    <div style="color: var(--text-gray);">(${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})</div>
                </div>
            `;
        }
        
        // Display reviews list
        const reviewsListEl = document.getElementById('reviewsList');
        if (reviewsListEl) {
            if (reviews.length === 0) {
                reviewsListEl.innerHTML = '<p style="color: var(--text-gray); text-align: center; padding: 20px;">No reviews yet. Be the first to review this product!</p>';
            } else {
                let reviewsHtml = '';
                for (const review of reviews) {
                    const stars = '⭐'.repeat(Math.floor(review.rating));
                    reviewsHtml += `
                        <div class="review-item">
                            <strong>${escapeHtml(review.username || 'Anonymous')}</strong>
                            <div class="rating-stars">${stars}</div>
                            <p>${escapeHtml(review.comment)}</p>
                            <small>${new Date(review.created_at).toLocaleDateString()}</small>
                        </div>
                    `;
                }
                reviewsListEl.innerHTML = reviewsHtml;
            }
        }
        
    } catch (error) {
        console.error('Error loading reviews:', error);
        const reviewsListEl = document.getElementById('reviewsList');
        if (reviewsListEl) {
            reviewsListEl.innerHTML = '<p style="color: var(--danger);">Error loading reviews. Please try again.</p>';
        }
    }
}
function updateReviewFormVisibility() {
    const form = document.getElementById("reviewFormWrapper");
    if (!form) return;
    
    if (currentUser) {
        form.classList.remove("hidden");
    } else {
        form.classList.add("hidden");
    }
}
async function submitReview() {
    const rating = document.getElementById("reviewRating").value;
    const comment = document.getElementById("reviewComment").value.trim();
    const msg = document.getElementById("reviewMessage");
    if (!rating || !comment) {
        msg.textContent = "Please select a rating and write a comment.";
        msg.style.color = "var(--danger)";
        return;
    }
    if (!currentProductId) {
        msg.textContent = "Please select a product first.";
        msg.style.color = "var(--danger)";
        return;
    }
    msg.textContent = "Submitting review...";
    msg.style.color = "var(--accent)";
    try {
        const res = await fetch("/api/reviews", {
            method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ productId: currentProductId, rating: parseInt(rating), comment: comment }),
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) { msg.textContent = data.error || "Failed to submit review."; msg.style.color = "var(--danger)"; return; }
        msg.textContent = "✅ Review submitted successfully!";
        msg.style.color = "var(--success)";
        document.getElementById("reviewComment").value = "";
        document.getElementById("reviewRating").value = "";
        setTimeout(() => loadProductReviews(currentProductId), 500);
    } catch (err) {
        console.error("Review submit error:", err);
        msg.textContent = "Network error. Please try again.";
        msg.style.color = "var(--danger)";
    }
}
window.submitReview = submitReview;

// ============================================
// ORDER FUNCTIONS
// ============================================
function updateOrderTotalDisplay() {
    if (!currentProductForOrder) return;
    const quantityInput = document.getElementById('orderQuantity');
    if (!quantityInput) return;
    let quantity = parseInt(quantityInput.value);
    if (isNaN(quantity) || quantity < 1) { quantity = 1; quantityInput.value = 1; }
    const productPrice = parseFloat(currentProductForOrder.original_price || currentProductForOrder.price || 0);
    const totalAmount = quantity * productPrice;
    currentOrderTotal = totalAmount;
    currentOrderQuantity = quantity;
    const subtotalEl = document.getElementById('productSubtotal');
    const totalEl = document.getElementById('totalAmount');
    const qtyDisplay = document.getElementById('qtyDisplay');
    if (subtotalEl) subtotalEl.textContent = fmtPrice(totalAmount);
    if (totalEl) totalEl.innerHTML = `<strong style="font-size: 24px;">${fmtPrice(totalAmount)}</strong>`;
    if (qtyDisplay) qtyDisplay.textContent = quantity;
    const platformFeeEl = document.getElementById('platformFeeAmount');
    if (platformFeeEl) platformFeeEl.textContent = fmtPrice(totalAmount * 0.10);
    const sellerEarningsEl = document.getElementById('sellerEarningsAmount');
    if (sellerEarningsEl) sellerEarningsEl.textContent = fmtPrice(totalAmount * 0.90);
}

function closeAddressModal() {
    const modal = document.getElementById('addressModal');
    if (modal) closeModal(modal);
    currentProductForOrder = null;
    currentOrderTotal = 0;
    currentOrderQuantity = 1;
    const form = document.getElementById('addressForm');
    if (form) form.reset();
    const qtyInput = document.getElementById('orderQuantity');
    if (qtyInput) qtyInput.value = '1';
}

async function submitOrderForm(e) {
    if (e) e.preventDefault();
    if (!currentProductForOrder) {
        const messageEl = document.getElementById('addressFormMessage');
        if (messageEl) messageEl.innerHTML = '<div style="color: var(--danger);">Please select a product first.</div>';
        return;
    }
    const messageEl = document.getElementById('addressFormMessage');
    const submitBtn = document.querySelector('#addressForm button[type="submit"]');
    const deliveryAddress = document.getElementById('deliveryAddress').value.trim();
    const deliveryPhone = document.getElementById('deliveryPhone').value.trim();
    const quantity = parseInt(document.getElementById('orderQuantity').value) || 1;
    if (!deliveryAddress) { if (messageEl) messageEl.innerHTML = '<div style="color: var(--danger);">Please enter a delivery address</div>'; return; }
    if (!deliveryPhone) { if (messageEl) messageEl.innerHTML = '<div style="color: var(--danger);">Please enter a phone number or email address</div>'; return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
    if (!emailRegex.test(deliveryPhone) && !phoneRegex.test(deliveryPhone)) {
        if (messageEl) messageEl.innerHTML = '<div style="color: var(--danger);">Please enter a valid phone number or email address</div>';
        return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Order...'; }
    if (messageEl) messageEl.innerHTML = '<div style="color: var(--accent);"><i class="fas fa-spinner fa-spin"></i> Creating your order...</div>';
    try {
        const orderData = {
            productId: currentProductForOrder.id, quantity: quantity,
            deliveryAddress: deliveryAddress, city: document.getElementById('city').value.trim(),
            state: document.getElementById('state').value.trim(), country: document.getElementById('country').value.trim(),
            deliveryPhone: deliveryPhone, notes: ''
        };
        const response = await fetch('/api/physical-orders/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData), credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) {
            closeModal(document.getElementById('addressModal'));
            showToast('✅ Order Created!', `Order #${data.orderId} has been sent to the seller for approval. Total: ${fmtPrice(data.totalAmount)}`, 'success');
            document.getElementById('addressForm').reset();
            currentProductForOrder = null;
            currentOrderTotal = 0;
            currentOrderQuantity = 1;
        } else {
            if (messageEl) messageEl.innerHTML = `<div style="color: var(--danger);">${data.error || 'Failed to create order'}</div>`;
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Place Order'; }
        }
    } catch(error) {
        console.error('Order creation failed:', error);
        if (messageEl) messageEl.innerHTML = '<div style="color: var(--danger);">Network error. Please try again.</div>';
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Place Order'; }
    }
}

async function orderPhysicalProduct(productId) {
    if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
    try {
        const product = products.find(p => p.id === productId);
        if (!product) { showToast('Error', 'Product not found', 'danger'); return; }
        currentProductForOrder = product;
        const productPrice = parseFloat(product.original_price || product.price || 0);
        currentOrderTotal = productPrice;
        currentOrderQuantity = 1;
        const productThumbnail = document.getElementById('productThumbnail');
        const productNameEl = document.getElementById('productName');
        const productPriceEl = document.getElementById('productPrice');
        const quantityInput = document.getElementById('orderQuantity');
        const imageList = product._imageList || (product.images ? (typeof product.images === 'string' ? JSON.parse(product.images) : product.images) : []);
        const productImage = imageList.length > 0 ? imageList[0] : 'https://placehold.co/400x250/1e293b/3b82f6/png?text=Product';
        if (productThumbnail) productThumbnail.src = productImage;
        if (productNameEl) productNameEl.textContent = product.title || 'Product';
        if (productPriceEl) productPriceEl.innerHTML = `${fmtPrice(productPrice)} <span style="font-size: 12px; color: var(--text-muted);">each</span>`;
       if (quantityInput) {
    quantityInput.value = '1';
    const newQuantity = quantityInput.cloneNode(true);
    quantityInput.parentNode.replaceChild(newQuantity, quantityInput);
    
}
        const fields = ['deliveryAddress', 'city', 'state', 'country', 'deliveryPhone'];
        fields.forEach(field => { const el = document.getElementById(field); if (el) el.value = ''; });
        const msgEl = document.getElementById('addressFormMessage');
        if (msgEl) msgEl.innerHTML = '';
        updateOrderTotalDisplay();
        openModal(document.getElementById('addressModal'));
        const addressForm = document.getElementById('addressForm');
        if (addressForm) {
            const newForm = addressForm.cloneNode(true);
            addressForm.parentNode.replaceChild(newForm, addressForm);
            newForm.addEventListener('submit', submitOrderForm);
        }
    } catch(error) { console.error('Order failed:', error); showToast('Error', 'Failed to prepare order', 'danger'); }
}
window.orderPhysicalProduct = orderPhysicalProduct;
window.submitOrderForm = submitOrderForm;
window.closeAddressModal = closeAddressModal;
window.updateOrderTotalDisplay = updateOrderTotalDisplay;

// ============================================
// BUY PRODUCT FUNCTIONS
// ============================================
async function buyProduct(productId) {
    if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
    const buttons = document.querySelectorAll(`button[onclick*="buyProduct(${productId})"]`);
    buttons.forEach(btn => { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; });
    try {
        const response = await fetch('/api/buy-product', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: productId }), credentials: 'include'
        });
        const data = await response.json();
        if (response.ok && data.paymentLink) { window.location.href = data.paymentLink; }
        else { showToast('Error', data.error || 'Failed to initiate purchase', 'danger'); }
    } catch(err) { console.error('Buy product error:', err); showToast('Error', 'Network error. Please try again.', 'danger'); }
    finally { buttons.forEach(btn => { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Buy Now'; }); }
}
window.buyProduct = buyProduct;

function openAffiliate(url) { if (!url) { alert('No affiliate url provided'); return; } window.open(url, '_blank'); }
window.openAffiliate = openAffiliate;

// ============================================
// PRODUCT DETAILS MODAL
// ============================================

 function showProductFullDetails(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) {
        showToast('Error', 'Product not found', 'danger');
        return;
    }
    
    // Format condition type for display
    const conditionMap = {
        'new': '🌟 Brand New (Unopened/Sealed)',
        'like_new': '✨ Like New (Opened but unused)',
        'excellent': '⭐ Excellent (Very light use, no defects)',
        'good': '👍 Good (Normal wear, fully functional)',
        'fair': '👌 Fair (Visible wear, fully functional)',
        'acceptable': '📦 Acceptable (Heavy wear, functional)'
    };
    
    const conditionDisplay = conditionMap[product.condition_type] || product.condition_type || 'Not specified';
    const conditionClass = `condition-${product.condition_type || 'good'}`;
    
    // Warranty display
    const warrantyMonths = parseInt(product.warranty_months) || 0;
    const warrantyDisplay = warrantyMonths === 0 ? 'No warranty' : 
                            warrantyMonths === 12 ? '1 year warranty' : 
                            `${warrantyMonths} months warranty`;
    
    // Manufacturing date
    const manufacturingDate = product.manufacturing_date ? 
        new Date(product.manufacturing_date).toLocaleDateString() : 'Not specified';
    
    // Original packaging
    const originalPackaging = parseInt(product.original_packaging) === 1 ? 
        '✅ Yes, original packaging included' : '📦 No, generic/replacement packaging';
    
    // Accessories
    const accessoriesDisplay = product.accessories_included && product.accessories_included.trim() ? 
        product.accessories_included : 'None listed';
    
    // Defects
    const defectsDisplay = product.visible_defects && product.visible_defects.trim() ? 
        product.visible_defects : 'No visible defects reported';
    
    // Condition description
    const conditionDescription = product.condition_description && product.condition_description.trim() ? 
        product.condition_description : 'No additional condition notes';
    
    // Delivery/Pickup details
    const deliveryType = product.delivery_type || 'delivery';
    const deliveryCountries = product.delivery_countries || 'Worldwide';
    const deliveryStates = product.delivery_states || '';
    const estimatedDays = product.estimated_delivery_days || product.delivery_days || 7;
    const pickupAddress = product.pickup_address || '';
    const pickupHours = product.pickup_hours || '';
    const pickupInstructions = product.pickup_instructions || '';
    
    // Get all images
    const allImages = product._imageList && Array.isArray(product._imageList) ? product._imageList : 
                      (product.images ? (typeof product.images === 'string' ? JSON.parse(product.images) : product.images) : []);
    
    // Build images gallery HTML
    let imagesGalleryHtml = '';
    if (allImages.length > 0) {
        imagesGalleryHtml = `
            <div class="detail-images-gallery">
                <div class="gallery-main">
                    <img id="galleryMainImg" src="${allImages[0]}" alt="${escapeHtml(product.title)}" onclick="openImageModal('${allImages[0]}')">
                </div>
                <div class="gallery-thumbs">
                    ${allImages.map((img, idx) => `
                        <img src="${img}" alt="Image ${idx + 1}" onclick="document.getElementById('galleryMainImg').src='${img}'; document.getElementById('galleryMainImg').onclick=function(){openImageModal('${img}')}">
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    const modalHtml = `
        <div class="modal open" id="productFullDetailsModal">
            <div class="modal-card product-full-details-modal" style="max-width: 800px; width: 90%; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 15px;">
                    <h3 style="margin: 0;">
                        <i class="fas fa-box-open" style="color: var(--accent);"></i> 
                        ${escapeHtml(product.title)}
                    </h3>
                    <span class="close-x" onclick="closeProductFullDetailsModal()">&times;</span>
                </div>
                
                <div class="details-scrollable" style="overflow-y: auto; flex: 1; padding-right: 5px;">
                    ${imagesGalleryHtml}
                    
                    <!-- Seller Info -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(15, 23, 42, 0.5); border-radius: 12px; border: 1px solid var(--border);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-user-circle"></i> Seller Information
                        </h4>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Seller:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(product.seller_name || 'Seller')}</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Product Type:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">
                                <span class="product-badge ${product.type === 'digital' ? 'badge-digital' : product.type === 'physical' ? 'badge-physical' : 'badge-affiliate'}">${product.type || 'Physical'}</span>
                            </div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Category:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(product.category || 'Uncategorized')}</div>
                        </div>
                    </div>
                    
                    <!-- Product Description -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(15, 23, 42, 0.5); border-radius: 12px; border: 1px solid var(--border);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-align-left"></i> Description
                        </h4>
                        <div class="info-value" style="white-space: pre-wrap; line-height: 1.6; color: var(--text-gray);">${escapeHtml(product.description || 'No description provided')}</div>
                    </div>
                    
                    <!-- Pricing -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(15, 23, 42, 0.5); border-radius: 12px; border: 1px solid var(--border);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-tag"></i> Pricing
                        </h4>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Price:</div>
                            <div class="info-value" style="flex: 1; font-size: 24px; color: var(--success); font-weight: bold;">${fmtPrice(product.price)}</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Platform Fee (10%):</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${fmtPrice(product.price * 0.10)}</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Seller Earns:</div>
                            <div class="info-value" style="flex: 1; color: var(--success);">${fmtPrice(product.price * 0.90)}</div>
                        </div>
                    </div>
                    
                    ${product.type === 'physical' ? `
                    <!-- Condition Section -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(15, 23, 42, 0.5); border-radius: 12px; border: 1px solid var(--border);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-clipboard-check"></i> Product Condition
                        </h4>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Condition:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">
                                <span class="badge-condition ${conditionClass}" style="display: inline-block; padding: 4px 12px; border-radius: 20px; background: var(--primary-dark);">${conditionDisplay}</span>
                            </div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Condition Notes:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(conditionDescription)}</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Visible Defects:</div>
                            <div class="info-value" style="flex: 1; color: var(--warning);">${escapeHtml(defectsDisplay)}</div>
                        </div>
                    </div>
                    
                    <!-- Warranty & Packaging -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(15, 23, 42, 0.5); border-radius: 12px; border: 1px solid var(--border);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-shield-alt"></i> Warranty & Packaging
                        </h4>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Warranty:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${warrantyDisplay}</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Original Packaging:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${originalPackaging}</div>
                        </div>
                        ${product.manufacturing_date ? `
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Manufacturing Date:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${manufacturingDate}</div>
                        </div>
                        ` : ''}
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Accessories Included:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(accessoriesDisplay)}</div>
                        </div>
                    </div>
                    
                    <!-- Delivery/Pickup Details -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(15, 23, 42, 0.5); border-radius: 12px; border: 1px solid var(--border);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-truck"></i> Delivery & Pickup Options
                        </h4>
                        ${deliveryType === 'delivery' || deliveryType === 'both' ? `
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Home Delivery:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">✅ Available</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Ships to:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(deliveryCountries)}</div>
                        </div>
                        ${deliveryStates ? `
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">States/Provinces:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(deliveryStates)}</div>
                        </div>
                        ` : ''}
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Est. Delivery:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${estimatedDays} ${estimatedDays === 1 ? 'day' : 'days'}</div>
                        </div>
                        ` : ''}
                        
                        ${deliveryType === 'pickup' || deliveryType === 'both' ? `
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light); margin-top: 12px;">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Store Pickup:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">✅ Available</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Pickup Location:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(pickupAddress)}</div>
                        </div>
                        ${pickupHours ? `
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Pickup Hours:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(pickupHours)}</div>
                        </div>
                        ` : ''}
                        ${pickupInstructions ? `
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Pickup Instructions:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">${escapeHtml(pickupInstructions)}</div>
                        </div>
                        ` : ''}
                        ` : ''}
                    </div>
                    
                    <!-- Purchase Protection -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(16, 185, 129, 0.05); border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2);">
                        <h4 style="margin: 0 0 12px 0; color: var(--success); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-shield-alt"></i> Purchase Protection
                        </h4>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Escrow:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">Funds held 5 days after delivery confirmation</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Refund Window:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">5 days after delivery confirmation</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Return Options:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">Home pickup (3% fee) or Dropoff (free)</div>
                        </div>
                    </div>
                    ` : product.type === 'digital' ? `
                    <!-- Digital Product Info -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(15, 23, 42, 0.5); border-radius: 12px; border: 1px solid var(--border);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-download"></i> Digital Product Info
                        </h4>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Delivery:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">Instant download after payment</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Format:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">Digital file (PDF/ZIP/MP3/MP4)</div>
                        </div>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Access:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">Download link sent to email</div>
                        </div>
                    </div>
                    ` : ''}
                    
                    <!-- Reviews Summary -->
                    <div class="info-section" style="margin-bottom: 20px; padding: 16px; background: rgba(15, 23, 42, 0.5); border-radius: 12px; border: 1px solid var(--border);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-star"></i> Customer Reviews
                        </h4>
                        <div class="info-row" style="display: flex; margin-bottom: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                            <div class="info-label" style="width: 140px; font-weight: 600; color: var(--text-light);">Rating:</div>
                            <div class="info-value" style="flex: 1; color: var(--text-gray);">
                                <span class="rating-stars">${'⭐'.repeat(Math.floor(product.rating || 0))}</span>
                                <span> (${product.review_count || 0} reviews)</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div class="details-actions" style="display: flex; gap: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border);">
                    ${product.type === 'physical' ? `
                        <button class="btn primary" onclick="closeProductFullDetailsModal(); orderPhysicalProduct(${product.id})" style="flex: 2;">
                            <i class="fas fa-shopping-cart"></i> Place Order
                        </button>
                        <button class="btn secondary" onclick="closeProductFullDetailsModal()" style="flex: 1;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    ` : product.type === 'digital' ? `
                        <button class="btn primary" onclick="closeProductFullDetailsModal(); buyProduct(${product.id})" style="flex: 2;">
                            <i class="fas fa-shopping-cart"></i> Buy Now
                        </button>
                        <button class="btn secondary" onclick="closeProductFullDetailsModal()" style="flex: 1;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    ` : `
                        <button class="btn primary" onclick="closeProductFullDetailsModal(); openAffiliate('${escapeHtml(product.affiliate_link || '')}')" style="flex: 2;">
                            <i class="fas fa-external-link-alt"></i> Visit Affiliate Link
                        </button>
                        <button class="btn secondary" onclick="closeProductFullDetailsModal()" style="flex: 1;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('productFullDetailsModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}


function closeProductFullDetailsModal() {
    const modal = document.getElementById('productFullDetailsModal');
    if (modal) modal.remove();
}

function openImageModal(imageUrl) {
    const modalHtml = `
        <div class="modal open" id="imageModal" onclick="closeImageModal()">
            <div class="image-modal-content" style="max-width: 90vw; max-height: 90vh; display: flex; align-items: center; justify-content: center;">
                <img src="${imageUrl}" style="max-width: 100%; max-height: 90vh; border-radius: 8px;">
                <button class="close-image" onclick="event.stopPropagation(); closeImageModal()" style="position: absolute; top: 20px; right: 30px; background: rgba(0,0,0,0.5); border: none; color: white; font-size: 30px; cursor: pointer; width: 40px; height: 40px; border-radius: 50%;">&times;</button>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('imageModal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) modal.remove();
}window.showProductFullDetails = showProductFullDetails;

function closeProductFullDetailsModal() {
    const modal = document.getElementById('productFullDetailsModal');
    if (modal) modal.remove();
}
window.closeProductFullDetailsModal = closeProductFullDetailsModal;

function openImageModal(imageUrl) {
    const modalHtml = `<div class="modal open" id="imageModal" onclick="closeImageModal()">
        <div class="image-modal-content" style="max-width: 90vw; max-height: 90vh; display: flex; align-items: center; justify-content: center;">
            <img src="${imageUrl}" style="max-width: 100%; max-height: 90vh; border-radius: 8px;">
            <button class="close-image" onclick="event.stopPropagation(); closeImageModal()" style="position: absolute; top: 20px; right: 30px; background: rgba(0,0,0,0.5); border: none; color: white; font-size: 30px; cursor: pointer; width: 40px; height: 40px; border-radius: 50%;">&times;</button>
        </div>
    </div>`;
    const existingModal = document.getElementById('imageModal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}
window.openImageModal = openImageModal;

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) modal.remove();
}
window.closeImageModal = closeImageModal;

// ============================================
// SELLER DASHBOARD FUNCTIONS
// ============================================
async function loadDashboardStats() {
    try {
        if (!currentUser) return;
        const productsRes = await fetch(`/api/products/seller/${currentUser.id}`, { credentials: 'include' });
        let totalProducts = 0, totalShares = 0;
        if (productsRes.ok) {
            const productsData = await productsRes.json();
            totalProducts = productsData.length;
            totalShares = productsData.reduce((sum, p) => sum + (p.share_count || 0), 0);
        }
        const ordersRes = await fetch(`/api/orders/seller/${currentUser.id}`, { credentials: 'include' });
        let totalSales = 0, totalRevenue = 0;
        if (ordersRes.ok) {
            const ordersData = await ordersRes.json();
            totalSales = ordersData.length;
            totalRevenue = ordersData.reduce((sum, order) => sum + (parseFloat(order.total_amount) || 0), 0);
        }
        const totalProductsEl = document.getElementById('totalProducts');
        const totalSalesEl = document.getElementById('totalSales');
        const totalRevenueEl = document.getElementById('totalRevenue');
        const totalSharesEl = document.getElementById('totalShares');
        if (totalProductsEl) totalProductsEl.textContent = totalProducts;
        if (totalSalesEl) totalSalesEl.textContent = totalSales;
        if (totalRevenueEl) totalRevenueEl.textContent = `$${totalRevenue.toFixed(2)}`;
        if (totalSharesEl) totalSharesEl.textContent = totalShares;
    } catch (error) { console.error('Error loading dashboard stats:', error); }
}

async function loadMyProducts() {
    const container = document.getElementById('myProductsList');
    if (!container) return;
    try {
        if (!currentUser) return;
        const searchTerm = document.getElementById('searchMyProducts')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('filterMyProducts')?.value || 'all';
        const response = await fetch(`/api/products/seller/${currentUser.id}`, { credentials: 'include' });
        if (!response.ok) {
            if (response.status === 404) {
                container.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><h4>No products yet</h4><p>Start by listing your first product</p></div>`;
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        let myProducts = await response.json();
        if (searchTerm) myProducts = myProducts.filter(p => p.title.toLowerCase().includes(searchTerm) || (p.category && p.category.toLowerCase().includes(searchTerm)));
        if (statusFilter !== 'all') myProducts = myProducts.filter(p => p.status === statusFilter);
        if (!myProducts || myProducts.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><h4>No products found</h4><p>${searchTerm ? 'Try a different search term' : 'Start by listing your first product'}</p></div>`;
            return;
        }
        let html = `<div style="overflow-x: auto;"><table style="width:100%; border-collapse: collapse;"><thead><tr style="background: var(--card-bg);">
            <th style="padding: 12px; text-align: left;">Product</th><th style="padding: 12px; text-align: left;">Type</th>
            <th style="padding: 12px; text-align: left;">Price</th><th style="padding: 12px; text-align: left;">Shares</th>
            <th style="padding: 12px; text-align: left;">Status</th><th style="padding: 12px; text-align: left;">Actions</th></tr></thead><tbody>`;
        for (const product of myProducts) {
            const productImage = getProductImage(product.images, 0);
            const status = getProductStatus(product);
            const statusClass = getStatusClass(status);
            const statusDisplay = formatStatusDisplay(status);
            html += `<tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px;"><div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 8px; background: var(--secondary-dark); overflow: hidden;">
                        ${productImage ? `<img src="${productImage}" alt="${product.title}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">` : 
                         `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-gray);"><i class="fas fa-box"></i></div>`}
                    </div>
                    <div><strong style="color: var(--text-light); display: block; font-size: 13px;">${escapeHtml(product.title || 'Untitled')}</strong>
                    <small style="color: var(--text-gray); font-size: 11px;">${escapeHtml(product.category || 'Uncategorized')}</small></div>
                </div></td>
                <td style="padding: 12px;"><span class="product-badge badge-${product.type || 'physical'}">${product.type || 'Physical'}</span></td>
                <td style="padding: 12px;"><strong style="color: var(--accent);">${fmtPrice(parseFloat(product.price || 0))}</strong></td>
                <td style="padding: 12px;"><span style="color: var(--text-light);"><i class="fas fa-share-alt"></i> ${product.share_count || 0}</span></td>
                <td style="padding: 12px;"><span class="product-status ${statusClass}">${statusDisplay}</span></td>
                <td style="padding: 12px;"><div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="action-btn view" onclick="viewProduct(${product.id})"><i class="fas fa-eye"></i></button>
                    <button class="action-btn edit" onclick="editProduct(${product.id})"><i class="fas fa-edit"></i></button>
                    <button class="action-btn share" onclick="shareProduct(${product.id}, '${escapeHtml(product.title).replace(/'/g, "\\'")}')"><i class="fas fa-share-alt"></i></button>
                    <button class="action-btn delete" onclick="deleteProduct(${product.id})"><i class="fas fa-trash"></i></button>
                </div></td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
        container.innerHTML = html;
    } catch (error) { console.error('Error loading my products:', error); container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Error loading products</h4><p>Please refresh and try again</p></div>`; }
}

async function loadSalesHistory() {
    const container = document.getElementById('salesList');
    if (!container) return;
    try {
        if (!currentUser) return;
        const statusFilter = document.getElementById('salesStatus')?.value || 'all';
        const periodFilter = document.getElementById('salesPeriod')?.value || 'all';
        const response = await fetch(`/api/orders/seller/${currentUser.id}`, { credentials: 'include' });
        if (!response.ok) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Error loading sales</h4></div>'; return; }
        let sales = await response.json();
        if (statusFilter !== 'all') sales = sales.filter(sale => sale.order_status === statusFilter);
        if (periodFilter !== 'all') {
            const now = new Date();
            sales = sales.filter(sale => {
                const saleDate = new Date(sale.created_at);
                if (periodFilter === 'today') return saleDate.toDateString() === now.toDateString();
                if (periodFilter === 'week') { const weekAgo = new Date(now.setDate(now.getDate() - 7)); return saleDate >= weekAgo; }
                if (periodFilter === 'month') { const monthAgo = new Date(now.setMonth(now.getMonth() - 1)); return saleDate >= monthAgo; }
                return true;
            });
        }
        if (sales.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-shopping-cart"></i><h4>No sales yet</h4><p>Your sales will appear here</p></div>`;
            const totalSalesValueEl = document.getElementById('totalSalesValue');
            const yourEarningsEl = document.getElementById('yourEarnings');
            const platformFeeEl = document.getElementById('platformFee');
            if (totalSalesValueEl) totalSalesValueEl.textContent = '$0.00';
            if (yourEarningsEl) yourEarningsEl.textContent = '$0.00';
            if (platformFeeEl) platformFeeEl.textContent = '$0.00';
            return;
        }
        let html = `<div style="overflow-x: auto;"><table style="width:100%; border-collapse: collapse;"><thead><tr style="background: var(--card-bg);">
            <th style="padding: 12px; text-align: left;">Order ID</th><th style="padding: 12px; text-align: left;">Product</th>
            <th style="padding: 12px; text-align: left;">Qty</th><th style="padding: 12px; text-align: left;">Total</th>
            <th style="padding: 12px; text-align: left;">Your Earnings</th><th style="padding: 12px; text-align: left;">Status</th>
            <th style="padding: 12px; text-align: left;">Date</th><th style="padding: 12px; text-align: left;">Actions</th></tr></thead><tbody>`;
        let totalSalesValue = 0, totalPlatformFees = 0;
        for (const sale of sales) {
            const totalAmount = parseFloat(sale.total_amount) || 0;
            const platformFee = parseFloat(sale.platform_fee) || (totalAmount * 0.1);
            const sellerEarnings = totalAmount - platformFee;
            totalSalesValue += totalAmount;
            totalPlatformFees += platformFee;
            let statusClass = '', statusText = '';
            switch(sale.order_status) {
                case 'pending_seller_approval': statusClass = 'status-pending'; statusText = '⏳ Pending Approval'; break;
                case 'seller_accepted': statusClass = 'status-warning'; statusText = '✅ Accepted - Awaiting Payment'; break;
                case 'paid': statusClass = 'status-info'; statusText = '💰 Paid (Escrow)'; break;
                case 'completed': statusClass = 'status-success'; statusText = '✓ Completed'; break;
                case 'refunded': statusClass = 'status-success'; statusText = '✅ Refunded'; break;
                case 'cancelled': statusClass = 'status-danger'; statusText = '✗ Cancelled'; break;
                default: statusClass = 'status-pending'; statusText = sale.order_status?.replace(/_/g, ' ') || 'Pending';
            }
            html += `<tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px;"><strong style="color: var(--accent);">#${sale.id}</strong></td>
                <td style="padding: 12px;"><strong>${escapeHtml(sale.product_name || 'Product')}</strong></td>
                <td style="padding: 12px;">${sale.quantity || 1}</td>
                <td style="padding: 12px;"><strong style="color: var(--success);">${fmtPrice(totalAmount)}</strong></td>
                <td style="padding: 12px;"><strong style="color: var(--success);">${fmtPrice(sellerEarnings)}</strong></td>
                <td style="padding: 12px;"><span class="product-status ${statusClass}">${statusText}</span></td>
                <td style="padding: 12px; font-size: 12px;">${new Date(sale.created_at).toLocaleDateString()}</td>
                <td style="padding: 12px;"><button class="action-btn view" onclick="viewOrderDetails(${sale.id})"><i class="fas fa-eye"></i></button></td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
        container.innerHTML = html;
        const totalSalesValueEl = document.getElementById('totalSalesValue');
        const yourEarningsEl = document.getElementById('yourEarnings');
        const platformFeeEl = document.getElementById('platformFee');
        if (totalSalesValueEl) totalSalesValueEl.textContent = fmtPrice(totalSalesValue);
        if (yourEarningsEl) yourEarningsEl.textContent = fmtPrice(totalSalesValue - totalPlatformFees);
        if (platformFeeEl) platformFeeEl.textContent = fmtPrice(totalPlatformFees);
    } catch (error) { console.error('Error loading sales:', error); container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Error loading sales</h4></div>'; }
}

  async function loadPaidOrders() {
    const container = document.getElementById('paidOrdersList');
    if (!container) {
        console.error('Container paidOrdersList not found');
        return;
    }
    
    try {
        console.log('Loading paid orders for seller...');
        
        const response = await fetch('/api/seller/paid-orders', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to load paid orders');
        }
        
        const data = await response.json();
        const paidOrders = data.orders || [];
        
        // Update badge
        const badge = document.getElementById('paidBadge');
        if (badge) {
            if (paidOrders.length > 0) {
                badge.textContent = paidOrders.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
        
        if (paidOrders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-money-bill-wave"></i>
                    <h4>No paid orders</h4>
                    <p>When customers pay for orders, they'll appear here ready for shipment</p>
                </div>
            `;
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 16px;">';
        
        for (const order of paidOrders) {
            // Check order status to determine UI state
            const hasDeliveryCode = order.has_delivery_code || (order.delivery_code && order.order_status === 'shipped');
            const isDelivered = order.order_status === 'delivered';
            const isCompleted = order.order_status === 'completed';
            const isShipped = order.order_status === 'shipped';
            
            // Determine which UI to show
            let deliverySectionHtml = '';
            
            if (isDelivered || isCompleted) {
                // ✅ DELIVERY CONFIRMED - Show success message
                deliverySectionHtml = `
                    <div style="width: 100%; margin-top: 16px; padding: 16px; background: rgba(16, 185, 129, 0.15); border-radius: 8px; border-left: 4px solid var(--success);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <i class="fas fa-check-circle" style="font-size: 24px; color: var(--success);"></i>
                            <div>
                                <h4 style="margin: 0 0 4px 0; color: var(--success);">✅ Delivery Confirmed!</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-gray);">
                                    ${isCompleted ? 'Funds have been released to your account.' : '5-day escrow period has started. Funds will be released after 5 days.'}
                                </p>
                                ${order.payment_held_until && !isCompleted ? `
                                    <p style="margin: 8px 0 0 0; font-size: 12px; color: var(--text-muted);">
                                        <i class="fas fa-clock"></i> Funds release date: ${new Date(order.payment_held_until).toLocaleDateString()}
                                    </p>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            } else if (hasDeliveryCode && isShipped) {
                // 📦 DELIVERY CODE GENERATED - Show code input for verification
                deliverySectionHtml = `
                    <div id="deliveryConfirmSection_${order.id}" style="width: 100%; margin-top: 16px; padding: 16px; background: rgba(59, 130, 246, 0.1); border-radius: 8px; border: 1px solid var(--accent);">
                        <h4 style="margin: 0 0 12px 0; color: var(--accent);">
                            <i class="fas fa-key"></i> Verify Delivery
                        </h4>
                        <p style="margin: 0 0 12px 0; font-size: 13px; color: var(--text-gray);">
                            Ask the customer for the 6-digit delivery code they received via email:
                        </p>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                            <input type="text" id="deliveryCode_${order.id}" 
                                   placeholder="Enter 6-digit code" 
                                   maxlength="6" 
                                   style="flex: 1; padding: 12px; border-radius: 8px; background: var(--primary-dark); border: 1px solid var(--border); color: white; font-size: 20px; text-align: center; letter-spacing: 4px;">
                            <button class="btn success" onclick="verifyDeliveryWithCode(${order.id})" style="background: var(--success);">
                                <i class="fas fa-check-circle"></i> Verify Delivery
                            </button>
                        </div>
                        <p class="form-help" style="margin-top: 8px; font-size: 11px;">
                            <i class="fas fa-info-circle"></i> After verification, a 5-day escrow period starts
                        </p>
                    </div>
                `;
            } else if (!hasDeliveryCode && !isDelivered) {
                // 🚚 NO CODE YET - Show Generate Delivery Code button
                deliverySectionHtml = `
                    <div style="margin-top: 16px;">
                        <button class="btn primary" onclick="generateDeliveryCode(${order.id})" style="background: var(--accent); width: 100%;">
                            <i class="fas fa-truck"></i> Generate Delivery Code
                        </button>
                        <p class="form-help" style="margin-top: 8px; font-size: 11px; text-align: center;">
                            <i class="fas fa-envelope"></i> A 6-digit code will be sent to the customer via email
                        </p>
                    </div>
                `;
            }
            
            html += `
                <div class="order-card" style="background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border); overflow: hidden;">
                    <div style="padding: 16px; background: rgba(16, 185, 129, 0.1); border-bottom: 1px solid var(--border);">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                            <div>
                                <h4 style="margin: 0; color: var(--success);">💰 Order #${order.id}</h4>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-gray);">
                                    Paid: ${order.payment_collected_at ? new Date(order.payment_collected_at).toLocaleString() : 'Date not available'}
                                </p>
                            </div>
                            <div style="text-align: right;">
                                <span class="product-status status-info"><i class="fas fa-check-circle"></i> Payment Confirmed</span>
                                <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700; color: var(--success);">
                                    ${fmtPrice(order.total_amount || 0)}
                                </p>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--success);">
                                    <i class="fas fa-wallet"></i> You earn: ${fmtPrice(order.seller_earnings || (order.total_amount * 0.9))}
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="padding: 16px;">
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <div style="flex: 2;">
                                <h5 style="margin: 0 0 8px 0;">${escapeHtml(order.product_name || 'Product')}</h5>
                                <p style="margin: 0 0 4px 0;"><strong>Quantity:</strong> ${order.quantity || 1}</p>
                                <p style="margin: 0 0 4px 0;"><strong>Customer:</strong> ${escapeHtml(order.customer_name || 'Customer')}</p>
                                <p style="margin: 0 0 4px 0;"><strong>Phone:</strong> ${escapeHtml(order.delivery_phone || 'N/A')}</p>
                            </div>
                            <div style="flex: 3;">
                                <p style="margin: 0 0 4px 0;"><strong><i class="fas fa-map-marker-alt"></i> Shipping Address:</strong></p>
                                <p style="margin: 0 0 4px 0; font-size: 13px; color: var(--text-gray);">
                                    ${escapeHtml(order.shipping_address || 'No address provided')}<br>
                                    ${order.city ? escapeHtml(order.city) : ''}${order.state ? `, ${escapeHtml(order.state)}` : ''}${order.country ? `, ${escapeHtml(order.country)}` : ''}
                                </p>
                                <p style="margin: 8px 0 0 0; font-size: 12px; color: var(--text-muted);">
                                    <i class="fas fa-clock"></i> Estimated delivery: ${order.estimated_delivery_days || 7} days
                                </p>
                            </div>
                        </div>
                        
                        ${deliverySectionHtml}
                        
                        <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap;">
                            <button class="small-btn" onclick="viewOrderDetails(${order.id})">
                                <i class="fas fa-eye"></i> View Details
                            </button>
                            <button class="small-btn info" onclick="viewEscrowStatus(${order.id})">
                                <i class="fas fa-lock"></i> View Escrow Status
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading paid orders:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h4>Error loading paid orders</h4>
                <p>${error.message || 'Please try again'}</p>
                <button onclick="loadPaidOrders()" class="btn primary" style="margin-top: 12px;">Retry</button>
            </div>
        `;
    }
}
window.loadPaidOrders = loadPaidOrders;
// ============================================
// LOAD BUYER PURCHASES (My Purchases Tab)
// ============================================
async function loadMyPurchases() {
    const container = document.getElementById('purchasesList');
    if (!container) return;
    
    try {
        console.log('Loading buyer purchases...');
        
        const filter = document.getElementById('purchaseFilter')?.value || 'all';
        
        const response = await fetch('/api/my-orders', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load purchases');
        }
        
        const data = await response.json();
        let orders = data.orders || [];
        
        // Apply filter
        if (filter !== 'all') {
            orders = orders.filter(order => order.order_status === filter);
        }
        
        if (orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shopping-bag"></i>
                    <h4>No purchases found</h4>
                    <p>${filter !== 'all' ? 'No orders with this status' : 'You haven\'t purchased any products yet'}</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="purchases-grid">';
        
        for (const order of orders) {
            const orderDate = new Date(order.created_at).toLocaleDateString();
            const totalAmount = parseFloat(order.total_amount);
            const orderStatus = order.order_status;
            const paymentStatus = order.payment_status;
            
            // Calculate escrow/refund info
            let refundAvailable = false;
            let refundDeadline = null;
            let canReorder = true;
            let canRefund = false;
            let daysLeft = 0;
            
            if (orderStatus === 'delivered' && order.payment_held_until) {
                const releaseDate = new Date(order.payment_held_until);
                const now = new Date();
                daysLeft = Math.ceil((releaseDate - now) / (1000 * 60 * 60 * 24));
                refundAvailable = daysLeft > 0 && daysLeft <= 5;
                canRefund = refundAvailable;
                refundDeadline = releaseDate;
            } else if (orderStatus === 'paid' || orderStatus === 'processing' || orderStatus === 'shipped') {
                // Pre-delivery refund available
                canRefund = true;
                refundAvailable = true;
            } else if (orderStatus === 'completed') {
                canRefund = false;
                canReorder = true;
            } else if (orderStatus === 'refunded') {
                canRefund = false;
                canReorder = true;
            }
            
            // Status badge styling
            let statusClass = '';
            let statusText = '';
            switch(orderStatus) {
                case 'pending_seller_approval':
                    statusClass = 'status-warning';
                    statusText = '⏳ Awaiting Seller Approval';
                    break;
                case 'seller_accepted':
                    statusClass = 'status-info';
                    statusText = '✅ Accepted - Payment Required';
                    break;
                case 'paid':
                    statusClass = 'status-info';
                    statusText = '💰 Paid - Processing';
                    break;
                case 'shipped':
                    statusClass = 'status-info';
                    statusText = '📦 Shipped';
                    break;
                case 'delivered':
                    statusClass = 'status-success';
                    statusText = '🚚 Delivered';
                    break;
                case 'completed':
                    statusClass = 'status-success';
                    statusText = '✓ Completed';
                    break;
                case 'refunded':
                    statusClass = 'status-success';
                    statusText = '✅ Refunded';
                    break;
                case 'cancelled':
                    statusClass = 'status-danger';
                    statusText = '✗ Cancelled';
                    break;
                default:
                    statusClass = 'status-pending';
                    statusText = orderStatus?.replace(/_/g, ' ') || 'Processing';
            }
            
            html += `
                <div class="purchase-card" data-order-id="${order.id}" data-product-id="${order.product_id}">
                    <div class="purchase-header">
                        <div class="purchase-order-id">
                            <strong>Order #${order.id}</strong> • ${orderDate}
                        </div>
                        <div>
                            <span class="purchase-status ${statusClass}">${statusText}</span>
                        </div>
                    </div>
                    
                    <div class="purchase-body">
                        <div class="purchase-image">
                            ${order.product_image ? 
                                `<img src="${order.product_image}" alt="${escapeHtml(order.product_name)}" onerror="this.src='https://placehold.co/120x120/1e293b/3b82f6/png?text=Product'">` :
                                `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--secondary-dark);">
                                    <i class="fas fa-box" style="font-size: 32px; color: var(--text-muted);"></i>
                                </div>`
                            }
                        </div>
                        <div class="purchase-details">
                            <h4 class="purchase-title">${escapeHtml(order.product_name)}</h4>
                            <div class="purchase-seller">
                                <i class="fas fa-store"></i> Sold by: ${escapeHtml(order.seller_name || 'Seller')}
                            </div>
                            <div class="purchase-meta">
                                <div class="purchase-meta-item">
                                    <span class="label">Quantity</span>
                                    <span class="value">${order.quantity}</span>
                                </div>
                                <div class="purchase-meta-item">
                                    <span class="label">Unit Price</span>
                                    <span class="value">${fmtPrice(order.price)}</span>
                                </div>
                                <div class="purchase-meta-item">
                                    <span class="label">Total Paid</span>
                                    <span class="value purchase-price">${fmtPrice(totalAmount)}</span>
                                </div>
                            </div>
                            ${order.shipping_address ? `
                                <div class="purchase-timeline">
                                    <i class="fas fa-map-marker-alt"></i> 
                                    Delivery to: ${escapeHtml(order.shipping_address)}
                                    ${order.delivery_phone ? `<br><i class="fas fa-phone"></i> Contact: ${escapeHtml(order.delivery_phone)}` : ''}
                                </div>
                            ` : ''}
                            
                            ${refundAvailable && canRefund ? `
                                <div class="refund-warning">
                                    <i class="fas fa-clock"></i> 
                                    <strong>Refund available for ${daysLeft} more day${daysLeft !== 1 ? 's' : ''}!</strong><br>
                                    You have until ${refundDeadline?.toLocaleDateString()} to request a refund.
                                </div>
                            ` : orderStatus === 'delivered' && !refundAvailable ? `
                                <div class="refund-warning" style="background: rgba(239, 68, 68, 0.1); border-left-color: var(--danger);">
                                    <i class="fas fa-lock"></i> 
                                    <strong>Refund window has closed.</strong><br>
                                    Funds have been released to the seller.
                                </div>
                            ` : ''}
                            
                            ${order.payment_held_until && orderStatus === 'delivered' ? `
                                <div class="escrow-info">
                                    <i class="fas fa-shield-alt"></i> 
                                    Escrow protection until: ${new Date(order.payment_held_until).toLocaleDateString()}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="purchase-actions">
                        ${canRefund && refundAvailable ? `
                            <button class="btn danger" onclick="requestRefundForOrder(${order.id}, '${escapeHtml(order.product_name).replace(/'/g, "\\'")}')" style="background: var(--danger);">
                                <i class="fas fa-undo-alt"></i> Request Refund
                            </button>
                        ` : ''}
                        
                        <button class="btn primary" onclick="reorderProduct(${order.product_id})">
                            <i class="fas fa-shopping-cart"></i> Order Again
                        </button>
                        
                        <button class="small-btn" onclick="viewOrderDetails(${order.id})">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                        
                        ${order.order_status === 'seller_accepted' ? `
                            <button class="btn success" onclick="proceedToPayment(${order.id})">
                                <i class="fas fa-credit-card"></i> Pay Now
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading purchases:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h4>Error loading purchases</h4>
                <p>${error.message || 'Please refresh and try again'}</p>
                <button onclick="loadMyPurchases()" class="btn primary" style="margin-top: 12px;">Retry</button>
            </div>
        `;
    }
}
// ============================================
// REQUEST REFUND WITH RETURN OPTIONS
// ============================================
async function requestRefundForOrder(orderId, productName) {
    if (!currentUser) {
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    // Show refund options modal
    const modalHtml = `
        <div class="modal open" id="refundRequestModal">
            <div class="modal-card refund-modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0;"><i class="fas fa-undo-alt" style="color: var(--warning);"></i> Request Refund</h3>
                    <span class="close-x" onclick="closeRefundModal()">&times;</span>
                </div>
                
                <p><strong>Product:</strong> ${escapeHtml(productName)}</p>
                <p><strong>Order #${orderId}</strong></p>
                
                <div class="form-group">
                    <label>Reason for refund <span class="required">*</span></label>
                    <textarea id="refundReason" class="form-textarea" rows="3" placeholder="Please explain why you want a refund..."></textarea>
                </div>
                
                <div class="refund-options">
                    <label style="display: block; margin-bottom: 12px; font-weight: 600;">Return Method <span class="required">*</span></label>
                    
                    <div class="refund-option" data-option="dropoff" onclick="selectRefundOption('dropoff')">
                        <div class="refund-option-title">📦 Dropoff - Free</div>
                        <div class="refund-option-desc">Drop off the product at the seller's location. Full refund, no fees.</div>
                    </div>
                    
                    <div class="refund-option" data-option="pickup" onclick="selectRefundOption('pickup')">
                        <div class="refund-option-title">🚚 Home Pickup - 3% Fee</div>
                        <div class="refund-option-desc">Seller picks up from your address. 3% fee deducted from refund.</div>
                    </div>
                    
                    <div id="pickupAddressField" class="pickup-address-field">
                        <label class="form-label">Pickup Address <span class="required">*</span></label>
                        <textarea id="pickupAddress" class="form-textarea" rows="2" placeholder="Enter your full address for pickup..."></textarea>
                        <span class="form-help">The seller will pick up the product from this address</span>
                    </div>
                </div>
                
                <div class="modal-buttons" style="display: flex; gap: 12px; margin-top: 20px;">
                    <button class="btn danger" onclick="submitRefundRequest(${orderId})" style="flex: 1;">
                        <i class="fas fa-paper-plane"></i> Submit Refund Request
                    </button>
                    <button class="btn secondary" onclick="closeRefundModal()" style="flex: 1;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('refundRequestModal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Set default selection
    window.selectedRefundOption = 'dropoff';
    document.querySelector('.refund-option[data-option="dropoff"]')?.classList.add('selected');
}

function closeRefundModal() {
    const modal = document.getElementById('refundRequestModal');
    if (modal) modal.remove();
}

function selectRefundOption(option) {
    window.selectedRefundOption = option;
    
    document.querySelectorAll('.refund-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelector(`.refund-option[data-option="${option}"]`)?.classList.add('selected');
    
    const pickupField = document.getElementById('pickupAddressField');
    if (pickupField) {
        pickupField.classList.toggle('show', option === 'pickup');
    }
}

async function submitRefundRequest(orderId) {
    const reason = document.getElementById('refundReason')?.value.trim();
    const returnOption = window.selectedRefundOption || 'dropoff';
    const pickupAddress = document.getElementById('pickupAddress')?.value.trim();
    
    if (!reason || reason.length < 10) {
        showToast('Error', 'Please provide a detailed reason (minimum 10 characters)', 'danger');
        return;
    }
    
    if (returnOption === 'pickup' && !pickupAddress) {
        showToast('Error', 'Please provide your pickup address', 'danger');
        return;
    }
    
    closeRefundModal();
    showToast('Submitting refund request...', 'info');
    
    try {
        const response = await fetch(`/api/physical-orders/${orderId}/refund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reason: reason,
                return_option: returnOption,
                pickup_address: returnOption === 'pickup' ? pickupAddress : null
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(
                'Refund Request Submitted', 
                `Your refund request has been submitted. The seller will respond within 48 hours.`,
                'success'
            );
            loadMyPurchases(); // Refresh the purchases list
        } else {
            showToast('Error', data.error || 'Failed to submit refund request', 'danger');
        }
    } catch (error) {
        console.error('Refund request error:', error);
        showToast('Error', 'Network error. Please try again.', 'danger');
    }
}

async function reorderProduct(productId) {
    if (!currentUser) {
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    showToast('Redirecting to product...', 'info');
    setTimeout(() => {
        window.location.href = `/products.html?product=${productId}`;
    }, 500);
}

async function generateDeliveryCode(orderId) {
    if (!confirm("Once you click OK, a delivery code will be sent to the customer. This will mark the order as shipped and cannot be undone.")) {
        return;
    }
    
    // Show loading state on button
    const buttons = document.querySelectorAll(`button[onclick*="generateDeliveryCode(${orderId})"]`);
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    });
    
    try {
        const response = await fetch(`/api/orders/${orderId}/generate-delivery-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(
                '✅ Delivery Code Sent!', 
                `A 6-digit delivery code has been sent to the customer. Ask them for this code when delivering the product.`,
                'success'
            );
            
            // Refresh the paid orders list to show the delivery confirmation section
            await loadPaidOrders();
            
        } else {
            showToast('Error', data.error || 'Failed to generate delivery code', 'danger');
            // Re-enable buttons on error
            buttons.forEach(btn => {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-truck"></i> Generate Delivery Code';
            });
        }
    } catch (error) {
        console.error('Error generating delivery code:', error);
        showToast('Error', 'Network error. Please try again.', 'danger');
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-truck"></i> Generate Delivery Code';
        });
    }
}
window.generateDeliveryCode = generateDeliveryCode;


async function verifyDeliveryWithCode(orderId) {
    const codeInput = document.getElementById(`deliveryCode_${orderId}`);
    const deliveryCode = codeInput?.value.trim();
    
    if (!deliveryCode || deliveryCode.length !== 6) {
        showToast('Invalid Code', 'Please enter the 6-digit delivery code provided by the customer.', 'warning');
        return;
    }
    
    if (!confirm("⚠️ IMPORTANT: Only confirm delivery AFTER the customer has received the product and provided the delivery code.\n\nConfirming will start the 5-day escrow countdown. The customer will have 5 days to request a refund.")) {
        return;
    }
    
    const confirmBtn = document.querySelector(`#deliveryConfirmSection_${orderId} .btn.success`);
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    }
    
    try {
        // Use the seller endpoint
        const response = await fetch(`/api/orders/${orderId}/verify-delivery-seller`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delivery_code: deliveryCode }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(
                '✅ Delivery Verified!', 
                `5-day escrow period has started. Funds will be released to you after 5 days.`,
                'success'
            );
            // Refresh the paid orders list - this will now show the "Delivery Confirmed" message
            await loadPaidOrders();
        } else {
            showToast('Error', data.error || 'Invalid delivery code. Please check with the customer.', 'danger');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify Delivery';
            }
        }
    } catch (error) {
        console.error('Error verifying delivery:', error);
        showToast('Error', 'Network error. Please try again.', 'danger');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify Delivery';
        }
    }
}
async function viewEscrowStatus(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}/escrow-status`, { credentials: 'include' });
        const data = await response.json();
        let message = '';
        if (data.is_escrow) {
            message = `🔒 ESCROW STATUS\n\nAmount Held: $${data.amount_held?.toFixed(2) || '0.00'}\nYour Earnings: $${data.seller_earnings?.toFixed(2) || '0.00'}\nPlatform Fee: $${data.platform_fee?.toFixed(2) || '0.00'}\n\nStatus: ${data.funds_released ? '✅ Released to you' : '⏳ Held in escrow'}\n${data.payment_held_until ? `Held until: ${new Date(data.payment_held_until).toLocaleDateString()}` : ''}\n\nNote: Funds are released 5 days after customer confirms delivery.`;
        } else { message = 'No escrow information available for this order.'; }
        alert(message);
    } catch (error) { console.error('Escrow status error:', error); alert('Error loading escrow status. Please try again.'); }
}
window.viewEscrowStatus = viewEscrowStatus;

async function loadPendingRefunds() {
    const container = document.getElementById('pendingRefundsList');
    if (!container) return;
    try {
        const response = await fetch('/api/refunds/pending', { credentials: 'include' });
        const data = await response.json();
        if (!data.refunds || data.refunds.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><h4>No pending refund requests</h4><p>All good!</p></div>`;
            return;
        }
        let html = '<div style="display: flex; flex-direction: column; gap: 16px;">';
        for (const refund of data.refunds) {
            const daysPending = Math.floor((new Date() - new Date(refund.refund_requested_at)) / (1000 * 60 * 60 * 24));
            html += `<div class="refund-card" style="background: var(--card-bg); border-radius: 12px; padding: 20px; border: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 16px;">
                    <div style="flex: 1;"><h4 style="margin: 0 0 8px 0; color: var(--text-light);">Order #${refund.id}</h4>
                    <p style="margin: 0 0 4px 0;"><strong>Product:</strong> ${escapeHtml(refund.product_name)}</p>
                    <p style="margin: 0 0 4px 0;"><strong>Quantity:</strong> ${refund.quantity}</p>
                    <p style="margin: 0 0 4px 0;"><strong>Amount:</strong> ${fmtPrice(refund.total_amount)}</p>
                    <p style="margin: 0 0 4px 0;"><strong>Buyer:</strong> ${escapeHtml(refund.buyer_name)} (${escapeHtml(refund.buyer_email)})</p>
                    <p style="margin: 0 0 4px 0;"><strong>Requested:</strong> ${new Date(refund.refund_requested_at).toLocaleDateString()} (${daysPending} days ago)</p>
                    <div style="margin-top: 12px; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">
                        <strong style="color: var(--danger);">Refund Reason:</strong>
                        <p style="margin: 8px 0 0 0; font-size: 13px; color: var(--text-gray);">${escapeHtml(refund.refund_reason)}</p>
                    </div></div>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 20px;">
                    <button class="btn primary" onclick="processRefund(${refund.id}, 'approve')" style="flex: 1; background: var(--success);"><i class="fas fa-check"></i> Approve Refund</button>
                    <button class="btn danger" onclick="processRefund(${refund.id}, 'deny')" style="flex: 1; background: var(--danger);"><i class="fas fa-times"></i> Deny Refund</button>
                </div>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (error) { console.error('Error loading refunds:', error); container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Error loading refunds</h4><p>Please refresh and try again</p></div>`; }
}
window.loadPendingRefunds = loadPendingRefunds;

async function processRefund(orderId, action) {
    const notes = prompt(action === 'approve' ? "Optional notes for the buyer (will be included in notification):" : "Reason for denying refund (will be sent to buyer):");
    try {
        const response = await fetch(`/api/refunds/${orderId}/process`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, admin_notes: notes || null }), credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) { showToast('Refund Processed', data.message, 'success'); loadPendingRefunds(); loadSalesHistory(); }
        else { showToast('Error', data.error || 'Failed to process refund', 'danger'); }
    } catch (error) { console.error('Refund processing error:', error); showToast('Error', 'Network error. Please try again.', 'danger'); }
}
window.processRefund = processRefund;

async function loadCharts() {
    let salesChartInstance = null, categoryChartInstance = null;
    if (salesChartInstance) salesChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();
    const salesCtx = document.getElementById('salesChart');
    if (salesCtx) {
        salesChartInstance = new Chart(salesCtx.getContext('2d'), {
            type: 'line', data: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], datasets: [{
                label: 'Sales', data: [12, 19, 3, 5, 2, 3], borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true
            }] }, options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#e6f1ff' } } },
                scales: { x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                          y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } } }
            }
        });
    }
    const categoryCtx = document.getElementById('categoryChart');
    if (categoryCtx) {
        categoryChartInstance = new Chart(categoryCtx.getContext('2d'), {
            type: 'doughnut', data: { labels: ['Digital', 'Physical', 'Affiliate'], datasets: [{
                data: [40, 35, 25], backgroundColor: ['#8b5cf6', '#06b6d4', '#10b981']
            }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#e6f1ff', padding: 20 } } } }
        });
    }
}
window.loadCharts = loadCharts;

function toggleDashboardView() {
    const dashboardSection = document.getElementById('dashboardSection');
    const buyerView = document.getElementById('buyerView');
    const sellerView = document.getElementById('sellerView');
    
    console.log("Toggling dashboard view. Current state:", {
        dashboardDisplay: dashboardSection?.style.display,
        buyerDisplay: buyerView?.style.display
    });
    
    // If dashboard is hidden or not shown, show it
    if (!dashboardSection || dashboardSection.style.display === 'none' || dashboardSection.style.display === '') {
        if (!currentUser) { 
            openModal(document.getElementById('loginModal')); 
            return; 
        }
        
        // Hide other views
        if (buyerView) buyerView.style.display = 'none';
        if (sellerView) sellerView.style.display = 'none';
        
        // Show dashboard
        dashboardSection.style.display = 'block';
        
        // Load dashboard data
        loadDashboardStats();
        loadMyProducts();
        
        // Initialize tabs
        initDashboardTabs();
        
        // Load share stats
        loadShareStats();
        
        // Check admin features
        if (currentUser && currentUser.role === 'admin') {
            const adminTab = document.getElementById('adminTabBtn');
            const adminControls = document.getElementById('adminControls');
            if (adminTab) adminTab.style.display = 'block';
            if (adminControls) adminControls.style.display = 'block';
            loadAdminData();
        }
        
        console.log("Dashboard opened");
    } else {
        // Close dashboard and go back to buyer view
        dashboardSection.style.display = 'none';
        if (buyerView) buyerView.style.display = 'block';
        console.log("Dashboard closed, buyer view restored");
    }
}
window.toggleDashboardView = toggleDashboardView;

function checkAndShowAdminFeatures() {
    if (currentUser && currentUser.role === 'admin') {
        const adminTab = document.getElementById('adminTabBtn');
        const adminControls = document.getElementById('adminControls');
        if (adminTab) adminTab.style.display = 'block';
        if (adminControls) adminControls.style.display = 'block';
        loadAdminData();
    }
}

async function loadAdminData() {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
        const usersResponse = await fetch('/api/admin/users', { credentials: 'include' });
        if (usersResponse.ok) {
            const users = await usersResponse.json();
            updateUsersTable(users);
        }
        const statsResponse = await fetch('/api/admin/platform-stats', { credentials: 'include' });
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            updatePlatformStats(stats);
        }
    } catch (error) { console.error('Error loading admin data:', error); }
}

function updateUsersTable(users) {
    const tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;
    if (!users || users.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No users found</td></tr>'; return; }
    let html = '';
    for (const user of users) {
        html += `<tr><td><div style="display: flex; align-items: center; gap: 12px;"><div class="user-avatar-small">${(user.username || user.email || 'U')[0].toUpperCase()}</div>
            <div><div style="color: var(--text-light); font-weight: 500;">${escapeHtml(user.username || user.email || 'User')}</div>
            <small style="color: var(--text-gray);">${escapeHtml(user.email || '')}</small></div></div></td>
            <td><span class="product-status ${user.role || 'client'}">${user.role || 'client'}</span></td>
            <td>${user.product_count || 0}</td><td>${user.sales_count || 0}</td>
            <td><span class="product-status ${user.verified ? 'active' : 'pending'}">${user.verified ? 'Verified' : 'Pending'}</span></td>
            <td><div style="display: flex; gap: 8px;"><button class="action-btn view" onclick="viewUser(${user.id})"><i class="fas fa-eye"></i></button>
            <button class="action-btn suspend" onclick="toggleUserStatus(${user.id})"><i class="fas fa-ban"></i></button></div></td></tr>`;
    }
    tbody.innerHTML = html;
}

function updatePlatformStats(stats) {
    const totalUsersEl = document.getElementById('platformTotalUsers');
    const totalProductsEl = document.getElementById('platformTotalProducts');
    const totalSalesEl = document.getElementById('platformTotalSales');
    const platformRevenueEl = document.getElementById('platformRevenue');
    if (totalUsersEl) totalUsersEl.textContent = stats.total_users || 0;
    if (totalProductsEl) totalProductsEl.textContent = stats.total_products || 0;
    if (totalSalesEl) totalSalesEl.textContent = stats.total_sales || 0;
    if (platformRevenueEl) platformRevenueEl.textContent = `$${(stats.platform_revenue || 0).toFixed(2)}`;
}

function openDashboard() {
    if (!currentUser) { 
        openModal(document.getElementById('loginModal')); 
        return; 
    }
    
    // Hide other views
    const buyerView = document.getElementById('buyerView');
    const sellerView = document.getElementById('sellerView');
    const dashboardSection = document.getElementById('dashboardSection');
    
    if (buyerView) buyerView.style.display = 'none';
    if (sellerView) sellerView.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';
    
    // Load dashboard data
    loadDashboardStats();
    loadMyProducts();
    
    // Initialize tabs
    initDashboardTabs();
    
    // Show admin features if applicable
    if (currentUser && currentUser.role === 'admin') {
        const adminTab = document.getElementById('adminTabBtn');
        const adminControls = document.getElementById('adminControls');
        if (adminTab) adminTab.style.display = 'block';
        if (adminControls) adminControls.style.display = 'block';
        loadAdminData();
    }
    
    // Load share stats
    loadShareStats();
}
window.openDashboard = openDashboard;
// Quantity control functions
function incrementQuantity() {
    const input = document.getElementById('orderQuantity');
    if (input) {
        let val = parseInt(input.value) || 1;
        val = val + 1;
        input.value = val;
        updateOrderTotalDisplay();
    }
}

function decrementQuantity() {
    const input = document.getElementById('orderQuantity');
    if (input) {
        let val = parseInt(input.value) || 1;
        if (val > 1) {
            val = val - 1;
            input.value = val;
            updateOrderTotalDisplay();
        }
    }
}

// ============================================
// SELLER NOTIFICATIONS
// ============================================
async function loadSellerNotifications() {
    try {
        if (!currentUser) return;
        
        const response = await fetch('/api/seller/notifications', { 
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            console.log('Notifications endpoint not available yet');
            return;
        }
        
        const data = await response.json();
        const notificationCount = document.getElementById('notificationCount');
        
        if (notificationCount && data.unreadCount > 0) {
            notificationCount.textContent = data.unreadCount;
            notificationCount.style.display = 'flex';
        } else if (notificationCount) {
            notificationCount.style.display = 'none';
        }
        
        // Store notifications for dropdown
        window.cachedNotifications = data.notifications || [];
        
    } catch (error) { 
        console.log('Notifications not available:', error.message);
    }
}

// Show notification dropdown when bell is clicked
function showNotificationDropdown() {
    // Remove existing dropdown
    const existingDropdown = document.querySelector('.notifications-dropdown');
    if (existingDropdown) existingDropdown.remove();
    
    if (!currentUser) {
        showToast('Please login to view notifications', 'info');
        return;
    }
    
    const notifications = window.cachedNotifications || [];
    const unreadCount = notifications.filter(n => !n.is_read).length;
    
    const dropdownHtml = `
        <div class="notifications-dropdown" style="position: fixed; top: 70px; right: 20px; width: 380px; max-width: calc(100vw - 40px); background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 10001; overflow: hidden;">
            <div class="dropdown-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.05);">
                <h4 style="margin: 0; font-size: 16px;"><i class="fas fa-bell"></i> Notifications</h4>
                <button class="mark-all-read" onclick="markAllNotificationsRead()" style="background: transparent; border: none; color: var(--accent); font-size: 12px; cursor: pointer;">Mark all read</button>
            </div>
            <div class="dropdown-list" style="max-height: 400px; overflow-y: auto;">
                ${notifications.length === 0 ? `
                    <div class="empty-notifications" style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                        <i class="fas fa-bell-slash" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                        <p>No notifications yet</p>
                    </div>
                ` : `
                    ${notifications.map(notif => `
                        <div class="notification-item ${!notif.is_read ? 'unread' : ''}" onclick="markNotificationRead(${notif.id})" style="display: flex; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border-light); cursor: pointer; transition: var(--transition); ${!notif.is_read ? 'background: rgba(59, 130, 246, 0.08);' : ''}">
                            <div class="notification-icon" style="flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.15);">
                                <i class="fas ${notif.notification_type === 'new_order' ? 'fa-shopping-cart' : notif.notification_type === 'payment_received' ? 'fa-money-bill-wave' : 'fa-bell'}" style="color: var(--accent);"></i>
                            </div>
                            <div class="notification-content" style="flex: 1;">
                                <div class="notification-title" style="font-weight: 600; font-size: 14px; color: var(--text-light);">${escapeHtml(notif.title)}</div>
                                <div class="notification-message" style="font-size: 13px; color: var(--text-gray); line-height: 1.4;">${escapeHtml(notif.message)}</div>
                                <div class="notification-time" style="font-size: 11px; color: var(--text-muted);">${formatNotificationTime(notif.created_at)}</div>
                            </div>
                            ${!notif.is_read ? '<div class="notification-dot" style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-top: 5px;"></div>' : ''}
                        </div>
                    `).join('')}
                `}
            </div>
            <div class="dropdown-footer" style="padding: 12px 16px; border-top: 1px solid var(--border); text-align: center;">
                <a href="#" onclick="openDashboard(); closeNotificationDropdown();" style="color: var(--accent); text-decoration: none; font-size: 13px;">View all in Dashboard</a>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dropdownHtml);
    
    // Close dropdown when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!e.target.closest('.notifications-dropdown') && !e.target.closest('#notificationBtn')) {
                const dropdown = document.querySelector('.notifications-dropdown');
                if (dropdown) dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 100);
}

function closeNotificationDropdown() {
    const dropdown = document.querySelector('.notifications-dropdown');
    if (dropdown) dropdown.remove();
}

function formatNotificationTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
}

async function markNotificationRead(notificationId) {
    try {
        const response = await fetch(`/api/seller/notifications/${notificationId}/read`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            // Refresh notifications
            await loadSellerNotifications();
            showNotificationDropdown();
        }
    } catch (error) {
        console.error('Error marking notification read:', error);
    }
}

async function markAllNotificationsRead() {
    try {
        const response = await fetch('/api/seller/notifications/mark-all-read', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            await loadSellerNotifications();
            showNotificationDropdown();
        }
    } catch (error) {
        console.error('Error marking all notifications read:', error);
    }
}

// ============================================
// SHARE PRODUCT FUNCTIONS
// ============================================
async function shareProduct(productId, productTitle) {
    if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
    const product = products.find(p => p.id === productId);
    if (!product || (product.user_id !== currentUser.id && currentUser.role !== 'admin')) {
        showToast('Error', 'You can only share your own products', 'danger');
        return;
    }
    showToast('Generating share link...', 'info');
    try {
        const response = await fetch(`/api/products/${productId}/share-token`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.success) { showShareModal(data.shareUrl, productTitle, data.expiresAt); }
        else { showToast('Error', data.error || 'Failed to generate share link', 'danger'); }
    } catch (error) { console.error('Share error:', error); showToast('Error', 'Failed to generate share link', 'danger'); }
}
window.shareProduct = shareProduct;

function showShareModal(shareUrl, productTitle, expiresAt) {
    const existingModal = document.getElementById('shareModal');
    if (existingModal) existingModal.remove();
    const expirationDate = new Date(expiresAt).toLocaleDateString();
    const modalHtml = `<div class="modal open" id="shareModal">
        <div class="modal-card" style="max-width: 500px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0;"><i class="fas fa-share-alt" style="color: var(--accent);"></i> Share Product: ${escapeHtml(productTitle)}</h3>
                <span class="close-x" onclick="closeShareModal()">&times;</span>
            </div>
            <div style="margin-bottom: 20px;">
                <p>Share this link with anyone. They can view your product without logging in.</p>
                <div style="background: var(--primary-dark); border-radius: 8px; padding: 12px; margin: 15px 0; word-break: break-all; border: 1px solid var(--border);">
                    <code id="shareLink" style="color: var(--accent); font-size: 14px;">${shareUrl}</code>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button class="btn primary" onclick="copyShareLink()" style="flex: 1;"><i class="fas fa-copy"></i> Copy Link</button>
                    <button class="btn secondary" onclick="shareViaWhatsApp()" style="flex: 1;"><i class="fab fa-whatsapp"></i> WhatsApp</button>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn secondary" onclick="shareViaFacebook()" style="flex: 1;"><i class="fab fa-facebook"></i> Facebook</button>
                    <button class="btn secondary" onclick="shareViaTwitter()" style="flex: 1;"><i class="fab fa-twitter"></i> Twitter</button>
                    <button class="btn secondary" onclick="shareViaEmail()" style="flex: 1;"><i class="fas fa-envelope"></i> Email</button>
                </div>
            </div>
            <div style="background: rgba(16, 185, 129, 0.1); border-radius: 8px; padding: 12px; margin-top: 15px;">
                <p style="margin: 0; font-size: 12px; color: var(--text-gray);"><i class="fas fa-info-circle"></i> <strong>Link expires:</strong> ${expirationDate}<br>Share count will be tracked automatically.</p>
            </div>
            <div class="footer" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border);">
                <button class="btn secondary" onclick="closeShareModal()" style="width: 100%;">Close</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeShareModal() { const modal = document.getElementById('shareModal'); if (modal) modal.remove(); }
window.closeShareModal = closeShareModal;

async function copyShareLink() {
    const linkElement = document.getElementById('shareLink');
    const linkText = linkElement.textContent;
    try { await navigator.clipboard.writeText(linkText); showToast('Copied!', 'Share link copied to clipboard', 'success'); }
    catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = linkText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied!', 'Share link copied to clipboard', 'success');
    }
}
window.copyShareLink = copyShareLink;

function shareViaWhatsApp() {
    const linkElement = document.getElementById('shareLink');
    const shareUrl = encodeURIComponent(linkElement.textContent);
    const message = encodeURIComponent("Check out this product on Core Insight Marketplace!");
    window.open(`https://wa.me/?text=${message}%20${shareUrl}`, '_blank');
}
window.shareViaWhatsApp = shareViaWhatsApp;

function shareViaFacebook() {
    const linkElement = document.getElementById('shareLink');
    const shareUrl = encodeURIComponent(linkElement.textContent);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, '_blank', 'width=600,height=400');
}
window.shareViaFacebook = shareViaFacebook;

function shareViaTwitter() {
    const linkElement = document.getElementById('shareLink');
    const shareUrl = encodeURIComponent(linkElement.textContent);
    const text = encodeURIComponent("Check out this product on Core Insight Marketplace!");
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`, '_blank', 'width=600,height=400');
}
window.shareViaTwitter = shareViaTwitter;

function shareViaEmail() {
    const linkElement = document.getElementById('shareLink');
    const shareUrl = linkElement.textContent;
    const subject = encodeURIComponent("Check out this product on Core Insight!");
    const body = encodeURIComponent(`I found this great product on Core Insight Marketplace:\n\n${shareUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}
window.shareViaEmail = shareViaEmail;

async function regenerateShareLink(productId) {
    if (!confirm('Generate a new share link? The old link will stop working.')) return;
    try {
        const response = await fetch(`/api/products/${productId}/share-token`, { method: 'POST', credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            showToast('Success', 'New share link generated!', 'success');
            showShareModal(data.shareUrl, data.productTitle, data.expiresAt);
            loadShareStats();
        } else { showToast('Error', data.error || 'Failed to generate new link', 'danger'); }
    } catch (error) { console.error('Error regenerating share link:', error); showToast('Error', 'Failed to regenerate share link', 'danger'); }
}
window.regenerateShareLink = regenerateShareLink;

async function loadShareStats() {
    if (!currentUser) return;
    const container = document.getElementById('shareStatsContainer');
    if (!container) return;
    try {
        const response = await fetch('/api/products/share-stats', { credentials: 'include' });
        const data = await response.json();
        if (data.success && data.stats && data.stats.length > 0) {
            let html = `<div style="overflow-x: auto;"><table class="share-stats-table" style="width:100%; border-collapse: collapse;">
                <thead><tr style="background: var(--card-bg);"><th style="padding: 12px; text-align: left;">Product</th>
                <th style="padding: 12px; text-align: left;">Share Count</th><th style="padding: 12px; text-align: left;">Click Count</th>
                <th style="padding: 12px; text-align: left;">Link Expires</th><th style="padding: 12px; text-align: left;">Actions</th></tr></thead><tbody>`;
            for (const stat of data.stats) {
                const expiresDate = stat.expires_at ? new Date(stat.expires_at).toLocaleDateString() : 'Never';
                const isExpired = stat.expires_at && new Date(stat.expires_at) < new Date();
                html += `<tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 12px;"><strong style="color: var(--text-light);">${escapeHtml(stat.title)}</strong></td>
                    <td style="padding: 12px;"><span style="color: var(--accent); font-weight: 600;">${stat.share_count || 0}</span></td>
                    <td style="padding: 12px;"><span style="color: var(--success);">${stat.click_count || 0}</span></td>
                    <td style="padding: 12px;" class="${isExpired ? 'expired' : ''}">${expiresDate} ${isExpired ? '<span style="color: var(--danger);">(Expired)</span>' : ''}</td>
                    <td style="padding: 12px;"><button class="action-btn" onclick="regenerateShareLink(${stat.id})"><i class="fas fa-sync-alt"></i> Regenerate</button></td>
                </tr>`;
            }
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-share-alt"></i><h4>No share links generated yet</h4><p>Click the share button on your products to create share links</p></div>`;
        }
    } catch (error) { console.error('Error loading share stats:', error); container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Error loading share statistics</h4><p>Please refresh and try again</p></div>`; }
}
window.loadShareStats = loadShareStats;

// ============================================
// PRODUCT DELETE FUNCTIONS
// ============================================
async function deleteProduct(id) {
    try {
        const userCheck = await fetch('/api/me', { credentials: 'include' });
        const user = await userCheck.json();
        if (!user || !user.id) { openModal(document.getElementById('loginModal')); return; }
        if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) { showToast('Error', data.error || 'Failed to delete product', 'danger'); return; }
        showToast('Success', data.message || 'Product deleted', 'success');
        removeProductFromDOM(id);
    } catch (err) { console.error('deleteProduct error:', err); showToast('Error', 'Error deleting product: ' + err.message, 'danger'); }
}
window.deleteProduct = deleteProduct;

function removeProductFromDOM(productId) {
    let productElement = document.querySelector(`.product-card[data-id="${productId}"]`);
    if (productElement) {
        productElement.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        productElement.style.opacity = '0';
        productElement.style.transform = 'scale(0.95) translateY(20px)';
        productElement.style.maxHeight = '0';
        productElement.style.margin = '0';
        productElement.style.padding = '0';
        productElement.style.border = 'none';
        productElement.style.overflow = 'hidden';
        setTimeout(() => {
            productElement.remove();
            const grid = document.getElementById('productsGrid');
            const noProducts = document.getElementById('noProducts');
            if (grid && grid.children.length === 0 && noProducts) noProducts.style.display = 'block';
            if (typeof loadMyProducts === 'function') setTimeout(() => loadMyProducts(), 100);
        }, 400);
    } else { if (typeof loadProducts === 'function') setTimeout(() => loadProducts(), 500); }
}

function viewProduct(productId) { showToast(`Viewing product ${productId}`, 'info'); }
window.viewProduct = viewProduct;

function editProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    sellerMode = true;
    const sellerView = document.getElementById('sellerView');
    const browseModeText = document.getElementById('browseModeText');
    const becomeBtn = document.getElementById('becomeSeller');
    if (sellerView) sellerView.classList.add('active');
    if (browseModeText) browseModeText.innerHTML = 'Seller';
    if (becomeBtn) becomeBtn.textContent = 'Back to Buyer View';
    const titleInput = document.getElementById('p_title');
    const descInput = document.getElementById('p_description');
    const priceInput = document.getElementById('p_price');
    const typeSelect = document.getElementById('p_type');
    if (titleInput) titleInput.value = product.title || '';
    if (descInput) descInput.value = product.description || '';
    if (priceInput) priceInput.value = product.price || '';
    if (typeSelect) typeSelect.value = product.type || '';
    if (product.category) {
        const categorySelect = document.getElementById('p_category_select');
        const existingOption = Array.from(categorySelect.options).find(opt => opt.value === product.category);
        if (existingOption) categorySelect.value = product.category;
        else document.getElementById('p_category_new').value = product.category;
    }
    if (typeSelect) typeSelect.dispatchEvent(new Event('change'));
    if (product.type === 'physical') {
        const deliveryTypeSelect = document.getElementById('p_deliveryType');
        if (deliveryTypeSelect) deliveryTypeSelect.value = 'delivery';
        const deliveryLocationsInput = document.getElementById('p_deliveryLocations');
        if (deliveryLocationsInput && product.delivery_locations) deliveryLocationsInput.value = product.delivery_locations;
    }
    if (sellerView) sellerView.scrollIntoView({ behavior: 'smooth' });
}
window.editProduct = editProduct;
function loadBankForm(gateway) {
    const detailsSection = document.getElementById('bankDetailsSection');
    if (!detailsSection) return;
    
    // Get the existing bank country select if it exists to preserve selection
    const existingBankCountry = document.getElementById('bankCountry');
    const savedCountry = existingBankCountry ? existingBankCountry.value : '';
    
    // Simplified HTML - KEEP THE ORIGINAL WORKING BANK COUNTRY SELECT
    detailsSection.innerHTML = `
        <div class="form-section-header" style="margin-bottom: 16px;">
            <i class="fas fa-globe"></i>
            <h4>International Bank Account Details</h4>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">Select Bank Country <span class="required">*</span></label>
<select id="bankCountry" class="form-select" onchange="loadFlutterwaveBanks()">
    <option value="">Select country</option>
    <option value="US">🇺🇸 United States</option>
    <option value="CA">🇨🇦 Canada</option>
    <option value="GB">🇬🇧 United Kingdom</option>
    <option value="NG">🇳🇬 Nigeria</option>
    <option value="GH">🇬🇭 Ghana</option>
    <option value="KE">🇰🇪 Kenya</option>
    <option value="UG">🇺🇬 Uganda</option>
    <option value="TZ">🇹🇿 Tanzania</option>
    <option value="ZA">🇿🇦 South Africa</option>
    <option value="RW">🇷🇼 Rwanda</option>
    <option value="OTHER">🌐 Other Country (Manual Entry)</option>
</select>
            </div>
            <div class="form-group">
                <label class="form-label">Bank Name <span class="required">*</span></label>
                <select id="p_bankName" class="form-select" required>
                    <option value="">Select bank country first</option>
                </select>
                <div id="p_bankName_error" class="form-error"></div>
            </div>
        </div>
        
        <!-- Dynamic fields for SWIFT, Routing, Branch codes -->
        <div id="bankAdditionalFields" style="display: none;"></div>
        
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">Bank Code</label>
                <input type="text" id="p_bankCode" class="form-input" readonly placeholder="Will auto-fill when bank selected" />
            </div>
            <div class="form-group">
                <label class="form-label">Account Number <span class="required">*</span></label>
                <input type="text" id="p_accountNumber" class="form-input" placeholder="Your account number" required />
                <div id="p_accountNumber_error" class="form-error"></div>
            </div>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">Account Holder Name</label>
                <input type="text" id="p_accountName" class="form-input" placeholder="Will be verified automatically" readonly />
            </div>
            <div class="form-group">
                <label class="form-label">Payout Currency</label>
                <select id="payoutCurrency" class="form-select">
                    <option value="USD">🇺🇸 USD - US Dollar</option>
                    <option value="CAD">🇨🇦 CAD - Canadian Dollar</option>
                    <option value="GBP">🇬🇧 GBP - British Pound</option>
                    <option value="EUR">🇪🇺 EUR - Euro</option>
                    <option value="NGN">🇳🇬 NGN - Nigerian Naira</option>
                    <option value="GHS">🇬🇭 GHS - Ghanaian Cedi</option>
                    <option value="KES">🇰🇪 KES - Kenyan Shilling</option>
                    <option value="UGX">🇺🇬 UGX - Ugandan Shilling</option>
                    <option value="TZS">🇹🇿 TZS - Tanzanian Shilling</option>
                    <option value="RWF">🇷🇼 RWF - Rwandan Franc</option>
                    <option value="ZAR">🇿🇦 ZAR - South African Rand</option>
                    <option value="AED">🇦🇪 AED - UAE Dirham</option>
                    <option value="SAR">🇸🇦 SAR - Saudi Riyal</option>
                    <option value="INR">🇮🇳 INR - Indian Rupee</option>
                    <option value="AUD">🇦🇺 AUD - Australian Dollar</option>
                    <option value="NZD">🇳🇿 NZD - New Zealand Dollar</option>
                </select>
            </div>
        </div>
        
        <div id="subaccountStatus" style="display: none; margin-top: 16px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border-left: 3px solid var(--success);">
            <p id="subaccountStatusText" style="margin: 0; color: var(--success); font-size: 13px;">
                <i class="fas fa-check-circle"></i> Auto-split active! 90% of payments will go to your account.
            </p>
        </div>
    `;
    
    detailsSection.style.display = 'block';
    
    // Restore previously selected country if any
    if (savedCountry) {
        const bankCountrySelect = document.getElementById('bankCountry');
        if (bankCountrySelect) {
            bankCountrySelect.value = savedCountry;
            setTimeout(() => {
                loadFlutterwaveBanks();
            }, 100);
        }
    }
    
    setTimeout(() => {
        setupAccountVerification();
    }, 100);
}
function updateBankFieldsByCountry() {
    const country = document.getElementById('bankCountry')?.value;
    const additionalFieldsDiv = document.getElementById('bankAdditionalFields');
    
    if (!additionalFieldsDiv) return;
    
    let fieldsHtml = '';
    
    if (country === 'US') {
        fieldsHtml = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Routing Number (ABA/ACH) <span class="required">*</span></label>
                    <input type="text" id="routingNumber" class="form-input" placeholder="e.g., 021000021" required />
                    <span class="form-help">9-digit routing number for US bank accounts</span>
                    <div id="routingNumber_error" class="form-error"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">SWIFT/BIC Code <span class="required">*</span></label>
                    <input type="text" id="swiftCode" class="form-input" placeholder="e.g., CHASUS33" required />
                    <span class="form-help">Required for international wire transfers</span>
                    <div id="swiftCode_error" class="form-error"></div>
                </div>
            </div>
        `;
    } else if (country === 'CA') {
        fieldsHtml = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Institution Number <span class="required">*</span></label>
                    <input type="text" id="institutionNumber" class="form-input" placeholder="e.g., 001" required />
                    <div id="institutionNumber_error" class="form-error"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">Transit Number <span class="required">*</span></label>
                    <input type="text" id="transitNumber" class="form-input" placeholder="e.g., 12345" required />
                    <div id="transitNumber_error" class="form-error"></div>
                </div>
            </div>
        `;
    } else if (['GB', 'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'PT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'AT', 'PL', 'CZ', 'GR', 'HU', 'RO'].includes(country)) {
        fieldsHtml = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">SWIFT/BIC Code <span class="required">*</span></label>
                    <input type="text" id="swiftCode" class="form-input" placeholder="e.g., NWSBGB2L" required />
                    <span class="form-help">8-11 character SWIFT code for international transfers</span>
                    <div id="swiftCode_error" class="form-error"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">IBAN (Optional)</label>
                    <input type="text" id="iban" class="form-input" placeholder="e.g., GB29NWBK60161331926819" />
                    <span class="form-help">International Bank Account Number (recommended)</span>
                </div>
            </div>
        `;
    } else if (['GH', 'TZ', 'UG', 'RW'].includes(country)) {
        fieldsHtml = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Branch Code <span class="required">*</span></label>
                    <input type="text" id="branchCode" class="form-input" placeholder="e.g., 001" required />
                    <span class="form-help">Bank branch code for local transfers</span>
                    <div id="branchCode_error" class="form-error"></div>
                </div>
            </div>
        `;
    } else if (country === 'AU') {
        fieldsHtml = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">BSB Number <span class="required">*</span></label>
                    <input type="text" id="bsbNumber" class="form-input" placeholder="e.g., 012-345" required />
                    <span class="form-help">6-digit BSB code for Australian bank accounts</span>
                    <div id="bsbNumber_error" class="form-error"></div>
                </div>
            </div>
        `;
    }
    
    if (fieldsHtml) {
        additionalFieldsDiv.style.display = 'block';
        additionalFieldsDiv.innerHTML = fieldsHtml;
    } else {
        additionalFieldsDiv.style.display = 'none';
        additionalFieldsDiv.innerHTML = '';
    }
}


   async function loadFlutterwaveBanks() {
    const country = document.getElementById('bankCountry')?.value;
    if (!country) {
        console.log('No country selected');
        return;
    }
    
    const bankSelect = document.getElementById('p_bankName');
    const bankCodeInput = document.getElementById('p_bankCode');
    const accountNumberInput = document.getElementById('p_accountNumber');
    
    if (!bankSelect) return;
    
    // Show loading state
    bankSelect.innerHTML = '<option value="">Loading banks...</option>';
    bankSelect.disabled = true;
    
    // Remove any existing manual input
    const existingManual = document.getElementById('manualBankCodeInput');
    if (existingManual) existingManual.remove();
    
    try {
        console.log(`🌍 Fetching banks for country: ${country}`);
        
        const response = await fetch(`/api/banks/flutterwave/${country}`, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        
        bankSelect.disabled = false;
        
        if (response.ok) {
            const banks = await response.json();
            
            if (banks && banks.length > 0) {
                // Success - populate bank dropdown
                bankSelect.innerHTML = '<option value="">Select your bank</option>';
                
                banks.forEach(bank => {
                    const option = document.createElement('option');
                    option.value = bank.code;
                    option.textContent = `${bank.name} (Code: ${bank.code})`;
                    bankSelect.appendChild(option);
                });
                
                bankSelect.onchange = function() {
                    if (bankCodeInput) bankCodeInput.value = this.value;
                    if (accountNumberInput && accountNumberInput.value) {
                        const event = new Event('input', { bubbles: true });
                        accountNumberInput.dispatchEvent(event);
                    }
                };
                
                console.log(`✅ Loaded ${banks.length} banks for ${country}`);
                showToast(`Loaded ${banks.length} banks`, 'success');
                return;
            }
        }
        
        // No banks found - manual entry mode
        console.log(`📝 No banks for ${country}, using manual entry`);
        bankSelect.innerHTML = '<option value="">Enter bank code manually</option>';
        
        // Create manual input field
        const manualInput = document.createElement('input');
        manualInput.type = 'text';
        manualInput.placeholder = 'Enter your bank code (e.g., 044, 000001)';
        manualInput.className = 'form-input';
        manualInput.style.marginTop = '8px';
        manualInput.id = 'manualBankCodeInput';
        bankSelect.parentNode.appendChild(manualInput);
        
        manualInput.addEventListener('input', function() {
            if (bankCodeInput) bankCodeInput.value = this.value;
        });
        
        showToast(`Please enter your bank code manually for ${country}`, 'info');
        
    } catch (err) {
        console.error('Error loading banks:', err);
        bankSelect.disabled = false;
        bankSelect.innerHTML = '<option value="">Enter bank code manually</option>';
        
        // Create manual input field on error too
        const manualInput = document.createElement('input');
        manualInput.type = 'text';
        manualInput.placeholder = 'Enter your bank code manually';
        manualInput.className = 'form-input';
        manualInput.style.marginTop = '8px';
        manualInput.id = 'manualBankCodeInput';
        
        const existing = document.getElementById('manualBankCodeInput');
        if (!existing) {
            bankSelect.parentNode.appendChild(manualInput);
            manualInput.addEventListener('input', function() {
                if (bankCodeInput) bankCodeInput.value = this.value;
            });
        }
        
        showToast(`Manual bank code entry for ${country}`, 'warning');
    }
}
function provideManualBankEntry(bankSelect, bankCodeInput, country) {
    bankSelect.innerHTML = `
        <option value="">Enter bank code manually</option>
        <option value="manual">✏️ Manual Entry</option>
    `;
    
    const existingManual = document.getElementById('manualBankCodeInput');
    if (existingManual) existingManual.remove();
    
    bankSelect.onchange = function() {
        const existingInput = document.getElementById('manualBankCodeInput');
        if (this.value === 'manual') {
            if (!existingInput) {
                const manualInput = document.createElement('input');
                manualInput.type = 'text';
                manualInput.placeholder = `Enter your bank code for ${country}`;
                manualInput.className = 'form-input';
                manualInput.style.marginTop = '8px';
                manualInput.id = 'manualBankCodeInput';
                bankSelect.parentNode.appendChild(manualInput);
                
                manualInput.addEventListener('input', function() {
                    if (bankCodeInput) bankCodeInput.value = this.value;
                });
            }
        } else {
            if (existingInput) existingInput.remove();
            if (bankCodeInput) bankCodeInput.value = this.value;
        }
    };
    
    showToast(`Manual bank code entry for ${country}`, 'info');
}
function updateBankCountry() {
    const sellerCountry = document.getElementById('sellerCountry').value;
    
    // Comprehensive country mapping
    const bankCountryMap = {
        'USA': 'US', 'United States': 'US', 'America': 'US',
        'UK': 'GB', 'United Kingdom': 'GB', 'Britain': 'GB',
        'Nigeria': 'NG', 'Canada': 'CA', 'Australia': 'AU',
        'Germany': 'DE', 'France': 'FR', 'Italy': 'IT',
        'Spain': 'ES', 'Netherlands': 'NL', 'Belgium': 'BE',
        'Portugal': 'PT', 'Switzerland': 'CH', 'Sweden': 'SE',
        'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI',
        'Ireland': 'IE', 'Austria': 'AT', 'Poland': 'PL',
        'Czech Republic': 'CZ', 'Greece': 'GR', 'Kenya': 'KE',
        'Ghana': 'GH', 'South Africa': 'ZA', 'Uganda': 'UG',
        'Tanzania': 'TZ', 'Rwanda': 'RW', 'Ethiopia': 'ET',
        'Zambia': 'ZM', 'Zimbabwe': 'ZW', 'Malawi': 'MW',
        'Mozambique': 'MZ', 'Angola': 'AO', 'Botswana': 'BW',
        'Namibia': 'NA', 'Eswatini': 'SZ', 'Lesotho': 'LS',
        'Madagascar': 'MG', 'Mauritius': 'MU', 'Seychelles': 'SC',
        'Cameroon': 'CM', 'Egypt': 'EG', 'Morocco': 'MA',
        'Tunisia': 'TN', 'Algeria': 'DZ', 'UAE': 'AE',
        'Saudi Arabia': 'SA', 'Qatar': 'QA', 'Kuwait': 'KW',
        'Bahrain': 'BH', 'Oman': 'OM', 'Jordan': 'JO',
        'Lebanon': 'LB', 'India': 'IN', 'Pakistan': 'PK',
        'New Zealand': 'NZ', 'Senegal': 'SN', 'Ivory Coast': 'CI',
        'Côte d\'Ivoire': 'CI', 'Sierra Leone': 'SL'
    };
    
    if (bankCountryMap[sellerCountry]) {
        const bankCountrySelect = document.getElementById('bankCountry');
        if (bankCountrySelect) {
            bankCountrySelect.value = bankCountryMap[sellerCountry];
            // Trigger bank loading
            loadFlutterwaveBanks();
        }
    }
}

   async function verifyAccountNumber(inputElement) {
    const accountNumber = inputElement.value.trim();
    const bankCode = document.getElementById('p_bankCode')?.value;
    let bankCountry = document.getElementById('bankCountry')?.value || 'NG';
    const isVirtualChecked = document.getElementById('isVirtualAccount')?.checked || false;
    const manualAccountName = document.getElementById('manualAccountName')?.value.trim();
    
    const messageEl = document.getElementById('p_accountNumber_error');
    const accountNameField = document.getElementById('p_accountName');
    
    // Validate inputs
    if (!accountNumber || accountNumber.length < 5) {
        showVerificationMessage('Please enter a valid account number', 'warning', messageEl);
        return;
    }
    
    if (!bankCode) {
        showVerificationMessage('Please select a bank first', 'warning', messageEl);
        return;
    }
    
    // For virtual accounts, require account name
    if (isVirtualChecked && !manualAccountName) {
        showVerificationMessage('Please enter the account holder name for your virtual account', 'warning', messageEl);
        return;
    }
    
    // Map country codes for API
    const countryMap = {
        'US': 'US', 'CA': 'CA', 'GB': 'GB', 'FR': 'FR', 'DE': 'DE',
        'ES': 'ES', 'IT': 'IT', 'NL': 'NL', 'BE': 'BE', 'PT': 'PT',
        'CH': 'CH', 'SE': 'SE', 'NO': 'NO', 'DK': 'DK', 'FI': 'FI',
        'IE': 'IE', 'AT': 'AT', 'PL': 'PL', 'CZ': 'CZ', 'GR': 'GR',
        'NG': 'NG', 'GH': 'GH', 'KE': 'KE', 'UG': 'UG', 'TZ': 'TZ',
        'RW': 'RW', 'ZA': 'ZA', 'ZM': 'ZM', 'ZW': 'ZW', 'MW': 'MW',
        'MZ': 'MZ', 'AO': 'AO', 'BW': 'BW', 'NA': 'NA', 'SZ': 'SZ',
        'LS': 'LS', 'MG': 'MG', 'MU': 'MU', 'SC': 'SC', 'CM': 'CM',
        'CD': 'CD', 'CG': 'CG', 'GA': 'GA', 'CF': 'CF', 'TD': 'TD',
        'EG': 'EG', 'MA': 'MA', 'TN': 'TN', 'DZ': 'DZ', 'AE': 'AE',
        'SA': 'SA', 'QA': 'QA', 'KW': 'KW', 'BH': 'BH', 'OM': 'OM',
        'JO': 'JO', 'LB': 'LB', 'IN': 'IN', 'PK': 'PK', 'AU': 'AU',
        'NZ': 'NZ', 'SN': 'SN', 'CI': 'CI', 'SL': 'SL', 'GM': 'GM',
        'LR': 'LR', 'ML': 'ML', 'BF': 'BF', 'BJ': 'BJ', 'TG': 'TG',
        'NE': 'NE', 'GN': 'GN', 'GW': 'GW', 'CV': 'CV', 'ET': 'ET',
        'BI': 'BI', 'SS': 'SS', 'DJ': 'DJ', 'ER': 'ER', 'SO': 'SO'
    };
    
    const apiCountry = countryMap[bankCountry] || bankCountry;
    
    // Show loading state
    showVerificationMessage('<i class="fas fa-spinner fa-spin"></i> Verifying account with Flutterwave...</i>', 'info', messageEl);
    
    try {
        const endpoint = `/api/verify-account/flutterwave/${apiCountry}`;
        
        const requestBody = {
            account_number: accountNumber,
            bank_code: bankCode,
            country: apiCountry
        };
        
        // If virtual account is checked, send account name
        if (isVirtualChecked && manualAccountName) {
            requestBody.account_name = manualAccountName;
            requestBody.skip_verification = true;
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.status === 'success' && data.account_name) {
            // Set account name field
            if (accountNameField) {
                accountNameField.value = data.account_name;
                accountNameField.readOnly = true;
                accountNameField.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                accountNameField.style.color = 'var(--success)';
            }
            
            // For virtual accounts, also update manual name field
            if (data.account_type === 'virtual' || isVirtualChecked) {
                const manualNameField = document.getElementById('manualAccountName');
                if (manualNameField && !manualNameField.value) {
                    manualNameField.value = data.account_name;
                }
            }
            
            // Show account type indicator
            showAccountTypeIndicator(data.account_type || (isVirtualChecked ? 'virtual' : 'real'), data.account_name);
            
            // Show success message with country-specific info
            const countryName = getCountryName(bankCountry);
            const successMessage = (data.account_type === 'virtual' || isVirtualChecked)
                ? `✓ Virtual account accepted! Payouts will work in ${countryName}. Account: ${escapeHtml(data.account_name)}`
                : `✓ Account verified! ${countryName} account holder: ${escapeHtml(data.account_name)}`;
            
            showVerificationMessage(successMessage, 'success', messageEl);
            
            // Mark as verified
            inputElement.setAttribute('data-verified', 'true');
            if (accountNameField) accountNameField.setAttribute('data-verified', 'true');
            
            // Update subaccount status
            updateSubaccountStatus(true, data.account_name);
            
        } else if (data.status === 'warning' && data.requires_manual_name) {
            // Auto-check the virtual account checkbox and prompt for name
            const virtualCheckbox = document.getElementById('isVirtualAccount');
            if (virtualCheckbox && !virtualCheckbox.checked) {
                virtualCheckbox.checked = true;
                const virtualHelp = document.getElementById('virtualAccountHelp');
                const manualNameField = document.getElementById('manualNameField');
                if (virtualHelp) virtualHelp.style.display = 'block';
                if (manualNameField) manualNameField.style.display = 'block';
                document.getElementById('manualAccountName')?.focus();
                showVerificationMessage(data.message, 'warning', messageEl);
            } else {
                showVerificationMessage(data.message, 'warning', messageEl);
            }
            
        } else {
            throw new Error(data.message || 'Verification failed');
        }
        
    } catch (err) {
        console.error('Verification error:', err);
        
        if (accountNameField) {
            accountNameField.value = '';
            accountNameField.readOnly = false;
            accountNameField.style.backgroundColor = '';
            accountNameField.style.color = '';
        }
        
        // Suggest trying as virtual account
        const virtualCheckbox = document.getElementById('isVirtualAccount');
        if (virtualCheckbox && !virtualCheckbox.checked) {
            showVerificationMessage(
                'Verification failed. If this is a virtual account (Raenest, Grey, Payoneer, Wise, etc.), check the box below and enter your account holder name.', 
                'warning', 
                messageEl
            );
        } else {
            showVerificationMessage(err.message || 'Verification failed. Please check your account details.', 'error', messageEl);
        }
        
        inputElement.setAttribute('data-verified', 'false');
    }
}
// Helper function to get common bank codes for manual entry
function getCommonBankCodes(countryCode) {
    const bankCodes = {
        'US': [
            { code: '021000021', name: 'Chase Bank' },
            { code: '026009593', name: 'Bank of America' },
            { code: '121000358', name: 'Wells Fargo' },
            { code: '021001088', name: 'Citibank' }
        ],
        'GB': [
            { code: '40-00-00', name: 'Barclays' },
            { code: '60-00-00', name: 'NatWest' },
            { code: '20-00-00', name: 'HSBC UK' }
        ],
        'NG': [
            { code: '000001', name: 'Access Bank' },
            { code: '000002', name: 'GTBank' },
            { code: '000003', name: 'Zenith Bank' }
        ],
        'KE': [
            { code: '000001', name: 'Equity Bank' },
            { code: '000002', name: 'KCB Bank' }
        ],
        'ZA': [
            { code: '000001', name: 'Standard Bank' },
            { code: '000002', name: 'FNB' }
        ]
    };
    return bankCodes[countryCode] || [];
}
// Helper function to get country name from code
function getCountryName(countryCode) {
    const countryNames = {
        'US': 'United States', 'CA': 'Canada', 'GB': 'United Kingdom',
        'FR': 'France', 'DE': 'Germany', 'ES': 'Spain', 'IT': 'Italy',
        'NL': 'Netherlands', 'BE': 'Belgium', 'PT': 'Portugal',
        'CH': 'Switzerland', 'SE': 'Sweden', 'NO': 'Norway',
        'DK': 'Denmark', 'FI': 'Finland', 'IE': 'Ireland', 'AT': 'Austria',
        'PL': 'Poland', 'CZ': 'Czech Republic', 'GR': 'Greece',
        'NG': 'Nigeria', 'GH': 'Ghana', 'KE': 'Kenya', 'UG': 'Uganda',
        'TZ': 'Tanzania', 'RW': 'Rwanda', 'ZA': 'South Africa',
        'ZM': 'Zambia', 'ZW': 'Zimbabwe', 'MW': 'Malawi', 'MZ': 'Mozambique',
        'AO': 'Angola', 'BW': 'Botswana', 'NA': 'Namibia', 'SZ': 'Eswatini',
        'LS': 'Lesotho', 'MG': 'Madagascar', 'MU': 'Mauritius', 'SC': 'Seychelles',
        'CM': 'Cameroon', 'EG': 'Egypt', 'MA': 'Morocco', 'TN': 'Tunisia',
        'DZ': 'Algeria', 'AE': 'UAE', 'SA': 'Saudi Arabia', 'QA': 'Qatar',
        'KW': 'Kuwait', 'BH': 'Bahrain', 'OM': 'Oman', 'JO': 'Jordan',
        'LB': 'Lebanon', 'IN': 'India', 'PK': 'Pakistan', 'AU': 'Australia',
        'NZ': 'New Zealand', 'SN': 'Senegal', 'CI': 'Côte d\'Ivoire',
        'SL': 'Sierra Leone', 'ET': 'Ethiopia'
    };
    return countryNames[countryCode] || countryCode;
}
function showVerificationMessage(message, type, messageEl) {
    if (!messageEl) return;
    
    const colors = {
        success: 'var(--success)',
        error: 'var(--danger)',
        warning: 'var(--warning)',
        info: 'var(--accent)'
    };
    
    messageEl.innerHTML = `<span style="color: ${colors[type] || colors.info};">${message}</span>`;
    messageEl.classList.add('show');
    
    if (type !== 'info') {
        setTimeout(() => messageEl.classList.remove('show'), 5000);
    }
}

function showAccountTypeIndicator(accountType, accountName) {
    let indicator = document.getElementById('accountTypeIndicator');
    if (!indicator) {
        const bankSection = document.getElementById('bankDetailsSection');
        if (bankSection) {
            bankSection.insertAdjacentHTML('beforeend', `
                <div id="accountTypeIndicator" style="margin-top: 12px; padding: 10px; border-radius: 8px; display: none;">
                    <i class="fas fa-info-circle"></i> <span id="accountTypeText"></span>
                </div>
            `);
            indicator = document.getElementById('accountTypeIndicator');
        }
    }
    
    if (indicator) {
        if (accountType === 'virtual') {
            indicator.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
            indicator.style.borderLeft = '3px solid var(--warning)';
            document.getElementById('accountTypeText').innerHTML = `
                <strong>Virtual Account Detected</strong><br>
                <small>${escapeHtml(accountName)} - Payouts are supported. Your 90% will be sent to this account.</small>
            `;
        } else {
            indicator.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            indicator.style.borderLeft = '3px solid var(--success)';
            document.getElementById('accountTypeText').innerHTML = `
                <strong>Real Account Verified</strong><br>
                <small>${escapeHtml(accountName)} - Ready for payouts.</small>
            `;
        }
        indicator.style.display = 'block';
    }
}

function updateSubaccountStatus(isVerified, accountName) {
    const statusDiv = document.getElementById('subaccountStatus');
    const statusText = document.getElementById('subaccountStatusText');
    
    if (statusDiv && statusText && isVerified) {
        statusText.innerHTML = `✓ Account verified! Auto-split (90/10) will be active. Payouts to: ${escapeHtml(accountName)}`;
        statusDiv.style.display = 'block';
    }
}
function addVirtualAccountToggle() {
    const bankDetailsSection = document.getElementById('bankDetailsSection');
    if (!bankDetailsSection || document.getElementById('virtualAccountSection')) return;
    
    const virtualHtml = `
        <div id="virtualAccountSection" style="margin-top: 20px; padding: 16px; background: rgba(59, 130, 246, 0.05); border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.2);">
            <label class="form-checkbox" style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                <input type="checkbox" id="isVirtualAccount" style="width: 18px; height: 18px;">
                <span style="font-weight: 500;">
                    <i class="fas fa-building"></i> This is a virtual account (Raenest, Grey, Payoneer, Wise, etc.)
                </span>
            </label>
            <div id="virtualAccountHelp" style="display: none; margin-top: 12px; padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px;">
                <i class="fas fa-info-circle" style="color: var(--warning);"></i>
                <strong style="color: var(--warning);">Virtual Account Support:</strong>
                <p style="margin-top: 8px; font-size: 13px; color: var(--text-gray);">
                    Flutterwave supports payouts to virtual accounts from Raenest, Grey, Payoneer, Wise, and other providers.
                    Please enter the account holder name as it appears on your virtual account statement.
                </p>
            </div>
            <div id="manualNameField" style="display: none; margin-top: 16px;">
                <label class="form-label">Account Holder Name <span class="required">*</span></label>
                <input type="text" id="manualAccountName" class="form-input" placeholder="Enter the name on your virtual account">
                <span class="form-help">This should match the name on your Raenest/Wise/Payoneer account</span>
                <div id="manualNameError" class="form-error"></div>
            </div>
        </div>
    `;
    
    bankDetailsSection.insertAdjacentHTML('beforeend', virtualHtml);
    
    const virtualCheckbox = document.getElementById('isVirtualAccount');
    const virtualHelp = document.getElementById('virtualAccountHelp');
    const manualNameField = document.getElementById('manualNameField');
    const accountNameField = document.getElementById('p_accountName');
    const accountNumberInput = document.getElementById('p_accountNumber');
    
    if (virtualCheckbox) {
        virtualCheckbox.addEventListener('change', function() {
            const isChecked = this.checked;
            if (virtualHelp) virtualHelp.style.display = isChecked ? 'block' : 'none';
            if (manualNameField) manualNameField.style.display = isChecked ? 'block' : 'none';
            
            // Clear previous verification when toggling
            if (accountNumberInput && accountNumberInput.value) {
                if (accountNameField) {
                    accountNameField.value = '';
                    accountNameField.readOnly = false;
                    accountNameField.style.backgroundColor = '';
                    accountNameField.style.color = '';
                }
                // Trigger re-verification
                const event = new Event('input');
                accountNumberInput.dispatchEvent(event);
            }
        });
    }
}
function selectPaymentGateway(gateway) {
    if (gateway !== 'flutterwave') {
        gateway = 'flutterwave';
    }
    
    selectedGateway = gateway;
    document.getElementById('p_paymentProvider').value = gateway;
    
    // Update UI - only Flutterwave option
    document.querySelectorAll('.provider-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelector(`.provider-option[data-provider="${gateway}"]`)?.classList.add('selected');
    
    // Show country selection
    const countrySection = document.getElementById('countrySection');
    if (countrySection) countrySection.style.display = 'block';
    
    // Load bank form
    loadBankForm(gateway);
    
    // Setup verification after form loads
    setTimeout(() => {
        setupAccountVerification();
    }, 200);
}

// Create subaccount - Works for both real and virtual accounts

  async function createSubaccount() {
    if (!selectedGateway) {
        console.log('No gateway selected');
        return null;
    }
    
    const bankCode = document.getElementById('p_bankCode').value;
    const accountNumber = document.getElementById('p_accountNumber').value;
    const businessName = document.getElementById('p_businessName').value;
    const businessEmail = document.getElementById('p_businessEmail').value;
    const businessPhone = document.getElementById('p_businessPhone').value;
    const country = document.getElementById('p_country').value;
    const bankCountry = document.getElementById('bankCountry')?.value;
    const isVirtual = document.getElementById('isVirtualAccount')?.checked || false;
    const manualAccountName = document.getElementById('manualAccountName')?.value;
    
    // Collect country-specific fields
    const routingNumber = document.getElementById('routingNumber')?.value;
    const swiftCode = document.getElementById('swiftCode')?.value;
    const iban = document.getElementById('iban')?.value;
    const branchCode = document.getElementById('branchCode')?.value;
    const institutionNumber = document.getElementById('institutionNumber')?.value;
    const transitNumber = document.getElementById('transitNumber')?.value;
    const bsbNumber = document.getElementById('bsbNumber')?.value;
    
    const accountName = (isVirtual && manualAccountName) ? manualAccountName : businessName;
    
    if (!bankCode || !accountNumber || !accountName) {
        console.log('Missing bank details');
        return null;
    }
    
    // Validate country-specific required fields
    if (bankCountry === 'US' && (!routingNumber || !swiftCode)) {
        showToast('Routing number and SWIFT code are required for US bank accounts', 'warning');
        return null;
    }
    if (bankCountry === 'CA' && (!institutionNumber || !transitNumber)) {
        showToast('Institution number and transit number are required for Canadian bank accounts', 'warning');
        return null;
    }
    if (['GB', 'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'PT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'AT', 'PL', 'CZ', 'GR'].includes(bankCountry) && !swiftCode) {
        showToast('SWIFT code is required for European bank accounts', 'warning');
        return null;
    }
    if (['GH', 'TZ', 'UG', 'RW'].includes(bankCountry) && !branchCode) {
        showToast('Branch code is required for bank accounts in this country', 'warning');
        return null;
    }
    if (bankCountry === 'AU' && !bsbNumber) {
        showToast('BSB number is required for Australian bank accounts', 'warning');
        return null;
    }
    
    try {
        const endpoint = '/api/flutterwave/create-subaccount';
        
        const payload = {
            bank_code: bankCode,
            account_number: accountNumber,
            business_name: accountName,
            business_email: businessEmail,
            business_mobile: businessPhone,
            country: bankCountry || country || 'NG',
            is_virtual: isVirtual
        };
        
        // Add country-specific fields to payload
        if (routingNumber) payload.routing_number = routingNumber;
        if (swiftCode) payload.swift_code = swiftCode;
        if (iban) payload.iban = iban;
        if (branchCode) payload.branch_code = branchCode;
        if (institutionNumber) payload.institution_number = institutionNumber;
        if (transitNumber) payload.transit_number = transitNumber;
        if (bsbNumber) payload.bsb_number = bsbNumber;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Subaccount created:', data.subaccount_id);
            const statusDiv = document.getElementById('subaccountStatus');
            const statusText = document.getElementById('subaccountStatusText');
            if (statusText) {
                statusText.innerHTML = `✓ ${isVirtual ? 'Virtual account' : 'Bank account'} verified! Auto-split active! 90% of payments will go to ${accountName}`;
            }
            if (statusDiv) statusDiv.style.display = 'block';
            return data;
        } else {
            console.error('Subaccount creation failed:', data.error);
            return null;
        }
    } catch (err) {
        console.error('Subaccount error:', err);
        return null;
    }
}
function setupAccountVerification() {
    const accountNumberInput = document.getElementById('p_accountNumber');
    if (!accountNumberInput) {
        console.log('Account number input not found');
        return;
    }
    
    // Remove any existing event listeners to prevent duplicates
    const newInput = accountNumberInput.cloneNode(true);
    accountNumberInput.parentNode.replaceChild(newInput, accountNumberInput);
    
    let verificationTimeout = null;
    
    newInput.addEventListener('input', function() {
        // Clear previous timeout
        if (verificationTimeout) {
            clearTimeout(verificationTimeout);
        }
        
        // Clear verification status
        const accountNameField = document.getElementById('p_accountName');
        const messageEl = document.getElementById('p_accountNumber_error');
        const accountTypeIndicator = document.getElementById('accountTypeIndicator');
        
        if (accountNameField && accountNameField.value) {
            accountNameField.value = '';
            accountNameField.readOnly = false;
            accountNameField.style.backgroundColor = '';
            accountNameField.style.color = '';
        }
        
        if (messageEl) messageEl.classList.remove('show');
        if (accountTypeIndicator) accountTypeIndicator.style.display = 'none';
        
        this.setAttribute('data-verified', 'false');
        
        // Wait 1.5 seconds after user stops typing before verifying
        verificationTimeout = setTimeout(() => {
            verifyAccountNumber(this);
        }, 1500);
    });
    
    console.log('✅ Account verification setup complete');
}
// ============================================
// SELLER VERIFICATION FUNCTIONS
// ============================================
async function checkVerificationStatus() {
    try {
        const response = await fetch('/api/verification/status', { credentials: 'include' });
        if (!response.ok) return { isVerified: false, status: 'unknown' };
        const data = await response.json();
        return { isVerified: data.status === 'verified', status: data.status, verification_type: data.verification_type, phone_verified: data.phone_verified, documents_uploaded: data.documents_uploaded };
    } catch (error) { console.error('Verification check error:', error); return { isVerified: false, status: 'error' }; }
}

function openVerificationModal() {
    const modal = document.getElementById('verificationModal');
    const step1 = document.getElementById('verificationStep1');
    const step2 = document.getElementById('verificationStep2');
    const processing = document.getElementById('verificationProcessing');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    if (processing) processing.style.display = 'none';
    const phoneInput = document.getElementById('verifyPhone');
    if (phoneInput) { phoneInput.value = ''; phoneInput.disabled = false; }
    const otpSection = document.getElementById('otpSection');
    if (otpSection) otpSection.style.display = 'none';
    const phoneVerifiedStatus = document.getElementById('phoneVerifiedStatus');
    if (phoneVerifiedStatus) phoneVerifiedStatus.innerHTML = '';
    const verificationType = document.getElementById('verificationType');
    if (verificationType) verificationType.value = 'individual';
    const businessSection = document.getElementById('businessSection');
    if (businessSection) businessSection.style.display = 'none';
    const governmentId = document.getElementById('verifyGovernmentId');
    const selfie = document.getElementById('verifySelfie');
    const addressProof = document.getElementById('verifyAddressProof');
    if (governmentId) governmentId.value = '';
    if (selfie) selfie.value = '';
    if (addressProof) addressProof.value = '';
    if (modal) modal.classList.add('open');
}
window.openVerificationModal = openVerificationModal;

function closeVerificationModal() { const modal = document.getElementById('verificationModal'); if (modal) modal.classList.remove('open'); }
window.closeVerificationModal = closeVerificationModal;

function toggleVerificationType() {
    const type = document.getElementById('verificationType').value;
    const businessSection = document.getElementById('businessSection');
    if (businessSection) businessSection.style.display = type === 'business' ? 'block' : 'none';
}
window.toggleVerificationType = toggleVerificationType;

async function sendOTP() {
    const phone = document.getElementById('verifyPhone').value.trim();
    if (!phone) { showToast('Error', 'Please enter your phone number', 'error'); return; }
    const phoneRegex = /^0[789][01]\d{8}$|^\+234[789][01]\d{8}$/;
    if (!phoneRegex.test(phone) && !phone.match(/^\+\d{10,15}$/)) { showToast('Error', 'Please enter a valid phone number', 'error'); return; }
    const btn = document.getElementById('sendOtpBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        const response = await fetch('/api/verification/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone_number: phone }), credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            showToast('Code Sent', 'Check your email for verification code', 'success');
            const otpSection = document.getElementById('otpSection');
            if (otpSection) otpSection.style.display = 'block';
        } else { showToast('Error', data.error || 'Failed to send code', 'error'); }
    } catch (err) { showToast('Error', 'Network error. Please try again.', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Send Code'; }
}
window.sendOTP = sendOTP;

async function verifyOTP() {
    const otp = document.getElementById('verifyOtp').value.trim();
    if (!otp || otp.length !== 6) { showToast('Error', 'Please enter the 6-digit code', 'error'); return; }
    try {
        const response = await fetch('/api/verification/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp_code: otp }), credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            const phoneVerifiedStatus = document.getElementById('phoneVerifiedStatus');
            if (phoneVerifiedStatus) phoneVerifiedStatus.innerHTML = '<span style="color: var(--success);">✓ Phone verified!</span>';
            const otpSection = document.getElementById('otpSection');
            if (otpSection) otpSection.style.display = 'none';
            const phoneInput = document.getElementById('verifyPhone');
            if (phoneInput) phoneInput.disabled = true;
            const step1 = document.getElementById('verificationStep1');
            const step2 = document.getElementById('verificationStep2');
            if (step1) step1.style.display = 'none';
            if (step2) step2.style.display = 'block';
            showToast('Success', 'Phone verified! Please upload your documents', 'success');
        } else { showToast('Error', data.error || 'Invalid code', 'error'); }
    } catch (err) { showToast('Error', 'Network error. Please try again.', 'error'); }
}
window.verifyOTP = verifyOTP;

async function submitVerification() {
    const formData = new FormData();
    const governmentId = document.getElementById('verifyGovernmentId').files[0];
    const selfie = document.getElementById('verifySelfie').files[0];
    const addressProof = document.getElementById('verifyAddressProof').files[0];
    if (!governmentId) { showToast('Error', 'Government ID is required', 'error'); return; }
    if (!selfie) { showToast('Error', 'Selfie with ID is required', 'error'); return; }
    if (!addressProof) { showToast('Error', 'Proof of address is required', 'error'); return; }
    formData.append('government_id', governmentId);
    formData.append('selfie_with_id', selfie);
    formData.append('address_proof', addressProof);
    const verificationType = document.getElementById('verificationType').value;
    formData.append('verification_type', verificationType);
    if (verificationType === 'business') {
        const businessName = document.getElementById('verifyBusinessName')?.value;
        const businessCert = document.getElementById('verifyBusinessCert')?.files[0];
        const taxId = document.getElementById('verifyTaxId')?.value;
        const taxDoc = document.getElementById('verifyTaxDoc')?.files[0];
        if (businessName) formData.append('business_name', businessName);
        if (businessCert) formData.append('business_certificate', businessCert);
        if (taxId) formData.append('tax_id', taxId);
        if (taxDoc) formData.append('tax_id_document', taxDoc);
    }
    const step2 = document.getElementById('verificationStep2');
    const processing = document.getElementById('verificationProcessing');
    if (step2) step2.style.display = 'none';
    if (processing) processing.style.display = 'block';
    try {
        const response = await fetch('/api/verification/auto-verify', { method: 'POST', body: formData, credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            showToast('Verification Complete!', 'You can now start selling', 'success');
            closeVerificationModal();
            sellerMode = true;
            const becomeBtn = document.getElementById('becomeSeller');
            const sellerView = document.getElementById('sellerView');
            const browseModeText = document.getElementById('browseModeText');
            if (becomeBtn) becomeBtn.textContent = 'Back to Buyer View';
            if (sellerView) sellerView.classList.add('active');
            if (browseModeText) browseModeText.innerHTML = 'Seller';
            await loadUser();
            if (sellerView) sellerView.scrollIntoView({ behavior: 'smooth' });
        } else { showToast('Error', data.error || 'Verification failed', 'error'); if (step2) step2.style.display = 'block'; if (processing) processing.style.display = 'none'; }
    } catch (err) { console.error('Verification error:', err); showToast('Error', 'Network error. Please try again.', 'error'); if (step2) step2.style.display = 'block'; if (processing) processing.style.display = 'none'; }
}
window.submitVerification = submitVerification;

// ============================================
// PRODUCT TYPE UI LOGIC
// ============================================
function createAffiliateBlock() {
    if (document.getElementById('affiliateBlock')) return;
    
    const digitalBlock = document.getElementById('digitalBlock');
    const affiliateHtml = `
        <div id="affiliateBlock" class="conditional-section">
            <div class="form-section">
                <div class="form-section-header">
                    <i class="fas fa-link"></i>
                    <h4>Affiliate Product Details</h4>
                </div>
                <div class="form-group">
                    <label class="form-label">Affiliate URL <span class="required">*</span></label>
                    <input type="url" id="p_affiliate" class="form-input" 
                           placeholder="https://affiliate.example.com/product/123" 
                           required />
                    <div id="p_affiliate_error" class="form-error"></div>
                    <span class="form-help">Paste the complete affiliate link from AliExpress, Amazon, or other platforms</span>
                </div>
                <div class="form-group">
                    <label class="form-label">External Product Image URL (Optional)</label>
                    <input type="url" id="p_external_image" class="form-input" 
                           placeholder="https://example.com/image.jpg" />
                    <span class="form-help">If no image uploaded, we'll try to fetch from this URL</span>
                </div>
                <div class="commission-card" style="margin-top: 20px;">
                    <h5><i class="fas fa-percentage"></i> Affiliate Commission</h5>
                    <div class="commission-structure">
                        <div class="commission-item">
                            <i class="fas fa-chart-line"></i>
                            <span><strong>10%</strong> Platform Fee</span>
                        </div>
                        <div class="commission-item">
                            <i class="fas fa-wallet"></i>
                            <span><strong>90%</strong> You Keep</span>
                        </div>
                        <div class="commission-item">
                            <i class="fas fa-external-link-alt"></i>
                            <span><strong>External</strong> Affiliate Link - No payment processing needed</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const formContainer = document.querySelector('.form-container');
    if (digitalBlock) {
        digitalBlock.insertAdjacentHTML('afterend', affiliateHtml);
    } else if (formContainer) {
        formContainer.insertAdjacentHTML('beforeend', affiliateHtml);
    }
    
    // ✅ HIDE PAYMENT SECTION WHEN AFFILIATE BLOCK IS CREATED
    const paymentSection = document.getElementById('paymentProviderSection');
    const bankDetailsSection = document.getElementById('bankDetailsSection');
    const businessInfoDiv = document.getElementById('businessInfo');
    
    if (paymentSection) paymentSection.style.display = 'none';
    if (bankDetailsSection) bankDetailsSection.style.display = 'none';
    if (businessInfoDiv) businessInfoDiv.classList.remove('show');
}
function initializeCategories() {
    const categorySelect = document.getElementById('p_category_select');
    const existingCategories = Array.from(categorySelect.options).map(opt => opt.value);
    categoriesSet.forEach(category => {
        if (category && !existingCategories.includes(category)) {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        }
    });
}

// ============================================
// PRODUCT UPLOAD - COMPLETE
// ============================================
// Update the product type change event listener
document.getElementById('p_type')?.addEventListener('change', (ev) => {
    const v = ev.target.value;
    const digitalBlock = document.getElementById('digitalBlock');
    const physicalBlock = document.getElementById('physicalBlock');
    let affiliateBlock = document.getElementById('affiliateBlock');
    const paymentSection = document.getElementById('paymentProviderSection');
    const bankDetailsSection = document.getElementById('bankDetailsSection');
    const businessInfoDiv = document.getElementById('businessInfo');
    
    // Hide all conditional sections first
    if (digitalBlock) digitalBlock.classList.remove('show');
    if (physicalBlock) physicalBlock.classList.remove('show');
    if (affiliateBlock) affiliateBlock.classList.remove('show');
    
    // Show relevant section based on product type
    if (v === 'digital') {
        if (digitalBlock) digitalBlock.classList.add('show');
        // Digital products need payment
        if (paymentSection) paymentSection.style.display = 'block';
        if (bankDetailsSection) bankDetailsSection.style.display = 'block';
        if (businessInfoDiv) businessInfoDiv.classList.add('show');
    } 
    else if (v === 'physical') {
        if (physicalBlock) physicalBlock.classList.add('show');
        // Physical products need payment
        if (paymentSection) paymentSection.style.display = 'block';
        if (bankDetailsSection) bankDetailsSection.style.display = 'block';
        if (businessInfoDiv) businessInfoDiv.classList.add('show');
        // Set default payment option
        const paymentOption = document.getElementById('p_paymentOption');
        if (paymentOption) paymentOption.value = 'pay_on_delivery';
    } 
    else if (v === 'affiliate') {
        // Create affiliate block if it doesn't exist
        if (!affiliateBlock) {
            createAffiliateBlock();
        } else {
            affiliateBlock.classList.add('show');
        }
        
        // ✅ HIDE PAYMENT OPTIONS FOR AFFILIATE PRODUCTS
        if (paymentSection) paymentSection.style.display = 'none';
        if (bankDetailsSection) bankDetailsSection.style.display = 'none';
        if (businessInfoDiv) businessInfoDiv.classList.remove('show');
        
        // Clear payment provider selection since not needed
        const paymentProvider = document.getElementById('p_paymentProvider');
        if (paymentProvider) paymentProvider.value = '';
        
        // Remove selected class from provider options
        document.querySelectorAll('.provider-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        
        console.log('🔗 Affiliate product selected - payment options hidden');
    }
});

function getSelectedCategory() {
    const selectCategory = document.getElementById('p_category_select').value.trim();
    const newCategory = document.getElementById('p_category_new').value.trim();
    return newCategory || selectCategory || '';
}

function toggleDeliveryMethod() {
    const deliveryType = document.getElementById('p_deliveryType')?.value;
    const deliverySection = document.getElementById('deliverySection');
    const pickupSection = document.getElementById('pickupSection');
    if (deliverySection) deliverySection.style.display = 'none';
    if (pickupSection) pickupSection.style.display = 'none';
    if (deliveryType === 'delivery' && deliverySection) deliverySection.style.display = 'block';
    else if (deliveryType === 'pickup' && pickupSection) pickupSection.style.display = 'block';
    else if (deliveryType === 'both') { if (deliverySection) deliverySection.style.display = 'block'; if (pickupSection) pickupSection.style.display = 'block'; }
}

// ============================================
// FORM VALIDATION
// ============================================
function validateProductForm() {
    console.log("🔍 Starting form validation...");
    const errors = [];
    let hasErrors = false;
    
    // Reset errors
    document.querySelectorAll('.form-error').forEach(el => {
        el.classList.remove('show');
        el.textContent = '';
    });
    
    // Get all form values
    const title = document.getElementById('p_title')?.value;
    const price = document.getElementById('p_price')?.value;
    const type = document.getElementById('p_type')?.value;
    const paymentProvider = document.getElementById('p_paymentProvider')?.value;
    const categorySelect = document.getElementById('p_category_select')?.value;
    const categoryNew = document.getElementById('p_category_new')?.value;
    const description = document.getElementById('p_description')?.value;
    const images = document.getElementById('p_images')?.files;
    
    // Basic validations
    if (!title || !title.trim()) {
        errors.push({ id: 'p_title', errorId: 'p_title_error', message: 'Product name is required' });
        hasErrors = true;
    }
    
    if (!price || !price.trim() || parseFloat(price) <= 0) {
        errors.push({ id: 'p_price', errorId: 'p_price_error', message: 'Valid price is required' });
        hasErrors = true;
    }
    
    if (!type) {
        errors.push({ id: 'p_type', errorId: 'p_type_error', message: 'Product type is required' });
        hasErrors = true;
    }
    
    // ✅ ONLY validate payment provider for non-affiliate products
    if (type !== 'affiliate') {
        if (!paymentProvider) {
            errors.push({ id: 'p_paymentProvider', errorId: 'p_paymentProvider_error', message: 'Payment provider is required' });
            hasErrors = true;
        }
    }
    
    // Category validation
    if (!categorySelect && !categoryNew) {
        errors.push({ id: 'p_category_select', errorId: 'p_category_error', message: 'Category is required' });
        hasErrors = true;
    }
    
    // Description validation
    if (!description || !description.trim()) {
        errors.push({ id: 'p_description', errorId: 'p_description_error', message: 'Description is required' });
        hasErrors = true;
    }
    
    // Affiliate link validation
    if (type === 'affiliate') {
        const affiliateLink = document.getElementById('p_affiliate')?.value;
        if (!affiliateLink || !affiliateLink.trim()) {
            errors.push({ id: 'p_affiliate', errorId: 'p_affiliate_error', message: 'Affiliate link is required' });
            hasErrors = true;
        } else {
            try {
                new URL(affiliateLink);
            } catch (e) {
                errors.push({ id: 'p_affiliate', errorId: 'p_affiliate_error', message: 'Please enter a valid URL (include https://)' });
                hasErrors = true;
            }
        }
    }
    
    // Images validation (affiliate products can skip images if external image provided)
    if (type !== 'affiliate') {
        if (!images || images.length === 0) {
            errors.push({ id: 'p_images', errorId: 'p_images_error', message: 'At least one image is required' });
            hasErrors = true;
        }
    } else {
        // For affiliate, check if either image uploaded OR external image URL provided
        const externalImage = document.getElementById('p_external_image')?.value;
        if ((!images || images.length === 0) && !externalImage) {
            errors.push({ id: 'p_images', errorId: 'p_images_error', message: 'At least one image or external image URL is required' });
            hasErrors = true;
        }
    }
    
    // Digital file validation
    if (type === 'digital') {
        const file = document.getElementById('p_file')?.files;
        if (!file || file.length === 0) {
            errors.push({ id: 'p_file', errorId: 'p_file_error', message: 'Digital file is required' });
            hasErrors = true;
        }
    }
    
    // ✅ ONLY validate business/bank info for non-affiliate products
    if (type !== 'affiliate') {
        const businessName = document.getElementById('p_businessName')?.value;
        const businessEmail = document.getElementById('p_businessEmail')?.value;
        const businessPhone = document.getElementById('p_businessPhone')?.value;
        const country = document.getElementById('p_country')?.value;
        const bankName = document.getElementById('p_bankName')?.value;
        const accountNumber = document.getElementById('p_accountNumber')?.value;
        
        const isVirtualAccount = document.getElementById('isVirtualAccount')?.checked || false;
        const manualAccountName = document.getElementById('manualAccountName')?.value.trim();
        let accountName = document.getElementById('p_accountName')?.value;
        
        if (isVirtualAccount && manualAccountName && (!accountName || accountName === '')) {
            accountName = manualAccountName;
        }
        
        if (!businessName || !businessName.trim()) {
            errors.push({ id: 'p_businessName', errorId: 'p_businessName_error', message: 'Business name is required' });
            hasErrors = true;
        }
        
        if (!businessEmail || !businessEmail.trim()) {
            errors.push({ id: 'p_businessEmail', errorId: 'p_businessEmail_error', message: 'Business email is required' });
            hasErrors = true;
        }
        
        if (!businessPhone || !businessPhone.trim()) {
            errors.push({ id: 'p_businessPhone', errorId: 'p_businessPhone_error', message: 'Business phone is required' });
            hasErrors = true;
        }
        
        if (!country || !country.trim()) {
            errors.push({ id: 'p_country', errorId: 'p_country_error', message: 'Country is required' });
            hasErrors = true;
        }
        
        if (!bankName || !bankName.trim()) {
            errors.push({ id: 'p_bankName', errorId: 'p_bankName_error', message: 'Bank name is required' });
            hasErrors = true;
        }
        
        if (!accountNumber || !accountNumber.trim()) {
            errors.push({ id: 'p_accountNumber', errorId: 'p_accountNumber_error', message: 'Account number is required' });
            hasErrors = true;
        }
        
        if (!accountName || !accountName.trim()) {
            if (!(isVirtualAccount && manualAccountName)) {
                errors.push({ id: 'p_accountName', errorId: 'p_accountName_error', message: 'Account holder name is required' });
                hasErrors = true;
            }
        }
    }
    
    // Display errors
    errors.forEach(error => {
        const errorEl = document.getElementById(error.errorId);
        if (errorEl) { 
            errorEl.textContent = error.message;
            errorEl.classList.add('show');
        }
    });
    
    if (hasErrors) {
        const firstError = document.querySelector('.form-error.show');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    return !hasErrors;
}
// ============================================
// UPLOAD PRODUCT BUTTON HANDLER
// ============================================
document.getElementById('uploadProductBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const isVirtualAccount = document.getElementById('isVirtualAccount')?.checked || false;
    const manualAccountName = document.getElementById('manualAccountName')?.value.trim();
    const accountNameField = document.getElementById('p_accountName');
    if (isVirtualAccount && manualAccountName && accountNameField) {
        accountNameField.value = manualAccountName;
        accountNameField.readOnly = true;
    }
    if (!validateProductForm()) return;
    if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
    const fd = new FormData();
    const title = document.getElementById('p_title')?.value.trim();
    const description = document.getElementById('p_description')?.value.trim();
    const category = getSelectedCategory();
    const price = document.getElementById('p_price')?.value || '0';
    const type = document.getElementById('p_type')?.value;
    const paymentProvider = document.getElementById('p_paymentProvider')?.value;
    const deliveryDays = type === 'physical' ? document.getElementById('p_deliveryDays')?.value || '7' : '';
    const productCost = type === 'physical' ? document.getElementById('p_productCost')?.value || '3' : null;
    const deliveryLocations = type === 'physical' ? document.getElementById('p_deliveryLocations')?.value.trim() || 'Worldwide' : '';
    let affiliateLink = '', externalImage = '';
    if (type === 'affiliate') {
        affiliateLink = document.getElementById('p_affiliate')?.value.trim() || '';
        externalImage = document.getElementById('p_external_image')?.value.trim() || '';
    }
    const deliveryType = document.getElementById('p_deliveryType')?.value || 'delivery';
    const deliveryCountriesSelect = document.getElementById('p_deliveryCountries');
    const deliveryCountries = deliveryCountriesSelect ? Array.from(deliveryCountriesSelect.selectedOptions).map(opt => opt.value).join(', ') : 'Worldwide';
    const deliveryStates = document.getElementById('p_deliveryStates')?.value || '';
    const pickupAddress = document.getElementById('p_pickupAddress')?.value || '';
    const pickupHours = document.getElementById('p_pickupHours')?.value || '';
    const pickupInstructions = document.getElementById('p_pickupInstructions')?.value || '';
    const conditionType = document.getElementById('p_condition_type')?.value || 'new';
    const conditionDescription = document.getElementById('p_condition_description')?.value || '';
    const manufacturingDate = document.getElementById('p_manufacturing_date')?.value || '';
    const warrantyMonths = document.getElementById('p_warranty_months')?.value || '0';
    const originalPackaging = document.getElementById('p_original_packaging')?.value || '1';
    const accessoriesIncluded = document.getElementById('p_accessories')?.value || '';
    const visibleDefects = document.getElementById('p_defects')?.value || '';
    const businessName = document.getElementById('p_businessName')?.value.trim();
    const businessEmail = document.getElementById('p_businessEmail')?.value.trim();
    const businessPhone = document.getElementById('p_businessPhone')?.value.trim();
    const country = document.getElementById('p_country')?.value.trim();
    const bankName = document.getElementById('p_bankName')?.value.trim();
    const bankCode = document.getElementById('p_bankCode')?.value.trim();
    const accountNumber = document.getElementById('p_accountNumber')?.value.trim();
    let accountName = document.getElementById('p_accountName')?.value.trim();
    if (isVirtualAccount && manualAccountName && !accountName) accountName = manualAccountName;
    fd.append('title', title);
    fd.append('description', description || '');
    fd.append('category', category || '');
    fd.append('price', price);
    fd.append('type', type);
    fd.append('paymentProvider', paymentProvider);
    if (type === 'physical') {
        fd.append('delivery_days', deliveryDays);
        fd.append('product_cost', productCost);
        fd.append('delivery_type', deliveryType);
        fd.append('payment_option', document.getElementById('p_paymentOption')?.value || 'pay_before_delivery');
        fd.append('delivery_locations', deliveryLocations);
        fd.append('delivery_countries', deliveryCountries);
        fd.append('delivery_states', deliveryStates);
        fd.append('pickup_address', pickupAddress);
        fd.append('pickup_hours', pickupHours);
        fd.append('pickup_instructions', pickupInstructions);
    }
    if (type === 'digital') {
        const fileInput = document.getElementById('p_file');
        if (fileInput?.files.length > 0) fd.append('file', fileInput.files[0]);
    }
    if (type === 'affiliate') {
        fd.append('affiliate_link', affiliateLink);
        if (externalImage) fd.append('external_image', externalImage);
    }
    fd.append('condition_type', conditionType);
    fd.append('condition_description', conditionDescription);
    fd.append('manufacturing_date', manufacturingDate);
    fd.append('warranty_months', warrantyMonths);
    fd.append('original_packaging', originalPackaging);
    fd.append('accessories_included', accessoriesIncluded);
    fd.append('visible_defects', visibleDefects);
    fd.append('businessName', businessName);
    fd.append('businessEmail', businessEmail);
    fd.append('businessPhone', businessPhone);
    fd.append('country', country);
    fd.append('bankName', bankName);
    fd.append('bankCode', bankCode || '');
    fd.append('accountNumber', accountNumber);
    fd.append('accountName', accountName);
    fd.append('is_virtual_account', isVirtualAccount ? '1' : '0');
    const imagesInput = document.getElementById('p_images');
    if (imagesInput?.files.length > 0) { for (let i = 0; i < imagesInput.files.length; i++) { fd.append('images[]', imagesInput.files[i]); } }
    const uploadMessage = document.getElementById('uploadMessage');
    if (uploadMessage) {
        uploadMessage.innerHTML = '<div class="form-success"><i class="fas fa-spinner fa-spin"></i> Uploading product...</div>';
        uploadMessage.classList.add('show');
    }
    try {
        const res = await fetch('/api/upload-product', { method: 'POST', body: fd, credentials: 'include' });
        const text = await res.text();
        if (!text || text.trim() === '') throw new Error('Server returned empty response');
        let data;
        try { data = JSON.parse(text); } catch (parseError) { console.error("Failed to parse:", text.substring(0, 200)); throw new Error('Invalid server response'); }
        if (!res.ok) { if (uploadMessage) uploadMessage.innerHTML = `<div class="form-success" style="color:var(--danger)">❌ ${escapeHtml(data.error || 'Upload failed')}</div>`; return; }
        if (uploadMessage) uploadMessage.innerHTML = `<div class="form-success" style="color:var(--success)">✅ ${data.message}</div>`;
        document.querySelectorAll('#sellerView input, #sellerView textarea, #sellerView select').forEach(el => { if (el.type !== 'button' && el.id !== 'uploadProductBtn') el.value = ''; });
        const fileInput = document.getElementById('p_file'); if (fileInput) fileInput.value = '';
        const imagesInputReset = document.getElementById('p_images'); if (imagesInputReset) imagesInputReset.value = '';
        document.querySelectorAll('.provider-option').forEach(opt => opt.classList.remove('selected'));
        const paymentProviderInput = document.getElementById('p_paymentProvider'); if (paymentProviderInput) paymentProviderInput.value = '';
        const businessInfoDiv = document.getElementById('businessInfo'); if (businessInfoDiv) businessInfoDiv.classList.remove('show');
        const digitalBlockDiv = document.getElementById('digitalBlock'); if (digitalBlockDiv) digitalBlockDiv.classList.remove('show');
        const physicalBlockDiv = document.getElementById('physicalBlock'); if (physicalBlockDiv) physicalBlockDiv.classList.remove('show');
        const affiliateBlockDiv = document.getElementById('affiliateBlock'); if (affiliateBlockDiv) affiliateBlockDiv.classList.remove('show');
        const virtualCheckbox = document.getElementById('isVirtualAccount'); if (virtualCheckbox) virtualCheckbox.checked = false;
        const manualNameField = document.getElementById('manualAccountName'); if (manualNameField) { manualNameField.value = ''; manualNameField.style.display = 'none'; }
        const virtualHelp = document.getElementById('virtualAccountHelp'); if (virtualHelp) virtualHelp.style.display = 'none';
        setTimeout(async () => {
            sellerMode = false;
            const becomeBtn = document.getElementById('becomeSeller');
            const sellerView = document.getElementById('sellerView');
            if (becomeBtn) becomeBtn.textContent = 'Become a Seller';
            if (sellerView) sellerView.classList.remove('active');
            if (uploadMessage) uploadMessage.classList.remove('show');
            await loadProducts();
            const categorySelect = document.getElementById('p_category_select');
            if (categorySelect) {
                while (categorySelect.options.length > 1) categorySelect.remove(1);
                Array.from(categoriesSet).sort().forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    categorySelect.appendChild(option);
                });
            }
            showToast('Product uploaded successfully!', 'success');
        }, 3000);
    } catch(err) { console.error('Upload error:', err); if (uploadMessage) uploadMessage.innerHTML = `<div class="form-success" style="color:var(--danger)">❌ Upload failed: ${err.message}</div>`; }
});

// ============================================
// MOBILE NAVIGATION
// ============================================
function initMobileNav() {
    const headerActions = document.querySelector('.header-actions');
    const mobileNavToggle = document.createElement('button');
    mobileNavToggle.className = 'mobile-nav-toggle';
    mobileNavToggle.innerHTML = '<span></span><span></span><span></span>';
    mobileNavToggle.setAttribute('aria-label', 'Toggle navigation menu');
    const mobileNav = document.createElement('nav');
    mobileNav.className = 'mobile-nav';
    mobileNav.innerHTML = `<a href="index.html">Home</a><a href="knowledge-hub.html">Knowledge Hub</a><a href="services.html">Services</a><a href="courses.html">Courses</a><a href="products.html" class="active">Products</a>`;
    document.body.appendChild(mobileNav);
    if (headerActions) headerActions.insertBefore(mobileNavToggle, headerActions.firstChild);
    mobileNavToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        this.classList.toggle('active');
        mobileNav.classList.toggle('active');
        document.body.classList.toggle('mobile-nav-open');
    });
    document.addEventListener('click', function(event) {
        if (!mobileNav.contains(event.target) && !mobileNavToggle.contains(event.target) && mobileNav.classList.contains('active')) {
            mobileNavToggle.classList.remove('active');
            mobileNav.classList.remove('active');
            document.body.classList.remove('mobile-nav-open');
        }
    });
    function updateNavigation() {
        const desktopNav = document.querySelector('nav:not(.mobile-nav)');
        if (window.innerWidth <= 768) {
            if (mobileNavToggle) mobileNavToggle.style.display = 'flex';
            if (desktopNav) desktopNav.style.display = 'none';
        } else {
            if (mobileNavToggle) mobileNavToggle.style.display = 'none';
            if (desktopNav) desktopNav.style.display = 'flex';
            mobileNavToggle.classList.remove('active');
            mobileNav.classList.remove('active');
            document.body.classList.remove('mobile-nav-open');
        }
    }
    updateNavigation();
    window.addEventListener('resize', updateNavigation);
}
// ============================================
// DASHBOARD TABS INITIALIZATION - FIXED
// ============================================

function initDashboardTabs() {
    const tabButtons = document.querySelectorAll('.dashboard-tabs .tab-btn');
    
    if (!tabButtons || tabButtons.length === 0) {
        console.log('No tab buttons found');
        return;
    }
    
    // Remove existing listeners to prevent duplicates
    tabButtons.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            if (!tabId) return;
            
            console.log('Tab clicked:', tabId);
            
            // Update active tab button
            document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            
            // Hide all tab contents
            document.querySelectorAll('.dashboard-tabs .tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Show selected tab content
            let contentId = tabId;
            if (tabId === 'paid-orders') contentId = 'paidOrdersTab';
            if (tabId === 'shares') contentId = 'sharesTab';
            if (tabId === 'admin') contentId = 'adminTabContent';
            if (tabId === 'buyer-orders') contentId = 'buyerOrdersTab';
            
            const selectedContent = document.getElementById(contentId + 'Tab');
            if (selectedContent) {
                selectedContent.classList.add('active');
            } else {
                // Try without 'Tab' suffix
                const altContent = document.getElementById(contentId);
                if (altContent) altContent.classList.add('active');
            }
            
            // Load tab data
            loadTabData(tabId);
        });
    });
    
    console.log('✅ Dashboard tabs initialized');
}

function loadTabData(tabId) {
    switch(tabId) {
        case 'products':
            if (typeof loadMyProducts === 'function') loadMyProducts();
            break;
        case 'sales':
            if (typeof loadSalesHistory === 'function') loadSalesHistory();
            break;
        case 'paid-orders':
            if (typeof loadPaidOrders === 'function') loadPaidOrders();
            break;
        case 'analytics':
            if (typeof loadCharts === 'function') loadCharts();
            break;
        case 'refunds':
            if (typeof loadPendingRefunds === 'function') loadPendingRefunds();
            break;
        case 'shares':
            if (typeof loadShareStats === 'function') loadShareStats();
            break;
        case 'purchases':
            if (typeof loadMyPurchases === 'function') loadMyPurchases();
            break;
        case 'admin':
            if (currentUser && currentUser.role === 'admin') {
                if (typeof loadAdminData === 'function') loadAdminData();
            }
            break;
    }
}
// ============================================
// INITIALIZE EVERYTHING ON PAGE LOAD
// ============================================
// INITIALIZE EVERYTHING ON PAGE LOAD
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 DOM Content Loaded - Initializing...");
    
    initMobileNav();
    await initCurrency();
    await loadUser();
    await loadProducts();
    initializeCategories();
    
    if (products.length > 0) { 
        currentProductId = products[0].id; 
        loadProductReviews(currentProductId); 
    }
    
    // ========== MODAL ELEMENTS ==========
    const loginModal = document.getElementById('loginModal');
    const signupModal = document.getElementById('signupModal');
    const loginOpenBtn = document.getElementById('loginOpen');
    const signupOpenBtn = document.getElementById('signupOpen');
    const closeLogin = document.getElementById('closeLogin');
    const closeSignup = document.getElementById('closeSignup');
    
    if (loginOpenBtn) loginOpenBtn.addEventListener('click', () => openModal(loginModal));
    if (signupOpenBtn) signupOpenBtn.addEventListener('click', () => openModal(signupModal));
    if (closeLogin) closeLogin.addEventListener('click', () => closeModal(loginModal));
    if (closeSignup) closeSignup.addEventListener('click', () => closeModal(signupModal));
    
    window.addEventListener('click', (e) => { 
        if (e.target === loginModal) closeModal(loginModal); 
        if (e.target === signupModal) closeModal(signupModal); 
    });
    
    // ========== PASSWORD TOGGLE ==========
    const toggleLoginPwd = document.getElementById('toggleLoginPwd');
    const loginPassword = document.getElementById('loginPassword');
    if (toggleLoginPwd && loginPassword) {
        toggleLoginPwd.addEventListener('click', () => { 
            loginPassword.type = loginPassword.type === 'password' ? 'text' : 'password'; 
        });
    }
    
    const toggleSignupPwd = document.getElementById('toggleSignupPwd');
    const signupPassword = document.getElementById('signupPassword');
    if (toggleSignupPwd && signupPassword) {
        toggleSignupPwd.addEventListener('click', () => { 
            signupPassword.type = signupPassword.type === 'password' ? 'text' : 'password'; 
        });
    }
    
    // ========== LOGIN METHOD TOGGLE ==========
    const loginByUsername = document.getElementById('loginByUsername');
    const loginByEmail = document.getElementById('loginByEmail');
    const usernameGroup = document.getElementById('usernameGroup');
    const emailGroup = document.getElementById('emailGroup');
    
    if (loginByUsername) {
        loginByUsername.addEventListener('click', () => {
            loginByUsername.style.color = 'var(--accent)';
            loginByEmail.style.color = 'var(--text-gray)';
            if (usernameGroup) usernameGroup.style.display = 'block';
            if (emailGroup) emailGroup.style.display = 'none';
        });
    }
    
    if (loginByEmail) {
        loginByEmail.addEventListener('click', () => {
            loginByEmail.style.color = 'var(--accent)';
            loginByUsername.style.color = 'var(--text-gray)';
            if (usernameGroup) usernameGroup.style.display = 'none';
            if (emailGroup) emailGroup.style.display = 'block';
        });
    }
    
    // ========== LOGIN FORM ==========
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgDiv = document.getElementById('loginMsg');
            if (msgDiv) msgDiv.textContent = "";
            const useUsername = usernameGroup ? usernameGroup.style.display !== 'none' : true;
            const payload = { password: document.getElementById('loginPassword').value };
            if (useUsername) payload.username = document.getElementById('loginUsername').value;
            else payload.email = document.getElementById('loginEmail').value;
            try {
                const res = await fetch('/api/login', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() }, 
                    body: JSON.stringify(payload) 
                });
                const data = await res.json();
                if (!res.ok) { 
                    if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--danger);padding:8px;">${escapeHtml(data.error || 'Login failed')}</div>`; 
                    return; 
                }
                if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--success);padding:8px;">✅ ${escapeHtml(data.message || 'Logged in')}</div>`;
                await loadUser();
                await loadUserFavorites();
                closeModal(loginModal);
                if (sellerMode) { 
                    const sellerView = document.getElementById('sellerView'); 
                    if (sellerView) sellerView.classList.add('active'); 
                }
            } catch(err) { 
                console.error('login err', err); 
                if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--danger);padding:8px;">${escapeHtml('Login failed')}</div>`; 
            }
        });
    }
    
    // ========== SIGNUP FORM ==========
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgDiv = document.getElementById('signupMsg');
            if (msgDiv) msgDiv.textContent = "";
            const username = document.getElementById('signupUsername').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            if (!username || !email || !password) { 
                if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--danger);padding:8px;">All fields required.</div>`; 
                return; 
            }
            try {
                const res = await fetch('/api/signup', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() }, 
                    body: JSON.stringify({ username, email, password }) 
                });
                const data = await res.json();
                if (!res.ok) { 
                    if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--danger);padding:8px;">${escapeHtml(data.error || 'Signup failed')}</div>`; 
                    return; 
                }
                if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--success);padding:8px;">${escapeHtml(data.message || 'Signup success')}<br/>Attempting to login...</div>`;
                const loginRes = await fetch('/api/login', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() }, 
                    body: JSON.stringify({ username, password }) 
                });
                if (loginRes.ok) {
                    await loadUser();
                    await loadUserFavorites();
                    if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--success);padding:8px;">Signed up and logged in ✅</div>`;
                    closeModal(signupModal);
                } else { 
                    if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--success);padding:8px;">${escapeHtml(data.message || 'Signup success')}. Please login.</div>`; 
                }
            } catch(err) { 
                console.error('signup err', err); 
                if (msgDiv) msgDiv.innerHTML = `<div style="color:var(--danger);padding:8px;">Signup failed</div>`; 
            }
        });
    }
    
    // ========== SWITCH BETWEEN LOGIN/SIGNUP MODALS ==========
    const openSignupFromLogin = document.getElementById('openSignupFromLogin');
    const openLoginFromSignup = document.getElementById('openLoginFromSignup');
    if (openSignupFromLogin) openSignupFromLogin.addEventListener('click', () => { closeModal(loginModal); openModal(signupModal); });
    if (openLoginFromSignup) openLoginFromSignup.addEventListener('click', () => { closeModal(signupModal); openModal(loginModal); });
    
    // ========== BECOME SELLER BUTTON ==========
    const becomeSellerBtn = document.getElementById('becomeSeller');
    if (becomeSellerBtn) {
        becomeSellerBtn.addEventListener('click', async () => {
            if (!currentUser) { openModal(loginModal); return; }
            const verificationStatus = await checkVerificationStatus();
            if (!verificationStatus.isVerified) { openVerificationModal(); return; }
            sellerMode = !sellerMode;
            becomeSellerBtn.textContent = sellerMode ? 'Back to Buyer View' : 'Become a Seller';
            const sellerView = document.getElementById('sellerView');
            const browseModeText = document.getElementById('browseModeText');
            if (sellerView) sellerView.classList.toggle('active', sellerMode);
            if (browseModeText) browseModeText.innerHTML = sellerMode ? 'Seller' : 'Buyer';
            if (!sellerMode) window.scrollTo({ top: 200, behavior: 'smooth' });
        });
    }
    
    // ========== CANCEL SELLER BUTTON ==========
    const cancelSellerBtn = document.getElementById('cancelSeller');
    if (cancelSellerBtn) {
        cancelSellerBtn.addEventListener('click', () => {
            sellerMode = false;
            const becomeBtn = document.getElementById('becomeSeller');
            const sellerView = document.getElementById('sellerView');
            const browseModeText = document.getElementById('browseModeText');
            if (becomeBtn) becomeBtn.textContent = 'Become a Seller';
            if (sellerView) sellerView.classList.remove('active');
            if (browseModeText) browseModeText.innerHTML = 'Buyer';
        });
    }
    
    // ========== PRODUCT FILTERS ==========
    const searchInput = document.getElementById('searchInput');
    const filterType = document.getElementById('filterType');
    const filterCategory = document.getElementById('filterCategory');
    const sortSelect = document.getElementById('sortSelect');
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (searchInput) searchInput.addEventListener('input', debounce(renderProducts, 250));
    if (filterType) filterType.addEventListener('change', renderProducts);
    if (filterCategory) filterCategory.addEventListener('change', renderProducts);
    if (sortSelect) sortSelect.addEventListener('change', renderProducts);
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadProducts());
    
    // ========== CURRENCY HEADER ==========
    const currencyHeader = document.getElementById('currencyHeader');
    if (currencyHeader) currencyHeader.value = userCurrency;
    
    // ========== DASHBOARD BUTTONS - FIXED ==========
    const dashboardToggleBtn = document.getElementById('toggleDashboardBtn');
    const toggleDashboard = document.getElementById('toggleDashboard');
    
    // Helper function to safely add event listener
    function addSafeEventListener(element, event, handler) {
        if (!element) return;
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
        newElement.addEventListener(event, handler);
        return newElement;
    }
    
    // Fix Dashboard Toggle Button
    if (dashboardToggleBtn) {
        const fixedDashboardBtn = addSafeEventListener(dashboardToggleBtn, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Dashboard button clicked - toggling view");
            toggleDashboardView();
        });
        console.log("✅ Dashboard toggle button handler attached");
    }
    
    // Fix Toggle Dashboard Button (inside dashboard)
    if (toggleDashboard) {
        const fixedToggleDashboard = addSafeEventListener(toggleDashboard, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Toggle dashboard button clicked - closing dashboard");
            toggleDashboardView();
        });
        console.log("✅ Toggle dashboard button handler attached");
    }
    
    // ========== SALES HISTORY FILTERS ==========
    const salesPeriod = document.getElementById('salesPeriod');
    const salesStatus = document.getElementById('salesStatus');
    const searchMyProducts = document.getElementById('searchMyProducts');
    const filterMyProducts = document.getElementById('filterMyProducts');
    
    if (salesPeriod) salesPeriod.addEventListener('change', () => loadSalesHistory());
    if (salesStatus) salesStatus.addEventListener('change', () => loadSalesHistory());
    if (searchMyProducts) searchMyProducts.addEventListener('input', debounce(loadMyProducts, 300));
    if (filterMyProducts) filterMyProducts.addEventListener('change', loadMyProducts);
    
    // ========== ADDRESS FORM ==========
    const addressForm = document.getElementById('addressForm');
    const closeAddressModalBtn = document.getElementById('closeAddressModal');
    const cancelAddressBtn = document.getElementById('cancelAddress');
    const orderQuantity = document.getElementById('orderQuantity');
    
    if (addressForm) {
        const newForm = addressForm.cloneNode(true);
        addressForm.parentNode.replaceChild(newForm, addressForm);
        newForm.addEventListener('submit', submitOrderForm);
    }
    
    if (closeAddressModalBtn) {
        const newClose = closeAddressModalBtn.cloneNode(true);
        closeAddressModalBtn.parentNode.replaceChild(newClose, closeAddressModalBtn);
        newClose.addEventListener('click', closeAddressModal);
    }
    
    if (cancelAddressBtn) {
        const newCancel = cancelAddressBtn.cloneNode(true);
        cancelAddressBtn.parentNode.replaceChild(newCancel, cancelAddressBtn);
        newCancel.addEventListener('click', closeAddressModal);
    }
    
    if (orderQuantity) {
        const newQuantity = orderQuantity.cloneNode(true);
        orderQuantity.parentNode.replaceChild(newQuantity, orderQuantity);
        newQuantity.removeAttribute('max');
        newQuantity.addEventListener('input', function() { 
            let val = parseInt(this.value); 
            if (isNaN(val) || val < 1) { this.value = 1; } 
            if (typeof updateOrderTotalDisplay === 'function') updateOrderTotalDisplay(); 
        });
        newQuantity.addEventListener('change', function() { 
            let val = parseInt(this.value); 
            if (isNaN(val) || val < 1) { this.value = 1; } 
            if (typeof updateOrderTotalDisplay === 'function') updateOrderTotalDisplay(); 
        });
    }
    
    // ========== PAYMENT PROVIDER OPTIONS ==========
    const providerOptions = document.querySelectorAll('.provider-option');
    const paymentProviderInput = document.getElementById('p_paymentProvider');
    
    if (providerOptions.length && paymentProviderInput) {
        providerOptions.forEach(option => {
            option.addEventListener('click', function() {
                providerOptions.forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                paymentProviderInput.value = this.getAttribute('data-provider');
                const businessInfoDiv = document.getElementById('businessInfo');
                if (businessInfoDiv) businessInfoDiv.classList.add('show');
            });
        });
    }
    
    // ========== FLUTTERWAVE DEFAULT SELECTION ==========
    const flutterwaveOption = document.querySelector('.provider-option[data-provider="flutterwave"]');
    if (flutterwaveOption && paymentProviderInput) {
        flutterwaveOption.classList.add('selected');
        paymentProviderInput.value = 'flutterwave';
    }
    
    // ========== BUSINESS INFO DISPLAY ==========
    const businessInfoDiv = document.getElementById('businessInfo');
    if (businessInfoDiv) businessInfoDiv.classList.add('show');
    
    // ========== PAYMENT OPTION DEFAULT ==========
    const paymentOption = document.getElementById('p_paymentOption');
    if (paymentOption) paymentOption.value = 'pay_on_delivery';
    
    // ========== AFFILIATE BLOCK ==========
    createAffiliateBlock();
    const affiliateBlock = document.getElementById('affiliateBlock');
    if (affiliateBlock) affiliateBlock.classList.remove('show');
    
    // ========== DELIVERY METHOD ==========
    toggleDeliveryMethod();
    
    // ========== NOTIFICATION BELL ==========
    const notificationBtn = document.getElementById('notificationBtn');
    if (notificationBtn) {
        const newNotificationBtn = notificationBtn.cloneNode(true);
        notificationBtn.parentNode.replaceChild(newNotificationBtn, notificationBtn);
        newNotificationBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showNotificationDropdown();
        });
    }
    
    // ========== PAYMENT GATEWAY ==========
    if (paymentProviderInput) {
        paymentProviderInput.value = 'flutterwave';
        selectPaymentGateway('flutterwave');
    }
    
    // ========== VIRTUAL ACCOUNT TOGGLE ==========
    addVirtualAccountToggle();
    
    console.log("✅ DOMContentLoaded initialization complete");
    // Add to your DOMContentLoaded or initialization code
const purchaseFilter = document.getElementById('purchaseFilter');
const refreshPurchasesBtn = document.getElementById('refreshPurchasesBtn');

if (purchaseFilter) {
    purchaseFilter.addEventListener('change', () => loadMyPurchases());
}
if (refreshPurchasesBtn) {
    refreshPurchasesBtn.addEventListener('click', () => loadMyPurchases());
}
});

// ========== ADDITIONAL EVENT LISTENERS (OUTSIDE DOMContentLoaded) ==========
document.getElementById('searchInput')?.addEventListener('input', debounce(renderProducts, 250));
document.getElementById('filterType')?.addEventListener('change', renderProducts);
document.getElementById('filterCategory')?.addEventListener('change', renderProducts);
document.getElementById('sortSelect')?.addEventListener('change', renderProducts);

/* ============================================================
   ↓↓↓ NEW FEATURES ADD-ON STARTS HERE ↓↓↓
   Everything below is additive: it wraps renderProducts()/
   loadProducts() rather than editing them, and reads the same
   globals declared above (products, currentUser, userCurrency,
   fmtPrice, escapeHtml, $, openModal/closeModal, showToast).
   ============================================================ */

/* ============================================================
   PRODUCTS — NEW FEATURES ADD-ON
   Load this AFTER products.js. Nothing here rewrites existing
   functions — it wraps loadProducts()/renderProducts() and reads
   the same global state (products, currentUser, userCurrency,
   fmtPrice, escapeHtml, $, openModal/closeModal, showToast).

   Covers: real product pages, seller trust signals, seller
   storefronts, onboarding wizard nav, quick preview, ask seller,
   advanced filtering, recently viewed, similar products, order
   tracking shortcut, cart.
   ============================================================ */

/* ---------- small local state ---------- */
let cart = [];
let recentlyViewed = [];
let advancedFilterState = { priceMin: null, priceMax: null, minRating: 0, condition: '' };

/* ============================================================
   1. TRUST SIGNALS — shared render helper used by cards,
      product detail page, and the seller storefront banner.
   ============================================================ */
function renderTrustStrip(product) {
  const rating = Number(product.rating || product.seller_rating || 0);
  const sales = Number(product.seller_sales_count || product.sales_count || 0);
  const verified = !!(product.seller_verified || product.is_seller_verified);
  const memberSince = product.seller_since || product.seller_created_at;
  let bits = [];
  if (verified) bits.push(`<span class="verified"><i class="fas fa-badge-check"></i> Verified</span>`);
  if (rating > 0) bits.push(`<span class="stat"><i class="fas fa-star" style="color:var(--gold)"></i> ${rating.toFixed(1)}</span>`);
  if (sales > 0) bits.push(`<span class="stat">${sales} sale${sales === 1 ? '' : 's'}</span>`);
  if (memberSince) bits.push(`<span class="stat">Since ${formatDate(memberSince)}</span>`);
  return bits.join('<span style="color:var(--hairline-strong)">·</span>');
}

/* ============================================================
   2. CARD ENHANCEMENT — wraps the existing renderProducts()
      to inject trust strip, quick-view button, ask-seller button,
      a clickable seller byline, and repoints "Details/View"
      buttons to the new real product page instead of the modal.
   ============================================================ */
const _baseRenderProducts = renderProducts;

function applyAdvancedFilters(list) {
  let out = list.slice();
  if (advancedFilterState.priceMin != null) out = out.filter(p => (p.price || 0) >= advancedFilterState.priceMin);
  if (advancedFilterState.priceMax != null) out = out.filter(p => (p.price || 0) <= advancedFilterState.priceMax);
  if (advancedFilterState.minRating > 0) out = out.filter(p => (p.rating || 0) >= advancedFilterState.minRating);
  if (advancedFilterState.condition) out = out.filter(p => p.type !== 'physical' || (p.condition_type || '') === advancedFilterState.condition);
  return out;
}

renderProducts = function () {
  const backup = products;
  products = applyAdvancedFilters(products);
  _baseRenderProducts();
  products = backup;
  enhanceProductCards();
};

function enhanceProductCards() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  grid.querySelectorAll('.product-card').forEach(card => {
    const id = Number(card.getAttribute('data-id'));
    const product = products.find(p => p.id === id);
    if (!product) return;

    // Quick-view overlay button on the media
    const media = card.querySelector('.card-media');
    if (media && !media.querySelector('.media-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'media-overlay';
      overlay.innerHTML = `<button class="quick-view-btn" type="button"><i class="fas fa-eye"></i> Quick view</button>`;
      overlay.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        openQuickView(id);
      });
      media.appendChild(overlay);
    }

    // Trust strip under seller-info
    const sellerInfo = card.querySelector('.seller-info');
    if (sellerInfo && !card.querySelector('.trust-strip')) {
      const strip = document.createElement('div');
      strip.className = 'trust-strip';
      strip.innerHTML = renderTrustStrip(product);
      sellerInfo.insertAdjacentElement('afterend', strip);

      // Make the seller name a link to their storefront
      const sellerSpan = sellerInfo.querySelector('span');
      if (sellerSpan && product.user_id) {
        const name = sellerSpan.textContent.replace(/^By\s+/, '');
        sellerSpan.innerHTML = `By <a href="#" class="seller-link">${escapeHtml(name)}</a>`;
        sellerSpan.querySelector('a').addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          navigateToSellerStorefront(product.user_id, name);
        });
      }
    }

    // Ask Seller button (only for non-owners)
    const actions = card.querySelector('.card-actions');
    const isOwner = currentUser && (currentUser.id === product.user_id || currentUser.role === 'admin');
    if (actions && !isOwner && !actions.querySelector('.ask-seller')) {
      const askBtn = document.createElement('button');
      askBtn.className = 'small-btn ask-seller';
      askBtn.innerHTML = `<i class="fas fa-comment-dots"></i> Ask`;
      askBtn.addEventListener('click', (e) => { e.stopPropagation(); openAskSeller(id); });
      actions.appendChild(askBtn);
    }

    const cardBody = card.querySelector('.card-body');
    if (cardBody && product.type !== 'affiliate' && !cardBody.querySelector('.add-to-cart-btn')) {
      const cartBtn = document.createElement('button');
      cartBtn.className = 'btn secondary block add-to-cart-btn';
      cartBtn.style.marginTop = '8px';
      cartBtn.innerHTML = `<i class="fas fa-cart-plus"></i> Add to Cart`;
      cartBtn.addEventListener('click', (e) => { e.stopPropagation(); addToCart(id, 1); });
      cardBody.appendChild(cartBtn);
    }

    // Repoint any button whose inline handler opens the old details modal
    card.querySelectorAll('[onclick*="showProductFullDetails"]').forEach(btn => {
      btn.removeAttribute('onclick');
      btn.addEventListener('click', (e) => { e.stopPropagation(); navigateToProduct(id); });
    });

    // Card click (outside buttons) opens the real product page and tracks the view
    if (!card.dataset.navBound) {
      card.dataset.navBound = '1';
      card.addEventListener('click', () => navigateToProduct(id));
    }
  });
}

/* ============================================================
   3. REAL PRODUCT PAGES — /product/:id via pushState.
      Requires the server to fall back to products.html for
      /product/* paths (same rewrite you'd set up for any SPA route).
   ============================================================ */
function slugify(title) {
  return (title || 'product').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function navigateToProduct(id, pushHistory = true) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  trackRecentlyViewed(id);
  if (pushHistory) {
    history.pushState({ view: 'product', id }, '', `/product/${id}-${slugify(product.title)}`);
  }
  renderProductDetailPage(product);
  document.getElementById('browseMain').style.display = 'none';
  document.getElementById('sellerStorefrontPage').classList.remove('active');
  document.getElementById('productDetailPage').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function closeProductDetailPage(e) {
  if (e) e.preventDefault();
  history.pushState({ view: 'browse' }, '', '/products.html');
  document.getElementById('productDetailPage').classList.remove('active');
  document.getElementById('browseMain').style.display = '';
}

async function renderProductDetailPage(product) {
  const imageList = product._imageList && product._imageList.length ? product._imageList : [getProductImage ? getProductImage(product.images) : ''];
  document.getElementById('pdpBreadcrumbTitle').textContent = product.title;
  document.getElementById('pdpMainImage').src = imageList[0];
  document.getElementById('pdpMainImage').alt = escapeHtml(product.title);
  document.getElementById('pdpThumbs').innerHTML = imageList.map((img, i) =>
    `<img src="${img}" class="${i === 0 ? 'active' : ''}" onclick="document.getElementById('pdpMainImage').src='${img}'; this.parentElement.querySelectorAll('img').forEach(t=>t.classList.remove('active')); this.classList.add('active');">`
  ).join('');
  document.getElementById('pdpTitle').textContent = product.title;
  document.getElementById('pdpRating').innerHTML =
    `<span class="rating-stars">${'⭐'.repeat(Math.floor(product.rating || 0))}</span>
     <span class="rating-count">(${product.review_count || 0} reviews)</span>
     <span style="color:var(--text-muted);margin-left:8px">• ${product.favorite_count || 0} favorites</span>`;

  document.getElementById('pdpSellerAvatar').src = product.seller_avatar || 'https://placehold.co/80x80/f5f3ee/4a6fa5/png?text=%20';
  document.getElementById('pdpSellerName').textContent = product.seller_name || 'Seller';
  document.getElementById('pdpTrustStrip').innerHTML = renderTrustStrip(product);
  document.getElementById('pdpVisitStorefrontBtn').onclick = () => navigateToSellerStorefront(product.user_id, product.seller_name);

  document.getElementById('pdpPrice').textContent = fmtPrice(product.price);
  document.getElementById('pdpDescription').textContent = product.description || '';

  const isOwner = currentUser && (currentUser.id === product.user_id || currentUser.role === 'admin');
  let actionsHtml = '';
  if (!isOwner) {
    if (product.type === 'affiliate') {
      actionsHtml = `<button class="btn primary" onclick="openAffiliate('${escapeHtml(product.affiliate_link || '')}')"><i class="fas fa-external-link-alt"></i> Visit link</button>`;
    } else if (product.type === 'physical') {
      actionsHtml = `<button class="btn success" onclick="orderPhysicalProduct(${product.id})"><i class="fas fa-shopping-cart"></i> Order now</button>
                      <button class="btn secondary" onclick="addToCart(${product.id},1)"><i class="fas fa-cart-plus"></i> Add to cart</button>`;
    } else {
      actionsHtml = `<button class="btn primary" onclick="buyProduct(${product.id})"><i class="fas fa-shopping-cart"></i> Buy now</button>
                      <button class="btn secondary" onclick="addToCart(${product.id},1)"><i class="fas fa-cart-plus"></i> Add to cart</button>`;
    }
    actionsHtml += `<button class="btn ghost" onclick="openAskSeller(${product.id})"><i class="fas fa-comment-dots"></i> Ask seller</button>`;
  }
  actionsHtml += `<button class="btn ghost" onclick="toggleFavorite(${product.id})"><i class="fas fa-heart"></i></button>
                   <button class="btn ghost" onclick="shareProduct(${product.id}, '${(product.title || '').replace(/'/g, "\\'")}')"><i class="fas fa-share-alt"></i></button>`;
  document.getElementById('pdpActions').innerHTML = actionsHtml;

  // Delivery info for physical products
  const dEl = document.getElementById('pdpDeliveryInfo');
  if (product.type === 'physical') {
    dEl.innerHTML = `<div class="detail-item"><i class="fas fa-globe"></i><span><strong>Ships to:</strong> ${escapeHtml(product.delivery_countries || 'Worldwide')}</span></div>
                      <div class="detail-item"><i class="fas fa-calendar-day"></i><span><strong>Est. delivery:</strong> ${product.estimated_delivery_days || 7} days</span></div>`;
  } else { dEl.innerHTML = ''; }

  // Reuse the existing reviews loader if present, targeting the same DOM the old page used
  if (typeof selectProductForReviews === 'function') {
    try { selectProductForReviews(product.id); } catch (e) { /* non-fatal */ }
  }

  renderSimilarProductsRail(product);
}

/* ============================================================
   4. SELLER STOREFRONT PAGE — /seller/:id
   ============================================================ */
async function navigateToSellerStorefront(sellerId, sellerName, pushHistory = true) {
  if (pushHistory) history.pushState({ view: 'seller', id: sellerId }, '', `/seller/${sellerId}-${slugify(sellerName)}`);
  document.getElementById('browseMain').style.display = 'none';
  document.getElementById('productDetailPage').classList.remove('active');
  document.getElementById('sellerStorefrontPage').classList.add('active');
  window.scrollTo({ top: 0 });

  document.getElementById('storefrontBreadcrumbName').textContent = sellerName || 'Seller';
  document.getElementById('storefrontName').textContent = sellerName || 'Seller';
  document.getElementById('storefrontAvatar').src = 'https://placehold.co/120x120/f5f3ee/4a6fa5/png?text=%20';

  let sellerProducts = [];
  try {
    const res = await fetch(`/api/products/seller/${sellerId}`, { credentials: 'include' });
    if (res.ok) sellerProducts = await res.json();
  } catch (e) {
    sellerProducts = products.filter(p => p.user_id === sellerId);
  }
  if (!sellerProducts.length) sellerProducts = products.filter(p => p.user_id === sellerId);

  const totalSales = sellerProducts.reduce((sum, p) => sum + (p.sales_count || 0), 0);
  const avgRating = sellerProducts.length
    ? (sellerProducts.reduce((s, p) => s + (p.rating || 0), 0) / sellerProducts.length).toFixed(1)
    : '—';

  document.getElementById('storefrontTrustStrip').innerHTML = renderTrustStrip(sellerProducts[0] || {});
  document.getElementById('storefrontStats').innerHTML = `
    <div class="storefront-stat"><span class="num">${sellerProducts.length}</span><span class="lbl">Products</span></div>
    <div class="storefront-stat"><span class="num">${totalSales}</span><span class="lbl">Sales</span></div>
    <div class="storefront-stat"><span class="num">${avgRating}</span><span class="lbl">Avg rating</span></div>`;

  document.getElementById('storefrontMessageBtn').onclick = () => openAskSeller(sellerProducts[0]?.id, sellerId, sellerName);

  const grid = document.getElementById('storefrontGrid');
  grid.innerHTML = sellerProducts.map(p => {
    const img = (p._imageList && p._imageList[0]) || (p.images && p.images[0]) || 'https://placehold.co/400x250/f5f3ee/4a6fa5/png?text=Product';
    return `<div class="product-card" onclick="navigateToProduct(${p.id})">
      <div class="card-media"><img src="${img}" loading="lazy"></div>
      <div class="card-body">
        <h3>${escapeHtml(p.title)}</h3>
        <div class="price-row"><div class="price">${fmtPrice(p.price)}</div></div>
      </div>
    </div>`;
  }).join('') || `<p style="color:var(--text-muted)">This seller has no active listings right now.</p>`;
}

function closeSellerStorefront(e) {
  if (e) e.preventDefault();
  history.pushState({ view: 'browse' }, '', '/products.html');
  document.getElementById('sellerStorefrontPage').classList.remove('active');
  document.getElementById('browseMain').style.display = '';
}

window.addEventListener('popstate', (e) => {
  const state = e.state;
  document.getElementById('productDetailPage').classList.remove('active');
  document.getElementById('sellerStorefrontPage').classList.remove('active');
  document.getElementById('browseMain').style.display = '';
  if (!state || state.view === 'browse') return;
  if (state.view === 'product') navigateToProduct(state.id, false);
  if (state.view === 'seller') navigateToSellerStorefront(state.id, '', false);
});

/* ============================================================
   5. QUICK VIEW MODAL (preview without leaving the grid)
   ============================================================ */
function openQuickView(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  trackRecentlyViewed(id);
  const img = (product._imageList && product._imageList[0]) || 'https://placehold.co/500x500/f5f3ee/4a6fa5/png?text=Product';
  document.getElementById('quickViewBody').innerHTML = `
    <div class="qv-media"><img src="${img}" alt="${escapeHtml(product.title)}"></div>
    <div class="qv-info">
      <h2>${escapeHtml(product.title)}</h2>
      <div class="trust-strip">${renderTrustStrip(product)}</div>
      <p style="color:var(--charcoal-soft); font-size:14px; line-height:1.6;">${escapeHtml((product.description || '').slice(0, 220))}</p>
      <div class="price">${fmtPrice(product.price)}</div>
      <div class="qv-actions">
        <button class="btn primary" onclick="closeQuickView(); navigateToProduct(${product.id});">View full details</button>
        ${product.type !== 'affiliate' ? `<button class="btn secondary" onclick="addToCart(${product.id},1)"><i class="fas fa-cart-plus"></i> Add to cart</button>` : ''}
      </div>
    </div>`;
  openModal(document.getElementById('quickViewModal'));
}
function closeQuickView() { closeModal(document.getElementById('quickViewModal')); }

/* ============================================================
   6. ASK SELLER
   ============================================================ */
let askSellerProductId = null;
let askSellerTargetSellerId = null;

function openAskSeller(productId, sellerIdOverride, sellerNameOverride) {
  if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
  askSellerProductId = productId || null;
  const product = products.find(p => p.id === productId);
  askSellerTargetSellerId = sellerIdOverride || (product ? product.user_id : null);
  const ctx = document.getElementById('askSellerContext');
  if (product) {
    const img = (product._imageList && product._imageList[0]) || 'https://placehold.co/60x60';
    ctx.innerHTML = `<img src="${img}"><div><strong>${escapeHtml(product.title)}</strong><div style="font-size:12px;color:var(--text-muted)">${fmtPrice(product.price)}</div></div>`;
  } else {
    ctx.innerHTML = `<div><strong>${escapeHtml(sellerNameOverride || 'This seller')}</strong></div>`;
  }
  document.getElementById('askSellerMessage').value = '';
  document.getElementById('askSellerError').classList.remove('show');
  openModal(document.getElementById('askSellerModal'));
}
function closeAskSeller() { closeModal(document.getElementById('askSellerModal')); }

async function sendAskSellerQuestion() {
  const msg = document.getElementById('askSellerMessage').value.trim();
  const errEl = document.getElementById('askSellerError');
  if (!msg) { errEl.textContent = 'Write a question before sending.'; errEl.classList.add('show'); return; }
  const btn = document.getElementById('askSellerSendBtn');
  btn.disabled = true;
  try {
    // NOTE: point this at your real messaging endpoint (e.g. the one Services
    // uses to start a conversation). Left as /api/messages/start as a placeholder.
    const res = await fetch('/api/messages/start', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() },
      body: JSON.stringify({ to_user_id: askSellerTargetSellerId, product_id: askSellerProductId, message: msg })
    });
    if (!res.ok) throw new Error('Failed to send');
    showToast('Question sent', 'The seller will reply via your messages.', 'success');
    closeAskSeller();
  } catch (e) {
    showToast('Could not send', 'Please try again in a moment.', 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ============================================================
   7. RECENTLY VIEWED (localStorage, client-side only)
   ============================================================ */
function loadRecentlyViewed() {
  try { recentlyViewed = JSON.parse(localStorage.getItem('ci_recently_viewed') || '[]'); }
  catch (e) { recentlyViewed = []; }
}
function saveRecentlyViewed() { localStorage.setItem('ci_recently_viewed', JSON.stringify(recentlyViewed.slice(0, 20))); }

function trackRecentlyViewed(id) {
  recentlyViewed = recentlyViewed.filter(pid => pid !== id);
  recentlyViewed.unshift(id);
  saveRecentlyViewed();
  renderRecentlyViewedRail();
}

function renderRecentlyViewedRail() {
  const section = document.getElementById('recentlyViewedSection');
  const track = document.getElementById('recentlyViewedTrack');
  if (!section || !track) return;
  const items = recentlyViewed.map(id => products.find(p => p.id === id)).filter(Boolean).slice(0, 10);
  if (!items.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  track.innerHTML = items.map(p => {
    const img = (p._imageList && p._imageList[0]) || 'https://placehold.co/300x225/f5f3ee/4a6fa5/png?text=Product';
    return `<div class="rail-card" onclick="navigateToProduct(${p.id})">
      <img src="${img}" loading="lazy">
      <div class="rail-card-body"><h4>${escapeHtml(p.title)}</h4><div class="rail-price">${fmtPrice(p.price)}</div></div>
    </div>`;
  }).join('');
}

document.getElementById('clearRecentlyViewedBtn')?.addEventListener('click', () => {
  recentlyViewed = [];
  saveRecentlyViewed();
  renderRecentlyViewedRail();
});

/* ============================================================
   8. SIMILAR PRODUCTS (client-side, same category + nearby price)
   ============================================================ */
function renderSimilarProductsRail(product) {
  const track = document.getElementById('similarProductsTrack');
  if (!track) return;
  const priceLow = product.price * 0.5, priceHigh = product.price * 1.8;
  let similar = products.filter(p =>
    p.id !== product.id &&
    (p.category === product.category || (p.price >= priceLow && p.price <= priceHigh))
  );
  similar.sort((a, b) => (a.category === product.category ? 0 : 1) - (b.category === product.category ? 0 : 1));
  similar = similar.slice(0, 10);

  if (!similar.length) { track.innerHTML = `<p class="rail-empty">No similar products yet.</p>`; return; }
  track.innerHTML = similar.map(p => {
    const img = (p._imageList && p._imageList[0]) || 'https://placehold.co/300x225/f5f3ee/4a6fa5/png?text=Product';
    return `<div class="rail-card" onclick="navigateToProduct(${p.id})">
      <img src="${img}" loading="lazy">
      <div class="rail-card-body"><h4>${escapeHtml(p.title)}</h4><div class="rail-price">${fmtPrice(p.price)}</div></div>
    </div>`;
  }).join('');
}

/* ============================================================
   9. ADVANCED FILTERS UI WIRING
   ============================================================ */
function initAdvancedFilters() {
  const toggle = document.getElementById('advancedFiltersToggle');
  const panel = document.getElementById('advancedFilters');
  if (toggle && panel) toggle.addEventListener('click', () => panel.classList.toggle('show'));

  document.getElementById('filterPriceMin')?.addEventListener('input', debounce((e) => {
    advancedFilterState.priceMin = e.target.value ? Number(e.target.value) : null;
    updateAdvFilterCount(); renderProducts();
  }, 300));
  document.getElementById('filterPriceMax')?.addEventListener('input', debounce((e) => {
    advancedFilterState.priceMax = e.target.value ? Number(e.target.value) : null;
    updateAdvFilterCount(); renderProducts();
  }, 300));

  document.querySelectorAll('.rating-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.rating-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      advancedFilterState.minRating = Number(chip.dataset.rating) || 0;
      updateAdvFilterCount(); renderProducts();
    });
  });
  document.querySelectorAll('.condition-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.condition-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      advancedFilterState.condition = chip.dataset.condition || '';
      updateAdvFilterCount(); renderProducts();
    });
  });

  document.getElementById('clearAdvFiltersBtn')?.addEventListener('click', () => {
    advancedFilterState = { priceMin: null, priceMax: null, minRating: 0, condition: '' };
    document.getElementById('filterPriceMin').value = '';
    document.getElementById('filterPriceMax').value = '';
    document.querySelectorAll('.rating-chip, .condition-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.rating-chip[data-rating="0"]')?.classList.add('active');
    document.querySelector('.condition-chip[data-condition=""]')?.classList.add('active');
    updateAdvFilterCount(); renderProducts();
  });
}
function updateAdvFilterCount() {
  let count = 0;
  if (advancedFilterState.priceMin != null) count++;
  if (advancedFilterState.priceMax != null) count++;
  if (advancedFilterState.minRating > 0) count++;
  if (advancedFilterState.condition) count++;
  const badge = document.getElementById('advFilterCount');
  if (badge) { badge.textContent = count; badge.style.display = count ? 'inline-block' : 'none'; }
}

/* ============================================================
   10. CART
   ============================================================ */
function loadCart() {
  try { cart = JSON.parse(localStorage.getItem('ci_cart') || '[]'); }
  catch (e) { cart = []; }
}
function saveCart() { localStorage.setItem('ci_cart', JSON.stringify(cart)); updateCartCountPip(); }

function addToCart(productId, qty = 1) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  const existing = cart.find(i => i.id === productId);
  if (existing) existing.qty += qty;
  else cart.push({ id: productId, qty });
  saveCart();
  showToast('Added to cart', product.title, 'success');
  renderCart();
}
function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
  saveCart(); renderCart();
}
function updateCartItemQty(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart(); renderCart();
}
function updateCartCountPip() {
  const pip = document.getElementById('cartCountPip');
  const count = cart.reduce((s, i) => s + i.qty, 0);
  if (!pip) return;
  pip.textContent = count;
  pip.style.display = count ? 'flex' : 'none';
}

function openCart() {
  renderCart();
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartBackdrop').classList.add('open');
}
function closeCart() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartBackdrop').classList.remove('open');
}

function renderCart() {
  const list = document.getElementById('cartItemsList');
  const footer = document.getElementById('cartFooter');
  if (!list) return;
  if (!cart.length) {
    list.innerHTML = `<div class="cart-empty"><i class="fas fa-bag-shopping"></i><p>Your cart is empty</p></div>`;
    footer.style.display = 'none';
    return;
  }
  const items = cart.map(i => ({ ...i, product: products.find(p => p.id === i.id) })).filter(i => i.product);

  list.innerHTML = items.map(i => {
    const img = (i.product._imageList && i.product._imageList[0]) || 'https://placehold.co/80x80';
    return `<div class="cart-item">
      <img src="${img}">
      <div class="cart-item-body">
        <h4>${escapeHtml(i.product.title)}</h4>
        <div class="cart-item-seller">By ${escapeHtml(i.product.seller_name || 'Seller')}</div>
        <div class="cart-item-controls">
          <div class="qty-stepper">
            <button onclick="updateCartItemQty(${i.id},-1)">−</button>
            <span>${i.qty}</span>
            <button onclick="updateCartItemQty(${i.id},1)">+</button>
          </div>
          <div class="cart-item-price">${fmtPrice(i.product.price * i.qty)}</div>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart(${i.id})">Remove</button>
      </div>
    </div>`;
  }).join('');

  const sellerIds = new Set(items.map(i => i.product.user_id));
  const noteEl = document.getElementById('cartMultiSellerNote');
  if (sellerIds.size > 1) {
    noteEl.style.display = 'block';
    noteEl.innerHTML = `<i class="fas fa-info-circle"></i> Items are from ${sellerIds.size} different sellers, so checkout will process each seller's order separately.`;
  } else { noteEl.style.display = 'none'; }

  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  document.getElementById('cartSubtotal').textContent = fmtPrice(subtotal);
  document.getElementById('cartTotal').textContent = fmtPrice(subtotal);
  footer.style.display = 'block';
}

async function checkoutCart() {
  const items = cart.map(i => ({ ...i, product: products.find(p => p.id === i.id) })).filter(i => i.product);
  if (!items.length) return;
  if (!currentUser) { closeCart(); openModal(document.getElementById('loginModal')); return; }

  closeCart();
  showToast('Starting checkout', `Processing ${items.length} item${items.length > 1 ? 's' : ''}...`, 'info');

  // Physical items route through the existing address/order modal one at a time.
  // Digital/instant items go through the existing buyProduct() flow.
  for (const item of items) {
    if (item.product.type === 'physical') {
      orderPhysicalProduct(item.product.id);
      break; // address modal is a single-item flow; stop here so the user completes it
    } else {
      await buyProduct(item.product.id);
    }
  }
  cart = cart.filter(i => products.find(p => p.id === i.id)?.type === 'physical');
  saveCart(); renderCart();
}

/* ============================================================
   11. ORDER TRACKING SHORTCUT (header icon → recent orders panel)
   ============================================================ */
async function openOrderTracking() {
  const panel = document.getElementById('orderTrackingPanel');
  const list = document.getElementById('orderTrackingList');
  panel.classList.add('open');
  if (!currentUser) {
    list.innerHTML = `<div class="otp-empty">Log in to see your orders</div>`;
    return;
  }
  list.innerHTML = `<div class="otp-empty">Loading…</div>`;
  try {
    const res = await fetch('/api/my-orders', { credentials: 'include' });
    const orders = res.ok ? await res.json() : [];
    if (!orders.length) { list.innerHTML = `<div class="otp-empty">No recent orders yet</div>`; return; }
    list.innerHTML = orders.slice(0, 8).map(o => {
      const status = (o.status || 'pending').toLowerCase();
      return `<div class="otp-item">
        <div class="otp-title">${escapeHtml(o.product_title || o.title || 'Order #' + o.id)}</div>
        <span class="otp-status-pill ${status}">${escapeHtml(o.status || 'Pending')}</span>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="otp-empty">Couldn't load orders right now</div>`;
  }
}
function closeOrderTracking() { document.getElementById('orderTrackingPanel').classList.remove('open'); }

document.addEventListener('click', (e) => {
  const panel = document.getElementById('orderTrackingPanel');
  const btn = document.getElementById('orderTrackingBtn');
  if (panel && panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn) {
    closeOrderTracking();
  }
});

/* ============================================================
   12. SELLER ONBOARDING WIZARD — step navigation
   ============================================================ */
let wizardCurrentStep = 1;
const WIZARD_TOTAL_STEPS = 5;

function goToWizardStep(step) {
  wizardCurrentStep = Math.max(1, Math.min(WIZARD_TOTAL_STEPS, step));
  document.querySelectorAll('.wizard-step').forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === wizardCurrentStep);
    el.classList.toggle('done', s < wizardCurrentStep);
  });
  document.querySelectorAll('.wizard-panel').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.panel) === wizardCurrentStep);
  });
  document.getElementById('wizardBackBtn').style.visibility = wizardCurrentStep === 1 ? 'hidden' : 'visible';
  const nextBtn = document.getElementById('wizardNextBtn');
  nextBtn.style.display = wizardCurrentStep === WIZARD_TOTAL_STEPS ? 'none' : 'inline-flex';
  if (wizardCurrentStep === WIZARD_TOTAL_STEPS) populateWizardReview();
}

function wizardStepIsValid(step) {
  // Lightweight per-step checks; full validation still runs on submit via validateProductForm().
  if (step === 1) {
    return $('p_title')?.value.trim() && $('p_type')?.value && $('p_description')?.value.trim() && $('p_price')?.value;
  }
  return true;
}

function populateWizardReview() {
  const type = $('p_type')?.value;
  const title = $('p_title')?.value || '';
  const price = $('p_price')?.value || '0';
  document.getElementById('wizardReviewSummary').innerHTML = `
    <div class="wizard-review-block">
      <h5>Product</h5>
      <p style="margin:0;"><strong>${escapeHtml(title)}</strong> — $${escapeHtml(price)} <span class="draft-badge">${escapeHtml(type || 'unset')}</span></p>
    </div>
    <div class="wizard-review-block">
      <h5>What happens next</h5>
      <p style="margin:0; font-size:13px; color:var(--charcoal-soft);">Publishing makes this visible in the marketplace immediately. Saving as a draft keeps it private until you finish payout setup.</p>
    </div>`;
}

document.getElementById('wizardNextBtn')?.addEventListener('click', () => {
  if (!wizardStepIsValid(wizardCurrentStep)) {
    showToast('Almost there', 'Fill in the required fields before continuing.', 'error');
    return;
  }
  goToWizardStep(wizardCurrentStep + 1);
});
document.getElementById('wizardBackBtn')?.addEventListener('click', () => goToWizardStep(wizardCurrentStep - 1));

// Reset wizard to step 1 whenever the seller form is opened
const _origBecomeSellerHandler = document.getElementById('becomeSeller');
if (_origBecomeSellerHandler) {
  _origBecomeSellerHandler.addEventListener('click', () => setTimeout(() => goToWizardStep(1), 0));
}

/* ============================================================
   INIT — wire up everything once the base app has initialized
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadRecentlyViewed();
  loadCart();
  updateCartCountPip();
  initAdvancedFilters();
  goToWizardStep(1);

   ['searchInput', 'filterType', 'filterCategory', 'sortSelect', 'refreshBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const fresh = el.cloneNode(true);
    el.parentNode.replaceChild(fresh, el);
    if (id === 'refreshBtn') fresh.addEventListener('click', () => loadProducts());
    else if (id === 'searchInput') fresh.addEventListener('input', debounce(renderProducts, 250));
    else fresh.addEventListener('change', renderProducts);
  });
  
  document.getElementById('cartOpenBtn')?.addEventListener('click', openCart);
  document.getElementById('cartCheckoutBtn')?.addEventListener('click', checkoutCart);
  document.getElementById('askSellerSendBtn')?.addEventListener('click', sendAskSellerQuestion);
  document.getElementById('orderTrackingBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('orderTrackingPanel');
    panel.classList.contains('open') ? closeOrderTracking() : openOrderTracking();
  });

  // If the page loaded directly on a /product/:id or /seller/:id URL, open that view.
  const path = window.location.pathname;
  const productMatch = path.match(/^\/product\/(\d+)/);
  const sellerMatch = path.match(/^\/seller\/(\d+)/);
  if (productMatch || sellerMatch) {
    const waitForProducts = setInterval(() => {
      if (products && products.length) {
        clearInterval(waitForProducts);
        if (productMatch) navigateToProduct(Number(productMatch[1]), false);
        if (sellerMatch) navigateToSellerStorefront(Number(sellerMatch[1]), '', false);
      }
    }, 150);
  }

  // Re-render the recently-viewed rail once products have loaded
  const waitForProductsRail = setInterval(() => {
    if (products && products.length) {
      clearInterval(waitForProductsRail);
      renderRecentlyViewedRail();
    }
  }, 150);
});

/* ============================================================
   ↓↓↓ UNIFIED MESSAGING FRONTEND ADDITIONS ↓↓↓
   These override the earlier openAskSeller/closeAskSeller/
   sendAskSellerQuestion placeholders above (function
   redeclaration — last one wins) and wire the Ask Seller modal
   to the real unified /api/messages/start backend.
   ============================================================ */

/* ================================================================
   UNIFIED MESSAGING — PRODUCTS FRONTEND ADDITIONS
   ================================================================
   This REPLACES the three placeholder functions from the last
   round (openAskSeller, closeAskSeller, sendAskSellerQuestion —
   the ones that posted to a fake /api/messages/start) and adds
   the live-thread behavior on top: context card, read receipts,
   typing indicator, image/PDF attachment, and bell notifications
   pulling from the new unified /api/notifications endpoints.

   Products is the only page wiring this up right now — when you
   move to Services/Courses/Books, the same functions (just with a
   different item_type/item_id) plug into their "Contact" buttons.
   ================================================================ */

let activeConversationId = null;
let activeItemContext = null;
let messagePollTimer = null;
let typingPollTimer = null;
let typingSendThrottle = null;

const MESSAGE_ITEM_ICONS = { product: '📦', service: '🛠', course: '🎓', book: '📚', general: '💬', order_support: '🛒' };

/* ---------- open / close ---------- */
function openAskSeller(productId, sellerIdOverride, sellerNameOverride) {
  if (!currentUser) { openModal(document.getElementById('loginModal')); return; }

  const product = products.find(p => p.id === productId);
  activeItemContext = product
    ? { type: 'product', id: product.id, title: product.title, price: product.price, owner_id: product.user_id, icon: MESSAGE_ITEM_ICONS.product }
    : { type: 'general', owner_id: sellerIdOverride, title: sellerNameOverride, icon: MESSAGE_ITEM_ICONS.general };

  activeConversationId = null; // fresh ask — start() will find/create the real conversation
  renderAskSellerContextCard();
  renderMessageThread([]); // empty until we have a conversation
  document.getElementById('askSellerMessage').value = '';
  document.getElementById('askSellerError').classList.remove('show');
  document.getElementById('askSellerAttachmentInput').value = '';
  openModal(document.getElementById('askSellerModal'));
  document.getElementById('askSellerMessage').focus();
}

function closeAskSeller() {
  closeModal(document.getElementById('askSellerModal'));
  stopMessagePolling();
  stopTypingPolling();
}

function renderAskSellerContextCard() {
  const ctx = activeItemContext;
  const el = document.getElementById('askSellerContext');
  if (!ctx) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;width:100%;">
      <span style="font-size:20px;">${ctx.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--charcoal-soft);font-weight:600;">${ctx.type === 'product' ? 'Product' : 'Message'}</div>
        <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(ctx.title || 'Seller')}</strong>
        ${ctx.price != null ? `<div style="font-size:12px;color:var(--gold-deep);font-weight:600;">${fmtPrice(ctx.price)}</div>` : ''}
      </div>
      ${ctx.type === 'product' ? `<button class="small-btn" onclick="closeAskSeller(); navigateToProduct(${ctx.id});">View</button>` : ''}
    </div>`;
}

/* ---------- send first message / start conversation ---------- */
async function sendAskSellerQuestion() {
  const msg = document.getElementById('askSellerMessage').value.trim();
  const errEl = document.getElementById('askSellerError');
  errEl.classList.remove('show');
  if (!msg) { errEl.textContent = 'Write a question before sending.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('askSellerSendBtn');
  btn.disabled = true;
  try {
    if (!activeConversationId) {
      // First message — creates or reuses the conversation via the unified endpoint
      const res = await fetch('/api/messages/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() },
        body: JSON.stringify({
          item_type: activeItemContext?.type || 'general',
          item_id: activeItemContext?.id || null,
          to_user_id: activeItemContext?.owner_id || null,
          message: msg,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      activeConversationId = data.conversation_id;
      startMessagePolling();
      startTypingPolling();
    } else {
      // Thread already open — send a follow-up
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() },
        body: JSON.stringify({ conversation_id: activeConversationId, message: msg }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to send'); }
    }

    document.getElementById('askSellerMessage').value = '';
    await refreshMessageThread();
    showToast('Question sent', 'You\u2019ll see the reply here and in your notifications.', 'success');
  } catch (e) {
    errEl.textContent = e.message || 'Could not send. Try again.';
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- attachments (image or PDF) ---------- */
async function sendAskSellerAttachment(fileInputEl) {
  if (!activeConversationId || !fileInputEl.files.length) return;
  const file = fileInputEl.files[0];
  const formData = new FormData();
  formData.append('conversation_id', activeConversationId);
  formData.append('image', file); // field name matches your existing uploadChatImage middleware
  try {
    const res = await fetch('/api/messages/send-with-image', { method: 'POST', credentials: 'include', body: formData });
    if (!res.ok) throw new Error('Upload failed');
    fileInputEl.value = '';
    await refreshMessageThread();
  } catch (e) {
    showToast('Attachment failed', 'Could not send that file.', 'error');
  }
}

/* ---------- thread rendering + polling ---------- */
async function refreshMessageThread() {
  if (!activeConversationId) return;
  try {
    const res = await fetch(`/api/messages/${activeConversationId}/search?query=`, { credentials: 'include' });
    // Fallback: if a dedicated "get all messages" route exists under a different
    // path in your app, swap the URL above for that one — this reuses the
    // search endpoint with an empty query as a stand-in "get all" call.
    let messages = [];
    if (res.ok) {
      const data = await res.json();
      messages = Array.isArray(data) ? data : (data.messages || []);
    }
    renderMessageThread(messages);
    fetch(`/api/messages/${activeConversationId}/mark-seen`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCSRFToken() } }).catch(() => {});
  } catch (e) { /* non-fatal */ }
}

function renderMessageThread(messages) {
  let threadEl = document.getElementById('askSellerThread');
  if (!threadEl) {
    threadEl = document.createElement('div');
    threadEl.id = 'askSellerThread';
    threadEl.style.cssText = 'max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin:14px 0;padding:4px;';
    document.getElementById('askSellerContext').insertAdjacentElement('afterend', threadEl);
  }
  if (!messages.length) {
    threadEl.innerHTML = `<p style="color:var(--text-muted);font-size:12.5px;text-align:center;padding:12px 0;">No messages yet — say hello.</p>`;
    return;
  }
  threadEl.innerHTML = messages.map(m => {
    const mine = currentUser && parseInt(m.sender_id) === parseInt(currentUser.id);
    const receipt = mine ? (m.read_at ? '✓✓' : '✓') : '';
    const attachment = m.attachment_url
      ? (m.attachment_type === 'pdf'
          ? `<a href="${m.attachment_url}" target="_blank" style="display:block;font-size:12px;">📎 PDF attachment</a>`
          : `<img src="${m.attachment_url}" style="max-width:160px;border-radius:8px;margin-top:6px;display:block;">`)
      : '';
    return `<div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:80%;">
      <div style="background:${mine ? 'var(--gold-tint)' : 'var(--cream)'};border:1px solid var(--hairline);border-radius:10px;padding:8px 12px;font-size:13px;">
        ${escapeHtml(m.message || '')}
        ${attachment}
      </div>
      <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;text-align:${mine ? 'right' : 'left'};">
        ${typeof formatTime === 'function' ? formatTime(m.created_at) : ''} ${receipt}
      </div>
    </div>`;
  }).join('') + `<div id="typingIndicatorRow" style="font-size:12px;color:var(--text-muted);font-style:italic;display:none;"></div>`;
  threadEl.scrollTop = threadEl.scrollHeight;
}

function startMessagePolling() {
  stopMessagePolling();
  messagePollTimer = setInterval(refreshMessageThread, 4000);
}
function stopMessagePolling() {
  if (messagePollTimer) clearInterval(messagePollTimer);
  messagePollTimer = null;
}

/* ---------- typing indicator ---------- */
function notifyTyping() {
  if (!activeConversationId) return;
  if (typingSendThrottle) return;
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
      const row = document.getElementById('typingIndicatorRow');
      if (!row) return;
      if (data.is_typing) { row.textContent = `${data.username || 'Seller'} is typing…`; row.style.display = 'block'; }
      else { row.style.display = 'none'; }
    } catch (e) { /* non-fatal */ }
  }, 2500);
}
function stopTypingPolling() {
  if (typingPollTimer) clearInterval(typingPollTimer);
  typingPollTimer = null;
}

/* ---------- notification bell (unified) ---------- */
async function refreshUnifiedNotificationBadge() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
    const data = await res.json();
    const pip = document.getElementById('notificationCount');
    if (!pip) return;
    if (data.count > 0) { pip.textContent = data.count; pip.style.display = 'flex'; }
    else { pip.style.display = 'none'; }
  } catch (e) { /* non-fatal */ }
}

async function openUnifiedNotificationsDropdown() {
  try {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    const notifications = res.ok ? await res.json() : [];
    // Minimal inline list — swap for a styled dropdown/panel when you build
    // the full Messages inbox page; for now this opens the relevant thread.
    if (!notifications.length) { showToast('No notifications', 'You\u2019re all caught up.', 'info'); return; }
    const latest = notifications[0];
    if (latest.conversation_id) {
      activeConversationId = latest.conversation_id;
      openModal(document.getElementById('askSellerModal'));
      document.getElementById('askSellerContext').innerHTML = `<strong>${escapeHtml(latest.title)}</strong>`;
      startMessagePolling();
      startTypingPolling();
      refreshMessageThread();
    }
    fetch('/api/notifications/mark-all-read', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCSRFToken() } })
      .then(refreshUnifiedNotificationBadge)
      .catch(() => {});
  } catch (e) { /* non-fatal */ }
}

/* ---------- wire it up ---------- */
document.addEventListener('DOMContentLoaded', () => {
  refreshUnifiedNotificationBadge();
  setInterval(refreshUnifiedNotificationBadge, 20000);

  const notifBtn = document.getElementById('notificationBtn');
  if (notifBtn) notifBtn.addEventListener('click', openUnifiedNotificationsDropdown);

  document.getElementById('askSellerMessage')?.addEventListener('input', notifyTyping);

  // Attachment button injected next to the send button, reusing existing modal markup
  const sendBtn = document.getElementById('askSellerSendBtn');
  if (sendBtn && !document.getElementById('askSellerAttachmentInput')) {
    const attachInput = document.createElement('input');
    attachInput.type = 'file';
    attachInput.id = 'askSellerAttachmentInput';
    attachInput.accept = 'image/*,application/pdf';
    attachInput.style.display = 'none';
    attachInput.addEventListener('change', () => sendAskSellerAttachment(attachInput));

    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'form-btn secondary';
    attachBtn.innerHTML = '<i class="fas fa-paperclip"></i>';
    attachBtn.title = 'Attach image or PDF';
    attachBtn.addEventListener('click', () => attachInput.click());

    sendBtn.insertAdjacentElement('beforebegin', attachBtn);
    sendBtn.insertAdjacentElement('afterend', attachInput);
  }
});