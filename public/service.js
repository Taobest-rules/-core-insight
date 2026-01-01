// ========== APPLICATION STATE ==========
let currentUser = null;
let userRole = null;
let services = [];
let categories = [];
let freelancerProfile = null;
let currentSkills = [];
let userSubscription = null;
let activeConversationId = null;
let activeConversationUserId = null;

// ========== UTILITY FUNCTIONS ==========
const $ = (id) => document.getElementById(id);

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

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info') {
  // Remove existing toasts
  document.querySelectorAll('.custom-toast').forEach(toast => toast.remove());
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `custom-toast toast-${type}`;
  
  const icon = type === 'success' ? 'fa-check-circle' : 
              type === 'warning' ? 'fa-exclamation-triangle' : 
              type === 'error' ? 'fa-times-circle' : 'fa-info-circle';
  
  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// ========== PROFILE INITIALIZATION ==========
// Move this to the top of your initialization section
function initProfileSection() {
  console.log("🔧 Initializing profile section...");
  
  // Check if profile elements exist
  const profileSection = document.getElementById('freelancerProfile');
  if (!profileSection) {
    console.log("⚠️ Profile section not found in DOM");
    return;
  }
  
  // Initialize profile event listeners
  initProfileEventListeners();
  
  // Initialize certificate upload
  initCertificateUpload();
  
  console.log("✅ Profile section initialized");
}

// Updated initProfileEventListeners function
function initProfileEventListeners() {
  console.log("🎯 Setting up profile event listeners...");
  
  // Profile picture upload
  const updatePhotoBtn = $('updatePhotoBtn');
  const profilePictureInput = $('profilePictureInput');
  
  if (updatePhotoBtn && profilePictureInput) {
    console.log("📸 Found profile picture upload elements");
    updatePhotoBtn.addEventListener('click', () => {
      console.log("📸 Update photo clicked");
      profilePictureInput.click();
    });
    
    profilePictureInput.addEventListener('change', handleProfilePictureUpload);
  } else {
    console.log("⚠️ Profile picture elements not found");
  }
  
  // Navigation tabs
  const profileViewBtn = $('profileViewTabBtn');
  const profileEditBtn = $('profileEditTabBtn');
  const dashboardBtn = $('dashboardTabBtn');
  const myServicesBtn = $('myServicesTabBtn');
  
  if (profileViewBtn) {
    profileViewBtn.addEventListener('click', () => switchProfileTab('profileViewTabContent'));
  }
  if (profileEditBtn) {
    profileEditBtn.addEventListener('click', () => switchProfileTab('profileEditTabContent'));
  }
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => switchProfileTab('dashboardTabContent'));
  }
  if (myServicesBtn) {
    myServicesBtn.addEventListener('click', switchToServicesTab);
  }
  
  // Action buttons
  const editProfileBtn = $('editProfileBtn');
  const dashboardActionBtn = $('dashboardBtn');
  const shareProfileBtn = $('shareProfileBtn');
  const exportProfileBtn = $('exportProfileBtn');
  
  if (editProfileBtn) editProfileBtn.addEventListener('click', () => switchProfileTab('profileEditTabContent'));
  if (dashboardActionBtn) dashboardActionBtn.addEventListener('click', () => switchProfileTab('dashboardTabContent'));
  if (shareProfileBtn) shareProfileBtn.addEventListener('click', shareProfile);
  if (exportProfileBtn) exportProfileBtn.addEventListener('click', exportProfile);
  
  // Edit form - Skills
  const addSkillBtn = $('addSkillBtn');
  const newSkillInput = $('newSkill');
  
  if (addSkillBtn) {
    addSkillBtn.addEventListener('click', addNewSkill);
  }
  
  if (newSkillInput) {
    newSkillInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addNewSkill();
      }
    });
  }
  
  // Common skill buttons
  document.querySelectorAll('.common-skill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const skill = e.target.getAttribute('data-skill');
      addSkillToEdit(skill);
    });
  });
  
  // Cancel edit button
  const cancelEditBtn = $('cancelEditBtn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      switchProfileTab('profileViewTabContent');
    });
  }
  
  // Profile form submission - SAFELY check for form
  setTimeout(() => {
    const profileForm = $('profileForm');
    if (profileForm) {
      console.log("✅ Found profile form, adding submit listener");
      profileForm.addEventListener('submit', handleProfileFormSubmit);
    } else {
      console.log("⚠️ Profile form not found yet, will retry");
      // Try again after a delay
      setTimeout(() => {
        const profileFormRetry = $('profileForm');
        if (profileFormRetry) {
          profileFormRetry.addEventListener('submit', handleProfileFormSubmit);
          console.log("✅ Added profile form listener on retry");
        }
      }, 1000);
    }
  }, 500);
  
  console.log("✅ Profile event listeners setup complete");
}

// Enhanced profile form submission handler with null checks
async function handleProfileFormSubmit(e) {
  e.preventDefault();
  console.log("📝 Profile form submitted");
  
  try {
    // Get form elements with null checks
    const getElementValue = (id) => {
      const element = $(id);
      return element ? element.value : '';
    };
    
    // Collect form data
    const profileUpdateData = {
      headline: getElementValue('editHeadline'),
      description: getElementValue('editDescription'),
      hourly_rate: parseFloat(getElementValue('editHourlyRate')) || 0,
      experience_level: getElementValue('editExperienceLevel'),
      availability: getElementValue('editAvailability'),
      location: getElementValue('editLocation'),
      phone: getElementValue('editPhone'),
      website: getElementValue('editWebsite'),
      education: getElementValue('editEducation'),
      certifications: getElementValue('editCertifications'),
      languages: getElementValue('editLanguages')
    };
    
    // Get skills
    const skillTags = document.querySelectorAll('#skillsList .skill-tag');
    const skills = Array.from(skillTags).map(tag => {
      const text = tag.textContent || '';
      return text.replace('×', '').trim();
    });
    
    if (skills.length > 0) {
      profileUpdateData.skills = JSON.stringify(skills);
    }
    
    console.log("📦 Sending profile update data:", profileUpdateData);
    
    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;
    
    const response = await fetch('/api/freelancer/update-profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(profileUpdateData)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}: Failed to update profile`);
    }
    
    console.log("✅ Profile updated successfully:", result);
    
    // Update local profile data
    freelancerProfile = { ...freelancerProfile, ...profileUpdateData };
    
    // Switch back to view tab
    switchProfileTab('profileViewTabContent');
    
    // Update the view immediately
    await updateProfileView();
    
    showToast('✅ Profile updated successfully!', 'success');
    
  } catch (error) {
    console.error('❌ Error updating profile:', error);
    showToast('❌ Failed to update profile: ' + error.message, 'error');
  } finally {
    // Reset button
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.innerHTML = originalText || '<i class="fas fa-save"></i> Save Profile Changes';
      submitBtn.disabled = false;
    }
  }
}

// Update profile view function
async function updateProfileView() {
  try {
    const response = await fetch('/api/freelancer/profile', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const profile = await response.json();
      freelancerProfile = profile;
      renderProfile();
    }
  } catch (error) {
    console.error('Error updating profile view:', error);
  }
}

// Updated skill management functions
function addNewSkill() {
  const newSkillInput = $('newSkill');
  if (!newSkillInput) {
    console.error("❌ newSkillInput not found");
    return;
  }
  
  const skill = newSkillInput.value.trim();
  if (!skill) {
    showToast('Please enter a skill', 'error');
    return;
  }
  
  addSkillToEdit(skill);
  newSkillInput.value = '';
  newSkillInput.focus();
}

function addSkillToEdit(skill) {
  const skillsList = $('skillsList');
  if (!skillsList) {
    console.error("❌ skillsList not found");
    return;
  }
  
  // Check if skill already exists
  const existingSkills = Array.from(skillsList.querySelectorAll('.skill-tag')).map(tag => 
    tag.textContent.replace('×', '').trim()
  );
  
  if (existingSkills.includes(skill)) {
    showToast('Skill already added', 'warning');
    return;
  }
  
  // Create skill tag
  const skillTag = document.createElement('div');
  skillTag.className = 'skill-tag';
  skillTag.innerHTML = `
    ${skill}
    <span class="remove-skill" onclick="removeSkillTag(this)">×</span>
  `;
  
  skillsList.appendChild(skillTag);
  showToast('Skill added: ' + skill, 'success');
}

function removeSkillTag(element) {
  if (element && element.parentElement) {
    element.parentElement.remove();
    showToast('Skill removed', 'info');
  }
}

// ========== PROFILE TAB SWITCHING ==========
// Add this function to handle profile tab switching
function switchProfileTab(tabContentId) {
  console.log("🔀 Switching to profile tab:", tabContentId);
  
  // Hide all tab contents
  document.querySelectorAll('.profile-tab-content').forEach(tab => {
    if (tab) tab.classList.add('hidden');
  });
  
  // Show selected tab content
  const selectedTab = $(tabContentId);
  if (selectedTab) {
    selectedTab.classList.remove('hidden');
  }
  
  // Update active tab button
  document.querySelectorAll('.nav-tab.enhanced').forEach(tab => {
    if (tab) tab.classList.remove('active');
  });
  
  const activeTabBtn = $(tabContentId.replace('Content', 'Btn'));
  if (activeTabBtn) {
    activeTabBtn.classList.add('active');
  }
  
  // Load tab-specific data
  if (tabContentId === 'profileEditTabContent') {
    loadEditForm();
  } else if (tabContentId === 'dashboardTabContent') {
    loadDashboardData();
  }
}

// ========== CERTIFICATE UPLOAD FUNCTIONS ==========
function initCertificateUpload() {
  const uploadArea = $('certificateUploadArea');
  const fileInput = $('certificateImagesInput');
  const browseBtn = $('browseCertificatesBtn');
  
  if (!uploadArea || !fileInput || !browseBtn) {
    console.log("⚠️ Certificate upload elements not found");
    return;
  }
  
  console.log("✅ Initializing certificate upload...");
  
  // Click on upload area or browse button
  uploadArea.addEventListener('click', () => fileInput.click());
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  
  // File input change
  fileInput.addEventListener('change', handleCertificateFiles);
  
  // Drag and drop events
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleCertificateFiles();
    }
  });
  
  // Load existing certificates
  loadExistingCertificates();
}

async function loadExistingCertificates() {
  try {
    const response = await fetch('/api/freelancer/profile', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const profile = await response.json();
      if (profile.certificate_images) {
        displayCertificates(profile.certificate_images);
      }
    }
  } catch (error) {
    console.error('Error loading certificates:', error);
  }
}

function handleCertificateFiles() {
  const fileInput = $('certificateImagesInput');
  if (!fileInput) return;
  
  const files = Array.from(fileInput.files);
  
  if (files.length === 0) return;
  
  // Validate files
  const validFiles = files.filter(file => {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    
    if (!validTypes.includes(file.type)) {
      showToast(`Invalid file type: ${file.name}. Only JPG, PNG, GIF allowed.`, 'error');
      return false;
    }
    
    if (file.size > maxSize) {
      showToast(`File too large: ${file.name}. Max 5MB.`, 'error');
      return false;
    }
    
    return true;
  });
  
  if (validFiles.length === 0) return;
  
  // Limit to 5 files total
  const currentCertificates = getCurrentCertificateCount();
  if (currentCertificates + validFiles.length > 5) {
    showToast('Maximum 5 certificates allowed. Please remove some existing certificates.', 'error');
    return;
  }
  
  // Upload files
  uploadCertificates(validFiles);
}

async function uploadCertificates(files) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('certificate_images', file);
  });
  
  // Show progress
  const progressDiv = $('certificateProgress');
  const progressBar = $('certificateProgressBar');
  const progressText = $('certificateProgressText');
  
  if (progressDiv && progressBar && progressText) {
    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = 'Starting upload...';
  }
  
  try {
    const response = await fetch('/api/freelancer/certificate-images', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // Simulate progress for better UX
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        if (progressBar) {
          progressBar.style.width = `${progress}%`;
        }
        if (progressText) {
          progressText.textContent = `Uploading... ${progress}%`;
        }
        
        if (progress >= 100) {
          clearInterval(interval);
          if (progressText) {
            progressText.textContent = 'Upload complete!';
          }
          
          // Update certificate display
          if (result.certificate_images) {
            displayCertificates(result.certificate_images);
          }
          
          // Hide progress after delay
          setTimeout(() => {
            if (progressDiv) {
              progressDiv.style.display = 'none';
            }
          }, 2000);
          
          showToast('Certificates uploaded successfully!', 'success');
        }
      }, 100);
    } else {
      throw new Error(result.error || 'Upload failed');
    }
  } catch (error) {
    if (progressDiv) {
      progressDiv.style.display = 'none';
    }
    showToast('Error uploading certificates: ' + error.message, 'error');
    console.error('Upload error:', error);
  }
}

function displayCertificates(certificatePaths) {
  const previewDiv = $('certificatePreview');
  const viewCertificatesDiv = $('profileCertificates');
  
  if (!previewDiv || !viewCertificatesDiv) return;
  
  // Clear existing previews
  previewDiv.innerHTML = '';
  viewCertificatesDiv.innerHTML = '';
  
  if (!certificatePaths || certificatePaths.length === 0) {
    previewDiv.style.display = 'none';
    viewCertificatesDiv.innerHTML = '<p style="color: var(--text-gray);">No certificates uploaded yet.</p>';
    return;
  }
  
  previewDiv.style.display = 'block';
  
  certificatePaths.forEach((path, index) => {
    // Create preview for edit mode
    const previewItem = document.createElement('div');
    previewItem.className = 'certificate-item';
    previewItem.innerHTML = `
      <img src="${path}" alt="Certificate ${index + 1}" class="certificate-image">
      <button type="button" class="remove-certificate" data-index="${index}" data-path="${path}">
        <i class="fas fa-times"></i>
      </button>
    `;
    previewDiv.appendChild(previewItem);
    
    // Create view for profile mode
    const viewItem = document.createElement('div');
    viewItem.className = 'certificate-item';
    viewItem.innerHTML = `
      <img src="${path}" alt="Certificate ${index + 1}" class="certificate-image">
    `;
    viewCertificatesDiv.appendChild(viewItem);
  });
  
  // Add remove event listeners
  previewDiv.querySelectorAll('.remove-certificate').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      const path = this.getAttribute('data-path');
      removeCertificate(index, path);
    });
  });
}

function getCurrentCertificateCount() {
  const previewDiv = $('certificatePreview');
  if (!previewDiv || previewDiv.style.display === 'none') return 0;
  return previewDiv.children.length;
}

async function removeCertificate(index, path) {
  if (!confirm('Are you sure you want to remove this certificate?')) return;
  
  try {
    const response = await fetch('/api/freelancer/remove-certificate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ index, path }),
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showToast('Certificate removed successfully', 'success');
      loadExistingCertificates(); // Reload certificates
    } else {
      throw new Error(result.error || 'Failed to remove certificate');
    }
  } catch (error) {
    showToast('Error removing certificate: ' + error.message, 'error');
    console.error('Remove error:', error);
  }
}

// ========== FREELANCER DELETE WORK (UPDATED) ==========
// Update the freelancer delete function to work with the new modal structure
async function deleteServiceAsFreelancer(serviceId) {
  const deleteReasonInput = $('freelancerDeleteReason');
  if (!deleteReasonInput) {
    showToast('Delete reason input not found', 'error');
    return;
  }
  
  const deleteReason = deleteReasonInput.value.trim();
  
  if (!deleteReason || deleteReason.length < 5) {
    showToast('Please provide a reason for deletion (at least 5 characters).', 'error');
    return;
  }
  
  try {
    console.log("🧪 Attempting to delete service...");
    
    const confirmBtn = $('confirmFreelancerDeleteBtn');
    if (!confirmBtn) {
      showToast('Confirm button not found', 'error');
      return;
    }
    
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    confirmBtn.disabled = true;
    
    // Try the delete
    const response = await fetch(`/api/services/${serviceId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        reason: deleteReason
      })
    });
    
    console.log("Response status:", response.status);
    
    // Get response text first
    const responseText = await response.text();
    console.log("Raw response:", responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse JSON:", parseError);
      throw new Error(`Server returned: ${responseText.substring(0, 100)}`);
    }
    
    console.log("Parsed data:", data);
    
    if (!response.ok) {
      if (data.limit_exceeded) {
        showToast(`❌ ${data.error}`, 'error');
        closeFreelancerDeleteModal();
        // Show contact support option
        setTimeout(() => {
          if (confirm("Would you like to contact support about deleting more services?")) {
            window.location.href = "/contact";
          }
        }, 1500);
        return;
      }
      throw new Error(data.error || `Error: ${response.status}`);
    }
    
    showToast(`✅ ${data.message}`, 'success');
    closeFreelancerDeleteModal();
    
    // Refresh after delay
    setTimeout(() => {
      loadServices();
      if (userRole === 'freelancer') {
        loadMyServices();
      }
    }, 1000);
    
  } catch (error) {
    console.error("Delete failed:", error);
    
    // Better error messages
    let userMessage = error.message;
    if (error.message.includes('Cannot read properties of undefined')) {
      userMessage = 'Server configuration error. Please contact support.';
    } else if (error.message.includes('Failed to fetch')) {
      userMessage = 'Network error. Check your connection.';
    }
    
    showToast(`❌ ${userMessage}`, 'error');
    
    // Reset button
    const confirmBtn = $('confirmFreelancerDeleteBtn');
    if (confirmBtn) {
      confirmBtn.innerHTML = originalText || '<i class="fas fa-trash"></i> Delete Service';
      confirmBtn.disabled = false;
    }
  }
}

// Add close modal function for freelancer delete
function closeFreelancerDeleteModal() {
  const modal = $('freelancerDeleteModal');
  if (modal) modal.remove();
}

// ========== ENHANCED CATEGORY SELECTION ==========
// Update your existing setupEnhancedCategorySelection function to include this:
function setupEnhancedCategorySelection() {
  console.log("🎯 Setting up enhanced category selection...");
  
  // Tab Switching
  const tabBtns = document.querySelectorAll('.category-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      
      // Update active tab button
      tabBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // Show corresponding tab pane
      tabPanes.forEach(pane => pane.classList.remove('active'));
      $(`${tabId}-category-tab`).classList.add('active');
      
      // Show/hide selected category display
      const display = document.querySelector('.selected-category-display');
      if (display) {
        display.classList.add('hidden');
      }
    });
  });
  
  // Category Chip Selection (existing categories)
  const categoryChips = document.querySelectorAll('.category-chip');
  categoryChips.forEach(chip => {
    chip.addEventListener('click', function() {
      const value = this.getAttribute('data-value');
      const select = $('serviceCategory');
      if (select) {
        select.value = value;
        updateSelectedCategory(value, this.textContent.trim());
        
        // Switch to existing tab if on new tab
        const newTabBtn = document.querySelector('.category-tab-btn[data-tab="existing"]');
        if (newTabBtn) {
          newTabBtn.click();
        }
      }
    });
  });
  
  // Suggestion Chip Selection (new categories)
  const suggestionChips = document.querySelectorAll('.suggestion-chip');
  suggestionChips.forEach(chip => {
    chip.addEventListener('click', function() {
      const text = this.getAttribute('data-text');
      const input = $('newCategory');
      if (input) {
        input.value = text;
        updateSelectedCategory(text, text);
        
        // Update character count
        updateCharCount();
        
        // Switch to new tab if on existing tab
        const newTabBtn = document.querySelector('.category-tab-btn[data-tab="new"]');
        if (newTabBtn) {
          newTabBtn.click();
        }
      }
    });
  });
  
  // Character counter for new category input
  const newCategoryInput = $('newCategory');
  if (newCategoryInput) {
    newCategoryInput.addEventListener('input', updateCharCount);
    newCategoryInput.addEventListener('focus', function() {
      // Switch to new tab when focusing on input
      const newTabBtn = document.querySelector('.category-tab-btn[data-tab="new"]');
      if (newTabBtn && !newTabBtn.classList.contains('active')) {
        newTabBtn.click();
      }
    });
  }
  
  // Select change handler
  const categorySelect = $('serviceCategory');
  if (categorySelect) {
    categorySelect.addEventListener('change', function() {
      if (this.value) {
        const selectedText = this.options[this.selectedIndex].text;
        updateSelectedCategory(this.value, selectedText);
      }
    });
    
    // Auto-focus on select when tab is active
    categorySelect.addEventListener('focus', function() {
      // Switch to existing tab when focusing on select
      const existingTabBtn = document.querySelector('.category-tab-btn[data-tab="existing"]');
      if (existingTabBtn && !existingTabBtn.classList.contains('active')) {
        existingTabBtn.click();
      }
    });
  }
  
  // Clear category button
  const clearBtn = document.querySelector('.clear-category');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      // Clear both inputs
      if (categorySelect) categorySelect.value = '';
      if (newCategoryInput) newCategoryInput.value = '';
      
      // Hide selected category display
      const display = document.querySelector('.selected-category-display');
      if (display) {
        display.classList.add('hidden');
      }
      
      // Reset to existing tab
      const existingTabBtn = document.querySelector('.category-tab-btn[data-tab="existing"]');
      if (existingTabBtn) {
        existingTabBtn.click();
      }
    });
  }
  
  // Add new category input handling
  if (newCategoryInput) {
    newCategoryInput.addEventListener('input', function() {
      updateCharCount(this);
    });
    
    newCategoryInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.value.trim()) {
          selectNewCategory(this.value.trim());
        }
      }
    });
  }
  
  console.log("✅ Enhanced category selection setup complete");
}

function selectNewCategory(categoryName) {
  if (!categoryName.trim()) {
    showToast('Please enter a category name', 'error');
    return;
  }

  if (categoryName.length > 50) {
    showToast('Category name too long (max 50 characters)', 'error');
    return;
  }

  const selectedDisplay = document.querySelector('.selected-category-display');
  const selectedText = $('selectedCategoryText');
  
  if (selectedDisplay && selectedText) {
    selectedText.textContent = categoryName;
    selectedDisplay.classList.remove('hidden');
    
    // Set value for new category
    const newCategoryInput = $('newCategory');
    if (newCategoryInput) {
      newCategoryInput.value = categoryName;
    }
    
    // Clear existing category select
    const categorySelect = $('serviceCategory');
    if (categorySelect) {
      categorySelect.value = '';
    }
    
    showToast('New category set: ' + categoryName, 'success');
  }
}

function updateCharCount(input) {
  if (!input) return;
  
  const charCount = input.nextElementSibling;
  if (charCount && charCount.classList.contains('char-count')) {
    charCount.textContent = `${input.value.length}/50`;
  }
}

// ========== MODAL MANAGEMENT ==========
function openModal(modal) { 
  if (!modal) return;
  modal.classList.add('open'); 
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false'); 
}

function closeModal(modal) { 
  if (!modal) return;
  modal.classList.remove('open'); 
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true'); 
}

function initModals() {
  // Login modal
  if ($('loginOpen')) {
    $('loginOpen').addEventListener('click', () => openModal($('loginModal')));
  }
  
  if ($('signupOpen')) {
    $('signupOpen').addEventListener('click', () => openModal($('signupModal')));
  }
  
  // Close buttons
  if ($('closeLogin')) {
    $('closeLogin').addEventListener('click', () => closeModal($('loginModal')));
  }
  
  if ($('closeSignup')) {
    $('closeSignup').addEventListener('click', () => closeModal($('signupModal')));
  }
  
  // Modal background close
  window.addEventListener('click', (e) => {
    if (e.target === $('loginModal')) closeModal($('loginModal'));
    if (e.target === $('signupModal')) closeModal($('signupModal'));
    if (e.target === $('roleModal')) closeModal($('roleModal'));
    if (e.target === $('freelancerProfileModal')) closeModal($('freelancerProfileModal'));
  });
  
  // Toggle login method
  if ($('loginByUsername')) {
    $('loginByUsername').addEventListener('click', () => {
      $('loginByUsername').style.color = 'var(--accent-gold)';
      $('loginByEmail').style.color = 'var(--text-gray)';
      $('usernameGroup').style.display = 'block';
      $('emailGroup').style.display = 'none';
    });
  }
  
  if ($('loginByEmail')) {
    $('loginByEmail').addEventListener('click', () => {
      $('loginByEmail').style.color = 'var(--accent-gold)';
      $('loginByUsername').style.color = 'var(--text-gray)';
      $('usernameGroup').style.display = 'none';
      $('emailGroup').style.display = 'block';
    });
  }
  
  // Password visibility toggle
  if ($('toggleLoginPwd')) {
    $('toggleLoginPwd').addEventListener('click', () => {
      const field = $('loginPassword');
      if (field) field.type = field.type === 'password' ? 'text' : 'password';
    });
  }
  
  if ($('toggleSignupPwd')) {
    $('toggleSignupPwd').addEventListener('click', () => {
      const field = $('signupPassword');
      if (field) field.type = field.type === 'password' ? 'text' : 'password';
    });
  }
  
  // Switch between login/signup
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
}

// ========== CHAT AND PROFILE FUNCTIONS ==========

async function openChat(serviceId, freelancerId) {
  try {
    console.log("📨 Starting chat:", { serviceId, freelancerId });

    // Check if user is logged in
    if (!currentUser) {
      alert("Please log in to start a chat.");
      openModal($('loginModal'));
      return;
    }

    // If freelancerId is not provided, try to get it from service data
    if (!freelancerId) {
      // You need to implement this based on your data structure
      // Example: freelancerId = getFreelancerIdFromService(serviceId);
      console.warn("Freelancer ID not provided, attempting to get from service data");
      // If you can't get it, show an error
      if (!freelancerId) {
        alert("Unable to determine freelancer for this service");
        return;
      }
    }

    const res = await fetch("/api/messages/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        serviceId,
        clientId: currentUser.id,
        freelancerId
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to start chat");
      return;
    }

    // Check for conversation ID
    if (!data.conversationId) {
      alert("Failed to start chat: No conversation ID returned");
      return;
    }

    // Use the appropriate function based on what's available
    if (typeof openConversation === 'function') {
      openConversation(data.conversationId);
    } else if (typeof loadMessages === 'function') {
      loadMessages(data.conversationId);
    } else {
      console.error("No chat display function available");
      alert("Chat started but cannot display messages");
    }

    return data.conversationId;

  } catch (err) {
    console.error("❌ Chat start error:", err);
    alert("Chat failed to start");
  }
}

async function openFreelancerProfile(userId) {
  try {
    const res = await fetch(`/api/users/${userId}/profile`);
    const data = await res.json();

    if (!res.ok) {
      alert("Failed to load freelancer profile");
      return;
    }

    const container = $("freelancerProfileContent");

    container.innerHTML = `
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="width: 100px; height: 100px; border-radius: 50%; overflow: hidden; margin: 0 auto 20px; border: 3px solid var(--accent-gold);">
          ${data.profile_picture ? 
            `<img src="${data.profile_picture}" alt="${data.username}" style="width: 100%; height: 100%; object-fit: cover;">` : 
            `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark)); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; color: #000;">${data.username?.charAt(0)?.toUpperCase() || 'U'}</div>`
          }
        </div>
        <h2 style="color: var(--accent-gold); margin-bottom: 10px;">${escapeHtml(data.username || 'User')}</h2>
        <p style="color: var(--text-light); font-size: 1.1rem; margin-bottom: 5px;">${escapeHtml(data.headline || 'Freelancer')}</p>
        <p style="color: var(--text-gray); margin-bottom: 20px;">
          <i class="fas fa-star" style="color: var(--accent-gold);"></i> ${data.avg_rating?.toFixed(1) || '0.0'} (${data.review_count || 0} reviews)
        </p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
        <div style="background: var(--secondary-dark); padding: 15px; border-radius: 8px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 10px;">
            <i class="fas fa-dollar-sign"></i> Hourly Rate
          </h4>
          <p style="color: var(--text-light); font-size: 1.2rem; font-weight: bold;">$${data.hourly_rate || '0'}/hr</p>
        </div>
        
        <div style="background: var(--secondary-dark); padding: 15px; border-radius: 8px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 10px;">
            <i class="fas fa-briefcase"></i> Services
          </h4>
          <p style="color: var(--text-light); font-size: 1.2rem; font-weight: bold;">${data.service_count || 0}</p>
        </div>
      </div>

      <div style="margin-bottom: 25px;">
        <h4 style="color: var(--accent-gold); margin-bottom: 15px; display: flex; align-items: center;">
          <i class="fas fa-user-circle" style="margin-right: 10px;"></i> About Me
        </h4>
        <p style="color: var(--text-light); line-height: 1.6; background: var(--secondary-dark); padding: 15px; border-radius: 8px; border-left: 3px solid var(--accent-gold);">
          ${escapeHtml(data.description || 'No description provided.')}
        </p>
      </div>

      ${data.skills && data.skills.length > 0 ? `
        <div style="margin-bottom: 25px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 15px; display: flex; align-items: center;">
            <i class="fas fa-tools" style="margin-right: 10px;"></i> Skills
          </h4>
          <div style="display: flex; flex-wrap: wrap; gap: 10px;">
            ${data.skills.map(skill => `
              <span style="background: rgba(255,215,0,0.1); color: var(--accent-gold); padding: 8px 15px; border-radius: 20px; font-size: 0.9rem; border: 1px solid rgba(255,215,0,0.3);">
                ${escapeHtml(skill)}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${data.education ? `
        <div style="margin-bottom: 25px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 15px; display: flex; align-items: center;">
            <i class="fas fa-graduation-cap" style="margin-right: 10px;"></i> Education
          </h4>
          <p style="color: var(--text-light); line-height: 1.6; background: var(--secondary-dark); padding: 15px; border-radius: 8px;">
            ${escapeHtml(data.education)}
          </p>
        </div>
      ` : ''}

      ${data.location || data.phone || data.website ? `
        <div style="margin-bottom: 25px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 15px; display: flex; align-items: center;">
            <i class="fas fa-info-circle" style="margin-right: 10px;"></i> Contact Details
          </h4>
          <div style="background: var(--secondary-dark); padding: 15px; border-radius: 8px;">
            ${data.location ? `<p style="color: var(--text-light); margin-bottom: 8px;"><i class="fas fa-map-marker-alt" style="color: var(--accent-gold); margin-right: 10px; width: 20px;"></i> ${escapeHtml(data.location)}</p>` : ''}
            ${data.phone ? `<p style="color: var(--text-light); margin-bottom: 8px;"><i class="fas fa-phone" style="color: var(--accent-gold); margin-right: 10px; width: 20px;"></i> ${escapeHtml(data.phone)}</p>` : ''}
            ${data.website ? `<p style="color: var(--text-light); margin-bottom: 8px;"><i class="fas fa-globe" style="color: var(--accent-gold); margin-right: 10px; width: 20px;"></i> <a href="${data.website}" target="_blank" style="color: var(--accent-gold); text-decoration: none;">${data.website.replace(/^https?:\/\//, '')}</a></p>` : ''}
          </div>
        </div>
      ` : ''}

      <div style="margin-top: 30px; text-align: center;">
        <button onclick="startConversationWithFreelancer(${userId}, '${escapeHtml(data.username || 'User')}')" class="btn btn-primary" style="padding: 12px 30px; font-size: 1.1rem;">
          <i class="fas fa-comments"></i> Message ${escapeHtml(data.username || 'User')}        </button>
      </div>
    `;

    openModal($('freelancerProfileModal'));

  } catch (err) {
    console.error("Profile load error:", err);
    alert("Failed to load profile. Please try again.");
  }
}

/// Updated startConversation function
// Updated startConversation function
async function startConversationWithService(serviceId, freelancerId) {
  try {
    console.log("💬 Starting conversation from service:", { serviceId, freelancerId });

    if (!currentUser) {
      showToast("Please login to start a conversation", "warning");
      openModal($('loginModal'));
      return;
    }

    // Check if trying to message yourself
    if (parseInt(currentUser.id) === parseInt(freelancerId)) {
      showToast("You cannot message yourself", "warning");
      return;
    }

    console.log("📡 Sending request to start conversation...");

    // ✅ ADD TIMESTAMP HERE
    const timestamp = Date.now();
    
    // Start the conversation WITH timestamp to ensure uniqueness
    const res = await fetch("/api/messages/start", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        serviceId: serviceId,
        freelancerId: freelancerId,
        timestamp: timestamp  // ✅ ADD THIS LINE
      })
    });

    const data = await res.json();
    console.log("📡 Server response:", data);
    console.log("⏰ Timestamp sent:", timestamp); // ✅ ADD THIS FOR DEBUGGING

    if (!res.ok) {
      showToast(data.error || "Failed to start conversation", "error");
      return;
    }

    if (!data.conversationId) {
      showToast("Failed to get conversation ID from server", "error");
      return;
    }

    // Store conversation ID globally
    window.activeConversationId = data.conversationId;
    window.activeConversationUserId = freelancerId;
    
    console.log("✅ Conversation started:", {
      conversationId: window.activeConversationId,
      userId: window.activeConversationUserId,
      message: data.message,
      timestamp: timestamp // ✅ ADD THIS
    });

    // Show success message
    showToast(data.message || "✅ Conversation started!", "success");

    // Show inbox
    showInboxAndOpenConversation(data.conversationId, freelancerId);

  } catch (err) {
    console.error("❌ Conversation start error:", err);
    showToast("Failed to start conversation. Please try again.", "error");
  }
}

//force conversations
async function forceNewConversation(serviceId, freelancerId) {
  console.log("🔄 Forcing new conversation...");
  
  // Add a random parameter to ensure new conversation
  const random = Math.random().toString(36).substring(7);
  
  const res = await fetch("/api/messages/start", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      serviceId: serviceId,
      freelancerId: freelancerId,
      forceNew: true,
      unique: random
    })
  });

  return await res.json();
}

// New helper function to show inbox and open conversation
function showInboxAndOpenConversation(conversationId, freelancerId) {
  console.log("📬 Showing inbox for conversation:", conversationId);
  
  // Hide other pages
  hideAllPages();
  
  // Show inbox page
  const inboxPage = $('inboxPage');
  if (inboxPage) {
    inboxPage.classList.remove('hidden');
  }
  
  // Set active conversation
  window.activeConversationId = conversationId;
  window.activeConversationUserId = freelancerId;
  
  // Setup message form for this conversation
  setupMessageForm();
  
  // Clear chat area and show loading
  const chatMessages = $('chatMessages');
  if (chatMessages) {
    chatMessages.innerHTML = `
      <div class="chat-header" style="margin-bottom: 15px;">
        <h4 style="color: var(--accent-gold); margin: 0;">Starting chat...</h4>
      </div>
      <div id="messagesContainer" style="overflow-y: auto; max-height: 350px; padding-right: 10px;">
        <div style="text-align: center; padding: 20px; color: var(--text-gray);">
          <i class="fas fa-spinner fa-spin"></i> Loading conversation...
        </div>
      </div>
    `;
  }
  
  // Try to load the conversation
  setTimeout(async () => {
    try {
      // First load conversations list
      await loadConversations();
      
      // Then try to open this specific conversation
      setTimeout(() => {
        const conversationItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (conversationItem) {
          // Highlight it
          document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
          });
          conversationItem.classList.add('active');
          
          // Get username and open
          const username = conversationItem.querySelector('.conversation-user')?.textContent || 'User';
          openConversation(conversationId, username);
        } else {
          // If not in the list, try to open it directly
          openConversation(conversationId, 'Freelancer');
        }
      }, 500);
      
    } catch (error) {
      console.error("Failed to load conversation:", error);
      showToast("Could not load conversation. Please try again.", "error");
    }
  }, 100);
}

// Updated openConversation function
async function openConversation(conversationId, username = 'User') {
  try {
    console.log("💬 Opening conversation ID:", conversationId, "for user:", username);
    
    // Validate conversation ID
    if (!conversationId || isNaN(conversationId)) {
      console.error("❌ Invalid conversation ID:", conversationId);
      showToast('Invalid conversation ID', 'error');
      return;
    }
    
    // Store the active conversation ID globally
    window.activeConversationId = parseInt(conversationId);
    
    // Get the other user ID
    const otherUserId = await getOtherUserIdFromConversation(conversationId);
    window.activeConversationUserId = otherUserId;
    
    console.log("💬 Active conversation set:", {
      id: window.activeConversationId,
      userId: window.activeConversationUserId
    });
    
    // Update UI to show we're in a conversation
    const chatMessages = $('chatMessages');
    if (!chatMessages) {
      console.error("❌ Chat messages container not found!");
      return;
    }
    
    // Update chat header
    chatMessages.innerHTML = `
      <div class="chat-header" style="margin-bottom: 15px;">
        <h4 style="color: var(--accent-gold); margin: 0;">Chat with ${escapeHtml(username)}</h4>
        <p style="color: var(--text-gray); font-size: 0.9rem; margin: 5px 0 15px 0;">
          Conversation ID: ${conversationId}
        </p>
      </div>
      <div id="messagesContainer" style="overflow-y: auto; max-height: 350px; padding-right: 10px;"></div>
    `;
    
    // Setup the message form for this conversation
    setupMessageForm();
    
    // Load messages
    await loadMessagesForConversation(conversationId);
    
    console.log("✅ Conversation opened successfully");
    
  } catch (error) {
    console.error("❌ Error opening conversation:", error);
    showToast('Failed to open conversation', 'error');
  }
}

// Helper function to get the other user's ID from conversation
async function getOtherUserIdFromConversation(conversationId) {
  try {
    if (!currentUser || !conversationId) return null;
    
    const response = await fetch(`/api/conversation-info/${conversationId}`, {
      credentials: "include"
    });
    
    if (!response.ok) {
      console.error("Failed to get conversation info:", response.status);
      return null;
    }
    
    const data = await response.json();
    return data.other_user_id;
    
  } catch (error) {
    console.error("Error getting conversation info:", error);
    return null;
  }
}

// Updated loadMessages function
async function loadMessagesForConversation(conversationId) {
  if (!conversationId) return;
  
  try {
    const response = await fetch(`/api/messages/${conversationId}`);
    if (!response.ok) {
      throw new Error("Failed to load messages");
    }
    
    const messages = await response.json();
    const container = $('messagesContainer') || $('chatMessages');
    
    if (!container) return;
    
    if (!messages || messages.length === 0) {
      container.innerHTML += `
        <div class="empty-messages" style="text-align: center; padding: 20px;">
          <p style="color: var(--text-gray);">
            No messages yet. Start the conversation!
          </p>
        </div>
      `;
      return;
    }
    
    // Clear existing messages
    const messagesContainer = $('messagesContainer');
    if (messagesContainer) {
      messagesContainer.innerHTML = '';
    }
    
    messages.forEach(message => {
      const messageDiv = document.createElement('div');
      const isCurrentUser = message.sender_id === currentUser?.id;
      
      messageDiv.className = `message ${isCurrentUser ? 'sent' : 'received'}`;
      messageDiv.innerHTML = `
        <div class="message-sender">${escapeHtml(message.sender_name || 'Unknown')}</div>
        <div class="message-text">${escapeHtml(message.message)}</div>
        <div class="message-time">${new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      `;
      
      if (messagesContainer) {
        messagesContainer.appendChild(messageDiv);
      }
    });
    
    // Scroll to bottom
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Mark messages as read
    if (conversationId) {
      await fetch("/api/messages/mark-read", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "credentials": "include"
        },
        body: JSON.stringify({ conversation_id: conversationId })
      });
    }
    
  } catch (error) {
    console.error("Error loading messages:", error);
  }
}

async function checkUnreadMessages() {
  if (!currentUser) return;

  try {
    const res = await fetch("/api/messages/unread-count", {
      credentials: "include"
    });
    
    // Don't throw on error, just log it
    if (!res.ok) {
      console.log("⚠️ Could not check unread messages, status:", res.status);
      return;
    }
    
    const data = await res.json();
    const badge = $("unreadBadge");
    
    if (!badge) return;

    if (data.count > 0) {
      badge.textContent = data.count;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch (err) {
    console.error("Unread check failed:", err);
    // Don't show error to user
  }
}

async function testMessageSending() {
  console.log("🧪 Testing message sending...");
  
  // Check current state
  console.log("📊 Current state:", {
    activeConversationId: window.activeConversationId,
    activeConversationUserId: window.activeConversationUserId,
    currentUser: currentUser
  });
  
  // Test API directly
  if (window.activeConversationId && window.activeConversationUserId) {
    console.log("📤 Testing API call...");
    
    try {
      const testRes = await fetch("/api/messages/send", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          receiver_id: window.activeConversationUserId,
          message: "Test message at " + new Date().toLocaleTimeString(),
          conversation_id: window.activeConversationId
        })
      });
      
      const testData = await testRes.json();
      console.log("📡 API Response:", testData);
      
      if (testRes.ok) {
        alert("✅ Test message sent! Check console for details.");
      } else {
        alert("❌ Test failed: " + (testData.error || "Unknown error"));
      }
    } catch (error) {
      console.error("❌ Test error:", error);
      alert("❌ Test error: " + error.message);
    }
  } else {
    alert("⚠️ Please open a conversation first");
  }
}

async function debugConversationAccess(conversationId = window.activeConversationId) {
  console.log("🔍 DEBUG CONVERSATION ACCESS");
  console.log("Current User:", currentUser);
  console.log("Active Conversation ID:", conversationId);
  
  if (!currentUser) {
    console.error("❌ No user logged in");
    return;
  }
  
  if (!conversationId) {
    console.error("❌ No active conversation");
    return;
  }
  
  // Test if we can access the conversation
  try {
    const response = await fetch(`/api/messages/${conversationId}`, {
      credentials: "include"
    });
    
    console.log("Conversation access test:");
    console.log("- Status:", response.status);
    console.log("- OK:", response.ok);
    
    if (response.ok) {
      const messages = await response.json();
      console.log("- Messages count:", messages.length);
      console.log("- First message:", messages[0]);
    } else {
      const errorText = await response.text();
      console.log("- Error:", errorText);
    }
    
  } catch (error) {
    console.error("Test failed:", error);
  }
  
  // Test if we can send to the conversation
  console.log("\n🧪 Test sending (will not actually send):");
  console.log("fetch('/api/messages/send', {");
  console.log("  method: 'POST',");
  console.log("  headers: { 'Content-Type': 'application/json' },");
  console.log("  body: JSON.stringify({");
  console.log("    conversation_id: " + conversationId + ",");
  console.log("    message: 'Test message'");
  console.log("  })");
  console.log("})");
}

// ========== PAGE NAVIGATION FUNCTIONS ==========
function showInbox() {
  hideAllPages();
  const inboxPage = $('inboxPage');
  if (inboxPage) {
    inboxPage.classList.remove('hidden');
    
    // Setup message form
    setupMessageForm();
    
    // Load conversations
    loadConversations();
  }
}

function showAdminDeletedServices() {
  hideAllPages();
  const adminPage = $('adminDeletedServicesPage');
  if (adminPage) {
    adminPage.classList.remove('hidden');
    loadDeletedServices();
  }
}

function hideAllPages() {
  // Hide all main pages
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
  
  // Also hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab) tab.classList.add('hidden');
  });
}

function debugChatSystem() {
  console.log("=== CHAT SYSTEM DEBUG ===");
  console.log("Active Conversation ID:", window.activeConversationId);
  console.log("Active User ID:", window.activeConversationUserId);
  console.log("Current User:", currentUser);
  console.log("Message Form:", $('sendMessageForm'));
  console.log("Message Input:", $('messageInput'));
  console.log("Inbox Page:", $('inboxPage'));
  
  // Test with specific IDs
  console.log("\n🧪 Try this in console:");
  console.log("startConversationWithService(21, 22)");
}

async function debugConversationIssue() {
  console.log("🔍 DEBUGGING CONVERSATION ISSUE");
  
  // 1. Check current user
  console.log("👤 Current User:", currentUser);
  console.log("User ID:", currentUser?.id);
  
  // 2. Check what conversation 1 contains
  try {
    const debugRes = await fetch('/api/debug/conversation/1', {
      credentials: "include"
    });
    const debugData = await debugRes.json();
    console.log("📊 Conversation 1 Debug:", debugData);
    
    // 3. Who are the participants?
    if (debugData.conversation) {
      console.log("👥 Participants in conversation 1:");
      console.log("- Client ID:", debugData.conversation.client_id);
      console.log("- Client Name:", debugData.conversation.client_name);
      console.log("- Freelancer ID:", debugData.conversation.freelancer_id);
      console.log("- Freelancer Name:", debugData.conversation.freelancer_name);
      console.log("- Current User ID:", debugData.currentUserId);
      
      // Check if current user is part of this conversation
      const isClient = parseInt(debugData.conversation.client_id) === parseInt(currentUser?.id);
      const isFreelancer = parseInt(debugData.conversation.freelancer_id) === parseInt(currentUser?.id);
      console.log("- Is current user the client?", isClient);
      console.log("- Is current user the freelancer?", isFreelancer);
    }
  } catch (error) {
    console.error("Debug fetch error:", error);
  }
  
  // 4. Check all conversations for current user
  try {
    const convRes = await fetch('/api/messages/conversations', {
      credentials: "include"
    });
    const conversations = await convRes.json();
    console.log("📨 User's Conversations:", conversations);
  } catch (error) {
    console.error("Conversations fetch error:", error);
  }
}

// ========== INBOX FUNCTIONALITY ==========

async function loadConversations() {
  try {
    console.log("📨 Loading conversations...");
    const response = await fetch("/api/messages/conversations", {
      credentials: "include"
    });
    
    const conversations = await response.json();
    console.log("📨 Conversations loaded:", conversations);
    
    const list = $("conversationList");
    if (!list) {
      console.error("Conversation list element not found!");
      return;
    }
    
    list.innerHTML = '';
    
    if (!Array.isArray(conversations) || conversations.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 40px;">
          <i class="fas fa-comments" style="font-size: 3rem; color: var(--text-gray); margin-bottom: 15px;"></i>
          <p style="color: var(--text-gray);">No conversations yet</p>
          <p style="color: var(--text-gray); font-size: 0.9rem; margin-top: 10px;">
            Start a conversation by clicking "Chat" on a service
          </p>
        </div>
      `;
      return;
    }
    
    conversations.forEach(conversation => {
      // Make sure conversation_id is valid
      if (!conversation.conversation_id) {
        console.warn("⚠️ Skipping conversation without ID:", conversation);
        return;
      }
      
      const div = document.createElement('div');
      div.className = 'conversation-item';
      div.dataset.conversationId = conversation.conversation_id;
      div.dataset.userId = conversation.other_user_id;
      
      const lastMessage = conversation.last_message || 'Start a conversation...';
      const truncatedMessage = lastMessage.length > 50 
        ? lastMessage.substring(0, 50) + '...' 
        : lastMessage;
      
      div.innerHTML = `
        <div class="conversation-user">${escapeHtml(conversation.other_user_name || 'User')}</div>
        <div class="conversation-preview">${escapeHtml(truncatedMessage)}</div>
        <div style="font-size: 0.8rem; color: var(--text-gray); margin-top: 5px;">
          ${escapeHtml(conversation.service_title || 'Service')}
        </div>
      `;
      
      div.addEventListener('click', () => {
        // Remove active class from all items
        document.querySelectorAll('.conversation-item').forEach(item => {
          item.classList.remove('active');
        });
        // Add active class to clicked item
        div.classList.add('active');
        // Open conversation with VALID ID
        openConversation(conversation.conversation_id, conversation.other_user_name);
      });
      
      list.appendChild(div);
    });
    
    console.log("✅ Conversations loaded successfully");
    
  } catch (error) {
    console.error("❌ Error loading conversations:", error);
    const list = $("conversationList");
    if (list) {
      list.innerHTML = `
        <div class="error-state" style="text-align: center; padding: 20px;">
          <p style="color: var(--text-gray); margin-bottom: 10px;">No conversations to display</p>
          <p style="color: var(--text-gray); font-size: 0.9rem;">Click "Chat" on a service to start a conversation</p>
        </div>
      `;
    }
  }
}

// Setup message form
function setupMessageForm() {
  const form = $('sendMessageForm');
  if (!form) {
    console.error("❌ Message form not found!");
    return;
  }
  
  console.log("✅ Setting up message form for conversation:", window.activeConversationId);
  
  // Remove existing event listeners by cloning
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  
  const messageInput = $('messageInput');
  const submitBtn = newForm.querySelector('button[type="submit"]');
  
  if (!messageInput || !submitBtn) {
    console.error("❌ Message form elements not found");
    return;
  }
  
  // Update the message sending part of setupMessageForm:
  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const message = messageInput.value.trim();
    
    if (!message) {
      showToast('Please enter a message', 'warning');
      return;
    }
    
    if (!window.activeConversationId) {
      showToast('Please select a conversation first', 'warning');
      return;
    }
    
    // Check if user is authenticated
    if (!currentUser) {
      showToast('Please login to send messages', 'warning');
      openModal($('loginModal'));
      return;
    }
    
    console.log("📤 Sending message to conversation:", {
      conversationId: window.activeConversationId,
      message: message,
      userId: currentUser.id
    });
    
    // Show loading state
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    submitBtn.disabled = true;
    
    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          conversation_id: window.activeConversationId,
          message: message
        })
      });
      
      console.log("📡 Send response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Send error response:", errorData);
        
        if (response.status === 403) {
          showToast('Access denied. You may not have permission to send to this conversation.', 'error');
          
          // Clear the conversation selection
          window.activeConversationId = null;
          window.activeConversationUserId = null;
          
          // Reload conversations to get fresh data
          await loadConversations();
        } else {
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to send message`);
        }
        return;
      }
      
      const data = await response.json();
      console.log("✅ Send success:", data);
      
      // Clear input
      messageInput.value = '';
      
      // Refresh messages for the current conversation
      if (window.activeConversationId) {
        await openConversation(window.activeConversationId);
      }
      
      showToast('✅ Message sent!', 'success');
      
    } catch (error) {
      console.error("❌ Error sending message:", error);
      showToast('Failed to send message: ' + error.message, 'error');
    } finally {
      // Reset button
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
      submitBtn.disabled = false;
    }
  });
  
  // Enter key to send
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        newForm.dispatchEvent(new Event('submit'));
      }
    });
  }
}

// ========== ADMIN DELETED SERVICES ==========
async function loadDeletedServices() {
  const res = await fetch("/api/admin/deleted-services");

  if (!res.ok) {
    console.error("Failed to load deleted services");
    return;
  }

  const services = await res.json();
  const tbody = $("deletedServicesTable");

  tbody.innerHTML = "";

  services.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.service_title}</td>
      <td>${s.provider_id}</td>
      <td>${s.reason}</td>
      <td>${s.deleted_by_admin_name}</td>
      <td>${new Date(s.deleted_at).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ========== FIXED SERVICE CREATION WITH CATEGORY FIX ==========
async function handleServiceFormSubmit(e) {
  e.preventDefault();
  console.log("📤 Service form submitted");

  // ---------------------------------------------
  // 1. Get category (your enhanced category system)
  // ---------------------------------------------
  const finalCategory = getSelectedCategoryFromEnhancedForm();

  if (!finalCategory) {
    alert('❌ Please either select an existing category or enter a new one');
    return;
  }

  console.log("📝 Final category:", finalCategory);

  // ---------------------------------------------
  // 2. Get provider profile picture
  // ---------------------------------------------
  let providerProfilePicture = null;

  if (freelancerProfile && freelancerProfile.profile_picture) {
    providerProfilePicture = freelancerProfile.profile_picture;
  } else {
    const cachedPicture = localStorage.getItem('profile_picture_url');
    if (cachedPicture) providerProfilePicture = cachedPicture;
  }

  // ---------------------------------------------
  // 3. Build service data
  // ---------------------------------------------
  const serviceData = {
    title: $("serviceTitle").value.trim(),
    description: $("serviceDescription").value.trim(),
    category: finalCategory,
    hourly_rate: $("hourlyRate").value || null,
    fixed_price: $("fixedPrice").value || null,
    provider_profile_picture: providerProfilePicture
  };

  console.log("📦 Service data:", serviceData);

  // ---------------------------------------------
  // 4. Submit button loader
  // ---------------------------------------------
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  submitBtn.disabled = true;

  try {
    console.log("📤 Sending service data to API...");

    const response = await fetch('/api/services', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(serviceData)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Server error:", data);
      alert(data.error || 'Failed to create service');
      return;
    }

    console.log("✅ Service created successfully:", data);

    alert('🎉 Service created successfully!');

    // Reset form
    $("serviceForm").reset();
    hideCreateServiceForm();

    // Reload UI
    await loadCategories();
    if (userRole === 'freelancer') await loadMyServices();
    await loadServices();

  } catch (error) {
    console.error("❌ Service creation error:", error);
    alert("Failed to create service. Please try again.");
  }

  // Reset button
  submitBtn.innerHTML = originalText;
  submitBtn.disabled = false;
}

// ========== UPDATED RENDER SERVICES FUNCTION WITH CHAT AND PROFILE BUTTONS ==========
function renderServices(servicesToRender) {
  const container = $('servicesList');
  const noServices = $('noServices');

  if (!container) {
    console.error("❌ servicesList container not found!");
    return;
  }

  if (!servicesToRender || servicesToRender.length === 0) {
    container.innerHTML = '';
    if (noServices) noServices.style.display = 'block';
    return;
  }

  if (noServices) noServices.style.display = 'none';

  container.innerHTML = servicesToRender.map(service => {
    const serviceId = service.id || service.service_id;
    const title = service.title || 'Untitled Service';
    const description = service.description || 'No description available';
    const price = service.price || service.hourly_rate || 0;
    const providerName = service.username || service.provider_name || 'Unknown';
    const userId = service.user_id || service.provider_id;
    const profilePicture = service.profile_picture || service.provider_profile_picture;

    const providerPictureHtml = profilePicture
      ? `
        <div class="profile-picture-wrapper">
          <img src="${profilePicture}"
               alt="${providerName}"
               class="provider-profile-picture"
               onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'provider-initials\\'>${providerName.charAt(0).toUpperCase()}</div>';">
        </div>
      `
      : `<div class="provider-initials">${providerName.charAt(0).toUpperCase()}</div>`;

    return `
      <div class="service-card" data-service-id="${serviceId}">

        <div class="service-header">
          <h3 class="service-title">${escapeHtml(title)}</h3>
          <div class="service-price">${price > 0 ? `$${price}` : 'Free'}</div>
        </div>

        <div class="service-provider-info">
          ${providerPictureHtml}
          <div>
            <div class="service-provider-name">${escapeHtml(providerName)}</div>
            <div class="service-provider">${escapeHtml(service.category || 'General')}</div>
          </div>
        </div>

        <div class="description-container">
          <p class="service-description">
            ${escapeHtml(description)}
          </p>
        </div>

        <div class="service-actions">
          <button class="btn chat-btn" onclick="startConversationWithService(${serviceId}, ${userId})">
            <i class="fas fa-comments"></i> Chat
          </button>
          <button class="btn profile-btn" onclick="openFreelancerProfile(${userId})">
            <i class="fas fa-user"></i> View Profile
          </button>
        </div>

        ${currentUser?.role === 'admin' ? `
          <div class="admin-badge">
            <i class="fas fa-shield-alt"></i> Admin View
          </div>
        ` : ''}

        <div class="service-actions">
          <button class="btn btn-primary"
            onclick="viewServiceDetails(${serviceId})">
            View Details
          </button>

          ${currentUser?.role === 'admin' ? `
            <button class="btn btn-danger"
              onclick="confirmDeleteService(${serviceId}, '${escapeHtml(title)}', ${userId}, false)">
              <i class="fas fa-trash"></i> Admin Delete
            </button>
          ` : ''}

          ${currentUser?.id === userId ? `
            <button class="btn btn-warning"
              onclick="confirmDeleteService(${serviceId}, '${escapeHtml(title)}', ${userId}, true)">
              <i class="fas fa-trash"></i> Delete My Service
            </button>
          ` : ''}
        </div>

      </div>
    `;
  }).join('');
}

// ========== ADMIN DELETE SERVICE FUNCTIONS ==========
function confirmDeleteService(serviceId, serviceTitle, userId, isOwner = false) {
  console.log("🗑️ Delete request:", { serviceId, serviceTitle, userId, isOwner, currentUser });
  
  const isAdmin = currentUser && currentUser.role === 'admin';
  const isOwnerDelete = isOwner || (currentUser && currentUser.id === userId);
  
  // Create appropriate modal based on who's deleting
  if (isAdmin) {
    createAdminDeleteModal(serviceId, serviceTitle, userId);
  } else if (isOwnerDelete) {
    createFreelancerDeleteModal(serviceId, serviceTitle, userId);
  } else {
    showToast('You can only delete your own services', 'error');
  }
}

// Admin delete modal
function createAdminDeleteModal(serviceId, serviceTitle, userId) {
  const modalHtml = `
    <div id="adminDeleteModal" class="modal" style="display: flex;">
      <div class="modal-card" style="max-width: 500px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="margin:0;color:#ff4444;"><i class="fas fa-trash"></i> Admin Delete Service</h3>
          <span onclick="closeAdminDeleteModal()" class="close-x" style="cursor:pointer">&times;</span>
        </div>
        
        <div style="background: rgba(255, 68, 68, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin:0;color:#ff4444;font-weight:500;">
            <i class="fas fa-exclamation-triangle"></i> <strong>Admin Action Required</strong>
          </p>
          <p style="margin:10px 0 0 0;color:var(--text-light);">
            You are about to delete a service as an administrator. This action cannot be undone.
          </p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <p><strong>Service:</strong> ${escapeHtml(serviceTitle)}</p>
          <p><strong>Service ID:</strong> ${serviceId}</p>
          <p><strong>Provider User ID:</strong> ${userId}</p>
        </div>
        
        <div class="form-group">
          <label style="color:var(--text-light);">Reason for deletion (required):</label>
          <textarea id="deleteReason" 
            placeholder="Why are you deleting this service? Provide a detailed reason for audit purposes." 
            style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,68,68,0.3);background:var(--card-bg);color:var(--text-light);min-height:100px;"></textarea>
        </div>
        
        <div style="display:flex;gap:12px;margin-top:25px;">
          <button onclick="deleteService(${serviceId}, ${userId})" id="confirmDeleteBtn" 
                  style="flex:1;padding:12px;background:#ff4444;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
            <i class="fas fa-trash"></i> Confirm Delete
          </button>
          <button onclick="closeAdminDeleteModal()" 
                  style="flex:1;padding:12px;background:transparent;color:var(--text-gray);border:1px solid var(--text-gray);border-radius:8px;cursor:pointer;">
            <i class="fas fa-times"></i> Cancel
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Enable button when reason is provided
  const deleteReason = $('deleteReason');
  const confirmBtn = $('confirmDeleteBtn');
  
  deleteReason.addEventListener('input', function() {
    const hasReason = this.value.trim().length > 10;
    confirmBtn.disabled = !hasReason;
    confirmBtn.style.opacity = hasReason ? '1' : '0.5';
  });
}

// Freelancer delete modal
function createFreelancerDeleteModal(serviceId, serviceTitle, userId) {
  // Check remaining deletes first
  checkRemainingDeletes().then(remaining => {
    const modalHtml = `
      <div id="freelancerDeleteModal" class="modal" style="display: flex;">
        <div class="modal-card" style="max-width: 500px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3 style="margin:0;color:#ff9800;"><i class="fas fa-exclamation-triangle"></i> Delete Your Service</h3>
            <span onclick="closeFreelancerDeleteModal()" class="close-x" style="cursor:pointer">&times;</span>
          </div>
          
          <div style="background: rgba(255, 152, 0, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin:0;color:#ff9800;font-weight:500;">
              <i class="fas fa-info-circle"></i> <strong>Important Information</strong>
            </p>
            <p style="margin:10px 0 0 0;color:var(--text-light);font-size:0.9rem;">
              • You can delete up to <strong>3 services per day</strong><br>
              • Remaining deletions today: <strong style="color:${remaining > 0 ? '#4CAF50' : '#ff4444'}">${remaining}/3</strong><br>
              • All deletions are logged for quality monitoring<br>
              • Please provide a reason for deletion
            </p>
          </div>
          
          <div style="margin-bottom: 25px;">
            <p><strong>Service:</strong> ${escapeHtml(serviceTitle)}</p>
            <p><strong>Service ID:</strong> ${serviceId}</p>
          </div>
          
          ${remaining === 0 ? `
            <div style="background: rgba(255, 68, 68, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin:0;color:#ff4444;font-weight:500;">
                <i class="fas fa-ban"></i> <strong>Daily Limit Reached</strong>
              </p>
              <p style="margin:10px 0 0 0;color:var(--text-light);">
                You have reached the maximum of 3 service deletions today. Please contact support if you need to delete more services.
              </p>
            </div>
          ` : ''}
          
          <div class="form-group">
            <label style="color:var(--text-light);">Reason for deletion (required):</label>
            <textarea id="freelancerDeleteReason" 
              placeholder="Why are you deleting this service? (e.g., no longer offering, updating service, etc.)" 
              style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,152,0,0.3);background:var(--card-bg);color:var(--text-light);min-height:100px;"
              ${remaining === 0 ? 'disabled' : ''}></textarea>
          </div>
          
          <div style="display:flex;gap:12px;margin-top:25px;">
            <button onclick="deleteServiceAsFreelancer(${serviceId})" id="confirmFreelancerDeleteBtn" 
                    style="flex:1;padding:12px;background:#ff9800;color:white;border:none;border-radius:8px;cursor:${remaining === 0 ? 'not-allowed' : 'pointer'};font-weight:600;opacity:${remaining === 0 ? '0.5' : '1'};"
                    ${remaining === 0 ? 'disabled' : ''}>
              <i class="fas fa-trash"></i> Delete Service
            </button>
            <button onclick="closeFreelancerDeleteModal()" 
                    style="flex:1;padding:12px;background:transparent;color:var(--text-gray);border:1px solid var(--text-gray);border-radius:8px;cursor:pointer;">
              <i class="fas fa-times"></i> Cancel
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Enable button when reason is provided
    if (remaining > 0) {
      const deleteReason = $('freelancerDeleteReason');
      const confirmBtn = $('confirmFreelancerDeleteBtn');
      
      deleteReason.addEventListener('input', function() {
        const hasReason = this.value.trim().length > 5;
        confirmBtn.disabled = !hasReason;
        confirmBtn.style.opacity = hasReason ? '1' : '0.5';
      });
    }
    
  }).catch(error => {
    console.error("Error checking remaining deletes:", error);
    showToast('Error checking delete limits', 'error');
  });
}

// Check remaining deletes
async function checkRemainingDeletes() {
  try {
    const response = await fetch('/api/user/delete-limits', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.remaining_deletes || 0;
    }
    
    return 3; // Default if error
  } catch (error) {
    console.error("Error checking delete limits:", error);
    return 3;
  }
}

// Admin delete function
async function deleteService(serviceId, userId) {
  const deleteReason = $('deleteReason').value.trim();
  
  if (!deleteReason || deleteReason.length < 10) {
    showToast('Please provide a detailed reason for deletion (at least 10 characters).', 'error');
    return;
  }
  
  try {
    console.log("🧪 Starting delete process...");
    
    // Show loading
    const confirmDeleteBtn = $('confirmDeleteBtn');
    const originalText = confirmDeleteBtn.innerHTML;
    confirmDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    confirmDeleteBtn.disabled = true;
    
    // Prepare request
    const response = await fetch(`/api/admin/services/${serviceId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        reason: deleteReason,
        provider_user_id: userId
      })
    });
    
    // Try to parse response text first for debugging
    const responseText = await response.text();
    console.log("Raw response text:", responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      throw new Error(`Server returned invalid JSON: ${responseText.substring(0, 100)}...`);
    }
    
    console.log("Parsed response data:", data);
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Failed to delete service`);
    }
    
    console.log("✅ Delete successful!");
    showToast('✅ Service deleted successfully!', 'success');
    closeAdminDeleteModal();
    
    // Refresh after a short delay
    setTimeout(() => {
      loadServices();
    }, 1000);
    
  } catch (error) {
    console.error('❌ DELETE ERROR DETAILS:');
    console.error('- Message:', error.message);
    console.error('- Name:', error.name);
    console.error('- Stack:', error.stack);
    
    // User-friendly error messages
    let userMessage = error.message;
    if (error.message.includes('Cannot read properties of undefined')) {
      userMessage = 'Server error: Could not process the service data.';
    } else if (error.message.includes('Failed to fetch')) {
      userMessage = 'Network error. Please check your connection.';
    } else if (error.message.includes('500')) {
      userMessage = 'Server error. Please try again later.';
    }
    
    showToast(`❌ ${userMessage}`, 'error');
    
    // Reset button
    const confirmDeleteBtn = $('confirmDeleteBtn');
    if (confirmDeleteBtn) {
      confirmDeleteBtn.innerHTML = '<i class="fas fa-trash"></i> Confirm Delete';
      confirmDeleteBtn.disabled = false;
    }
  }
}

// Close modal functions
function closeAdminDeleteModal() {
  const modal = $('adminDeleteModal');
  if (modal) modal.remove();
}

// ========== PROFILE FUNCTIONALITY ==========
async function handleProfilePictureUpload(e) {
  if (!e.target.files.length) return;
  
  const file = e.target.files[0];
  const formData = new FormData();
  formData.append('profile_picture', file);
  
  try {
    console.log("📸 Uploading profile picture...");
    
    // Show loading
    const updatePhotoBtn = $('updatePhotoBtn');
    const originalText = updatePhotoBtn.innerHTML;
    updatePhotoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    updatePhotoBtn.disabled = true;
    
    const response = await fetch('/api/freelancer/profile-picture', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload picture');
    }
    
    console.log("✅ Profile picture uploaded:", result);
    
    // Update the image immediately
    const img = $('profilePicture');
    const initials = $('profileInitials');
    
    if (img && result.profile_picture) {
      // Add cache busting
      const timestamp = new Date().getTime();
      const pictureUrl = result.profile_picture + '?t=' + timestamp;
      img.src = pictureUrl;
      img.style.display = 'block';
      
      if (initials) {
        initials.style.display = 'none';
      }
      
      // Save to localStorage
      localStorage.setItem('profile_picture_url', result.profile_picture);
      localStorage.setItem('profile_picture_timestamp', timestamp);
      
      // Update local profile data
      if (freelancerProfile) {
        freelancerProfile.profile_picture = result.profile_picture;
      }
    }
    
    // Update all existing services with new profile picture
    await updateServicesWithNewProfilePicture(result.profile_picture);
    
    showToast('✅ Profile picture updated successfully!', 'success');
    
  } catch (error) {
    console.error('❌ Error uploading profile picture:', error);
    showToast('❌ Failed to upload profile picture: ' + error.message, 'error');
  } finally {
    const updatePhotoBtn = $('updatePhotoBtn');
    if (updatePhotoBtn) {
      updatePhotoBtn.innerHTML = '<i class="fas fa-camera"></i> Update Photo';
      updatePhotoBtn.disabled = false;
    }
  }
}

// Initialize profile functionality
function initProfileFunctionality() {
  console.log("🔧 Initializing profile functionality...");
  
  // Initialize skills if empty
  if (!currentSkills || currentSkills.length === 0) {
    currentSkills = ['React', 'Node.js', 'TypeScript', 'MongoDB', 'AWS', 'UI/UX Design'];
  }
  
  // Setup all event listeners
  setupProfileEventListeners();
  
  console.log("✅ Profile functionality initialized");
}

// Setup profile event listeners
function setupProfileEventListeners() {
  console.log("🎯 Setting up profile event listeners...");
  
  // Profile picture upload
  const updatePhotoBtn = $('updatePhotoBtn');
  const profilePictureInput = $('profilePictureInput');
  
  if (updatePhotoBtn && profilePictureInput) {
    updatePhotoBtn.addEventListener('click', () => {
      console.log("📸 Update photo clicked");
      profilePictureInput.click();
    });
    
    profilePictureInput.addEventListener('change', handleProfilePictureUpload);
  }
  
  // Navigation tabs
  const profileViewBtn = $('profileViewTabBtn');
  const profileEditBtn = $('profileEditTabBtn');
  const dashboardBtn = $('dashboardTabBtn');
  const myServicesBtn = $('myServicesTabBtn');
  const ordersBtn = $('ordersTabBtn');
  
  if (profileViewBtn) profileViewBtn.addEventListener('click', () => switchProfileTab('profileView'));
  if (profileEditBtn) profileEditBtn.addEventListener('click', () => switchProfileTab('profileEdit'));
  if (dashboardBtn) dashboardBtn.addEventListener('click', () => switchProfileTab('dashboard'));
  if (myServicesBtn) myServicesBtn.addEventListener('click', switchToServicesTab);
  if (ordersBtn) ordersBtn.addEventListener('click', switchToOrdersTab);
  
  // Action buttons
  const editProfileBtn = $('editProfileBtn');
  const dashboardActionBtn = $('dashboardBtn');
  const shareProfileBtn = $('shareProfileBtn');
  const exportProfileBtn = $('exportProfileBtn');
  
  if (editProfileBtn) editProfileBtn.addEventListener('click', () => switchProfileTab('profileEdit'));
  if (dashboardActionBtn) dashboardActionBtn.addEventListener('click', () => switchProfileTab('dashboard'));
  if (shareProfileBtn) shareProfileBtn.addEventListener('click', shareProfile);
  if (exportProfileBtn) exportProfileBtn.addEventListener('click', exportProfile);
  
  // Edit form - Skills
  const addSkillBtn = $('addSkillBtn');
  const newSkillInput = $('newSkill');
  
  if (addSkillBtn) {
    addSkillBtn.addEventListener('click', addSkill);
  }
  
  if (newSkillInput) {
    newSkillInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSkill();
      }
    });
  }
  
  // Common skill buttons
  document.querySelectorAll('.common-skill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const skill = e.target.getAttribute('data-skill');
      addCommonSkill(skill);
    });
  });
  
  // Cancel edit button
  const cancelEditBtn = $('cancelEditBtn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      switchProfileTab('profileView');
    });
  }
  
  // Profile form submission
  const profileForm = $('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileFormSubmit);
  }
  
  console.log("✅ Profile event listeners setup complete");
}

// Skill management functions
function addSkill() {
  const input = $('newSkill');
  const skill = input.value.trim();
  
  if (skill && !currentSkills.includes(skill)) {
    currentSkills.push(skill);
    renderSkills(currentSkills);
    input.value = '';
    input.focus();
    showToast('Skill added!', 'success');
  } else if (skill) {
    showToast('This skill is already added!', 'warning');
  }
}

function addCommonSkill(skill) {
  const input = $('newSkill');
  input.value = skill;
  addSkill();
}

function removeSkill(skillToRemove) {
  currentSkills = currentSkills.filter(skill => skill !== skillToRemove);
  renderSkills(currentSkills);
  showToast('Skill removed!', 'info');
}

function renderSkills(skills) {
  const container = $('skillsList');
  if (!container) return;
  
  container.innerHTML = skills.map(skill => `
    <span class="skill-tag">
      ${escapeHtml(skill)}
      <i class="fas fa-times remove-skill" onclick="removeSkill('${skill.replace(/'/g, "\\'")}')"></i>
    </span>
  `).join('');
}

// Show freelancer profile
function showFreelancerProfile() {
  console.log("👤 Showing freelancer profile");
  
  // Hide other sections
  hideAllPages();
  
  // Show profile section
  const profileSection = $('freelancerProfile');
  if (profileSection) {
    profileSection.classList.remove('hidden');
  }
  
  // Load profile data
  loadFreelancerProfile();
  switchProfileTab('profileView');
}

// Load freelancer profile from server
async function loadFreelancerProfile() {
  try {
    console.log("🔍 Loading freelancer profile from server...");
    
    const response = await fetch('/api/freelancer/profile', {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to load profile`);
    }
    
    freelancerProfile = await response.json();
    console.log("✅ Profile loaded from server:", freelancerProfile);
    
    // Check localStorage for cached profile picture
    const cachedPicture = localStorage.getItem('profile_picture_url');
    if (cachedPicture && (!freelancerProfile.profile_picture || freelancerProfile.profile_picture.includes('default'))) {
      freelancerProfile.profile_picture = cachedPicture;
    }
    
    // Render the profile
    renderProfile();
    
    // Update skills for edit form
    if (freelancerProfile.skills) {
      try {
        currentSkills = Array.isArray(freelancerProfile.skills) ? 
          freelancerProfile.skills : 
          JSON.parse(freelancerProfile.skills);
        renderSkills(currentSkills);
      } catch (e) {
        console.error("Error parsing skills:", e);
        currentSkills = ['React', 'Node.js', 'TypeScript', 'MongoDB', 'AWS', 'UI/UX Design'];
        renderSkills(currentSkills);
      }
    }
    
  } catch (error) {
    console.error('❌ Error loading profile:', error);
    showToast('❌ Failed to load profile. Please try again.', 'error');
    
    // Show default profile if loading fails
    renderDefaultProfile();
  }
}

// Render profile data
function renderProfile() {
  if (!freelancerProfile) {
    console.log("❌ No profile data to render");
    renderDefaultProfile();
    return;
  }
  
  console.log("🎨 Rendering profile data...");
  
  // Basic info
  safeSetText('profileUsername', freelancerProfile.username || currentUser?.username || 'Freelancer');
  safeSetText('profileHeadline', freelancerProfile.headline || 'Professional Freelancer');
  safeSetText('profileEmail', freelancerProfile.email || currentUser?.email || 'Not provided');
  safeSetText('profilePhone', freelancerProfile.phone || 'Not provided');
  
  // Profile picture
  const img = $('profilePicture');
  const initials = $('profileInitials');
  
  if (freelancerProfile.profile_picture) {
    // Add cache busting parameter
    const timestamp = localStorage.getItem('profile_picture_timestamp') || new Date().getTime();
    const pictureUrl = freelancerProfile.profile_picture.includes('?') 
      ? freelancerProfile.profile_picture 
      : freelancerProfile.profile_picture + '?t=' + timestamp;
    
    if (img) {
      img.src = pictureUrl;
      img.style.display = 'block';
      // Add error handling for broken images
      img.onerror = function() {
        console.log("❌ Image failed to load, showing initials");
        this.style.display = 'none';
        if (initials) {
          initials.style.display = 'flex';
        }
      };
    }
    if (initials) {
      initials.style.display = 'none';
    }
  } else {
    // Check localStorage as backup
    const cachedPicture = localStorage.getItem('profile_picture_url');
    if (cachedPicture && img) {
      const timestamp = localStorage.getItem('profile_picture_timestamp') || new Date().getTime();
      img.src = cachedPicture + '?t=' + timestamp;
      img.style.display = 'block';
      if (initials) initials.style.display = 'none';
    } else {
      if (img) img.style.display = 'none';
      if (initials) {
        const name = freelancerProfile.username || currentUser?.username || 'F';
        initials.textContent = name.charAt(0).toUpperCase();
        initials.style.display = 'flex';
      }
    }
  }
  
  // Stats
  safeSetText('totalServices', freelancerProfile.total_services || 0);
  safeSetText('totalReviews', freelancerProfile.total_reviews || 0);
  safeSetText('avgRating', (freelancerProfile.avg_rating || 0).toFixed(1));
  safeSetText('totalEarnings', `$${freelancerProfile.total_earnings || 0}`);
  
  // Dashboard stats
  safeSetText('dashboardServices', freelancerProfile.total_services || 0);
  safeSetText('dashboardEarnings', `$${freelancerProfile.total_earnings || 0}`);
  safeSetText('dashboardClients', freelancerProfile.total_clients || 0);
  safeSetText('dashboardRating', (freelancerProfile.avg_rating || 0).toFixed(1));
  
  // About section
  safeSetText('profileDescription', freelancerProfile.description || 'No description provided. Tell clients about your experience and expertise.');
  
  // Skills in view mode
  const skillsContainer = $('profileSkills');
  if (skillsContainer) {
    try {
      const skills = currentSkills.length > 0 ? currentSkills : 
        (freelancerProfile.skills ? (Array.isArray(freelancerProfile.skills) ? freelancerProfile.skills : JSON.parse(freelancerProfile.skills)) : []);
      skillsContainer.innerHTML = skills.map(skill => `
        <span class="skill-tag">${escapeHtml(skill)}</span>
      `).join('');
    } catch (e) {
      console.error("Error parsing skills:", e);
      skillsContainer.innerHTML = '<span class="text-gray">No skills added yet</span>';
    }
  }
  
  // Details
  safeSetText('profileHourlyRate', `$${freelancerProfile.hourly_rate || 0}/hr`);
  safeSetText('profileExperienceLevel', formatExperienceLevel(freelancerProfile.experience_level));
  safeSetText('profileLocation', freelancerProfile.location || 'Not specified');
  safeSetText('profileLocationDisplay', freelancerProfile.location || 'Not specified');
  safeSetText('profileLanguages', formatLanguages(freelancerProfile.languages));
  
  // Availability
  const availabilityElement = $('profileAvailability');
  if (availabilityElement) {
    const availability = freelancerProfile.availability || 'available';
    availabilityElement.textContent = formatAvailability(availability);
    availabilityElement.className = `availability-badge availability-${availability}`;
  }
  
  // Website
  const websiteElement = $('profileWebsite');
  if (websiteElement) {
    if (freelancerProfile.website) {
      websiteElement.href = freelancerProfile.website;
      websiteElement.textContent = freelancerProfile.website.replace(/^https?:\/\//, '');
      websiteElement.style.display = 'inline';
    } else {
      websiteElement.style.display = 'none';
    }
  }
  
  // Education & Certifications
  safeSetText('profileEducation', freelancerProfile.education || 'No education information provided.');
  safeSetText('profileCertifications', freelancerProfile.certifications || 'No certifications added yet.');
  
  // Member since
  const memberSince = freelancerProfile.created_at || freelancerProfile.user_created_at;
  safeSetText('profileMemberSince', memberSince ? 
    new Date(memberSince).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    }) : 'N/A');
  
  console.log("✅ Profile rendering complete");
}

// Show default profile when loading fails
function renderDefaultProfile() {
  const username = currentUser?.username || 'Freelancer';
  
  safeSetText('profileUsername', username);
  safeSetText('profileHeadline', 'Professional Freelancer');
  safeSetText('profileEmail', currentUser?.email || 'Not provided');
  
  // Show initials
  const img = $('profilePicture');
  const initials = $('profileInitials');
  if (img) img.style.display = 'none';
  if (initials) {
    initials.textContent = username.charAt(0).toUpperCase();
    initials.style.display = 'flex';
  }
  
  // Set default stats
  safeSetText('totalServices', '0');
  safeSetText('avgRating', '0.0');
  safeSetText('totalReviews', '0');
  safeSetText('totalEarnings', '$0');
}

// Switch between profile tabs (old version - keep for compatibility)
function switchProfileTabOld(tabName) {
  console.log("🔀 Switching to profile tab:", tabName);
  
  // Hide all profile tab contents
  document.querySelectorAll('.profile-tab-content').forEach(tab => {
    tab.classList.add('hidden');
  });
  
  // Remove active class from all tab buttons
  document.querySelectorAll('.nav-tab.enhanced').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Show selected tab content
  const tabContent = $(tabName + 'TabContent');
  if (tabContent) {
    tabContent.classList.remove('hidden');
  }
  
  // Add active class to clicked tab button
  const tabButton = $(tabName + 'TabBtn');
  if (tabButton) {
    tabButton.classList.add('active');
  }
  
  // Load tab-specific data
  if (tabName === 'profileEdit') {
    loadEditForm();
  } else if (tabName === 'dashboard') {
    loadDashboardData();
  }
}

// Load data into edit form
function loadEditForm() {
  console.log("📝 Loading edit form...");
  
  if (!freelancerProfile) {
    console.log("No profile data to load into form");
    showToast('Please load profile data first', 'warning');
    
    // Load profile first
    loadFreelancerProfile().then(() => {
      // Try again after loading
      if (freelancerProfile) {
        loadEditFormData();
      }
    });
    return;
  }
  
  loadEditFormData();
}

function loadEditFormData() {
  console.log("📝 Loading profile data into edit form...");
  
  // Set form values
  safeSetValue('editHeadline', freelancerProfile.headline || '');
  safeSetValue('editDescription', freelancerProfile.description || '');
  safeSetValue('editHourlyRate', freelancerProfile.hourly_rate || 25);
  safeSetSelectValue('editExperienceLevel', freelancerProfile.experience_level || 'intermediate');
  safeSetSelectValue('editAvailability', freelancerProfile.availability || 'available');
  safeSetValue('editLocation', freelancerProfile.location || '');
  safeSetValue('editPhone', freelancerProfile.phone || '');
  safeSetValue('editWebsite', freelancerProfile.website || '');
  safeSetValue('editEducation', freelancerProfile.education || '');
  safeSetValue('editCertifications', freelancerProfile.certifications || '');
  
  // Languages
  safeSetValue('editLanguages', formatLanguagesForEdit(freelancerProfile.languages));
  updateSelectedLanguages(freelancerProfile.languages);
  
  // Render skills in edit form
  renderSkills(currentSkills);
  
  console.log("✅ Edit form loaded successfully");
}

// Handle profile form submission
async function handleProfileFormSubmitOld(e) {
  e.preventDefault();
  console.log("📝 Profile form submitted");
  
  // Show loading state
  const submitBtn = document.querySelector('#profileForm button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  submitBtn.disabled = true;
  
  try {
    // Collect form data
    const profileUpdateData = {
      headline: $('editHeadline').value.trim(),
      description: $('editDescription').value.trim(),
      hourly_rate: parseFloat($('editHourlyRate').value) || 0,
      skills: currentSkills,
      experience_level: $('editExperienceLevel').value,
      availability: $('editAvailability').value,
      location: $('editLocation').value.trim(),
      phone: $('editPhone').value.trim(),
      website: $('editWebsite').value.trim(),
      education: $('editEducation').value.trim(),
      certifications: $('editCertifications').value.trim(),
      languages: $('editLanguages').value
        .split(',')
        .map(lang => lang.trim())
        .filter(lang => lang)
    };
    
    console.log("📦 Sending profile update data:", profileUpdateData);
    
    const response = await fetch('/api/freelancer/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(profileUpdateData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}: Failed to update profile`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to update profile');
    }
    
    console.log("✅ Profile updated successfully:", result);
    
    // Update local profile data
    freelancerProfile = { ...freelancerProfile, ...profileUpdateData };
    
    // Switch back to view tab
    switchProfileTab('profileView');
    
    // Update the view immediately
    renderProfile();
    
    showToast('✅ Profile updated successfully!', 'success');
    
  } catch (error) {
    console.error('❌ Error updating profile:', error);
    showToast('❌ Failed to update profile: ' + error.message, 'error');
  } finally {
    // Reset button
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

// Utility functions
function formatExperienceLevel(level) {
  const levels = {
    'beginner': 'Beginner (0-2 years)',
    'intermediate': 'Intermediate (2-5 years)', 
    'expert': 'Expert (5+ years)'
  };
  return levels[level] || 'Not specified';
}

function formatAvailability(availability) {
  const status = {
    'available': 'Available',
    'busy': 'Busy',
    'unavailable': 'Unavailable'
  };
  return status[availability] || 'Available';
}

function formatLanguages(languages) {
  if (!languages) return 'Not specified';
  
  if (typeof languages === 'string') {
    try {
      const langArray = JSON.parse(languages);
      return Array.isArray(langArray) ? langArray.join(', ') : languages;
    } catch {
      return languages;
    }
  } else if (Array.isArray(languages)) {
    return languages.join(', ');
  }
  
  return 'Not specified';
}

function formatLanguagesForEdit(languages) {
  if (!languages) return '';
  
  if (typeof languages === 'string') {
    try {
      const langArray = JSON.parse(languages);
      return Array.isArray(langArray) ? langArray.join(', ') : languages;
    } catch {
      return languages;
    }
  } else if (Array.isArray(languages)) {
    return languages.join(', ');
  }
  
  return '';
}

function updateSelectedLanguages(languages) {
  const container = $('selectedLanguages');
  if (!container) return;

  let langArray = [];
  if (typeof languages === 'string') {
    try {
      langArray = JSON.parse(languages);
    } catch {
      langArray = languages.split(',').map(lang => lang.trim()).filter(lang => lang);
    }
  } else if (Array.isArray(languages)) {
    langArray = languages;
  }

  container.innerHTML = langArray.map(lang => `
    <span class="language-tag">
      ${escapeHtml(lang)}
    </span>
  `).join('');
}

// Navigation functions
function switchToServicesTab() {
  console.log("🔀 Switching to services tab");
  
  // Hide profile section
  const profileSection = $('freelancerProfile');
  if (profileSection) {
    profileSection.classList.add('hidden');
  }
  
  // Show services browser
  const servicesBrowser = $('servicesBrowser');
  if (servicesBrowser) {
    servicesBrowser.classList.remove('hidden');
    // Call existing switchTab function
    if (typeof switchTab === 'function') {
      switchTab('myServices');
    }
  }
  
  showToast('Navigating to My Services...', 'info');
}

function switchToOrdersTab() {
  console.log("🔀 Switching to orders tab");
  
  // Hide profile section
  const profileSection = $('freelancerProfile');
  if (profileSection) {
    profileSection.classList.add('hidden');
  }
  
  // Show services browser
  const servicesBrowser = $('servicesBrowser');
  if (servicesBrowser) {
    servicesBrowser.classList.remove('hidden');
    // Call existing switchTab function
    if (typeof switchTab === 'function') {
      switchTab('clients');
    }
  }
  
  showToast('Navigating to Orders...', 'info');
}

// Other functions
function shareProfile() {
  if (!freelancerProfile) {
    showToast('Please load your profile first', 'warning');
    return;
  }
  
  const profileUrl = `${window.location.origin}/profile/${freelancerProfile.username || currentUser?.username || 'freelancer'}`;
  
  if (navigator.share) {
    navigator.share({
      title: `${freelancerProfile.username || currentUser?.username}'s Profile`,
      text: `Check out ${freelancerProfile.username || currentUser?.username}'s freelancer profile on Core Insight!`,
      url: profileUrl
    }).catch(console.error);
  } else {
    // Copy to clipboard
    navigator.clipboard.writeText(profileUrl).then(() => {
      showToast('✅ Profile link copied to clipboard!', 'success');
    }).catch(() => {
      // Fallback for older browsers
      const tempInput = document.createElement('input');
      tempInput.value = profileUrl;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      showToast('✅ Profile link copied to clipboard!', 'success');
    });
  }
}

function exportProfile() {
  if (!freelancerProfile) {
    showToast('Please load your profile first', 'warning');
    return;
  }
  
  const exportData = {
    username: freelancerProfile.username || currentUser?.username,
    email: freelancerProfile.email || currentUser?.email,
    headline: freelancerProfile.headline,
    description: freelancerProfile.description,
    hourly_rate: freelancerProfile.hourly_rate,
    experience_level: freelancerProfile.experience_level,
    location: freelancerProfile.location,
    phone: freelancerProfile.phone,
    website: freelancerProfile.website,
    skills: currentSkills,
    education: freelancerProfile.education,
    certifications: freelancerProfile.certifications,
    languages: freelancerProfile.languages,
    availability: freelancerProfile.availability,
    created_at: freelancerProfile.created_at || freelancerProfile.user_created_at
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `profile-${exportData.username || 'freelancer'}-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  
  showToast('✅ Profile exported successfully!', 'success');
}

async function loadDashboardData() {
  try {
    console.log("📊 Loading dashboard data...");
    
    // Load dashboard stats
    const response = await fetch('/api/freelancer/dashboard');
    
    if (response.ok) {
      const data = await response.json();
      // Update dashboard with real data if available
      if (data.total_services !== undefined) {
        safeSetText('dashboardServices', data.total_services);
      }
      if (data.total_earnings !== undefined) {
        safeSetText('dashboardEarnings', `$${data.total_earnings}`);
      }
      if (data.total_clients !== undefined) {
        safeSetText('dashboardClients', data.total_clients);
      }
      if (data.avg_rating !== undefined) {
        safeSetText('dashboardRating', data.avg_rating.toFixed(1));
      }
    }
    
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Add this test function to your frontend to debug
async function testChatFlow() {
  console.log("🧪 Testing chat flow...");
  
  // 1. Check current user
  console.log("👤 Current user:", currentUser);
  
  // 2. Load conversations
  console.log("📨 Loading conversations...");
  const convRes = await fetch("/api/messages/conversations", {
    credentials: "include"
  });
  console.log("📨 Conversations response:", await convRes.json());
  
  // 3. Try to start a conversation with service 22, freelancer 22
  console.log("💬 Starting test conversation...");
  const startRes = await fetch("/api/messages/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      serviceId: 22,
      freelancerId: 22
    })
  });
  console.log("💬 Start response:", await startRes.json());
  
  alert("Check console for test results");
}

// ========== AUTHENTICATION & ROLE MANAGEMENT ==========
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

    currentUser = await response.json();
    userRole = currentUser?.role || null;

    updateHeader();
    updateUIForUserRole();

    // Show role modal if user role not set
    if (!userRole && $('roleModal')) {
      setTimeout(() => openModal($('roleModal')), 1000);
    }

    // Load freelancer-specific data if needed
    if (userRole === 'freelancer') {
      loadSubscriptionStatus().catch(err => console.error(err));
      loadMyServices().catch(err => console.error(err));
    }

    // Load all services asynchronously without blocking login
    loadServices().catch(err => console.error(err));

    // Start checking for unread messages
    if (currentUser) {
      checkUnreadMessages();
      // Check every 10 seconds
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

// Update Header / UI with Inbox Button
function updateHeader() {
  const headerAuth = $('headerAuthButtons');
  const freelancerActions = $('freelancerQuickActions');

  if (!headerAuth) return;

  if (currentUser) {
    headerAuth.innerHTML = `
      <span class="welcome-pill">Welcome, ${escapeHtml(currentUser.username)}</span>
      ${userRole === 'admin' ? '<button class="auth-btn" onclick="showAdminDeletedServices()">Admin Dashboard</button>' : ''}
      <button class="auth-btn" onclick="showInbox()">
        📩 Inbox <span id="unreadBadge" class="badge hidden"></span>
      </button>
      <button class="auth-btn" onclick="logout()">Logout</button>
    `;

    // Freelancer UI
    if (userRole === 'freelancer' && freelancerActions) {
      freelancerActions.classList.remove('hidden');
    } else if (freelancerActions) {
      freelancerActions.classList.add('hidden');
    }

  } else {
    headerAuth.innerHTML = `
      <button id="loginOpen" class="auth-btn">Login</button>
      <button id="signupOpen" class="auth-btn signup">Sign Up</button>
    `;

    if (freelancerActions) freelancerActions.classList.add('hidden');

    setTimeout(() => {
      $('loginOpen')?.addEventListener('click', () => openModal($('loginModal')));
      $('signupOpen')?.addEventListener('click', () => openModal($('signupModal')));
    }, 0);
  }
}

// Load all services
async function loadServices() {
  const servicesList = $('servicesList');
  if (!servicesList) return;

  try {
    showLoading('servicesList');

    const response = await fetch('/api/services');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid data: services is not an array');

    services = data;

    console.log("📦 Loaded services:", services.length);
    console.log("🖼️ First service profile picture:", services[0]?.provider_profile_picture);

    // Render services
    filterAndRenderServices();

  } catch (err) {
    console.error('❌ Error loading services:', err);
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

// Load My Services (Freelancer-specific)
async function loadMyServices() {
  const myServicesList = $('myServicesList');
  if (!myServicesList) {
    console.error("❌ myServicesList element not found!");
    return;
  }

  try {
    console.log("🔍 [MY-SERVICES] Starting to load my services...");
    showLoading('myServicesList');

    console.log("📡 [MY-SERVICES] Fetching from /api/services/my-services...");
    const response = await fetch('/api/services/my-services');
    
    console.log("📊 [MY-SERVICES] Response status:", response.status);
    
    if (!response.ok) {
      console.error("❌ [MY-SERVICES] HTTP error:", response.status);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const myServices = await response.json();
    console.log("📦 [MY-SERVICES] Data received:", myServices);
    
    if (!Array.isArray(myServices)) {
      console.error("❌ [MY-SERVICES] Data is not an array:", typeof myServices);
      throw new Error('Invalid data: myServices is not an array');
    }

    console.log(`✅ [MY-SERVICES] Found ${myServices.length} services`);
    
    // Show/hide views
    const providerServicesView = $('providerServicesView');
    const clientServicesView = $('clientServicesView');
    
    console.log("👁️ [MY-SERVICES] Toggling views...");
    if (providerServicesView) {
      providerServicesView.classList.remove('hidden');
      console.log("✅ Showed provider view");
    }
    if (clientServicesView) {
      clientServicesView.classList.add('hidden');
      console.log("✅ Hid client view");
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
      myServicesList.innerHTML = myServices.map(service => {
        const providerName = service.username || 'You';
        const profilePicture = service.profile_picture || service.provider_profile_picture;
        
        // Create provider picture HTML
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
            
            <!-- ADD PROFILE PICTURE SECTION -->
            <div class="service-provider-info">
              ${providerPictureHtml}
              <div>
                <div class="service-provider-name">${escapeHtml(providerName)}</div>
                <div class="service-provider">${escapeHtml(service.category || 'General')}</div>
              </div>
            </div>
            
            <p>${escapeHtml(service.description || 'No description')}</p>
            
            <div class="service-actions" style="display: flex; gap: 10px; margin-top: 15px;">
              <button class="btn btn-primary" onclick="editService(${service.id})">
                <i class="fas fa-edit"></i> Edit
              </button>
              <button class="btn btn-secondary" onclick="viewServiceStats(${service.id})">
                <i class="fas fa-chart-bar"></i> Stats
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    console.log("✅ [MY-SERVICES] Function completed successfully");

  } catch (err) {
    console.error('❌ [MY-SERVICES] Error loading my services:', err);
    
    // Show better error message
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

async function selectRole(role) {
  try {
    const roleOptions = document.querySelectorAll('.role-option');
    roleOptions.forEach(opt => opt.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    
    const response = await fetch('/api/user/set-role', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      alert(data.error || 'Failed to set role');
      roleOptions.forEach(opt => opt.classList.remove('selected'));
      return;
    }
    
    userRole = role;
    if (currentUser) {
      currentUser.role = role;
    }
    
    closeModal($('roleModal'));
    alert(`Welcome as a ${role}! You can change this in your profile settings anytime.`);
    
    updateUIForUserRole();
    
    if (role === 'freelancer') {
      showPricingSection();
    } else {
      showServicesBrowser();
      switchTab('browse');
    }
    
  } catch (error) {
    console.error('Role selection error:', error);
    alert('Failed to set role. Please try again.');
    const roleOptions = document.querySelectorAll('.role-option');
    roleOptions.forEach(opt => opt.classList.remove('selected'));
  }
}

function updateUIForUserRole() {
  const heroDescription = $('heroDescription');
  const findServicesBtn = $('findServicesBtn');
  const offerServiceBtn = $('offerServiceBtn');
  const pricingSection = $('pricingSection');
  const clientTabs = $('clientTabs');
  const providerTabs = $('providerTabs');
  
  if (currentUser) {
    if (userRole === 'freelancer') {
      if (heroDescription) heroDescription.textContent = "Manage your services and connect with clients worldwide.";
      if (findServicesBtn) findServicesBtn.textContent = "Browse Services";
      if (offerServiceBtn) offerServiceBtn.textContent = "Manage My Services";
      if (pricingSection) pricingSection.classList.remove('hidden');
      if (clientTabs) clientTabs.classList.add('hidden');
      if (providerTabs) providerTabs.classList.remove('hidden');
    } else if (userRole === 'client') {
      if (heroDescription) heroDescription.textContent = "Find expert services for your needs.";
      if (findServicesBtn) findServicesBtn.textContent = "Find Services";
      if (offerServiceBtn) offerServiceBtn.textContent = "Offer a Service";
      if (pricingSection) pricingSection.classList.add('hidden');
      if (clientTabs) clientTabs.classList.remove('hidden');
      if (providerTabs) providerTabs.classList.add('hidden');
    } else {
      if (heroDescription) heroDescription.textContent = "Choose how you'd like to use our platform.";
      if (findServicesBtn) findServicesBtn.textContent = "Find Services";
      if (offerServiceBtn) offerServiceBtn.textContent = "Offer a Service";
      if (pricingSection) pricingSection.classList.add('hidden');
      if (clientTabs) clientTabs.classList.add('hidden');
      if (providerTabs) providerTabs.classList.add('hidden');
    }
  } else {
    if (heroDescription) heroDescription.textContent = "Find expert services or offer your skills to clients worldwide.";
    if (findServicesBtn) findServicesBtn.textContent = "Find Services";
    if (offerServiceBtn) offerServiceBtn.textContent = "Offer a Service";
    if (pricingSection) pricingSection.classList.add('hidden');
    if (clientTabs) clientTabs.classList.add('hidden');
    if (providerTabs) providerTabs.classList.add('hidden');
  }
}

// ========== SERVICES FUNCTIONALITY ==========
async function loadCategories() {
  try {
    const response = await fetch('/api/services/categories');
    if (response.ok) {
      categories = await response.json();
      populateCategoryDropdowns();
    }
  } catch (error) {
    console.error('Error loading categories:', error);
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
      service.description.toLowerCase().includes(searchTerm) ||
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
      filteredServices.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'newest':
    default:
      filteredServices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
  }
  
  renderServices(filteredServices);
}

async function loadClientServices() {
  try {
    showLoading('clientServicesList');
    const clientServicesList = $('clientServicesList');
    if (clientServicesList) {
      clientServicesList.innerHTML = `
        <div class="text-center">
          <p>Your previous service providers will appear here after you book services.</p>
        </div>
      `;
    }
    
    if ($('providerServicesView')) $('providerServicesView').classList.add('hidden');
    if ($('clientServicesView')) $('clientServicesView').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading client services:', error);
    const clientServicesList = $('clientServicesList');
    if (clientServicesList) {
      clientServicesList.innerHTML = '<div class="text-error">Failed to load your service providers</div>';
    }
  }
}

async function loadMyClients() {
  try {
    const clientsList = $('clientsList');
    if (clientsList) {
      clientsList.innerHTML = `
        <div class="text-center">
          <p>Your clients will appear here after they book your services.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading clients:', error);
    const clientsList = $('clientsList');
    if (clientsList) {
      clientsList.innerHTML = '<div class="text-error">Failed to load your clients</div>';
    }
  }
}

async function loadSubscriptionStatus() {
  try {
    const response = await fetch('/api/services/subscription/status');
    userSubscription = await response.json();
    
    const subscriptionStatusEl = $('subscriptionStatus');
    if (!subscriptionStatusEl) return;
    
    let statusHtml = '';
    if (userSubscription.onTrial) {
      statusHtml = `
        <div class="text-success">
          <h3>🎉 You're on Free Trial!</h3>
          <p>Your 90-day free trial ends on ${new Date(userSubscription.trialEnds).toLocaleDateString()}</p>
        </div>
      `;
    } else if (userSubscription.hasSubscription) {
      statusHtml = `
        <div class="text-success">
          <h3>✅ Active Subscription</h3>
          <p>Plan: ${userSubscription.planType}</p>
          <p>Next billing: ${new Date(userSubscription.currentPeriodEnds).toLocaleDateString()}</p>
        </div>
      `;
    } else {
      statusHtml = `
        <div class="text-warning">
          <h3>No Active Subscription</h3>
          <p>Subscribe to continue offering services</p>
        </div>
      `;
    }
    
    subscriptionStatusEl.innerHTML = statusHtml;
  } catch (error) {
    console.error('Error loading subscription status:', error);
    const subscriptionStatusEl = $('subscriptionStatus');
    if (subscriptionStatusEl) {
      subscriptionStatusEl.innerHTML = '<div class="text-error">Failed to load subscription status</div>';
    }
  }
}

// ========== UI NAVIGATION ==========
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

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab) tab.classList.add('hidden');
  });
  document.querySelectorAll('.tab').forEach(tab => {
    if (tab) tab.classList.remove('active');
  });
  
  const tabElement = $(tabName + 'Tab');
  if (tabElement) {
    tabElement.classList.remove('hidden');
  }
  
  if (event && event.target) {
    event.target.classList.add('active');
  }
  
  if (tabName === 'browse') {
    loadServices();
  } else if (tabName === 'myServices') {
    if (userRole === 'freelancer') {
      loadMyServices();
    } else {
      loadClientServices();
    }
  } else if (tabName === 'subscription') {
    loadSubscriptionStatus();
  } else if (tabName === 'clients') {
    loadMyClients();
  } else if (tabName === 'profile') {
    showFreelancerProfile();
  }
}

// ========== SERVICE CREATION ==========
function showCreateServiceForm() {
  hideAllPages();
  const createServiceForm = $('createServiceForm');
  if (createServiceForm) {
    createServiceForm.classList.remove('hidden');
  }
}

function hideCreateServiceForm() {
  const createServiceForm = $('createServiceForm');
  if (createServiceForm) {
    createServiceForm.classList.add('hidden');
  }
  showServicesBrowser();
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

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  if ($('findServicesBtn')) {
    $('findServicesBtn').addEventListener('click', () => {
      showServicesBrowser();
      switchTab('browse');
    });
  }
  
  if ($('offerServiceBtn')) {
    $('offerServiceBtn').addEventListener('click', handleOfferServiceClick);
  }
  
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
  
  // Service form submission
  if ($('serviceForm')) {
    $('serviceForm').addEventListener('submit', handleServiceFormSubmit);
  }
  
  // Login form submission
  if ($('loginForm')) {
    $('loginForm').addEventListener('submit', handleLoginSubmit);
  }
  
  // Signup form submission
  if ($('signupForm')) {
    $('signupForm').addEventListener('submit', handleSignupSubmit);
  }
}

function handleOfferServiceClick() {
  if (!currentUser) {
    openModal($('loginModal'));
  } else {
    if (userRole === 'client') {
      openModal($('roleModal'));
    } else if (userRole === 'freelancer') {
      showServicesBrowser();
      switchTab('myServices');
    } else {
      openModal($('roleModal'));
    }
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  if ($('loginMsg')) $('loginMsg').textContent = "";
  
  const useUsername = $('usernameGroup') && $('usernameGroup').style.display !== 'none';
  const payload = { 
    password: $('loginPassword') ? $('loginPassword').value : ''
  };
  
  if (useUsername) {
    payload.username = $('loginUsername') ? $('loginUsername').value : '';
  } else {
    payload.email = $('loginEmail') ? $('loginEmail').value : '';
  }
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) {
      if ($('loginMsg')) {
        $('loginMsg').innerHTML = `<div class="text-error">${escapeHtml(data.error || 'Login failed')}</div>`;
      }
      return;
    }
    
    if ($('loginMsg')) {
      $('loginMsg').innerHTML = `<div class="text-success">✅ ${escapeHtml(data.message || 'Logged in successfully')}</div>`;
    }
    
    setTimeout(async () => {
      closeModal($('loginModal'));
      await checkAuthStatus();
      if ($('loginForm')) $('loginForm').reset();
    }, 1500);
    
  } catch (err) {
    console.error('Login error:', err);
    if ($('loginMsg')) {
      $('loginMsg').innerHTML = `<div class="text-error">Login failed. Please try again.</div>`;
    }
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  if ($('signupMsg')) $('signupMsg').textContent = "";
  
  const username = $('signupUsername') ? $('signupUsername').value.trim() : '';
  const email = $('signupEmail') ? $('signupEmail').value.trim() : '';
  const password = $('signupPassword') ? $('signupPassword').value : '';
  
  if (!username || !email || !password) {
    if ($('signupMsg')) {
      $('signupMsg').innerHTML = `<div class="text-error">All fields are required.</div>`;
    }
    return;
  }
  
  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await res.json();
    if (!res.ok) {
      if ($('signupMsg')) {
        $('signupMsg').innerHTML = `<div class="text-error">${escapeHtml(data.error || 'Signup failed')}</div>`;
      }
      return;
    }
    
    if ($('signupMsg')) {
      $('signupMsg').innerHTML = `<div class="text-success">${escapeHtml(data.message || 'Signup successful! Please check your email to verify your account.')}</div>`;
    }
    
    setTimeout(async () => {
      const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      if (loginRes.ok) {
        await checkAuthStatus();
        closeModal($('signupModal'));
      } else {
        closeModal($('signupModal'));
      }
      
      if ($('signupForm')) $('signupForm').reset();
    }, 2000);
    
  } catch (err) {
    console.error('Signup error:', err);
    if ($('signupMsg')) {
      $('signupMsg').innerHTML = `<div class="text-error">Signup failed. Please try again.</div>`;
    }
  }
}

// ========== SUBSCRIPTION MANAGEMENT ==========
async function subscribe(planType) {
  if (!currentUser) {
    openModal($('loginModal'));
    return;
  }
  
  try {
    const response = await fetch('/api/services/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType })
    });
    
    const data = await response.json();
    if (data.link) {
      window.location.href = data.link;
    } else {
      alert(data.error || 'Subscription failed');
    }
  } catch (error) {
    console.error('Subscription error:', error);
    alert('Subscription failed. Please try again.');
  }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log("🚀 Initializing application...");
  
  try {
    // Initialize modals first
    initModals();
    
    // Check authentication status
    await checkAuthStatus();
    
    // Load categories for dropdowns
    await loadCategories();
    
    // Initialize enhanced category selection
    setupEnhancedCategorySelection();
    
    // Initialize profile section
    initProfileSection();
    
    // Setup message form
    setupMessageForm();
    
    // Set up other event listeners
    setupEventListeners();
    
    console.log("✅ Application initialized completely");
    
  } catch (error) {
    console.error("❌ Application initialization failed:", error);
    // Show basic content even if initialization fails
    const servicesBrowser = $('servicesBrowser');
    if (servicesBrowser) {
      servicesBrowser.classList.remove('hidden');
    }
  }
});

// ========== UTILITY FUNCTIONS ==========
async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    userRole = null;
    updateHeader();
    updateUIForUserRole();
    location.reload();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Helper function to get the selected category from the enhanced form
function getSelectedCategoryFromEnhancedForm() {
  const newCategoryInput = $('newCategory');
  const categorySelect = $('serviceCategory');
  
  // Check which tab is active
  const activeTab = document.querySelector('.category-tab-btn.active');
  const isNewCategoryTab = activeTab && activeTab.getAttribute('data-tab') === 'new';
  
  if (isNewCategoryTab && newCategoryInput && newCategoryInput.value.trim()) {
    return newCategoryInput.value.trim();
  } else if (categorySelect && categorySelect.value) {
    return categorySelect.value;
  }
  
  return null;
}

function updateSelectedCategory(value, displayText) {
  console.log("📝 Updating selected category:", value, displayText);
  
  const display = document.querySelector('.selected-category-display');
  const textElement = $('selectedCategoryText');
  
  if (display && textElement) {
    textElement.textContent = displayText;
    display.classList.remove('hidden');
  }
  
  // Show toast notification
  showToast(`Category selected: ${displayText}`, 'success');
}

// Placeholder functions for future implementation
function editService(serviceId) {
  alert('Edit service: ' + serviceId);
}

function viewServiceStats(serviceId) {
  alert('View stats for service: ' + serviceId);
}

function viewServiceDetails(serviceId) {
  alert('View service details: ' + serviceId);
}

function contactProvider(userId) {
  alert('Contact provider: ' + userId);
}

async function updateServicesWithNewProfilePicture(profilePictureUrl) {
  // This function would update all existing services with the new profile picture
  // Implementation depends on your backend API
  console.log("🔄 Updating services with new profile picture:", profilePictureUrl);
}