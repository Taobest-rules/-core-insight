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
  document.querySelectorAll('.custom-toast').forEach(toast => toast.remove());
  
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
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// ========== PROFILE INITIALIZATION ==========
function initProfileSection() {
  const profileSection = document.getElementById('freelancerProfile');
  if (!profileSection) {
    return;
  }
  
  initProfileEventListeners();
  initCertificateUpload();
}

function initProfileEventListeners() {
  const updatePhotoBtn = $('updatePhotoBtn');
  const profilePictureInput = $('profilePictureInput');
  
  if (updatePhotoBtn && profilePictureInput) {
    updatePhotoBtn.addEventListener('click', () => {
      profilePictureInput.click();
    });
    
    profilePictureInput.addEventListener('change', handleProfilePictureUpload);
  }
  
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
  
  const editProfileBtn = $('editProfileBtn');
  const dashboardActionBtn = $('dashboardBtn');
  const shareProfileBtn = $('shareProfileBtn');
  const exportProfileBtn = $('exportProfileBtn');
  
  if (editProfileBtn) editProfileBtn.addEventListener('click', () => switchProfileTab('profileEditTabContent'));
  if (dashboardActionBtn) dashboardActionBtn.addEventListener('click', () => switchProfileTab('dashboardTabContent'));
  if (shareProfileBtn) shareProfileBtn.addEventListener('click', shareProfile);
  if (exportProfileBtn) exportProfileBtn.addEventListener('click', exportProfile);
  
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
  
  document.querySelectorAll('.common-skill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const skill = e.target.getAttribute('data-skill');
      addSkillToEdit(skill);
    });
  });
  
  const cancelEditBtn = $('cancelEditBtn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      switchProfileTab('profileViewTabContent');
    });
  }
  
  setTimeout(() => {
    const profileForm = $('profileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', handleProfileFormSubmit);
    } else {
      setTimeout(() => {
        const profileFormRetry = $('profileForm');
        if (profileFormRetry) {
          profileFormRetry.addEventListener('submit', handleProfileFormSubmit);
        }
      }, 1000);
    }
  }, 500);
}

async function handleProfileFormSubmit(e) {
  e.preventDefault();
  
  try {
    const getElementValue = (id) => {
      const element = $(id);
      return element ? element.value : '';
    };
    
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
    
    const skillTags = document.querySelectorAll('#skillsList .skill-tag');
    const skills = Array.from(skillTags).map(tag => {
      const text = tag.textContent || '';
      return text.replace('×', '').trim();
    });
    
    if (skills.length > 0) {
      profileUpdateData.skills = JSON.stringify(skills);
    }
    
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
    
    freelancerProfile = { ...freelancerProfile, ...profileUpdateData };
    
    switchProfileTab('profileViewTabContent');
    
    await updateProfileView();
    
    showToast('✅ Profile updated successfully!', 'success');
    
  } catch (error) {
    showToast('❌ Failed to update profile: ' + error.message, 'error');
  } finally {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.innerHTML = originalText || '<i class="fas fa-save"></i> Save Profile Changes';
      submitBtn.disabled = false;
    }
  }
}

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

function addNewSkill() {
  const newSkillInput = $('newSkill');
  if (!newSkillInput) {
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
    return;
  }
  
  const existingSkills = Array.from(skillsList.querySelectorAll('.skill-tag')).map(tag => 
    tag.textContent.replace('×', '').trim()
  );
  
  if (existingSkills.includes(skill)) {
    showToast('Skill already added', 'warning');
    return;
  }
  
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
function switchProfileTab(tabContentId) {
  document.querySelectorAll('.profile-tab-content').forEach(tab => {
    if (tab) tab.classList.add('hidden');
  });
  
  const selectedTab = $(tabContentId);
  if (selectedTab) {
    selectedTab.classList.remove('hidden');
  }
  
  document.querySelectorAll('.nav-tab.enhanced').forEach(tab => {
    if (tab) tab.classList.remove('active');
  });
  
  const activeTabBtn = $(tabContentId.replace('Content', 'Btn'));
  if (activeTabBtn) {
    activeTabBtn.classList.add('active');
  }
  
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
    return;
  }
  
  uploadArea.addEventListener('click', () => fileInput.click());
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  
  fileInput.addEventListener('change', handleCertificateFiles);
  
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
  
  loadExistingCertificates();
}

async function loadExistingCertificates() {
  try {
    const cachedCertificates = localStorage.getItem('user_certificates');
    const cacheTimestamp = localStorage.getItem('certificates_timestamp');
    
    if (cachedCertificates && cacheTimestamp && (Date.now() - parseInt(cacheTimestamp)) < 3600000) {
      try {
        const certificates = JSON.parse(cachedCertificates);
        displayCertificates(certificates);
        updateProfileCertificates(certificates);
        return;
      } catch (e) {
      }
    }
    
    const response = await fetch('/api/freelancer/profile', {
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      const profile = await response.json();
      
      if (profile.certificate_images) {
        let certificates = profile.certificate_images;
        
        if (typeof certificates === 'string') {
          try {
            certificates = JSON.parse(certificates);
          } catch (e) {
            certificates = [];
          }
        }
        
        displayCertificates(certificates);
        
        localStorage.setItem('user_certificates', JSON.stringify(certificates));
        localStorage.setItem('certificates_timestamp', Date.now());
      } else {
        displayCertificates([]);
      }
    }
  } catch (error) {
    displayCertificates([]);
  }
}

function updateProfileCertificates(certificates) {
  const viewCertificatesDiv = $('profileCertificates');
  if (!viewCertificatesDiv) return;
  
  viewCertificatesDiv.innerHTML = '';
  
  if (!certificates || certificates.length === 0) {
    viewCertificatesDiv.innerHTML = '<p style="color: var(--text-gray);">No certificates uploaded yet.</p>';
    return;
  }
  
  certificates.forEach((path, index) => {
    const viewItem = document.createElement('div');
    viewItem.className = 'certificate-item';
    viewItem.innerHTML = `
      <img src="${path}" alt="Certificate ${index + 1}" class="certificate-image">
    `;
    viewCertificatesDiv.appendChild(viewItem);
  });
}

function displayCertificates(certificatePaths) {
  const previewDiv = $('certificatePreview');
  const viewCertificatesDiv = $('profileCertificates');
  
  if (!previewDiv || !viewCertificatesDiv) {
    return;
  }
  
  previewDiv.innerHTML = '';
  viewCertificatesDiv.innerHTML = '';
  
  let certificates = certificatePaths;
  
  if (typeof certificatePaths === 'string') {
    try {
      certificates = JSON.parse(certificatePaths);
    } catch (e) {
      certificates = [];
    }
  }
  
  if (!Array.isArray(certificates) || certificates.length === 0) {
    previewDiv.style.display = 'none';
    viewCertificatesDiv.innerHTML = '<p style="color: var(--text-gray);">No certificates uploaded yet.</p>';
    return;
  }
  
  previewDiv.style.display = 'block';
  
  certificates.forEach((path, index) => {
    const certPath = String(path).trim();
    if (!certPath) return;
    
    const previewItem = document.createElement('div');
    previewItem.className = 'certificate-item';
    previewItem.innerHTML = `
      <img src="${certPath}" alt="Certificate ${index + 1}" class="certificate-image"
           onerror="this.onerror=null; this.src='/placeholder-certificate.png';">
      <button type="button" class="remove-certificate" data-index="${index}" data-path="${certPath}">
        <i class="fas fa-times"></i>
      </button>
    `;
    previewDiv.appendChild(previewItem);
    
    const viewItem = document.createElement('div');
    viewItem.className = 'certificate-item';
    viewItem.innerHTML = `
      <img src="${certPath}" alt="Certificate ${index + 1}" class="certificate-image"
           onerror="this.onerror=null; this.src='/placeholder-certificate.png';">
    `;
    viewCertificatesDiv.appendChild(viewItem);
  });
  
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
      loadExistingCertificates();
    } else {
      throw new Error(result.error || 'Failed to remove certificate');
    }
  } catch (error) {
    showToast('Error removing certificate: ' + error.message, 'error');
  }
}

function handleCertificateFiles() {
  const fileInput = $('certificateImagesInput');
  if (!fileInput) return;
  
  const files = Array.from(fileInput.files);
  
  if (files.length === 0) return;
  
  const validFiles = files.filter(file => {
    const maxSize = 5 * 1024 * 1024;
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
  
  const currentCertificates = getCurrentCertificateCount();
  if (currentCertificates + validFiles.length > 5) {
    showToast('Maximum 5 certificates allowed. Please remove some existing certificates.', 'error');
    return;
  }
  
  uploadCertificates(validFiles);
}

async function uploadCertificates(files) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('certificate_images', file);
  });

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
    
    if (!response.ok) {
      throw new Error(result.error || 'Upload failed');
    }

    if (result.certificate_images) {
      displayCertificates(result.certificate_images);
      
      const viewCertificatesDiv = $('profileCertificates');
      if (viewCertificatesDiv) {
        viewCertificatesDiv.innerHTML = '';
        result.certificate_images.forEach((path, index) => {
          const viewItem = document.createElement('div');
          viewItem.className = 'certificate-item';
          viewItem.innerHTML = `
            <img src="${path}" alt="Certificate ${index + 1}" class="certificate-image">
          `;
          viewCertificatesDiv.appendChild(viewItem);
        });
      }
    }
    
    showToast('✅ Certificates uploaded successfully!', 'success');
    
    if (result.certificate_images) {
      localStorage.setItem('user_certificates', JSON.stringify(result.certificate_images));
      localStorage.setItem('certificates_timestamp', Date.now());
    }
    
  } catch (error) {
    showToast('❌ Error uploading certificates: ' + error.message, 'error');
  } finally {
    if (progressDiv) {
      progressDiv.style.display = 'none';
    }
  }
}

// ========== FREELANCER DELETE WORK ==========
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
    const confirmBtn = $('confirmFreelancerDeleteBtn');
    if (!confirmBtn) {
      showToast('Confirm button not found', 'error');
      return;
    }
    
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    confirmBtn.disabled = true;
    
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
    
    const responseText = await response.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Server returned: ${responseText.substring(0, 100)}`);
    }
    
    if (!response.ok) {
      if (data.limit_exceeded) {
        showToast(`❌ ${data.error}`, 'error');
        closeFreelancerDeleteModal();
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
    
    setTimeout(() => {
      loadServices();
      if (userRole === 'freelancer') {
        loadMyServices();
      }
    }, 1000);
    
  } catch (error) {
    let userMessage = error.message;
    if (error.message.includes('Cannot read properties of undefined')) {
      userMessage = 'Server configuration error. Please contact support.';
    } else if (error.message.includes('Failed to fetch')) {
      userMessage = 'Network error. Check your connection.';
    }
    
    showToast(`❌ ${userMessage}`, 'error');
    
    const confirmBtn = $('confirmFreelancerDeleteBtn');
    if (confirmBtn) {
      confirmBtn.innerHTML = originalText || '<i class="fas fa-trash"></i> Delete Service';
      confirmBtn.disabled = false;
    }
  }
}

function closeFreelancerDeleteModal() {
  const modal = $('freelancerDeleteModal');
  if (modal) modal.remove();
}

// ========== ENHANCED CATEGORY SELECTION ==========
function setupEnhancedCategorySelection() {
  document.querySelectorAll('.category-tab-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const tabId = this.getAttribute('data-tab');
      
      document.querySelectorAll('.category-tab-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      const targetPane = document.getElementById(tabId + '-category-tab');
      if (targetPane) targetPane.classList.add('active');
    });
  });
  
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', function() {
      const category = this.getAttribute('data-value');
      const categorySelect = $('serviceCategory');
      
      if (categorySelect) {
        categorySelect.value = category;
        
        const selectedCategoryText = this.querySelector('div:last-child').textContent;
        updateSelectedCategory(category, selectedCategoryText);
        
        const existingTab = document.querySelector('.category-tab-btn[data-tab="existing"]');
        if (existingTab) existingTab.click();
      }
    });
  });
  
  const newCategoryInput = $('newCategory');
  if (newCategoryInput) {
    newCategoryInput.addEventListener('input', function() {
      const charCount = this.parentElement.querySelector('.char-count');
      if (charCount) {
        charCount.textContent = `${this.value.length}/50`;
      }
    });
    
    newCategoryInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const categoryName = this.value.trim();
        if (categoryName) {
          updateSelectedCategory(categoryName, categoryName);
        }
      }
    });
  }
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
    
    const newCategoryInput = $('newCategory');
    if (newCategoryInput) {
      newCategoryInput.value = categoryName;
    }
    
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
  if ($('loginOpen')) {
    $('loginOpen').addEventListener('click', () => openModal($('loginModal')));
  }
  
  if ($('signupOpen')) {
    $('signupOpen').addEventListener('click', () => openModal($('signupModal')));
  }
  
  if ($('closeLogin')) {
    $('closeLogin').addEventListener('click', () => closeModal($('loginModal')));
  }
  
  if ($('closeSignup')) {
    $('closeSignup').addEventListener('click', () => closeModal($('signupModal')));
  }
  
  window.addEventListener('click', (e) => {
    if (e.target === $('loginModal')) closeModal($('loginModal'));
    if (e.target === $('signupModal')) closeModal($('signupModal'));
    if (e.target === $('roleModal')) closeModal($('roleModal'));
    if (e.target === $('freelancerProfileModal')) closeModal($('freelancerProfileModal'));
  });
  
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
    if (!currentUser) {
      alert("Please log in to start a chat.");
      openModal($('loginModal'));
      return;
    }

    if (!freelancerId) {
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

    if (!data.conversationId) {
      alert("Failed to start chat: No conversation ID returned");
      return;
    }

    if (typeof openConversation === 'function') {
      openConversation(data.conversationId);
    } else if (typeof loadMessages === 'function') {
      loadMessages(data.conversationId);
    } else {
      alert("Chat started but cannot display messages");
    }

    return data.conversationId;

  } catch (err) {
    alert("Chat failed to start");
  }
}

async function openFreelancerProfile(userId) {
  try {
    const modal = $('freelancerProfileModal');
    if (!modal) {
      showToast("Profile modal not found", "error");
      return;
    }
    
    const container = $("freelancerProfileContent");
    if (!container) {
      return;
    }
    
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="margin-bottom: 20px;">
          <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent-blue);"></i>
        </div>
        <h3 style="color: var(--text-light);">Loading Profile...</h3>
        <p style="color: var(--text-gray);">Please wait while we load the freelancer's profile.</p>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modal.offsetHeight;

    const res = await fetch(`/api/users/${userId}/profile`, {
      credentials: 'include'
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to load profile (${res.status})`);
    }

    const data = await res.json();

    let certificates = [];
    try {
      const certRes = await fetch(`/api/users/${userId}/certificates`, {
        credentials: 'include'
      });
      if (certRes.ok) {
        const certData = await certRes.json();
        certificates = certData.certificate_images || [];
      }
    } catch (certError) {
    }

    const profileHtml = `
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="width: 100px; height: 100px; border-radius: 50%; overflow: hidden; margin: 0 auto 20px; border: 3px solid var(--accent-gold); background: var(--gradient-primary);">
          ${data.profile_picture ? 
            `<img src="${data.profile_picture}" alt="${data.username}" 
                 style="width: 100%; height: 100%; object-fit: cover;"
                 onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; color: white;\\'>${data.username?.charAt(0)?.toUpperCase() || 'U'}</div>';">` : 
            `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; color: white;">
              ${data.username?.charAt(0)?.toUpperCase() || 'U'}
            </div>`
          }
        </div>
        
        <h2 style="color: var(--accent-gold); margin-bottom: 10px;">${escapeHtml(data.username || 'User')}</h2>
        <p style="color: var(--text-light); font-size: 1.1rem; margin-bottom: 5px; font-weight: 500;">
          ${escapeHtml(data.headline || 'Freelancer')}
        </p>
        
        <div style="margin-bottom: 20px;">
          <div style="color: var(--accent-gold); font-size: 1.2rem; margin-bottom: 5px;">
            ${generateStars(data.avg_rating || 0)}
          </div>
          <p style="color: var(--text-gray); font-size: 0.9rem;">
            ${data.avg_rating?.toFixed(1) || '0.0'} rating (${data.review_count || 0} reviews)
          </p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px;">
        <div style="background: var(--secondary-dark); padding: 15px; border-radius: 12px; text-align: center;">
          <div style="color: var(--accent-gold); font-size: 1.2rem; font-weight: bold; margin-bottom: 5px;">${data.service_count || 0}</div>
          <div style="color: var(--text-gray); font-size: 0.9rem;">Services</div>
        </div>
        
        <div style="background: var(--secondary-dark); padding: 15px; border-radius: 12px; text-align: center;">
          <div style="color: var(--accent-gold); font-size: 1.2rem; font-weight: bold; margin-bottom: 5px;">$${data.hourly_rate || '0'}/hr</div>
          <div style="color: var(--text-gray); font-size: 0.9rem;">Hourly Rate</div>
        </div>
      </div>

      <div style="margin-bottom: 25px;">
        <h4 style="color: var(--accent-gold); margin-bottom: 15px; display: flex; align-items: center;">
          <i class="fas fa-user-circle" style="margin-right: 10px;"></i> About Me
        </h4>
        <div style="background: var(--secondary-dark); padding: 20px; border-radius: 12px; border-left: 4px solid var(--accent-gold);">
          <p style="color: var(--text-light); line-height: 1.6; margin: 0;">
            ${escapeHtml(data.description || 'No description provided.')}
          </p>
        </div>
      </div>

      ${data.skills && data.skills.length > 0 ? `
        <div style="margin-bottom: 25px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 15px; display: flex; align-items: center;">
            <i class="fas fa-tools" style="margin-right: 10px;"></i> Skills
          </h4>
          <div style="display: flex; flex-wrap: wrap; gap: 10px;">
            ${data.skills.map(skill => `
              <span style="background: rgba(251, 191, 36, 0.1); color: var(--accent-gold); padding: 8px 15px; border-radius: 20px; font-size: 0.9rem; border: 1px solid rgba(251, 191, 36, 0.3);">
                ${escapeHtml(skill)}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${certificates.length > 0 ? `
        <div style="margin-bottom: 25px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 15px; display: flex; align-items: center;">
            <i class="fas fa-award" style="margin-right: 10px;"></i> Certificates (${certificates.length})
          </h4>
          <div style="background: var(--secondary-dark); padding: 20px; border-radius: 12px;">
            <div id="certificateGallery" class="certificate-gallery" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px;">
              ${certificates.map((cert, index) => `
                <div class="certificate-item" style="position: relative; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid rgba(255,255,255,0.1);">
                  <img src="${cert}" alt="Certificate ${index + 1}" 
                       style="width: 100%; height: 120px; object-fit: cover;"
                       onclick="openCertificateViewer('${cert}', ${index})">
                  <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 5px; font-size: 0.8rem; text-align: center;">
                    Certificate ${index + 1}
                  </div>
                  <button onclick="viewCertificateFull('${cert}', event)" 
                          style="position: absolute; top: 5px; right: 5px; background: rgba(59, 130, 246, 0.8); color: white; border: none; border-radius: 50%; width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.8rem;">
                    <i class="fas fa-expand"></i>
                  </button>
                </div>
              `).join('')}
            </div>
            <p style="color: var(--text-gray); font-size: 0.9rem; margin-top: 10px; text-align: center;">
              Click on any certificate to view it full screen
            </p>
          </div>
        </div>
      ` : ''}

      ${data.location || data.experience_level ? `
        <div style="margin-bottom: 25px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 15px; display: flex; align-items: center;">
            <i class="fas fa-info-circle" style="margin-right: 10px;"></i> Details
          </h4>
          <div style="background: var(--secondary-dark); padding: 20px; border-radius: 12px;">
            ${data.location ? `
              <div style="color: var(--text-light); margin-bottom: 10px; display: flex; align-items: center;">
                <i class="fas fa-map-marker-alt" style="color: var(--accent-gold); margin-right: 10px; width: 20px;"></i>
                <span>${escapeHtml(data.location)}</span>
              </div>
            ` : ''}
            ${data.experience_level ? `
              <div style="color: var(--text-light); margin-bottom: 10px; display: flex; align-items: center;">
                <i class="fas fa-chart-line" style="color: var(--accent-gold); margin-right: 10px; width: 20px;"></i>
                <span>${data.experience_level.charAt(0).toUpperCase() + data.experience_level.slice(1)} Level</span>
              </div>
            ` : ''}
            ${data.availability ? `
              <div style="color: var(--text-light); display: flex; align-items: center;">
                <i class="fas fa-clock" style="color: var(--accent-gold); margin-right: 10px; width: 20px;"></i>
                <span>${data.availability === 'available' ? 'Available Now' : 
                        data.availability === 'busy' ? 'Currently Busy' : 
                        'Not Available'}</span>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <div style="display: flex; gap: 15px; margin-top: 30px;">
        <button onclick="startConversationWithFreelancer(${userId}, '${escapeHtml(data.username || 'User')}')" 
                class="btn btn-primary" style="flex: 1; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <i class="fas fa-comments"></i> Message
        </button>
        <button onclick="closeModal($('freelancerProfileModal'))" 
                class="btn btn-secondary" style="flex: 1; padding: 12px;">
          Close
        </button>
      </div>
    `;

    const certificateModalHtml = `
      <div id="certificateViewerModal" class="modal hidden">
        <div class="modal-card" style="max-width: 90%; max-height: 90vh; width: 90%;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: var(--text-light);">Certificate Viewer</h3>
            <div style="display: flex; gap: 10px; align-items: center;">
              <button id="zoomInBtn" style="background: var(--accent-blue); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 1.2rem;">
                <i class="fas fa-search-plus"></i>
              </button>
              <button id="zoomOutBtn" style="background: var(--accent-blue); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 1.2rem;">
                <i class="fas fa-search-minus"></i>
              </button>
              <button id="resetZoomBtn" style="background: var(--accent-blue); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 1rem;">
                <i class="fas fa-sync-alt"></i>
              </button>
              <span class="close-x" onclick="closeCertificateViewer()" style="font-size: 2rem;">&times;</span>
            </div>
          </div>
          <div id="certificateContainer" style="overflow: auto; max-height: 70vh; text-align: center;">
            <img id="certificateImage" src="" alt="Certificate" 
                 style="max-width: 100%; max-height: 100%; transition: transform 0.3s ease;">
          </div>
          <div style="display: flex; justify-content: center; margin-top: 15px;">
            <button onclick="downloadCertificate()" class="btn btn-primary" style="padding: 10px 20px;">
              <i class="fas fa-download"></i> Download
            </button>
          </div>
        </div>
      </div>
    `;

    if (!document.getElementById('certificateViewerModal')) {
      document.body.insertAdjacentHTML('beforeend', certificateModalHtml);
    }

    container.innerHTML = profileHtml;
    
  } catch (err) {
    const container = $("freelancerProfileContent");
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
          <div style="margin-bottom: 20px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ef4444;"></i>
          </div>
          <h3 style="color: var(--text-light); margin-bottom: 10px;">Failed to Load Profile</h3>
          <p style="color: var(--text-gray); margin-bottom: 20px;">
            ${err.message || 'Unable to load the freelancer profile.'}
          </p>
          <button onclick="closeModal($('freelancerProfileModal'))" class="btn btn-secondary">
            Close
          </button>
        </div>
      `;
    }
    
    const modal = $('freelancerProfileModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.classList.add('open');
    }
  }
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

    const timestamp = Date.now();
    
    const res = await fetch("/api/messages/start", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        serviceId: serviceId,
        freelancerId: freelancerId,
        timestamp: timestamp
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Failed to start conversation", "error");
      return;
    }

    if (!data.conversationId) {
      showToast("Failed to get conversation ID from server", "error");
      return;
    }

    window.activeConversationId = data.conversationId;
    window.activeConversationUserId = freelancerId;
    
    showToast(data.message || "✅ Conversation started!", "success");

    showInboxAndOpenConversation(data.conversationId, freelancerId);

  } catch (err) {
    showToast("Failed to start conversation. Please try again.", "error");
  }
}

async function forceNewConversation(serviceId, freelancerId) {
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

function showInboxAndOpenConversation(conversationId, freelancerId) {
  hideAllPages();
  
  const inboxPage = $('inboxPage');
  if (inboxPage) {
    inboxPage.classList.remove('hidden');
  }
  
  window.activeConversationId = conversationId;
  window.activeConversationUserId = freelancerId;
  
  setupMessageForm();
  
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
  
  setTimeout(async () => {
    try {
      await loadConversations();
      
      setTimeout(() => {
        const conversationItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (conversationItem) {
          document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
          });
          conversationItem.classList.add('active');
          
          const username = conversationItem.querySelector('.conversation-user')?.textContent || 'User';
          openConversation(conversationId, username);
        } else {
          openConversation(conversationId, 'Freelancer');
        }
      }, 500);
      
    } catch (error) {
      showToast("Could not load conversation. Please try again.", "error");
    }
  }, 100);
}

async function openConversation(conversationId, username = 'User') {
  try {
    if (!conversationId || isNaN(conversationId)) {
      showToast('Invalid conversation ID', 'error');
      return;
    }
    
    window.activeConversationId = parseInt(conversationId);
    
    const response = await fetch(`/api/conversation-info/${conversationId}`, {
      credentials: "include"
    });
    
    if (!response.ok) {
      throw new Error("Failed to get conversation info");
    }
    
    const convInfo = await response.json();
    window.activeConversationUserId = convInfo.other_user_id;
    
    $('chatUserName').textContent = username || 'User';
    $('messageInputArea').style.display = 'block';
    
    const messageInput = $('messageInput');
    if (messageInput) {
      messageInput.value = '';
      messageInput.focus();
      messageInput.addEventListener('input', updateCharCount);
    }
    
    await loadMessagesForConversation(conversationId);
    
  } catch (error) {
    showToast('Failed to open conversation', 'error');
  }
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

function updateCharCount() {
  const input = $('messageInput');
  const charCount = $('charCount');
  if (input && charCount) {
    const count = input.value.length;
    charCount.textContent = `${count}/1000`;
    charCount.style.color = count > 900 ? '#ff4444' : 'var(--text-gray)';
  }
}

function toggleEmojiPicker() {
  const picker = $('emojiPicker');
  if (!picker) {
    createEmojiPicker();
    return;
  }
  
  picker.classList.toggle('show');
}

function createEmojiPicker() {
  const emojiPicker = document.createElement('div');
  emojiPicker.id = 'emojiPicker';
  emojiPicker.className = 'emoji-picker';
  
  const emojis = ['😀', '😂', '😊', '😍', '👍', '👏', '🎉', '🔥', '💯', '❤️', '🤔', '😎'];
  
  emojiPicker.innerHTML = `
    <div class="emoji-picker-grid">
      ${emojis.map(emoji => `
        <div class="emoji-item" onclick="addEmoji('${emoji}')">${emoji}</div>
      `).join('')}
    </div>
  `;
  
  const messageInput = $('messageInput');
  if (messageInput) {
    messageInput.parentElement.appendChild(emojiPicker);
  }
}

function addEmoji(emoji) {
  const input = $('messageInput');
  if (input) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
    updateCharCount();
  }
  
  const picker = $('emojiPicker');
  if (picker) {
    picker.classList.remove('show');
  }
}

function attachFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.pdf,.doc,.docx';
  input.onchange = function(e) {
    if (e.target.files.length > 0) {
      showToast('File attached: ' + e.target.files[0].name, 'info');
    }
  };
  input.click();
}

function recordAudio() {
  showToast('Audio recording feature coming soon!', 'info');
}

async function getOtherUserIdFromConversation(conversationId) {
  try {
    if (!currentUser || !conversationId) return null;
    
    const response = await fetch(`/api/conversation-info/${conversationId}`, {
      credentials: "include"
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.other_user_id;
    
  } catch (error) {
    return null;
  }
}

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
    
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
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
  }
}

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
    const badge = $("unreadBadge");
    
    if (!badge) return;

    if (data.count > 0) {
      badge.textContent = data.count;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch (err) {
  }
}

async function testMessageSending() {
  if (window.activeConversationId && window.activeConversationUserId) {
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
      
      if (testRes.ok) {
        alert("✅ Test message sent! Check console for details.");
      } else {
        alert("❌ Test failed: " + (testData.error || "Unknown error"));
      }
    } catch (error) {
      alert("❌ Test error: " + error.message);
    }
  } else {
    alert("⚠️ Please open a conversation first");
  }
}

async function debugConversationAccess(conversationId = window.activeConversationId) {
  if (!currentUser) {
    return;
  }
  
  if (!conversationId) {
    return;
  }
  
  try {
    const response = await fetch(`/api/messages/${conversationId}`, {
      credentials: "include"
    });
    
    if (response.ok) {
      const messages = await response.json();
    } else {
      const errorText = await response.text();
    }
    
  } catch (error) {
  }
}

function showCategorySpecificFields(category) {
    const categoryFieldsDiv = $('categorySpecificFields');
    if (!categoryFieldsDiv) {
        const form = $('serviceForm');
        const afterCategory = document.querySelector('.form-group:nth-child(3)');
        if (afterCategory) {
            afterCategory.insertAdjacentHTML('afterend', 
                '<div id="categorySpecificFields"></div>');
        }
    }
    
    let html = '';
    
    switch(category) {
        case 'web-design':
        case 'development':
            html = `
                <div class="form-group">
                    <label>Coding Languages</label>
                    <div class="skills-input-container">
                        <input type="text" id="codingLanguages" placeholder="e.g., HTML, CSS, JavaScript, PHP" class="form-input-enhanced">
                        <div class="skill-tags-container" id="codingLanguagesTags"></div>
                    </div>
                    <small>Add languages separated by commas</small>
                </div>
                <div class="form-group">
                    <label>Frameworks & Libraries</label>
                    <input type="text" id="frameworks" placeholder="e.g., React, Vue.js, Bootstrap" class="form-input-enhanced">
                </div>
            `;
            break;
            
        case 'graphic-design':
            html = `
                <div class="form-group">
                    <label>Design Software Proficiency</label>
                    <div class="skills-input-container">
                        <input type="text" id="designSoftware" placeholder="e.g., Adobe Photoshop, Illustrator, Canva" class="form-input-enhanced">
                        <div class="skill-tags-container" id="designSoftwareTags"></div>
                    </div>
                    <small>List the design software you're proficient with</small>
                </div>
                <div class="form-group">
                    <label>Design Specialties</label>
                    <input type="text" id="designSpecialties" placeholder="e.g., Logo Design, Branding, UI/UX" class="form-input-enhanced">
                </div>
            `;
            break;
            
        default:
            html = '';
    }
    
    $('categorySpecificFields').innerHTML = html;
    
    $('categorySpecificFields').insertAdjacentHTML('beforeend', `
        <div class="form-group">
            <label>Delivery Time (Days)</label>
            <input type="number" id="deliveryDays" min="1" max="365" placeholder="e.g., 7" class="form-input-enhanced" required>
        </div>
        
        <div class="form-group">
            <label>Service Package Options</label>
            <div class="package-options">
                <div class="package-option">
                    <input type="radio" id="packageBasic" name="servicePackage" value="basic" checked>
                    <label for="packageBasic">
                        <div class="package-header">Basic</div>
                        <div class="package-price">$${$('fixedPrice').value || '0'}</div>
                        <div class="package-desc">Standard service delivery</div>
                    </label>
                </div>
                <div class="package-option">
                    <input type="radio" id="packageStandard" name="servicePackage" value="standard">
                    <label for="packageStandard">
                        <div class="package-header">Standard</div>
                        <div class="package-price">$${($('fixedPrice').value * 1.5 || 0).toFixed(2)}</div>
                        <div class="package-desc">+ Faster delivery + 2 revisions</div>
                    </label>
                </div>
                <div class="package-option">
                    <input type="radio" id="packagePremium" name="servicePackage" value="premium">
                    <label for="packagePremium">
                        <div class="package-header">Premium</div>
                        <div class="package-price">$${($('fixedPrice').value * 2 || 0).toFixed(2)}</div>
                        <div class="package-desc">+ Priority support + Unlimited revisions</div>
                    </label>
                </div>
            </div>
        </div>
        
        <div class="form-group">
            <label>Extra Fees (Optional)</label>
            <div id="extraFeesContainer">
                <div class="extra-fee-item">
                    <input type="text" placeholder="Fee description" class="extra-fee-desc">
                    <input type="number" placeholder="Amount" min="0" step="0.01" class="extra-fee-amount">
                    <button type="button" class="btn btn-secondary remove-extra-fee">Remove</button>
                </div>
            </div>
            <button type="button" id="addExtraFee" class="btn btn-secondary">+ Add Extra Fee</button>
        </div>
    `);
    
    $('addExtraFee').addEventListener('click', addExtraFee);
    
    $('fixedPrice').addEventListener('input', updatePackagePrices);
}

function updatePackagePrices() {
    const basePrice = parseFloat($('fixedPrice').value) || 0;
    document.querySelectorAll('.package-option .package-price').forEach((el, index) => {
        let multiplier = 1;
        if (index === 1) multiplier = 1.5;
        if (index === 2) multiplier = 2;
        el.textContent = '$' + (basePrice * multiplier).toFixed(2);
    });
}

function addExtraFee() {
    const container = $('extraFeesContainer');
    const feeItem = document.createElement('div');
    feeItem.className = 'extra-fee-item';
    feeItem.innerHTML = `
        <input type="text" placeholder="Fee description" class="extra-fee-desc">
        <input type="number" placeholder="Amount" min="0" step="0.01" class="extra-fee-amount">
        <button type="button" class="btn btn-secondary remove-extra-fee">Remove</button>
    `;
    container.appendChild(feeItem);
    
    feeItem.querySelector('.remove-extra-fee').addEventListener('click', function() {
        feeItem.remove();
    });
}

// ========== PAGE NAVIGATION FUNCTIONS ==========
function showInbox() {
  hideAllPages();
  const inboxPage = $('inboxPage');
  if (inboxPage) {
    inboxPage.classList.remove('hidden');
    
    setupMessageForm();
    
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

async function debugConversationIssue() {
  try {
    const debugRes = await fetch('/api/debug/conversation/1', {
      credentials: "include"
    });
    const debugData = await debugRes.json();
    
    if (debugData.conversation) {
      const isClient = parseInt(debugData.conversation.client_id) === parseInt(currentUser?.id);
      const isFreelancer = parseInt(debugData.conversation.freelancer_id) === parseInt(currentUser?.id);
    }
  } catch (error) {
  }
  
  try {
    const convRes = await fetch('/api/messages/conversations', {
      credentials: "include"
    });
    const conversations = await convRes.json();
  } catch (error) {
  }
}

// ========== INBOX FUNCTIONALITY ==========
async function loadConversations() {
  try {
    const response = await fetch("/api/messages/conversations", {
      credentials: "include"
    });
    
    const conversations = await response.json();
    const list = $("conversationList");
    if (!list) {
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
      if (!conversation.conversation_id) {
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
        document.querySelectorAll('.conversation-item').forEach(item => {
          item.classList.remove('active');
        });
        div.classList.add('active');
        openConversation(conversation.conversation_id, conversation.other_user_name);
      });
      
      list.appendChild(div);
    });
    
  } catch (error) {
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

function setupMessageForm() {
  const form = $('sendMessageForm');
  if (!form) {
    return;
  }
  
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  
  const messageInput = $('messageInput');
  const submitBtn = newForm.querySelector('button[type="submit"]');
  
  if (!messageInput || !submitBtn) {
    return;
  }
  
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
    
    if (!currentUser) {
      showToast('Please login to send messages', 'warning');
      openModal($('loginModal'));
      return;
    }
    
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
      
      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 403) {
          showToast('Access denied. You may not have permission to send to this conversation.', 'error');
          
          window.activeConversationId = null;
          window.activeConversationUserId = null;
          
          await loadConversations();
        } else {
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to send message`);
        }
        return;
      }
      
      const data = await response.json();
      
      messageInput.value = '';
      
      if (window.activeConversationId) {
        await openConversation(window.activeConversationId);
      }
      
      showToast('✅ Message sent!', 'success');
      
    } catch (error) {
      showToast('Failed to send message: ' + error.message, 'error');
    } finally {
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
      submitBtn.disabled = false;
    }
  });
  
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

  const finalCategory = getSelectedCategoryFromEnhancedForm();

  if (!finalCategory) {
    alert('❌ Please either select an existing category or enter a new one');
    return;
  }

  let providerProfilePicture = null;

  if (freelancerProfile && freelancerProfile.profile_picture) {
    providerProfilePicture = freelancerProfile.profile_picture;
  } else {
    const cachedPicture = localStorage.getItem('profile_picture_url');
    if (cachedPicture) providerProfilePicture = cachedPicture;
  }

  const serviceData = {
    title: $("serviceTitle").value.trim(),
    description: $("serviceDescription").value.trim(),
    category: finalCategory,
    hourly_rate: $("hourlyRate").value || null,
    fixed_price: $("fixedPrice").value || null,
    provider_profile_picture: providerProfilePicture
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  submitBtn.disabled = true;

  try {
    const response = await fetch('/api/services', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(serviceData)
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Failed to create service');
      return;
    }

    alert('🎉 Service created successfully!');

    $("serviceForm").reset();
    hideCreateServiceForm();

    await loadCategories();
    if (userRole === 'freelancer') await loadMyServices();
    await loadServices();

  } catch (error) {
    alert("Failed to create service. Please try again.");
  }

  submitBtn.innerHTML = originalText;
  submitBtn.disabled = false;
}

// ========== UPDATED RENDER SERVICES FUNCTION WITH CHAT AND PROFILE BUTTONS ==========
function renderServices(servicesToRender) {
  const container = $('servicesList');
  const noServices = $('noServices');

  if (!container) {
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

    let serviceCardHTML = `
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
        </div>`;

    if (currentUser && (currentUser.role === 'client' || currentUser.role === 'business')) {
      serviceCardHTML += addRecruitButton(serviceCardHTML, serviceId, userId);
    } else {
      serviceCardHTML += `
        <div class="service-actions">
          <button class="btn chat-btn" onclick="startConversationWithService(${serviceId}, ${userId})">
            <i class="fas fa-comments"></i> Chat
          </button>
          <button class="btn profile-btn" onclick="openFreelancerProfile(${userId})">
            <i class="fas fa-user"></i> View Profile
          </button>
        </div>`;
    }

    serviceCardHTML += `
        <button class="btn btn-primary" onclick="viewServiceDetailsModal(${serviceId})">
          <i class="fas fa-info-circle"></i> View Details
        </button>`;

    if (currentUser?.role === 'admin') {
      serviceCardHTML += `
        <button class="btn btn-danger"
          onclick="confirmDeleteService(${serviceId}, '${escapeHtml(title)}', ${userId}, false)">
          <i class="fas fa-trash"></i> Admin Delete
        </button>`;
    }

    if (currentUser?.id === userId) {
      serviceCardHTML += `
        <button class="btn btn-warning"
          onclick="confirmDeleteService(${serviceId}, '${escapeHtml(title)}', ${userId}, true)">
          <i class="fas fa-trash"></i> Delete My Service
        </button>`;
    }

    serviceCardHTML += `
      </div>`;

    return serviceCardHTML;
  }).join('');
}

function addRecruitButton(serviceCardHTML, serviceId, freelancerId) {
  return `
    <div class="service-actions">
      <button class="btn chat-btn" onclick="startConversationWithService(${serviceId}, ${freelancerId})">
        <i class="fas fa-comments"></i> Chat
      </button>
      <button class="btn profile-btn" onclick="openFreelancerProfile(${freelancerId})">
        <i class="fas fa-user"></i> View Profile
      </button>
      <button class="btn recruit-btn" onclick="recruitFreelancer(${freelancerId}, ${serviceId})">
        <i class="fas fa-user-plus"></i> Recruit
      </button>
    </div>`;
}

async function recruitFreelancer(freelancerId, serviceId) {
  if (!currentUser) {
    showToast('Please login to recruit freelancers', 'warning');
    openModal($('loginModal'));
    return;
  }
  
  try {
    const response = await fetch('/api/freelancer/recruit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        freelancerId: freelancerId,
        serviceId: serviceId
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showToast('✅ Freelancer added to your providers list!', 'success');
      addToMyProviders(freelancerId, serviceId);
    } else {
      showToast(data.error || 'Failed to recruit freelancer', 'error');
    }
  } catch (error) {
    showToast('Failed to recruit freelancer', 'error');
  }
}

async function addToMyProviders(freelancerId, serviceId) {
  const response = await fetch(`/api/users/${freelancerId}/profile`);
  const freelancer = await response.json();
  
  const providersList = $('clientServicesList');
  if (providersList) {
    const providerCard = `
      <div class="service-card">
        <div class="service-provider-info">
          <div class="profile-picture-wrapper">
            ${freelancer.profile_picture ? 
              `<img src="${freelancer.profile_picture}" alt="${freelancer.username}" class="provider-profile-picture">` :
              `<div class="provider-initials">${freelancer.username.charAt(0).toUpperCase()}</div>`
            }
          </div>
          <div>
            <div class="service-provider-name">${freelancer.username}</div>
            <div class="service-rating">
              <span class="stars">${generateStars(freelancer.avg_rating || 0)}</span>
              <span class="rating-count">(${freelancer.review_count || 0})</span>
            </div>
          </div>
        </div>
        <div class="provider-actions">
          <button class="btn btn-primary" onclick="startConversationWithService(${serviceId}, ${freelancerId})">
            Message Again
          </button>
          <button class="btn btn-secondary" onclick="viewFreelancerServices(${freelancerId})">
            View Services
          </button>
        </div>
      </div>`;
    
    providersList.insertAdjacentHTML('beforeend', providerCard);
  }
}

// ========== ADMIN DELETE SERVICE FUNCTIONS ==========
function confirmDeleteService(serviceId, serviceTitle, userId, isOwner = false) {
  const isAdmin = currentUser && currentUser.role === 'admin';
  const isOwnerDelete = isOwner || (currentUser && currentUser.id === userId);
  
  if (isAdmin) {
    createAdminDeleteModal(serviceId, serviceTitle, userId);
  } else if (isOwnerDelete) {
    createFreelancerDeleteModal(serviceId, serviceTitle, userId);
  } else {
    showToast('You can only delete your own services', 'error');
  }
}

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
  
  const deleteReason = $('deleteReason');
  const confirmBtn = $('confirmDeleteBtn');
  
  deleteReason.addEventListener('input', function() {
    const hasReason = this.value.trim().length > 10;
    confirmBtn.disabled = !hasReason;
    confirmBtn.style.opacity = hasReason ? '1' : '0.5';
  });
}

function createFreelancerDeleteModal(serviceId, serviceTitle, userId) {
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
    showToast('Error checking delete limits', 'error');
  });
}

async function checkRemainingDeletes() {
  try {
    const response = await fetch('/api/user/delete-limits', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.remaining_deletes || 0;
    }
    
    return 3;
  } catch (error) {
    return 3;
  }
}

async function deleteService(serviceId, userId) {
  const deleteReason = $('deleteReason').value.trim();
  
  if (!deleteReason || deleteReason.length < 10) {
    showToast('Please provide a detailed reason for deletion (at least 10 characters).', 'error');
    return;
  }
  
  try {
    const confirmDeleteBtn = $('confirmDeleteBtn');
    const originalText = confirmDeleteBtn.innerHTML;
    confirmDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    confirmDeleteBtn.disabled = true;
    
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
    
    const responseText = await response.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Server returned invalid JSON: ${responseText.substring(0, 100)}...`);
    }
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Failed to delete service`);
    }
    
    showToast('✅ Service deleted successfully!', 'success');
    closeAdminDeleteModal();
    
    setTimeout(() => {
      loadServices();
    }, 1000);
    
  } catch (error) {
    let userMessage = error.message;
    if (error.message.includes('Cannot read properties of undefined')) {
      userMessage = 'Server error: Could not process the service data.';
    } else if (error.message.includes('Failed to fetch')) {
      userMessage = 'Network error. Please check your connection.';
    } else if (error.message.includes('500')) {
      userMessage = 'Server error. Please try again later.';
    }
    
    showToast(`❌ ${userMessage}`, 'error');
    
    const confirmDeleteBtn = $('confirmDeleteBtn');
    if (confirmDeleteBtn) {
      confirmDeleteBtn.innerHTML = '<i class="fas fa-trash"></i> Confirm Delete';
      confirmDeleteBtn.disabled = false;
    }
  }
}

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
    
    const img = $('profilePicture');
    const initials = $('profileInitials');
    
    if (img && result.profile_picture) {
      const timestamp = new Date().getTime();
      const pictureUrl = result.profile_picture + '?t=' + timestamp;
      img.src = pictureUrl;
      img.style.display = 'block';
      
      if (initials) {
        initials.style.display = 'none';
      }
      
      localStorage.setItem('profile_picture_url', result.profile_picture);
      localStorage.setItem('profile_picture_timestamp', timestamp);
      
      if (freelancerProfile) {
        freelancerProfile.profile_picture = result.profile_picture;
      }
    }
    
    await updateServicesWithNewProfilePicture(result.profile_picture);
    
    showToast('✅ Profile picture updated successfully!', 'success');
    
  } catch (error) {
    showToast('❌ Failed to upload profile picture: ' + error.message, 'error');
  } finally {
    const updatePhotoBtn = $('updatePhotoBtn');
    if (updatePhotoBtn) {
      updatePhotoBtn.innerHTML = '<i class="fas fa-camera"></i> Update Photo';
      updatePhotoBtn.disabled = false;
    }
  }
}

function initProfileFunctionality() {
  if (!currentSkills || currentSkills.length === 0) {
    currentSkills = ['React', 'Node.js', 'TypeScript', 'MongoDB', 'AWS', 'UI/UX Design'];
  }
  
  setupProfileEventListeners();
}

function setupProfileEventListeners() {
  const updatePhotoBtn = $('updatePhotoBtn');
  const profilePictureInput = $('profilePictureInput');
  
  if (updatePhotoBtn && profilePictureInput) {
    updatePhotoBtn.addEventListener('click', () => {
      profilePictureInput.click();
    });
    
    profilePictureInput.addEventListener('change', handleProfilePictureUpload);
  }
  
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
  
  const editProfileBtn = $('editProfileBtn');
  const dashboardActionBtn = $('dashboardBtn');
  const shareProfileBtn = $('shareProfileBtn');
  const exportProfileBtn = $('exportProfileBtn');
  
  if (editProfileBtn) editProfileBtn.addEventListener('click', () => switchProfileTab('profileEdit'));
  if (dashboardActionBtn) dashboardActionBtn.addEventListener('click', () => switchProfileTab('dashboard'));
  if (shareProfileBtn) shareProfileBtn.addEventListener('click', shareProfile);
  if (exportProfileBtn) exportProfileBtn.addEventListener('click', exportProfile);
  
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
  
  document.querySelectorAll('.common-skill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const skill = e.target.getAttribute('data-skill');
      addCommonSkill(skill);
    });
  });
  
  const cancelEditBtn = $('cancelEditBtn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      switchProfileTab('profileView');
    });
  }
  
  const profileForm = $('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileFormSubmit);
  }
}

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

function showFreelancerProfile() {
  const profileSection = $('freelancerProfile');
  if (profileSection) {
    profileSection.classList.remove('hidden');
  }
  
  loadFreelancerProfile();
  switchProfileTab('profileView');
}

async function loadFreelancerProfile() {
  try {
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
    
    const cachedPicture = localStorage.getItem('profile_picture_url');
    if (cachedPicture && (!freelancerProfile.profile_picture || freelancerProfile.profile_picture.includes('default'))) {
      freelancerProfile.profile_picture = cachedPicture;
    }
    
    renderProfile();
    
    if (freelancerProfile.skills) {
      try {
        currentSkills = Array.isArray(freelancerProfile.skills) ? 
          freelancerProfile.skills : 
          JSON.parse(freelancerProfile.skills);
        renderSkills(currentSkills);
      } catch (e) {
        currentSkills = ['React', 'Node.js', 'TypeScript', 'MongoDB', 'AWS', 'UI/UX Design'];
        renderSkills(currentSkills);
      }
    }
    
  } catch (error) {
    showToast('❌ Failed to load profile. Please try again.', 'error');
    
    renderDefaultProfile();
  }
}

function renderProfile() {
  if (!freelancerProfile) {
    renderDefaultProfile();
    return;
  }
  
  safeSetText('profileUsername', freelancerProfile.username || currentUser?.username || 'Freelancer');
  safeSetText('profileHeadline', freelancerProfile.headline || 'Professional Freelancer');
  safeSetText('profileEmail', freelancerProfile.email || currentUser?.email || 'Not provided');
  safeSetText('profilePhone', freelancerProfile.phone || 'Not provided');
  
  const img = $('profilePicture');
  const initials = $('profileInitials');
  
  if (freelancerProfile.profile_picture) {
    const timestamp = localStorage.getItem('profile_picture_timestamp') || new Date().getTime();
    const pictureUrl = freelancerProfile.profile_picture.includes('?') 
      ? freelancerProfile.profile_picture 
      : freelancerProfile.profile_picture + '?t=' + timestamp;
    
    if (img) {
      img.src = pictureUrl;
      img.style.display = 'block';
      img.onerror = function() {
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
  
  safeSetText('totalServices', freelancerProfile.total_services || 0);
  safeSetText('totalReviews', freelancerProfile.total_reviews || 0);
  safeSetText('avgRating', (freelancerProfile.avg_rating || 0).toFixed(1));
  safeSetText('totalEarnings', `$${freelancerProfile.total_earnings || 0}`);
  
  safeSetText('dashboardServices', freelancerProfile.total_services || 0);
  safeSetText('dashboardEarnings', `$${freelancerProfile.total_earnings || 0}`);
  safeSetText('dashboardClients', freelancerProfile.total_clients || 0);
  safeSetText('dashboardRating', (freelancerProfile.avg_rating || 0).toFixed(1));
  
  safeSetText('profileDescription', freelancerProfile.description || 'No description provided. Tell clients about your experience and expertise.');
  
  const skillsContainer = $('profileSkills');
  if (skillsContainer) {
    try {
      const skills = currentSkills.length > 0 ? currentSkills : 
        (freelancerProfile.skills ? (Array.isArray(freelancerProfile.skills) ? freelancerProfile.skills : JSON.parse(freelancerProfile.skills)) : []);
      skillsContainer.innerHTML = skills.map(skill => `
        <span class="skill-tag">${escapeHtml(skill)}</span>
      `).join('');
    } catch (e) {
      skillsContainer.innerHTML = '<span class="text-gray">No skills added yet</span>';
    }
  }
  
  safeSetText('profileHourlyRate', `$${freelancerProfile.hourly_rate || 0}/hr`);
  safeSetText('profileExperienceLevel', formatExperienceLevel(freelancerProfile.experience_level));
  safeSetText('profileLocation', freelancerProfile.location || 'Not specified');
  safeSetText('profileLocationDisplay', freelancerProfile.location || 'Not specified');
  safeSetText('profileLanguages', formatLanguages(freelancerProfile.languages));
  
  const availabilityElement = $('profileAvailability');
  if (availabilityElement) {
    const availability = freelancerProfile.availability || 'available';
    availabilityElement.textContent = formatAvailability(availability);
    availabilityElement.className = `availability-badge availability-${availability}`;
  }
  
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
  
  safeSetText('profileEducation', freelancerProfile.education || 'No education information provided.');
  safeSetText('profileCertifications', freelancerProfile.certifications || 'No certifications added yet.');
  
  const memberSince = freelancerProfile.created_at || freelancerProfile.user_created_at;
  safeSetText('profileMemberSince', memberSince ? 
    new Date(memberSince).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    }) : 'N/A');
}

function renderDefaultProfile() {
  const username = currentUser?.username || 'Freelancer';
  
  safeSetText('profileUsername', username);
  safeSetText('profileHeadline', 'Professional Freelancer');
  safeSetText('profileEmail', currentUser?.email || 'Not provided');
  
  const img = $('profilePicture');
  const initials = $('profileInitials');
  if (img) img.style.display = 'none';
  if (initials) {
    initials.textContent = username.charAt(0).toUpperCase();
    initials.style.display = 'flex';
  }
  
  safeSetText('totalServices', '0');
  safeSetText('avgRating', '0.0');
  safeSetText('totalReviews', '0');
  safeSetText('totalEarnings', '$0');
}

function switchProfileTabOld(tabName) {
  document.querySelectorAll('.profile-tab-content').forEach(tab => {
    tab.classList.add('hidden');
  });
  
  document.querySelectorAll('.nav-tab.enhanced').forEach(tab => {
    tab.classList.remove('active');
  });
  
  const tabContent = $(tabName + 'TabContent');
  if (tabContent) {
    tabContent.classList.remove('hidden');
  }
  
  const tabButton = $(tabName + 'TabBtn');
  if (tabButton) {
    tabButton.classList.add('active');
  }
  
  if (tabName === 'profileEdit') {
    loadEditForm();
  } else if (tabName === 'dashboard') {
    loadDashboardData();
  }
}

function loadEditForm() {
  if (!freelancerProfile) {
    showToast('Please load profile data first', 'warning');
    
    loadFreelancerProfile().then(() => {
      if (freelancerProfile) {
        loadEditFormData();
      }
    });
    return;
  }
  
  loadEditFormData();
}

function loadEditFormData() {
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
  
  safeSetValue('editLanguages', formatLanguagesForEdit(freelancerProfile.languages));
  updateSelectedLanguages(freelancerProfile.languages);
  
  renderSkills(currentSkills);
}

async function handleProfileFormSubmitOld(e) {
  e.preventDefault();
  
  const submitBtn = document.querySelector('#profileForm button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  submitBtn.disabled = true;
  
  try {
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
    
    freelancerProfile = { ...freelancerProfile, ...profileUpdateData };
    
    switchProfileTab('profileView');
    
    renderProfile();
    
    showToast('✅ Profile updated successfully!', 'success');
    
  } catch (error) {
    showToast('❌ Failed to update profile: ' + error.message, 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

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

function switchToServicesTab() {
  const profileSection = $('freelancerProfile');
  if (profileSection) {
    profileSection.classList.add('hidden');
  }
  
  const servicesBrowser = $('servicesBrowser');
  if (servicesBrowser) {
    servicesBrowser.classList.remove('hidden');
    if (typeof switchTab === 'function') {
      switchTab('myServices');
    }
  }
  
  showToast('Navigating to My Services...', 'info');
}

function switchToOrdersTab() {
  const profileSection = $('freelancerProfile');
  if (profileSection) {
    profileSection.classList.add('hidden');
  }
  
  const servicesBrowser = $('servicesBrowser');
  if (servicesBrowser) {
    servicesBrowser.classList.remove('hidden');
    if (typeof switchTab === 'function') {
      switchTab('clients');
    }
  }
  
  showToast('Navigating to Orders...', 'info');
}

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
    navigator.clipboard.writeText(profileUrl).then(() => {
      showToast('✅ Profile link copied to clipboard!', 'success');
    }).catch(() => {
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

async function viewServiceDetailsModal(serviceId) {
  try {
    const response = await fetch(`/api/services/${serviceId}/details`);
    const service = await response.json();
    
    if (!response.ok) {
      showToast('Failed to load service details', 'error');
      return;
    }
    
    const modalHtml = `
      <div id="serviceDetailsModal" class="modal" style="display: flex;">
        <div class="modal-card" style="max-width: 600px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <h3 style="margin:0;color:var(--text-light)">Service Details</h3>
            <span class="close-x" onclick="closeCurrentModal()">&times;</span>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h4 style="color: var(--accent-gold); margin-bottom: 10px;">${escapeHtml(service.title)}</h4>
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
              <div>
                <strong style="color: var(--text-light);">Price:</strong>
                <span style="color: var(--accent-gold); font-weight: bold; margin-left: 10px;">
                  ${service.price > 0 ? `$${service.price}` : 'Free'}
                </span>
              </div>
              <div>
                <strong style="color: var(--text-light);">Category:</strong>
                <span style="color: var(--text-light); margin-left: 10px;">${escapeHtml(service.category || 'General')}</span>
              </div>
            </div>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h5 style="color: var(--text-light); margin-bottom: 10px;">Description</h5>
            <div style="background: var(--card-bg); padding: 15px; border-radius: 8px;">
              <p style="color: var(--text-light); line-height: 1.5;">
                ${escapeHtml(service.description || 'No description provided.')}
              </p>
            </div>
          </div>
          
          ${service.delivery_time ? `
            <div style="margin-bottom: 20px;">
              <h5 style="color: var(--text-light); margin-bottom: 10px;">Delivery Time</h5>
              <div style="background: var(--card-bg); padding: 15px; border-radius: 8px;">
                <span style="color: var(--text-light);">${service.delivery_time} days</span>
              </div>
            </div>
          ` : ''}
          
          ${service.tags ? `
            <div style="margin-bottom: 20px;">
              <h5 style="color: var(--text-light); margin-bottom: 10px;">Tags</h5>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${JSON.parse(service.tags).map(tag => `
                  <span style="background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); padding: 6px 12px; border-radius: 15px; font-size: 0.85rem;">
                    ${escapeHtml(tag)}
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <div style="display: flex; gap: 10px; margin-top: 25px;">
            <button onclick="startConversationWithService(${service.id}, ${service.user_id})" 
                    class="btn btn-primary" style="flex: 1;">
              <i class="fas fa-comments"></i> Contact Provider
            </button>
            <button onclick="closeCurrentModal()" 
                    class="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
  } catch (error) {
    showToast('Failed to load service details', 'error');
  }
}

function closeCurrentModal() {
  const modal = document.querySelector('.modal:not(.hidden)');
  if (modal) {
    modal.remove();
  }
}

async function loadDashboardData() {
  try {
    const response = await fetch('/api/freelancer/dashboard');
    
    if (response.ok) {
      const data = await response.json();
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
  }
}

async function testChatFlow() {
  const convRes = await fetch("/api/messages/conversations", {
    credentials: "include"
  });
  
  const startRes = await fetch("/api/messages/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      serviceId: 22,
      freelancerId: 22
    })
  });
  
  alert("Check console for test results");
}

// ========== ENHANCED SERVICE FORM ==========
let currentStep = 1;
const totalSteps = 4;
function initEnhancedServiceForm() {
  currentStep = 1;
  updateFormSteps();
  
  $('nextStepBtn').addEventListener('click', function(e) {
    e.preventDefault();
    goToNextStep();
  });
  
  $('prevStepBtn').addEventListener('click', function(e) {
    e.preventDefault();
    goToPreviousStep();
  });
  
  const serviceForm = $('enhancedServiceForm');
  if (serviceForm) {
    serviceForm.addEventListener('submit', function(e) {
      e.preventDefault();
      publishService();
    });
  }
  
  initFormElements();
}

function initFormElements() {
  document.querySelectorAll('.package-tier').forEach(tier => {
    tier.addEventListener('click', function() {
      document.querySelectorAll('.package-tier').forEach(t => {
        t.classList.remove('selected');
      });
      this.classList.add('selected');
    });
  });
  
  document.querySelectorAll('.delivery-option').forEach(option => {
    option.addEventListener('click', function() {
      document.querySelectorAll('.delivery-option').forEach(o => {
        o.classList.remove('selected');
      });
      this.classList.add('selected');
    });
  });
  
  document.querySelectorAll('.revision-option').forEach(option => {
    option.addEventListener('click', function() {
      document.querySelectorAll('.revision-option').forEach(o => {
        o.classList.remove('selected');
      });
      this.classList.add('selected');
    });
  });
  
  const descTextarea = $('serviceDescription');
  if (descTextarea) {
    descTextarea.addEventListener('input', function() {
      const charCount = $('descCharCount');
      if (charCount) {
        charCount.textContent = `${this.value.length}/1200`;
      }
    });
  }
}

function goToNextStep() {
  if (currentStep < totalSteps) {
    if (!validateStep(currentStep)) {
      showToast('Please complete all required fields', 'error');
      return;
    }
    
    currentStep++;
    updateFormSteps();
  }
}

function goToPreviousStep() {
  if (currentStep > 1) {
    currentStep--;
    updateFormSteps();
  }
}

function updateFormSteps() {
  document.querySelectorAll('.form-step').forEach(step => {
    step.classList.add('hidden');
  });
  
  const currentStepElement = document.querySelector(`.form-step[data-step="${currentStep}"]`);
  if (currentStepElement) {
    currentStepElement.classList.remove('hidden');
  }
  
  document.querySelectorAll('.progress-step').forEach((step, index) => {
    const stepNum = index + 1;
    step.classList.remove('active', 'completed');
    
    if (stepNum < currentStep) {
      step.classList.add('completed');
    } else if (stepNum === currentStep) {
      step.classList.add('active');
    }
  });
  
  document.querySelectorAll('.progress-label').forEach((label, index) => {
    const stepNum = index + 1;
    label.classList.remove('active');
    
    if (stepNum === currentStep) {
      label.classList.add('active');
    }
  });
  
  $('prevStepBtn').style.display = currentStep > 1 ? 'flex' : 'none';
  $('nextStepBtn').style.display = currentStep < totalSteps ? 'flex' : 'none';
  $('publishBtn').style.display = currentStep === totalSteps ? 'flex' : 'none';
  
  if (currentStep === 4) {
    updateSummary();
  }
}

function validateStep(step) {
  switch(step) {
    case 1:
      const title = $('serviceTitle').value.trim();
      const category = $('serviceCategory').value;
      const description = $('serviceDescription').value.trim();
      
      if (!title || !description) {
        return false;
      }
      return true;
      
    case 2:
      return true;
      
    case 3:
      return true;
      
    default:
      return true;
  }
}

function updateSummary() {
  $('summaryTitle').textContent = $('serviceTitle').value;
  $('summaryCategory').textContent = $('serviceCategory').value || 'Not selected';
  
  const selectedPackage = document.querySelector('.package-tier.selected');
  $('summaryPackages').textContent = selectedPackage ? 
    selectedPackage.querySelector('.tier-name').textContent + ' - ' + 
    selectedPackage.querySelector('.tier-price').textContent : 'Not selected';
  
  const selectedDelivery = document.querySelector('.delivery-option.selected');
  $('summaryDelivery').textContent = selectedDelivery ? 
    selectedDelivery.querySelector('.delivery-days').textContent + ' days' : 'Not selected';
  
  const selectedRevisions = document.querySelector('.revision-option.selected');
  $('summaryRevisions').textContent = selectedRevisions ? 
    selectedRevisions.querySelector('.revision-count').textContent + ' revisions' : 'Not selected';
}

function addTag(tag) {
  if (!tag) return;
  
  const tagsList = $('serviceTagsList');
  const existingTags = Array.from(tagsList.querySelectorAll('.tag-item'))
    .map(tagItem => tagItem.textContent.replace('×', '').trim());
  
  if (existingTags.includes(tag)) {
    showToast('Tag already added', 'warning');
    return;
  }
  
  const tagItem = document.createElement('div');
  tagItem.className = 'tag-item';
  tagItem.innerHTML = `
    ${tag}
    <button type="button" class="remove-tag" onclick="this.parentElement.remove()">×</button>
  `;
  
  tagsList.appendChild(tagItem);
}

function handleGalleryUpload() {
  const files = Array.from($('serviceImages').files);
  const galleryPreview = $('galleryPreview');
  
  if (files.length === 0) return;
  
  const validFiles = files.filter(file => {
    const maxSize = 5 * 1024 * 1024;
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
  
  const currentImages = galleryPreview.children.length;
  if (currentImages + validFiles.length > 10) {
    showToast('Maximum 10 images allowed', 'error');
    return;
  }
  
  validFiles.forEach(file => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const galleryItem = document.createElement('div');
      galleryItem.className = 'gallery-item';
      galleryItem.innerHTML = `
        <img src="${e.target.result}" alt="Gallery image">
        <button type="button" class="remove-gallery-item" onclick="this.parentElement.remove()">
          <i class="fas fa-times"></i>
        </button>
      `;
      galleryPreview.appendChild(galleryItem);
    };
    reader.readAsDataURL(file);
  });
  
  showToast(`${validFiles.length} image(s) added to gallery`, 'success');
}

function addRequirement() {
  const container = document.querySelector('.requirements-container');
  const requirementItem = document.createElement('div');
  requirementItem.className = 'requirement-item';
  requirementItem.innerHTML = `
    <div class="requirement-input">
      <input type="text" class="form-input-enhanced" placeholder="What information do you need from buyers?">
    </div>
    <button type="button" class="btn btn-secondary" onclick="removeRequirement(this)">
      <i class="fas fa-times"></i>
    </button>
  `;
  container.appendChild(requirementItem);
}

function removeRequirement(button) {
  button.closest('.requirement-item').remove();
}

async function publishService() {
  try {
    for (let i = 1; i <= totalSteps; i++) {
      if (!validateStep(i)) {
        showToast(`Please complete step ${i}`, 'error');
        goToStep(i);
        return;
      }
    }
    
    if (!$('acceptTerms').checked) {
      showToast('Please accept the terms of service', 'error');
      return;
    }
    
    const formData = {
      title: $('serviceTitle').value.trim(),
      category: $('serviceCategory').value,
      description: $('serviceDescription').value.trim(),
      tags: getTags(),
      package: getSelectedPackage(),
      delivery_time: getSelectedDelivery(),
      revisions: getSelectedRevisions(),
      hourly_rate: $('hourlyRate').value || null,
      fixed_price: $('fixedPrice').value || null,
      video_url: $('serviceVideo').value || null,
      requirements: getRequirements(),
      publish_option: document.querySelector('input[name="publishOption"]:checked').value
    };
    
    const publishBtn = $('publishBtn');
    const originalText = publishBtn.innerHTML;
    publishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';
    publishBtn.disabled = true;
    
    const response = await fetch('/api/services/enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to publish service');
    }
    
    showToast('✅ Service published successfully!', 'success');
    
    setTimeout(() => {
      hideCreateServiceForm();
      loadMyServices();
    }, 1500);
    
  } catch (error) {
    showToast('❌ Failed to publish service: ' + error.message, 'error');
    
    const publishBtn = $('publishBtn');
    if (publishBtn) {
      publishBtn.innerHTML = '<i class="fas fa-rocket"></i> Publish Service';
      publishBtn.disabled = false;
    }
  }
}

function getTags() {
  const tags = Array.from($('serviceTagsList').querySelectorAll('.tag-item'))
    .map(tagItem => tagItem.textContent.replace('×', '').trim());
  return tags;
}

function getSelectedPackage() {
  const selected = document.querySelector('.package-tier.selected');
  if (selected) {
    return {
      tier: selected.getAttribute('data-tier'),
      name: selected.querySelector('.tier-name').textContent,
      price: selected.querySelector('.tier-price').textContent.replace('$', '')
    };
  }
  return null;
}

function getSelectedDelivery() {
  const selected = document.querySelector('.delivery-option.selected');
  return selected ? selected.getAttribute('data-days') : null;
}

function getSelectedRevisions() {
  const selected = document.querySelector('.revision-option.selected');
  return selected ? selected.getAttribute('data-revisions') : null;
}

function getRequirements() {
  const requirements = Array.from(document.querySelectorAll('.requirement-item input'))
    .map(input => input.value.trim())
    .filter(value => value);
  return requirements;
}

function goToStep(step) {
  currentStep = step;
  updateFormSteps();
}

// Certificate viewer functions
let currentZoom = 1;
let currentCertificateUrl = '';

function openCertificateViewer(certUrl, index) {
  currentCertificateUrl = certUrl;
  currentZoom = 1;
  
  const modal = $('certificateViewerModal');
  const image = $('certificateImage');
  const container = $('certificateContainer');
  
  if (modal && image) {
    image.src = certUrl;
    image.style.transform = `scale(${currentZoom})`;
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.classList.add('open');
    
    setupZoomControls();
  }
}

function viewCertificateFull(certUrl, event) {
  event.stopPropagation();
  openCertificateViewer(certUrl, 0);
}

function setupZoomControls() {
  const zoomInBtn = $('zoomInBtn');
  const zoomOutBtn = $('zoomOutBtn');
  const resetBtn = $('resetZoomBtn');
  const image = $('certificateImage');
  
  if (zoomInBtn) {
    zoomInBtn.onclick = function() {
      currentZoom = Math.min(currentZoom + 0.25, 3);
      image.style.transform = `scale(${currentZoom})`;
    };
  }
  
  if (zoomOutBtn) {
    zoomOutBtn.onclick = function() {
      currentZoom = Math.max(currentZoom - 0.25, 0.5);
      image.style.transform = `scale(${currentZoom})`;
    };
  }
  
  if (resetBtn) {
    resetBtn.onclick = function() {
      currentZoom = 1;
      image.style.transform = `scale(${currentZoom})`;
    };
  }
  
  const container = $('certificateContainer');
  if (container) {
    container.addEventListener('wheel', function(e) {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          currentZoom = Math.min(currentZoom + 0.1, 3);
        } else {
          currentZoom = Math.max(currentZoom - 0.1, 0.5);
        }
        image.style.transform = `scale(${currentZoom})`;
      }
    });
  }
}

function closeCertificateViewer() {
  const modal = $('certificateViewerModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function downloadCertificate() {
  if (!currentCertificateUrl) return;
  
  const link = document.createElement('a');
  link.href = currentCertificateUrl;
  link.download = `certificate-${Date.now()}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('Certificate download started', 'success');
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

    if (!userRole && $('roleModal')) {
      setTimeout(() => openModal($('roleModal')), 1000);
    }

    if (userRole === 'freelancer') {
      loadSubscriptionStatus().catch(err => console.error(err));
      loadMyServices().catch(err => console.error(err));
    }

    loadServices().catch(err => console.error(err));

    if (currentUser) {
      checkUnreadMessages();
      setInterval(checkUnreadMessages, 10000);
    }

  } catch (err) {
    currentUser = null;
    userRole = null;
    updateHeader();
    updateUIForUserRole();
  }
}

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

    filterAndRenderServices();

  } catch (err) {
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
  if (!myServicesList) {
    return;
  }

  try {
    showLoading('myServicesList');

    const response = await fetch('/api/services/my-services');
    
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
      myServicesList.innerHTML = myServices.map(service => {
        const providerName = service.username || 'You';
        const profilePicture = service.profile_picture || service.provider_profile_picture;
        
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

  } catch (err) {
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
  
  if ($('serviceForm')) {
    $('serviceForm').addEventListener('submit', handleServiceFormSubmit);
  }
  
  if ($('loginForm')) {
    $('loginForm').addEventListener('submit', handleLoginSubmit);
  }
  
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
    alert('Subscription failed. Please try again.');
  }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initModals();
    
    await checkAuthStatus();
    
    await loadCategories();
    
    setupEnhancedCategorySelection();
    
    initProfileSection();
    
    initEnhancedServiceForm();
    
    setupMessageForm();
    
    setupEventListeners();
    
  } catch (error) {
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
  }
}

function getSelectedCategoryFromEnhancedForm() {
  const newCategoryInput = $('newCategory');
  const categorySelect = $('serviceCategory');
  
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
  const display = document.querySelector('.selected-category-display');
  const textElement = $('selectedCategoryText');
  
  if (display && textElement) {
    textElement.textContent = displayText;
    display.classList.remove('hidden');
  }
  
  showToast(`Category selected: ${displayText}`, 'success');
}

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
}

function initRecruitmentSystem() {
}

function initClientRequestSystem() {
}

function viewFreelancerServices(freelancerId) {
}

function startConversationWithFreelancer(userId, username) {
}