// Mobile Navigation Functionality
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileNav = document.getElementById('mobileNav');
    const mobileLoginOpen = document.getElementById('mobileLoginOpen');
    const mobileSignupOpen = document.getElementById('mobileSignupOpen');
    
    // Toggle mobile menu
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function() {
            mobileNav.classList.toggle('open');
            mobileMenuToggle.innerHTML = mobileNav.classList.contains('open') 
                ? '<i class="fas fa-times"></i>' 
                : '<i class="fas fa-bars"></i>';
        });
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        if (mobileNav && mobileNav.classList.contains('open') && 
            !mobileNav.contains(event.target) && 
            !mobileMenuToggle.contains(event.target)) {
            mobileNav.classList.remove('open');
            mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        }
    });
    
    // Close mobile menu when clicking a link
    const mobileLinks = document.querySelectorAll('.mobile-nav-link');
    mobileLinks.forEach(link => {
        link.addEventListener('click', function() {
            mobileNav.classList.remove('open');
            mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        });
    });
    
    // Handle mobile login/signup buttons
    if (mobileLoginOpen) {
        mobileLoginOpen.addEventListener('click', function() {
            if (typeof showLoginModal === 'function') {
                showLoginModal();
            } else if (typeof openLogin === 'function') {
                openLogin();
            }
            mobileNav.classList.remove('open');
            mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        });
    }
    
    if (mobileSignupOpen) {
        mobileSignupOpen.addEventListener('click', function() {
            if (typeof showSignupModal === 'function') {
                showSignupModal();
            } else if (typeof openSignup === 'function') {
                openSignup();
            }
            mobileNav.classList.remove('open');
            mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        });
    }
    
    // Service description truncation for mobile
    const serviceDescriptions = document.querySelectorAll('.service-description');
    serviceDescriptions.forEach(desc => {
        const originalText = desc.textContent;
        const words = originalText.split(' ');
        
        if (window.innerWidth <= 768 && words.length > 30) {
            const truncatedText = words.slice(0, 30).join(' ') + '...';
            desc.textContent = truncatedText;
            
            // Add "See More" button
            const seeMoreBtn = document.createElement('button');
            seeMoreBtn.className = 'see-more-btn';
            seeMoreBtn.innerHTML = '<i class="fas fa-chevron-down"></i> See More';
            seeMoreBtn.addEventListener('click', function() {
                desc.textContent = originalText;
                seeMoreBtn.remove();
            });
            
            desc.parentElement.appendChild(seeMoreBtn);
        }
    });
    
    // Adjust hero content for mobile
    const hero = document.querySelector('.hero');
    if (hero && window.innerWidth <= 768) {
        const heroActions = hero.querySelector('.hero-actions');
        if (heroActions) {
            heroActions.style.flexDirection = 'column';
            heroActions.style.gap = '12px';
        }
    }
    
    // Handle window resize
    window.addEventListener('resize', function() {
        // Update mobile menu icon on resize
        if (window.innerWidth > 768 && mobileNav.classList.contains('open')) {
            mobileNav.classList.remove('open');
            mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        }
        
        // Re-evaluate service descriptions on resize
        serviceDescriptions.forEach(desc => {
            const seeMoreBtn = desc.parentElement.querySelector('.see-more-btn');
            if (seeMoreBtn && window.innerWidth > 768) {
                // Restore full text on desktop
                const originalText = desc.dataset.originalText || desc.textContent;
                desc.textContent = originalText;
                seeMoreBtn.remove();
            }
        });
    });
    
    // Initialize service cards for mobile
    initMobileServiceCards();
});

function initMobileServiceCards() {
    const serviceCards = document.querySelectorAll('.service-card');
    
    serviceCards.forEach(card => {
        // Make entire card slightly tappable on mobile
        if (window.innerWidth <= 768) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function(e) {
                // Don't trigger if clicking buttons or links
                if (!e.target.closest('button') && !e.target.closest('a')) {
                    const chatBtn = card.querySelector('.chat-btn');
                    if (chatBtn) {
                        chatBtn.click();
                    }
                }
            });
        }
        
        // Adjust tag display on mobile
        const tags = card.querySelectorAll('.tag');
        if (window.innerWidth <= 480 && tags.length > 3) {
            for (let i = 3; i < tags.length; i++) {
                tags[i].style.display = 'none';
            }
            
            // Add "..." indicator
            if (tags.length > 3) {
                const moreTag = document.createElement('span');
                moreTag.className = 'tag';
                moreTag.textContent = `+${tags.length - 3} more`;
                moreTag.style.cursor = 'pointer';
                moreTag.addEventListener('click', function(e) {
                    e.stopPropagation();
                    for (let i = 3; i < tags.length; i++) {
                        tags[i].style.display = 'inline-flex';
                    }
                    moreTag.remove();
                });
                
                const tagContainer = card.querySelector('.service-tags');
                if (tagContainer) {
                    tagContainer.appendChild(moreTag);
                }
            }
        }
    });
}

// Helper function to check if on mobile
function isMobile() {
    return window.innerWidth <= 768;
}

// Helper function to check if on tablet
function isTablet() {
    return window.innerWidth > 768 && window.innerWidth <= 1024;
}

// Export functions if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initMobileServiceCards, isMobile, isTablet };
}