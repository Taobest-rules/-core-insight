/* ============================================================
   CORE INSIGHT — SERVICES PAGE JAVASCRIPT
   services.js = original application logic (browsing, orders,
   escrow, certificates, flagging, admin, dashboard) + the new
   feature set (subscription removal, category taxonomy, offer-
   service wizard, fixed/flexible pricing, job board + bidding,
   Ask Provider via unified messaging) appended at the end.

   Later function declarations override earlier ones of the same
   name — this is how the subscription removal and category
   system cleanly supersede the original code without editing it
   directly, same pattern used in products.js.
   ============================================================ */

/*********************
 *  Global Variables *
 *********************/
let currentUser = null;
let userRole = null;
let services = [];
let categories = [];
let freelancerProfile = null;
let currentSkills = [];
let userSubscription = null;
let activeConversationId = null;
let activeConversationUserId = null;
let currentStep = 1;
const totalSteps = 4;
let currentZoom = 1;
let currentCertificateUrl = '';
let tags = [];

// Message polling
let messagePollingInterval = null;


// Helper function to safely extract rows from MySQL2 query results
function extractRows(result) {
    if (!result) return [];
    if (Array.isArray(result) && result.length === 2) {
        return result[0] || [];
    }
    if (Array.isArray(result)) {
        return result;
    }
    return result;
}

// Helper function to safely extract insertId
function extractInsertId(result) {
    if (!result) return null;
    if (Array.isArray(result) && result[0] && result[0].insertId) {
        return result[0].insertId;
    }
    if (result.insertId) {
        return result.insertId;
    }
    return null;
}

/*********************
 *  Helper Function  *
 *********************/
function $(id) {
    return document.getElementById(id);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showLoading(elementId) {
    const element = $(elementId);
    if (element) {
        element.innerHTML = '<div class="text-center">Loading...</div>';
    }
}

function safeSetText(id, text) {
    const element = $(id);
    if (element) {
        element.textContent = text;
    }
}

function safeSetValue(id, value) {
    const element = $(id);
    if (element) element.value = value || '';
}

function safeSetSelectValue(id, value) {
    const element = $(id);
    if (element) element.value = value || '';
}

function safeGetElement(id) {
    const element = $(id);
    if (!element) {
        console.warn(`Element with id "${id}" not found`);
    }
    return element;
}

function safeGetValue(id) {
    const element = safeGetElement(id);
    return element ? element.value : '';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '★'.repeat(fullStars);
    if (hasHalfStar) stars += '½';
    return stars;
}

/*********************
 *  Toast Notifications *
 *********************/
function showToast(message, type = 'info') {
    document.querySelectorAll('.custom-toast').forEach(toast => toast.remove());

    const toast = document.createElement('div');
    toast.className = `custom-toast toast-${type}`;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.style.color = '#fff';
    toast.style.zIndex = '9999';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.animation = 'slideIn 0.3s ease';
    
    if (type === 'success') {
        toast.style.background = '#10b981';
    } else if (type === 'error') {
        toast.style.background = '#ef4444';
    } else if (type === 'warning') {
        toast.style.background = '#f59e0b';
    } else {
        toast.style.background = '#3b82f6';
    }

    const icon = type === 'success' ? 'fa-check-circle' :
        type === 'warning' ? 'fa-exclamation-triangle' :
            type === 'error' ? 'fa-times-circle' : 'fa-info-circle';

    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

/*********************
 *  Modal Management *
 *********************/
function openModal(modal) {
    if (!modal) {
        console.error('Modal element not found');
        showToast('Error opening modal', 'error');
        return;
    }
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
}

/*********************
 *  Authentication & Role Management *
 *********************/
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/me');
        if (!response.ok) {
            currentUser = null;
            userRole = null;
            updateHeader();
            updateUIForUserRole();
            return;
        }

        const data = await response.json();
        
        if (data && data.user) {
            currentUser = data.user;
        } else if (data && data.id) {
            currentUser = data;
        } else {
            currentUser = data;
        }
        
        userRole = currentUser?.role || null;

        // Check subscription status if freelancer
        if (userRole === 'freelancer') {
            await checkSubscriptionStatus();
        }

        updateHeader();
        updateUIForUserRole();


        if (userRole === 'freelancer') {
            loadMyServices().catch(err => console.error(err));
        }

        loadServices().catch(err => console.error(err));

        if (currentUser) {
            checkUnreadMessages();
            setInterval(checkUnreadMessages, 10000);
        }

    } catch (err) {
        console.error('Auth check error:', err);
        currentUser = null;
        userRole = null;
        updateHeader();
        updateUIForUserRole();
    }
}

async function checkSubscriptionStatus() {
    try {
        const response = await fetch('/api/subscription/status', {
            credentials: 'include'
        });
        const data = await response.json();
        
        userSubscription = data;
        
        const banner = document.getElementById('subscriptionBanner');
        const daysLeftEl = document.getElementById('daysLeft');
        const subscriptionTitle = document.getElementById('subscriptionTitle');
        const subscriptionMessage = document.getElementById('subscriptionMessage');
        const manageBtn = document.getElementById('manageSubscriptionBtn');
        
        // FIX: Only show subscription banner for freelancers
        if (banner && currentUser && currentUser.role === 'freelancer') {
            if (data.hasActiveSubscription) {
                banner.classList.remove('hidden');
                
                if (data.subscriptionPlan === 'free_trial') {
                    subscriptionTitle.textContent = '🎁 Free Trial';
                    subscriptionMessage.innerHTML = `You have <span class="days-left" style="color: var(--accent-gold);">${data.daysLeft}</span> days left in your free trial`;
                    
                    if (manageBtn) {
                        manageBtn.textContent = 'Upgrade to Paid';
                        manageBtn.onclick = () => showSubscriptionModal();
                    }
                } else {
                    subscriptionTitle.textContent = `⭐ ${data.subscriptionPlan.charAt(0).toUpperCase() + data.subscriptionPlan.slice(1)} Plan Active`;
                    subscriptionMessage.innerHTML = `Your subscription is active. ${data.daysLeft} days remaining.`;
                    
                    if (manageBtn) {
                        manageBtn.textContent = 'Manage Subscription';
                        manageBtn.onclick = () => showSubscriptionModal();
                    }
                }
                
                if (data.subscriptionPlan === 'free_trial' && data.daysLeft < 7) {
                    banner.classList.add('warning');
                    subscriptionMessage.innerHTML += `<br><span style="color: var(--warning-orange);">⚠️ Your trial ends in ${data.daysLeft} days! Subscribe to continue.</span>`;
                } else {
                    banner.classList.remove('warning');
                }
            } else {
                banner.classList.add('hidden');
            }
        } else if (banner) {
            // Hide banner for clients
            banner.classList.add('hidden');
        }
        
        return data;
        
    } catch (error) {
        console.error('Error checking subscription:', error);
        return null;
    }
}
// Show subscription modal with trial info
function showSubscriptionModal() {
    const modal = document.getElementById('subscriptionModal');
    if (!modal) return;
    
    // Update modal content with trial info
    const modalContent = modal.querySelector('.modal-card');
    if (modalContent && userSubscription) {
        const trialInfo = document.createElement('div');
        trialInfo.className = 'trial-info';
        trialInfo.style.cssText = 'background: rgba(59, 130, 246, 0.1); padding: 15px; border-radius: 12px; margin-bottom: 20px;';
        
        if (userSubscription.subscriptionPlan === 'free_trial' && userSubscription.daysLeft > 0) {
            trialInfo.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-gift" style="font-size: 1.5rem; color: var(--accent-gold);"></i>
                    <div>
                        <strong style="color: var(--text-light);">Free Trial Active!</strong>
                        <p style="color: var(--text-gray); margin: 5px 0 0 0; font-size: 0.9rem;">
                            You have ${userSubscription.daysLeft} days remaining in your free trial.
                            Subscribe now to continue uninterrupted service.
                        </p>
                    </div>
                </div>
            `;
        } else if (userSubscription.subscriptionPlan !== 'free_trial' && userSubscription.daysLeft > 0) {
            trialInfo.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-check-circle" style="font-size: 1.5rem; color: #10b981;"></i>
                    <div>
                        <strong style="color: var(--text-light);">Active Subscription</strong>
                        <p style="color: var(--text-gray); margin: 5px 0 0 0; font-size: 0.9rem;">
                            Your ${userSubscription.subscriptionPlan} plan is active. ${userSubscription.daysLeft} days remaining.
                        </p>
                    </div>
                </div>
            `;
        } else {
            trialInfo.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; color: var(--warning-orange);"></i>
                    <div>
                        <strong style="color: var(--text-light);">Trial Expired</strong>
                        <p style="color: var(--text-gray); margin: 5px 0 0 0; font-size: 0.9rem;">
                            Your free trial has ended. Please subscribe to continue using services.
                        </p>
                    </div>
                </div>
            `;
        }
        
        const existingInfo = modalContent.querySelector('.trial-info');
        if (existingInfo) {
            existingInfo.remove();
        }
        modalContent.insertBefore(trialInfo, modalContent.firstChild);
    }
    
    openModal(modal);
}

// Handle subscription button clicks
async function subscribe(plan) {
    if (!currentUser) {
        showToast("Please login to subscribe", "warning");
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    showToast("Processing subscription...", "info");
    
    try {
        const response = await fetch('/api/subscription/pay', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ plan: plan })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showToast(data.error || "Failed to process subscription", "error");
            return;
        }
        
        if (data.paymentLink) {
            // Store transaction ref for verification
            sessionStorage.setItem('pendingSubscription', JSON.stringify({
                transactionRef: data.transactionRef,
                plan: plan,
                amount: data.amount
            }));
            
            // Redirect to payment
            window.location.href = data.paymentLink;
        } else {
            showToast("No payment link received", "error");
        }
        
    } catch (err) {
        console.error("Subscription error:", err);
        showToast("Error processing subscription", "error");
    }
}

// Initialize subscription check on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth to load
    setTimeout(async () => {
        await checkSubscriptionStatus();
        
        // If freelancer and trial expired, show subscription modal
        if (currentUser && currentUser.role === 'freelancer') {
            const subStatus = await checkSubscriptionStatus();
            if (subStatus && !subStatus.hasActiveSubscription && subStatus.daysLeft === 0) {
                setTimeout(() => showSubscriptionModal(), 2000);
            }
        }
    }, 1500);
    
  
});
  // ==================== REVIEW MODAL FOR FREELANCERS ====================
function showReviewModalForFreelancer(freelancerId, freelancerName, serviceId) {
    // Create modal if not exists
    let modal = document.getElementById('reviewFreelancerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reviewFreelancerModal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-card" style="max-width: 500px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--text-light);">
                        <i class="fas fa-star"></i> Review Freelancer
                    </h3>
                    <span class="close-x" onclick="closeModal(document.getElementById('reviewFreelancerModal'))">&times;</span>
                </div>
                <div id="reviewFreelancerContent">
                    <div class="form-group">
                        <label>Rating</label>
                        <div class="star-rating" id="reviewStars">
                            <i class="far fa-star" data-rating="1"></i>
                            <i class="far fa-star" data-rating="2"></i>
                            <i class="far fa-star" data-rating="3"></i>
                            <i class="far fa-star" data-rating="4"></i>
                            <i class="far fa-star" data-rating="5"></i>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Your Review</label>
                        <textarea id="reviewCommentFreelancer" class="form-textarea-enhanced" rows="4" 
                                  placeholder="Share your experience working with this freelancer..."></textarea>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-primary" onclick="submitFreelancerReview(${freelancerId}, ${serviceId})">
                            Submit Review
                        </button>
                        <button class="btn btn-secondary" onclick="closeModal(document.getElementById('reviewFreelancerModal'))">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Star rating functionality
        const stars = modal.querySelectorAll('#reviewStars i');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const rating = parseInt(star.dataset.rating);
                stars.forEach((s, i) => {
                    if (i < rating) {
                        s.className = 'fas fa-star';
                    } else {
                        s.className = 'far fa-star';
                    }
                });
                modal.dataset.selectedRating = rating;
            });
        });
    }
    
    modal.dataset.freelancerId = freelancerId;
    modal.dataset.serviceId = serviceId;
    modal.dataset.freelancerName = freelancerName;
    
    // Reset form
    const stars = modal.querySelectorAll('#reviewStars i');
    stars.forEach(star => star.className = 'far fa-star');
    document.getElementById('reviewCommentFreelancer').value = '';
    modal.dataset.selectedRating = '0';
    
    document.getElementById('reviewFreelancerContent').insertAdjacentHTML('afterbegin', 
        `<p style="margin-bottom: 15px;">Reviewing: <strong>${escapeHtml(freelancerName)}</strong></p>`
    );
    
    openModal(modal);
}

async function submitFreelancerReview(freelancerId, serviceId) {
    const modal = document.getElementById('reviewFreelancerModal');
    const rating = parseInt(modal.dataset.selectedRating) || 0;
    const comment = document.getElementById('reviewCommentFreelancer')?.value.trim();
    
    if (rating === 0) {
        showToast("Please select a rating", "warning");
        return;
    }
    
    if (!comment || comment.length < 10) {
        showToast("Please write a review (minimum 10 characters)", "warning");
        return;
    }
    
    try {
        const response = await fetch('/api/reviews/freelancer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                freelancerId: freelancerId,
                serviceId: serviceId || null,  // Send null instead of 'null'
                rating: rating,
                comment: comment
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('✅ Review submitted successfully!', 'success');
            closeModal(modal);
        } else {
            showToast(data.error || 'Failed to submit review', 'error');
        }
    } catch (err) {
        console.error('Review error:', err);
        showToast('Error submitting review', 'error');
    }
}

async function logout() {
    try {
        showToast('Preparing login form...', 'info');
        
        const response = await fetch('/api/logout', { 
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            currentUser = null;
            userRole = null;
            
            updateHeader();
            updateUIForUserRole();
            
            services = [];
            
            showToast('Logged out successfully', 'success');
            
            setTimeout(() => {
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    openModal(loginModal);
                    
                    const loginMsg = document.getElementById('loginMsg');
                    if (loginMsg) {
                        loginMsg.innerHTML = '<div class="text-info">Login as a different user</div>';
                    }
                }
            }, 500);
        } else {
            showToast('Logout failed', 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error during logout', 'error');
    }
}

/*********************
 *  FIXED UPDATE HEADER FUNCTION *
 *********************/
function updateHeader() {
    const headerAuth = document.getElementById('headerAuthButtons');
    const mobileAuth = document.getElementById('mobileAuthButtons');

    if (!headerAuth) return;

    if (currentUser) {
        const roleBadgeClass = userRole === 'freelancer' ? 'freelancer-badge' : '';
        
        headerAuth.innerHTML = '';
        
        const welcomePill = document.createElement('span');
        welcomePill.className = 'welcome-pill';
        const username = currentUser.username || currentUser.email || 'User';
        welcomePill.innerHTML = `
            Welcome, ${escapeHtml(username)}
            <span class="role-badge ${roleBadgeClass}">${userRole || 'client'}</span>
        `;
        headerAuth.appendChild(welcomePill);
        
        // ADD ADMIN BUTTONS HERE
        if (userRole === 'admin') {
            const adminReviewBtn = document.createElement('button');
            adminReviewBtn.id = 'adminReviewBtn';
            adminReviewBtn.className = 'auth-btn';
            adminReviewBtn.innerHTML = '<i class="fas fa-gavel"></i> Admin Review';
            adminReviewBtn.onclick = function(e) {
                e.preventDefault();
                console.log("Admin Review clicked");
                showAdminReviewPanel();
            };
            headerAuth.appendChild(adminReviewBtn);
            
            const adminDashboardBtn = document.createElement('button');
            adminDashboardBtn.id = 'adminDashboardBtn';
            adminDashboardBtn.className = 'auth-btn';
            adminDashboardBtn.innerHTML = '<i class="fas fa-chart-line"></i> Admin Dashboard';
            adminDashboardBtn.onclick = function(e) {
                e.preventDefault();
                console.log("Admin Dashboard clicked");
                showAdminDashboard();
            };
            headerAuth.appendChild(adminDashboardBtn);
        }
        
        // Inbox button
        const inboxBtn = document.createElement('button');
        inboxBtn.className = 'auth-btn';
        inboxBtn.id = 'inboxButton';
        inboxBtn.innerHTML = '📩 Inbox <span id="inboxBadge" class="badge hidden"></span>';
        inboxBtn.onclick = function(e) {
            e.preventDefault();
            showInbox();
        };
        headerAuth.appendChild(inboxBtn);
        
        // Switch account button
        const switchBtn = document.createElement('button');
        switchBtn.className = 'auth-btn';
        switchBtn.textContent = 'Switch Account';
        switchBtn.onclick = function(e) {
            e.preventDefault();
            logout();
        };
        headerAuth.appendChild(switchBtn);
        
        // Mobile version
        if (mobileAuth) {
            mobileAuth.innerHTML = '';
            const mobileWelcome = welcomePill.cloneNode(true);
            mobileAuth.appendChild(mobileWelcome);
            
            if (userRole === 'admin') {
                const mobileAdminReview = document.createElement('button');
                mobileAdminReview.className = 'auth-btn';
                mobileAdminReview.innerHTML = '<i class="fas fa-gavel"></i> Admin Review';
                mobileAdminReview.onclick = adminReviewBtn.onclick;
                mobileAuth.appendChild(mobileAdminReview);
                
                const mobileAdminDashboard = document.createElement('button');
                mobileAdminDashboard.className = 'auth-btn';
                mobileAdminDashboard.innerHTML = '<i class="fas fa-chart-line"></i> Admin Dashboard';
                mobileAdminDashboard.onclick = adminDashboardBtn.onclick;
                mobileAuth.appendChild(mobileAdminDashboard);
            }
            
            const mobileInbox = inboxBtn.cloneNode(true);
            mobileInbox.onclick = inboxBtn.onclick;
            mobileAuth.appendChild(mobileInbox);
            
            const mobileSwitch = switchBtn.cloneNode(true);
            mobileSwitch.onclick = switchBtn.onclick;
            mobileAuth.appendChild(mobileSwitch);
        }
        
    } else {
        // NOT LOGGED IN - USE ANCHOR TAG FOR SIGNUP
        headerAuth.innerHTML = `
            <button id="loginOpen" class="auth-btn">Login</button>
            <a href="signup.html" id="signupOpen" class="auth-btn signup">Sign Up</a>
        `;
        
        if (mobileAuth) {
            mobileAuth.innerHTML = headerAuth.innerHTML;
        }

        setTimeout(() => {
            const loginBtn = document.getElementById('loginOpen');
            
            if (loginBtn) {
                loginBtn.onclick = function(e) {
                    e.preventDefault();
                    const loginModal = document.getElementById('loginModal');
                    if (loginModal) {
                        loginModal.classList.remove('hidden');
                        loginModal.style.display = 'flex';
                    }
                };
            }
            // No need to bind signupOpen since it's now an anchor tag
        }, 50);
    }
}

/*********************
 *  FIXED SHOW INBOX FUNCTION *
 *********************/

  /*********************
 *  FIXED SHOW INBOX FUNCTION WITH MOBILE SUPPORT
 *********************/
function showInbox() {
    console.log('showInbox called');
    console.log('Current user:', currentUser);
    
    if (!currentUser || !currentUser.id) {
        console.log('No user logged in');
        showToast('Please login to access inbox', 'warning');
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.classList.remove('hidden');
            loginModal.style.display = 'flex';
        }
        return;
    }

    try {
        // Stop any ongoing polling
        if (typeof stopMessagePolling === 'function') {
            stopMessagePolling();
        }
        
        // Hide all sections
        const sections = ['pricingSection', 'servicesBrowser', 'createServiceForm', 'freelancerProfile'];
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
            if (tab) tab.classList.add('hidden');
        });
        
        // Hide any open modals
        document.querySelectorAll('.modal.open, .modal[style*="display: flex"]').forEach(modal => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            modal.classList.remove('open');
        });
        
        // Show inbox
        const inboxPage = document.getElementById('inboxPage');
        if (!inboxPage) {
            console.error('Inbox page not found');
            showToast('Inbox not available', 'error');
            return;
        }
        
        inboxPage.classList.remove('hidden');
        inboxPage.style.display = 'block';
        
        // Reset chat state
        const chatUserName = document.getElementById('chatUserName');
        if (chatUserName) {
            chatUserName.textContent = 'Select a conversation';
        }
        
        const chatUserStatus = document.getElementById('chatUserStatus');
        if (chatUserStatus) {
            chatUserStatus.innerHTML = '<i class="fas fa-circle"></i> Select a chat';
        }
        
        const emptyChatMessage = document.getElementById('emptyChatMessage');
        const messagesContainer = document.getElementById('messagesContainer');
        
        if (emptyChatMessage) {
            emptyChatMessage.style.display = 'flex';
        }
        
        if (messagesContainer) {
            messagesContainer.style.display = 'none';
            messagesContainer.innerHTML = '';
        }
        
        const messageInputArea = document.getElementById('messageInputArea');
        if (messageInputArea) {
            messageInputArea.style.display = 'none';
        }
        
        const userInfoPanel = document.getElementById('userInfoPanel');
        if (userInfoPanel) {
            userInfoPanel.style.display = 'none';
        }
        
        // Clear active conversation
        window.activeConversationId = null;
        window.activeConversationUserId = null;
        
        // Load conversations
        if (typeof loadConversations === 'function') {
            loadConversations();
        }
        
        // Setup message form
        if (typeof setupMessageForm === 'function') {
            setupMessageForm();
        }
        
        // Start polling
        if (typeof startMessagePolling === 'function') {
            startMessagePolling();
        }
        
        // Hide badge
        const badge = document.getElementById('inboxBadge');
        if (badge) {
            badge.classList.add('hidden');
        }
        
        // ✅ CRITICAL: Initialize mobile view AFTER inbox is shown
        setTimeout(() => {
            initMobileChatView();
            setupInboxAttachments();
            setupMobileUserInfo();
        }, 100);
        
        showToast('📬 Inbox opened', 'success');
        
    } catch (error) {
        console.error('Error opening inbox:', error);
        showToast('Failed to open inbox', 'error');
    }
}

// Override openConversation function for mobile
const originalOpenConversation = window.openConversation;
window.openConversation = function(conversationId, username, otherUserId) {
    // Call original function if it exists
    if (originalOpenConversation && typeof originalOpenConversation === 'function') {
        originalOpenConversation(conversationId, username, otherUserId);
    } else {
        // Fallback if original doesn't exist
        window.activeConversationId = conversationId;
        window.activeConversationUserId = otherUserId;
        
        const sendMessageForm = document.getElementById('sendMessageForm');
        if (sendMessageForm) {
            sendMessageForm.dataset.conversationId = conversationId;
        }
        
        const chatUserName = document.getElementById('chatUserName');
        if (chatUserName) chatUserName.textContent = username;
        
        const messageInputArea = document.getElementById('messageInputArea');
        if (messageInputArea) messageInputArea.style.display = 'block';
        
        const emptyChatMessage = document.getElementById('emptyChatMessage');
        const messagesContainer = document.getElementById('messagesContainer');
        
        if (emptyChatMessage) emptyChatMessage.style.display = 'none';
        if (messagesContainer) {
            messagesContainer.style.display = 'block';
            messagesContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
        }
        
        loadMessagesForConversation(conversationId);
    }
    
    // On mobile, switch to chat panel
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            showMobilePanel('chat');
            addMobileBackButtons();
        }, 100);
    }
};

// Setup mobile user info button
function setupMobileUserInfo() {
    const toggleBtn = document.getElementById('toggleUserInfoBtn');
    if (toggleBtn) {
        // Remove existing listeners
        const newBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
        
        newBtn.onclick = () => {
            if (window.innerWidth <= 768) {
                showMobilePanel('info');
                addMobileBackButtons();
            } else {
                const panel = document.getElementById('userInfoPanel');
                if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            }
        };
    }
}

// Handle window resize
function handleMobileResize() {
    if (window.innerWidth <= 768) {
        // On mobile, ensure we're showing the right panel
        if (!document.querySelector('.inbox-sidebar.mobile-active') && 
            !document.querySelector('.inbox-main.mobile-active') && 
            !document.querySelector('.inbox-sidebar-right.mobile-active')) {
            showMobilePanel('conversations');
        }
        addMobileBackButtons();
    } else {
        // On desktop, show all panels
        const sidebar = document.querySelector('.inbox-sidebar');
        const main = document.querySelector('.inbox-main');
        const rightSidebar = document.querySelector('.inbox-sidebar-right');
        
        if (sidebar) sidebar.classList.remove('mobile-active');
        if (main) main.classList.remove('mobile-active');
        if (rightSidebar) rightSidebar.classList.remove('mobile-active');
        
        // Remove mobile back buttons
        document.querySelectorAll('.mobile-back-btn').forEach(btn => btn.remove());
    }
}
function hideAllPages() {
    stopMessagePolling();

    const pages = [
        'pricingSection',
        'servicesBrowser',
        'createServiceForm',
        'freelancerProfile',
        'inboxPage',
        'adminDeletedServicesPage'
    ];

    pages.forEach(page => {
        const element = $(page);
        if (element) {
            element.classList.add('hidden');
        }
    });

    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab) tab.classList.add('hidden');
    });
}

function showServicesBrowser() {
    hideAllPages();
    const servicesBrowser = $('servicesBrowser');
    if (servicesBrowser) {
        servicesBrowser.classList.remove('hidden');
    }

    if (services.length === 0) {
        loadServices();
    }
}

function showPricingSection() {
    hideAllPages();
    const pricingSection = $('pricingSection');
    if (pricingSection) {
        pricingSection.classList.remove('hidden');
    }
}

// Make sure this function doesn't have any placeholder issues
async function showCreateServiceForm() {
    if (!currentUser) {
        showToast('Please login to create a service', 'warning');
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    if (currentUser.role !== 'freelancer' && currentUser.role !== 'admin') {
        showToast('Only freelancers can create services', 'error');
        return;
    }
    
    // Check subscription for freelancers
    if (currentUser.role === 'freelancer') {
        try {
            const response = await fetch('/api/subscription/status', {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (!data.hasActiveSubscription) {
                showSubscriptionModal();
                return;
            }
        } catch (error) {
            console.error('Subscription check error:', error);
        }
    }
    
    // Hide other sections
    const sections = ['pricingSection', 'servicesBrowser', 'freelancerProfile', 'inboxPage'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    // Show create service form
    const createForm = document.getElementById('createServiceForm');
    if (createForm) {
        createForm.classList.remove('hidden');
        // Re-attach form listener
        setupServiceForm();
    }
}
function hideCreateServiceForm() {
    const createServiceForm = $('createServiceForm');
    if (createServiceForm) {
        createServiceForm.classList.add('hidden');
    }
    showServicesBrowser();
}

/*********************
 *  Load Services *
 *********************/
async function loadServices() {
    const servicesList = $('servicesList');
    if (!servicesList) return;

    try {
        showLoading('servicesList');

        const response = await fetch('/api/services', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const servicesArray = data.services || data || [];
        
        services = Array.isArray(servicesArray) ? servicesArray : [];

        filterAndRenderServices();

    } catch (err) {
        console.error('Error loading services:', err);
        servicesList.innerHTML = `
            <div class="text-error" style="text-align: center; padding: 40px; grid-column: 1 / -1;">
                <div style="font-size: 4rem; margin-bottom: 20px;">⚠️</div>
                <h3>Failed to load services</h3>
                <p>Please check your connection and try again.</p>
                <button class="btn btn-primary" onclick="loadServices()">Retry</button>
            </div>
        `;
        services = [];
    }
}

async function loadMyServices() {
    const myServicesList = $('myServicesList');
    if (!myServicesList) return;

    try {
        showLoading('myServicesList');

        const response = await fetch('/api/services/my-services', {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const myServices = await response.json();

        if (!Array.isArray(myServices)) {
            throw new Error('Invalid data: myServices is not an array');
        }

        const providerServicesView = $('providerServicesView');
        const clientServicesView = $('clientServicesView');

        if (providerServicesView) {
            providerServicesView.classList.remove('hidden');
        }
        if (clientServicesView) {
            clientServicesView.classList.add('hidden');
        }

        if (myServices.length === 0) {
            myServicesList.innerHTML = `
                <div style="text-align: center; padding: 40px; grid-column: 1 / -1;">
                    <div style="font-size: 4rem; margin-bottom: 20px;">📭</div>
                    <h3>No Services Yet</h3>
                    <p>You haven't created any services yet. Create your first service to start earning!</p>
                    <button class="btn btn-primary" onclick="showCreateServiceForm()">
                        <i class="fas fa-plus"></i> Create Your First Service
                    </button>
                </div>
            `;
        } else {
            renderMyServices(myServices);
        }

    } catch (err) {
        console.error('Error loading my services:', err);
        myServicesList.innerHTML = `
            <div class="text-error" style="text-align: center; padding: 40px; grid-column: 1 / -1;">
                <div style="font-size: 4rem; margin-bottom: 20px;">⚠️</div>
                <h3>Failed to Load Your Services</h3>
                <p style="color: var(--text-gray);">Error: ${err.message}</p>
                <button class="btn btn-primary" onclick="loadMyServices()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>
        `;
    }
}
async function loadCategories() {
    try {
        const response = await fetch('/api/services/categories', {
            credentials: 'include'
        });
        if (response.ok) {
            categories = await response.json();
            populateCategoryDropdowns();
        }
    } catch (error) {
        categories = [];
    }
}

function populateCategoryDropdowns() {
    const categorySelect = $('serviceCategory');
    const categoryFilter = $('categoryFilter');

    if (categorySelect) {
        while (categorySelect.options.length > 1) {
            categorySelect.remove(1);
        }

        categories.forEach(category => {
            const option = new Option(category, category);
            categorySelect.add(option);
        });
    }

    if (categoryFilter) {
        while (categoryFilter.options.length > 1) {
            categoryFilter.remove(1);
        }

        categories.forEach(category => {
            const option = new Option(category, category);
            categoryFilter.add(option);
        });
    }
}

function filterAndRenderServices() {
    const searchTerm = $('serviceSearch') ? $('serviceSearch').value.toLowerCase() : '';
    const categoryFilter = $('categoryFilter') ? $('categoryFilter').value : '';
    const sortBy = $('sortFilter') ? $('sortFilter').value : 'newest';

    let filteredServices = [...services];

    if (searchTerm) {
        filteredServices = filteredServices.filter(service =>
            service.title.toLowerCase().includes(searchTerm) ||
            (service.description && service.description.toLowerCase().includes(searchTerm)) ||
            (service.category && service.category.toLowerCase().includes(searchTerm)) ||
            (service.username && service.username.toLowerCase().includes(searchTerm))
        );
    }

    if (categoryFilter) {
        filteredServices = filteredServices.filter(service =>
            service.category === categoryFilter
        );
    }

    switch (sortBy) {
        case 'price_low':
            filteredServices.sort((a, b) => (a.price || 0) - (b.price || 0));
            break;
        case 'price_high':
            filteredServices.sort((a, b) => (b.price || 0) - (a.price || 0));
            break;
        case 'rating':
            filteredServices.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
            break;
        case 'newest':
        default:
            filteredServices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
    }

    renderServices(filteredServices);
}

function renderServices(servicesToRender) {
    const container = $('servicesList');
    const noServices = $('noServices');

    if (!container) return;

    if (!servicesToRender || servicesToRender.length === 0) {
        container.innerHTML = '';
        if (noServices) noServices.style.display = 'block';
        return;
    }

    if (noServices) noServices.style.display = 'none';

    // Build the HTML for all services
    container.innerHTML = servicesToRender.map(service => {
        const serviceId = service.id;
        const title = service.title || 'Untitled Service';
        const description = service.description || 'No description available';
        const price = service.price || 0;
        const providerName = service.username || 'Unknown';
        const userId = service.user_id;
        const favoriteCount = service.favorite_count || 0;

        const providerPictureHtml = service.profile_picture_url ?
            `<div class="profile-picture-wrapper">
                <img src="${service.profile_picture_url}" alt="${providerName}" class="provider-profile-picture"
                     onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'provider-initials\\'>${providerName.charAt(0).toUpperCase()}</div>';">
            </div>` :
            `<div class="provider-initials">${providerName.charAt(0).toUpperCase()}</div>`;

        const isLoggedIn = !!currentUser;
        const isClient = currentUser?.role === 'client';
        const isFreelancer = currentUser?.role === 'freelancer';
        const isAdmin = currentUser?.role === 'admin';
        const isOwner = currentUser?.id === userId;

        let actionButtons = '';

        // Chat button - always show for logged in users
        if (isLoggedIn && !isOwner) {
            actionButtons += `
                <button class="btn chat-btn" onclick="checkAndStartConversation(${serviceId}, ${userId})">
                    <i class="fas fa-comments"></i> Chat
                </button>
                <button class="btn profile-btn" onclick="openFreelancerProfile(${userId})">
                    <i class="fas fa-user"></i> View Profile
                </button>
            `;
        } else if (!isLoggedIn) {
            actionButtons += `
                <button class="btn chat-btn" onclick="showToast('Please login to chat', 'warning'); openModal(document.getElementById('loginModal'))">
                    <i class="fas fa-comments"></i> Chat
                </button>
                <button class="btn profile-btn" onclick="showToast('Please login to view profile', 'warning'); openModal(document.getElementById('loginModal'))">
                    <i class="fas fa-user"></i> View Profile
                </button>
            `;
        } else if (isOwner) {
            actionButtons += `
                <button class="btn profile-btn" onclick="openFreelancerProfile(${userId})">
                    <i class="fas fa-user"></i> View Profile
                </button>
            `;
        }

        // Recruit button for clients (with data attributes for status checking)
        if (isLoggedIn && isClient && !isOwner) {
            actionButtons += `
                <button class="btn recruit-btn" data-freelancer-id="${userId}" data-service-id="${serviceId}" onclick="recruitFreelancer(${userId}, ${serviceId}, this)">
                    <i class="fas fa-user-plus"></i> Recruit
                </button>
            `;
        }

        // Favorite button
        if (isLoggedIn && !isOwner) {
            const isFavorited = service.is_favorited ? true : false;
            const favoriteIcon = isFavorited ? 'fas fa-heart' : 'far fa-heart';
            actionButtons += `
                <button class="btn favorite-btn ${isFavorited ? 'active' : ''}" onclick="toggleServiceFavorite(${serviceId}, this)" data-service-id="${serviceId}">
                    <i class="${favoriteIcon}"></i> Favorite <span class="favorite-count">${favoriteCount}</span>
                </button>
            `;
        }

        // Flag button for clients
        if (isLoggedIn && isClient && !isOwner) {
            actionButtons += `
                <button class="btn btn-secondary flag-btn" onclick="showFlagModal(${userId}, '${escapeHtml(providerName)}', ${serviceId})">
                    <i class="fas fa-flag"></i> Report
                </button>
            `;
        }

        // Review button for clients (hidden by default, shown after recruitment check)
        if (isLoggedIn && isClient && !isOwner) {
            actionButtons += `
                <button class="btn btn-secondary review-btn" data-freelancer-id="${userId}" data-service-id="${serviceId}" data-freelancer-name="${escapeHtml(providerName)}" style="display: none;">
                    <i class="fas fa-star"></i> Review
                </button>
            `;
        }

        // Delete button for owners/admins
        if (isLoggedIn && (isOwner || isAdmin)) {
            actionButtons += `
                <button class="btn btn-danger" onclick="confirmDeleteService(${serviceId}, '${escapeHtml(title)}', ${userId}, ${isOwner})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            `;
        }

        const rating = service.rating || service.avg_rating || 0;
        const reviewCount = service.review_count || 0;
        const ratingHtml = rating > 0 ? 
            `<div class="service-rating">
                <span class="stars">${generateStars(rating)}</span>
                <span class="rating-count">(${reviewCount})</span>
            </div>` : '';

        return `
            <div class="service-card" data-service-id="${serviceId}" data-freelancer-id="${userId}">
                <div class="service-header">
                    <h3 class="service-title">${escapeHtml(title)}</h3>
                    <div class="service-price">${price > 0 ? `$${price}` : 'Free'}</div>
                </div>

                <div class="service-provider-info">
                    ${providerPictureHtml}
                    <div class="provider-info">
                        <div class="service-provider-name">${escapeHtml(providerName)}</div>
                        <div class="service-provider">${escapeHtml(service.category || 'General')}</div>
                        ${ratingHtml}
                    </div>
                </div>

                <div class="description-container">
                    <p class="service-description">${escapeHtml(description.substring(0, 150))}${description.length > 150 ? '...' : ''}</p>
                </div>

                ${service.delivery_time ? `
                    <div style="margin: 10px 0; color: var(--text-gray); font-size: 0.9rem;">
                        <i class="fas fa-clock"></i> Delivery: ${service.delivery_time} days
                    </div>
                ` : ''}

                ${service.revisions ? `
                    <div style="margin: 5px 0; color: var(--text-gray); font-size: 0.9rem;">
                        <i class="fas fa-redo-alt"></i> Revisions: ${service.revisions}
                    </div>
                ` : ''}

                <div class="service-actions">
                    ${actionButtons}
                </div>

                <button class="btn btn-secondary view-details-btn" onclick="viewServiceDetailsModal(${serviceId})" style="width:100%; margin-top:10px;">
                    <i class="fas fa-info-circle"></i> View Details
                </button>
            </div>
        `;
    }).join('');

    // After rendering, check recruited status and update buttons
    if (currentUser && currentUser.role === 'client') {
        checkRecruitedAndReviewedStatus();
    }
}

// Function to check recruited status and update buttons
async function checkRecruitedAndReviewedStatus() {
    try {
        const response = await fetch('/api/client/providers', {
            credentials: 'include'
        });
        
        if (!response.ok) return;
        
        let providers = await response.json();
        if (!Array.isArray(providers)) providers = [];
        
        const recruitedIds = new Set(providers.map(p => p.freelancer_id));
        
        // Update recruit buttons
        document.querySelectorAll('.recruit-btn').forEach(btn => {
            const freelancerId = parseInt(btn.dataset.freelancerId);
            if (recruitedIds.has(freelancerId)) {
                btn.classList.add('recruited');
                btn.innerHTML = '<i class="fas fa-check"></i> Recruited';
            } else {
                btn.classList.remove('recruited');
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Recruit';
            }
        });
        
        // Show review buttons for recruited freelancers
        document.querySelectorAll('.review-btn').forEach(btn => {
            const freelancerId = parseInt(btn.dataset.freelancerId);
            if (recruitedIds.has(freelancerId)) {
                btn.style.display = 'flex';
                btn.onclick = () => {
                    showReviewModalForFreelancer(
                        freelancerId, 
                        btn.dataset.freelancerName, 
                        btn.dataset.serviceId
                    );
                };
            } else {
                btn.style.display = 'none';
            }
        });
        
        // Update badge count
        const badge = document.getElementById('providersBadge');
        if (badge) {
            if (providers.length > 0) {
                badge.textContent = providers.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        
    } catch (err) {
        console.error("Error checking recruited status:", err);
    }
}
// Function to check recruited freelancers and show review buttons
async function checkAndShowReviewButtons() {
    try {
        const response = await fetch('/api/client/providers', {
            credentials: 'include'
        });
        
        if (!response.ok) return;
        
        let providers = await response.json();
        if (!Array.isArray(providers)) providers = [];
        
        // Create a set of recruited freelancer IDs
        const recruitedIds = new Set(providers.map(p => p.freelancer_id));
        
        // Show review buttons for recruited freelancers
        document.querySelectorAll('.review-btn').forEach(btn => {
            const freelancerId = parseInt(btn.dataset.freelancerId);
            if (recruitedIds.has(freelancerId)) {
                btn.style.display = 'flex';
                // Add click event
                btn.onclick = () => {
                    showReviewModalForFreelancer(
                        freelancerId, 
                        btn.dataset.freelancerName, 
                        btn.dataset.serviceId
                    );
                };
            }
        });
        
    } catch (err) {
        console.error("Error checking recruited freelancers:", err);
    }
}

/*********************
 *  Chat & Conversation Functions *
 *********************/
// Update conversation loading to show profile pictures
async function loadConversations() {
    if (!currentUser) {
        console.log('No user logged in, cannot load conversations');
        return;
    }

    const list = document.getElementById('conversationList');
    if (!list) {
        console.error("Conversation list element not found");
        return;
    }

    list.innerHTML = `
        <div class="conversation-skeleton">
            <div class="skeleton-line" style="width: 60%;"></div>
            <div class="skeleton-line" style="width: 80%;"></div>
            <div class="skeleton-line" style="width: 40%;"></div>
        </div>
    `;

    try {
        const res = await fetch("/api/messages/conversations", {
            credentials: "include",
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        let conversations = await res.json();
        
        // FIX: Ensure conversations is an array
        if (!Array.isArray(conversations)) {
            if (conversations && typeof conversations === 'object') {
                // If it's an object, try to extract array from common properties
                if (conversations.conversations && Array.isArray(conversations.conversations)) {
                    conversations = conversations.conversations;
                } else if (conversations.data && Array.isArray(conversations.data)) {
                    conversations = conversations.data;
                } else {
                    conversations = [];
                }
            } else {
                conversations = [];
            }
        }

        if (conversations.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                    <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i>
                    <h4 style="color: var(--text-light); margin-bottom: 10px;">No conversations yet</h4>
                    <p>Start a conversation by clicking on a service or user</p>
                    <button class="btn btn-primary mt-20" onclick="startNewConversation()">
                        <i class="fas fa-plus"></i> New Conversation
                    </button>
                </div>
            `;
            return;
        }

        list.innerHTML = '';
        
        for (const conv of conversations) {
            try {
                const conversationId = conv.conversation_id || conv.id;
                const otherUserId = conv.other_user_id || conv.otherUserId;
                let otherUserName = conv.other_user_name || conv.otherUserName || conv.username || 'User';
                
                if (!otherUserName || otherUserName === 'null' || otherUserName === 'undefined') {
                    otherUserName = 'User';
                }
                
                const serviceTitle = conv.service_title || conv.serviceTitle || 'Direct Message';
                const createdAt = conv.created_at || conv.createdAt || conv.updated_at || new Date().toISOString();
                
                if (!conversationId) continue;

                const div = document.createElement('div');
                div.className = 'conversation-item';
                div.dataset.conversationId = conversationId;
                div.dataset.otherUserId = otherUserId;

                let previewText = 'Click to start conversation';
                let lastMessageTime = createdAt;
                let unreadCount = 0;

                try {
                    const msgRes = await fetch(`/api/messages/${conversationId}`, {
                        credentials: "include"
                    });
                    if (msgRes.ok) {
                        let messages = await msgRes.json();
                        // Ensure messages is an array
                        if (!Array.isArray(messages)) {
                            messages = [];
                        }
                        if (messages.length > 0) {
                            const lastMessage = messages[messages.length - 1];
                            if (lastMessage) {
                                previewText = lastMessage.message ? lastMessage.message.substring(0, 50) : '📷 Image';
                                if (lastMessage.message && lastMessage.message.length > 50) previewText += '...';
                                lastMessageTime = lastMessage.created_at || lastMessage.createdAt || createdAt;
                                
                                unreadCount = messages.filter(m => 
                                    !m.is_read && m.sender_id !== currentUser.id
                                ).length;
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error fetching last message:", e);
                }

                const timeAgo = formatTimeAgo(lastMessageTime);
                
                div.innerHTML = `
                    <div class="conversation-item-content">
                        <div class="conversation-header">
                            <div class="conversation-user-info">
                                <div class="conversation-avatar">
                                    ${escapeHtml(otherUserName.charAt(0).toUpperCase())}
                                </div>
                                <div class="conversation-details">
                                    <div class="conversation-name">
                                        ${escapeHtml(otherUserName)}
                                        ${unreadCount > 0 ? `
                                            <span class="unread-badge">${unreadCount}</span>
                                        ` : ''}
                                    </div>
                                    <div class="conversation-preview ${unreadCount > 0 ? 'unread' : ''}">
                                        ${escapeHtml(previewText)}
                                    </div>
                                </div>
                            </div>
                            <div class="conversation-meta">
                                <div class="conversation-time">${timeAgo}</div>
                                <div class="conversation-service">${escapeHtml(serviceTitle)}</div>
                            </div>
                        </div>
                    </div>
                `;

                div.onclick = () => openConversation(conversationId, otherUserName, otherUserId);
                list.appendChild(div);

            } catch (e) {
                console.error("Error rendering conversation:", e);
            }
        }

        if (window.activeConversationId) {
            const activeItem = document.querySelector(`.conversation-item[data-conversation-id="${window.activeConversationId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

    } catch (err) {
        console.error("Failed to load conversations:", err);
        list.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px; color: #ef4444;"></i>
                <h4 style="color: var(--text-light); margin-bottom: 10px;">Failed to load conversations</h4>
                <p style="margin-bottom: 20px;">${err.message}</p>
                <button class="btn btn-primary" onclick="loadConversations()">
                    <i class="fas fa-sync-alt"></i> Try Again
                </button>
            </div>
        `;
    }
}
// Add Close Inbox button
function addInboxCloseButton() {
    const inboxHeader = document.querySelector('.inbox-header');
    if (inboxHeader && !document.getElementById('closeInboxBtn')) {
        const closeBtn = document.createElement('button');
        closeBtn.id = 'closeInboxBtn';
        closeBtn.className = 'btn btn-secondary';
        closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
        closeBtn.style.marginLeft = '10px';
        closeBtn.onclick = () => {
            document.getElementById('inboxPage').classList.add('hidden');
            showServicesBrowser();
        };
        inboxHeader.appendChild(closeBtn);
    }
}

// Fix View Profile button in inbox
function setupInboxButtons() {
    const viewProfileBtn = document.getElementById('viewProfileBtn');
    if (viewProfileBtn) {
        viewProfileBtn.onclick = () => {
            if (window.activeConversationUserId) {
                openFreelancerProfile(window.activeConversationUserId);
            } else {
                showToast('No user selected', 'warning');
            }
        };
    }
    
   // Update the search button in inbox
const searchInChatBtn = document.getElementById('searchInChatBtn');
if (searchInChatBtn) {
    searchInChatBtn.onclick = () => {
        searchInConversation();
    };
}
}

// Call these when opening inbox
const originalShowInbox = showInbox;
window.showInbox = function() {
    originalShowInbox();
    setTimeout(() => {
        addInboxCloseButton();
        setupInboxButtons();
        setupInboxAttachments();
    }, 100);
};

async function openConversation(conversationId, username = 'User', otherUserId = null) {
    if (username === null || username === undefined) {
        username = 'User';
    } else if (typeof username !== 'string') {
        username = String(username);
    }

    window.activeConversationId = conversationId;
    window.activeConversationUserId = otherUserId;

    const sendMessageForm = $('sendMessageForm');
    if (sendMessageForm) {
        sendMessageForm.dataset.conversationId = conversationId;
    }

    const chatUserName = $('chatUserName');
    if (chatUserName) {
        chatUserName.textContent = username;
    }

    const chatUserAvatar = $('chatUserAvatar');
    if (chatUserAvatar) {
        chatUserAvatar.innerHTML = username.charAt(0).toUpperCase();
        chatUserAvatar.style.background = 'var(--gradient-primary)';
    }

    const messageInputArea = $('messageInputArea');
    if (messageInputArea) {
        messageInputArea.style.display = 'block';
    }

    const emptyChatMessage = $('emptyChatMessage');
    const messagesContainer = $('messagesContainer');

    if (emptyChatMessage) {
        emptyChatMessage.style.display = 'none';
    }

    if (messagesContainer) {
        messagesContainer.style.display = 'block';
        messagesContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-gray);">
                <i class="fas fa-spinner fa-spin"></i> Loading messages...
            </div>
        `;
    }

    if (otherUserId) {
        loadUserInfo(otherUserId);
    }

    await loadMessagesForConversation(conversationId);

    try {
        await fetch("/api/messages/mark-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ conversation_id: conversationId })
        });
    } catch (e) {
        console.error("Error marking messages as read:", e);
    }

    const messageInput = $('messageInput');
    if (messageInput) {
        messageInput.focus();
    }
}

async function loadMessagesForConversation(conversationId) {
    if (!conversationId) return;

    try {
        const res = await fetch(`/api/messages/${conversationId}`, {
            credentials: "include"
        });

        if (!res.ok) {
            const container = $('messagesContainer');
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center; color: var(--text-gray); padding: 40px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 15px;"></i>
                        <p>Failed to load messages</p>
                        <button class="btn btn-primary" onclick="loadMessagesForConversation(${conversationId})" style="margin-top: 10px;">
                            <i class="fas fa-sync-alt"></i> Try Again
                        </button>
                    </div>
                `;
            }
            return;
        }

        const data = await res.json();
        let messages = Array.isArray(data) ? data : (data.messages || []);

        const container = $('messagesContainer');
        if (!container) return;

        if (messages.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; color: var(--text-gray); padding: 40px;">
                    <i class="fas fa-comments" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>No messages yet</p>
                    <p style="font-size: 0.9rem;">Send a message to start the conversation!</p>
                </div>
            `;
            return;
        }

        const sortedMessages = [...messages].sort((a, b) => 
            new Date(a.created_at) - new Date(b.created_at)
        );

        const groupedMessages = [];
        let currentGroup = null;
        
        for (const m of sortedMessages) {
            const messageDate = new Date(m.created_at);
            
            if (!currentGroup || 
                currentGroup.sender_id !== m.sender_id || 
                (messageDate - currentGroup.lastTime) > 300000) {
                
                if (currentGroup) groupedMessages.push(currentGroup);
                
                currentGroup = {
                    sender_id: m.sender_id,
                    sender_name: m.sender_name || (m.sender_id === currentUser?.id ? 'You' : 'User'),
                    messages: [m],
                    firstTime: messageDate,
                    lastTime: messageDate
                };
            } else {
                currentGroup.messages.push(m);
                currentGroup.lastTime = messageDate;
            }
        }
        if (currentGroup) groupedMessages.push(currentGroup);

        container.innerHTML = '';

        for (const group of groupedMessages) {
            const isMe = group.sender_id === currentUser?.id;
            const groupDiv = document.createElement('div');
            groupDiv.className = `message-group ${isMe ? 'sent' : 'received'}`;
            
            if (!isMe) {
                const headerDiv = document.createElement('div');
                headerDiv.className = 'message-group-header';
                headerDiv.textContent = group.sender_name || 'User';
                groupDiv.appendChild(headerDiv);
            }
            
            for (const m of group.messages) {
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${isMe ? 'sent' : 'received'}`;
                messageDiv.dataset.messageId = m.id;

                const timeString = new Date(m.created_at).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit', hour12: true
                });

                let contentHtml = '';
                
                // Handle images
                if (m.image_url) {
                    let imageUrl = m.image_url;
                    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
                        imageUrl = '/' + imageUrl;
                    }
                    contentHtml += `
                        <div class="message-image">
                            <img src="${imageUrl}" alt="Shared image" 
                                 onclick="openImageViewer('${imageUrl}')" 
                                 style="max-width: 180px; max-height: 150px; border-radius: 10px; cursor: pointer;"
                                 onerror="this.onerror=null; this.src='https://placehold.co/400x250/1e293b/3b82f6/png?text=Image+Not+Found';">
                        </div>
                    `;
                }
                
                // Handle file attachments
                if (m.file_url) {
                    const fileIcon = m.file_name?.match(/\.(pdf)$/i) ? 'fa-file-pdf' :
                                     m.file_name?.match(/\.(doc|docx)$/i) ? 'fa-file-word' :
                                     m.file_name?.match(/\.(jpg|jpeg|png|gif)$/i) ? 'fa-file-image' :
                                     'fa-file-alt';
                    contentHtml += `
                        <div class="message-file" style="margin: 8px 0;">
                            <a href="${m.file_url}" target="_blank" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(100, 255, 218, 0.1); border-radius: 8px; text-decoration: none; color: var(--accent-primary);">
                                <i class="fas ${fileIcon}" style="font-size: 1.2rem;"></i>
                                <div style="flex: 1; overflow: hidden;">
                                    <div style="font-weight: 500; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(m.file_name || 'File')}</div>
                                    <div style="font-size: 0.7rem; opacity: 0.7;">${(m.file_size / 1024).toFixed(1)} KB</div>
                                </div>
                                <i class="fas fa-download"></i>
                            </a>
                        </div>
                    `;
                }
                
                // Handle text message
                if (m.message && m.message !== '📷 Sent an image') {
                    contentHtml += `<div class="message-text">${escapeHtml(m.message)}</div>`;
                }

                messageDiv.innerHTML = `${contentHtml}<div class="message-time">${timeString}</div>`;
                groupDiv.appendChild(messageDiv);
            }
            container.appendChild(groupDiv);
        }
        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error("Failed to load messages:", err);
        const container = $('messagesContainer');
        if (container) {
            container.innerHTML = `<div style="text-align:center; color: var(--text-gray); padding: 40px;"><p>Error loading messages</p></div>`;
        }
    }
}
async function loadUserInfo(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/profile`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load user info');

        const user = await response.json();

        const userInfoContent = document.getElementById('userInfoContent');
        if (!userInfoContent) return;

        const username = user.username || 'User';
        const headline = user.headline || 'Freelancer';
        const avgRating = user.avg_rating || 0;
        const reviewCount = user.review_count || 0;
        const location = user.location || '';
        const profilePicture = user.profile_picture;
        const userInitial = username.charAt(0).toUpperCase();
        const currentUserRole = currentUser?.role;

        userInfoContent.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="width: 80px; height: 80px; border-radius: 50%; overflow: hidden; margin: 0 auto 15px; border: 3px solid var(--accent-blue);">
                    ${profilePicture ?
                        `<img src="${profilePicture}" alt="${username}" style="width: 100%; height: 100%; object-fit: cover;"
                              onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width: 100%; height: 100%; background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; font-size: 2rem; color: white;\\'>${userInitial}</div>';">` :
                        `<div style="width: 100%; height: 100%; background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; font-size: 2rem; color: white;">
                            ${userInitial}
                        </div>`
                    }
                </div>
                <h4 style="color: var(--text-light); margin-bottom: 5px;">${escapeHtml(username)}</h4>
                <p style="color: var(--accent-gold); font-size: 0.9rem;">${escapeHtml(headline)}</p>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
                <div style="margin-bottom: 15px;">
                    <div style="color: var(--text-gray); font-size: 0.85rem; margin-bottom: 5px;">
                        <i class="fas fa-star" style="color: var(--accent-gold); margin-right: 8px;"></i> Rating
                    </div>
                    <div style="color: var(--text-light); font-weight: 600;">
                        ${avgRating.toFixed(1)} (${reviewCount} reviews)
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <div style="color: var(--text-gray); font-size: 0.85rem; margin-bottom: 5px;">
                        <i class="fas fa-clock" style="color: var(--accent-gold); margin-right: 8px;"></i> Response Time
                    </div>
                    <div style="color: var(--text-light);">
                        Typically responds within 1 hour
                    </div>
                </div>

                ${location ? `
                    <div style="margin-bottom: 15px;">
                        <div style="color: var(--text-gray); font-size: 0.85rem; margin-bottom: 5px;">
                            <i class="fas fa-map-marker-alt" style="color: var(--accent-gold); margin-right: 8px;"></i> Location
                        </div>
                        <div style="color: var(--text-light);">
                            ${escapeHtml(location)}
                        </div>
                    </div>
                ` : ''}
            </div>

            <div style="margin-top: 20px; display: flex; gap: 10px; flex-direction: column;">
                <button onclick="openFreelancerProfileFromInbox(${userId})" class="btn btn-secondary" style="width: 100%; padding: 12px;">
                    <i class="fas fa-user"></i> View Full Profile
                </button>
                ${currentUserRole === 'client' ? `
                    <button onclick="showFlagModal(${userId}, '${escapeHtml(username)}', null)" class="btn btn-danger" style="width: 100%; padding: 12px;">
                        <i class="fas fa-flag"></i> Report User
                    </button>
                    <button onclick="showReviewModalForFreelancer(${userId}, '${escapeHtml(username)}', null)" class="btn btn-warning" style="width: 100%; padding: 12px;">
                        <i class="fas fa-star"></i> Write a Review
                    </button>
                ` : currentUserRole === 'freelancer' ? `
                    <button onclick="reportClientFromInbox(${userId}, '${escapeHtml(username)}')" class="btn btn-danger" style="width: 100%; padding: 12px;">
                        <i class="fas fa-flag"></i> Report Client
                    </button>
                ` : ''}
            </div>
        `;

    } catch (error) {
        console.error('Error loading user info:', error);
        const userInfoContent = document.getElementById('userInfoContent');
        if (userInfoContent) {
            userInfoContent.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-gray);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px; color: #ef4444;"></i>
                    <p>Failed to load user information</p>
                    <p style="font-size: 0.9rem;">${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }
}

// Add this helper function for freelancers to report clients from inbox
async function reportClientFromInbox(clientId, clientName) {
    const reason = prompt(`Why are you reporting ${clientName}?\n\nPlease provide a detailed reason (minimum 10 characters):`);
    
    if (!reason) return;
    if (reason.length < 10) {
        showToast("Please provide a detailed reason (minimum 10 characters)", "warning");
        return;
    }
    
    try {
        const response = await fetch('/api/client/flag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                client_id: clientId,
                reason: reason
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message || "Client reported successfully", "success");
        } else {
            showToast(data.error || "Failed to report client", "error");
        }
    } catch (err) {
        console.error("Report error:", err);
        showToast("Error reporting client", "error");
    }
}
function openFreelancerProfileFromInbox(userId) {
    const userInfoPanel = document.getElementById('userInfoPanel');
    if (userInfoPanel) {
        userInfoPanel.style.display = 'none';
    }
    openFreelancerProfile(userId);
}


async function openFreelancerProfile(userId) {
    if (!userId) {
        showToast("Invalid user ID", "error");
        return;
    }
    
    try {
        showToast("Loading profile...", "info");
        
        const response = await fetch(`/api/users/${userId}/profile`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load profile');
        }
        
        const profile = await response.json();
        
        // Get certificates separately
        let certificates = [];
        try {
            const certResponse = await fetch(`/api/users/${userId}/certificates`, {
                credentials: 'include'
            });
            if (certResponse.ok) {
                const certData = await certResponse.json();
                certificates = certData.certificate_images || [];
            }
        } catch (err) {
            console.error("Error loading certificates:", err);
        }
        
        // Format skills
        const skillsList = profile.skills && Array.isArray(profile.skills) ? profile.skills : 
                          (profile.skills ? profile.skills.split(',').map(s => s.trim()) : []);
        
        // Format languages
        const languagesList = profile.languages && Array.isArray(profile.languages) ? profile.languages :
                              (profile.languages ? profile.languages.split(',').map(l => l.trim()) : []);
        
        // Generate stars for rating
        const avgRating = profile.avg_rating || 0;
        const fullStars = Math.floor(avgRating);
        const hasHalfStar = avgRating % 1 >= 0.5;
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= fullStars) {
                starsHtml += '<i class="fas fa-star" style="color: #fbbf24; font-size: 1rem;"></i>';
            } else if (i === fullStars + 1 && hasHalfStar) {
                starsHtml += '<i class="fas fa-star-half-alt" style="color: #fbbf24; font-size: 1rem;"></i>';
            } else {
                starsHtml += '<i class="far fa-star" style="color: #64748b; font-size: 1rem;"></i>';
            }
        }
        
        const modalContent = `
            <div style="max-height: 80vh; overflow-y: auto; padding-right: 10px;">
                <!-- Header Section -->
                <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div style="width: 100px; height: 100px; border-radius: 50%; overflow: hidden; margin: 0 auto 15px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); display: flex; align-items: center; justify-content: center;">
                        ${profile.profile_picture ? 
                            `<img src="${profile.profile_picture}" style="width: 100%; height: 100%; object-fit: cover;">` :
                            `<span style="font-size: 3rem; color: white;">${(profile.username || 'U').charAt(0).toUpperCase()}</span>`
                        }
                    </div>
                    <h2 style="color: #ffffff; margin-bottom: 8px; font-size: 1.8rem;">${escapeHtml(profile.username)}</h2>
                    <p style="color: #fbbf24; font-size: 1rem; margin-bottom: 12px;">${escapeHtml(profile.headline || 'Professional Freelancer')}</p>
                    <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
                        <div class="service-rating" style="display: flex; align-items: center; gap: 8px;">
                            <div class="stars">${starsHtml}</div>
                            <span style="color: #94a3b8;">(${profile.review_count || 0} reviews)</span>
                        </div>
                    </div>
                </div>
                
                <!-- Stats Row - REMOVED Earnings and Orders Completed -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
                    <div style="background: #1e293b; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="color: #fbbf24; font-size: 1.8rem; font-weight: bold;">${profile.service_count || 0}</div>
                        <div style="color: #94a3b8; font-size: 0.8rem; margin-top: 5px;">Services Offered</div>
                    </div>
                    <div style="background: #1e293b; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="color: #fbbf24; font-size: 1.8rem; font-weight: bold;">${profile.hourly_rate ? `$${profile.hourly_rate}` : '$0'}</div>
                        <div style="color: #94a3b8; font-size: 0.8rem; margin-top: 5px;">Hourly Rate</div>
                    </div>
                    <div style="background: #1e293b; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="color: #fbbf24; font-size: 1.8rem; font-weight: bold;">${profile.review_count || 0}</div>
                        <div style="color: #94a3b8; font-size: 0.8rem; margin-top: 5px;">Total Reviews</div>
                    </div>
                </div>
                
                <!-- Main Content Two-Column Layout -->
                <div style="display: grid; grid-template-columns: 1fr 300px; gap: 25px;">
                    <!-- Left Column - Main Info -->
                    <div>
                        <!-- About Section -->
                        ${profile.description ? `
                            <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                                <h4 style="color: #ffffff; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-user" style="color: #3b82f6;"></i> About Me
                                </h4>
                                <p style="color: #cbd5e1; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(profile.description)}</p>
                            </div>
                        ` : ''}
                        
                        <!-- Skills Section -->
                        ${skillsList.length > 0 ? `
                            <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                                <h4 style="color: #ffffff; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-code" style="color: #3b82f6;"></i> Skills & Expertise
                                </h4>
                                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                                    ${skillsList.map(skill => `
                                        <span style="background: rgba(59,130,246,0.15); color: #3b82f6; padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; border: 1px solid rgba(59,130,246,0.3);">
                                            ${escapeHtml(skill)}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Languages Section -->
                        ${languagesList.length > 0 ? `
                            <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                                <h4 style="color: #ffffff; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-language" style="color: #3b82f6;"></i> Languages
                                </h4>
                                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                                    ${languagesList.map(lang => `
                                        <span style="background: rgba(139,92,246,0.15); color: #a78bfa; padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; border: 1px solid rgba(139,92,246,0.3);">
                                            ${escapeHtml(lang)}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Certificates Section -->
                        ${certificates.length > 0 ? `
                            <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                                <h4 style="color: #ffffff; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-certificate" style="color: #fbbf24;"></i> Certificates
                                </h4>
                                <div style="display: flex; flex-wrap: wrap; gap: 15px;">
                                    ${certificates.map((cert, idx) => `
                                        <div style="width: 100px; cursor: pointer; text-align: center;" onclick="openCertificateViewer('${cert}', ${idx})">
                                            <div style="width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: #0f172a;">
                                                <img src="${cert}" style="width: 100%; height: 100%; object-fit: cover;" 
                                                     onerror="this.src='https://placehold.co/100x100/1e293b/3b82f6/png?text=Certificate'">
                                            </div>
                                            <span style="font-size: 0.7rem; color: #94a3b8; margin-top: 5px; display: block;">Certificate ${idx + 1}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Right Column - Sidebar Info -->
                    <div>
                        <!-- Availability Status -->
                        <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                            <h4 style="color: #ffffff; margin-bottom: 15px; font-size: 1rem; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-clock" style="color: #3b82f6;"></i> Availability
                            </h4>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-circle" style="font-size: 0.6rem; color: ${profile.availability === 'available' ? '#10b981' : profile.availability === 'busy' ? '#f59e0b' : '#ef4444'};"></i>
                                <span style="color: #e2e8f0; font-weight: 500;">
                                    ${profile.availability === 'available' ? 'Available for Work' : 
                                      profile.availability === 'busy' ? 'Currently Busy' : 'Not Available'}
                                </span>
                            </div>
                        </div>
                        
                        <!-- Contact Information -->
                        <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                            <h4 style="color: #ffffff; margin-bottom: 15px; font-size: 1rem; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-address-card" style="color: #3b82f6;"></i> Contact Info
                            </h4>
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                ${profile.location ? `
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <i class="fas fa-map-marker-alt" style="width: 20px; color: #fbbf24;"></i>
                                        <span style="color: #cbd5e1;">${escapeHtml(profile.location)}</span>
                                    </div>
                                ` : ''}
                                ${profile.email ? `
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <i class="fas fa-envelope" style="width: 20px; color: #fbbf24;"></i>
                                        <span style="color: #cbd5e1; word-break: break-all;">${escapeHtml(profile.email)}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        
                        <!-- Member Since -->
                        <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                            <h4 style="color: #ffffff; margin-bottom: 15px; font-size: 1rem; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-calendar-alt" style="color: #3b82f6;"></i> Member Since
                            </h4>
                            <p style="color: #cbd5e1;">${profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div style="display: flex; gap: 15px; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <button class="btn btn-primary" onclick="checkAndStartConversation(null, ${userId}); closeModal(document.getElementById('freelancerProfileModal'));" style="flex: 1; padding: 14px;">
                        <i class="fas fa-comments"></i> Send Message
                    </button>
                    <button class="btn btn-secondary" onclick="closeModal(document.getElementById('freelancerProfileModal'));" style="flex: 1; padding: 14px;">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        `;
        
        const modal = document.getElementById('freelancerProfileModal');
        const content = document.getElementById('freelancerProfileContent');
        
        if (modal && content) {
            content.innerHTML = modalContent;
            openModal(modal);
        } else {
            showToast(`${profile.username}'s profile loaded`, 'success');
        }
        
    } catch (err) {
        console.error("Error loading profile:", err);
        showToast("Error loading profile: " + err.message, "error");
    }
}
function startConversationWithFreelancer(userId, username) {
    if (!currentUser) {
        showToast("Please login to start a conversation", "warning");
        openModal($('loginModal'));
        return;
    }

    if (parseInt(currentUser.id) === parseInt(userId)) {
        showToast("You cannot start a conversation with yourself", "warning");
        return;
    }

    showToast(`Starting conversation with ${username}...`, "info");
    startConversationWithService(null, userId);
}

async function startConversationWithService(serviceId, freelancerId) {
    try {
        if (!currentUser) {
            showToast("Please login to start a conversation", "warning");
            openModal($('loginModal'));
            return;
        }

        if (parseInt(currentUser.id) === parseInt(freelancerId)) {
            showToast("You cannot message yourself", "warning");
            return;
        }

        if (!serviceId) {
            try {
                const servicesRes = await fetch(`/api/services?user_id=${freelancerId}&limit=1`, {
                    credentials: 'include'
                });
                
                if (servicesRes.ok) {
                    const servicesData = await servicesRes.json();
                    const services = servicesData.services || servicesData;
                    
                    if (services && services.length > 0) {
                        serviceId = services[0].id;
                    }
                }
            } catch (e) {
                console.error("Error fetching freelancer services:", e);
            }
        }

        if (!serviceId) {
            const res = await fetch("/api/conversations/start-without-service", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    recipient_id: parseInt(freelancerId)
                })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.error && data.error.includes('not found')) {
                    showToast("Cannot start conversation: No services available from this freelancer", "error");
                    return;
                }
                showToast(data.error || "Failed to start conversation", "error");
                return;
            }

            if (!data.conversation_id) {
                showToast("Failed to get conversation ID from server", "error");
                return;
            }

            window.activeConversationId = data.conversation_id;
            window.activeConversationUserId = freelancerId;

            let username = 'Freelancer';
            try {
                const userRes = await fetch(`/api/users/${freelancerId}/profile`, {
                    credentials: 'include'
                });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    username = userData.username || 'Freelancer';
                }
            } catch (e) {
                console.error("Error fetching username:", e);
            }

            showToast("✅ Conversation started!", "success");
            showInboxAndOpenConversation(data.conversation_id, username, freelancerId);
            return;
        }

        const res = await fetch("/api/conversations/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                service_id: parseInt(serviceId),
                recipient_id: parseInt(freelancerId)
            })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || "Failed to start conversation", "error");
            return;
        }

        if (!data.conversation_id) {
            showToast("Failed to get conversation ID from server", "error");
            return;
        }

        window.activeConversationId = data.conversation_id;
        window.activeConversationUserId = freelancerId;

        let username = 'Freelancer';
        try {
            const userRes = await fetch(`/api/users/${freelancerId}/profile`, {
                credentials: 'include'
            });
            if (userRes.ok) {
                const userData = await userRes.json();
                username = userData.username || 'Freelancer';
            }
        } catch (e) {
            console.error("Error fetching username:", e);
        }

        showToast("✅ Conversation started!", "success");
        showInboxAndOpenConversation(data.conversation_id, username, freelancerId);

    } catch (err) {
        console.error("Start conversation error:", err);
        showToast("Failed to start conversation. Please try again.", "error");
    }
}

function showInboxAndOpenConversation(conversationId, username, userId) {
    hideAllPages();

    const inboxPage = $('inboxPage');
    if (inboxPage) {
        inboxPage.classList.remove('hidden');
    }

    window.activeConversationId = conversationId;
    window.activeConversationUserId = userId;

    const sendMessageForm = $('sendMessageForm');
    if (sendMessageForm) {
        sendMessageForm.dataset.conversationId = conversationId;
    }

    setupMessageForm();

    loadConversations().then(() => {
        setTimeout(() => {
            openConversation(conversationId, username, userId);
            setTimeout(() => {
                loadConversations();
            }, 1000);
        }, 200);
    });
}

async function sendMessage(e) {
    e.preventDefault();
 if (currentlyEditingMessageId) {
        cancelEdit(currentlyEditingMessageId);
        currentlyEditingMessageId = null;
    }
    let conversationId = window.activeConversationId;
    const form = $('sendMessageForm');
    const input = $('messageInput');
    const sendButton = form ? form.querySelector('button[type="submit"]') : null;
    
    if (!conversationId && form) {
        conversationId = form.dataset.conversationId;
    }
    
    if (!conversationId) {
        showToast("No active conversation", "error");
        return;
    }

    const textMessage = input.value.trim();
    
    if (!textMessage && !selectedFile) {
        showToast("Please enter a message or select an image", "error");
        return;
    }

    input.disabled = true;
    if (sendButton) sendButton.disabled = true;
    
    const originalPlaceholder = input.placeholder;
    input.placeholder = "Sending...";

    const originalButtonText = sendButton ? sendButton.innerHTML : '';
    if (sendButton) {
        sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        let response;
        let responseData;
        
        if (selectedFile) {
            const formData = new FormData();
            formData.append('conversation_id', conversationId);
            formData.append('message', textMessage);
            formData.append('image', selectedFile);
            
            response = await fetch("/api/messages/send-with-image", {
                method: "POST",
                credentials: "include",
                body: formData
            });
            
        } else {
            response = await fetch("/api/messages/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    conversation_id: parseInt(conversationId),
                    message: textMessage
                })
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            showToast(`Server error: ${response.status}`, "error");
            return;
        }

        responseData = await response.json();

        if (!responseData.success) {
            showToast(responseData.error || "Failed to send message", "error");
            return;
        }

        input.value = "";
        clearSelectedFile();
        updateCharCount();

        if (responseData.data) {
            appendMessageToChat(responseData.data);
        }
        
        await loadConversations();
        checkUnreadMessages();

        input.focus();

    } catch (err) {
        console.error("Send message error:", err);
        showToast("Message sending failed: " + err.message, "error");
    } finally {
        input.disabled = false;
        input.placeholder = originalPlaceholder;
        if (sendButton) {
            sendButton.disabled = false;
            sendButton.innerHTML = originalButtonText || '<i class="fas fa-paper-plane"></i>';
        }
    }
}

function appendMessageToChat(message) {
    const container = $('messagesContainer');
    if (!container) return;

    if (container.children.length === 1 && container.children[0].textContent.includes('No messages yet')) {
        container.innerHTML = '';
    }

    const messageData = {
        id: message.id || Date.now(),
        sender_id: message.sender_id || currentUser?.id,
        sender_name: message.sender_name || (message.sender_id === currentUser?.id ? 'You' : 'User'),
        message: message.message || message.text || '',
        image_url: message.image_url,
        created_at: message.created_at || new Date().toISOString()
    };

    const isMe = messageData.sender_id === currentUser?.id;
    const messageDate = new Date(messageData.created_at);
    const fiveMinutesAgo = new Date(messageDate.getTime() - 300000);

    const lastGroup = container.lastElementChild;
    
    if (lastGroup && lastGroup.classList.contains('message-group')) {
        const lastGroupIsMe = lastGroup.classList.contains('sent');
        const lastMessageTime = lastGroup.lastMessageTime ? new Date(lastGroup.lastMessageTime) : null;
        
        if (lastGroupIsMe === isMe && lastMessageTime && lastMessageTime > fiveMinutesAgo) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isMe ? 'sent' : 'received'}`;
            messageDiv.dataset.messageId = messageData.id;

            const timeString = messageDate.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });

            let contentHtml = '';
            
            if (messageData.image_url) {
    let imageUrl = messageData.image_url;
    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        imageUrl = '/' + imageUrl;
    }
    
    contentHtml += `
        <div class="message-image">
            <img src="${imageUrl}" alt="Shared image" 
                 onclick="openImageViewer('${imageUrl}')" 
                 loading="lazy"
                 style="max-width: 150px; max-height: 120px; border-radius: 10px; cursor: pointer; object-fit: cover;"
                 onerror="this.onerror=null; this.src='https://placehold.co/400x250/1e293b/3b82f6/png?text=Image+Not+Found';">
        </div>
    `;
}
            
            if (messageData.message && messageData.message !== '📷 Sent an image') {
                contentHtml += `<div class="message-text">${escapeHtml(messageData.message)}</div>`;
            } else if (messageData.image_url && !messageData.message) {
                contentHtml += `<div class="message-text" style="opacity: 0.7; font-style: italic;">Sent an image</div>`;
            }

            messageDiv.innerHTML = `
                ${contentHtml}
                <div class="message-time">${timeString}</div>
            `;

            lastGroup.appendChild(messageDiv);
            lastGroup.lastMessageTime = messageData.created_at;
            container.scrollTop = container.scrollHeight;
            return;
        }
    }

    const groupDiv = document.createElement('div');
    groupDiv.className = `message-group ${isMe ? 'sent' : 'received'}`;
    groupDiv.lastMessageTime = messageData.created_at;
    
    if (!isMe) {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-group-header';
        headerDiv.textContent = messageData.sender_name;
        groupDiv.appendChild(headerDiv);
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMe ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = messageData.id;

    const timeString = messageDate.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });

    let contentHtml = '';
    
    if (messageData.image_url) {
        let imageUrl = messageData.image_url;
        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
            imageUrl = '/' + imageUrl;
        }
        
        contentHtml += `
            <div class="message-image">
                <img src="${imageUrl}" alt="Shared image" 
                     onclick="openImageViewer('${imageUrl}')" 
                     style="max-width: 250px; max-height: 200px; border-radius: 8px; cursor: pointer; margin-bottom: 5px; border: 2px solid rgba(255,255,255,0.1);"
                     onerror="this.onerror=null; this.src='/placeholder-image.png'; this.style.opacity='0.5';">
            </div>
        `;
    }
    
    if (messageData.message && messageData.message !== '📷 Sent an image') {
        contentHtml += `<div class="message-text">${escapeHtml(messageData.message)}</div>`;
    } else if (messageData.image_url && !messageData.message) {
        contentHtml += `<div class="message-text" style="opacity: 0.7; font-style: italic;">Sent an image</div>`;
    }

    messageDiv.innerHTML = `
        ${contentHtml}
        <div class="message-time">${timeString}</div>
    `;

    groupDiv.appendChild(messageDiv);
    container.appendChild(groupDiv);
    container.scrollTop = container.scrollHeight;
}

function setupMessageForm() {
    const form = $('sendMessageForm');
    const input = $('messageInput');

    if (!form || !input) {
        console.error("Message form elements not found");
        return;
    }

    if (form.dataset.bound === "true" && form.submitHandler) {
        form.removeEventListener('submit', form.submitHandler);
    }

    const messageInputArea = $('messageInputArea');
    if (window.activeConversationId && messageInputArea) {
        messageInputArea.style.display = 'block';
    }

    form.submitHandler = sendMessage;

    form.addEventListener('submit', form.submitHandler);
    form.dataset.bound = "true";

    input.removeEventListener('keydown', handleMessageKeydown);
    input.addEventListener('keydown', handleMessageKeydown);
}

function handleMessageKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const form = $('sendMessageForm');
        if (form) {
            form.dispatchEvent(new Event('submit'));
        }
    }
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function updateCharCount() {
    const input = $('messageInput');
    const charCount = $('charCount');
    if (!input || !charCount) return;
    const len = input.value.length;
    charCount.textContent = `${len}/1000`;
    charCount.style.color = len > 900 ? '#ff4444' : 'var(--text-gray)';
}

function clearSelectedFile() {
    selectedFile = null;
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
    }
    const preview = document.getElementById('imagePreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
}

function openImageViewer(imageUrl) {
    const existingViewer = document.querySelector('.image-viewer-modal');
    if (existingViewer) {
        existingViewer.remove();
    }
    
    const viewer = document.createElement('div');
    viewer.className = 'image-viewer-modal';
    
    viewer.innerHTML = `
        <div class="image-viewer-content">
            <img src="${imageUrl}" alt="Full size image">
            <button class="image-viewer-close" onclick="this.closest('.image-viewer-modal').remove()">
                <i class="fas fa-times"></i>
            </button>
            <a href="${imageUrl}" download class="image-viewer-download" onclick="event.stopPropagation()">
                <i class="fas fa-download"></i>
            </a>
        </div>
    `;
    
    viewer.addEventListener('click', function(e) {
        if (e.target === viewer) {
            viewer.remove();
        }
    });
    
    document.body.appendChild(viewer);
}

/*********************
 *  Unread Messages *
 *********************/
async function checkUnreadMessages() {
    if (!currentUser) return;

    try {
        const res = await fetch("/api/messages/unread-count", {
            credentials: "include"
        });

        if (!res.ok) {
            return;
        }

        const data = await res.json();
        const badge = document.getElementById("inboxBadge");

        if (!badge) {
            return;
        }

        if (data.count > 0) {
            badge.textContent = data.count;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    } catch (err) {
        console.error("Error checking unread messages:", err);
    }
}

function startMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
    }

    let lastConversationCount = 0;
    let lastMessageCount = {};
    let connectionErrorCount = 0;

    messagePollingInterval = setInterval(async () => {
        if (!currentUser) return;

        const inboxPage = $('inboxPage');
        if (!inboxPage || inboxPage.classList.contains('hidden')) return;

        try {
            const convRes = await fetch("/api/messages/conversations", {
                credentials: "include"
            });

            if (!convRes.ok) {
                throw new Error(`HTTP error! status: ${convRes.status}`);
            }

            connectionErrorCount = 0;

            const conversations = await convRes.json();
            const currentCount = conversations.length;

            if (currentCount !== lastConversationCount) {
                await loadConversations();
                lastConversationCount = currentCount;
            }

            if (window.activeConversationId) {
                const msgRes = await fetch(`/api/messages/${window.activeConversationId}`, {
                    credentials: "include"
                });

                if (msgRes.ok) {
                    const messages = await msgRes.json();
                    const currentMsgCount = messages.length;
                    const lastCount = lastMessageCount[window.activeConversationId] || 0;

                    if (currentMsgCount > lastCount) {
                        await loadMessagesForConversation(window.activeConversationId);

                        await fetch("/api/messages/mark-read", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ conversation_id: window.activeConversationId })
                        });

                        await loadConversations();
                    }

                    lastMessageCount[window.activeConversationId] = currentMsgCount;
                }
            }

            checkUnreadMessages();

        } catch (e) {
            connectionErrorCount++;
            console.error(`Error in polling (attempt ${connectionErrorCount}):`, e.message);
        }
    }, 5000);
}

function stopMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
        messagePollingInterval = null;
    }
}
// ============================================
// MESSAGE CLICK HANDLER - Shows edit/delete options
// ============================================

// Track currently active message
let activeMessageElement = null;

// Handle message click/tap
function setupMessageClickHandler() {
    // Use event delegation on messages container
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    // Remove existing listener if any
    messagesContainer.removeEventListener('click', handleMessageClick);
    messagesContainer.addEventListener('click', handleMessageClick);
}

function handleMessageClick(e) {
    // Find the clicked message element
    let targetMessage = e.target.closest('.message');
    if (!targetMessage) return;
    
    // Prevent triggering if clicking on action buttons
    if (e.target.closest('.message-action-btn')) {
        return;
    }
    
    // Prevent triggering if clicking on edit container elements
    if (e.target.closest('.message-edit-container')) {
        return;
    }
    
    // If there's an active message and it's not this one, deactivate it
    if (activeMessageElement && activeMessageElement !== targetMessage) {
        deactivateMessage(activeMessageElement);
    }
    
    // Toggle active state on clicked message
    if (activeMessageElement === targetMessage) {
        // Same message clicked again - hide options
        deactivateMessage(targetMessage);
        activeMessageElement = null;
    } else {
        // New message clicked - show options
        activateMessage(targetMessage);
        activeMessageElement = targetMessage;
        
        // Auto-hide after 5 seconds on mobile (optional)
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                if (activeMessageElement === targetMessage) {
                    deactivateMessage(targetMessage);
                    activeMessageElement = null;
                }
            }, 5000);
        }
    }
}

function activateMessage(messageElement) {
    messageElement.classList.add('active-message');
    
    // Get message data
    const messageId = messageElement.dataset.messageId;
    const isOwnMessage = messageElement.classList.contains('sent');
    const messageText = messageElement.querySelector('.message-text')?.textContent || '';
    const isDeleted = messageElement.classList.contains('message-deleted');
    const isEdited = messageElement.querySelector('.edited-label') !== null;
    const timeSinceSent = getTimeSinceSent(messageElement);
    const canEdit = isOwnMessage && !isDeleted && timeSinceSent <= 30; // 30 minutes edit window
    
    // Build action buttons dynamically
    const actionsContainer = messageElement.querySelector('.message-actions');
    if (actionsContainer) {
        // Update existing actions container
        actionsContainer.innerHTML = buildActionButtons(messageId, messageText, isOwnMessage, isDeleted, canEdit, isEdited);
        
        // Attach event listeners to new buttons
        attachActionButtonListeners(actionsContainer, messageId, messageText);
    } else {
        // Create actions container if it doesn't exist
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = buildActionButtons(messageId, messageText, isOwnMessage, isDeleted, canEdit, isEdited);
        messageElement.appendChild(actionsDiv);
        
        // Attach event listeners
        attachActionButtonListeners(actionsDiv, messageId, messageText);
    }
}

function deactivateMessage(messageElement) {
    messageElement.classList.remove('active-message');
    
    // Don't remove actions, just hide them (CSS handles visibility)
    // This way they can reappear quickly if needed
}

function buildActionButtons(messageId, messageText, isOwnMessage, isDeleted, canEdit, isEdited) {
    if (isDeleted) {
        // Deleted messages only show copy button if there's text
        if (messageText && messageText !== '[message deleted]' && messageText !== '[you deleted this message]') {
            return `<button class="message-action-btn copy-btn" data-message-id="${messageId}" data-message-text="${escapeHtml(messageText)}" title="Copy">
                        <i class="fas fa-copy"></i>
                    </button>`;
        }
        return '';
    }
    
    let buttons = '';
    
    // Copy button (always shown for non-deleted messages)
    buttons += `<button class="message-action-btn copy-btn" data-message-id="${messageId}" data-message-text="${escapeHtml(messageText)}" title="Copy">
                    <i class="fas fa-copy"></i>
                </button>`;
    
    // Edit button (only for own messages within time limit)
    if (isOwnMessage && canEdit) {
        buttons += `<button class="message-action-btn edit-btn" data-message-id="${messageId}" data-message-text="${escapeHtml(messageText)}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>`;
    }
    
    // Delete button (only for own messages)
    if (isOwnMessage) {
        buttons += `<button class="message-action-btn delete-btn" data-message-id="${messageId}" title="Delete">
                        <i class="fas fa-trash-alt"></i>
                    </button>`;
    }
    
    // Edit history button (only for edited messages that aren't deleted)
    if (isEdited && !isDeleted) {
        buttons += `<button class="message-action-btn history-btn" data-message-id="${messageId}" title="View Edit History">
                        <i class="fas fa-history"></i>
                    </button>`;
    }
    
    return buttons;
}

function attachActionButtonListeners(container, messageId, messageText) {
    // Copy button
    const copyBtn = container.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            const text = copyBtn.dataset.messageText || messageText;
            copyMessageToClipboard(text, copyBtn);
        };
    }
    
    // Edit button
    const editBtn = container.querySelector('.edit-btn');
    if (editBtn) {
        editBtn.onclick = (e) => {
            e.stopPropagation();
            const messageDiv = document.querySelector(`.message[data-message-id="${messageId}"]`);
            const text = editBtn.dataset.messageText || messageText;
            startEditMessage(messageId, text, messageDiv);
            // Deactivate after starting edit
            if (activeMessageElement) {
                deactivateMessage(activeMessageElement);
                activeMessageElement = null;
            }
        };
    }
    
    // Delete button
    const deleteBtn = container.querySelector('.delete-btn');
    if (deleteBtn) {
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            confirmDeleteMessage(messageId, deleteBtn);
            // Deactivate after delete
            if (activeMessageElement) {
                deactivateMessage(activeMessageElement);
                activeMessageElement = null;
            }
        };
    }
    
    // History button
    const historyBtn = container.querySelector('.history-btn');
    if (historyBtn) {
        historyBtn.onclick = (e) => {
            e.stopPropagation();
            viewEditHistory(messageId);
        };
    }
}

function getTimeSinceSent(messageElement) {
    const timeElement = messageElement.querySelector('.message-time');
    if (!timeElement) return 0;
    
    // Extract time string and parse
    const timeText = timeElement.textContent;
    // This is simplified - you may want to store timestamp in data attribute
    const messageDate = new Date(messageElement.dataset.createdAt || Date.now());
    const now = new Date();
    return (now - messageDate) / (1000 * 60);
}

function copyMessageToClipboard(text, buttonElement) {
    const textToCopy = text.replace(/<[^>]*>/g, '');
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalIcon = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-check"></i>';
        buttonElement.style.background = '#10b981';
        showToast("✓ Copied!", "success");
        
        setTimeout(() => {
            buttonElement.innerHTML = originalIcon;
            buttonElement.style.background = '';
        }, 1500);
    }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast("✓ Copied!", "success");
    });
}

function startEditMessage(messageId, currentText, messageDiv) {
    const messageTextDiv = messageDiv.querySelector('.message-text');
    if (!messageTextDiv) return;
    
    const isMobile = window.innerWidth <= 768;
    const originalText = currentText;
    
    // Hide actions
    const actionsContainer = messageDiv.querySelector('.message-actions');
    if (actionsContainer) actionsContainer.style.display = 'none';
    
    // Create edit UI
    const editHtml = `
        <div class="message-edit-container" style="width: 100%;">
            <textarea class="message-edit-input" rows="${isMobile ? '3' : '2'}" 
                      style="width: 100%; padding: ${isMobile ? '14px' : '10px'}; background: var(--chat-input); border: 2px solid var(--accent-blue); border-radius: 12px; color: var(--text-light); font-size: ${isMobile ? '1rem' : '0.9rem'}; resize: vertical; font-family: inherit;">${escapeHtml(originalText)}</textarea>
            <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end;">
                <button class="btn btn-secondary btn-sm cancel-edit-btn" style="padding: ${isMobile ? '10px 16px' : '6px 12px'};">
                    Cancel
                </button>
                <button class="btn btn-primary btn-sm save-edit-btn" style="padding: ${isMobile ? '10px 16px' : '6px 12px'};">
                    Save
                </button>
            </div>
        </div>
    `;
    
    messageTextDiv.style.display = 'none';
    messageTextDiv.insertAdjacentHTML('afterend', editHtml);
    
    const textarea = messageDiv.querySelector('.message-edit-input');
    if (textarea) {
        textarea.focus();
        if (isMobile) setTimeout(() => textarea.focus(), 300);
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    
    // Handle cancel
    const cancelBtn = messageDiv.querySelector('.cancel-edit-btn');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            const editContainer = messageDiv.querySelector('.message-edit-container');
            if (editContainer) editContainer.remove();
            messageTextDiv.style.display = 'block';
            if (actionsContainer) actionsContainer.style.display = 'flex';
        };
    }
    
    // Handle save
    const saveBtn = messageDiv.querySelector('.save-edit-btn');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const newMessage = textarea.value.trim();
            if (!newMessage) {
                showToast("Message cannot be empty", "warning");
                return;
            }
            
            showToast("Saving...", "info");
            
            try {
                const response = await fetch(`/api/messages/${messageId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ message: newMessage })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    showToast("✅ Message edited", "success");
                    messageTextDiv.innerHTML = escapeHtml(newMessage);
                    messageTextDiv.style.display = 'block';
                    
                    // Add edited label
                    let editedLabel = messageDiv.querySelector('.edited-label');
                    if (!editedLabel) {
                        editedLabel = document.createElement('span');
                        editedLabel.className = 'edited-label';
                        editedLabel.style.fontSize = '0.65rem';
                        editedLabel.style.opacity = '0.6';
                        editedLabel.style.marginLeft = '8px';
                        editedLabel.textContent = '(edited)';
                        const timeDiv = messageDiv.querySelector('.message-time');
                        if (timeDiv) timeDiv.appendChild(editedLabel);
                    }
                    
                    const editContainer = messageDiv.querySelector('.message-edit-container');
                    if (editContainer) editContainer.remove();
                    if (actionsContainer) actionsContainer.style.display = 'flex';
                } else {
                    showToast(data.error || "Failed to edit", "error");
                }
            } catch (err) {
                showToast("Error editing message", "error");
            }
        };
    }
}

function confirmDeleteMessage(messageId, buttonElement) {
    const isMobile = window.innerWidth <= 768;
    
    // Create custom modal
    const modalHtml = `
        <div id="deleteConfirmModal" class="modal" style="display: flex; z-index: 10001;">
            <div class="modal-card" style="max-width: 350px; padding: 25px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <i class="fas fa-trash-alt" style="font-size: 3rem; color: #ef4444; margin-bottom: 15px;"></i>
                    <h3 style="color: var(--text-light);">Delete Message?</h3>
                    <p style="color: var(--text-gray); margin: 10px 0;">This action cannot be undone.</p>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(239,68,68,0.1); border-radius: 8px; cursor: pointer;">
                        <input type="radio" name="deleteOption" value="everyone" checked>
                        <div>
                            <strong style="color: var(--text-light);">Delete for everyone</strong>
                            <p style="color: var(--text-gray); font-size: 0.8rem; margin: 0;">Removed for all participants</p>
                        </div>
                    </label>
                    <label style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top: 10px; cursor: pointer;">
                        <input type="radio" name="deleteOption" value="self">
                        <div>
                            <strong style="color: var(--text-light);">Delete for me only</strong>
                            <p style="color: var(--text-gray); font-size: 0.8rem; margin: 0;">Only you see "[deleted]"</p>
                        </div>
                    </label>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-secondary" id="cancelDeleteBtn" style="flex: 1; padding: 12px;">Cancel</button>
                    <button class="btn btn-danger" id="confirmDeleteBtn" style="flex: 1; padding: 12px;">Delete</button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('deleteConfirmModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('deleteConfirmModal');
    
    document.getElementById('cancelDeleteBtn').onclick = () => modal.remove();
    
    document.getElementById('confirmDeleteBtn').onclick = async () => {
        const deleteOption = document.querySelector('input[name="deleteOption"]:checked').value;
        const deleteForEveryone = deleteOption === 'everyone';
        
        modal.remove();
        showToast("Deleting...", "info");
        
        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ delete_for_everyone: deleteForEveryone })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                showToast(data.message, "success");
                
                const messageDiv = buttonElement.closest('.message');
                
                if (deleteForEveryone) {
                    const messageTextDiv = messageDiv.querySelector('.message-text');
                    if (messageTextDiv) {
                        messageTextDiv.textContent = "[message deleted]";
                        messageTextDiv.style.fontStyle = "italic";
                        messageTextDiv.style.opacity = "0.6";
                    }
                    messageDiv.classList.add('message-deleted');
                } else {
                    const messageGroup = messageDiv.closest('.message-group');
                    if (messageGroup && messageGroup.children.length === 2) {
                        messageGroup.remove();
                    } else {
                        messageDiv.remove();
                    }
                }
                
                if (activeMessageElement === messageDiv) {
                    deactivateMessage(messageDiv);
                    activeMessageElement = null;
                }
            } else {
                showToast(data.error || "Failed to delete", "error");
            }
        } catch (err) {
            showToast("Error deleting message", "error");
        }
    };
    
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}
/*********************
 *  New Conversation Modal *
 *********************/
function startNewConversation() {
    openModal($('newConversationModal'));
}

function closeNewConversationModal() {
    closeModal($('newConversationModal'));
}

async function performUserSearch() {
    const searchInput = document.getElementById('userSearch');
    if (!searchInput) return;
    
    const query = searchInput.value.trim();
    if (query.length < 2) {
        document.getElementById('userSearchResults').innerHTML = '<p style="color: var(--text-gray); padding: 20px; text-align: center;">Type at least 2 characters to search</p>';
        return;
    }

    const resultsDiv = document.getElementById('userSearchResults');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = '<p style="color: var(--text-gray); padding: 20px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Searching...</p>';

    try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const users = await res.json();
        const userList = Array.isArray(users) ? users : [];
        
        if (userList.length === 0) {
            resultsDiv.innerHTML = '<p style="color: var(--text-gray); padding: 20px; text-align: center;">No users found</p>';
        } else {
            resultsDiv.innerHTML = userList.map(user => {
                const username = user.username || 'User';
                const userId = user.id;
                const initial = username.charAt(0).toUpperCase();
                
                return `
                    <div onclick="startConversationWithUser(${userId}, '${escapeHtml(username)}')" 
                         style="display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: var(--transition);"
                         onmouseover="this.style.background='rgba(255,255,255,0.05)'"
                         onmouseout="this.style.background='transparent'">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.2rem;">
                            ${initial}
                        </div>
                        <div>
                            <div style="color: var(--text-light); font-weight: 600;">${escapeHtml(username)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('User search error:', error);
        resultsDiv.innerHTML = '<p style="color: #ef4444; padding: 20px; text-align: center;">Error searching users. Please try again.</p>';
    }
}
async function startConversationWithUser(userId, username) {
    if (!currentUser) {
        showToast('Please login first', 'warning');
        openModal($('loginModal'));
        return;
    }

    if (parseInt(currentUser.id) === parseInt(userId)) {
        showToast('You cannot start a conversation with yourself', 'warning');
        return;
    }

    closeNewConversationModal();

    try {
        const servicesRes = await fetch(`/api/services?user_id=${userId}`, {
            credentials: 'include'
        });
        const services = await servicesRes.json();

        let serviceId = null;

        if (services && services.length > 0) {
            serviceId = services[0].id;
        } else {
            showToast('This user has no services to message about', 'error');
            return;
        }

        const res = await fetch("/api/conversations/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                service_id: parseInt(serviceId),
                recipient_id: parseInt(userId)
            })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Failed to start conversation', 'error');
            return;
        }

        window.activeConversationId = data.conversation_id;
        window.activeConversationUserId = userId;

        showToast('✅ Conversation started!', 'success');
        showInboxAndOpenConversation(data.conversation_id, username, userId);

    } catch (error) {
        console.error('Start conversation error:', error);
        showToast('Failed to start conversation', 'error');
    }
}

// Add to products.html - Product Actions
async function addToCart(productId) {
    if (!currentUser) {
        showToast('Please login to add items to cart', 'warning');
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    try {
        const response = await fetch('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ productId, quantity: 1 })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('✅ Added to cart!', 'success');
            updateCartCount();
        } else {
            showToast(data.error || 'Failed to add to cart', 'error');
        }
    } catch (err) {
        console.error('Add to cart error:', err);
        showToast('Error adding to cart', 'error');
    }
}

async function buyNow(productId) {
    if (!currentUser) {
        showToast('Please login to purchase', 'warning');
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    try {
        const response = await fetch('/api/products/' + productId, {
            credentials: 'include'
        });
        
        const product = await response.json();
        
        // Show order modal or redirect to checkout
        showOrderModal(product);
    } catch (err) {
        console.error('Buy now error:', err);
        showToast('Error processing purchase', 'error');
    }
}

function showOrderModal(product) {
    const modal = document.getElementById('orderModal');
    const content = document.getElementById('orderContent');
    
    if (modal && content) {
        content.innerHTML = `
            <h3>${escapeHtml(product.title)}</h3>
            <p>Price: $${product.price}</p>
            <div class="form-group">
                <label>Quantity</label>
                <input type="number" id="orderQuantity" value="1" min="1" max="99">
            </div>
            <div class="form-group">
                <label>Shipping Address</label>
                <textarea id="shippingAddress" placeholder="Enter your full address"></textarea>
            </div>
            <button class="btn btn-primary" onclick="placeOrder(${product.id})">Place Order</button>
        `;
        openModal(modal);
    }
}
// ==================== INBOX ATTACHMENTS & EMOJI PICKER ====================


// ==================== INBOX ATTACHMENTS & EMOJI PICKER ====================

// Global variable for emoji picker instance
let emojiPickerInstance = null;
let selectedFile = null;

// Setup attach image button
function setupAttachButtons() {
    console.log("Setting up attach buttons...");
    
    const attachImageBtn = document.getElementById('attachImageBtn');
    
    // Create a hidden file input if it doesn't exist
    let fileInput = document.getElementById('fileInput');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'fileInput';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }
    
    // Setup attach image button
    if (attachImageBtn) {
        // Remove existing event listeners by cloning
        const newImageBtn = attachImageBtn.cloneNode(true);
        attachImageBtn.parentNode.replaceChild(newImageBtn, attachImageBtn);
        
        newImageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Image button clicked, opening file picker...");
            fileInput.click();
        });
    }
    
    // Handle file selection
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.type.startsWith('image/')) {
                selectedFile = file;
                showImagePreview(file);
                showToast('Image selected: ' + file.name, 'success');
            } else {
                showToast('Please select an image file (JPEG, PNG, GIF)', 'warning');
                fileInput.value = '';
            }
        }
    });
    
    // Setup document upload button
    const attachDocumentBtn = document.getElementById('attachDocumentBtn');
    if (attachDocumentBtn) {
        const newDocBtn = attachDocumentBtn.cloneNode(true);
        attachDocumentBtn.parentNode.replaceChild(newDocBtn, attachDocumentBtn);
        
        newDocBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Document button clicked");
            setupDocumentAttachment();
        });
    }
    
    // Setup generic attach file button (if exists)
    const attachFileBtn = document.getElementById('attachFileBtn');
    if (attachFileBtn) {
        const newFileBtn = attachFileBtn.cloneNode(true);
        attachFileBtn.parentNode.replaceChild(newFileBtn, attachFileBtn);
        
        newFileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showToast('File upload coming soon!', 'info');
        });
    }
}
let documentInput = null;

function setupDocumentAttachment() {
    console.log("Setting up document attachment...");
    
    // Create hidden file input for documents if it doesn't exist
    if (!documentInput) {
        documentInput = document.createElement('input');
        documentInput.type = 'file';
        documentInput.id = 'documentInput';
        documentInput.accept = '.pdf,.doc,.docx,.zip,.txt,.jpg,.png,.jpeg';
        documentInput.style.display = 'none';
        document.body.appendChild(documentInput);
        
        documentInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                console.log("File selected:", file.name);
                await sendDocument(file);
                documentInput.value = '';
            }
        });
    }
    
    // Trigger file picker
    documentInput.click();
}

async function sendDocument(file) {
    if (!window.activeConversationId) {
        showToast('No active conversation', 'warning');
        return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('File too large! Maximum 10MB', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('conversation_id', window.activeConversationId);
    formData.append('message', `📎 Sent a file: ${file.name}`);
    formData.append('file', file);
    
    showToast(`Uploading ${file.name}...`, 'info');
    
    try {
        const response = await fetch('/api/messages/send-with-file', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        const data = await response.json();
        if (response.ok) {
            showToast(`File "${file.name}" sent!`, 'success');
            if (typeof appendMessageToChat === 'function') {
                appendMessageToChat(data.data);
            }
        } else {
            showToast(data.error || 'Failed to send file', 'error');
        }
    } catch (error) {
        console.error('File send error:', error);
        showToast('Error sending file', 'error');
    }
}
// Setup emoji picker
function setupEmojiPicker() {
    const emojiBtn = document.getElementById('emojiPickerBtn');
    if (!emojiBtn) return;
    
    const newEmojiBtn = emojiBtn.cloneNode(true);
    emojiBtn.parentNode.replaceChild(newEmojiBtn, emojiBtn);
    
    newEmojiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleEmojiPickerExtended();
    });
}

// Create emoji picker element
function createEmojiPickerExtended() {
    const picker = document.createElement('div');
    picker.id = 'emojiPickerExtended';
    picker.className = 'emoji-picker-extended';
    picker.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 20px;
        background: #1e293b;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        padding: 15px;
        z-index: 10001;
        display: none;
        width: 450px;
        max-width: calc(100vw - 40px);
        max-height: 400px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        overflow: hidden;
    `;
    
    // Simplified emoji list for performance
    const commonEmojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💕', '💞', '💓', '💗', '💖', '💘', '👍', '👎', '👌', '✌️', '🤞', '👏', '🙏', '🤝', '👊', '✊', '💪'];
    
    picker.innerHTML = `
        <div style="padding: 5px;">
            <input type="text" id="emojiSearchInput" placeholder="Search emojis..." style="width: 100%; padding: 8px 12px; border-radius: 8px; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); color: white; margin-bottom: 10px;">
        </div>
        <div class="emoji-grid" style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; max-height: 280px; overflow-y: auto; padding: 5px;">
            ${commonEmojis.map(emoji => `<div class="emoji-item" data-emoji="${emoji}" style="font-size: 1.8rem; cursor: pointer; padding: 8px; text-align: center; border-radius: 10px; transition: all 0.2s;">${emoji}</div>`).join('')}
        </div>
    `;
    
    document.body.appendChild(picker);
    
    const grid = picker.querySelector('.emoji-grid');
    const searchInput = picker.querySelector('#emojiSearchInput');
    
    function filterEmojis(searchTerm) {
        const filtered = commonEmojis.filter(emoji => emoji.includes(searchTerm));
        grid.innerHTML = filtered.map(emoji => 
            `<div class="emoji-item" data-emoji="${emoji}" style="font-size: 1.8rem; cursor: pointer; padding: 8px; text-align: center; border-radius: 10px;">${emoji}</div>`
        ).join('');
        attachEmojiEvents();
    }
    
    function attachEmojiEvents() {
        grid.querySelectorAll('.emoji-item').forEach(item => {
            item.addEventListener('click', () => {
                const input = document.getElementById('messageInput');
                if (input) {
                    input.value += item.dataset.emoji;
                    if (typeof updateCharCount === 'function') updateCharCount();
                    input.focus();
                }
                picker.style.display = 'none';
            });
            
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                item.style.transform = 'scale(1.1)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = 'transparent';
                item.style.transform = 'scale(1)';
            });
        });
    }
    
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            filterEmojis(searchInput.value);
        }, 300);
    });
    
    attachEmojiEvents();
    
    // Close picker when clicking outside
    document.addEventListener('click', function closePicker(e) {
        if (picker && picker.style.display === 'block') {
            const emojiBtn = document.getElementById('emojiPickerBtn');
            if (!picker.contains(e.target) && emojiBtn && !emojiBtn.contains(e.target)) {
                picker.style.display = 'none';
                document.removeEventListener('click', closePicker);
            }
        }
    });
    
    return picker;
}

// Toggle emoji picker
function toggleEmojiPickerExtended() {
    if (!emojiPickerInstance) {
        emojiPickerInstance = createEmojiPickerExtended();
    }
    
    if (emojiPickerInstance.style.display === 'block') {
        emojiPickerInstance.style.display = 'none';
    } else {
        emojiPickerInstance.style.display = 'block';
    }
}

// Show image preview
function showImagePreview(file) {
    const previewContainer = document.getElementById('imagePreview');
    if (!previewContainer) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        previewContainer.innerHTML = `
            <div style="position: relative; display: inline-block; margin: 10px 0;">
                <img src="${e.target.result}" style="max-width: 150px; max-height: 120px; border-radius: 8px; border: 2px solid #3b82f6;">
                <button type="button" onclick="clearSelectedImage()" style="position: absolute; top: -10px; right: -10px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center;">×</button>
            </div>
        `;
        previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function clearSelectedImage() {
    selectedFile = null;
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('imagePreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
}

function setupImagePreview() {
    const preview = document.getElementById('imagePreview');
    if (preview) {
        preview.style.display = 'none';
    }
}

function setupDocumentUpload() {
    console.log('Document upload setup complete');
}

// Initialize all inbox features
function setupInboxAttachments() {
    console.log("Setting up inbox attachments...");
    setupAttachButtons();
    setupEmojiPicker();
    setupImagePreview();
    setupDocumentUpload();
}

// Update char count
function updateCharCount() {
    const input = document.getElementById('messageInput');
    const charCount = document.getElementById('charCount');
    if (input && charCount) {
        const len = input.value.length;
        charCount.textContent = `${len}/1000`;
        charCount.style.color = len > 900 ? '#ef4444' : '#94a3b8';
    }
}

// Make functions global
window.clearSelectedImage = clearSelectedImage;
window.toggleEmojiPickerExtended = toggleEmojiPickerExtended;

// Call this when inbox is opened
const originalShowInboxForAttachments = window.showInbox;
window.showInbox = function() {
    if (originalShowInboxForAttachments) originalShowInboxForAttachments();
    setTimeout(() => {
        setupInboxAttachments();
    }, 500);
};
async function placeOrder(productId) {
    const quantity = document.getElementById('orderQuantity')?.value || 1;
    const address = document.getElementById('shippingAddress')?.value;
    
    if (!address) {
        showToast('Please enter shipping address', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/physical-orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                productId,
                quantity: parseInt(quantity),
                deliveryAddress: address,
                deliveryPhone: currentUser?.phone || 'Not provided'
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('✅ Order placed successfully!', 'success');
            closeModal(document.getElementById('orderModal'));
            // Redirect to orders page
            setTimeout(() => {
                window.location.href = '/orders.html';
            }, 1500);
        } else {
            showToast(data.error || 'Failed to place order', 'error');
        }
    } catch (err) {
        console.error('Order error:', err);
        showToast('Error placing order', 'error');
    }
}

async function toggleFavorite(productId, buttonElement) {
    if (!currentUser) {
        showToast('Please login to favorite products', 'warning');
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    try {
        const response = await fetch('/api/favorites/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ productId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const icon = buttonElement.querySelector('i');
            if (data.action === 'added') {
                icon.className = 'fas fa-heart';
                buttonElement.classList.add('active');
            } else {
                icon.className = 'far fa-heart';
                buttonElement.classList.remove('active');
            }
            showToast(data.action === 'added' ? 'Added to favorites' : 'Removed from favorites', 'success');
        }
    } catch (err) {
        console.error('Favorite error:', err);
        showToast('Error updating favorites', 'error');
    }
}

async function updateUIForUserRole() {
    const heroDescription = document.getElementById('heroDescription');
    const findServicesBtn = document.getElementById('findServicesBtn');
    const offerServiceBtn = document.getElementById('offerServiceBtn');
    const pricingSection = document.getElementById('pricingSection');
    const clientTabs = document.getElementById('clientTabs');
    const providerTabs = document.getElementById('providerTabs');
    const servicesBrowser = document.getElementById('servicesBrowser');
    const createServiceBtn = document.getElementById('createServiceBtn');
    const subscriptionBanner = document.getElementById('subscriptionBanner');
    const clientServicesView = document.getElementById('clientServicesView');
    const providerServicesView = document.getElementById('providerServicesView');
    
    if (currentUser) {
        if (userRole === 'freelancer') {
            const subStatus = await checkSubscriptionStatus();
            const hasActiveSubscription = subStatus?.hasActiveSubscription || false;
            const daysLeft = subStatus?.daysLeft || 0;
            
            if (heroDescription) heroDescription.textContent = "Manage your services and connect with clients worldwide.";
            if (findServicesBtn) findServicesBtn.textContent = "Browse Services";
            
            if (offerServiceBtn) {
                offerServiceBtn.textContent = hasActiveSubscription ? "Manage My Services" : (daysLeft > 0 ? `⚠️ Trial (${daysLeft} days left)` : "❌ Subscribe to Create");
                offerServiceBtn.disabled = false;
                if (hasActiveSubscription) {
                    offerServiceBtn.classList.remove('btn-secondary');
                    offerServiceBtn.classList.add('btn-primary');
                } else {
                    offerServiceBtn.classList.add('btn-secondary');
                    offerServiceBtn.classList.remove('btn-primary');
                }
            }
            
            if (pricingSection) pricingSection.classList.add('hidden');
            if (clientTabs) clientTabs.classList.add('hidden');
            if (providerTabs) providerTabs.classList.remove('hidden');
            
            if (createServiceBtn) createServiceBtn.style.display = hasActiveSubscription ? 'inline-flex' : 'none';
            if (servicesBrowser) servicesBrowser.classList.remove('hidden');
            
            // Show/hide subscription banner
            if (subscriptionBanner) {
                if (hasActiveSubscription && subStatus?.subscriptionPlan === 'free_trial') {
                    subscriptionBanner.classList.remove('hidden');
                    const daysLeftEl = document.getElementById('daysLeft');
                    if (daysLeftEl) daysLeftEl.textContent = daysLeft;
                } else {
                    subscriptionBanner.classList.add('hidden');
                }
            }
            
            // Show provider view, hide client view
            if (clientServicesView) clientServicesView.classList.add('hidden');
            if (providerServicesView) providerServicesView.classList.remove('hidden');
            
            switchTab('browse');
            
        } else if (userRole === 'client') {
            if (heroDescription) heroDescription.textContent = "Find expert services for your needs.";
            if (findServicesBtn) findServicesBtn.textContent = "Find Services";
            if (offerServiceBtn) {
                offerServiceBtn.textContent = "Offer a Service";
                offerServiceBtn.disabled = false;
            }
            if (pricingSection) pricingSection.classList.add('hidden');
            if (clientTabs) clientTabs.classList.remove('hidden');
            if (providerTabs) providerTabs.classList.add('hidden');
            if (subscriptionBanner) subscriptionBanner.classList.add('hidden');
            if (servicesBrowser) servicesBrowser.classList.remove('hidden');
            
            // Show client view, hide provider view
            if (clientServicesView) clientServicesView.classList.remove('hidden');
            if (providerServicesView) providerServicesView.classList.add('hidden');
            
            switchTab('browse');
        }
    } else {
        // Not logged in
        if (heroDescription) heroDescription.textContent = "Find expert services or offer your skills to clients worldwide.";
        if (findServicesBtn) findServicesBtn.textContent = "Find Services";
        if (offerServiceBtn) offerServiceBtn.textContent = "Offer a Service";
        if (pricingSection) pricingSection.classList.add('hidden');
        if (clientTabs) clientTabs.classList.add('hidden');
        if (providerTabs) providerTabs.classList.add('hidden');
        if (subscriptionBanner) subscriptionBanner.classList.add('hidden');
        if (servicesBrowser) servicesBrowser.classList.remove('hidden');
        
        if (clientServicesView) clientServicesView.classList.add('hidden');
        if (providerServicesView) providerServicesView.classList.add('hidden');
        
        switchTab('browse');
    }
}


// ==================== CATEGORY MANAGEMENT ====================


// ==================== COMPLETE SERVICE FORM HANDLER ====================

// Make sure this function is defined and not overridden
async function handleServiceFormSubmit(e) {
    e.preventDefault();
    
    console.log("Service form submitted");
    
    if (!currentUser) {
        showToast('Please login to create a service', 'warning');
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    if (currentUser.role !== 'freelancer' && currentUser.role !== 'admin') {
        showToast('Only freelancers can create services', 'error');
        return;
    }
    
    const submitBtn = document.querySelector('#serviceForm button[type="submit"]');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Create Service';
    
    try {
        // Check subscription status for freelancers
        if (currentUser.role === 'freelancer') {
            showToast('Checking subscription status...', 'info');
            const subResponse = await fetch('/api/subscription/status', {
                credentials: 'include'
            });
            const subData = await subResponse.json();
            
            if (!subData.hasActiveSubscription) {
                showToast('Subscription required to create services', 'warning');
                showSubscriptionModal();
                return;
            }
        }
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Service...';
        }
        
        // Get form values
        const title = document.getElementById('serviceTitle')?.value.trim();
        const description = document.getElementById('serviceDescription')?.value.trim();
        const hourlyRate = document.getElementById('hourlyRate')?.value;
        const fixedPrice = document.getElementById('fixedPrice')?.value;
        const deliveryTime = document.getElementById('deliveryTime')?.value;
        const revisions = document.getElementById('revisions')?.value;
        
        // Handle category - check if new category was entered
        let category = '';
        const activeTab = document.querySelector('.category-tab-btn.active');
        const isNewCategory = activeTab && activeTab.getAttribute('data-tab') === 'new';
        
        if (isNewCategory) {
            const newCategory = document.getElementById('newCategory')?.value.trim();
            if (!newCategory) {
                showToast('Please enter a category name', 'warning');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
                return;
            }
            category = newCategory;
            // Add to dropdowns for future use
            addNewCategoryToDropdowns(newCategory);
        } else {
            category = document.getElementById('serviceCategory')?.value;
            if (!category) {
                showToast('Please select a category', 'warning');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
                return;
            }
        }
        
        // Validation
        if (!title) {
            showToast('Please enter a service title', 'warning');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }
        
        if (title.length < 5) {
            showToast('Title must be at least 5 characters', 'warning');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }
        
        if (!description) {
            showToast('Please enter a service description', 'warning');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }
        
        if (description.length < 20) {
            showToast('Description must be at least 20 characters', 'warning');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }
        
        // Collect tags
        const tags = [];
        document.querySelectorAll('#tagsList .tag').forEach(tag => {
            const tagText = tag.textContent.replace('×', '').trim();
            if (tagText) {
                tags.push(tagText);
            }
        });
        
        // Collect requirements
        const requirements = [];
        document.querySelectorAll('.requirement-input').forEach(input => {
            if (input.value && input.value.trim()) {
                requirements.push(input.value.trim());
            }
        });
        
        // Collect packages
        const packages = [];
        const packageCards = document.querySelectorAll('.package-card');
        packageCards.forEach(card => {
            const packageNameElement = card.querySelector('.package-name');
            const packageName = packageNameElement ? packageNameElement.textContent.trim() : '';
            const isEnabled = card.querySelector('.package-enabled')?.checked;
            
            if (isEnabled && packageName) {
                const priceInput = card.querySelector('.package-price-input');
                const price = parseFloat(priceInput?.value) || 0;
                
                const features = [];
                const featureInputs = card.querySelectorAll('.package-feature-input');
                featureInputs.forEach(input => {
                    if (input.value && input.value.trim()) {
                        features.push(input.value.trim());
                    }
                });
                
                packages.push({
                    package_name: packageName.toLowerCase(),
                    price: price,
                    features: features,
                    delivery_time: parseInt(deliveryTime) || 7,
                    revisions: parseInt(revisions) || 2
                });
            }
        });
        
        // Prepare data
        const serviceData = {
            title: title,
            description: description,
            category: category,
            hourly_rate: hourlyRate || null,
            fixed_price: fixedPrice || null,
            delivery_time: parseInt(deliveryTime) || 7,
            revisions: parseInt(revisions) || 2,
            tags: tags,
            requirements: requirements,
            packages: packages
        };
        
        console.log('Sending service data:', serviceData);
        showToast('Creating service...', 'info');
        
        // Send to server
        const response = await fetch('/api/services', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(serviceData)
        });
        
        const result = await response.json();
        console.log('Server response:', result);
        
        if (response.ok && result.success) {
            showToast('✅ Service created successfully!', 'success');
            
            // Reset form
            const form = document.getElementById('serviceForm');
            if (form) form.reset();
            
            const tagsList = document.getElementById('tagsList');
            if (tagsList) tagsList.innerHTML = '';
            
            const requirementsContainer = document.getElementById('requirementsContainer');
            if (requirementsContainer) {
                requirementsContainer.innerHTML = `
                    <div class="requirement-item" style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <input type="text" class="requirement-input" placeholder="e.g., Project brief, brand colors, etc." style="flex: 1; padding: 12px; border-radius: 8px; background: var(--secondary-dark); border: 1px solid rgba(255,255,255,0.1); color: var(--text-light);">
                        <button type="button" class="btn btn-secondary remove-requirement" style="padding: 12px;">Remove</button>
                    </div>
                `;
            }
            
            // Reset packages
            document.querySelectorAll('.package-price-input').forEach(input => {
                const card = input.closest('.package-card');
                const isEnabled = card?.querySelector('.package-enabled')?.checked;
                if (isEnabled) {
                    input.value = '0';
                }
            });
            
            // Reset category selection
            const categorySelect = document.getElementById('serviceCategory');
            if (categorySelect) categorySelect.value = '';
            const newCategoryInput = document.getElementById('newCategory');
            if (newCategoryInput) newCategoryInput.value = '';
            hideSelectedCategory();
            
            // Hide create form and show services browser
            hideCreateServiceForm();
            
            // Reload services
            await loadServices();
            
            // Switch to my services tab if freelancer
            if (currentUser && currentUser.role === 'freelancer') {
                switchTab('myServices');
                await loadMyServices();
            }
        } else {
            showToast(result.error || 'Failed to create service', 'error');
        }
        
    } catch (err) {
        console.error('Service creation error:', err);
        showToast('Error creating service: ' + err.message, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

// Helper function to add new category to dropdowns
function addNewCategoryToDropdowns(category) {
    // Add to service category select
    const categorySelect = document.getElementById('serviceCategory');
    if (categorySelect && !Array.from(categorySelect.options).some(opt => opt.value === category)) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    }
    
    // Add to filter dropdown
    const filterSelect = document.getElementById('categoryFilter');
    if (filterSelect && !Array.from(filterSelect.options).some(opt => opt.value === category)) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        filterSelect.appendChild(option);
    }
}

// Make sure the event listener is properly attached
function setupServiceFormListener() {
    const serviceForm = document.getElementById('serviceForm');
    if (serviceForm) {
        // Remove any existing listeners
        const newForm = serviceForm.cloneNode(true);
        serviceForm.parentNode.replaceChild(newForm, serviceForm);
        
        // Add new listener
        newForm.addEventListener('submit', handleServiceFormSubmit);
        console.log('Service form listener attached');
    }
}

// Call this when page loads and when create service form is shown
document.addEventListener('DOMContentLoaded', () => {
    setupServiceFormListener();
});

// Also set up when create service form is shown

window.showCreateServiceForm = function() {
    if (originalShowCreateServiceForm) originalShowCreateServiceForm();
    setTimeout(() => {
        setupServiceFormListener();
        initCategoryTabs();
    }, 100);
};

// Initialize category tabs
function initCategoryTabs() {
    const tabBtns = document.querySelectorAll('.category-tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            tabPanes.forEach(pane => pane.classList.remove('active'));
            const activePane = document.getElementById(`${tabId}-category-tab`);
            if (activePane) {
                activePane.classList.add('active');
            }
        });
    });
    
    // Category chips
    const categoryChips = document.querySelectorAll('.category-chip');
    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const value = chip.getAttribute('data-value');
            const text = chip.getAttribute('data-text');
            
            if (value) {
                const select = document.getElementById('serviceCategory');
                if (select) {
                    select.value = value;
                    showSelectedCategory(value);
                }
                const existingTab = document.querySelector('.category-tab-btn[data-tab="existing"]');
                if (existingTab) existingTab.click();
            } else if (text) {
                const input = document.getElementById('newCategory');
                if (input) {
                    input.value = text;
                    const charCount = document.querySelector('.char-count');
                    if (charCount) {
                        charCount.textContent = `${text.length}/50`;
                    }
                }
                const newTab = document.querySelector('.category-tab-btn[data-tab="new"]');
                if (newTab) newTab.click();
            }
        });
    });
    
    // New category input counter
    const newCategoryInput = document.getElementById('newCategory');
    if (newCategoryInput) {
        newCategoryInput.addEventListener('input', (e) => {
            const count = e.target.value.length;
            const charCount = document.querySelector('.char-count');
            if (charCount) {
                charCount.textContent = `${count}/50`;
                charCount.style.color = count > 45 ? '#ef4444' : 'var(--text-gray)';
            }
        });
    }
    
    // Clear category button
    const clearBtn = document.querySelector('.clear-category');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const select = document.getElementById('serviceCategory');
            const newInput = document.getElementById('newCategory');
            if (select) select.value = '';
            if (newInput) newInput.value = '';
            hideSelectedCategory();
        });
    }
}

function showSelectedCategory(category) {
    const displayDiv = document.querySelector('.selected-category-display');
    const textSpan = document.getElementById('selectedCategoryText');
    if (displayDiv && textSpan) {
        textSpan.textContent = category;
        displayDiv.classList.remove('hidden');
    }
}

function hideSelectedCategory() {
    const displayDiv = document.querySelector('.selected-category-display');
    if (displayDiv) {
        displayDiv.classList.add('hidden');
    }
}

// Override any existing handleServiceFormSubmit
window.handleServiceFormSubmit = handleServiceFormSubmit;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initCategoryTabs();
});


// ==================== SEARCH MESSAGES IN CONVERSATION ====================
let searchModal = null;
let currentSearchResults = [];
let currentSearchIndex = 0;

function searchInConversation() {
    if (!window.activeConversationId) {
        showToast('No active conversation selected', 'warning');
        return;
    }
    
    // Create search modal if not exists
    if (!searchModal) {
        searchModal = document.createElement('div');
        searchModal.id = 'searchMessagesModal';
        searchModal.className = 'modal hidden';
        searchModal.innerHTML = `
            <div class="modal-card" style="max-width: 500px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--text-light);">
                        <i class="fas fa-search"></i> Search Messages
                    </h3>
                    <span class="close-x" onclick="closeSearchModal()">&times;</span>
                </div>
                <div class="form-group">
                    <input type="text" id="searchQuery" placeholder="Enter keyword to search..." 
                           style="width: 100%; padding: 12px; border-radius: 8px; background: var(--secondary-dark); border: 1px solid rgba(255,255,255,0.1); color: var(--text-light);">
                </div>
                <div id="searchResults" style="max-height: 300px; overflow-y: auto; margin: 15px 0;"></div>
                <div style="display: flex; gap: 10px; justify-content: space-between;">
                    <div>
                        <span id="resultCounter" style="color: var(--text-gray);">0 results</span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-secondary" id="prevResultBtn" disabled>
                            <i class="fas fa-chevron-up"></i> Previous
                        </button>
                        <button class="btn btn-secondary" id="nextResultBtn" disabled>
                            Next <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(searchModal);
        
        // Add search input listener
        const searchInput = document.getElementById('searchQuery');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => performMessageSearch(), 500);
            });
        }
        
        // Add navigation buttons
        document.getElementById('prevResultBtn')?.addEventListener('click', () => navigateSearchResults(-1));
        document.getElementById('nextResultBtn')?.addEventListener('click', () => navigateSearchResults(1));
    }
    
    document.getElementById('searchQuery').value = '';
    document.getElementById('searchResults').innerHTML = '<p style="color: var(--text-gray); text-align: center; padding: 20px;">Type to search messages...</p>';
    document.getElementById('resultCounter').textContent = '0 results';
    
    openModal(searchModal);
    document.getElementById('searchQuery').focus();
}

function closeSearchModal() {
    if (searchModal) closeModal(searchModal);
}

async function performMessageSearch() {
    const query = document.getElementById('searchQuery')?.value.trim();
    if (!query || query.length < 2) {
        document.getElementById('searchResults').innerHTML = '<p style="color: var(--text-gray); text-align: center; padding: 20px;">Type at least 2 characters to search...</p>';
        document.getElementById('resultCounter').textContent = '0 results';
        return;
    }
    
    try {
        showToast('Searching messages...', 'info');
        
        const response = await fetch(`/api/messages/${window.activeConversationId}/search?q=${encodeURIComponent(query)}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Search failed');
        
        const messages = await response.json();
        currentSearchResults = messages || [];
        currentSearchIndex = 0;
        
        const resultsContainer = document.getElementById('searchResults');
        const prevBtn = document.getElementById('prevResultBtn');
        const nextBtn = document.getElementById('nextResultBtn');
        const counter = document.getElementById('resultCounter');
        
        if (currentSearchResults.length === 0) {
            resultsContainer.innerHTML = '<p style="color: var(--text-gray); text-align: center; padding: 20px;">No messages found matching "' + escapeHtml(query) + '"</p>';
            counter.textContent = '0 results';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        } else {
            resultsContainer.innerHTML = currentSearchResults.map((msg, idx) => `
                <div class="search-result-item" data-index="${idx}" 
                     style="padding: 12px; margin-bottom: 10px; background: var(--secondary-dark); border-radius: 8px; cursor: pointer; border-left: 3px solid var(--accent-blue);"
                     onclick="jumpToMessage(${msg.id}, ${idx})">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: var(--accent-gold); font-weight: 500;">${escapeHtml(msg.sender_name || 'User')}</span>
                        <span style="color: var(--text-gray); font-size: 0.75rem;">${new Date(msg.created_at).toLocaleString()}</span>
                    </div>
                    <p style="color: var(--text-light); margin: 0;">${escapeHtml(msg.message || msg.content || '').substring(0, 100)}${(msg.message || '').length > 100 ? '...' : ''}</p>
                </div>
            `).join('');
            
            counter.textContent = `${currentSearchResults.length} result${currentSearchResults.length !== 1 ? 's' : ''}`;
            prevBtn.disabled = true;
            nextBtn.disabled = currentSearchResults.length <= 1;
            
            // Highlight first result
            highlightSearchResult(0);
        }
        
        showToast(`Found ${currentSearchResults.length} messages`, 'success');
        
    } catch (err) {
        console.error('Search error:', err);
        document.getElementById('searchResults').innerHTML = '<p style="color: var(--error-red); text-align: center; padding: 20px;">Error searching messages</p>';
        showToast('Error searching messages', 'error');
    }
}

function highlightSearchResult(index) {
    document.querySelectorAll('.search-result-item').forEach((item, i) => {
        if (i === index) {
            item.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
            item.style.borderLeftColor = 'var(--accent-gold)';
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            item.style.backgroundColor = 'var(--secondary-dark)';
            item.style.borderLeftColor = 'var(--accent-blue)';
        }
    });
}

function navigateSearchResults(direction) {
    if (!currentSearchResults.length) return;
    
    const newIndex = currentSearchIndex + direction;
    if (newIndex >= 0 && newIndex < currentSearchResults.length) {
        currentSearchIndex = newIndex;
        highlightSearchResult(currentSearchIndex);
        
        const prevBtn = document.getElementById('prevResultBtn');
        const nextBtn = document.getElementById('nextResultBtn');
        
        if (prevBtn) prevBtn.disabled = currentSearchIndex === 0;
        if (nextBtn) nextBtn.disabled = currentSearchIndex === currentSearchResults.length - 1;
    }
}

async function jumpToMessage(messageId, index) {
    if (!window.activeConversationId) return;
    
    closeSearchModal();
    
    // Scroll to message
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.style.backgroundColor = 'rgba(251, 191, 36, 0.2)';
        setTimeout(() => {
            messageElement.style.backgroundColor = '';
        }, 2000);
    } else {
        // Reload messages and try again
        await loadMessagesForConversation(window.activeConversationId);
        setTimeout(() => {
            const msgElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
            if (msgElement) {
                msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                msgElement.style.backgroundColor = 'rgba(251, 191, 36, 0.2)';
                setTimeout(() => {
                    msgElement.style.backgroundColor = '';
                }, 2000);
            }
        }, 500);
    }
}
// Add this function to auto-size image containers
function adjustImageContainer(imgElement) {
    const container = imgElement.closest('.message-image');
    if (container && imgElement.complete) {
        const imgWidth = imgElement.naturalWidth;
        const imgHeight = imgElement.naturalHeight;
        
        // Set container to match image dimensions (up to max limits)
        const maxWidth = 180;
        const maxHeight = 150;
        
        let displayWidth = imgWidth;
        let displayHeight = imgHeight;
        
        if (imgWidth > maxWidth) {
            const ratio = maxWidth / imgWidth;
            displayWidth = maxWidth;
            displayHeight = imgHeight * ratio;
        }
        
        if (displayHeight > maxHeight) {
            const ratio = maxHeight / displayHeight;
            displayHeight = maxHeight;
            displayWidth = displayWidth * ratio;
        }
        
        container.style.width = displayWidth + 'px';
        container.style.height = displayHeight + 'px';
        imgElement.style.width = '100%';
        imgElement.style.height = '100%';
        imgElement.style.objectFit = 'cover';
    }
}

// Call this when images load
document.addEventListener('DOMContentLoaded', function() {
    // Use mutation observer to detect new images
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1 && node.tagName === 'IMG') {
                    if (node.complete) {
                        adjustImageContainer(node);
                    } else {
                        node.addEventListener('load', function() {
                            adjustImageContainer(node);
                        });
                    }
                }
            });
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
});
// ==================== FIXED PROFILE SECTION ====================
// ==================== COMPLETE PROFILE SECTION ====================


// Load reviews for freelancer dashboard - Add this function
async function loadFreelancerReviews() {
    const container = document.getElementById('profileReviewsList');
    if (!container) {
        console.log("Review container not found");
        return;
    }
    
    try {
        container.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading reviews...</div>';
        
        const response = await fetch('/api/freelancer/reviews', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load reviews');
        
        const data = await response.json();
        const reviews = data.reviews || [];
        
        if (reviews.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-gray);">No reviews yet</div>';
            return;
        }
        
        container.innerHTML = reviews.map(review => `
            <div style="background: var(--secondary-dark); border-radius: 12px; padding: 20px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <div>
                        <strong style="color: var(--accent-gold);">${escapeHtml(review.client_name || 'Client')}</strong>
                        <div style="margin-top: 5px;">${'⭐'.repeat(Math.floor(review.rating))}</div>
                    </div>
                    <small style="color: var(--text-gray);">${new Date(review.created_at).toLocaleDateString()}</small>
                </div>
                <p style="color: var(--text-light); margin: 10px 0 0 0;">${escapeHtml(review.comment)}</p>
            </div>
        `).join('');
        
    } catch (err) {
        console.error('Error loading reviews:', err);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-gray);">Error loading reviews</div>';
    }
}

async function loadFreelancerDashboard() {
    console.log("Loading dashboard...");
    
    const dashboardServices = document.getElementById('dashboardServices');
    const dashboardClients = document.getElementById('dashboardClients');
    const dashboardRecruitments = document.getElementById('dashboardRecruitments');
    const dashboardRating = document.getElementById('dashboardRating');
    const recentClientsContainer = document.getElementById('dashboardRecentClients');
    const topClientsContainer = document.getElementById('dashboardTopClients');
    
    // Also update profile stats
    const totalServicesEl = document.getElementById('totalServices');
    const completedOrdersEl = document.getElementById('completedOrders');
    const avgRatingEl = document.getElementById('avgRating');
    const totalReviewsEl = document.getElementById('totalReviews');
    
    try {
        const response = await fetch('/api/freelancer/dashboard', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load dashboard');
        }
        
        const data = await response.json();
        console.log("Dashboard data:", data);
        
        // Update stats - these will show actual numbers
        if (dashboardServices) dashboardServices.textContent = data.services?.total_services || 0;
        if (dashboardClients) dashboardClients.textContent = data.clients?.total_clients || 0;
        if (dashboardRecruitments) dashboardRecruitments.textContent = data.recruitments?.total || 0;
        
        const avgRating = data.profile?.avg_rating || 0;
        if (dashboardRating) dashboardRating.innerHTML = avgRating.toFixed(1);
        
        // Update profile stats
        if (totalServicesEl) totalServicesEl.textContent = data.services?.total_services || 0;
        if (completedOrdersEl) completedOrdersEl.textContent = data.profile?.completed_orders || 0;
        if (avgRatingEl) avgRatingEl.textContent = avgRating.toFixed(1);
        if (totalReviewsEl) totalReviewsEl.textContent = data.profile?.review_count || 0;
        
        // ========== RECENT CLIENTS ==========
        if (recentClientsContainer) {
            const recentClients = data.clients?.recent || [];
            
            if (recentClients.length > 0) {
                recentClientsContainer.innerHTML = recentClients.map(client => `
                    <div style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="color: var(--text-light); font-weight: 500;">
                                    <i class="fas fa-user-circle" style="color: var(--accent-blue); margin-right: 8px;"></i>
                                    ${escapeHtml(client.username)}
                                </div>
                                <div style="font-size: 0.7rem; color: var(--text-gray); margin-top: 4px;">
                                    <i class="fas fa-calendar-alt" style="margin-right: 4px;"></i>
                                    Recruited: ${formatDate(client.recruited_at)}
                                </div>
                            </div>
                            <button onclick="checkAndStartConversation(null, ${client.id})" 
                                    style="padding: 6px 12px; background: rgba(59,130,246,0.2); border: 1px solid var(--accent-blue); border-radius: 6px; color: var(--accent-blue); cursor: pointer;">
                                <i class="fas fa-comment"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                // Show nice empty state
                recentClientsContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                        <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.3;"></i>
                        <h4 style="color: var(--text-light); margin-bottom: 8px;">No Clients Yet</h4>
                        <p style="font-size: 0.85rem;">When clients recruit you, they'll appear here</p>
                        <p style="font-size: 0.75rem; margin-top: 10px;">💡 Tip: Share your service links to get noticed</p>
                    </div>
                `;
            }
        }
        
        // ========== TOP CLIENTS ==========
        if (topClientsContainer) {
            const topClients = data.clients?.top || [];
            
            if (topClients.length > 0) {
                topClientsContainer.innerHTML = topClients.map((client, index) => `
                    <div style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="background: ${index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : '#cd7f32'}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem; color: #000;">
                                    ${index + 1}
                                </div>
                                <div>
                                    <div style="color: var(--text-light); font-weight: 500;">
                                        ${escapeHtml(client.username)}
                                    </div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="color: var(--accent-gold); font-weight: bold;">
                                    ${client.total_orders || 0} orders
                                </div>
                                <div style="font-size: 0.7rem; color: var(--text-gray);">
                                    $${(client.total_spent || 0).toFixed(2)} spent
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                topClientsContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                        <i class="fas fa-trophy" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.3;"></i>
                        <h4 style="color: var(--text-light); margin-bottom: 8px;">No Top Clients Yet</h4>
                        <p style="font-size: 0.85rem;">Complete orders to see your best clients here</p>
                    </div>
                `;
            }
        }
        
    } catch (err) {
        console.error("Error loading dashboard:", err);
        
        // Show error state
        if (recentClientsContainer) {
            recentClientsContainer.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>Failed to load dashboard</p>
                    <button onclick="loadFreelancerDashboard()" class="btn btn-primary" style="margin-top: 10px; padding: 8px 16px;">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
        }
    }
}

// Helper function to format dates
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
async function loadMyClients() {
    const container = document.getElementById('clientsList');
    if (!container) return;

    try {
        container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading clients...</div>';
        
        const response = await fetch('/api/freelancer/clients', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load clients');
        }
        
        let clients = await response.json();
        
        // Ensure clients is an array
        if (!clients) clients = [];
        if (!Array.isArray(clients)) {
            console.log("Clients is not an array:", clients);
            clients = [];
        }
        
        if (clients.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; grid-column: 1 / -1;">
                    <div style="font-size: 4rem; margin-bottom: 20px;">👥</div>
                    <h3 style="color: var(--text-light); margin-bottom: 10px;">No Clients Yet</h3>
                    <p style="color: var(--text-gray);">When clients recruit you, they'll appear here.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = clients.map(client => {
            const isFreelancer = currentUser?.role === 'freelancer';
            
            return `
                <div class="service-card" data-client-id="${client.client_id || client.id}">
                    <div class="service-header">
                        <h3 class="service-title">${escapeHtml(client.username || 'Client')}</h3>
                        <div class="service-price">${client.total_orders || 0} orders</div>
                    </div>
                    <div class="service-provider-info">
                        <div class="provider-initials">${(client.username || 'C').charAt(0).toUpperCase()}</div>
                        <div class="provider-info">
                            <div class="service-provider-name">${escapeHtml(client.username || 'Client')}</div>
                            <div class="service-provider">Recruited: ${client.recruited_at ? new Date(client.recruited_at).toLocaleDateString() : 'N/A'}</div>
                        </div>
                    </div>
                    <div class="service-actions">
                        <button class="btn chat-btn" onclick="checkAndStartConversation(null, ${client.client_id || client.id})">
                            <i class="fas fa-comments"></i> Message
                        </button>
                        ${isFreelancer ? `
                            <button class="btn btn-secondary flag-btn" onclick="showFlagClientModal(${client.client_id || client.id}, '${escapeHtml(client.username || 'Client')}')">
                                <i class="fas fa-flag"></i> Report Client
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (err) {
        console.error("Error loading clients:", err);
        container.innerHTML = '<div class="text-error" style="text-align: center; padding: 40px;">Failed to load clients</div>';
    }
}
// Flag Client Modal for Freelancers
function showFlagClientModal(clientId, clientName) {
    const reason = prompt(`Why are you reporting ${clientName}?\n\nPlease provide a detailed reason (minimum 10 characters):`);
    
    if (!reason) return;
    if (reason.length < 10) {
        showToast("Please provide a detailed reason (minimum 10 characters)", "warning");
        return;
    }
    
    flagClient(clientId, reason);
}

async function flagClient(clientId, reason) {
    if (!currentUser) {
        showToast("Please login to report", "warning");
        return;
    }
    
    if (currentUser.role !== 'freelancer') {
        showToast("Only freelancers can report clients", "error");
        return;
    }
    
    try {
        showToast("Submitting report...", "info");
        
        const response = await fetch('/api/client/flag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                client_id: clientId,
                reason: reason
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message || "Client reported successfully", "success");
        } else {
            showToast(data.error || "Failed to report client", "error");
        }
    } catch (err) {
        console.error("Flag client error:", err);
        showToast("Error reporting client", "error");
    }
}
// ==================== SHOW ADMIN REVIEW PANEL (BOTH TYPES) ====================

// ==================== ADMIN DASHBOARD ====================
async function showAdminDashboard() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast("Admin access required", "error");
        return;
    }
    
    // Create modal if not exists
    let modal = document.getElementById('adminDashboardModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'adminDashboardModal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-card large" style="max-width: 900px; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--text-light);">
                        <i class="fas fa-chart-line"></i> Admin Dashboard
                    </h3>
                    <span class="close-x" onclick="closeModal(document.getElementById('adminDashboardModal'))">&times;</span>
                </div>
                <div id="adminDashboardContent">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-spinner fa-spin"></i> Loading dashboard data...
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    openModal(modal);
    await loadAdminDashboardData();
}

async function loadAdminDashboardData() {
    const container = document.getElementById('adminDashboardContent');
    if (!container) return;
    
    try {
        const statsResponse = await fetch('/api/admin/platform-stats', {
            credentials: 'include'
        });
        const stats = await statsResponse.json();
        
        container.innerHTML = `
            <div class="admin-stats-grid" style="margin-bottom: 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                <div class="admin-stat-card" style="background: var(--card-bg); padding: 20px; border-radius: 12px;">
                    <div class="admin-stat-value" style="font-size: 2rem; color: var(--accent-gold);">${stats.total_users || 0}</div>
                    <div class="admin-stat-label">Total Users</div>
                </div>
                <div class="admin-stat-card">
                    <div class="admin-stat-value">${stats.total_products || 0}</div>
                    <div class="admin-stat-label">Total Products</div>
                </div>
                <div class="admin-stat-card">
                    <div class="admin-stat-value">${stats.total_sales || 0}</div>
                    <div class="admin-stat-label">Total Sales</div>
                </div>
                <div class="admin-stat-card">
                    <div class="admin-stat-value">$${stats.platform_revenue || 0}</div>
                    <div class="admin-stat-label">Platform Revenue</div>
                </div>
            </div>
            <div style="display: flex; gap: 15px; justify-content: center; margin-top: 20px;">
                <button class="btn btn-primary" onclick="closeModal(document.getElementById('adminDashboardModal')); showAdminReviewPanel();">
                    <i class="fas fa-gavel"></i> Go to Review Panel
                </button>
                <button class="btn btn-secondary" onclick="closeModal(document.getElementById('adminDashboardModal'))">
                    Close
                </button>
            </div>
        `;
        
    } catch (err) {
        console.error("Error loading admin dashboard:", err);
        container.innerHTML = '<div class="text-error" style="text-align: center; padding: 40px;">Failed to load dashboard data</div>';
    }
}

// ==================== ADMIN REVIEW PANEL ====================
async function showAdminReviewPanel() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast("Admin access required", "error");
        return;
    }
    
    // Create modal if not exists
    let modal = document.getElementById('adminReviewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'adminReviewModal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-card large" style="max-width: 900px; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--text-light);">
                        <i class="fas fa-gavel"></i> Admin Review Panel
                    </h3>
                    <span class="close-x" onclick="closeModal(document.getElementById('adminReviewModal'))">&times;</span>
                </div>
                <div id="adminReviewContent">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-spinner fa-spin"></i> Loading flagged users...
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    openModal(modal);
    await loadAdminReviewData();
}

async function loadAdminReviewData() {
    const container = document.getElementById('adminReviewContent');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading flagged users...</div>';
    
    try {
        const response = await fetch('/api/admin/flagged-users', {
            credentials: 'include'
        });
        
        const data = await response.json();
        const users = data.users || [];
        
        if (users.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px; color: var(--text-gray);">
                    <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                    <p>No flagged users pending review</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <h4 style="color: var(--text-light); margin-bottom: 15px;">Flagged Users (${users.length})</h4>
            ${users.map(user => `
                <div class="admin-review-card" data-user-id="${user.id}" style="background: var(--card-bg); border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 15px;">
                        <div>
                            <h4 style="color: var(--text-light); margin-bottom: 5px;">
                                ${escapeHtml(user.username)}
                                <span class="badge" style="background: #ef4444;">${user.flag_count} Flag(s)</span>
                                <span class="badge" style="background: ${user.account_locked ? '#ef4444' : '#10b981'}">${user.account_locked ? 'Locked' : 'Active'}</span>
                            </h4>
                            <p style="color: var(--text-gray); font-size: 0.9rem;">Email: ${escapeHtml(user.email)}</p>
                            <p style="color: var(--text-gray); font-size: 0.9rem;">Member since: ${new Date(user.created_at).toLocaleDateString()}</p>
                        </div>
                        <div>
                            <button class="btn btn-primary" onclick="viewUserFlags(${user.id})">
                                <i class="fas fa-list"></i> View Details
                            </button>
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        <textarea id="adminNote_${user.id}" class="form-textarea-enhanced" rows="2" 
                                  placeholder="Add admin notes..."></textarea>
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="btn btn-success" onclick="resolveFlags(${user.id}, 'cleared')">
                                <i class="fas fa-check"></i> Clear Flags & Reactivate
                            </button>
                            <button class="btn btn-danger" onclick="resolveFlags(${user.id}, 'suspended')">
                                <i class="fas fa-ban"></i> Suspend Account
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
        
    } catch (err) {
        console.error("Error loading flagged users:", err);
        container.innerHTML = `<div class="text-error" style="text-align: center; padding: 40px;">Error loading flagged users: ${err.message}</div>`;
    }
}
async function viewUserFlagDetails(userId, userType) {
    try {
        const response = await fetch(`/api/admin/user-flags-details/${userId}/${userType}`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        const modalContent = `
            <div style="max-height: 60vh; overflow-y: auto;">
                <h4 style="color: var(--text-light);">User: ${escapeHtml(data.user?.username)}</h4>
                <p style="color: var(--text-gray);">Email: ${escapeHtml(data.user?.email)}</p>
                <p style="color: var(--text-gray);">Status: ${data.user?.account_locked ? 'Locked' : 'Active'}</p>
                <hr style="margin: 15px 0; border-color: rgba(255,255,255,0.1);">
                <h5 style="color: var(--accent-gold);">Flag Details (${data.flags.length})</h5>
                ${data.flags.map(flag => `
                    <div style="background: var(--secondary-dark); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="color: var(--accent-gold);">Flagged by: ${escapeHtml(flag.flagged_by_name || 'Unknown')}</span>
                            <span style="color: var(--text-gray); font-size: 0.85rem;">${new Date(flag.created_at).toLocaleString()}</span>
                        </div>
                        <p style="color: var(--text-light);"><strong>Reason:</strong></p>
                        <p style="color: var(--text-gray);">${escapeHtml(flag.reason)}</p>
                        ${flag.service_title ? `<p style="color: var(--text-gray); font-size: 0.85rem; margin-top: 8px;"><strong>Service:</strong> ${escapeHtml(flag.service_title)}</p>` : ''}
                    </div>
                `).join('')}
                ${data.review?.freelancer_statement ? `
                    <div style="background: rgba(59, 130, 246, 0.1); padding: 15px; border-radius: 8px; margin-top: 15px;">
                        <h5 style="color: var(--text-light);">User's Statement:</h5>
                        <p style="color: var(--text-gray);">${escapeHtml(data.review.freelancer_statement)}</p>
                    </div>
                ` : ''}
            </div>
        `;
        
        showModalWithContent('Flag Details', modalContent);
        
    } catch (err) {
        console.error("Error viewing flag details:", err);
        showToast("Error loading flag details", "error");
    }
}

async function resolveUserFlags(userId, userType, action) {
    const adminNote = document.getElementById(`adminNote_${userId}`)?.value || '';
    
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    
    try {
        const response = await fetch(`/api/admin/resolve-user-flags/${userId}/${userType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                action: action,
                admin_notes: adminNote
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message, "success");
            await loadAdminReviewData(userType === 'freelancer' ? 'freelancers' : 'clients');
        } else {
            showToast(data.error || "Failed to process", "error");
        }
        
    } catch (err) {
        console.error("Error resolving flags:", err);
        showToast("Error processing request", "error");
    }
}
// Handle   profile form submission
async function handleProfileFormSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showToast('Please login to update profile', 'warning');
        return;
    }
    
    const submitBtn = document.querySelector('#profileForm button[type="submit"]');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Save Changes';
    
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }
        
        // Collect form data
        const profileData = {
            headline: document.getElementById('editHeadline')?.value || '',
            description: document.getElementById('editDescription')?.value || '',
            hourly_rate: parseFloat(document.getElementById('editHourlyRate')?.value) || 0,
            experience_level: document.getElementById('editExperienceLevel')?.value || 'intermediate',
            availability: document.getElementById('editAvailability')?.value || 'available',
            location: document.getElementById('editLocation')?.value || '',
            phone: document.getElementById('editPhone')?.value || '',
            website: document.getElementById('editWebsite')?.value || '',
            education: document.getElementById('editEducation')?.value || '',
            certifications: document.getElementById('editCertifications')?.value || '',
            skills: getSkillsArray(),
            languages: getLanguagesArray()
        };
        
        console.log('Saving profile:', profileData);
        
        const response = await fetch('/api/freelancer/update-profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(profileData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast('✅ Profile updated successfully!', 'success');
            // Switch back to view mode
            switchProfileTab('profileViewTabContent');
            // Reload profile data
            await showFreelancerProfile();
        } else {
            showToast(result.error || 'Failed to update profile', 'error');
        }
        
    } catch (err) {
        console.error('Profile update error:', err);
        showToast('Error updating profile: ' + err.message, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

// Helper functions for skills and languages
function getSkillsArray() {
    const skills = [];
    document.querySelectorAll('#skillsList .skill-tag').forEach(tag => {
        const skillText = tag.textContent.replace('×', '').trim();
        if (skillText) {
            skills.push(skillText);
        }
    });
    return skills;
}

function getLanguagesArray() {
    const languages = [];
    document.querySelectorAll('#languagesList .skill-tag').forEach(tag => {
        const langText = tag.textContent.replace('×', '').trim();
        if (langText) {
            languages.push(langText);
        }
    });
    return languages;
}

function addSkill() {
    const input = document.getElementById('newSkill');
    const skill = input.value.trim();
    
    if (!skill) {
        showToast('Please enter a skill', 'warning');
        return;
    }
    
    const skillsList = document.getElementById('skillsList');
    const existingSkills = Array.from(skillsList.querySelectorAll('.skill-tag')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
    
    if (existingSkills.includes(skill)) {
        showToast('Skill already added', 'warning');
        return;
    }
    
    const skillTag = document.createElement('span');
    skillTag.className = 'skill-tag';
    skillTag.innerHTML = `${escapeHtml(skill)} <span class="remove-skill" onclick="this.parentElement.remove()">&times;</span>`;
    skillsList.appendChild(skillTag);
    input.value = '';
}

function addLanguage() {
    const input = document.getElementById('newLanguage');
    const language = input.value.trim();
    
    if (!language) {
        showToast('Please enter a language', 'warning');
        return;
    }
    
    const languagesList = document.getElementById('languagesList');
    const existingLanguages = Array.from(languagesList.querySelectorAll('.skill-tag')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
    
    if (existingLanguages.includes(language)) {
        showToast('Language already added', 'warning');
        return;
    }
    
    const langTag = document.createElement('span');
    langTag.className = 'skill-tag';
    langTag.innerHTML = `${escapeHtml(language)} <span class="remove-skill" onclick="this.parentElement.remove()">&times;</span>`;
    languagesList.appendChild(langTag);
    input.value = '';
}

function removeSkill(skillName) {
    const skillsList = document.getElementById('skillsList');
    const tags = skillsList.querySelectorAll('.skill-tag');
    tags.forEach(tag => {
        if (tag.textContent.replace('×', '').trim() === skillName) {
            tag.remove();
        }
    });
}

function removeLanguage(languageName) {
    const languagesList = document.getElementById('languagesList');
    const tags = languagesList.querySelectorAll('.skill-tag');
    tags.forEach(tag => {
        if (tag.textContent.replace('×', '').trim() === languageName) {
            tag.remove();
        }
    });
}



// Make sure event listeners are set up
function setupProfileEventListeners() {
    // Profile form submission
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        // Remove existing listeners to avoid duplicates
        const newForm = profileForm.cloneNode(true);
        profileForm.parentNode.replaceChild(newForm, profileForm);
        newForm.addEventListener('submit', handleProfileFormSubmit);
    }
    
    // Add skill button
    const addSkillBtn = document.getElementById('addSkillBtn');
    if (addSkillBtn) {
        const newBtn = addSkillBtn.cloneNode(true);
        addSkillBtn.parentNode.replaceChild(newBtn, addSkillBtn);
        newBtn.addEventListener('click', addSkill);
    }
    
    // Add language button
    const addLanguageBtn = document.getElementById('addLanguageBtn');
    if (addLanguageBtn) {
        const newBtn = addLanguageBtn.cloneNode(true);
        addLanguageBtn.parentNode.replaceChild(newBtn, addLanguageBtn);
        newBtn.addEventListener('click', addLanguage);
    }
    
    // Common skill buttons
    document.querySelectorAll('.common-skill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const skill = btn.getAttribute('data-skill');
            if (skill) {
                const input = document.getElementById('newSkill');
                if (input) {
                    input.value = skill;
                    addSkill();
                }
            }
        });
    });
    
    // Cancel edit button
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            switchProfileTab('profileViewTabContent');
        });
    }
    
    // Profile picture upload
  const updatePhotoBtn = document.getElementById('updatePhotoBtn');
    const profilePictureInput = document.getElementById('profilePictureInput');
    if (updatePhotoBtn && profilePictureInput) {
        updatePhotoBtn.addEventListener('click', () => {
            profilePictureInput.click();
        });
        
        profilePictureInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                await uploadProfilePicture(e.target.files[0]);
            }
        });
    }
}


// Initialize profile section when page loads
document.addEventListener('DOMContentLoaded', () => {
    setupProfileEventListeners();
});

// Override any existing showFreelancerProfile
window.showFreelancerProfile = showFreelancerProfile;

// ==================== PROFILE SECTION FIX ====================

// Override the profile tab click handlers
function setupProfileTabHandlers() {
    // Provider Profile Tab button
    const providerProfileTab = document.getElementById('providerProfileTabBtn');
    if (providerProfileTab) {
        // Remove existing listeners
        const newBtn = providerProfileTab.cloneNode(true);
        providerProfileTab.parentNode.replaceChild(newBtn, providerProfileTab);
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Profile tab clicked");
            showFreelancerProfile();
        });
    }
    
    // Also handle the "Manage Profile" button if it exists
    const manageProfileBtn = document.getElementById('manageProfileBtn');
    if (manageProfileBtn) {
        const newBtn = manageProfileBtn.cloneNode(true);
        manageProfileBtn.parentNode.replaceChild(newBtn, manageProfileBtn);
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Manage profile clicked");
            showFreelancerProfile();
        });
    }
}

async function showFreelancerProfile() {
    console.log("Showing freelancer profile");
    
    if (!currentUser) {
        showToast('Please login to view profile', 'warning');
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    if (currentUser.role !== 'freelancer' && currentUser.role !== 'admin') {
        showToast('Only freelancers have profiles. Please switch to a freelancer account.', 'info');
        return;
    }
    
    // Hide all other sections
    const sections = ['pricingSection', 'servicesBrowser', 'createServiceForm', 'inboxPage'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab) tab.classList.add('hidden');
    });
    
    // Show profile section
    const profileSection = document.getElementById('freelancerProfile');
    if (profileSection) {
        profileSection.classList.remove('hidden');
    } else {
        console.error("Profile section not found!");
        showToast("Profile section not found. Please refresh the page.", "error");
        return;
    }
    
    // Switch to view tab
    switchProfileTab('profileViewTabContent');
    
    try {
        showToast('Loading profile...', 'info');
        
        // Fetch profile data
        const response = await fetch('/api/freelancer/profile', {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const profile = await response.json();
        console.log("Profile data received:", profile);
        console.log("Certificate data:", {
            certificate_images: profile.certificate_images,
            certificate_image_urls: profile.certificate_image_urls,
            type: typeof profile.certificate_images
        });
        
        // Update profile display
        updateProfileDisplay(profile);
        
        showToast('Profile loaded successfully', 'success');
        
    } catch (err) {
        console.error('Error loading profile:', err);
        showToast('Error loading profile: ' + err.message, 'error');
        
        // Display placeholder data
        displayPlaceholderProfile();
    }
}

   
   function updateProfileDisplay(profile) {
    // Basic info
    const usernameEl = document.getElementById('profileUsername');
    if (usernameEl) usernameEl.textContent = profile.username || currentUser?.username || 'Freelancer';
    
    const headlineEl = document.getElementById('profileHeadline');
    if (headlineEl) headlineEl.textContent = profile.headline || 'Professional Freelancer';
    
    const descriptionEl = document.getElementById('profileDescription');
    if (descriptionEl) descriptionEl.textContent = profile.description || 'No description provided. Click Edit Profile to add your bio.';
    
    // Stats
    const totalServicesEl = document.getElementById('totalServices');
    if (totalServicesEl) totalServicesEl.textContent = profile.total_services || '0';
    
    const avgRatingEl = document.getElementById('avgRating');
    if (avgRatingEl) avgRatingEl.textContent = profile.avg_rating || '0.0';
    
    const totalReviewsEl = document.getElementById('totalReviews');
    if (totalReviewsEl) totalReviewsEl.textContent = profile.review_count || '0';
    
    const completedOrdersEl = document.getElementById('completedOrders');
    if (completedOrdersEl) completedOrdersEl.textContent = profile.completed_orders || '0';
    
    // Profile details
    const hourlyRateEl = document.getElementById('profileHourlyRate');
    if (hourlyRateEl) hourlyRateEl.textContent = profile.hourly_rate ? `$${profile.hourly_rate}/hr` : '$0/hr';
    
    const locationEl = document.getElementById('profileLocation');
    if (locationEl) locationEl.textContent = profile.location || 'Not specified';
    
    const experienceEl = document.getElementById('profileExperienceLevel');
    if (experienceEl) {
        const exp = profile.experience_level || 'intermediate';
        experienceEl.textContent = exp.charAt(0).toUpperCase() + exp.slice(1);
    }
    
    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = currentUser?.email || profile.email || 'Not provided';
    
    const phoneEl = document.getElementById('profilePhone');
    if (phoneEl) phoneEl.textContent = profile.phone || 'Not provided';
    
    const memberSinceEl = document.getElementById('profileMemberSince');
    if (memberSinceEl) {
        const date = profile.created_at ? new Date(profile.created_at) : new Date();
        memberSinceEl.textContent = date.toLocaleDateString();
    }
    
    const profileCompletedOrdersEl = document.getElementById('profileCompletedOrders');
    if (profileCompletedOrdersEl) profileCompletedOrdersEl.textContent = profile.completed_orders || '0';
    
    // Availability
    const availabilitySpan = document.getElementById('profileAvailability');
    if (availabilitySpan) {
        if (profile.availability === 'available') {
            availabilitySpan.innerHTML = '<span style="color: #10b981;"><i class="fas fa-circle"></i> Available Now</span>';
        } else if (profile.availability === 'busy') {
            availabilitySpan.innerHTML = '<span style="color: #f59e0b;"><i class="fas fa-clock"></i> Currently Busy</span>';
        } else {
            availabilitySpan.innerHTML = '<span style="color: #ef4444;"><i class="fas fa-ban"></i> Not Available</span>';
        }
    }
    
    // Profile picture
    const profilePicture = document.getElementById('profilePicture');
    const profileInitials = document.getElementById('profileInitials');
    
    const pictureUrl = profile.profile_picture || profile.profile_picture_url;
    
    if (pictureUrl && pictureUrl !== 'null' && pictureUrl !== 'undefined' && pictureUrl !== '') {
        profilePicture.src = pictureUrl;
        profilePicture.style.display = 'block';
        if (profileInitials) profileInitials.style.display = 'none';
        console.log("Profile picture loaded:", pictureUrl);
    } else {
        profilePicture.style.display = 'none';
        if (profileInitials) {
            profileInitials.style.display = 'flex';
            const initial = (currentUser?.username || 'U').charAt(0).toUpperCase();
            profileInitials.textContent = initial;
        }
    }
    
    // Skills
    const skillsContainer = document.getElementById('profileSkills');
    if (skillsContainer) {
        const skills = profile.skills || [];
        if (skills.length > 0) {
            skillsContainer.innerHTML = skills.map(skill => `
                <span class="skill-tag"><i class="fas fa-check-circle"></i> ${escapeHtml(skill)}</span>
            `).join('');
        } else {
            skillsContainer.innerHTML = '<p style="color: var(--text-gray);">No skills added yet. Click Edit Profile to add your skills.</p>';
        }
    }
    
    // Languages
    const languagesContainer = document.getElementById('profileLanguages');
    if (languagesContainer) {
        const languages = profile.languages || [];
        if (languages.length > 0) {
            languagesContainer.innerHTML = languages.map(lang => `
                <span class="skill-tag"><i class="fas fa-language"></i> ${escapeHtml(lang)}</span>
            `).join('');
        } else {
            languagesContainer.innerHTML = '<p style="color: var(--text-gray);">No languages specified.</p>';
        }
    }
    
    // ==================== CERTIFICATES - FIXED ====================
    const certificatesContainer = document.getElementById('profileCertificates');
    if (certificatesContainer) {
        let certImages = [];
        
        // Try both possible column names
        if (profile.certificate_image_urls) {
            try {
                if (typeof profile.certificate_image_urls === 'string') {
                    if (profile.certificate_image_urls.startsWith('[')) {
                        certImages = JSON.parse(profile.certificate_image_urls);
                    } else {
                        certImages = [profile.certificate_image_urls];
                    }
                } else if (Array.isArray(profile.certificate_image_urls)) {
                    certImages = profile.certificate_image_urls;
                }
            } catch (e) {
                console.error("Error parsing certificate_image_urls:", e);
                certImages = [];
            }
        } else if (profile.certificate_images) {
            try {
                if (typeof profile.certificate_images === 'string') {
                    if (profile.certificate_images.startsWith('[')) {
                        certImages = JSON.parse(profile.certificate_images);
                    } else {
                        certImages = [profile.certificate_images];
                    }
                } else if (Array.isArray(profile.certificate_images)) {
                    certImages = profile.certificate_images;
                }
            } catch (e) {
                console.error("Error parsing certificate_images:", e);
                certImages = [];
            }
        }
        
        // Ensure it's an array
        if (!Array.isArray(certImages)) {
            certImages = [];
        }
        
        // Filter out invalid URLs
        certImages = certImages.filter(url => url && url !== 'null' && url !== 'undefined' && url.trim() !== '');
        
        console.log("Certificates to display:", certImages.length, certImages);
        
        if (certImages.length > 0) {
            certificatesContainer.innerHTML = certImages.map((cert, index) => `
                <div class="certificate-item" data-cert-index="${index}">
                    <img src="${cert}" alt="Certificate ${index + 1}" class="certificate-image" 
                         style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; cursor: pointer;" 
                         onclick="openCertificateViewer('${cert}', ${index})"
                         onerror="this.onerror=null; this.src='https://placehold.co/400x250/1e293b/3b82f6/png?text=Certificate+Not+Found';">
                    <button class="remove-certificate" onclick="removeCertificate(${index})">&times;</button>
                </div>
            `).join('');
        } else {
            certificatesContainer.innerHTML = '<p style="color: var(--text-gray);">No certificates uploaded yet.</p>';
        }
    }
    
    // ==================== EDIT FORM FIELDS ====================
    // Fill edit form with current values
    const editHeadline = document.getElementById('editHeadline');
    if (editHeadline) editHeadline.value = profile.headline || '';
    
    const editHourlyRate = document.getElementById('editHourlyRate');
    if (editHourlyRate) editHourlyRate.value = profile.hourly_rate || '';
    
    const editDescription = document.getElementById('editDescription');
    if (editDescription) editDescription.value = profile.description || '';
    
    const editExperienceLevel = document.getElementById('editExperienceLevel');
    if (editExperienceLevel) editExperienceLevel.value = profile.experience_level || 'intermediate';
    
    const editAvailability = document.getElementById('editAvailability');
    if (editAvailability) editAvailability.value = profile.availability || 'available';
    
    const editLocation = document.getElementById('editLocation');
    if (editLocation) editLocation.value = profile.location || '';
    
    const editPhone = document.getElementById('editPhone');
    if (editPhone) editPhone.value = profile.phone || '';
    
    const editWebsite = document.getElementById('editWebsite');
    if (editWebsite) editWebsite.value = profile.website || '';
    
    const editEducation = document.getElementById('editEducation');
    if (editEducation) editEducation.value = profile.education || '';
    
    const editCertifications = document.getElementById('editCertifications');
    if (editCertifications) editCertifications.value = profile.certifications || '';
    
    // Skills list for editing
    const skillsList = document.getElementById('skillsList');
    if (skillsList) {
        const skills = profile.skills || [];
        skillsList.innerHTML = skills.map(skill => `
            <span class="skill-tag">
                ${escapeHtml(skill)}
                <span class="remove-skill" onclick="this.parentElement.remove()">&times;</span>
            </span>
        `).join('');
    }
    
    // Languages list for editing
    const languagesList = document.getElementById('languagesList');
    if (languagesList) {
        const languages = profile.languages || [];
        languagesList.innerHTML = languages.map(lang => `
            <span class="skill-tag">
                ${escapeHtml(lang)}
                <span class="remove-skill" onclick="this.parentElement.remove()">&times;</span>
            </span>
        `).join('');
    }
}
function displayPlaceholderProfile() {
    const usernameEl = document.getElementById('profileUsername');
    if (usernameEl) usernameEl.textContent = currentUser?.username || 'Freelancer';
    
    const headlineEl = document.getElementById('profileHeadline');
    if (headlineEl) headlineEl.textContent = 'Complete your profile';
    
    const descriptionEl = document.getElementById('profileDescription');
    if (descriptionEl) descriptionEl.textContent = 'Click Edit Profile to add your professional information.';
    
    const skillsContainer = document.getElementById('profileSkills');
    if (skillsContainer) {
        skillsContainer.innerHTML = '<p style="color: var(--text-gray);">No skills added yet.</p>';
    }
    
    const languagesContainer = document.getElementById('profileLanguages');
    if (languagesContainer) {
        languagesContainer.innerHTML = '<p style="color: var(--text-gray);">No languages specified.</p>';
    }
}

function switchProfileTab(tabId) {
    // Hide all tab contents
    const tabContents = ['profileViewTabContent', 'profileEditTabContent', 'dashboardTabContent', 'profileReviewsTabContent'];
    tabContents.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) selectedTab.classList.remove('hidden');
    
    // Update tab buttons
    const tabBtns = ['profileViewTabBtn', 'profileEditTabBtn', 'dashboardTabBtn', 'profileReviewsTabBtn'];
    tabBtns.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.classList.remove('active');
    });
    
    // Find which button corresponds to this tab
    const buttonMap = {
        'profileViewTabContent': 'profileViewTabBtn',
        'profileEditTabContent': 'profileEditTabBtn',
        'dashboardTabContent': 'dashboardTabBtn',
        'profileReviewsTabContent': 'profileReviewsTabBtn'
    };
    
    const activeBtn = document.getElementById(buttonMap[tabId]);
    if (activeBtn) activeBtn.classList.add('active');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupProfileTabHandlers();
});
// ==================== ENHANCED SERVICE CARD RENDERING ====================

function renderServices(servicesToRender) {
    const container = $('servicesList');
    const noServices = $('noServices');

    if (!container) return;

    if (!servicesToRender || servicesToRender.length === 0) {
        container.innerHTML = '';
        if (noServices) noServices.style.display = 'block';
        return;
    }

    if (noServices) noServices.style.display = 'none';

    container.innerHTML = servicesToRender.map(service => {
        const serviceId = service.id;
        const title = service.title || 'Untitled Service';
        const description = service.description || 'No description available';
        const price = service.price || 0;
        const providerName = service.username || 'Unknown';
        const userId = service.user_id;
        const favoriteCount = service.favorite_count || 0;

        const providerPictureHtml = service.profile_picture_url ?
            `<div class="profile-picture-wrapper">
                <img src="${service.profile_picture_url}" alt="${providerName}" class="provider-profile-picture"
                     onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'provider-initials\\'>${providerName.charAt(0).toUpperCase()}</div>';">
            </div>` :
            `<div class="provider-initials">${providerName.charAt(0).toUpperCase()}</div>`;

        const isLoggedIn = !!currentUser;
        const isClient = currentUser?.role === 'client';
        const isFreelancer = currentUser?.role === 'freelancer';
        const isAdmin = currentUser?.role === 'admin';
        const isOwner = currentUser?.id === userId;

        let actionButtons = '';

        // Chat button
        actionButtons += `
            <button class="btn chat-btn" onclick="checkAndStartConversation(${serviceId}, ${userId})">
                <i class="fas fa-comments"></i> Chat
            </button>
            <button class="btn profile-btn" onclick="openFreelancerProfile(${userId})">
                <i class="fas fa-user"></i> View Profile
            </button>
        `;

        // Recruit button for clients
        if (isLoggedIn && isClient && !isOwner) {
            actionButtons += `
                <button class="btn recruit-btn" onclick="recruitFreelancer(${userId}, ${serviceId}, this)">
                    <i class="fas fa-user-plus"></i> Recruit
                </button>
            `;
        }

        // Review button for clients
        if (isLoggedIn && isClient && !isOwner) {
            actionButtons += `
                <button class="btn btn-secondary" onclick="showReviewModalForFreelancer(${userId}, '${escapeHtml(providerName)}', ${serviceId})">
                    <i class="fas fa-star"></i> Review
                </button>
            `;
        }

        // Favorite button
        if (isLoggedIn && !isOwner) {
            const isFavorited = service.is_favorited ? true : false;
            const favoriteIcon = isFavorited ? 'fas fa-heart' : 'far fa-heart';
            actionButtons += `
                <button class="btn favorite-btn ${isFavorited ? 'active' : ''}" onclick="toggleServiceFavorite(${serviceId}, this)" data-service-id="${serviceId}">
                    <i class="${favoriteIcon}"></i> Favorite <span class="favorite-count">${favoriteCount}</span>
                </button>
            `;
        }

        // Flag button for clients
        if (isLoggedIn && isClient && !isOwner) {
            actionButtons += `
                <button class="btn btn-secondary flag-btn" onclick="showFlagModal(${userId}, '${escapeHtml(providerName)}', ${serviceId})">
                    <i class="fas fa-flag"></i> Report
                </button>
            `;
        }

        // Delete button for owners/admins
        if (isLoggedIn && (isOwner || isAdmin)) {
            actionButtons += `
                <button class="btn btn-danger" onclick="confirmDeleteService(${serviceId}, '${escapeHtml(title)}', ${userId}, ${isOwner})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            `;
        }

        const rating = service.rating || service.avg_rating || 0;
        const reviewCount = service.review_count || 0;
        const ratingHtml = rating > 0 ? 
            `<div class="service-rating">
                <span class="stars">${generateStars(rating)}</span>
                <span class="rating-count">(${reviewCount})</span>
            </div>` : '';

        return `
            <div class="service-card" data-service-id="${serviceId}">
                <div class="service-header">
                    <h3 class="service-title">${escapeHtml(title)}</h3>
                    <div class="service-price">${price > 0 ? `$${price}` : 'Free'}</div>
                </div>

                <div class="service-provider-info">
                    ${providerPictureHtml}
                    <div class="provider-info">
                        <div class="service-provider-name">${escapeHtml(providerName)}</div>
                        <div class="service-provider">${escapeHtml(service.category || 'General')}</div>
                        ${ratingHtml}
                    </div>
                </div>

                <div class="description-container">
                    <p class="service-description">${escapeHtml(description.substring(0, 150))}${description.length > 150 ? '...' : ''}</p>
                </div>

                ${service.delivery_time ? `
                    <div style="margin: 10px 0; color: var(--text-gray); font-size: 0.9rem;">
                        <i class="fas fa-clock"></i> Delivery: ${service.delivery_time} days
                    </div>
                ` : ''}

                ${service.revisions ? `
                    <div style="margin: 5px 0; color: var(--text-gray); font-size: 0.9rem;">
                        <i class="fas fa-redo-alt"></i> Revisions: ${service.revisions}
                    </div>
                ` : ''}

                <div class="service-actions">
                    ${actionButtons}
                </div>

                <button class="btn btn-secondary view-details-btn" onclick="viewServiceDetailsModal(${serviceId})" style="width:100%; margin-top:10px;">
                    <i class="fas fa-info-circle"></i> View Full Details
                </button>
            </div>
        `;
    }).join('');
}
// ==================== STYLING FIXES ====================

// Add this CSS to your existing styles
const additionalStyles = `
    /* Category dropdown styling */
    .category-select, .category-input {
        background: var(--secondary-dark) !important;
        border: 2px solid rgba(255,255,255,0.1) !important;
        color: var(--text-light) !important;
    }
    
    .category-select option {
        background: var(--secondary-dark) !important;
        color: var(--text-light) !important;
    }
    
    .category-select:hover, .category-input:hover {
        border-color: var(--accent-blue) !important;
    }
    
    /* Service card improvements */
    .service-description {
        color: var(--text-gray);
        line-height: 1.5;
        margin: 12px 0;
    }
    
    .view-details-btn {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        transition: all 0.3s ease;
    }
    
    .view-details-btn:hover {
        background: rgba(59, 130, 246, 0.2);
        transform: translateY(-2px);
    }
    
    /* Package card improvements */
    .package-card {
        background: var(--secondary-dark);
        border-radius: 12px;
        padding: 20px;
    }
    
    .package-price-input {
        background: var(--card-bg);
        border: 1px solid rgba(255,255,255,0.1);
        color: var(--text-light);
        padding: 8px;
        border-radius: 6px;
        width: 100px;
    }
    
    .package-feature-input {
        background: transparent;
        border: none;
        color: var(--text-light);
        width: 100%;
        padding: 4px;
    }
    
    .package-feature-input:focus {
        outline: none;
        border-bottom: 1px solid var(--accent-blue);
    }
`;

// Add styles to document
const styleSheet = document.createElement("style");
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// ==================== INITIALIZATION ====================

/*********************
 *  Switch Tab Function *
 *********************/
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab) tab.classList.add('hidden');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        if (tab) tab.classList.remove('active');
    });

    // Show the selected tab
    const tabElement = $(tabName + 'Tab');
    if (tabElement) {
        tabElement.classList.remove('hidden');
    }

    // Highlight the clicked button
    const clickedButton = event?.target;
    if (clickedButton && clickedButton.classList.contains('tab')) {
        clickedButton.classList.add('active');
    }

    // Load content based on tab
    if (tabName === 'browse') {
        loadServices();
    } 
    else if (tabName === 'myServices') {
        if (userRole === 'freelancer') {
            loadMyServices();
        } else {
            // Make sure this is called for clients
            console.log("Loading My Freelancers tab");
            loadMyFreelancers();
        }
    } 
    else if (tabName === 'subscription') {
        loadSubscriptionStatus();
    } 
    else if (tabName === 'clients') {
        loadMyClients();
    } 
    else if (tabName === 'profile') {
        showFreelancerProfile();
    } 
    else if (tabName === 'favorites') {
        loadFavorites();
    } 
    else if (tabName === 'myOrders') {
        loadOrders();
    }
}
/*********************
 *  Authentication Functions *
 *********************/
// Update the handleLoginSubmit function
async function handleLoginSubmit(e) {
    e.preventDefault();
    const msgEl = $('loginMsg');
    if (msgEl) msgEl.innerHTML = "";

    const useUsername = $('usernameGroup') && $('usernameGroup').style.display !== 'none';
    const password = $('loginPasswordInput') ? $('loginPasswordInput').value : '';

    if (!password) {
        if (msgEl) msgEl.innerHTML = '<div class="text-error">Password is required</div>';
        return;
    }

    let identifier = '';
    if (useUsername) {
        identifier = $('loginUsernameInput') ? $('loginUsernameInput').value : '';
    } else {
        identifier = $('loginEmailInput') ? $('loginEmailInput').value : '';
    }

    if (!identifier) {
        if (msgEl) msgEl.innerHTML = '<div class="text-error">Username or email is required</div>';
        return;
    }

    try {
        const res = await fetch('/api/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
        [useUsername ? 'username' : 'email']: identifier, 
        password 
    })
});

        const data = await res.json();
        
        if (!res.ok) {
            if (msgEl) {
                msgEl.innerHTML = `<div class="text-error">${data.error || 'Login failed'}</div>`;
            }
            return;
        }

        if (msgEl) {
            msgEl.innerHTML = `<div class="text-success">✅ Login successful! Redirecting...</div>`;
        }

        if (data.user) {
            currentUser = data.user;
        } else if (data.id) {
            currentUser = data;
        } else {
            currentUser = data;
        }
        
        userRole = currentUser?.role || null;
        
        // Check subscription for freelancers
        if (userRole === 'freelancer') {
            await checkSubscriptionAndLock();
        }
        
        updateHeader();
        updateUIForUserRole();
        
        // Reload services and profile if needed
        if (userRole === 'freelancer') {
            await loadMyServices();
            await showFreelancerProfile();
        } else {
            await loadServices();
        }
        
        // Show welcome message for first-time users (after successful login)
        // Check if this is a new user from signup
        const isNewUser = sessionStorage.getItem('newUserRole') !== null;
        if (isNewUser) {
            setTimeout(() => {
                showWelcomeMessage();
                // Clear the flag after showing
                sessionStorage.removeItem('newUserRole');
                sessionStorage.removeItem('newUserName');
            }, 2000);
        } else {
            // Also check if user hasn't seen welcome message before
            setTimeout(() => {
                showWelcomeMessage();
            }, 2000);
        }
        
        setTimeout(async () => {
            closeModal($('loginModal'));
            if ($('loginForm')) $('loginForm').reset();
            showToast('✅ Logged in successfully!', 'success');
            
            // Refresh the page to apply all locks/restrictions
            if (userRole === 'freelancer') {
                const hasAccess = await checkSubscriptionAndLock();
                if (!hasAccess) {
                    showSubscriptionModal();
                }
            }
        }, 1500);

    } catch (err) {
        console.error('Login error:', err);
        if (msgEl) {
            msgEl.innerHTML = `<div class="text-error">Network error. Please try again.</div>`;
        }
    }
}
async function handleSignupSubmit(e) {
    e.preventDefault();
    const msgEl = $('signupMsg');
    if (msgEl) msgEl.innerHTML = "";

    const username = $('signupUsernameInput') ? $('signupUsernameInput').value.trim() : '';
    const email = $('signupEmailInput') ? $('signupEmailInput').value.trim() : '';
    const password = $('signupPasswordInput') ? $('signupPasswordInput').value : '';
    
    const roleRadio = document.querySelector('input[name="role"]:checked');
    const role = roleRadio ? roleRadio.value : 'client';

    if (!username || !email || !password) {
        if (msgEl) {
            msgEl.innerHTML = `<div class="text-error">All fields are required.</div>`;
        }
        return;
    }

    if (password.length < 6) {
        if (msgEl) {
            msgEl.innerHTML = `<div class="text-error">Password must be at least 6 characters.</div>`;
        }
        return;
    }

    try {
        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password, role })
        });

        const data = await res.json();
        
        if (!res.ok) {
            if (msgEl) {
                msgEl.innerHTML = `<div class="text-error">${data.error || 'Signup failed'}</div>`;
            }
            return;
        }

        if (msgEl) {
            msgEl.innerHTML = `<div class="text-success">✅ Account created! Redirecting to login...</div>`;
        }

        // Store the role for welcome message after login
        sessionStorage.setItem('newUserRole', role);
        sessionStorage.setItem('newUserName', username);

        setTimeout(() => {
            closeModal($('signupModal'));
            openModal($('loginModal'));
            
            const loginMsg = $('loginMsg');
            if (loginMsg) {
                loginMsg.innerHTML = `<div class="text-success">Account created successfully! Please login.</div>`;
            }
        }, 2000);

    } catch (err) {
        console.error('Signup error:', err);
        if (msgEl) {
            msgEl.innerHTML = `<div class="text-error">Network error. Please try again.</div>`;
        }
    }
}
// Updated handleOfferServiceClick with proper trial check
async function handleOfferServiceClick() {
    if (!currentUser) {
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    if (userRole === 'client') {
        showToast('Only freelancers can offer services. To offer services, please create a freelancer account.', 'info');
        openModal(document.getElementById('roleModal'));
        return;
    }
    
    if (userRole === 'freelancer') {
        const subStatus = await checkSubscriptionStatus();
        
        if (subStatus.hasActiveSubscription) {
            // Active trial or paid subscription - can create services
            showServicesBrowser();
            switchTab('myServices');
        } else {
            // Trial expired or no subscription
            showSubscriptionRestrictions();
            showSubscriptionModal();
        }
    } else {
        openModal(document.getElementById('roleModal'));
    }
}
// ============================================
// MESSAGE ACTIONS - EDIT, DELETE, COPY
// ============================================


  // ============================================
// MOBILE-FRIENDLY MESSAGE ACTIONS
// ============================================

// Global variable to track which message is being edited
let currentlyEditingMessageId = null;

// Edit message function - Mobile friendly
async function editMessage(messageId, currentText, messageElement) {
    // If already editing another message, cancel that edit first
    if (currentlyEditingMessageId) {
        cancelEdit(currentlyEditingMessageId);
    }
    
    currentlyEditingMessageId = messageId;
    
    // Find the message div
    let messageDiv = messageElement;
    if (messageElement && !messageElement.classList.contains('message')) {
        messageDiv = messageElement.closest('.message');
    }
    if (!messageDiv) {
        console.error("Could not find message div");
        return;
    }
    
    const messageTextDiv = messageDiv.querySelector('.message-text');
    if (!messageTextDiv) return;
    
    const originalText = currentText || messageTextDiv.textContent;
    const isMobile = window.innerWidth <= 768;
    
    // Create edit UI - optimized for mobile
    const editHtml = `
        <div class="message-edit-container" style="width: 100%;">
            <textarea class="message-edit-input" rows="${isMobile ? '3' : '2'}" 
                      style="width: 100%; padding: ${isMobile ? '14px' : '10px'}; background: var(--chat-input); border: 2px solid var(--accent-blue); border-radius: 12px; color: var(--text-light); font-size: ${isMobile ? '1rem' : '0.9rem'}; resize: vertical; font-family: inherit;">${escapeHtml(originalText)}</textarea>
            <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end;">
                <button class="btn btn-secondary btn-sm" onclick="cancelEdit(${messageId})" style="padding: ${isMobile ? '10px 16px' : '6px 12px'}; font-size: ${isMobile ? '0.9rem' : '0.85rem'};">
                    Cancel
                </button>
                <button class="btn btn-primary btn-sm" onclick="saveEdit(${messageId})" style="padding: ${isMobile ? '10px 16px' : '6px 12px'}; font-size: ${isMobile ? '0.9rem' : '0.85rem'};">
                    Save
                </button>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-gray); margin-top: 5px;">
                <i class="fas fa-info-circle"></i> You can edit messages within 30 minutes of sending
            </div>
        </div>
    `;
    
    // Replace message text with edit UI
    messageTextDiv.style.display = 'none';
    messageTextDiv.insertAdjacentHTML('afterend', editHtml);
    
    // Focus the textarea and show keyboard on mobile
    const textarea = messageDiv.querySelector('.message-edit-input');
    if (textarea) {
        textarea.focus();
        if (isMobile) {
            // On mobile, wait a bit then focus again to ensure keyboard shows
            setTimeout(() => textarea.focus(), 300);
        }
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    
    // Hide the original message actions
    const messageActions = messageDiv.querySelector('.message-actions');
    if (messageActions) messageActions.style.display = 'none';
}

// Cancel edit
function cancelEdit(messageId) {
    const messageDiv = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageDiv) return;
    
    const messageTextDiv = messageDiv.querySelector('.message-text');
    const editContainer = messageDiv.querySelector('.message-edit-container');
    
    if (editContainer) editContainer.remove();
    if (messageTextDiv) messageTextDiv.style.display = 'block';
    
    const messageActions = messageDiv.querySelector('.message-actions');
    if (messageActions) messageActions.style.display = 'flex';
    
    currentlyEditingMessageId = null;
}

// Save edited message
async function saveEdit(messageId) {
    const messageDiv = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageDiv) return;
    
    const textarea = messageDiv.querySelector('.message-edit-input');
    const newMessage = textarea?.value.trim();
    
    if (!newMessage) {
        showToast("Message cannot be empty", "warning");
        return;
    }
    
    if (newMessage.length > 2000) {
        showToast("Message too long (max 2000 characters)", "warning");
        return;
    }
    
    showToast("Saving changes...", "info");
    
    try {
        const response = await fetch(`/api/messages/${messageId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message: newMessage })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast("✅ Message edited", "success");
            
            // Update the message display
            const messageTextDiv = messageDiv.querySelector('.message-text');
            if (messageTextDiv) {
                messageTextDiv.innerHTML = escapeHtml(newMessage);
                messageTextDiv.style.display = 'block';
            }
            
            // Add "(edited)" label if not already there
            let editedLabel = messageDiv.querySelector('.edited-label');
            if (!editedLabel) {
                editedLabel = document.createElement('span');
                editedLabel.className = 'edited-label';
                editedLabel.style.fontSize = '0.65rem';
                editedLabel.style.opacity = '0.6';
                editedLabel.style.marginLeft = '8px';
                editedLabel.textContent = '(edited)';
                
                const timeDiv = messageDiv.querySelector('.message-time');
                if (timeDiv) {
                    timeDiv.appendChild(editedLabel);
                }
            } else {
                editedLabel.style.display = 'inline';
            }
            
            // Remove edit container
            const editContainer = messageDiv.querySelector('.message-edit-container');
            if (editContainer) editContainer.remove();
            
            // Show actions again
            const messageActions = messageDiv.querySelector('.message-actions');
            if (messageActions) messageActions.style.display = 'flex';
            
            currentlyEditingMessageId = null;
            
        } else {
            showToast(data.error || "Failed to edit message", "error");
        }
    } catch (err) {
        console.error("Edit error:", err);
        showToast("Error editing message", "error");
    }
}

// Delete message function - Mobile friendly with custom modal
async function deleteMessage(messageId, buttonElement, isOwnMessage = true) {
    if (!isOwnMessage) {
        showToast("You can only delete your own messages", "warning");
        return;
    }
    
    const isMobile = window.innerWidth <= 768;
    
    // Create custom modal for mobile (better than browser confirm)
    const modalHtml = `
        <div id="deleteConfirmModal" class="modal" style="display: flex; z-index: 10001;">
            <div class="modal-card" style="max-width: 350px; padding: 25px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <i class="fas fa-trash-alt" style="font-size: 3rem; color: #ef4444; margin-bottom: 15px;"></i>
                    <h3 style="color: var(--text-light); margin-bottom: 10px;">Delete Message?</h3>
                    <p style="color: var(--text-gray); margin-bottom: 15px;">This action cannot be undone.</p>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(239,68,68,0.1); border-radius: 8px; cursor: pointer;">
                        <input type="radio" name="deleteOption" value="everyone" checked>
                        <div>
                            <strong style="color: var(--text-light);">Delete for everyone</strong>
                            <p style="color: var(--text-gray); font-size: 0.8rem; margin: 0;">Message removed for all participants</p>
                        </div>
                    </label>
                    <label style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top: 10px; cursor: pointer;">
                        <input type="radio" name="deleteOption" value="self">
                        <div>
                            <strong style="color: var(--text-light);">Delete for me only</strong>
                            <p style="color: var(--text-gray); font-size: 0.8rem; margin: 0;">Only you will see "[you deleted this message]"</p>
                        </div>
                    </label>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" id="cancelDeleteBtn" style="flex: 1; padding: 12px;">Cancel</button>
                    <button class="btn btn-danger" id="confirmDeleteBtn" style="flex: 1; padding: 12px;">Delete</button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('deleteConfirmModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('deleteConfirmModal');
    
    // Handle cancel
    document.getElementById('cancelDeleteBtn').onclick = () => {
        modal.remove();
    };
    
    // Handle confirm
    document.getElementById('confirmDeleteBtn').onclick = async () => {
        const deleteOption = document.querySelector('input[name="deleteOption"]:checked').value;
        const deleteForEveryone = deleteOption === 'everyone';
        
        modal.remove();
        showToast("Deleting message...", "info");
        
        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ delete_for_everyone: deleteForEveryone })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                showToast(data.message, "success");
                
                const messageDiv = buttonElement.closest('.message');
                
                if (deleteForEveryone) {
                    // Replace message content with "[message deleted]"
                    const messageTextDiv = messageDiv.querySelector('.message-text');
                    if (messageTextDiv) {
                        messageTextDiv.textContent = "[message deleted]";
                        messageTextDiv.style.fontStyle = "italic";
                        messageTextDiv.style.opacity = "0.6";
                    }
                    
                    // Hide edit button (can't edit deleted message)
                    const editBtn = messageDiv.querySelector('.message-action-btn[onclick*="editMessage"]');
                    if (editBtn) editBtn.style.display = 'none';
                    
                    // Change delete button to disabled or remove it
                    const deleteBtn = messageDiv.querySelector('.message-action-btn[onclick*="deleteMessage"]');
                    if (deleteBtn) deleteBtn.style.display = 'none';
                    
                    // Add a visual indicator
                    messageDiv.classList.add('message-deleted');
                } else {
                    // Delete just for self - remove from DOM
                    const messageGroup = messageDiv.closest('.message-group');
                    if (messageGroup && messageGroup.children.length === 2) {
                        // If only this message in group, remove the whole group
                        messageGroup.remove();
                    } else {
                        // Remove just this message
                        messageDiv.remove();
                    }
                }
                
            } else {
                showToast(data.error || "Failed to delete message", "error");
            }
        } catch (err) {
            console.error("Delete error:", err);
            showToast("Error deleting message", "error");
        }
    };
    
    // Close modal when clicking outside
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };
}

// Copy message text to clipboard - Mobile friendly
async function copyMessage(messageText, buttonElement) {
    try {
        // Remove HTML tags if any
        const textToCopy = messageText.replace(/<[^>]*>/g, '');
        
        await navigator.clipboard.writeText(textToCopy);
        
        // Show success feedback on button
        const originalIcon = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-check"></i>';
        buttonElement.style.background = '#10b981';
        buttonElement.style.color = 'white';
        showToast("✓ Copied to clipboard!", "success");
        
        setTimeout(() => {
            buttonElement.innerHTML = originalIcon;
            buttonElement.style.background = '';
            buttonElement.style.color = '';
        }, 1500);
        
    } catch (err) {
        console.error("Copy error:", err);
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = messageText.replace(/<[^>]*>/g, '');
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast("✓ Copied to clipboard!", "success");
    }
}

// View edit history
async function viewEditHistory(messageId) {
    try {
        const response = await fetch(`/api/messages/${messageId}/history`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showToast(data.error || "Failed to load history", "error");
            return;
        }
        
        const isMobile = window.innerWidth <= 768;
        
        // Show history modal
        const modalContent = `
            <div style="max-width: 500px; width: 100%;">
                <h4 style="color: var(--text-light); margin-bottom: 15px;">Message Edit History</h4>
                <div style="background: var(--secondary-dark); padding: ${isMobile ? '20px' : '15px'}; border-radius: 10px; margin-bottom: 15px;">
                    <div style="color: var(--text-gray); font-size: 0.85rem; margin-bottom: 5px;">
                        <i class="fas fa-clock"></i> Sent: ${new Date(data.created_at).toLocaleString()}
                    </div>
                    <div style="color: var(--text-light); padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; word-break: break-word;">
                        ${escapeHtml(data.original_message || data.current_message)}
                    </div>
                </div>
                ${data.is_edited ? `
                    <div style="background: var(--secondary-dark); padding: ${isMobile ? '20px' : '15px'}; border-radius: 10px;">
                        <div style="color: var(--accent-gold); font-size: 0.85rem; margin-bottom: 5px;">
                            <i class="fas fa-edit"></i> Edited: ${new Date(data.edited_at).toLocaleString()}
                        </div>
                        <div style="color: var(--text-light); padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; word-break: break-word;">
                            ${escapeHtml(data.current_message)}
                        </div>
                    </div>
                ` : '<p style="color: var(--text-gray);">No edit history</p>'}
                <div style="margin-top: 20px; text-align: center;">
                    <button class="btn btn-secondary" onclick="closeModal(document.getElementById('editHistoryModal'))">Close</button>
                </div>
            </div>
        `;
        
        showModalWithContent("Edit History", modalContent);
        
    } catch (err) {
        console.error("History error:", err);
        showToast("Error loading edit history", "error");
    }
}
// Add edit/delete buttons to message hover
function addMessageActions(messageDiv, messageId, messageText) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    actionsDiv.innerHTML = `
        <button class="message-action-btn" onclick="editMessage(${messageId}, this)">
            <i class="fas fa-edit"></i>
        </button>
        <button class="message-action-btn" onclick="deleteMessage(${messageId}, this)">
            <i class="fas fa-trash"></i>
        </button>
        <button class="message-action-btn" onclick="copyMessage('${escapeHtml(messageText)}')">
            <i class="fas fa-copy"></i>
        </button>
    `;
    messageDiv.appendChild(actionsDiv);
}
// Updated message rendering with action buttons
function renderMessageWithActions(message) {
    const isMe = message.sender_id === currentUser?.id;
    const isDeleted = message.is_deleted;
    const isEdited = message.is_edited;
    
    let displayText = message.message || '';
    let actionsHtml = '';
    
    // Only show action buttons for own messages that aren't deleted (or allow copy for all)
    if (!isDeleted) {
        const copyButton = `<button class="message-action-btn" onclick="copyMessage('${escapeHtml(displayText)}', this)" title="Copy">
            <i class="fas fa-copy"></i>
        </button>`;
        
        if (isMe) {
            // My message - show all actions
            const timeSinceSent = (Date.now() - new Date(message.created_at).getTime()) / (1000 * 60);
            const canEdit = timeSinceSent <= 30; // 30 minute edit window
            
            actionsHtml = `
                <div class="message-actions">
                    ${copyButton}
                    ${canEdit ? `<button class="message-action-btn" onclick="editMessage(${message.id}, '${escapeHtml(displayText)}', this)" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>` : ''}
                    <button class="message-action-btn" onclick="deleteMessage(${message.id}, this, true)" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${isEdited ? `<button class="message-action-btn" onclick="viewEditHistory(${message.id})" title="Edit History">
                        <i class="fas fa-history"></i>
                    </button>` : ''}
                </div>
            `;
        } else {
            // Other's message - only copy button
            actionsHtml = `
                <div class="message-actions">
                    ${copyButton}
                </div>
            `;
        }
    }
    
    const editedLabel = isEdited ? '<span class="edited-label" style="font-size: 0.65rem; opacity: 0.6; margin-left: 8px;">(edited)</span>' : '';
    const deletedClass = isDeleted ? 'message-deleted' : '';
    const deletedText = isDeleted ? '<span style="font-style: italic; opacity: 0.6;">[message deleted]</span>' : escapeHtml(displayText);
    
    const timeString = new Date(message.created_at).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
    
    return `
        <div class="message ${isMe ? 'sent' : 'received'} ${deletedClass}" data-message-id="${message.id}">
            <div class="message-text">${deletedText}</div>
            <div class="message-time">
                ${timeString}
                ${editedLabel}
            </div>
            ${actionsHtml}
        </div>
    `;
}
// ============================================
// MOBILE CHAT NAVIGATION
// ============================================

// ============================================
// MOBILE CHAT NAVIGATION - COMPLETE FIX
// ============================================

let currentMobilePanel = 'conversations'; // 'conversations', 'chat', 'info'

function showMobilePanel(panel) {
    const sidebar = document.querySelector('.inbox-sidebar');
    const main = document.querySelector('.inbox-main');
    const rightSidebar = document.querySelector('.inbox-sidebar-right');
    
    // Remove active class from all
    if (sidebar) sidebar.classList.remove('mobile-active');
    if (main) main.classList.remove('mobile-active');
    if (rightSidebar) rightSidebar.classList.remove('mobile-active');
    
    // Show selected panel
    if (panel === 'conversations') {
        if (sidebar) sidebar.classList.add('mobile-active');
        currentMobilePanel = 'conversations';
        console.log("Mobile: Showing conversations panel");
    } else if (panel === 'chat') {
        if (main) main.classList.add('mobile-active');
        currentMobilePanel = 'chat';
        console.log("Mobile: Showing chat panel");
    } else if (panel === 'info') {
        if (rightSidebar) rightSidebar.classList.add('mobile-active');
        currentMobilePanel = 'info';
        console.log("Mobile: Showing info panel");
    }
}

// Add mobile back buttons
function addMobileBackButtons() {
    // Only on mobile
    if (window.innerWidth > 768) return;
    
    // Add back button to chat header (to go back to conversations)
    const chatHeader = document.querySelector('.chat-header');
    if (chatHeader && !document.querySelector('.mobile-back-btn-chat')) {
        const backBtn = document.createElement('div');
        backBtn.className = 'mobile-back-btn mobile-back-btn-chat';
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> <span>Back to Chats</span>';
        backBtn.onclick = () => showMobilePanel('conversations');
        chatHeader.insertBefore(backBtn, chatHeader.firstChild);
    }
    
    // Add back button to user info panel
    const userInfoHeader = document.querySelector('.user-info-header');
    if (userInfoHeader && !document.querySelector('.mobile-back-btn-info')) {
        const backBtn = document.createElement('div');
        backBtn.className = 'mobile-back-btn mobile-back-btn-info';
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> <span>Back to Chat</span>';
        backBtn.style.marginBottom = '15px';
        backBtn.onclick = () => showMobilePanel('chat');
        userInfoHeader.parentNode.insertBefore(backBtn, userInfoHeader);
    }
}

// Initialize mobile view - THIS IS THE KEY FUNCTION THAT WAS MISSING
function initMobileChatView() {
    if (window.innerWidth <= 768) {
        console.log("Mobile device detected - initializing chat view");
        // On mobile, start with conversations panel
        showMobilePanel('conversations');
        addMobileBackButtons();
    } else {
        // On desktop, ensure all panels are visible
        const sidebar = document.querySelector('.inbox-sidebar');
        const main = document.querySelector('.inbox-main');
        const rightSidebar = document.querySelector('.inbox-sidebar-right');
        
        if (sidebar) sidebar.classList.remove('mobile-active');
        if (main) main.classList.remove('mobile-active');
        if (rightSidebar) rightSidebar.classList.remove('mobile-active');
        
        // Remove mobile back buttons
        document.querySelectorAll('.mobile-back-btn').forEach(btn => btn.remove());
    }
}
// Initialize mobile chat when inbox is opened
const originalShowInboxMobile = window.showInbox;
window.showInbox = function() {
    if (originalShowInboxMobile) originalShowInboxMobile();
    
    setTimeout(() => {
        handleMobileResize();
        setupMobileUserInfo();
        
        // Listen for resize events
        window.addEventListener('resize', handleMobileResize);
    }, 100);
};
function showSubscriptionRestrictions() {
    const heroSection = document.querySelector('.hero');
    if (heroSection && !document.querySelector('.restriction-banner')) {
        const restrictionBanner = document.createElement('div');
        restrictionBanner.className = 'subscription-banner warning restriction-banner';
        restrictionBanner.style.marginBottom = '20px';
        restrictionBanner.innerHTML = `
            <div class="subscription-info">
                <div class="subscription-icon" style="background: var(--warning-orange);">
                    <i class="fas fa-lock"></i>
                </div>
                <div class="subscription-text">
                    <h3>⚠️ Subscription Required</h3>
                    <p>Your free trial has ended. Please subscribe to continue offering services.</p>
                </div>
            </div>
            <button class="btn btn-primary" id="restrictionSubscribeBtn">Subscribe Now</button>
        `;
        
        heroSection.insertAdjacentElement('afterend', restrictionBanner);
        
        document.getElementById('restrictionSubscribeBtn')?.addEventListener('click', () => {
            showSubscriptionModal();
        });
    }
}
/*********************
 *  Fix All Inbox Buttons *
 *********************/
function fixAllInboxButtons() {
    console.log('Fixing all inbox buttons...');
    
    const allButtons = document.querySelectorAll('button');
    let fixedCount = 0;
    
    allButtons.forEach(btn => {
        const btnText = btn.textContent || '';
        const btnHtml = btn.innerHTML || '';
        
        if (btnText.includes('Inbox') || btnHtml.includes('📩') || btn.classList.contains('inbox-btn') || btn.id === 'inboxButton') {
            console.log('Found inbox button to fix:', btn);
            
            btn.onclick = null;
            
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Fixed inbox button clicked');
                showInbox();
                return false;
            });
            
            fixedCount++;
        }
    });
    
    console.log(`Fixed ${fixedCount} inbox button(s)`);
}

/*********************
 *  Event Listeners  *
 *********************/
function setupEventListeners() {
    // Find Services button
    if ($('findServicesBtn')) {
        $('findServicesBtn').addEventListener('click', () => {
            showServicesBrowser();
            if (typeof switchTab === 'function') switchTab('browse');
        });
    }

    // Offer Service button
    if ($('offerServiceBtn')) {
        $('offerServiceBtn').addEventListener('click', handleOfferServiceClick);
    }

    // Service form submission
    if ($('serviceForm')) {
        $('serviceForm').addEventListener('submit', handleServiceFormSubmit);
    }

    // Cancel create service button
    if ($('cancelCreateServiceBtn')) {
        $('cancelCreateServiceBtn').addEventListener('click', hideCreateServiceForm);
    }

    // Login form
    if ($('loginForm')) {
        $('loginForm').addEventListener('submit', handleLoginSubmit);
    }

    // Signup form
    if ($('signupForm')) {
        $('signupForm').addEventListener('submit', handleSignupSubmit);
    }

    // Close modal buttons
    if ($('closeLogin')) {
        $('closeLogin').addEventListener('click', () => closeModal($('loginModal')));
    }

    if ($('closeSignup')) {
        $('closeSignup').addEventListener('click', () => closeModal($('signupModal')));
    }

    if ($('closeRoleModal')) {
        $('closeRoleModal').addEventListener('click', () => closeModal($('roleModal')));
    }

    if ($('closeFreelancerProfileModal')) {
        $('closeFreelancerProfileModal').addEventListener('click', () => closeModal($('freelancerProfileModal')));
    }

    if ($('closeCertificateViewer')) {
        $('closeCertificateViewer').addEventListener('click', () => closeModal($('certificateViewerModal')));
    }

    // New conversation modal
    if ($('closeNewConversationModal')) {
        $('closeNewConversationModal').addEventListener('click', closeNewConversationModal);
    }

    if ($('cancelNewConversationBtn')) {
        $('cancelNewConversationBtn').addEventListener('click', closeNewConversationModal);
    }

    // Login toggle buttons
    if ($('loginByUsername')) {
        $('loginByUsername').addEventListener('click', () => {
            $('loginByUsername').style.background = 'var(--accent-blue)';
            $('loginByUsername').style.color = 'white';
            $('loginByEmail').style.background = 'transparent';
            $('loginByEmail').style.color = 'var(--text-gray)';
            $('usernameGroup').style.display = 'block';
            $('emailGroup').style.display = 'none';
        });
    }

    if ($('loginByEmail')) {
        $('loginByEmail').addEventListener('click', () => {
            $('loginByEmail').style.background = 'var(--accent-blue)';
            $('loginByEmail').style.color = 'white';
            $('loginByUsername').style.background = 'transparent';
            $('loginByUsername').style.color = 'var(--text-gray)';
            $('usernameGroup').style.display = 'none';
            $('emailGroup').style.display = 'block';
        });
    }

    // Password visibility toggles
    if ($('toggleLoginPwd')) {
        $('toggleLoginPwd').addEventListener('click', () => {
            const field = $('loginPasswordInput');
            if (field) field.type = field.type === 'password' ? 'text' : 'password';
        });
    }

    if ($('toggleSignupPwd')) {
        $('toggleSignupPwd').addEventListener('click', () => {
            const field = $('signupPasswordInput');
            if (field) field.type = field.type === 'password' ? 'text' : 'password';
        });
    }

    // Switch between login and signup
    if ($('openSignupFromLogin')) {
        $('openSignupFromLogin').addEventListener('click', () => {
            closeModal($('loginModal'));
            openModal($('signupModal'));
        });
    }

    if ($('openLoginFromSignup')) {
        $('openLoginFromSignup').addEventListener('click', () => {
            closeModal($('signupModal'));
            openModal($('loginModal'));
        });
    }

    // Profile picture upload
    if ($('updatePhotoBtn') && $('profilePictureInput')) {
        $('updatePhotoBtn').addEventListener('click', () => {
            $('profilePictureInput').click();
        });
    }

    // Profile tab buttons - UPDATED with reviews loading
if (document.getElementById('profileViewTabBtn')) {
    document.getElementById('profileViewTabBtn').addEventListener('click', () => switchProfileTab('profileViewTabContent'));
}

if (document.getElementById('profileEditTabBtn')) {
    document.getElementById('profileEditTabBtn').addEventListener('click', () => switchProfileTab('profileEditTabContent'));
}

if (document.getElementById('dashboardTabBtn')) {
    document.getElementById('dashboardTabBtn').addEventListener('click', () => switchProfileTab('dashboardTabContent'));
}

if (document.getElementById('profileServicesTabBtn')) {
    document.getElementById('profileServicesTabBtn').addEventListener('click', () => {
        showServicesBrowser();
        switchTab('myServices');
    });
}

// UPDATED: Profile Reviews Tab - Loads reviews when clicked
if (document.getElementById('profileReviewsTabBtn')) {
    const reviewsTabBtn = document.getElementById('profileReviewsTabBtn');
    // Remove existing listeners by cloning
    const newReviewsBtn = reviewsTabBtn.cloneNode(true);
    reviewsTabBtn.parentNode.replaceChild(newReviewsBtn, reviewsTabBtn);
    
    newReviewsBtn.addEventListener('click', async () => {
        console.log("Reviews tab clicked - loading reviews...");
        switchProfileTab('profileReviewsTabContent');
        await loadFreelancerReviews();
    });
}

    if ($('profileReviewsTabBtn')) {
        $('profileReviewsTabBtn').addEventListener('click', () => switchProfileTab('profileReviewsTabContent'));
    }

    // Cancel edit button
    if ($('cancelEditBtn')) {
        $('cancelEditBtn').addEventListener('click', () => switchProfileTab('profileViewTabContent'));
    }

    // Profile form
    if ($('profileForm')) {
        $('profileForm').addEventListener('submit', handleProfileFormSubmit);
    }

    // Main navigation tabs
    if ($('browseTabBtn')) {
        $('browseTabBtn').addEventListener('click', () => switchTab('browse'));
    }

    if ($('myProvidersTabBtn')) {
        $('myProvidersTabBtn').addEventListener('click', () => switchTab('myServices'));
    }

    if ($('favoritesTabBtn')) {
        $('favoritesTabBtn').addEventListener('click', () => switchTab('favorites'));
    }

    if ($('myOrdersTabBtn')) {
        $('myOrdersTabBtn').addEventListener('click', () => switchTab('myOrders'));
    }

    // Provider tabs
    if ($('providerBrowseTabBtn')) {
        $('providerBrowseTabBtn').addEventListener('click', () => switchTab('browse'));
    }

    if ($('providerMyServicesTabBtn')) {
        $('providerMyServicesTabBtn').addEventListener('click', () => switchTab('myServices'));
    }

    if ($('providerProfileTabBtn')) {
        $('providerProfileTabBtn').addEventListener('click', showFreelancerProfile);
    }

    if ($('providerSubscriptionTabBtn')) {
        $('providerSubscriptionTabBtn').addEventListener('click', () => switchTab('subscription'));
    }

    if ($('providerClientsTabBtn')) {
        $('providerClientsTabBtn').addEventListener('click', () => switchTab('clients'));
    }

    // Create service button
    if ($('createServiceBtn')) {
        $('createServiceBtn').addEventListener('click', showCreateServiceForm);
    }

    // Browse to recruit button
    if ($('browseToRecruitBtn')) {
        $('browseToRecruitBtn').addEventListener('click', () => switchTab('browse'));
    }

    if ($('browseFromFavoritesBtn')) {
        $('browseFromFavoritesBtn').addEventListener('click', () => switchTab('browse'));
    }

    if ($('manageProfileBtn')) {
        $('manageProfileBtn').addEventListener('click', showFreelancerProfile);
    }

    // Subscription buttons
    if ($('startFreeTrialBtn')) {
        $('startFreeTrialBtn').addEventListener('click', startFreeTrial);
    }

    if ($('subscribeMonthlyBtn')) {
        $('subscribeMonthlyBtn').addEventListener('click', () => subscribe('monthly'));
    }

    if ($('subscribeYearlyBtn')) {
        $('subscribeYearlyBtn').addEventListener('click', () => subscribe('yearly'));
    }

    if ($('subscribeMonthlyFromTabBtn')) {
        $('subscribeMonthlyFromTabBtn').addEventListener('click', () => subscribe('monthly'));
    }

    if ($('subscribeYearlyFromTabBtn')) {
        $('subscribeYearlyFromTabBtn').addEventListener('click', () => subscribe('yearly'));
    }

    // Inbox buttons
    if ($('startNewChatBtn')) {
        $('startNewChatBtn').addEventListener('click', startNewConversation);
    }

    if ($('newMessageFromEmptyBtn')) {
        $('newMessageFromEmptyBtn').addEventListener('click', startNewConversation);
    }

    if ($('toggleUserInfoBtn')) {
        $('toggleUserInfoBtn').addEventListener('click', () => {
            const panel = $('userInfoPanel');
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
    }

    if ($('closeUserInfoBtn')) {
        $('closeUserInfoBtn').addEventListener('click', () => {
            const panel = $('userInfoPanel');
            if (panel) panel.style.display = 'none';
        });
    }

    // User search
    if ($('performUserSearchBtn')) {
        $('performUserSearchBtn').addEventListener('click', performUserSearch);
    }

    if ($('userSearch')) {
        $('userSearch').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performUserSearch();
        });
    }

    // Inbox attachments
    if ($('attachImageBtn')) {
        $('attachImageBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
    }

    if ($('fileInput')) {
        $('fileInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                selectedFile = e.target.files[0];
                showToast('Image selected: ' + selectedFile.name, 'info');
            }
        });
    }

    // Service search and filters
    if ($('serviceSearch')) {
        $('serviceSearch').addEventListener('input', debounce(() => {
            if ($('browseTab') && !$('browseTab').classList.contains('hidden')) {
                filterAndRenderServices();
            }
        }, 300));
    }

    if ($('categoryFilter')) {
        $('categoryFilter').addEventListener('change', filterAndRenderServices);
    }

    if ($('sortFilter')) {
        $('sortFilter').addEventListener('change', filterAndRenderServices);
    }

    if ($('clearFiltersBtn')) {
        $('clearFiltersBtn').addEventListener('click', () => {
            if ($('serviceSearch')) $('serviceSearch').value = '';
            if ($('categoryFilter')) $('categoryFilter').value = '';
            if ($('sortFilter')) $('sortFilter').value = 'newest';
            filterAndRenderServices();
        });
    }

    // Mobile menu toggle
    if ($('mobileMenuToggle')) {
        $('mobileMenuToggle').addEventListener('click', () => {
            $('mobileNav').classList.toggle('open');
        });
    }
    
    // Service details modal close
    if ($('closeServiceDetails')) {
        $('closeServiceDetails').addEventListener('click', () => closeModal($('serviceDetailsModal')));
    }

    // ADMIN BUTTONS - Add these
    // Admin Review Button (in header)
    const adminReviewBtn = document.getElementById('adminReviewBtn');
    if (adminReviewBtn) {
        adminReviewBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Admin Review button clicked");
            showAdminReviewPanel();
        });
    }
    
    // Admin Dashboard Button
    const adminDashboardBtn = document.getElementById('adminDashboardBtn');
    if (adminDashboardBtn) {
        adminDashboardBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Admin Dashboard button clicked");
            showAdminDashboard();
        });
    }
}
function handleOfferServiceClick() {
    if (!currentUser) {
        openModal($('loginModal'));
    } else {
        if (userRole === 'client') {
            showToast('Only freelancers can offer services. To offer services, please create a freelancer account.', 'info');
            // Show a different message or redirect to signup
            openModal($('signupModal')); // Optional: show signup modal instead
        } else if (userRole === 'freelancer') {
            // Check subscription status and show services
            fetch('/api/subscription/status', {
                credentials: 'include'
            })
            .then(res => res.json())
            .then(data => {
                if (data.hasActiveSubscription) {
                    showServicesBrowser();
                    switchTab('myServices');
                } else {
                    showSubscriptionRestrictions();
                }
            })
            .catch(() => {
                showServicesBrowser();
                switchTab('myServices');
            });
        } else {
            // If no role, default to client or show signup
            showToast('Please create a new account or contact support', 'info');
            openModal($('signupModal'));
        }
    }
}

async function startFreeTrial() {
    if (!currentUser) {
        openModal($('loginModal'));
        return;
    }

    userRole = 'freelancer';
    updateUIForUserRole();
    showCreateServiceForm();
}


// Add this function
async function reportUserInChat(userId) {
    if (!currentUser) {
        showToast("Please login to report", "warning");
        return;
    }
    
    const userType = currentUser.role === 'client' ? 'freelancer' : 'client';
    const reason = prompt("Please explain why you're reporting this user (minimum 10 characters):");
    
    if (!reason) return;
    if (reason.length < 10) {
        showToast("Please provide a detailed reason (minimum 10 characters)", "warning");
        return;
    }
    
    try {
        const endpoint = currentUser.role === 'client' ? '/api/users/flag' : '/api/client/flag';
        const body = currentUser.role === 'client' 
            ? { flagged_user_id: userId, reason: reason }
            : { client_id: userId, reason: reason };
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message || "Report submitted successfully", "success");
        } else {
            showToast(data.error || "Failed to submit report", "error");
        }
    } catch (err) {
        console.error("Report error:", err);
        showToast("Error submitting report", "error");
    }
}
// Call this after loading messages
function initMessageClickHandler() {
    setupMessageClickHandler();
}

// Call when loading messages
const originalLoadMessagesForConversation = window.loadMessagesForConversation;
window.loadMessagesForConversation = async function(conversationId) {
    if (originalLoadMessagesForConversation) {
        await originalLoadMessagesForConversation(conversationId);
    }
    // Setup click handler after messages are loaded
    setTimeout(setupMessageClickHandler, 100);
};
/*********************
 *  Initialization   *
 *********************/
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await checkAuthStatus();
        await loadCategories();
        setupEventListeners();
        setupServiceForm();
        setupMessageForm();
        updateCharCount();
        showServicesBrowser();
        
        setTimeout(attachAuthButtonListeners, 100);
        setTimeout(attachAuthButtonListeners, 500);
        setTimeout(attachAuthButtonListeners, 1000);
        
        setupModalCloseListeners();
        
        // Fix inbox buttons after everything is loaded
        setTimeout(fixAllInboxButtons, 1000);
        setTimeout(fixAllInboxButtons, 2000);
        setTimeout(fixAllInboxButtons, 3000);
        
        console.log("Service page initialized successfully");

    } catch (error) {
        console.error("Initialization error:", error);
        showServicesBrowser();
    }
});

function setupModalCloseListeners() {
    const closeLogin = document.getElementById('closeLogin');
    const closeSignup = document.getElementById('closeSignup');
    const closeRoleModal = document.getElementById('closeRoleModal');
    
    if (closeLogin) {
        closeLogin.onclick = (e) => {
            e.preventDefault();
            closeModal(document.getElementById('loginModal'));
        };
    }
    
    if (closeSignup) {
        closeSignup.onclick = (e) => {
            e.preventDefault();
            closeModal(document.getElementById('signupModal'));
        };
    }
    
    
    window.onclick = function(event) {
        const loginModal = document.getElementById('loginModal');
        const signupModal = document.getElementById('signupModal');
        const roleModal = document.getElementById('roleModal');
        
        if (event.target === loginModal) {
            closeModal(loginModal);
        }
        if (event.target === signupModal) {
            closeModal(signupModal);
        }
        if (event.target === roleModal) {
            closeModal(roleModal);
        }
    };
}

function attachAuthButtonListeners() {
    const loginBtns = document.querySelectorAll('.auth-btn:not(.signup-btn)');
    const signupBtns = document.querySelectorAll('.auth-btn.signup-btn');
    
    loginBtns.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.classList.remove('hidden');
                loginModal.style.display = 'flex';
                loginModal.classList.add('open');
            }
        };
    });
    
    signupBtns.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const signupModal = document.getElementById('signupModal');
            if (signupModal) {
                signupModal.classList.remove('hidden');
                signupModal.style.display = 'flex';
                signupModal.classList.add('open');
            }
        };
    });
}

// Mobile navigation toggle
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileNav = document.getElementById('mobileNav');
    
    if (mobileMenuToggle && mobileNav) {
        mobileMenuToggle.addEventListener('click', function() {
            mobileNav.classList.toggle('open');
        });
    }
});




// ============================================
// ADD THESE FUNCTIONS TO YOUR services.html
// ============================================

async function checkAndStartConversation(serviceId, freelancerId) {
    if (!currentUser) {
        showToast("Please login to start a conversation", "warning");
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    if (parseInt(currentUser.id) === parseInt(freelancerId)) {
        showToast("You cannot start a conversation with yourself", "warning");
        return;
    }
    
    showToast("Starting conversation...", "info");
    
    try {
        let response;
        
        if (serviceId) {
            response = await fetch("/api/conversations/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    service_id: parseInt(serviceId),
                    recipient_id: parseInt(freelancerId)
                })
            });
        } else {
            response = await fetch("/api/conversations/start-without-service", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    recipient_id: parseInt(freelancerId)
                })
            });
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            showToast(data.error || "Failed to start conversation", "error");
            return;
        }
        
        if (!data.conversation_id) {
            showToast("Failed to get conversation ID", "error");
            return;
        }
        
        // Get username
        let username = "User";
        try {
            const userRes = await fetch(`/api/users/${freelancerId}/profile`, {
                credentials: 'include'
            });
            if (userRes.ok) {
                const userData = await userRes.json();
                username = userData.username || "User";
            }
        } catch (e) {
            console.error("Error fetching username:", e);
        }
        
        showToast("✅ Conversation started!", "success");
        
        // Show inbox and open conversation
        window.activeConversationId = data.conversation_id;
        window.activeConversationUserId = freelancerId;
        
        // Switch to inbox
        showInbox();
        
        setTimeout(() => {
            openConversation(data.conversation_id, username, freelancerId);
        }, 500);
        
    } catch (err) {
        console.error("Start conversation error:", err);
        showToast("Failed to start conversation", "error");
    }
}

async function toggleServiceFavorite(serviceId, buttonElement) {
    if (!currentUser) {
        showToast("Please login to favorite services", "warning");
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    try {
        const response = await fetch("/api/services/" + serviceId + "/favorite", {
            method: "POST",
            credentials: "include"
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const icon = buttonElement.querySelector('i');
            const countSpan = buttonElement.querySelector('.favorite-count');
            
            if (data.favorited) {
                icon.className = 'fas fa-heart';
                buttonElement.classList.add('active');
            } else {
                icon.className = 'far fa-heart';
                buttonElement.classList.remove('active');
            }
            
            if (countSpan) {
                countSpan.textContent = data.favoriteCount || 0;
            }
            
            showToast(data.message || "Favorite updated", "success");
        } else {
            showToast(data.error || "Failed to update favorite", "error");
        }
    } catch (err) {
        console.error("Favorite error:", err);
        showToast("Error updating favorite", "error");
    }
}

async function recruitFreelancer(freelancerId, serviceId, buttonElement) {
    if (!currentUser) {
        showToast("Please login to recruit freelancers", "warning");
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    if (currentUser.role !== 'client') {
        showToast("Only clients can recruit freelancers", "error");
        return;
    }
    
    // Check if already recruited
    const isRecruited = buttonElement.classList.contains('recruited');
    
    if (isRecruited) {
        const confirmRemove = confirm(`This freelancer is already in your list. Do you want to remove them?`);
        if (!confirmRemove) return;
        
        try {
            const response = await fetch("/api/freelancer/remove", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ freelancerId: freelancerId })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                buttonElement.classList.remove('recruited');
                buttonElement.innerHTML = '<i class="fas fa-user-plus"></i> Recruit';
                showToast("Freelancer removed from your list", "success");
                
                // Hide the review button for this freelancer
                const reviewBtn = document.querySelector(`.review-btn[data-freelancer-id="${freelancerId}"]`);
                if (reviewBtn) reviewBtn.style.display = 'none';
                
                // Update badge count
                await updateProvidersBadge();
                
                // Refresh My Freelancers tab if open
                const myServicesTab = document.getElementById('myServicesTab');
                if (myServicesTab && !myServicesTab.classList.contains('hidden')) {
                    await loadMyFreelancers();
                }
            } else {
                showToast(data.error || "Failed to remove", "error");
            }
        } catch (err) {
            console.error("Remove error:", err);
            showToast("Error removing freelancer", "error");
        }
        return;
    }
    
    // New recruitment
    try {
        showToast("Adding freelancer to your list...", "info");
        
        const response = await fetch("/api/freelancer/recruit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                freelancerId: freelancerId,
                serviceId: serviceId
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            buttonElement.classList.add('recruited');
            buttonElement.innerHTML = '<i class="fas fa-check"></i> Recruited';
            showToast("✅ Freelancer added to your providers list!", "success");
            
            // Show the review button for this freelancer
            const reviewBtn = document.querySelector(`.review-btn[data-freelancer-id="${freelancerId}"]`);
            if (reviewBtn) {
                reviewBtn.style.display = 'flex';
                reviewBtn.onclick = () => {
                    showReviewModalForFreelancer(freelancerId, reviewBtn.dataset.freelancerName, serviceId);
                };
            }
            
            // Update badge count
            await updateProvidersBadge();
            
            // Refresh My Freelancers tab if open
            const myServicesTab = document.getElementById('myServicesTab');
            if (myServicesTab && !myServicesTab.classList.contains('hidden')) {
                await loadMyFreelancers();
            }
        } else {
            showToast(data.error || "Failed to recruit", "error");
        }
    } catch (err) {
        console.error("Recruit error:", err);
        showToast("Error recruiting freelancer", "error");
    }
}

// Update providers badge count
async function updateProvidersBadge() {
    try {
        const response = await fetch('/api/client/providers', {
            credentials: 'include'
        });
        
        if (!response.ok) return;
        
        let providers = await response.json();
        if (!Array.isArray(providers)) providers = [];
        
        const badge = document.getElementById('providersBadge');
        if (badge) {
            if (providers.length > 0) {
                badge.textContent = providers.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (err) {
        console.error("Error updating badge:", err);
    }
}
async function viewServiceDetailsModal(serviceId) {
    try {
        const response = await fetch(`/api/services/${serviceId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error("Failed to load service details");
        }
        
        const service = await response.json();
        const modal = document.getElementById('serviceDetailsModal');
        const content = document.getElementById('serviceDetailsContent');
        
        if (!modal || !content) return;
        
        content.innerHTML = `
            <div style="max-height: 70vh; overflow-y: auto;">
                <div class="service-header" style="margin-bottom: 20px;">
                    <h2 style="color: var(--text-light);">${escapeHtml(service.title)}</h2>
                    <div class="service-price" style="font-size: 2rem; color: var(--accent-gold);">
                        ${service.price > 0 ? `$${service.price}` : 'Free'}
                    </div>
                </div>
                
                <div class="service-provider-info" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                            ${service.username ? service.username.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                            <div style="color: var(--text-light); font-weight: 600;">${escapeHtml(service.username || 'Unknown')}</div>
                            <div style="color: var(--text-gray); font-size: 0.9rem;">${escapeHtml(service.category || 'General')}</div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: var(--text-light); margin-bottom: 10px;">Description</h3>
                    <p style="color: var(--text-gray); line-height: 1.6;">${escapeHtml(service.description || 'No description provided.')}</p>
                </div>
                
                ${service.delivery_time ? `
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: var(--text-light); margin-bottom: 10px;">Delivery Time</h3>
                        <p style="color: var(--text-gray);"><i class="fas fa-clock"></i> ${service.delivery_time} days</p>
                    </div>
                ` : ''}
                
                ${service.revisions ? `
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: var(--text-light); margin-bottom: 10px;">Revisions</h3>
                        <p style="color: var(--text-gray);"><i class="fas fa-redo-alt"></i> ${service.revisions} revisions included</p>
                    </div>
                ` : ''}
                
                ${service.tags && service.tags.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: var(--text-light); margin-bottom: 10px;">Tags</h3>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${service.tags.map(tag => `<span class="tag" style="background: rgba(59,130,246,0.1); padding: 5px 12px; border-radius: 20px; font-size: 0.85rem;">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${service.requirements && service.requirements.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: var(--text-light); margin-bottom: 10px;">Requirements</h3>
                        <ul style="color: var(--text-gray); list-style: none; padding-left: 0;">
                            ${service.requirements.map(req => `<li style="padding: 8px 0;"><i class="fas fa-check-circle" style="color: var(--accent-gold); margin-right: 10px;"></i> ${escapeHtml(req)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                <div class="service-actions" style="display: flex; gap: 10px; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <button class="btn btn-primary" onclick="checkAndStartConversation(${service.id}, ${service.user_id})">
                        <i class="fas fa-comments"></i> Message Provider
                    </button>
                    <button class="btn btn-secondary" onclick="openFreelancerProfile(${service.user_id})">
                        <i class="fas fa-user"></i> View Profile
                    </button>
                    <button class="btn btn-secondary" onclick="closeModal(document.getElementById('serviceDetailsModal'))">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        openModal(modal);
        
    } catch (err) {
        console.error("Error loading service details:", err);
        showToast("Failed to load service details", "error");
    }
}

// ==================== EDIT SERVICE FUNCTION ====================
async function editService(serviceId) {
    if (!currentUser) {
        showToast('Please login to edit services', 'warning');
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    try {
        showToast('Loading service details...', 'info');
        
        const response = await fetch(`/api/services/${serviceId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load service');
        }
        
        const service = await response.json();
        
        // Check if user owns this service
        if (currentUser.id !== service.user_id && currentUser.role !== 'admin') {
            showToast('You can only edit your own services', 'error');
            return;
        }
        
        // Populate edit form (you'll need to create an edit modal or form)
        showEditServiceModal(service);
        
    } catch (err) {
        console.error('Error loading service for edit:', err);
        showToast('Error loading service: ' + err.message, 'error');
    }
}

function showEditServiceModal(service) {
    // Create modal for editing
    let modal = document.getElementById('editServiceModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editServiceModal';
        modal.className = 'modal hidden';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-card" style="max-width: 600px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: var(--text-light);">Edit Service</h3>
                <span class="close-x" onclick="closeModal(document.getElementById('editServiceModal'))">&times;</span>
            </div>
            <form id="editServiceForm">
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="editTitle" value="${escapeHtml(service.title)}" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="editDescription" rows="4" required>${escapeHtml(service.description)}</textarea>
                </div>
                <div class="form-group">
                    <label>Price ($)</label>
                    <input type="number" id="editPrice" value="${service.price}" step="0.01" min="0">
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <input type="text" id="editCategory" value="${escapeHtml(service.category || '')}">
                </div>
                <div class="form-group">
                    <label>Delivery Time (days)</label>
                    <input type="number" id="editDeliveryTime" value="${service.delivery_time || 7}">
                </div>
                <div class="form-group">
                    <label>Revisions</label>
                    <input type="number" id="editRevisions" value="${service.revisions || 2}">
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal(document.getElementById('editServiceModal'))">Cancel</button>
                </div>
            </form>
        </div>
    `;
    
    openModal(modal);
    
    // Handle form submission
    const form = document.getElementById('editServiceForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            await updateService(service.id);
        };
    }
}

async function updateService(serviceId) {
    const updatedData = {
        title: document.getElementById('editTitle')?.value,
        description: document.getElementById('editDescription')?.value,
        price: parseFloat(document.getElementById('editPrice')?.value) || 0,
        category: document.getElementById('editCategory')?.value,
        delivery_time: parseInt(document.getElementById('editDeliveryTime')?.value) || 7,
        revisions: parseInt(document.getElementById('editRevisions')?.value) || 2
    };
    
    try {
        const response = await fetch(`/api/services/${serviceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updatedData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast('✅ Service updated successfully!', 'success');
            closeModal(document.getElementById('editServiceModal'));
            await loadMyServices();
            await loadServices();
        } else {
            showToast(result.error || 'Failed to update service', 'error');
        }
    } catch (err) {
        console.error('Update error:', err);
        showToast('Error updating service', 'error');
    }
}

// ==================== VIEW SERVICE STATS FUNCTION ====================
async function viewServiceStats(serviceId) {
    if (!currentUser) {
        showToast('Please login to view stats', 'warning');
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    try {
        showToast('Loading statistics...', 'info');
        
        const response = await fetch(`/api/services/${serviceId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load service stats');
        }
        
        const service = await response.json();
        
        // Create stats modal
        let modal = document.getElementById('statsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'statsModal';
            modal.className = 'modal hidden';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="modal-card" style="max-width: 500px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--text-light);">Service Statistics</h3>
                    <span class="close-x" onclick="closeModal(document.getElementById('statsModal'))">&times;</span>
                </div>
                <div style="text-align: center; margin-bottom: 20px;">
                    <h4 style="color: var(--accent-gold);">${escapeHtml(service.title)}</h4>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="background: var(--secondary-dark); padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="color: var(--accent-gold); font-size: 2rem; font-weight: bold;">${service.favorite_count || 0}</div>
                        <div style="color: var(--text-gray);">Favorites</div>
                    </div>
                    <div style="background: var(--secondary-dark); padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="color: var(--accent-gold); font-size: 2rem; font-weight: bold;">${service.review_count || 0}</div>
                        <div style="color: var(--text-gray);">Reviews</div>
                    </div>
                    <div style="background: var(--secondary-dark); padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="color: var(--accent-gold); font-size: 2rem; font-weight: bold;">${service.avg_rating ? service.avg_rating.toFixed(1) : '0.0'}</div>
                        <div style="color: var(--text-gray);">Average Rating</div>
                    </div>
                    <div style="background: var(--secondary-dark); padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="color: var(--accent-gold); font-size: 2rem; font-weight: bold;">${service.total_orders || 0}</div>
                        <div style="color: var(--text-gray);">Total Orders</div>
                    </div>
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <button class="btn btn-secondary" onclick="closeModal(document.getElementById('statsModal'))">Close</button>
                </div>
            </div>
        `;
        
        openModal(modal);
        
    } catch (err) {
        console.error('Error loading stats:', err);
        showToast('Error loading statistics', 'error');
    }
}

async function confirmDeleteService(serviceId, serviceTitle, ownerId, isOwner) {
    console.log("===== DELETE FUNCTION CALLED =====");
    console.log("Service ID:", serviceId);
    console.log("Service Title:", serviceTitle);
    
    if (!currentUser) {
        showToast("Please login to delete services", "warning");
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    const confirmed = confirm(`⚠️ Are you sure you want to delete "${serviceTitle}"?\n\nThis action cannot be undone!`);
    
    if (!confirmed) return;
    
    let reason = prompt("Please provide a reason for deletion:", "No longer offering this service");
    if (reason === null) return;
    if (reason.trim() === "") {
        reason = "No reason provided";
    }
    
    try {
        showToast("Deleting service...", "info");
        
        // Use the same endpoint that worked in your test
        const response = await fetch(`/api/services/${serviceId}`, {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ reason: reason })
        });
        
        const result = await response.json();
        console.log("Delete response:", result);
        
        if (response.ok && result.success) {
            showToast('✅ Service deleted successfully', 'success');
            // Refresh the services lists
            await loadMyServices();
            await loadServices();
        } else {
            showToast(result.error || 'Failed to delete service', 'error');
        }
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error deleting service: ' + err.message, 'error');
    }
}
// ==================== UPDATE THE RENDER MY SERVICES FUNCTION ====================
// Replace the action buttons in renderMyServices
function renderMyServices(services) {
    const container = $('myServicesList');
    if (!container) return;

    container.innerHTML = services.map(service => {
        const providerName = service.username || 'You';
        const profilePicture = service.profile_picture_url || service.provider_profile_picture;
        let providerPictureHtml = '';
        
        if (profilePicture) {
            providerPictureHtml = `
                <div class="profile-picture-wrapper">
                    <img src="${profilePicture}" alt="${providerName}" 
                         class="provider-profile-picture" 
                         onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'provider-initials\\'>${providerName.charAt(0).toUpperCase()}</div>';">
                </div>
            `;
        } else {
            providerPictureHtml = `
                <div class="provider-initials">
                    ${providerName.charAt(0).toUpperCase()}
                </div>
            `;
        }

        return `
            <div class="service-card" data-service-id="${service.id}">
                <div class="service-header">
                    <h3 class="service-title">${escapeHtml(service.title)}</h3>
                    <div class="service-price">
                        ${service.price > 0 ? `$${service.price}` : 'Free'}
                    </div>
                </div>
                
                <div class="service-provider-info">
                    ${providerPictureHtml}
                    <div>
                        <div class="service-provider-name">${escapeHtml(providerName)}</div>
                        <div class="service-provider">${escapeHtml(service.category || 'General')}</div>
                    </div>
                </div>
                
                <p>${escapeHtml((service.description || 'No description').substring(0, 100))}${(service.description || '').length > 100 ? '...' : ''}</p>
                
                ${service.favorite_count ? `
                    <div style="margin: 10px 0; color: var(--accent-gold);">
                        <i class="fas fa-heart"></i> ${service.favorite_count} favorites
                    </div>
                ` : ''}
                
                <div class="service-actions" style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="editService(${service.id})" style="flex: 1;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-secondary" onclick="viewServiceStats(${service.id})" style="flex: 1;">
                        <i class="fas fa-chart-bar"></i> Stats
                    </button>
                    <!-- FIXED: Use onclick with proper values, not data attributes -->
                    <button class="btn btn-danger" onclick="confirmDeleteService(${service.id}, '${escapeHtml(service.title).replace(/'/g, "\\'")}', ${service.user_id}, true)" style="flex: 1;">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
                
                <button class="btn btn-secondary view-details-btn" onclick="viewServiceDetailsModal(${service.id})" style="width:100%; margin-top:10px;">
                    <i class="fas fa-info-circle"></i> View Details
                </button>
            </div>
        `;
    }).join('');
}

function handleDeleteClick(e) {
    const deleteBtn = e.target.closest('.delete-svc-btn');
    if (!deleteBtn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const serviceId = deleteBtn.dataset.id;
    const serviceTitle = deleteBtn.dataset.title;
    const ownerId = deleteBtn.dataset.owner;
    
    console.log("Delete button clicked!", serviceId, serviceTitle);
    confirmDeleteService(serviceId, serviceTitle, ownerId, true);
}


async function loadMyFreelancers() {
    const container = document.getElementById('clientServicesList');
    if (!container) return;

    try {
        container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading your freelancers...</div>';
        
        const response = await fetch('/api/client/providers', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load freelancers');
        }
        
        let freelancers = await response.json();
        
        // Ensure it's an array
        if (!Array.isArray(freelancers)) {
            freelancers = [];
        }
        
        console.log("Found", freelancers.length, "freelancers");
        
        if (freelancers.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; grid-column: 1 / -1;">
                    <div style="font-size: 4rem; margin-bottom: 20px;">🤝</div>
                    <h3 style="color: var(--text-light); margin-bottom: 10px;">No Freelancers Yet</h3>
                    <p style="color: var(--text-gray); margin-bottom: 20px;">Browse services and click "Recruit" to add freelancers to your list.</p>
                    <button class="btn btn-primary" onclick="switchTab('browse')">
                        <i class="fas fa-search"></i> Browse Services
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = freelancers.map(freelancer => {
            const profilePicture = freelancer.profile_picture;
            const profileInitial = freelancer.username ? freelancer.username.charAt(0).toUpperCase() : 'U';
            const avgRating = freelancer.avg_rating || 0;
            
            const profilePictureHtml = profilePicture ?
                `<img src="${profilePicture}" alt="${freelancer.username}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` :
                `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold; background: var(--gradient-primary); border-radius: 50%; color: white;">${profileInitial}</div>`;
            
            return `
                <div class="service-card" data-freelancer-id="${freelancer.freelancer_id}">
                    <div class="service-header">
                        <h3 class="service-title">${escapeHtml(freelancer.username)}</h3>
                        <div class="service-price">${freelancer.hourly_rate ? `$${freelancer.hourly_rate}/hr` : 'Rate not set'}</div>
                    </div>
                    
                    <div class="service-provider-info">
                        <div class="profile-picture-wrapper" style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden;">
                            ${profilePictureHtml}
                        </div>
                        <div class="provider-info">
                            <div class="service-provider-name">${escapeHtml(freelancer.headline || 'Freelancer')}</div>
                            <div class="service-provider">${escapeHtml(freelancer.location || 'Location not specified')}</div>
                            <div class="service-rating">
                                <span class="stars">${generateStars(avgRating)}</span>
                                <span class="rating-count">(${freelancer.completed_orders || 0} orders)</span>
                            </div>
                        </div>
                    </div>
                    
                    ${freelancer.service_title ? `
                        <div style="margin: 10px 0; padding: 10px; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                            <small style="color: var(--text-gray);">Recruited for:</small>
                            <div style="color: var(--accent-blue); font-weight: 500;">${escapeHtml(freelancer.service_title)}</div>
                        </div>
                    ` : ''}
                    
                    <div class="service-actions">
                        <button class="btn chat-btn" onclick="checkAndStartConversation(null, ${freelancer.freelancer_id})">
                            <i class="fas fa-comments"></i> Message
                        </button>
                        <button class="btn profile-btn" onclick="openFreelancerProfile(${freelancer.freelancer_id})">
                            <i class="fas fa-user"></i> View Profile
                        </button>
                        <button class="btn btn-secondary flag-btn" onclick="showFlagModal(${freelancer.freelancer_id}, '${escapeHtml(freelancer.username)}', null)">
                            <i class="fas fa-flag"></i> Report
                        </button>
                        <button class="btn btn-secondary" onclick="showReviewModalForFreelancer(${freelancer.freelancer_id}, '${escapeHtml(freelancer.username)}', null)">
                            <i class="fas fa-star"></i> Review
                        </button>
                        <button class="btn btn-danger" onclick="removeFreelancer(${freelancer.freelancer_id}, this)">
                            <i class="fas fa-trash"></i> Remove
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
// Add this test function
function testDelete(serviceId, serviceTitle) {
    console.log("TEST DELETE BUTTON CLICKED!");
    console.log("Service ID:", serviceId);
    console.log("Service Title:", serviceTitle);
    alert("Delete button works! Service ID: " + serviceId);
}
        // Update badge count
        await updateProvidersBadge();
        
    } catch (err) {
        console.error("Error loading freelancers:", err);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--error-red); grid-column: 1 / -1;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <p>Failed to load your freelancers: ${err.message}</p>
                <button class="btn btn-primary" onclick="loadMyFreelancers()">Try Again</button>
            </div>
        `;
    }
}
   // Remove freelancer function
async function removeFreelancer(freelancerId, buttonElement) {
    if (!confirm("Are you sure you want to remove this freelancer from your list?")) return;
    
    try {
        const response = await fetch("/api/freelancer/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ freelancerId: freelancerId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast("Freelancer removed from your list", "success");
            // Remove the card from UI
            const card = buttonElement.closest('.service-card');
            if (card) card.remove();
            
            // Check if list is empty
            const container = document.getElementById('clientServicesList');
            if (container && container.children.length === 0) {
                loadMyFreelancers(); // This will show the empty state
            }
            
            // Update badge count
            await updateProvidersBadge();
            
            // Also update the recruit button on the service card if visible
            const recruitBtn = document.querySelector(`.recruit-btn[data-freelancer-id="${freelancerId}"]`);
            if (recruitBtn) {
                recruitBtn.classList.remove('recruited');
                recruitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Recruit';
            }
        } else {
            showToast(data.error || "Failed to remove", "error");
        }
    } catch (err) {
        console.error("Remove error:", err);
        showToast("Error removing freelancer", "error");
    }
}
// ==================== FIXED DELETE MODAL FUNCTIONS ====================

// Global variables to track which service is being deleted
let pendingDeleteServiceId = null;
let pendingDeleteServiceTitle = null;
let pendingDeleteOwnerId = null;

// Show freelancer delete modal
function confirmDeleteService(serviceId, serviceTitle, ownerId, isOwner) {
    console.log("===== DELETE FUNCTION CALLED =====");
    console.log("Service ID:", serviceId);
    console.log("Service Title:", serviceTitle);
    
    if (!currentUser) {
        showToast("Please login to delete services", "warning");
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    // Store pending deletion info
    pendingDeleteServiceId = serviceId;
    pendingDeleteServiceTitle = serviceTitle;
    pendingDeleteOwnerId = ownerId;
    
    const isAdmin = currentUser.role === 'admin';
    
    if (isAdmin) {
        // Show admin delete modal
        const modal = document.getElementById('adminDeleteModal');
        const infoDiv = document.getElementById('adminDeleteServiceInfo');
        const reasonTextarea = document.getElementById('adminDeleteReason');
        
        if (modal && infoDiv) {
            infoDiv.innerHTML = `
                <p><strong>📦 Service:</strong> ${escapeHtml(serviceTitle)}</p>
                <p><strong>🆔 ID:</strong> #${serviceId}</p>
                <p><strong>👤 Owner ID:</strong> ${ownerId}</p>
                <p style="color: var(--error-red); margin-top: 10px;">⚠️ This action cannot be undone.</p>
            `;
            
            if (reasonTextarea) reasonTextarea.value = '';
            updateDeleteCharCount('adminDeleteReason', 'adminDeleteCharCount');
            
            openModal(modal);
        }
    } else if (isOwner && currentUser.role === 'freelancer') {
        // Show freelancer delete modal
        const modal = document.getElementById('freelancerDeleteModal');
        const infoDiv = document.getElementById('freelancerDeleteServiceInfo');
        const reasonTextarea = document.getElementById('freelancerDeleteReason');
        const remainingSpan = document.getElementById('remainingDeletes');
        
        if (modal && infoDiv) {
            infoDiv.innerHTML = `
                <p><strong>📦 Service:</strong> ${escapeHtml(serviceTitle)}</p>
                <p><strong>🆔 ID:</strong> #${serviceId}</p>
                <p style="color: var(--warning-orange); margin-top: 10px;">⚠️ This action cannot be undone.</p>
            `;
            
            if (reasonTextarea) reasonTextarea.value = '';
            updateDeleteCharCount('freelancerDeleteReason', 'freelancerDeleteCharCount');
            
            // Get remaining deletes for today
            getRemainingDeletesCount().then(count => {
                if (remainingSpan) {
                    remainingSpan.textContent = `${count}/3`;
                    if (count === 0) {
                        const confirmBtn = document.getElementById('confirmFreelancerDeleteBtn');
                        if (confirmBtn) confirmBtn.disabled = true;
                        showToast("You've reached your daily delete limit (3 per day). Please try again tomorrow.", "warning");
                    }
                }
            });
            
            openModal(modal);
        }
    } else {
        showToast("You don't have permission to delete this service", "error");
    }
}

// Get remaining deletes for today
async function getRemainingDeletesCount() {
    try {
        const response = await fetch('/api/user/delete-count', {
            credentials: 'include'
        });
        const data = await response.json();
        return 3 - (data.todayCount || 0);
    } catch (err) {
        console.error("Error getting delete count:", err);
        return 3;
    }
}

// Update character count for reason textarea
function updateDeleteCharCount(textareaId, countSpanId) {
    const textarea = document.getElementById(textareaId);
    const countSpan = document.getElementById(countSpanId);
    
    if (textarea && countSpan) {
        textarea.addEventListener('input', function() {
            const length = this.value.length;
            countSpan.textContent = `${length}/500`;
            countSpan.style.color = length > 450 ? '#ef4444' : 'var(--text-gray)';
        });
    }
}

// Setup delete modal buttons - CALL THIS ON PAGE LOAD
function setupDeleteModalButtons() {
    // Admin Delete Modal Buttons
    const confirmAdminBtn = document.getElementById('confirmAdminDeleteBtn');
    if (confirmAdminBtn) {
        confirmAdminBtn.onclick = async function() {
            const reason = document.getElementById('adminDeleteReason')?.value.trim();
            if (!reason) {
                showToast("Please provide a reason for deletion", "warning");
                document.getElementById('adminDeleteReason')?.focus();
                return;
            }
            if (reason.length < 5) {
                showToast("Please provide a more detailed reason (minimum 5 characters)", "warning");
                return;
            }
            await executeDelete(pendingDeleteServiceId, reason);
            closeModal(document.getElementById('adminDeleteModal'));
        };
    }
    
    const cancelAdminBtn = document.getElementById('cancelAdminDeleteBtn');
    if (cancelAdminBtn) {
        cancelAdminBtn.onclick = function() {
            closeModal(document.getElementById('adminDeleteModal'));
            pendingDeleteServiceId = null;
        };
    }
    
    const closeAdminModal = document.getElementById('closeAdminDeleteModal');
    if (closeAdminModal) {
        closeAdminModal.onclick = function() {
            closeModal(document.getElementById('adminDeleteModal'));
            pendingDeleteServiceId = null;
        };
    }
    
    // Freelancer Delete Modal Buttons
    const confirmFreelancerBtn = document.getElementById('confirmFreelancerDeleteBtn');
    if (confirmFreelancerBtn) {
        confirmFreelancerBtn.onclick = async function() {
            const reason = document.getElementById('freelancerDeleteReason')?.value.trim();
            if (!reason) {
                showToast("Please provide a reason for deletion", "warning");
                document.getElementById('freelancerDeleteReason')?.focus();
                return;
            }
            if (reason.length < 5) {
                showToast("Please provide a more detailed reason (minimum 5 characters)", "warning");
                return;
            }
            await executeDelete(pendingDeleteServiceId, reason);
            closeModal(document.getElementById('freelancerDeleteModal'));
        };
    }
    
    const cancelFreelancerBtn = document.getElementById('cancelFreelancerDeleteBtn');
    if (cancelFreelancerBtn) {
        cancelFreelancerBtn.onclick = function() {
            closeModal(document.getElementById('freelancerDeleteModal'));
            pendingDeleteServiceId = null;
        };
    }
    
    const closeFreelancerModal = document.getElementById('closeFreelancerDeleteModal');
    if (closeFreelancerModal) {
        closeFreelancerModal.onclick = function() {
            closeModal(document.getElementById('freelancerDeleteModal'));
            pendingDeleteServiceId = null;
        };
    }
}

// Execute the actual delete
async function executeDelete(serviceId, reason) {
    if (!serviceId) {
        showToast("No service selected for deletion", "error");
        return;
    }
    
    try {
        showToast("Deleting service...", "info");
        
        const response = await fetch(`/api/services/${serviceId}`, {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ reason: reason })
        });
        
        const result = await response.json();
        console.log("Delete response:", result);
        
        if (response.ok && result.success) {
            showToast('✅ Service deleted successfully', 'success');
            // Refresh the services lists
            await loadMyServices();
            await loadServices();
            // Clear pending
            pendingDeleteServiceId = null;
        } else {
            showToast(result.error || 'Failed to delete service', 'error');
        }
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error deleting service: ' + err.message, 'error');
    }
}
// Check if freelancer has active subscription
let isSubscriptionActive = true;
let subscriptionExpired = false;

async function checkSubscriptionAndLock() {
    if (!currentUser) return true;
    
    // Only check for freelancers
    if (currentUser.role !== 'freelancer') return true;
    
    try {
        const response = await fetch('/api/subscription/status', {
            credentials: 'include'
        });
        const data = await response.json();
        
        isSubscriptionActive = data.hasActiveSubscription;
        subscriptionExpired = !isSubscriptionActive && data.requiresSubscription;
        
        if (subscriptionExpired) {
            console.log('⚠️ Subscription expired - applying locks');
            applySubscriptionLocks();
            showSubscriptionLockOverlay();
            return false;
        } else {
            console.log('✅ Subscription active');
            removeSubscriptionLocks();
            return true;
        }
    } catch (err) {
        console.error('Subscription check error:', err);
        return true;
    }
}

// Apply locks to UI elements
function applySubscriptionLocks() {
    // Lock all tabs
    const tabs = document.querySelectorAll('.tab, .nav-tab, .category-tab-btn');
    tabs.forEach(tab => {
        if (!tab.classList.contains('subscription-tab')) {
            tab.classList.add('disabled-tab');
        }
    });
    
    // Lock service cards
    const serviceCards = document.querySelectorAll('.service-card');
    serviceCards.forEach(card => {
        card.classList.add('locked');
    });
    
    // Lock product cards
    const productCards = document.querySelectorAll('.product-card');
    productCards.forEach(card => {
        card.classList.add('locked');
    });
    
    // Lock chat input
    const chatInput = document.querySelector('.chat-input');
    const messageInputArea = document.getElementById('messageInputArea');
    if (chatInput) chatInput.classList.add('locked');
    if (messageInputArea) messageInputArea.classList.add('locked');
    
    // Disable recruit buttons
    const recruitBtns = document.querySelectorAll('.recruit-btn');
    recruitBtns.forEach(btn => {
        btn.disabled = true;
        btn.title = 'Subscription required to recruit';
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    });
    
    // Disable chat buttons
    const chatBtns = document.querySelectorAll('.chat-btn');
    chatBtns.forEach(btn => {
        btn.disabled = true;
        btn.title = 'Subscription required to chat';
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    });
    
    // Disable create service button
    const createServiceBtn = document.getElementById('createServiceBtn');
    if (createServiceBtn) {
        createServiceBtn.disabled = true;
        createServiceBtn.title = 'Subscription required to create services';
        createServiceBtn.style.opacity = '0.5';
    }
    
    // Disable offer service button
    const offerServiceBtn = document.getElementById('offerServiceBtn');
    if (offerServiceBtn) {
        offerServiceBtn.disabled = true;
        offerServiceBtn.innerHTML = '<i class="fas fa-lock"></i> Subscribe to Offer Services';
        offerServiceBtn.style.opacity = '0.7';
    }
    
    // Hide subscription banner if showing trial info
    const subscriptionBanner = document.getElementById('subscriptionBanner');
    if (subscriptionBanner && !subscriptionBanner.classList.contains('warning')) {
        subscriptionBanner.classList.add('hidden');
    }
}

// Remove locks when subscription is active
function removeSubscriptionLocks() {
    const tabs = document.querySelectorAll('.tab.disabled-tab, .nav-tab.disabled-tab');
    tabs.forEach(tab => {
        tab.classList.remove('disabled-tab');
    });
    
    const serviceCards = document.querySelectorAll('.service-card.locked');
    serviceCards.forEach(card => {
        card.classList.remove('locked');
    });
    
    const productCards = document.querySelectorAll('.product-card.locked');
    productCards.forEach(card => {
        card.classList.remove('locked');
    });
    
    const chatInput = document.querySelector('.chat-input.locked');
    const messageInputArea = document.getElementById('messageInputArea');
    if (chatInput) chatInput.classList.remove('locked');
    if (messageInputArea) messageInputArea.classList.remove('locked');
    
    const recruitBtns = document.querySelectorAll('.recruit-btn');
    recruitBtns.forEach(btn => {
        btn.disabled = false;
        btn.title = '';
        btn.style.opacity = '';
        btn.style.cursor = '';
    });
    
    const chatBtns = document.querySelectorAll('.chat-btn');
    chatBtns.forEach(btn => {
        btn.disabled = false;
        btn.title = '';
        btn.style.opacity = '';
        btn.style.cursor = '';
    });
    
    const createServiceBtn = document.getElementById('createServiceBtn');
    if (createServiceBtn) {
        createServiceBtn.disabled = false;
        createServiceBtn.title = '';
        createServiceBtn.style.opacity = '';
    }
    
    const offerServiceBtn = document.getElementById('offerServiceBtn');
    if (offerServiceBtn) {
        offerServiceBtn.disabled = false;
        offerServiceBtn.innerHTML = '<i class="fas fa-plus"></i> Offer a Service';
        offerServiceBtn.style.opacity = '';
    }
}

// Show lock overlay
let lockOverlay = null;

function showSubscriptionLockOverlay() {
    if (lockOverlay) return;
    
    lockOverlay = document.createElement('div');
    lockOverlay.className = 'locked-overlay';
    lockOverlay.innerHTML = `
        <div class="locked-modal">
            <div class="lock-icon">
                <i class="fas fa-lock"></i>
            </div>
            <h2>⚠️ Subscription Required</h2>
            <p>Your free trial has ended. To continue using Core Insight and offer your services, please subscribe to one of our plans.</p>
            <div class="price">$5<span style="font-size: 1rem;">/month</span></div>
            <p style="font-size: 0.9rem;">or save 4% with yearly plan</p>
            <button class="btn btn-primary" id="lockSubscribeBtn">
                <i class="fas fa-crown"></i> Subscribe Now
            </button>
            <button class="btn btn-secondary" id="lockCloseBtn">
                Maybe Later
            </button>
            <p style="margin-top: 20px; font-size: 0.8rem; color: var(--text-gray);">
                <i class="fas fa-info-circle"></i> Your services are hidden from clients until you subscribe
            </p>
        </div>
    `;
    
    document.body.appendChild(lockOverlay);
    
    document.getElementById('lockSubscribeBtn')?.addEventListener('click', () => {
        showSubscriptionModal();
        if (lockOverlay) lockOverlay.remove();
        lockOverlay = null;
    });
    
    document.getElementById('lockCloseBtn')?.addEventListener('click', () => {
        if (lockOverlay) lockOverlay.remove();
        lockOverlay = null;
    });
}

function hideSubscriptionLockOverlay() {
    if (lockOverlay) {
        lockOverlay.remove();
        lockOverlay = null;
    }
}
// Update providers badge count
async function updateProvidersBadge() {
    try {
        const response = await fetch('/api/client/providers', {
            credentials: 'include'
        });
        
        if (!response.ok) return;
        
        let providers = await response.json();
        if (!Array.isArray(providers)) providers = [];
        
        const badge = document.getElementById('providersBadge');
        if (badge) {
            if (providers.length > 0) {
                badge.textContent = providers.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        
        // Also update the tab text if needed
        const myProvidersTab = document.getElementById('myProvidersTabBtn');
        if (myProvidersTab) {
            const span = myProvidersTab.querySelector('.badge');
            if (span) {
                if (providers.length > 0) {
                    span.textContent = providers.length;
                    span.classList.remove('hidden');
                } else {
                    span.classList.add('hidden');
                }
            }
        }
        
    } catch (err) {
        console.error("Error updating badge:", err);
    }
}

async function loadFavorites() {
    const container = document.getElementById('favoritesList');
    if (!container) return;

    try {
        container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading favorites...</div>';
        
        const response = await fetch('/api/client/favorites', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load favorites');
        }
        
        let favorites = await response.json();
        
        // Ensure favorites is an array
        if (!Array.isArray(favorites)) {
            favorites = [];
        }
        
        const noFavoritesDiv = document.getElementById('noFavorites');
        
        if (favorites.length === 0) {
            if (noFavoritesDiv) noFavoritesDiv.style.display = 'block';
            container.innerHTML = '';
            return;
        }
        
        if (noFavoritesDiv) noFavoritesDiv.style.display = 'none';
        
        container.innerHTML = favorites.map(service => {
            const providerName = service.provider_name || service.username || 'Unknown';
            const profilePicture = service.provider_picture;
            const profileInitial = providerName.charAt(0).toUpperCase();
            
            const providerPictureHtml = profilePicture ?
                `<img src="${profilePicture}" alt="${providerName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` :
                `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; background: var(--gradient-primary); border-radius: 50%; color: white;">${profileInitial}</div>`;
            
            return `
                <div class="service-card" data-service-id="${service.id}">
                    <div class="service-header">
                        <h3 class="service-title">${escapeHtml(service.title)}</h3>
                        <div class="service-price">${service.price > 0 ? `$${service.price}` : 'Free'}</div>
                    </div>
                    
                    <div class="service-provider-info">
                        <div class="profile-picture-wrapper" style="width: 50px; height: 50px; border-radius: 50%; overflow: hidden;">
                            ${providerPictureHtml}
                        </div>
                        <div class="provider-info">
                            <div class="service-provider-name">${escapeHtml(providerName)}</div>
                            <div class="service-provider">${escapeHtml(service.category || 'General')}</div>
                        </div>
                    </div>
                    
                    <p class="service-description">${escapeHtml((service.description || '').substring(0, 100))}${(service.description || '').length > 100 ? '...' : ''}</p>
                    
                    <div class="service-actions">
                        <button class="btn chat-btn" onclick="checkAndStartConversation(${service.id}, ${service.provider_id})">
                            <i class="fas fa-comments"></i> Chat
                        </button>
                        <button class="btn profile-btn" onclick="openFreelancerProfile(${service.provider_id})">
                            <i class="fas fa-user"></i> View Profile
                        </button>
                        <button class="btn favorite-btn active" onclick="toggleServiceFavorite(${service.id}, this)">
                            <i class="fas fa-heart"></i> Favorited
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (err) {
        console.error("Error loading favorites:", err);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--error-red); grid-column: 1 / -1;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <p>Failed to load favorites: ${err.message}</p>
                <button class="btn btn-primary" onclick="loadFavorites()">Try Again</button>
            </div>
        `;
    }
}


function showReviewModal(serviceId, serviceTitle) {
    const modal = document.getElementById('addReviewModal');
    const ratingInput = document.getElementById('reviewComment');
    const starRatingDiv = document.getElementById('starRating');
    
    if (modal) {
        // Store service ID
        modal.dataset.serviceId = serviceId;
        modal.dataset.serviceTitle = serviceTitle;
        
        // Clear previous values
        if (ratingInput) ratingInput.value = '';
        
        // Reset stars
        if (starRatingDiv) {
            const stars = starRatingDiv.querySelectorAll('i');
            stars.forEach(star => {
                star.className = 'far fa-star';
            });
        }
        
        openModal(modal);
    }
}

function openCertificateViewer(certUrl, index) {
    const modal = document.getElementById('certificateViewerModal');
    const img = document.getElementById('certificateImage');
    const downloadBtn = document.getElementById('downloadCertificateBtn');
    
    if (modal && img) {
        currentCertificateUrl = certUrl;
        img.src = certUrl;
        currentZoom = 1;
        img.style.transform = `scale(${currentZoom})`;
        
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = certUrl;
                a.download = `certificate_${index + 1}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };
        }
        
        openModal(modal);
    }
}

function viewCertificateFull(certUrl, event) {
    if (event) event.stopPropagation();
    openCertificateViewer(certUrl, 0);
}

// Zoom functions for certificate viewer
function zoomIn() {
    currentZoom = Math.min(currentZoom + 0.25, 3);
    const img = document.getElementById('certificateImage');
    if (img) img.style.transform = `scale(${currentZoom})`;
}

function zoomOut() {
    currentZoom = Math.max(currentZoom - 0.25, 0.5);
    const img = document.getElementById('certificateImage');
    if (img) img.style.transform = `scale(${currentZoom})`;
}

function resetZoom() {
    currentZoom = 1;
    const img = document.getElementById('certificateImage');
    if (img) img.style.transform = `scale(${currentZoom})`;
}

// Add event listeners for zoom buttons
document.addEventListener('DOMContentLoaded', function() {
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    
    if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom);
});

// Make sure the loadServices function uses the correct data structure
async function loadServices() {
    const servicesList = document.getElementById('servicesList');
    if (!servicesList) return;

    try {
        showLoading('servicesList');

        const response = await fetch('/api/services', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Handle different response formats
        let servicesArray = [];
        if (data.services && Array.isArray(data.services)) {
            servicesArray = data.services;
        } else if (Array.isArray(data)) {
            servicesArray = data;
        } else {
            servicesArray = [];
        }
        
        services = servicesArray;
        
        // Update categories dropdown
        updateCategoriesFromServices();
        
        // Render services
        renderServices(services);
        
    } catch (err) {
        console.error('Error loading services:', err);
        servicesList.innerHTML = `
            <div class="text-error" style="text-align: center; padding: 40px; grid-column: 1 / -1;">
                <div style="font-size: 4rem; margin-bottom: 20px;">⚠️</div>
                <h3>Failed to load services</h3>
                <p>${err.message}</p>
                <button class="btn btn-primary" onclick="loadServices()">Retry</button>
            </div>
        `;
        services = [];
    }
}

function updateCategoriesFromServices() {
    const categoriesSet = new Set();
    services.forEach(service => {
        if (service.category) {
            categoriesSet.add(service.category);
        }
    });
    
    const categories = Array.from(categoriesSet);
    const categoryFilter = document.getElementById('categoryFilter');
    
    if (categoryFilter && categories.length > 0) {
        // Save current value
        const currentValue = categoryFilter.value;
        
        // Clear existing options except first
        while (categoryFilter.options.length > 1) {
            categoryFilter.remove(1);
        }
        
        // Add new options
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
        
        // Restore value if it still exists
        if (currentValue && categories.includes(currentValue)) {
            categoryFilter.value = currentValue;
        }
    }
}

// ==================== FIX ALL MODAL CLOSE BUTTONS ====================
function setupModalCloseButtons() {
    // Close modals when clicking X button
    const closeButtons = document.querySelectorAll('.close-x, .modal-close-btn');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) closeModal(modal);
        });
    });
    
    // Close modals when clicking Cancel button
    const cancelButtons = document.querySelectorAll('#cancelSubscriptionBtn, #cancelFreelancerDeleteBtn, #cancelAdminDeleteBtn, #cancelStatementBtn');
    cancelButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) closeModal(modal);
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });
}

// Call this after DOM loads
document.addEventListener('DOMContentLoaded', function() {
    setupModalCloseButtons();
});
// ============================================
// FLAGGING SYSTEM FUNCTIONS
// ============================================

// Flag a user for admin review
async function flagUser(freelancerId, serviceId, reason) {
    if (!currentUser) {
        showToast("Please login to flag users", "warning");
        openModal(document.getElementById('loginModal'));
        return false;
    }
    
    if (currentUser.role !== 'client') {
        showToast("Only clients can flag users", "error");
        return false;
    }
    
    if (parseInt(currentUser.id) === parseInt(freelancerId)) {
        showToast("You cannot flag yourself", "warning");
        return false;
    }
    
    if (!reason || reason.trim().length < 10) {
        showToast("Please provide a detailed reason (at least 10 characters)", "warning");
        return false;
    }
    
    try {
        showToast("Submitting flag...", "info");
        
        const response = await fetch("/api/users/flag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                flagged_user_id: freelancerId,
                service_id: serviceId,
                reason: reason.trim()
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showToast(data.error || "Failed to flag user", "error");
            return false;
        }
        
        if (data.warning_issued) {
            showToast(data.message, "warning");
        } else {
            showToast(data.message, "success");
        }
        
        return true;
        
    } catch (err) {
        console.error("Flag error:", err);
        showToast("Error flagging user", "error");
        return false;
    }
}

// Show flag modal
function showFlagModal(freelancerId, freelancerName, serviceId) {
    const modal = document.getElementById('flagUserModal');
    if (!modal) {
        // Create modal if it doesn't exist
        createFlagModal();
    }
    
    const modalElement = document.getElementById('flagUserModal');
    if (modalElement) {
        modalElement.dataset.freelancerId = freelancerId;
        modalElement.dataset.serviceId = serviceId;
        modalElement.dataset.freelancerName = freelancerName;
        
        const nameElement = document.getElementById('flagUserName');
        if (nameElement) nameElement.textContent = freelancerName;
        
        const reasonInput = document.getElementById('flagReason');
        if (reasonInput) reasonInput.value = '';
        
        openModal(modalElement);
    }
}

// Create flag modal dynamically
function createFlagModal() {
    const modalHtml = `
        <div id="flagUserModal" class="modal hidden">
            <div class="modal-card" style="max-width: 500px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--text-light);">
                        <i class="fas fa-flag" style="color: #ef4444;"></i> Flag User
                    </h3>
                    <span class="close-x" id="closeFlagModal">&times;</span>
                </div>
                
                <div style="background: rgba(239, 68, 68, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0; color: var(--text-light);">
                        <strong>Flagging user:</strong> <span id="flagUserName"></span>
                    </p>
                    <p style="margin: 10px 0 0 0; color: var(--text-gray); font-size: 0.9rem;">
                        Please provide a detailed reason why this user should be reviewed by admin.
                    </p>
                </div>
                
                <div class="form-group">
                    <label for="flagReason" style="color: var(--text-light);">Reason for flagging *</label>
                    <textarea id="flagReason" class="form-textarea-enhanced" rows="4" 
                              placeholder="Please describe the issue in detail... (minimum 10 characters)"></textarea>
                    <div style="text-align: right; margin-top: 5px;">
                        <span id="flagCharCount" style="color: var(--text-gray); font-size: 0.85rem;">0/500</span>
                    </div>
                </div>
                
                <div class="form-actions" style="margin-top: 20px;">
                    <button class="btn btn-danger" id="submitFlagBtn" style="flex: 1;">
                        <i class="fas fa-flag"></i> Submit Flag
                    </button>
                    <button class="btn btn-secondary" id="cancelFlagBtn" style="flex: 1;">
                        Cancel
                    </button>
                </div>
                
                <div class="flag-info" style="margin-top: 15px; padding: 10px; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                    <p style="margin: 0; font-size: 0.85rem; color: var(--text-gray);">
                        <i class="fas fa-info-circle"></i> 
                        Flags are anonymous - the flagged user will not know who flagged them.
                        After 3 flags, the account will be temporarily locked for admin review.
                    </p>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Add event listeners
    document.getElementById('closeFlagModal')?.addEventListener('click', () => {
        closeModal(document.getElementById('flagUserModal'));
    });
    
    document.getElementById('cancelFlagBtn')?.addEventListener('click', () => {
        closeModal(document.getElementById('flagUserModal'));
    });
    
    document.getElementById('submitFlagBtn')?.addEventListener('click', async () => {
        const modal = document.getElementById('flagUserModal');
        const freelancerId = modal.dataset.freelancerId;
        const serviceId = modal.dataset.serviceId;
        const reason = document.getElementById('flagReason').value;
        
        await flagUser(freelancerId, serviceId, reason);
        closeModal(modal);
    });
    
    const reasonInput = document.getElementById('flagReason');
    if (reasonInput) {
        reasonInput.addEventListener('input', () => {
            const count = reasonInput.value.length;
            const charCountSpan = document.getElementById('flagCharCount');
            if (charCountSpan) {
                charCountSpan.textContent = `${count}/500`;
                charCountSpan.style.color = count > 450 ? '#ef4444' : 'var(--text-gray)';
            }
        });
    }
}

// Get user's flag status
async function getUserFlagStatus(userId) {
    if (!currentUser) return { canFlag: false, message: "Please login" };
    if (currentUser.role !== 'client') return { canFlag: false, message: "Only clients can flag users" };
    
    try {
        const response = await fetch(`/api/users/flag-status/${userId}`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        return {
            canFlag: data.canFlag !== false,
            flagCount: data.flagCount || 0,
            hasBeenFlagged: data.hasBeenFlagged || false,
            message: data.message
        };
    } catch (err) {
        console.error("Error checking flag status:", err);
        return { canFlag: true, message: "Unknown" };
    }
}

// Show flag button in service card if applicable
function addFlagButtonToService(serviceElement, freelancerId, serviceId) {
    if (!currentUser || currentUser.role !== 'client') return;
    
    const flagButton = document.createElement('button');
    flagButton.className = 'btn btn-secondary flag-btn';
    flagButton.innerHTML = '<i class="fas fa-flag"></i> Report';
    flagButton.style.background = 'rgba(239, 68, 68, 0.1)';
    flagButton.style.borderColor = '#ef4444';
    flagButton.style.color = '#ef4444';
    
    flagButton.onclick = async (e) => {
        e.stopPropagation();
        const status = await getUserFlagStatus(freelancerId);
        
        if (!status.canFlag) {
            showToast(status.message || "Cannot flag this user at this time", "warning");
            return;
        }
        
        showFlagModal(freelancerId, serviceElement.querySelector('.service-provider-name')?.textContent || 'User', serviceId);
    };
    
    const actionsContainer = serviceElement.querySelector('.service-actions');
    if (actionsContainer) {
        actionsContainer.appendChild(flagButton);
    }
}

async function showFreelancerWarningIfFlagged() {
    if (!currentUser || currentUser.role !== 'freelancer') return;
    
    try {
        const response = await fetch('/api/users/my-flag-status', {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.hasFlags && data.flagCount > 0) {
            // Fetch detailed flag information
            const flagResponse = await fetch('/api/freelancer/flags', {
                credentials: 'include'
            });
            const flagData = await flagResponse.json();
            const flags = flagData.flags || [];
            
            // Build flags HTML with reasons
            let flagsHtml = '';
            if (flags.length > 0) {
                flagsHtml = `
                    <div style="margin-top: 15px; max-height: 200px; overflow-y: auto;">
                        <strong style="color: var(--warning-orange);">Flag Details:</strong>
                        ${flags.map(flag => `
                            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-top: 8px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--text-gray); font-size: 12px;">Reported by: ${escapeHtml(flag.flagged_by_name || 'Anonymous')}</span>
                                    <span style="color: var(--text-gray); font-size: 12px;">${new Date(flag.created_at).toLocaleDateString()}</span>
                                </div>
                                <p style="margin: 8px 0 0 0; font-size: 13px; color: var(--text-light);">
                                    <strong>Reason:</strong> ${escapeHtml(flag.reason)}
                                </p>
                                <span style="font-size: 11px; color: ${flag.status === 'pending' ? 'var(--warning-orange)' : 'var(--success-green)'};">Status: ${flag.status}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            
            const warningBanner = document.createElement('div');
            warningBanner.className = 'subscription-banner warning';
            warningBanner.style.marginBottom = '20px';
            warningBanner.style.position = 'relative';
            warningBanner.style.zIndex = '100';
            warningBanner.innerHTML = `
                <div class="subscription-info" style="align-items: flex-start;">
                    <div class="subscription-icon" style="background: #f59e0b;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="subscription-text" style="flex: 1;">
                        <h3 style="color: var(--warning-orange); margin: 0 0 8px 0;">⚠️ Warning: Your Account Has Been Flagged</h3>
                        <p style="margin: 0 0 8px 0;">Your account has received ${data.flagCount} flag(s). 
                           ${data.flagCount >= 2 ? 'One more flag will temporarily lock your account for admin review.' : 
                             'Please review our community guidelines. If you receive 3 flags, your account will be temporarily locked.'}</p>
                        ${flagsHtml}
                        <div style="margin-top: 12px;">
                            <button onclick="acknowledgeFlagWarning()" class="btn btn-primary" style="padding: 8px 16px; font-size: 13px;">
                                I Understand
                            </button>
                        </div>
                    </div>
                </div>
                <button onclick="this.parentElement.remove()" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--text-gray); cursor: pointer; font-size: 18px;">&times;</button>
            `;
            
            // Remove existing banner
            const existingBanner = document.querySelector('.subscription-banner.warning');
            if (existingBanner) existingBanner.remove();
            
            const heroSection = document.querySelector('.hero');
            if (heroSection) {
                heroSection.insertAdjacentElement('afterend', warningBanner);
            }
        }
    } catch (err) {
        console.error("Error checking freelancer flag status:", err);
    }
}

function acknowledgeFlagWarning() {
    const banner = document.querySelector('.subscription-banner.warning');
    if (banner) banner.remove();
    showToast("Thank you. Please review our community guidelines.", "info");
}


// Load notifications for freelancer
async function loadFreelancerNotifications() {
    if (!currentUser || currentUser.role !== 'freelancer') return;
    
    try {
        const response = await fetch('/api/freelancer/notifications', {
            credentials: 'include'
        });
        
        const data = await response.json();
        const notifications = data.notifications || [];
        const unreadCount = notifications.filter(n => !n.is_read).length;
        
        const notificationBadge = document.getElementById('notificationCount');
        if (notificationBadge) {
            if (unreadCount > 0) {
                notificationBadge.textContent = unreadCount;
                notificationBadge.style.display = 'flex';
            } else {
                notificationBadge.style.display = 'none';
            }
        }
        
        // Store for later display
        window.freelancerNotifications = notifications;
        
    } catch (err) {
        console.error("Error loading notifications:", err);
    }
}
// ============================================
// ADMIN REVIEW FUNCTIONS
// ============================================


// Load flagged users for admin review
async function loadFlaggedUsersForReview() {
    const container = document.getElementById('flaggedUsersList');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading flagged users...</div>';
    
    try {
        const response = await fetch('/api/admin/flagged-users', {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (!data.users || data.users.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-gray);">
                    <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                    <p>No flagged users pending review</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = data.users.map(user => `
            <div class="admin-review-card" data-user-id="${user.id}" style="background: var(--card-bg); border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 15px;">
                    <div>
                        <h4 style="color: var(--text-light); margin-bottom: 5px;">
                            ${escapeHtml(user.username)}
                            <span class="badge" style="background: #ef4444;">${user.flag_count} Flag(s)</span>
                        </h4>
                        <p style="color: var(--text-gray); font-size: 0.9rem;">Email: ${escapeHtml(user.email)}</p>
                        <p style="color: var(--text-gray); font-size: 0.9rem;">Member since: ${formatDate(user.created_at)}</p>
                    </div>
                    <div>
                        <button class="btn btn-primary" onclick="viewUserFlags(${user.id})" style="margin-right: 10px;">
                            <i class="fas fa-list"></i> View Flags
                        </button>
                        ${user.status === 'suspended' ? 
                            '<button class="btn btn-success" onclick="reactivateUser(' + user.id + ')"><i class="fas fa-check"></i> Reactivate</button>' :
                            '<button class="btn btn-danger" onclick="suspendUser(' + user.id + ')"><i class="fas fa-lock"></i> Suspend</button>'
                        }
                    </div>
                </div>
                ${user.status === 'under_review' ? `
                    <div style="margin-top: 15px; padding: 15px; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                        <p style="margin-bottom: 10px;"><strong>Freelancer's Statement:</strong></p>
                        <p style="color: var(--text-gray);">${escapeHtml(user.freelancer_statement || 'No statement provided yet.')}</p>
                    </div>
                ` : ''}
                <div style="margin-top: 15px;">
                    <textarea id="adminNote_${user.id}" class="form-textarea-enhanced" rows="2" 
                              placeholder="Add admin notes..."></textarea>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-success" onclick="resolveFlags(${user.id}, 'cleared')">
                            <i class="fas fa-check"></i> Clear Flags
                        </button>
                        <button class="btn btn-warning" onclick="resolveFlags(${user.id}, 'suspended')">
                            <i class="fas fa-ban"></i> Suspend Account
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        console.error("Error loading flagged users:", err);
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: #ef4444;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem;"></i>
            <p>Failed to load flagged users: ${err.message}</p>
        </div>`;
    }
}

// View detailed flags for a user
async function viewUserFlags(userId) {
    try {
        const response = await fetch(`/api/admin/user-flags/${userId}`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        const modalContent = `
            <div style="max-height: 60vh; overflow-y: auto;">
                <h4 style="color: var(--text-light); margin-bottom: 15px;">Flags for ${escapeHtml(data.username)}</h4>
                ${data.flags.map(flag => `
                    <div style="background: var(--secondary-dark); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="color: var(--accent-gold);">Flagged by: ${escapeHtml(flag.flagged_by_name || 'Anonymous')}</span>
                            <span style="color: var(--text-gray); font-size: 0.85rem;">${formatDate(flag.created_at)}</span>
                        </div>
                        <p style="color: var(--text-gray);"><strong>Reason:</strong> ${escapeHtml(flag.reason)}</p>
                        ${flag.status === 'reviewed' ? '<span class="badge" style="background: #10b981;">Reviewed</span>' : 
                          '<span class="badge" style="background: #f59e0b;">Pending</span>'}
                    </div>
                `).join('')}
                ${data.freelancer_statement ? `
                    <div style="background: rgba(59, 130, 246, 0.1); padding: 15px; border-radius: 8px; margin-top: 15px;">
                        <h5 style="color: var(--text-light);">Freelancer's Statement:</h5>
                        <p style="color: var(--text-gray);">${escapeHtml(data.freelancer_statement)}</p>
                    </div>
                ` : ''}
            </div>
        `;
        
        showModalWithContent('Flag Details', modalContent);
        
    } catch (err) {
        console.error("Error viewing flags:", err);
        showToast("Failed to load flags", "error");
    }
}

// Resolve flags for a user
async function resolveFlags(userId, action) {
    const adminNote = document.getElementById(`adminNote_${userId}`)?.value || '';
    
    try {
        const response = await fetch(`/api/admin/resolve-flags/${userId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                action: action,
                admin_notes: adminNote
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message, "success");
            await loadFlaggedUsersForReview();
        } else {
            showToast(data.error || "Failed to resolve flags", "error");
        }
        
    } catch (err) {
        console.error("Error resolving flags:", err);
        showToast("Error processing request", "error");
    }
}

// Suspend user account
async function suspendUser(userId) {
    if (!confirm("Are you sure you want to suspend this user's account?")) return;
    
    try {
        const response = await fetch(`/api/admin/suspend-user/${userId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                reason: "Multiple flags - admin review"
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message, "success");
            await loadFlaggedUsersForReview();
        } else {
            showToast(data.error || "Failed to suspend user", "error");
        }
        
    } catch (err) {
        console.error("Error suspending user:", err);
        showToast("Error processing request", "error");
    }
}

// Reactivate user account
async function reactivateUser(userId) {
    if (!confirm("Are you sure you want to reactivate this user's account?")) return;
    
    try {
        const response = await fetch(`/api/admin/reactivate-user/${userId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                notes: "Account reactivated after review"
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message, "success");
            await loadFlaggedUsersForReview();
        } else {
            showToast(data.error || "Failed to reactivate user", "error");
        }
        
    } catch (err) {
        console.error("Error reactivating user:", err);
        showToast("Error processing request", "error");
    }
}

// Show modal with content
function showModalWithContent(title, content) {
    let modal = document.getElementById('dynamicModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dynamicModal';
        modal.className = 'modal hidden';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-card" style="max-width: 700px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: var(--text-light);">${escapeHtml(title)}</h3>
                <span class="close-x" onclick="closeModal(document.getElementById('dynamicModal'))">&times;</span>
            </div>
            ${content}
            <div style="margin-top: 20px; text-align: right;">
                <button class="btn btn-secondary" onclick="closeModal(document.getElementById('dynamicModal'))">Close</button>
            </div>
        </div>
    `;
    
    openModal(modal);
}
// Check if freelancer needs to submit a statement
async function checkFreelancerStatementNeeded() {
    if (!currentUser || currentUser.role !== 'freelancer') return;
    
    try {
        const response = await fetch('/api/users/my-flag-status', {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.needsStatement && data.pendingReview) {
            const modal = document.getElementById('freelancerStatementModal');
            if (modal) {
                openModal(modal);
            }
        }
    } catch (err) {
        console.error("Error checking statement need:", err);
    }
}

// Submit freelancer statement
document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submitStatementBtn');
    const statementInput = document.getElementById('freelancerStatement');
    const charCountSpan = document.getElementById('statementCharCount');
    
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const statement = statementInput?.value || '';
            
            if (statement.length < 20) {
                showToast("Please provide a detailed statement (minimum 20 characters)", "warning");
                return;
            }
            
            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
                
                const response = await fetch('/api/users/submit-statement', {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ statement: statement })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showToast(data.message, "success");
                    closeModal(document.getElementById('freelancerStatementModal'));
                } else {
                    showToast(data.error || "Failed to submit statement", "error");
                }
            } catch (err) {
                console.error("Error submitting statement:", err);
                showToast("Error submitting statement", "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Statement';
            }
        });
    }
    
    if (statementInput && charCountSpan) {
        statementInput.addEventListener('input', () => {
            const count = statementInput.value.length;
            charCountSpan.textContent = `${count}/1000`;
            charCountSpan.style.color = count > 900 ? '#ef4444' : 'var(--text-gray)';
        });
    }
});
// Show welcome message for first-time users
async function showWelcomeMessage() {
    if (!currentUser) return;
    
    const userId = currentUser.id;
    const userRole = currentUser.role;
    
    // Check if user has seen welcome message before
    const hasSeenWelcome = localStorage.getItem(`welcome_seen_${userId}`);
    if (hasSeenWelcome === 'true') return;
    
    // Wait a bit for page to load
    setTimeout(() => {
        const modal = document.createElement('div');
        modal.className = 'welcome-modal';
        
        const isClient = userRole === 'client';
        const iconClass = isClient ? 'client' : 'freelancer';
        const icon = isClient ? '🤝' : '💼';
        const title = isClient ? 'Welcome to Core Insight Marketplace!' : 'Welcome to Core Insight Freelancer Hub!';
        
        modal.innerHTML = `
            <div class="welcome-modal-content">
                <div class="welcome-icon ${iconClass}">
                    ${icon}
                </div>
                <h2>${title}</h2>
                
                <p><strong>Core Insight</strong> is a neutral marketplace where <strong>clients and freelancers</strong> connect directly — no middlemen, no hidden fees, no payment holds.</p>
                
                <div class="welcome-highlight">
                    <p><i class="fas fa-check-circle"></i> <strong>We do NOT hold your funds</strong> — 100% direct payments</p>
                    <p><i class="fas fa-check-circle"></i> <strong>We do NOT take commissions</strong> — freelancers keep 100%</p>
                    <p><i class="fas fa-check-circle"></i> <strong>We are only a meeting platform</strong> — you control the transaction</p>
                    <p><i class="fas fa-check-circle"></i> <strong>No discrimination</strong> — choose based on skills & merit only</p>
                </div>
                
                <div class="welcome-features">
                    <div class="welcome-feature ${isClient ? 'client-feature' : 'freelancer-feature'}">
                        <i class="fas ${isClient ? 'fa-search' : 'fa-briefcase'}"></i>
                        <span>${isClient ? 'Find Top Talent' : 'Showcase Your Skills'}</span>
                    </div>
                    <div class="welcome-feature ${isClient ? 'client-feature' : 'freelancer-feature'}">
                        <i class="fas ${isClient ? 'fa-comments' : 'fa-handshake'}"></i>
                        <span>${isClient ? 'Direct Negotiation' : 'Direct Payments'}</span>
                    </div>
                    <div class="welcome-feature ${isClient ? 'client-feature' : 'freelancer-feature'}">
                        <i class="fas ${isClient ? 'fa-star' : 'fa-chart-line'}"></i>
                        <span>${isClient ? 'Merit-Based Hiring' : 'Build Your Reputation'}</span>
                    </div>
                </div>
                
                <div class="welcome-checkbox">
                    <input type="checkbox" id="dontShowAgain">
                    <label for="dontShowAgain">Don't show this again</label>
                </div>
                
                <button class="welcome-btn" id="closeWelcomeBtn">
                    <i class="fas fa-rocket"></i> Get Started
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const closeBtn = document.getElementById('closeWelcomeBtn');
        const dontShowAgain = document.getElementById('dontShowAgain');
        
        closeBtn.addEventListener('click', () => {
            if (dontShowAgain && dontShowAgain.checked) {
                localStorage.setItem(`welcome_seen_${userId}`, 'true');
            }
            modal.remove();
        });
        
        // Close when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (dontShowAgain && dontShowAgain.checked) {
                    localStorage.setItem(`welcome_seen_${userId}`, 'true');
                }
                modal.remove();
            }
        });
        
    }, 1500);
}
// Add this to your existing DOMContentLoaded
setTimeout(checkFreelancerStatementNeeded, 2000);
// ============================================
// ADD TO EXISTING FUNCTIONS
// ============================================

      

// Check freelancer warning on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth to load
    setTimeout(async () => {
        await showFreelancerWarningIfFlagged();
    }, 1500);
    // Setup delete modal buttons
    setupDeleteModalButtons();
});
// Initialize subscription checking
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth to load
    setTimeout(async () => {
        await checkSubscriptionAndLock();
        
        // Check every 30 seconds for subscription status
        setInterval(async () => {
            await checkSubscriptionAndLock();
        }, 30000);
    }, 2000);
});
// Add admin review button if admin
function addAdminReviewButton() {
    if (currentUser?.role === 'admin') {
        const headerActions = document.querySelector('.header-actions');
        if (headerActions && !document.getElementById('adminReviewBtn')) {
            const adminBtn = document.createElement('button');
            adminBtn.id = 'adminReviewBtn';
            adminBtn.className = 'auth-btn';
            adminBtn.innerHTML = '<i class="fas fa-gavel"></i> Admin Review';
            adminBtn.onclick = showAdminReviewPanel;
            headerActions.appendChild(adminBtn);
        }
    }
}

// Call this after auth check
const originalUpdateHeader = updateHeader;
window.updateHeader = function() {
    originalUpdateHeader();
    addAdminReviewButton();
};
// FORCE OVERRIDE - Put this at the very end of the file
// This ensures the working functions are the final ones

// Make sure the real service form handler is used
window.handleServiceFormSubmit = handleServiceFormSubmit;

// Make sure the real profile functions are used
window.showFreelancerProfile = showFreelancerProfile;
window.switchProfileTab = switchProfileTab;
window.handleProfileFormSubmit = handleProfileFormSubmit;

// Re-attach event listeners after everything loads
setTimeout(function() {
    // Re-attach service form listener
    const serviceForm = document.getElementById('serviceForm');
    if (serviceForm) {
        serviceForm.removeEventListener('submit', handleServiceFormSubmit);
        serviceForm.addEventListener('submit', handleServiceFormSubmit);
    }
    
    // Re-attach profile form listener
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.removeEventListener('submit', handleProfileFormSubmit);
        profileForm.addEventListener('submit', handleProfileFormSubmit);
    }
    
    console.log('✅ All event listeners re-attached successfully');
}, 100);

// ==================== FIX setupServiceForm FUNCTION ====================
function setupServiceForm() {
    const serviceForm = document.getElementById('serviceForm');
    if (serviceForm) {
        // Remove any existing listeners
        const newForm = serviceForm.cloneNode(true);
        serviceForm.parentNode.replaceChild(newForm, serviceForm);
        
        // Add the submit handler
        newForm.addEventListener('submit', handleServiceFormSubmit);
        console.log('✅ Service form listener attached');
    }
}

// ==================== FIX renderServices FOR TAGS ====================
// Override the renderServices function to handle tags correctly
const originalRenderServices = window.renderServices;
window.renderServices = function(servicesToRender) {
    const container = document.getElementById('servicesList');
    const noServices = document.getElementById('noServices');

    if (!container) return;

    if (!servicesToRender || servicesToRender.length === 0) {
        container.innerHTML = '';
        if (noServices) noServices.style.display = 'block';
        return;
    }

    if (noServices) noServices.style.display = 'none';

    container.innerHTML = servicesToRender.map(service => {
        const serviceId = service.id;
        const title = service.title || 'Untitled Service';
        const description = service.description || 'No description available';
        const price = service.price || 0;
        const providerName = service.username || 'Unknown';
        const userId = service.user_id;
        const favoriteCount = service.favorite_count || 0;
        const avgRating = service.avg_rating || 0;
        const reviewCount = service.review_count || 0;
        
        // FIX: Handle tags properly - ensure it's an array
        let tagsArray = [];
        if (service.tags) {
            if (typeof service.tags === 'string') {
                try {
                    tagsArray = JSON.parse(service.tags);
                } catch (e) {
                    tagsArray = service.tags.split(',').map(t => t.trim());
                }
            } else if (Array.isArray(service.tags)) {
                tagsArray = service.tags;
            }
        }
        
        const shortDescription = description.length > 120 ? description.substring(0, 120) + '...' : description;

        const providerPictureHtml = service.profile_picture_url ?
            `<div class="profile-picture-wrapper">
                <img src="${service.profile_picture_url}" alt="${providerName}" class="provider-profile-picture"
                     onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'provider-initials\\'>${providerName.charAt(0).toUpperCase()}</div>';">
            </div>` :
            `<div class="provider-initials">${providerName.charAt(0).toUpperCase()}</div>`;

        const isLoggedIn = !!currentUser;
        const isClient = currentUser?.role === 'client';
        const isOwner = currentUser?.id === userId;

        let actionButtons = '';

        if (isLoggedIn && !isOwner) {
            actionButtons += `
                <button class="btn chat-btn" onclick="checkAndStartConversation(${serviceId}, ${userId})">
                    <i class="fas fa-comments"></i> Chat
                </button>
                <button class="btn profile-btn" onclick="openFreelancerProfile(${userId})">
                    <i class="fas fa-user"></i> View Profile
                </button>
            `;
        } else if (!isLoggedIn) {
            actionButtons += `
                <button class="btn chat-btn" onclick="showToast('Please login to chat', 'warning'); openModal(document.getElementById('loginModal'))">
                    <i class="fas fa-comments"></i> Chat
                </button>
                <button class="btn profile-btn" onclick="showToast('Please login to view profile', 'warning'); openModal(document.getElementById('loginModal'))">
                    <i class="fas fa-user"></i> View Profile
                </button>
            `;
        } else if (isOwner) {
            actionButtons += `
                <button class="btn profile-btn" onclick="openFreelancerProfile(${userId})">
                    <i class="fas fa-user"></i> View Profile
                </button>
            `;
        }

        if (isLoggedIn && isClient && !isOwner) {
            actionButtons += `
                <button class="btn recruit-btn" onclick="recruitFreelancer(${userId}, ${serviceId}, this)">
                    <i class="fas fa-user-plus"></i> Recruit
                </button>
            `;
        }

        if (isLoggedIn && !isOwner) {
            const isFavorited = service.is_favorited ? true : false;
            const favoriteIcon = isFavorited ? 'fas fa-heart' : 'far fa-heart';
            actionButtons += `
                <button class="btn favorite-btn ${isFavorited ? 'active' : ''}" onclick="toggleServiceFavorite(${serviceId}, this)" data-service-id="${serviceId}">
                    <i class="${favoriteIcon}"></i> Favorite <span class="favorite-count">${favoriteCount}</span>
                </button>
            `;
        }

        if (isLoggedIn && (isOwner || currentUser?.role === 'admin')) {
            actionButtons += `
                <button class="btn btn-danger" onclick="confirmDeleteService(${serviceId}, '${escapeHtml(title)}', ${userId}, ${isOwner})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            `;
        }

        const ratingHtml = avgRating > 0 ? 
            `<div class="service-rating">
                <span class="stars">${generateStars(avgRating)}</span>
                <span class="rating-count">(${reviewCount})</span>
            </div>` : '';

        const deliveryInfo = service.delivery_time ? `
            <div style="margin: 8px 0; color: var(--text-gray); font-size: 0.85rem;">
                <i class="fas fa-clock"></i> Delivery: ${service.delivery_time} days
            </div>
        ` : '';
        
        const revisionsInfo = service.revisions ? `
            <div style="margin: 5px 0; color: var(--text-gray); font-size: 0.85rem;">
                <i class="fas fa-redo-alt"></i> Revisions: ${service.revisions}
            </div>
        ` : '';

        return `
            <div class="service-card" data-service-id="${serviceId}">
                <div class="service-header">
                    <h3 class="service-title">${escapeHtml(title)}</h3>
                    <div class="service-price">${price > 0 ? `$${price}` : 'Free'}</div>
                </div>

                <div class="service-provider-info">
                    ${providerPictureHtml}
                    <div class="provider-info">
                        <div class="service-provider-name">${escapeHtml(providerName)}</div>
                        <div class="service-provider">${escapeHtml(service.category || 'General')}</div>
                        ${ratingHtml}
                    </div>
                </div>

                <div class="description-container">
                    <p class="service-description">${escapeHtml(shortDescription)}</p>
                </div>

                ${deliveryInfo}
                ${revisionsInfo}

                ${tagsArray.length > 0 ? `
                    <div class="service-tags">
                        ${tagsArray.slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}

                <div class="service-actions">
                    ${actionButtons}
                </div>

                <button class="btn btn-secondary view-details-btn" onclick="viewServiceDetailsModal(${serviceId})" style="width:100%; margin-top:10px;">
                    <i class="fas fa-info-circle"></i> View Full Details
                </button>
            </div>
        `;
    }).join('');
};




// Profile picture upload - FIXED
function setupProfilePictureUpload() {
    const updatePhotoBtn = document.getElementById('updatePhotoBtn');
    const profilePictureInput = document.getElementById('profilePictureInput');
    
    if (!updatePhotoBtn || !profilePictureInput) return;
    
    // Remove all existing listeners by cloning
    const newBtn = updatePhotoBtn.cloneNode(true);
    updatePhotoBtn.parentNode.replaceChild(newBtn, updatePhotoBtn);
    
    const newInput = profilePictureInput.cloneNode(true);
    profilePictureInput.parentNode.replaceChild(newInput, profilePictureInput);
    
    newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        // Clear the input value so same file can be selected again
        newInput.value = '';
        newInput.click();
    });
    
    newInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            uploadProfilePicture(file);
        }
    });
}


// ==================== PROFILE PICTURE UPLOAD - FIXED ====================
let isUploading = false;

async function uploadProfilePicture(file) {
    if (isUploading) {
        console.log("Upload already in progress");
        return;
    }
    
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast("Please select an image file", "warning");
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast("File too large! Maximum 5MB", "warning");
        return;
    }
    
    isUploading = true;
    showToast("Uploading profile picture...", "info");
    
    const formData = new FormData();
    formData.append('profile_picture', file);
    
    try {
        const response = await fetch('/api/freelancer/profile-picture', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast('✅ Profile picture updated!', 'success');
            // Update the image immediately without reloading the whole profile
            const profileImg = document.getElementById('profilePicture');
            if (profileImg) {
                profileImg.src = result.profile_picture;
                profileImg.style.display = 'block';
                const profileInitials = document.getElementById('profileInitials');
                if (profileInitials) profileInitials.style.display = 'none';
            }
        } else {
            showToast(result.error || 'Upload failed', 'error');
        }
    } catch (err) {
        console.error('Upload error:', err);
        showToast('Error uploading picture', 'error');
    } finally {
        isUploading = false;
        // Clear the file input
        const input = document.getElementById('profilePictureInput');
        if (input) input.value = '';
    }
}

function initProfilePictureUpload() {
    const updatePhotoBtn = document.getElementById('updatePhotoBtn');
    const profilePictureInput = document.getElementById('profilePictureInput');
    
    if (!updatePhotoBtn || !profilePictureInput) {
        console.log("Profile picture elements not found");
        return;
    }
    
    // Remove any existing listeners
    const newBtn = updatePhotoBtn.cloneNode(true);
    updatePhotoBtn.parentNode.replaceChild(newBtn, updatePhotoBtn);
    
    const newInput = profilePictureInput.cloneNode(true);
    profilePictureInput.parentNode.replaceChild(newInput, profilePictureInput);
    
    newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Update photo button clicked");
        newInput.click();
    });
    
    newInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
            console.log("File selected:", e.target.files[0].name);
            uploadProfilePicture(e.target.files[0]);
        }
    });
    
    console.log("Profile picture upload initialized");
}
// ==================== CERTIFICATE UPLOAD - FIXED ====================
let isCertUploading = false;

// ==================== FIXED CERTIFICATE UPLOAD - WORKING VERSION ====================
function setupCertificateUpload() {
    const browseBtn = document.getElementById('browseCertificatesBtn');
    const certificateInput = document.getElementById('certificateImagesInput');
    const uploadArea = document.getElementById('certificateUploadArea');
    
    if (!browseBtn) {
        console.error("Browse certificates button not found - check if element exists");
        return;
    }
    
    if (!certificateInput) {
        console.error("Certificate input not found - check if element exists");
        return;
    }
    
    // Remove any existing listeners by creating fresh ones
    const newBrowseBtn = browseBtn.cloneNode(true);
    browseBtn.parentNode.replaceChild(newBrowseBtn, browseBtn);
    
    // Simple direct click handler for browse button
    newBrowseBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Browse certificates button clicked - opening file picker");
        certificateInput.click();
    };
    
    // Handle file selection
    certificateInput.onchange = async function(e) {
        if (e.target.files && e.target.files.length > 0) {
            console.log(`Selected ${e.target.files.length} certificate(s)`);
            await uploadCertificates(Array.from(e.target.files));
        }
        // Reset the input so same file can be selected again
        this.value = '';
    };
    
    // Optional: Handle upload area click for drag & drop
    if (uploadArea) {
        const newUploadArea = uploadArea.cloneNode(true);
        uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
        
        newUploadArea.ondragover = function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        };
        
        newUploadArea.ondragleave = function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
        };
        
        newUploadArea.ondrop = async function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                await uploadCertificates(Array.from(e.dataTransfer.files));
            }
        };
    }
    
    console.log("Certificate upload initialized successfully");
}

// FIXED Certificate Upload Function
async function uploadCertificates(files) {
    const maxFiles = 5;
    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    // Validate files
    const validFiles = [];
    for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
            showToast(`${file.name} is not an image`, 'warning');
            continue;
        }
        if (file.size > maxSize) {
            showToast(`${file.name} exceeds 5MB`, 'warning');
            continue;
        }
        validFiles.push(file);
    }
    
    if (validFiles.length === 0) return;
    if (validFiles.length > maxFiles) {
        showToast(`Maximum ${maxFiles} files`, 'warning');
        return;
    }
    
    // Show progress
    const progressDiv = document.getElementById('certificateProgress');
    const progressBar = document.getElementById('certificateProgressBar');
    const progressText = document.getElementById('certificateProgressText');
    
    if (progressDiv) progressDiv.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = 'Preparing upload...';
    
    // Upload each file
    const uploadedUrls = [];
    for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        if (progressBar) progressBar.style.width = `${((i + 1) / validFiles.length) * 50}%`;
        if (progressText) progressText.textContent = `Uploading ${i + 1}/${validFiles.length}: ${file.name}`;
        
        const formData = new FormData();
        formData.append('certificate_images', file);
        
        try {
            const response = await fetch('/api/freelancer/certificate-images', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                uploadedUrls.push(...(result.certificate_images || []));
            } else {
                showToast(`Failed to upload ${file.name}: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (err) {
            console.error(`Upload error for ${file.name}:`, err);
            showToast(`Error uploading ${file.name}`, 'error');
        }
    }
    
    if (uploadedUrls.length > 0) {
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = 'Complete! Refreshing...';
        showToast(`✅ ${uploadedUrls.length} certificate(s) uploaded!`, 'success');
        
        // FORCE PROFILE REFRESH
        setTimeout(() => {
            if (typeof showFreelancerProfile === 'function') {
                showFreelancerProfile();
            }
            // Also reload the edit form certificates
            loadCertificatesIntoEditForm();
        }, 1500);
    } else {
        showToast('No certificates were uploaded', 'error');
    }
    
    // Hide progress after 3 seconds
    setTimeout(() => {
        if (progressDiv) progressDiv.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
    }, 3000);
    
    // Clear file input
    const certificateInput = document.getElementById('certificateImagesInput');
    if (certificateInput) certificateInput.value = '';
}

// Helper function to reload certificates in edit form
async function loadCertificatesIntoEditForm() {
    try {
        const response = await fetch('/api/freelancer/profile', {
            credentials: 'include'
        });
        
        if (!response.ok) return;
        
        const profile = await response.json();
        const certificatesContainer = document.getElementById('profileCertificates');
        
        if (certificatesContainer) {
            const certImages = profile.certificate_images || profile.certificate_image_urls;
            if (certImages && Array.isArray(certImages) && certImages.length > 0) {
                certificatesContainer.innerHTML = certImages.map((cert, index) => `
                    <div class="certificate-item">
                        <img src="${cert}" alt="Certificate ${index + 1}" class="certificate-image" 
                             style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; cursor: pointer;" 
                             onclick="openCertificateViewer('${cert}', ${index})">
                        <button class="remove-certificate" onclick="removeCertificate(${index})">&times;</button>
                    </div>
                `).join('');
            } else {
                certificatesContainer.innerHTML = '<p style="color: var(--text-gray);">No certificates uploaded yet.</p>';
            }
        }
    } catch (err) {
        console.error("Error reloading certificates:", err);
    }
}
// Initialize certificate upload when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setupCertificateUpload();
    console.log('Certificate upload initialized');
});

function initCertificateUpload() {
    const browseBtn = document.getElementById('browseCertificatesBtn');
    const certificateInput = document.getElementById('certificateImagesInput');
    const uploadArea = document.getElementById('certificateUploadArea');
    
    if (!browseBtn || !certificateInput) {
        console.log("Certificate elements not found");
        return;
    }
    
    // Remove existing listeners by cloning
    const newBrowseBtn = browseBtn.cloneNode(true);
    browseBtn.parentNode.replaceChild(newBrowseBtn, browseBtn);
    
    const newInput = certificateInput.cloneNode(true);
    certificateInput.parentNode.replaceChild(newInput, certificateInput);
    
    newBrowseBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Browse certificates button clicked");
        newInput.value = '';
        newInput.click();
    });
    
    if (uploadArea) {
        const newUploadArea = uploadArea.cloneNode(true);
        uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
        
        newUploadArea.addEventListener('click', function(e) {
            if (e.target === newUploadArea || newUploadArea.contains(e.target)) {
                newInput.click();
            }
        });
        
        newUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            newUploadArea.classList.add('dragover');
        });
        
        newUploadArea.addEventListener('dragleave', () => {
            newUploadArea.classList.remove('dragover');
        });
        
        newUploadArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            newUploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                await uploadCertificates(Array.from(e.dataTransfer.files));
            }
        });
    }
    
    newInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            console.log(`Selected ${e.target.files.length} certificate(s)`);
            await uploadCertificates(Array.from(e.target.files));
        }
    });
    
    console.log("Certificate upload initialized");
}
async function removeCertificate(index) {
    if (!confirm("Are you sure you want to remove this certificate?")) return;
    
    try {
        showToast("Removing certificate...", "info");
        
        // Make sure index is a number
        const certIndex = parseInt(index);
        
        const response = await fetch(`/api/freelancer/certificate-images/${certIndex}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast('✅ Certificate removed successfully', 'success');
            
            // Refresh the profile display
            if (typeof showFreelancerProfile === 'function') {
                await showFreelancerProfile();
            } else {
                // If showFreelancerProfile not available, reload the page
                location.reload();
            }
        } else {
            showToast(result.error || 'Failed to remove certificate', 'error');
        }
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error removing certificate: ' + err.message, 'error');
    }
}// Override the original showFreelancerProfile function
const originalShowFreelancerProfile = window.showFreelancerProfile;
window.showFreelancerProfile = async function() {
    const hasAccess = await checkSubscriptionAndLock();
    if (!hasAccess && currentUser?.role === 'freelancer') {
        showToast('Your subscription has expired. Please renew to access your profile.', 'warning');
        return;
    }
    if (originalShowFreelancerProfile) originalShowFreelancerProfile();
};

// Override the original showCreateServiceForm function
const originalShowCreateServiceForm = window.showCreateServiceForm;
window.showCreateServiceForm = async function() {
    const hasAccess = await checkSubscriptionAndLock();
    if (!hasAccess && currentUser?.role === 'freelancer') {
        showToast('Subscription required to create services', 'warning');
        showSubscriptionModal();
        return;
    }
    if (originalShowCreateServiceForm) originalShowCreateServiceForm();
};

// Override checkAndStartConversation function
const originalCheckAndStartConversation = window.checkAndStartConversation;
window.checkAndStartConversation = async function(serviceId, freelancerId) {
    const hasAccess = await checkSubscriptionAndLock();
    if (!hasAccess && currentUser?.role === 'freelancer') {
        showToast('Your subscription has expired. Please renew to send messages.', 'warning');
        showSubscriptionModal();
        return;
    }
    if (originalCheckAndStartConversation) {
        originalCheckAndStartConversation(serviceId, freelancerId);
    }
};

// Override recruitFreelancer function
const originalRecruitFreelancer = window.recruitFreelancer;
window.recruitFreelancer = async function(freelancerId, serviceId, buttonElement) {
    const hasAccess = await checkSubscriptionAndLock();
    if (!hasAccess && currentUser?.role === 'freelancer') {
        showToast('Your subscription has expired. You cannot be recruited until you renew.', 'warning');
        showSubscriptionModal();
        return;
    }
    if (originalRecruitFreelancer) {
        originalRecruitFreelancer(freelancerId, serviceId, buttonElement);
    }
};

// Override sendMessage function
const originalSendMessage = window.sendMessage;
window.sendMessage = async function(e) {
    const hasAccess = await checkSubscriptionAndLock();
    if (!hasAccess && currentUser?.role === 'freelancer') {
        showToast('Your subscription has expired. Please renew to send messages.', 'warning');
        showSubscriptionModal();
        return;
    }
    if (originalSendMessage) {
        originalSendMessage(e);
    }
};

  // Replace your existing removeCertificate function with this:
//================== INITIALIZE EVERYTHING ====================
document.addEventListener('DOMContentLoaded', function() {
    setupServiceForm();
    setupCertificateUpload();
     setupProfilePictureUpload();
    
    
    // Fix profile picture button
   const updatePhotoBtn = document.getElementById('updatePhotoBtn');
const profilePictureInput = document.getElementById('profilePictureInput');

if (updatePhotoBtn && profilePictureInput) {
    // Remove existing listeners
    const newBtn = updatePhotoBtn.cloneNode(true);
    updatePhotoBtn.parentNode.replaceChild(newBtn, updatePhotoBtn);
    
    newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Update photo button clicked");
        profilePictureInput.click();
    });
    
    profilePictureInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            console.log("File selected:", e.target.files[0].name);
            uploadProfilePicture(e.target.files[0]);
        }
    });
}
    
    console.log('✅ All features initialized');
});
// Make subscribe function globally accessible
window.subscribe = async function(plan) {
    if (!currentUser) {
        showToast("Please login to subscribe", "warning");
        openModal(document.getElementById('loginModal'));
        return;
    }
    
    showToast("Processing subscription...", "info");
    
    try {
        const response = await fetch('/api/subscription/pay', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ plan: plan })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showToast(data.error || "Failed to process subscription", "error");
            return;
        }
        
        if (data.paymentLink) {
            sessionStorage.setItem('pendingSubscription', JSON.stringify({
                transactionRef: data.transactionRef,
                plan: plan,
                amount: data.amount
            }));
            window.location.href = data.paymentLink;
        } else {
            showToast("No payment link received", "error");
        }
    } catch (err) {
        console.error("Subscription error:", err);
        showToast("Error processing subscription", "error");
    }
};

/* ---- mobile nav toggle (originally its own <script> block) ---- */
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileNav = document.getElementById('mobileNav');
    if (mobileMenuToggle && mobileNav) {
        mobileMenuToggle.addEventListener('click', function() {
            mobileNav.classList.toggle('open');
        });
    }
});

/* ============================================================
   ↓↓↓ NEW FEATURES ADD-ON STARTS HERE ↓↓↓
   ============================================================ */

/* ============================================================
   SERVICES — NEW FEATURES ADD-ON
   Everything below is appended AFTER your original code. Nothing
   here deletes your original functions — later function
   declarations of the same name simply win (same pattern used
   throughout this project), which is how this cleanly overrides
   subscription gating, category population, and the duplicate
   handleOfferServiceClick() definitions without editing your
   original code directly.
   ============================================================ */

/* ============================================================
   1. SUBSCRIPTION SYSTEM — REMOVED
   Platform now runs entirely on the 10% transaction fee. These
   overrides make every existing call site (14 of them across the
   original file) behave as "full access, always" without needing
   to touch each one individually.
   ============================================================ */
async function checkSubscriptionStatus() {
  const banner = document.getElementById('subscriptionBanner');
  if (banner) banner.classList.add('hidden');
  return { hasActiveSubscription: true, subscriptionPlan: 'none', daysLeft: 9999, requiresSubscription: false };
}

async function checkSubscriptionAndLock() {
  return true;
}

function applySubscriptionLocks() { /* no-op — subscriptions removed */ }
function removeSubscriptionLocks() { /* no-op — subscriptions removed */ }
function showSubscriptionLockOverlay() { /* no-op — subscriptions removed */ }
function hideSubscriptionLockOverlay() { /* no-op — subscriptions removed */ }
function showSubscriptionRestrictions() { /* no-op — subscriptions removed */ }
function showSubscriptionModal() { /* no-op — subscriptions removed */ }
async function subscribe(plan) { /* no-op — subscriptions removed */ }


/* ============================================================
   2. CATEGORY TAXONOMY
   Replaces the flat categories[] array + single-level dropdown
   with the two-level Category → Subcategory system.
   ============================================================ */
const SERVICE_CATEGORIES = {
  "Home Repair & Maintenance": ["Plumbing", "Electrical", "HVAC", "Handyman", "Appliance Repair", "Roofing", "Locksmith", "Pest Control"],
  "Cleaning": ["House Cleaning", "Deep Cleaning", "Carpet & Upholstery", "Window Cleaning", "Post-Construction Cleaning", "Office Cleaning"],
  "Moving & Delivery": ["Local Moving", "Long-Distance Moving", "Packing Services", "Furniture Delivery", "Courier & Errands"],
  "Construction & Renovation": ["General Contracting", "Carpentry", "Painting", "Flooring", "Masonry", "Welding", "Interior Design"],
  "Automotive": ["Mechanic", "Auto Detailing", "Towing", "Tire Services", "Car Wash"],
  "Landscaping & Outdoor": ["Lawn Care", "Gardening", "Tree Services", "Pool Maintenance", "Fencing", "Pest Control (Outdoor)"],
  "Tech & IT Support": ["Computer Repair", "Phone Repair", "Network Setup", "Smart Home Installation", "Data Recovery", "IT Consulting"],
  "Web & Software Development": ["Web Development", "Mobile App Development", "E-commerce Setup", "WordPress", "Bug Fixing / Maintenance"],
  "Design & Creative": ["Graphic Design", "Logo Design", "UI/UX Design", "Video Editing", "Photography", "Illustration", "Animation"],
  "Writing & Translation": ["Content Writing", "Copywriting", "Editing & Proofreading", "Translation", "Resume Writing", "Ghostwriting"],
  "Marketing & Sales": ["Social Media Management", "SEO", "Paid Advertising", "Email Marketing", "Brand Strategy", "Sales Consulting"],
  "Business & Consulting": ["Business Consulting", "Financial Consulting", "Legal Consulting", "HR Consulting", "Bookkeeping & Accounting"],
  "Education & Tutoring": ["Academic Tutoring", "Language Lessons", "Music Lessons", "Exam Prep", "Career Coaching"],
  "Health & Wellness": ["Personal Training", "Nutrition Coaching", "Massage Therapy", "Life Coaching", "Therapy & Counseling"],
  "Beauty & Personal Care": ["Hair Styling", "Makeup Artistry", "Nail Services", "Barbering", "Spa Services"],
  "Events & Entertainment": ["Event Planning", "Catering", "DJ & Music", "Photography (Events)", "Decoration", "MC / Hosting"],
  "Childcare & Pet Care": ["Babysitting", "Nanny Services", "Pet Sitting", "Dog Walking", "Pet Grooming"],
  "Security": ["Security Guard Services", "CCTV Installation", "Alarm Systems"],
  "Other": [],
};

function populateTwoLevelCategorySelect(mainId, subId) {
  const mainSelect = document.getElementById(mainId);
  const subSelect = document.getElementById(subId);
  if (!mainSelect) return;

  const currentValue = mainSelect.value;
  mainSelect.innerHTML = '<option value="">Select a category</option>' +
    Object.keys(SERVICE_CATEGORIES).map(cat => `<option value="${cat}">${cat}</option>`).join('');
  if (currentValue) mainSelect.value = currentValue;

  if (subSelect) {
    mainSelect.onchange = () => {
      const subs = SERVICE_CATEGORIES[mainSelect.value] || [];
      if (!subs.length) {
        subSelect.innerHTML = '<option value="">N/A</option>';
        subSelect.disabled = true;
      } else {
        subSelect.disabled = false;
        subSelect.innerHTML = '<option value="">Select a subcategory</option>' +
          subs.map(s => `<option value="${s}">${s}</option>`).join('');
      }
    };
  }
}

// Overrides the original — builds the wizard's category selects,
// the browse filter selects, and the category chip row, all from
// the same taxonomy instead of the old flat categories[] array.
function populateCategoryDropdowns() {
  populateTwoLevelCategorySelect('serviceCategory', 'serviceSubcategory');
  populateTwoLevelCategorySelect('jobCategorySelect', 'jobSubcategorySelect');

  const categoryFilter = document.getElementById('categoryFilter');
  const subcategoryFilter = document.getElementById('subcategoryFilter');
  const jobCategoryFilter = document.getElementById('jobCategoryFilter');
  [categoryFilter, jobCategoryFilter].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '<option value="">All Categories</option>' +
      Object.keys(SERVICE_CATEGORIES).map(cat => `<option value="${cat}">${cat}</option>`).join('');
  });
  if (categoryFilter && subcategoryFilter) {
    categoryFilter.addEventListener('change', () => {
      const subs = SERVICE_CATEGORIES[categoryFilter.value] || [];
      subcategoryFilter.innerHTML = '<option value="">All Subcategories</option>' +
        subs.map(s => `<option value="${s}">${s}</option>`).join('');
      filterAndRenderServices();
    });
  }

  const chipRow = document.getElementById('categoryChipRow');
  if (chipRow) {
    chipRow.innerHTML = ['All', ...Object.keys(SERVICE_CATEGORIES)].map(cat =>
      `<button class="category-chip ${cat === 'All' ? 'active' : ''}" data-cat="${cat === 'All' ? '' : cat}">${cat}</button>`
    ).join('');
    chipRow.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chipRow.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (categoryFilter) { categoryFilter.value = chip.dataset.cat; categoryFilter.dispatchEvent(new Event('change')); }
      });
    });
  }
}

function getSelectedServiceCategory() {
  const main = document.getElementById('serviceCategory')?.value.trim() || '';
  const sub = document.getElementById('serviceSubcategory')?.value.trim() || '';
  return main && sub ? `${main} > ${sub}` : main;
}


/* ============================================================
   3. OFFER-A-SERVICE WIZARD — step navigation
   ============================================================ */
let serviceWizardStep = 1;
const SERVICE_WIZARD_TOTAL_STEPS = 5;

function goToServiceWizardStep(step) {
  serviceWizardStep = Math.max(1, Math.min(SERVICE_WIZARD_TOTAL_STEPS, step));
  document.querySelectorAll('#serviceWizardSteps .wizard-step').forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === serviceWizardStep);
    el.classList.toggle('done', s < serviceWizardStep);
  });
  document.querySelectorAll('#serviceForm .wizard-panel').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.panel) === serviceWizardStep);
  });
  const backBtn = document.getElementById('serviceWizardBackBtn');
  const nextBtn = document.getElementById('serviceWizardNextBtn');
  if (backBtn) backBtn.style.visibility = serviceWizardStep === 1 ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.style.display = serviceWizardStep === SERVICE_WIZARD_TOTAL_STEPS ? 'none' : 'inline-flex';
  if (serviceWizardStep === SERVICE_WIZARD_TOTAL_STEPS) populateServiceWizardReview();
}

function serviceWizardStepIsValid(step) {
  if (step === 1) {
    return document.getElementById('serviceTitle')?.value.trim()
      && document.getElementById('serviceCategory')?.value
      && document.getElementById('serviceDescription')?.value.trim();
  }
  if (step === 2) {
    const pricingType = document.getElementById('pricingType')?.value;
    if (pricingType === 'fixed') return !!document.getElementById('fixedPrice')?.value;
    return true; // flexible pricing has no hard-required field
  }
  return true;
}

function populateServiceWizardReview() {
  const title = document.getElementById('serviceTitle')?.value || '';
  const pricingType = document.getElementById('pricingType')?.value;
  const priceDisplay = pricingType === 'fixed'
    ? `$${document.getElementById('fixedPrice')?.value || '0'} fixed`
    : `Starting from $${document.getElementById('startingPrice')?.value || '—'} (quote-based)`;
  document.getElementById('serviceWizardReviewSummary').innerHTML = `
    <div class="info-card">
      <h4>Ready to publish</h4>
      <p style="margin:4px 0;"><strong>${title}</strong></p>
      <p style="margin:4px 0;color:var(--charcoal-soft);font-size:13px;">${getSelectedServiceCategory()}</p>
      <p style="margin:4px 0;color:var(--gold-deep);font-weight:600;">${priceDisplay}</p>
    </div>`;
}

document.getElementById('serviceWizardNextBtn')?.addEventListener('click', () => {
  if (!serviceWizardStepIsValid(serviceWizardStep)) {
    showToast('Fill in the required fields before continuing.', 'error');
    return;
  }
  goToServiceWizardStep(serviceWizardStep + 1);
});
document.getElementById('serviceWizardBackBtn')?.addEventListener('click', () => goToServiceWizardStep(serviceWizardStep - 1));


/* ============================================================
   4. FIXED / FLEXIBLE PRICING TOGGLE
   ============================================================ */
document.querySelectorAll('.pricing-type-option').forEach(option => {
  option.addEventListener('click', () => {
    document.querySelectorAll('.pricing-type-option').forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
    const type = option.dataset.pricing;
    document.getElementById('pricingType').value = type;
    document.getElementById('fixedPriceBlock')?.classList.toggle('show', type === 'fixed');
    document.getElementById('flexiblePriceBlock')?.classList.toggle('show', type === 'flexible');
  });
});


/* ============================================================
   5. JOB BOARD — client posts a job, freelancers bid
   Note: these call new backend endpoints (/api/jobs, /api/jobs/:id/bids,
   etc.) that aren't built yet — this is the frontend half. Let me
   know when you want the matching backend routes and I'll build
   those as a companion file, same as the POD wallet system.
   ============================================================ */
document.getElementById('jobBoardTabBtn')?.addEventListener('click', () => switchTab('jobBoard'));
document.getElementById('providerJobBoardTabBtn')?.addEventListener('click', () => switchTab('jobBoard'));
document.getElementById('postJobBtn')?.addEventListener('click', () => {
  showServicesBrowser();
  switchTab('jobBoard');
  document.getElementById('postJobForm')?.classList.remove('hidden');
});
document.getElementById('openPostJobFormBtn')?.addEventListener('click', () => document.getElementById('postJobForm')?.classList.remove('hidden'));
document.getElementById('cancelPostJobBtn')?.addEventListener('click', () => document.getElementById('postJobForm')?.classList.add('hidden'));

async function submitJobPost() {
  if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
  const payload = {
    title: document.getElementById('jobTitle')?.value.trim(),
    category: document.getElementById('jobCategorySelect')?.value,
    subcategory: document.getElementById('jobSubcategorySelect')?.value,
    description: document.getElementById('jobDescription')?.value.trim(),
    budget_min: document.getElementById('jobBudgetMin')?.value || null,
    budget_max: document.getElementById('jobBudgetMax')?.value || null,
    location: document.getElementById('jobLocation')?.value.trim(),
    qualifications: document.getElementById('jobQualifications')?.value.trim(),
  };
  if (!payload.title || !payload.category || !payload.description) {
    showToast('Fill in title, category, and description.', 'error');
    return;
  }
  try {
    const res = await fetch('/api/jobs', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken?.() || '' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not post job');
    showToast('Job posted', 'success');
    document.getElementById('postJobForm')?.classList.add('hidden');
    loadJobs();
  } catch (e) {
    showToast(e.message || 'Could not post job', 'error');
  }
}
document.getElementById('submitJobPostBtn')?.addEventListener('click', submitJobPost);

async function loadJobs() {
  const listEl = document.getElementById('jobsList');
  const noneEl = document.getElementById('noJobs');
  if (!listEl) return;
  try {
    const status = document.getElementById('jobStatusFilter')?.value || '';
    const category = document.getElementById('jobCategoryFilter')?.value || '';
    const params = new URLSearchParams({ status, category });
    const res = await fetch(`/api/jobs?${params}`, { credentials: 'include' });
    const jobs = res.ok ? await res.json() : [];
    if (!jobs.length) { listEl.innerHTML = ''; if (noneEl) noneEl.style.display = 'block'; return; }
    if (noneEl) noneEl.style.display = 'none';
    listEl.innerHTML = jobs.map(renderJobCard).join('');
    listEl.querySelectorAll('.bid-submit-trigger').forEach(btn => {
      btn.addEventListener('click', () => openSubmitBidModal(btn.dataset.jobId, btn.dataset.jobTitle));
    });
  } catch (e) {
    console.error('loadJobs failed:', e);
  }
}

function renderJobCard(job) {
  const budget = job.budget_min && job.budget_max
    ? `$${job.budget_min}–$${job.budget_max}`
    : (job.budget_max ? `Up to $${job.budget_max}` : 'Budget open');
  return `<div class="job-card">
    <div class="job-card-header">
      <h3>${escapeHtml(job.title)}</h3>
      <span class="job-budget">${budget}</span>
    </div>
    <div class="job-meta-row">
      <span><i class="fas fa-tag"></i> ${escapeHtml(job.category)}${job.subcategory ? ' / ' + escapeHtml(job.subcategory) : ''}</span>
      ${job.location ? `<span><i class="fas fa-location-dot"></i> ${escapeHtml(job.location)}</span>` : ''}
      <span class="job-status-pill ${job.status}">${job.status}</span>
    </div>
    <p class="job-desc">${escapeHtml(job.description)}</p>
    ${job.qualifications ? `<div class="job-tags"><span class="job-tag">${escapeHtml(job.qualifications)}</span></div>` : ''}
    <div class="job-card-footer">
      <span class="bid-count"><strong>${job.bid_count || 0}</strong> bid${job.bid_count === 1 ? '' : 's'}</span>
      ${job.status === 'open' && userRole === 'freelancer' ? `<button class="btn primary sm bid-submit-trigger" data-job-id="${job.id}" data-job-title="${escapeHtml(job.title)}">Submit a bid</button>` : ''}
    </div>
  </div>`;
}

function openSubmitBidModal(jobId, jobTitle) {
  if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
  document.getElementById('submitBidModal').dataset.jobId = jobId;
  document.getElementById('submitBidJobContext').innerHTML = `<strong>${escapeHtml(jobTitle)}</strong>`;
  document.getElementById('bidAmount').value = '';
  document.getElementById('bidNote').value = '';
  document.getElementById('submitBidError').classList.remove('show');
  openModal(document.getElementById('submitBidModal'));
}
document.getElementById('closeSubmitBidModal')?.addEventListener('click', () => closeModal(document.getElementById('submitBidModal')));

document.getElementById('submitBidSendBtn')?.addEventListener('click', async () => {
  const jobId = document.getElementById('submitBidModal').dataset.jobId;
  const amount = document.getElementById('bidAmount')?.value;
  const note = document.getElementById('bidNote')?.value.trim();
  const errEl = document.getElementById('submitBidError');
  if (!amount) { errEl.textContent = 'Enter a bid amount.'; errEl.classList.add('show'); return; }
  try {
    const res = await fetch(`/api/jobs/${jobId}/bids`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken?.() || '' },
      body: JSON.stringify({ amount, note }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not submit bid');
    closeModal(document.getElementById('submitBidModal'));
    showToast('Bid submitted', 'success');
    loadJobs();
  } catch (e) {
    errEl.textContent = e.message || 'Could not submit bid';
    errEl.classList.add('show');
  }
});

document.getElementById('jobStatusFilter')?.addEventListener('change', loadJobs);
document.getElementById('jobCategoryFilter')?.addEventListener('change', loadJobs);


/* ============================================================
   6. ASK PROVIDER — unified messaging entry point
   Mirrors openAskSeller() from products.js exactly, with
   item_type: 'service' instead of 'product'.
   ============================================================ */
let askProviderServiceId = null;
let askProviderTargetId = null;

function openAskProvider(serviceId, providerId, providerName, serviceTitle) {
  if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
  askProviderServiceId = serviceId || null;
  askProviderTargetId = providerId || null;
  document.getElementById('askProviderContext').innerHTML = serviceTitle
    ? `<strong>${escapeHtml(serviceTitle)}</strong>`
    : `<strong>${escapeHtml(providerName || 'Provider')}</strong>`;
  document.getElementById('askProviderMessage').value = '';
  document.getElementById('askProviderError').classList.remove('show');
  openModal(document.getElementById('askProviderModal'));
}
document.getElementById('closeAskProviderModal')?.addEventListener('click', () => closeModal(document.getElementById('askProviderModal')));

document.getElementById('askProviderSendBtn')?.addEventListener('click', async () => {
  const msg = document.getElementById('askProviderMessage')?.value.trim();
  const errEl = document.getElementById('askProviderError');
  if (!msg) { errEl.textContent = 'Write a message before sending.'; errEl.classList.add('show'); return; }
  try {
    const res = await fetch('/api/messages/start', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCSRFToken?.() || '' },
      body: JSON.stringify({
        item_type: 'service',
        item_id: askProviderServiceId,
        to_user_id: askProviderTargetId,
        message: msg,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not send message');
    closeModal(document.getElementById('askProviderModal'));
    showToast('Message sent — check your inbox for replies.', 'success');
  } catch (e) {
    errEl.textContent = e.message || 'Could not send message';
    errEl.classList.add('show');
  }
});


/* ============================================================
   7. FINAL OVERRIDE — handleOfferServiceClick
   Your original file has this defined twice (subscription-gated
   both times). This is the one that actually runs now — no
   subscription check, freelancers go straight to My Services.
   ============================================================ */
function handleOfferServiceClick() {
  if (!currentUser) { openModal(document.getElementById('loginModal')); return; }
  if (userRole === 'client') {
    showToast('Only freelancers can offer services. Create a freelancer account to get started.', 'info');
    openModal(document.getElementById('signupModal'));
    return;
  }
  showServicesBrowser();
  switchTab('myServices');
}


/* ============================================================
   8. INIT — wire everything up once the DOM is ready
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  populateCategoryDropdowns();
  goToServiceWizardStep(1);
  loadJobs();

  document.getElementById('findServicesBtn')?.addEventListener('click', () => {
    document.getElementById('findServicesBtn')?.classList.add('active');
    document.getElementById('postJobBtn')?.classList.remove('active');
    showServicesBrowser();
    switchTab('browse');
  });
});

/* ============================================================
   ↓↓↓ ESCROW / QUOTE SYSTEM WIRING ↓↓↓
   Connects the frontend to service-escrow-backend.js — quote
   sending, Active Orders, arrival codes, and client review actions.
   ============================================================ */

/* ---------- Active Orders tab ---------- */
document.getElementById('myOrdersTabBtn')?.addEventListener('click', () => switchTab('myOrders'));
document.getElementById('providerMyOrdersTabBtn')?.addEventListener('click', () => switchTab('myOrders'));

async function loadOrders() {
  const listEl = document.getElementById('ordersList');
  const noneEl = document.getElementById('noOrders');
  if (!listEl) return;
  try {
    const res = await fetch('/api/service-orders/mine', { credentials: 'include' });
    const orders = res.ok ? await res.json() : [];
    if (!orders.length) { listEl.innerHTML = ''; if (noneEl) noneEl.style.display = 'block'; return; }
    if (noneEl) noneEl.style.display = 'none';
    listEl.innerHTML = orders.map(renderOrderCard).join('');
    wireOrderCardActions();
  } catch (e) {
    console.error('loadOrders failed:', e);
  }
}

function renderOrderCard(order) {
  const isProvider = currentUser && order.provider_id === currentUser.id;
  const otherParty = isProvider ? order.client_name : order.provider_name;
  const statusLabel = (order.status || 'pending').replace(/_/g, ' ');

  let actionsHtml = '';
  if (order.status === 'escrow_funded' && !isProvider) {
    actionsHtml = `<button class="btn sm primary order-generate-code-btn" data-order-id="${order.id}">Get Arrival Code</button>`;
  } else if (order.status === 'travelling' && !isProvider) {
    actionsHtml = `<button class="btn sm order-view-code-btn" data-order-id="${order.id}" data-code="${order.arrival_code || ''}">View Arrival Code</button>`;
  } else if (order.status === 'travelling' && isProvider) {
    actionsHtml = `<button class="btn sm primary order-verify-arrival-btn" data-order-id="${order.id}">Enter Arrival Code</button>`;
  } else if (order.status === 'in_progress' && isProvider) {
    actionsHtml = `<button class="btn sm primary order-mark-complete-btn" data-order-id="${order.id}">Mark Work Complete</button>
                    <button class="btn sm order-change-order-btn" data-order-id="${order.id}">Request Additional Work</button>`;
  } else if (order.status === 'client_review' && !isProvider) {
    actionsHtml = `<button class="btn sm success order-accept-release-btn" data-order-id="${order.id}">Accept & Release Funds</button>
                    <button class="btn sm order-request-fix-btn" data-order-id="${order.id}">Request a Fix</button>
                    <button class="btn sm danger order-dispute-btn" data-order-id="${order.id}">Open Dispute</button>`;
  }

  return `<div class="service-card" style="cursor:default;">
    <div class="card-body">
      <h3>${escapeHtml(order.title || 'Service Order')}</h3>
      <div class="provider-byline">
        <div class="provider-meta">
          <div class="name">${isProvider ? 'Client' : 'Provider'}: ${escapeHtml(otherParty || '—')}</div>
        </div>
      </div>
      <div class="price-row">
        <div class="price">$${Number(order.agreed_price || 0).toFixed(2)}</div>
        <span class="status-pill ${order.status}">${statusLabel}</span>
      </div>
      <div class="order-actions-row">${actionsHtml}</div>
    </div>
  </div>`;
}

function wireOrderCardActions() {
  document.querySelectorAll('.order-generate-code-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/service-orders/${btn.dataset.orderId}/generate-arrival-code`, { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showArrivalCodeDisplay(data.arrival_code);
        loadOrders();
      } catch (e) { showToast(e.message || 'Could not generate code', 'error'); }
    });
  });

  document.querySelectorAll('.order-view-code-btn').forEach(btn => {
    btn.addEventListener('click', () => showArrivalCodeDisplay(btn.dataset.code));
  });

  document.querySelectorAll('.order-verify-arrival-btn').forEach(btn => {
    btn.addEventListener('click', () => showArrivalCodeEntry(btn.dataset.orderId));
  });

  document.querySelectorAll('.order-mark-complete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Mark this job as complete? The client will be asked to review.')) return;
      try {
        const res = await fetch(`/api/service-orders/${btn.dataset.orderId}/mark-completed`, { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('Marked complete — awaiting client review', 'success');
        loadOrders();
      } catch (e) { showToast(e.message || 'Could not update order', 'error'); }
    });
  });

  document.querySelectorAll('.order-accept-release-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Release payment to the provider? This confirms the work is satisfactory.')) return;
      try {
        const res = await fetch(`/api/service-orders/${btn.dataset.orderId}/accept-release`, { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('Funds released', 'success');
        loadOrders();
      } catch (e) { showToast(e.message || 'Could not release funds', 'error'); }
    });
  });

  document.querySelectorAll('.order-request-fix-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const notes = prompt('What needs to be fixed?');
      if (notes === null) return;
      try {
        const res = await fetch(`/api/service-orders/${btn.dataset.orderId}/request-fix`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('Fix requested', 'success');
        loadOrders();
      } catch (e) { showToast(e.message || 'Could not send request', 'error'); }
    });
  });

  document.querySelectorAll('.order-dispute-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reason = prompt('Describe the issue for our team to review:');
      if (!reason) return;
      try {
        const res = await fetch(`/api/service-orders/${btn.dataset.orderId}/dispute`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('Dispute opened — our team will review', 'info');
        loadOrders();
      } catch (e) { showToast(e.message || 'Could not open dispute', 'error'); }
    });
  });

  document.querySelectorAll('.order-change-order-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const amount = prompt('Additional cost for the extra work (USD):');
      if (!amount) return;
      const scopeDesc = prompt('Briefly describe the additional work:');
      try {
        const res = await fetch(`/api/service-orders/${btn.dataset.orderId}/change-order`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ additional_amount: amount, scope_items: [scopeDesc || 'Additional work'] }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('Change order sent — client has 4 hours to respond', 'success');
      } catch (e) { showToast(e.message || 'Could not send change order', 'error'); }
    });
  });
}

/* ---------- Arrival code modal ---------- */
function showArrivalCodeDisplay(code) {
  document.getElementById('arrivalCodeEntryView')?.classList.add('hidden');
  document.getElementById('arrivalCodeDisplayView')?.classList.remove('hidden');
  document.getElementById('arrivalCodeDisplay').textContent = code || '------';
  openModal(document.getElementById('arrivalCodeModal'));
}
function showArrivalCodeEntry(orderId) {
  document.getElementById('arrivalCodeDisplayView')?.classList.add('hidden');
  document.getElementById('arrivalCodeEntryView')?.classList.remove('hidden');
  document.getElementById('arrivalCodeModal').dataset.orderId = orderId;
  document.getElementById('arrivalCodeInput').value = '';
  document.getElementById('arrivalCodeError').classList.remove('show');
  openModal(document.getElementById('arrivalCodeModal'));
}
document.getElementById('closeArrivalCodeModal')?.addEventListener('click', () => closeModal(document.getElementById('arrivalCodeModal')));
document.getElementById('verifyArrivalCodeBtn')?.addEventListener('click', async () => {
  const orderId = document.getElementById('arrivalCodeModal').dataset.orderId;
  const code = document.getElementById('arrivalCodeInput').value.trim();
  const errEl = document.getElementById('arrivalCodeError');
  try {
    const res = await fetch(`/api/service-orders/${orderId}/verify-arrival`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeModal(document.getElementById('arrivalCodeModal'));
    showToast('Arrival confirmed — work can begin', 'success');
    loadOrders();
  } catch (e) {
    errEl.textContent = e.message || 'Incorrect code';
    errEl.classList.add('show');
  }
});

/* ---------- Send Quote modal (provider-initiated, from an order/job/service context) ---------- */
let sendQuoteContext = { conversationId: null, recipientId: null, serviceId: null, jobId: null, parentQuoteId: null };
let quoteScopeItemCount = 0;

function openSendQuoteModal({ conversationId, recipientId, recipientName, serviceId, jobId, parentQuoteId }) {
  sendQuoteContext = { conversationId, recipientId, serviceId, jobId, parentQuoteId };
  document.getElementById('sendQuoteContext').innerHTML = `<strong>Quote for ${escapeHtml(recipientName || 'client')}</strong>`;
  document.getElementById('quoteAmount').value = '';
  document.getElementById('quoteScopeItems').innerHTML = '';
  quoteScopeItemCount = 0;
  addQuoteScopeItem();
  document.getElementById('sendQuoteError').classList.remove('show');
  openModal(document.getElementById('sendQuoteModal'));
}
function addQuoteScopeItem() {
  const container = document.getElementById('quoteScopeItems');
  const id = `scopeItem${quoteScopeItemCount++}`;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  row.innerHTML = `<input type="text" class="form-input quote-scope-input" id="${id}" placeholder="e.g. Replace washer, test water pressure">`;
  container.appendChild(row);
}
document.getElementById('addQuoteScopeItemBtn')?.addEventListener('click', addQuoteScopeItem);
document.getElementById('closeSendQuoteModal')?.addEventListener('click', () => closeModal(document.getElementById('sendQuoteModal')));

document.getElementById('sendQuoteBtn')?.addEventListener('click', async () => {
  const amount = document.getElementById('quoteAmount').value;
  const scopeItems = Array.from(document.querySelectorAll('.quote-scope-input')).map(i => i.value.trim()).filter(Boolean);
  const errEl = document.getElementById('sendQuoteError');
  if (!amount || !scopeItems.length) {
    errEl.textContent = 'Enter an amount and at least one scope item.';
    errEl.classList.add('show');
    return;
  }
  try {
    const res = await fetch('/api/quotes/send', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: sendQuoteContext.conversationId,
        recipient_id: sendQuoteContext.recipientId,
        amount, scope_items: scopeItems,
        service_id: sendQuoteContext.serviceId, job_id: sendQuoteContext.jobId,
        parent_quote_id: sendQuoteContext.parentQuoteId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeModal(document.getElementById('sendQuoteModal'));
    showToast('Quote sent', 'success');
  } catch (e) {
    errEl.textContent = e.message || 'Could not send quote';
    errEl.classList.add('show');
  }
});

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadOrders();

  // Mobile header: "Switch Account" replaces Login/Signup — opens
  // the same login modal, which serves as the entry point whether
  // logging in fresh or switching to a different account.
  document.getElementById('switchAccountBtn')?.addEventListener('click', () => {
    openModal(document.getElementById('loginModal'));
  });
});