
    // ---------- Utilities ----------
    const $ = (id)=>document.getElementById(id);
    let currentUser = null;
    let products = [];
    let categoriesSet = new Set();
    let currentCurrency = localStorage.getItem('ci_currency') || 'USD';
    let userFavorites = new Set();
    let sellerMode = false;
    let currentProductId = null; // For reviews

    function getCSRFToken() {
      const el = document.querySelector('meta[name="csrf-token"]');
      return el ? el.getAttribute('content') : '';
    }

    function handleApiError(err, ctx) {
      console.error(ctx, err);
      if (err && err.status === 401) {
        openModal($('loginModal'));
      }
      return (err && err.message) || `Failed to ${ctx}`;
    }

    function fmtPrice(amount){
      try {
        return new Intl.NumberFormat('en-US',{style:'currency',currency:currentCurrency}).format(Number(amount||0));
      } catch(e){
        return `${currentCurrency} ${Number(amount||0).toFixed(2)}`;
      }
    }

    function showSkeletonLoader(count = 6) {
      const grid = $('productsGrid');
      grid.innerHTML = Array(count).fill(`
        <div class="product-card skeleton">
          <div class="card-media skeleton"></div>
          <div class="card-body">
            <div class="skeleton-text"></div>
            <div class="skeleton-text short"></div>
            <div class="price-row">
              <div class="skeleton-text price"></div>
            </div>
          </div>
        </div>
      `).join('');
    }

    // ---------- Header & modals ----------
    const loginModal = $('loginModal');
    const signupModal = $('signupModal');

    function openModal(mod){ mod.classList.add('open'); mod.setAttribute('aria-hidden','false'); }
    function closeModal(mod){ mod.classList.remove('open'); mod.setAttribute('aria-hidden','true'); }

    // hook header buttons (initial)
    $('loginOpen').addEventListener('click', ()=> openModal(loginModal));
    $('signupOpen').addEventListener('click', ()=> openModal(signupModal));
    $('closeLogin').addEventListener('click', ()=> closeModal(loginModal));
    $('closeSignup').addEventListener('click', ()=> closeModal(signupModal));
    window.addEventListener('click', (e)=>{ if (e.target === loginModal) closeModal(loginModal); if (e.target === signupModal) closeModal(signupModal); });

    // Toggle login by username/email
    $('loginByUsername').addEventListener('click', ()=> {
      $('loginByUsername').style.color='var(--accent-gold)'; $('loginByEmail').style.color='var(--text-gray)';
      $('usernameGroup').style.display='block'; $('emailGroup').style.display='none';
    });
    $('loginByEmail').addEventListener('click', ()=> {
      $('loginByEmail').style.color='var(--accent-gold)'; $('loginByUsername').style.color='var(--text-gray)';
      $('usernameGroup').style.display='none'; $('emailGroup').style.display='block';
    });

    $('toggleLoginPwd').addEventListener('click', ()=> { const f=$('loginPassword'); f.type = f.type === 'password' ? 'text' : 'password'; });
    $('toggleSignupPwd').addEventListener('click', ()=> { const f=$('signupPassword'); f.type = f.type === 'password' ? 'text' : 'password'; });

    $('openSignupFromLogin').addEventListener('click', ()=>{ closeModal(loginModal); openModal(signupModal); });
    $('openLoginFromSignup').addEventListener('click', ()=>{ closeModal(signupModal); openModal(loginModal); });

    // ---------- Authentication ----------
    async function loadUser(){
      try {
        const r = await fetch('/api/me');
        if (!r.ok) { currentUser = null; updateHeader(); updateReviewFormVisibility(); return; }
        const u = await r.json();
        currentUser = u || null;
        updateHeader();
        updateReviewFormVisibility();
      } catch(err){
        console.error('loadUser', err);
        currentUser = null;
        updateHeader();
        updateReviewFormVisibility();
      }
    }

    // ✅ PUT loadUserFavorites RIGHT HERE - after loadUser, before updateHeader
    async function loadUserFavorites() {
      try {
        const r = await fetch('/api/favorites');
        
        // Check if response is HTML instead of JSON
        const contentType = r.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          console.error('❌ Server returned HTML instead of JSON. GET /api/favorites endpoint might not exist.');
          userFavorites = new Set();
          return;
        }
        
        if (!r.ok) {
          console.log("❌ Could not load favorites - user might not be logged in or endpoint not found");
          userFavorites = new Set();
          return;
        }
        
        const data = await r.json();
        userFavorites = new Set(data.favorites || []);
        console.log(`⭐ Loaded ${userFavorites.size} favorites from server`);
      } catch(err) {
        console.error('loadUserFavorites error:', err);
        userFavorites = new Set();
      }
    }

    function updateHeader(){
      const hb = $('headerAuthButtons');
      if (currentUser && currentUser.id){
        hb.innerHTML = `
          <span class="welcome-pill">Welcome, ${escapeHtml(currentUser.username || currentUser.email || 'User')}</span>
          <button id="logoutBtn" class="auth-btn">Logout</button>
        `;
        $('logoutBtn').addEventListener('click', async ()=>{ 
          await fetch('/api/logout',{method:'POST'}); 
          currentUser=null; 
          userFavorites=new Set(); 
          updateHeader(); 
          updateReviewFormVisibility();
          loadProducts(); 
        });
      } else {
        hb.innerHTML = `
          <button id="loginOpen" class="auth-btn">Login</button>
          <button id="signupOpen" class="auth-btn signup">Sign Up</button>
        `;
        // rebind newly created nodes
        $('loginOpen').addEventListener('click', ()=> openModal(loginModal));
        $('signupOpen').addEventListener('click', ()=> openModal(signupModal));
      }
      // show/hide seller view depending on sellerMode and login
      $('sellerView').style.display = (sellerMode && currentUser) ? 'block' : 'none';
      $('sellerView').setAttribute('aria-hidden', !(sellerMode && currentUser));
      $('browseModeText').innerHTML = sellerMode ? 'Seller' : 'Buyer';
    }

    // ================= REVIEWS FUNCTIONS =================
    async function loadProductReviews(productId) {
      currentProductId = productId;

      try {
        const res = await fetch(`/api/reviews/${productId}`);
        const data = await res.json();

        const list = document.getElementById("reviewsList");
        const avg = document.getElementById("averageRating");

        if (!data.reviews || data.reviews.length === 0) {
          list.innerHTML = "<p>No reviews yet.</p>";
          avg.textContent = "";
          return;
        }

        // Calculate average
        const avgRating =
          data.reviews.reduce((sum, r) => sum + r.rating, 0) /
          data.reviews.length;

        avg.textContent = `⭐ ${avgRating.toFixed(1)} / 5 (${data.count} reviews)`;

        list.innerHTML = data.reviews
          .map(
            r => `
            <div class="review-item">
              <strong>${escapeHtml(r.username)} — ⭐ ${r.rating}</strong>
              <p>${escapeHtml(r.comment)}</p>
              <small>${new Date(r.created_at).toLocaleDateString()}</small>
            </div>
          `
          )
          .join("");

      } catch (err) {
        console.error("Error loading reviews:", err);
        const list = document.getElementById("reviewsList");
        list.innerHTML = "<p>Error loading reviews. Please try again.</p>";
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
        msg.textContent = "Rating and comment required.";
        msg.style.color = "red";
        return;
      }

      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json", 'X-CSRF-Token': getCSRFToken() },
          body: JSON.stringify({
            productId: currentProductId,
            rating,
            comment
          })
        });

        const data = await res.json();

        if (!res.ok) {
          msg.textContent = data.error || "Failed to submit review.";
          msg.style.color = "red";
          return;
        }

        msg.textContent = "Review submitted successfully!";
        msg.style.color = "green";

        document.getElementById("reviewComment").value = "";
        document.getElementById("reviewRating").value = "";

        // Reload reviews
        loadProductReviews(currentProductId);

      } catch (err) {
        console.error("Review submit error:", err);
        msg.textContent = "Network error. Please try again.";
        msg.style.color = "red";
      }
    }

    // login form
    $('loginForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      $('loginMsg').textContent = "";
      const useUsername = $('usernameGroup').style.display !== 'none';
      const payload = { password: $('loginPassword').value };
      if (useUsername) payload.username = $('loginUsername').value;
      else payload.email = $('loginEmail').value;

      try {
        const res = await fetch('/api/login', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'X-CSRF-Token': getCSRFToken() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          $('loginMsg').innerHTML = `<div class="note" style="color:salmon">${escapeHtml(data.error || 'Login failed')}</div>`;
          return;
        }
        $('loginMsg').innerHTML = `<div class="note" style="color:lightgreen">✅ ${escapeHtml(data.message || 'Logged in')}</div>`;
        await loadUser();
        await loadUserFavorites(); // ← ADD THIS LINE
        closeModal(loginModal);
        // keep user on products page (no redirect)
        // if seller mode active, show upload view
        if (sellerMode) $('sellerView').style.display = 'block';
      } catch(err){
        console.error('login err',err);
        const message = handleApiError(err, 'Login');
        $('loginMsg').innerHTML = `<div class="note" style="color:salmon">${escapeHtml(message)}</div>`;
      }
    });

    // signup form (auto login if possible)
    $('signupForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      $('signupMsg').textContent = "";
      const username = $('signupUsername').value.trim();
      const email = $('signupEmail').value.trim();
      const password = $('signupPassword').value;

      if (!username || !email || !password) { $('signupMsg').innerHTML = `<div class="note" style="color:salmon">All fields required.</div>`; return; }

      try {
        const res = await fetch('/api/signup', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'X-CSRF-Token': getCSRFToken() },
          body: JSON.stringify({username, email, password})
        });
        const data = await res.json();
        if (!res.ok) {
          $('signupMsg').innerHTML = `<div class="note" style="color:salmon">${escapeHtml(data.error || 'Signup failed')}</div>`;
          return;
        }

        $('signupMsg').innerHTML = `<div class="note" style="color:lightgreen">${escapeHtml(data.message || 'Signup success')}<br/>Attempting to login...</div>`;

        // try auto-login
        const loginRes = await fetch('/api/login', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'X-CSRF-Token': getCSRFToken() },
          body: JSON.stringify({ username, password })
        });

        if (loginRes.ok) {
          await loadUser();
           await loadUserFavorites(); // ← ADD THIS LINE
          $('signupMsg').innerHTML = `<div class="note" style="color:lightgreen">Signed up and logged in ✅</div>`;
          closeModal(signupModal);
        } else {
          // backend may require email verification — just show message and remain on page
          const d = await loginRes.json().catch(()=>({}));
          $('signupMsg').innerHTML = `<div class="note" style="color:lightgreen">${escapeHtml(data.message || 'Signup success')}. ${escapeHtml(d.error || '')}</div>`;
        }
      } catch(err){
        console.error('signup err',err);
        const message = handleApiError(err, 'Signup');
        $('signupMsg').innerHTML = `<div class="note" style="color:salmon">${escapeHtml(message)}</div>`;
      }
    });

    function escapeHtml(s){ if (!s) return ''; return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

    // ---------- Seller toggle ----------
    const becomeBtn = $('becomeSeller');
    becomeBtn.addEventListener('click', async ()=>{
      if (!currentUser){
        openModal(loginModal);
        return;
      }
      sellerMode = !sellerMode;
      becomeBtn.textContent = sellerMode ? 'Back to Buyer View' : 'Become a Seller';
      document.querySelector('.hero .note').innerHTML = sellerMode ? 'You are browsing as <strong>Seller</strong>' : 'You are browsing as <strong>Buyer</strong>';
      $('sellerView').style.display = sellerMode ? 'block' : 'none';
      $('sellerView').setAttribute('aria-hidden', !sellerMode);
      if (!sellerMode) window.scrollTo({top:200,behavior:'smooth'});
    });

    $('cancelSeller').addEventListener('click', ()=>{ sellerMode=false; becomeBtn.textContent='Become a Seller'; $('sellerView').style.display='none'; $('sellerView').setAttribute('aria-hidden','true'); });

    // ---------- Product type UI logic ----------
    $('p_type').addEventListener('change', (ev)=>{
      const v = ev.target.value;
      $('digitalBlock').style.display = (v === 'digital' || v === 'affiliate') ? 'block' : 'none';
      $('physicalBlock').style.display = v === 'physical' ? 'block' : 'none';
      if (v === 'affiliate') { $('useAffiliate').checked=true; $('affiliateFields').style.display='block'; $('digitalUpload').style.display='none'; }
      else { $('affiliateFields').style.display='none'; $('digitalUpload').style.display='block'; $('useAffiliate').checked=false; }
    });

    $('useAffiliate').addEventListener('change',(e)=> {
      $('affiliateFields').style.display = e.target.checked ? 'block':'none';
      $('digitalUpload').style.display = e.target.checked ? 'none':'block';
    });

    $('p_deliveryType').addEventListener('change', (e)=>{ $('deliveryExtra').style.display = e.target.value === 'delivery' ? 'block' : 'none'; });

    // ---------- Fetch & render products ----------
    async function loadProducts(){
      try {
        showSkeletonLoader();
        const r = await fetch('/api/products');
        if (!r.ok) { products = []; renderProducts(); return; }
        products = await r.json() || [];
        products = products.map(p => {
          p.price = Number(p.price || 0);
          if (p.images && typeof p.images === 'string') {
            try { p.images = JSON.parse(p.images); } catch(e) {}
          }
          p._imageList = Array.isArray(p.images) && p.images.length ? p.images :
                         (p.file_path ? [p.file_path] : (p.image ? [p.image] : []));
          p._imageList = p._imageList.map(src=>{
            if (!src) return null;
            if (src.startsWith('/')) return src;
            if (src.startsWith('http')) return src;
            return '/'+src;
          }).filter(Boolean);
          p.rating = Number(p.rating||0);
          p.seller_name = p.seller_name || p.username || p.seller || 'Seller';
          p.type = p.type || p.product_type || (p._imageList.length && p.price>0 ? 'digital' : 'physical');
          if (p.category) categoriesSet.add(p.category);
          p.favorite_count = Number(p.favorite_count || p.favorites || 0);
          p.review_count = Number(p.review_count || p.reviews || 0);
          return p;
        });
        populateCategoryFilter();
        renderProducts();
      } catch(err){
        console.error('loadProducts',err);
        products = [];
        renderProducts();
      }
    }

    function populateCategoryFilter(){
      const sel = $('filterCategory');
      const existing = new Set(Array.from(sel.options).map(o=>o.value));
      categoriesSet.forEach(cat=>{
        if (!existing.has(cat)) {
          const opt = document.createElement('option'); opt.value=cat; opt.textContent=cat; sel.appendChild(opt);
        }
      });
    }

    function renderProducts(){
      const grid = $('productsGrid');
      const q = $('searchInput').value.trim().toLowerCase();
      const typeFilter = $('filterType').value;
      const catFilter = $('filterCategory').value;
      const sort = $('sortSelect').value;

      let list = products.slice();

      if (q) list = list.filter(p => (p.title||'').toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q));
      if (typeFilter) list = list.filter(p => (p.type||'').toLowerCase() === typeFilter);
      if (catFilter) list = list.filter(p => (p.category||'') === catFilter);

      if (sort === 'affordable') list.sort((a,b)=>a.price - b.price);
      else if (sort === 'rated') list.sort((a,b)=>b.rating - a.rating);
      else if (sort === 'favorites') list.sort((a,b)=>b.favorite_count - a.favorite_count);
      else list.sort((a,b)=> new Date(b.created_at || 0) - new Date(a.created_at || 0));

      if (!list.length) { $('noProducts').style.display='block'; grid.innerHTML=''; return; }
      $('noProducts').style.display='none';

      grid.innerHTML = list.map(p => {
        const img = p._imageList && p._imageList.length ? p._imageList[0] : 'https://via.placeholder.com/400x250?text=No+image';
        const thumbHtml = (p._imageList||[]).slice(0,3).map((t, idx)=>`<img src="${escapeHtml(t)}" alt="thumb${idx}" onclick="switchMainImage(${p.id}, ${idx})">`).join('');
        const seller = escapeHtml(p.seller_name || 'Seller');
        const title = escapeHtml(p.title || p.productName || p.name || 'Untitled');
        const desc = escapeHtml((p.description||'').slice(0,120));
        const price = fmtPrice(p.price);
        const isAffiliate = (p.type === 'affiliate' || p.type === 'affiliate_link' || p.affiliate_link);
        const isFavorite = userFavorites.has(p.id);
        const showDelete = currentUser && (currentUser.role === 'admin' || currentUser.id === p.user_id);
        const reviewSummary = getReviewSummary(p.rating, p.review_count);

        return `
          <div class="product-card" data-id="${p.id}" onclick="selectProductForReviews(${p.id})">
            <div class="card-media">
              <img id="mainimg-${p.id}" src="${escapeHtml(img)}" alt="${title}" loading="lazy">
              <div class="thumbs">${thumbHtml}</div>
              <button class="favorite-btn ${isFavorite ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite(${p.id})">
                <i class="fas fa-heart"></i>
              </button>
            </div>
            <div class="card-body">
              <h3>${title}</h3>
              <div class="meta">By ${seller} · ${escapeHtml(p.category || '')}</div>
              <div class="meta" style="margin-bottom:6px">${reviewSummary} · ${p.favorite_count} favorites</div>
              <div class="price-row">
                <div class="price">${price}</div>
                <div class="card-actions">
                  ${ isAffiliate ? `<button class="small-btn" onclick="event.stopPropagation(); openAffiliate('${escapeHtml(p.affiliate_link||p.external_link||'')}')">Visit</button>` :
                     `<button class="small-btn primary" onclick="event.stopPropagation(); buyProduct(${p.id})"><i class="fas fa-shopping-cart"></i> Buy</button>`}
                  ${ showDelete ? `<button class="small-btn" style="background:#ff4d4f;color:white" onclick="event.stopPropagation(); deleteProduct(${p.id})">Delete</button>` : '' }
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      startProductCarousels();
    }

    // Function to select product for reviews
    function selectProductForReviews(productId) {
      currentProductId = productId;
      loadProductReviews(productId);
      // Scroll to reviews section
      document.getElementById('productReviewsSection').scrollIntoView({ behavior: 'smooth' });
    }

    function getReviewSummary(rating, reviewCount) {
      if (!reviewCount) return 'No reviews yet';
      const stars = '⭐'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '');
      return `${stars} (${reviewCount})`;
    }

    window.switchMainImage = function(productId, thumbIndex){
      const prod = products.find(p=>p.id == productId);
      if (!prod || !prod._imageList || !prod._imageList[thumbIndex]) return;
      const main = $('mainimg-'+productId);
      if (main) main.src = prod._imageList[thumbIndex];
    };

    window.openAffiliate = function(url){
      if (!url) { alert('No affiliate url provided'); return; }
      window.open(url,'_blank');
    };

    // --- product image carousel manager ---
    const productImageIntervals = new Map(); // productId -> intervalId

    function startProductCarousels() {
      // Keep track of product cards currently displayed
      const currentIds = new Set();

      document.querySelectorAll('.product-card').forEach(card => {
        const id = card.getAttribute('data-id');
        if (!id) return;
        currentIds.add(String(id));

        // find product in the global products array
        const prod = products.find(p => String(p.id) === String(id));
        if (!prod || !Array.isArray(prod._imageList) || prod._imageList.length === 0) return;

        const mainImg = document.getElementById(`mainimg-${id}`);
        // ensure first image shows right away
        if (mainImg) mainImg.src = prod._imageList[0];

        // if only one image, no need to set an interval
        if (prod._imageList.length <= 1) {
          // clear any old interval if present
          if (productImageIntervals.has(id)) {
            clearInterval(productImageIntervals.get(id));
            productImageIntervals.delete(id);
          }
          return;
        }

        // if an interval already exists for this product, skip
        if (productImageIntervals.has(id)) return;

        // create interval to rotate images
        let idx = 0;
        const iv = setInterval(() => {
          idx = (idx + 1) % prod._imageList.length;
          const imgEl = document.getElementById(`mainimg-${id}`);
          if (imgEl) imgEl.src = prod._imageList[idx];
        }, 2500); // change delay as you prefer (ms)

        productImageIntervals.set(id, iv);

        // Optional: pause on hover and resume on leave
        card.querySelector('.card-media')?.addEventListener('mouseenter', () => {
          const ivId = productImageIntervals.get(id);
          if (ivId) { clearInterval(ivId); productImageIntervals.delete(id); }
        });
        card.querySelector('.card-media')?.addEventListener('mouseleave', () => {
          // prevent creating duplicate intervals
          if (productImageIntervals.has(id)) return;
          let idx2 = prod._imageList.indexOf((document.getElementById(`mainimg-${id}`)?.src) || '') ;
          if (idx2 < 0) idx2 = 0;
          const iv2 = setInterval(() => {
            idx2 = (idx2 + 1) % prod._imageList.length;
            const el = document.getElementById(`mainimg-${id}`);
            if (el) el.src = prod._imageList[idx2];
          }, 2500);
          productImageIntervals.set(id, iv2);
        });
      });

      // Clear intervals for product cards that were removed from DOM
      for (const [pid, iv] of productImageIntervals.entries()) {
        if (!currentIds.has(String(pid))) {
          clearInterval(iv);
          productImageIntervals.delete(pid);
        }
      }
    }

   // ---------- Favorites ----------
    async function toggleFavorite(productId) {
      if (!currentUser) { 
        openModal(loginModal); 
        return; 
      }
      
      try {
        const favoriteBtn = document.querySelector(`.favorite-btn[onclick*="toggleFavorite(${productId})"]`);
        const heartIcon = favoriteBtn?.querySelector('i');
        
        // Show immediate visual feedback
        if (heartIcon) {
          heartIcon.style.transform = 'scale(1.3)';
          setTimeout(() => { heartIcon.style.transform = 'scale(1)'; }, 200);
        }

        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken() },
          body: JSON.stringify({ productId })
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Update local favorites set
          if (data.action === 'added') {
            userFavorites.add(productId);
            if (heartIcon) heartIcon.classList.add('active');
          } else {
            userFavorites.delete(productId);
            if (heartIcon) heartIcon.classList.remove('active');
          }
          
          // Update the product favorite count
          const product = products.find(p => p.id === productId);
          if (product) {
            product.favorite_count = data.action === 'added' 
              ? (product.favorite_count || 0) + 1 
              : Math.max(0, (product.favorite_count || 1) - 1);
          }
          
          // Re-render to update counts and heart icons
          renderProducts();
          
          console.log(`⭐ Favorite ${data.action}: Product ${productId}`);
        } else {
          const error = await response.json();
          alert(error.error || 'Failed to update favorites');
        }
      } catch(error) {
        console.error('Favorite toggle failed:', error);
        const message = handleApiError(error, 'Update favorites');
        alert(message);
      }
    }
    window.toggleFavorite = toggleFavorite;

    // ---------- Buy ----------
    async function buyProduct(productId){
      try {
        const meR = await fetch('/api/me'); const me = await meR.json();
        if (!me || !me.id) { openModal(loginModal); return; }
        const res = await fetch('/api/buy-product', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'X-CSRF-Token': getCSRFToken() },
          body: JSON.stringify({ productId })
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Error initiating purchase'); return; }
        const link = data.link || data.paymentLink || data.payment_link;
        if (link) window.location.href = link;
        else alert('Payment link not returned by server.');
      } catch(err){
        console.error('buyProduct',err);
        const message = handleApiError(err, 'Purchase');
        alert(message);
      }
    }
    window.buyProduct = buyProduct;

    // ---------- Delete (admin or owner) ----------
    async function deleteProduct(id){
      if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;
      try {
        const res = await fetch(`/api/products/${id}`, { method:'DELETE', headers:{ 'X-CSRF-Token': getCSRFToken() } });
        if (res.ok) { await loadProducts(); }
        else {
          const d = await res.json();
          alert(d.error || 'Failed to delete');
        }
      } catch(err){
        console.error('deleteProduct',err);
        const message = handleApiError(err, 'Delete product');
        alert(message);
      }
    }
    window.deleteProduct = deleteProduct;

    function validateProductForm() {
      console.log("🔍 Starting form validation...");
      const errors = [];
      const title = $('p_title').value.trim();
      const price = parseFloat($('p_price').value || 0);
      const type = $('p_type').value;
      const paymentProvider = $('p_paymentProvider').value;

      document.querySelectorAll('.error-message').forEach(el => { 
        el.style.display = 'none'; 
        el.textContent = ''; 
      });
      
      console.log("📝 Form values:", { title, price, type, paymentProvider });
      
      // Basic product validation
      if (!title) errors.push({field: 'p_title', message: 'Product title is required'});
      if (price < 0) errors.push({field: 'p_price', message: 'Price cannot be negative'});
      if (!type) errors.push({field: 'p_type', message: 'Product type is required'});
      if (type === 'affiliate' && !$('p_affiliate').value.trim()) 
          errors.push({field: 'p_affiliate', message: 'Affiliate URL is required for affiliate products'});

      // Payment provider validation only
      if (!paymentProvider) errors.push({field: 'p_paymentProvider', message: 'Payment provider is required'});

      // Display errors
      errors.forEach(error => {
        const errorEl = $(error.field + '_error');
        if (errorEl) { 
          errorEl.style.display = 'block'; 
          errorEl.textContent = error.message; 
        }
      });

      console.log("❌ Validation errors:", errors.length);
      return errors.length === 0;
    }

    // ---------- Search / sort / filters ----------
    $('searchInput').addEventListener('input', debounce(renderProducts, 250));
    $('filterType').addEventListener('change', renderProducts);
    $('filterCategory').addEventListener('change', renderProducts);
    $('sortSelect').addEventListener('change', renderProducts);
    $('refreshBtn').addEventListener('click', ()=> loadProducts());

    function debounce(fn, ms=300){
      let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
    }

    // ---------- Currency selector ----------
    const currencySelect = $('currencyHeader');
    currencySelect.value = currentCurrency;
    currencySelect.addEventListener('change', (e)=>{
      currentCurrency = e.target.value;
      localStorage.setItem('ci_currency', currentCurrency);
      renderProducts();
    });

    // Category management
    let availableCategories = new Set();

    // Load existing categories from products
    function loadCategoriesFromProducts() {
      availableCategories.clear();
      products.forEach(product => {
        if (product.category && product.category.trim()) {
          availableCategories.add(product.category.trim().toLowerCase());
        }
      });
      updateCategoryDropdown();
    }

    // ========== UPLOAD PRODUCT FUNCTION ==========
    $('uploadProductBtn').addEventListener('click', async (e) => {
      e.preventDefault();
      console.log("🟢 Upload button CLICKED!");

      // Check if user is logged in
      if (!currentUser){ 
        console.log("❌ No user - opening login modal");
        openModal(loginModal); 
        return; 
      }
      console.log("✅ User is logged in:", currentUser.id);

      // Get form values
      const title = $('p_title').value.trim();
      const description = $('p_description').value.trim();
      const category = getSelectedCategory();
      const price = $('p_price').value || 0;
      const type = $('p_type').value;
      const paymentProvider = $('p_paymentProvider').value;
      
      console.log("📦 Form values:", { title, description, category, price, type, paymentProvider });

      // Basic validation
      if (!title || !price || !type || !paymentProvider) {
        alert('Please fill in all required fields: Title, Price, Type, and Payment Provider');
        return;
      }

      const fd = new FormData();
      fd.append('title', title);
      fd.append('description', description);
      fd.append('category', category);
      fd.append('price', price);
      fd.append('type', type);
      fd.append('paymentProvider', paymentProvider);

      // Digital / affiliate
      if (type === 'affiliate' || $('useAffiliate').checked) {
        const aff = $('p_affiliate').value.trim();
        console.log("🔗 Affiliate link:", aff);
        fd.append('affiliate_link', aff);
      } else if (type === 'digital') {
        const file = $('p_file').files[0];
        console.log("💾 Digital file:", file);
        if (file) fd.append('file', file);
      }

      // Physical products
      if (type === 'physical') {
        const deliveryType = $('p_deliveryType').value;
        fd.append('delivery_type', deliveryType);
        console.log("📦 Physical product delivery:", deliveryType);
        if (deliveryType === 'delivery') {
          fd.append('delivery_locations', $('p_deliveryLocations').value.trim());
          fd.append('delivery_fee', $('p_deliveryFee').value || 0);
          fd.append('payment_option', $('p_paymentOption').value || '');
        }
      }

      // Multiple images
      const images = $('p_images').files;
      console.log("🖼️ Images:", images.length);
      if (images && images.length) {
        for (let i = 0; i < images.length; i++) {
          fd.append('images[]', images[i]);
        }
      }

      // Debug FormData
      console.log("📤 FormData contents:");
      for (let pair of fd.entries()) {
        console.log(`${pair[0]}:`, pair[1]);
      }

      $('uploadMessage').innerHTML = '<div class="note" style="color:var(--text-gray)">Uploading product...</div>';

      try {
        console.log("🚀 Sending request to /api/upload-product...");
        const res = await fetch('/api/upload-product', { 
          method: 'POST', 
          body: fd 
        });
        
        console.log("📨 Response status:", res.status);
        const data = await res.json();
        console.log("📨 Response data:", data);

        if (!res.ok) { 
          console.log("❌ Upload failed:", data.error);
          $('uploadMessage').innerHTML = `<div class="note" style="color:salmon">${escapeHtml(data.error || 'Upload failed')}</div>`; 
          return; 
        }

        console.log("✅ Upload successful!");
        $('uploadMessage').innerHTML = `<div class="note" style="color:lightgreen">✅ Product uploaded successfully!</div>`;

        // Reset form
        document.querySelectorAll('#sellerView input, #sellerView textarea, #sellerView select').forEach(element => {
          if (element.type !== 'button' && element.id !== 'uploadProductBtn') {
            element.value = '';
          }
        });

        // Reset checkboxes
        $('useAffiliate').checked = false;
        $('affiliateFields').style.display = 'none';
        $('digitalUpload').style.display = 'block';

        setTimeout(async () => {
          sellerMode = false; 
          becomeBtn.textContent = 'Become a Seller'; 
          $('sellerView').style.display = 'none';
          await loadProducts();
        }, 3000);

      } catch(err) {
        console.error('❌ Upload error:', err);
        const message = handleApiError(err, 'Upload product');
        $('uploadMessage').innerHTML = `<div class="note" style="color:salmon">${escapeHtml(message)}</div>`;
      }
    });

    // Add this function to handle category selection
    function getSelectedCategory() {
      const selectCategory = $('p_category_select').value.trim();
      const newCategory = $('p_category_new').value.trim();
      
      // Prefer new category if provided, otherwise use selected category
      if (newCategory) {
        return newCategory;
      } else if (selectCategory) {
        return selectCategory;
      }
      return ''; // This will trigger validation error
    }

    // Initialize categories dropdown
    function initializeCategories() {
      const categorySelect = $('p_category_select');
      const existingCategories = Array.from(categorySelect.options).map(opt => opt.value);
      
      // Add categories from our global set
      categoriesSet.forEach(category => {
        if (category && !existingCategories.includes(category)) {
          const option = document.createElement('option');
          option.value = category;
          option.textContent = category;
          categorySelect.appendChild(option);
        }
      });
    } 

    // ---------- Initial load ----------
    document.addEventListener('DOMContentLoaded', async ()=>{
      await loadUser();
      await loadUserFavorites();
      await loadProducts();
      initializeCategories();
      
      // Load reviews for first product if available
      if (products.length > 0) {
        currentProductId = products[0].id;
        loadProductReviews(currentProductId);
      }
    });

    // Function to toggle bank details based on provider selection
    function toggleBankDetails() {
      const provider = document.getElementById('p_paymentProvider').value;
      const businessInfo = document.getElementById('businessInfo');
      const bankDetails = document.getElementById('bankDetails');
      
      if (provider) {
        businessInfo.style.display = 'block';
        bankDetails.style.display = 'block';
      } else {
        businessInfo.style.display = 'none';
        bankDetails.style.display = 'none';
      }
    }

    // Initialize - hide business info until provider is selected
    document.addEventListener('DOMContentLoaded', function() {
      document.getElementById('businessInfo').style.display = 'none';
      document.getElementById('bankDetails').style.display = 'none';
    });

  