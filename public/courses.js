 
    // ========================= CURRENCY CONVERSION FUNCTIONALITY =========================
    let userCurrency = 'NGN'; // Default
    let exchangeRates = {};

    // Detect user's currency
    async function detectUserCurrency() {
      try {
        // Try to get from browser or IP detection
        const response = await fetch('https://ipapi.co/currency/');
        const currency = await response.text();
        if (currency && currency.length === 3) {
          userCurrency = currency;
        }
        console.log('Detected user currency:', userCurrency);
      } catch (error) {
        console.log('Using default currency:', userCurrency);
      }
      await loadExchangeRates();
    }

    // Load exchange rates from your backend
    async function loadExchangeRates() {
      try {
        const response = await fetch('/api/currency-rates');
        const data = await response.json();
        exchangeRates = data.rates;
        updateCurrencySelector();
        updateAllPrices();
      } catch (error) {
        console.error('Error loading exchange rates:', error);
      }
    }

    // Convert and display prices
    function updateAllPrices() {
      const priceElements = document.querySelectorAll('.price');
      priceElements.forEach(element => {
        const originalPrice = element.getAttribute('data-original-price');
        if (originalPrice && exchangeRates[userCurrency]) {
          const convertedPrice = originalPrice * exchangeRates[userCurrency];
          element.textContent = formatCurrency(convertedPrice, userCurrency);
        }
      });
    }

    // Format currency display
    function formatCurrency(amount, currency) {
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency
        }).format(amount);
      } catch (error) {
        // Fallback formatting
        return `${currency} ${parseFloat(amount).toFixed(2)}`;
      }
    }

    // Enhanced payment initiation with currency conversion
    async function initiatePaymentWithConversion(courseId, originalPrice, title) {
      try {
        // Show confirmation with converted price
        const userFriendlyPrice = formatCurrency(originalPrice * exchangeRates[userCurrency], userCurrency);
        const confirmPayment = confirm(`Complete purchase for "${title}" at ${userFriendlyPrice}?`);
        
        if (confirmPayment) {
          await purchaseCourse(courseId, originalPrice, title);
        }
      } catch (error) {
        console.error('Currency conversion error:', error);
        // Fallback to original price
        await purchaseCourse(courseId, originalPrice, title);
      }
    }

    // Add currency selector UI
    function addCurrencySelector() {
      const searchSection = document.querySelector('.search-section');
      const currencySelector = document.createElement('div');
      currencySelector.innerHTML = `
        <select id="currencySelect">
          <option value="NGN">NGN - Nigerian Naira</option>
          <option value="USD">USD - US Dollar</option>
          <option value="EUR">EUR - Euro</option>
          <option value="GBP">GBP - British Pound</option>
          <option value="KES">KES - Kenyan Shilling</option>
          <option value="GHS">GHS - Ghanaian Cedi</option>
          <option value="ZAR">ZAR - South African Rand</option>
        </select>
      `;
      searchSection.appendChild(currencySelector);
      
      // Add event listener for currency change
      document.getElementById('currencySelect').addEventListener('change', function(e) {
        userCurrency = e.target.value;
        updateAllPrices();
      });
    }

    // Update currency selector to show current selection
    function updateCurrencySelector() {
      const currencySelect = document.getElementById('currencySelect');
      if (currencySelect) {
        currencySelect.value = userCurrency;
      }
    }

    // ========================= EXISTING FUNCTIONALITY =========================
    
    // Load current user and show upload section if logged in
    async function loadUser() {
      try {
        const res = await fetch('/api/me');
        const user = await res.json();
        const headerAuthButtons = document.getElementById('headerAuthButtons');
        const uploadSection = document.getElementById('uploadSection');
        const bookTypeSection = document.getElementById('bookTypeSection');
        const priceField = document.getElementById('priceField');

        if (user) {
          // User is logged in - show welcome message and logout
          headerAuthButtons.innerHTML = `
            <span style="color: var(--accent-gold); margin-right: 1rem;">
              Welcome, ${user.role === 'admin' ? '<strong>Admin</strong>' : user.username}
            </span>
            <a href="#" class="btn btn-login" onclick="logout()">Logout</a>
          `;
          
          // Show upload section for logged-in users
          uploadSection.style.display = 'block';
          
          // Show price field ONLY for admin users
          if (user.role === 'admin') {
            bookTypeSection.style.display = 'block';
            setupBookTypeSelector();
          } else {
            // Hide price section for normal users
            bookTypeSection.style.display = 'none';
            priceField.style.display = 'none';
          }
        } else {
          // User is not logged in - show login/signup buttons
          headerAuthButtons.innerHTML = `
            <a href="login.html" class="btn btn-login">Login</a>
            <a href="signup.html" class="btn btn-signup">Sign Up</a>
          `;
          uploadSection.style.display = 'none';
        }
      } catch (error) {
        console.error('Error loading user:', error);
      }
    }

    // Book type selector for admin only
    function setupBookTypeSelector() {
      const buttons = document.querySelectorAll('.book-type-btn');
      const priceField = document.getElementById('priceField');
      
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          if (btn.dataset.type === 'paid') {
            priceField.style.display = 'block';
            document.getElementById('price').required = true;
          } else {
            priceField.style.display = 'none';
            document.getElementById('price').required = false;
          }
        });
      });
    }

    // Enhanced course loading with currency support
    async function loadCourses() {
      try {
        const res = await fetch('/api/courses');
        const courses = await res.json();
        const grid = document.getElementById('coursesGrid');
        
        // Get current user to check access
        const userRes = await fetch('/api/me');
        const user = await userRes.json();
        
        grid.innerHTML = courses.map(course => `
          <div class="card">
            <img src="https://via.placeholder.com/400x200/1e293b/ffffff?text=${encodeURIComponent(course.title)}" alt="${course.title}">
            <div class="card-content">
              <h3>${course.title}</h3>
              <p>${course.description || 'No description available'}</p>
              <p class="price" data-original-price="${course.price}">
                ${course.price > 0 ? `Buy Now` : 'FREE'}
              </p>
              ${course.author ? `<p><small>By: ${course.author}</small></p>` : ''}
              
              ${course.price > 0 ? `
                <button onclick="initiatePaymentWithConversion(${course.id}, ${course.price}, '${course.title.replace(/'/g, "\\'")}')" 
                        class="btn btn-primary">
                  <i class="fas fa-shopping-cart"></i> Buy Now
                </button>
                <button onclick="checkAccess(${course.id})" class="btn" style="background: transparent; color: var(--accent-gold); border: 1px solid var(--accent-gold); margin-top: 0.5rem;">
                  Check Access
                </button>
              ` : `
                <a href="/api/download/${course.id}" class="btn btn-primary" onclick="return handleDownload(${course.id})">
                  <i class="fas fa-download"></i> Download Free
                </a>
              `}
              ${user && (user.role === 'admin' || user.id === course.author_id) ? `
  <button onclick="deleteCourse(${course.id})" 
          class="btn" 
          style="background: #ff4444; color: white; border: none; margin-top: 0.5rem;">
    <i class="fas fa-trash"></i> Delete
  </button>
` : ''}

            </div>
          </div>
        `).join('');
        
        // Update prices with user's currency after loading
        setTimeout(updateAllPrices, 100);
      } catch (error) {
        console.error('Error loading courses:', error);
        document.getElementById('coursesGrid').innerHTML = '<p>Error loading courses. Please try again later.</p>';
      }
    }

    // Enhanced upload form handler
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData();
      formData.append('title', document.getElementById('title').value);
      formData.append('description', document.getElementById('description').value);
      // Add author to form data
      formData.append('author', document.getElementById('author').value);
      
      const fileInput = document.getElementById('file');
      if (fileInput.files.length === 0) {
        alert('Please select a file to upload');
        return;
      }
      formData.append('file', fileInput.files[0]);
      
      try {
        // Get current user to check role
        const userRes = await fetch('/api/me');
        const user = await userRes.json();
        
        // Add price only if user is admin and paid book is selected
        if (user && user.role === 'admin') {
          const activeType = document.querySelector('.book-type-btn.active');
          if (activeType && activeType.dataset.type === 'paid') {
            const price = document.getElementById('price').value;
            if (price && parseFloat(price) > 0) {
              formData.append('price', price);
            }
          }
        }
        
        const response = await fetch('/api/courses', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        
        const messageDiv = document.getElementById('uploadMessage');
        if (response.ok) {
          messageDiv.innerHTML = `<div class="message success">✅ ${result.message}</div>`;
          document.getElementById('uploadForm').reset();
          loadCourses(); // Reload courses list
          
          // Reset to free book type after successful upload
          const freeBtn = document.querySelector('.book-type-btn[data-type="free"]');
          if (freeBtn) {
            freeBtn.click();
          }
        } else {
          messageDiv.innerHTML = `<div class="message error">❌ ${result.error}</div>`;
        }
      } catch (error) {
        console.error('Upload error:', error);
        document.getElementById('uploadMessage').innerHTML = `<div class="message error">❌ Upload failed. Please check your connection and try again.</div>`;
      }
    });
  
    // Complete purchase function with Flutterwave integration
    async function purchaseCourse(courseId, price, title) {
      try {
        const userRes = await fetch('/api/me');
        const user = await userRes.json();
        
        if (!user) {
          alert('Please login to purchase courses');
          window.location.href = 'login.html';
          return;
        }

        // Get user email
        const userEmail = user.email || `${user.username}@example.com`;
        
        // Initiate payment with your backend
        const response = await fetch('/api/initiate-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            courseId: courseId,
            amount: price,
            email: userEmail
          })
        });

        const data = await response.json();
        
        if (data.status === 'success') {
          // Redirect to Flutterwave payment page
          window.location.href = data.paymentLink;
        } else {
          alert('Error: ' + (data.error || 'Failed to initiate payment'));
        }
        
      } catch (error) {
        console.error('Purchase error:', error);
        alert('Error initiating purchase. Please try again.');
      }
    }
   
    // Handle free downloads
    async function handleDownload(courseId) {
      try {
        const response = await fetch(`/api/download/${courseId}`);
        
        if (response.ok) {
          return true; // Allow default download behavior
        } else {
          const error = await response.json();
          alert(error.error);
          return false;
        }
      } catch (error) {
        console.error('Download error:', error);
        alert('Error downloading file');
        return false;
      }
    }

    // Logout function
    async function logout() {
      try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.reload();
      } catch (error) {
        console.error('Logout error:', error);
        window.location.reload(); // Force reload anyway
      }
    }

    // Search functionality
    document.getElementById('searchBtn').addEventListener('click', () => {
      const query = document.getElementById('searchInput').value.toLowerCase();
      const cards = document.querySelectorAll('#coursesGrid .card');
      cards.forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        card.style.display = title.includes(query) ? 'block' : 'none';
      });
    });
async function deleteCourse(courseId) {
  if (!confirm('Are you sure you want to delete this upload? This action cannot be undone.')) return;

  try {
    const response = await fetch(`/api/courses/${courseId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok) {
      alert('✅ Course deleted successfully!');
      loadCourses(); // Refresh the list
    } else {
      alert('❌ Error: ' + (data.error || 'Failed to delete course.'));
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Error deleting course. Please try again.');
  }
}

    // Enter key search
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('searchBtn').click();
      }
    });

    // Check if user has access to a course
    async function checkAccess(courseId) {
      try {
        const response = await fetch(`/api/check-access/${courseId}`);
        const data = await response.json();
        
        if (data.hasAccess) {
          alert('You have access to this course! You can download it now.');
          // Automatically trigger download
          window.location.href = `/api/download/${courseId}`;
        } else {
          alert('You do not have access to this course. Please purchase it first.');
        }
      } catch (error) {
        console.error('Access check error:', error);
        alert('Error checking course access');
      }
    }

    // Initialize page
    document.addEventListener('DOMContentLoaded', () => {
      loadUser();
      addCurrencySelector();
      detectUserCurrency();
      loadCourses();
    });
  