/*********************
 *  Global Variables *
 *********************/
let currentUser = window.currentUser || null;
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

// Helper function to safely extract rows from MySQL2 query results
function extractRows(result) {
    if (!result) return [];

    // If it's an array with two elements [rows, fields]
    if (Array.isArray(result) && result.length === 2) {
        return result[0] || [];
    }

    // If it's already an array of rows
    if (Array.isArray(result)) {
        return result;
    }

    // If it's a single object (like insert result)
    return result;
}

// Helper function to safely extract insertId
function extractInsertId(result) {
    if (!result) return null;

    // If it's [resultSet, fields]
    if (Array.isArray(result) && result[0] && result[0].insertId) {
        return result[0].insertId;
    }

    // If it's a result object with insertId
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
 *  Inbox Functions  *
 *********************/
async function loadConversations() {
    if (!currentUser) {
        console.log("No user logged in, skipping conversation load");
        return;
    }

    console.log("Loading conversations for user:", currentUser.id, currentUser.username);

    const list = $('conversationList');
    if (!list) {
        console.error("Conversation list element not found");
        return;
    }

    // Show loading skeleton
    list.innerHTML = `
        <div class="conversation-skeleton">
            <div class="skeleton-line" style="width: 60%;"></div>
            <div class="skeleton-line" style="width: 80%;"></div>
            <div class="skeleton-line" style="width: 40%;"></div>
        </div>
        <div class="conversation-skeleton">
            <div class="skeleton-line" style="width: 70%;"></div>
            <div class="skeleton-line" style="width: 90%;"></div>
            <div class="skeleton-line" style="width: 50%;"></div>
        </div>
    `;

    try {
        const res = await fetch("/api/messages/conversations", {
            credentials: "include"
        });

        if (!res.ok) {
            console.error("Failed to load conversations:", res.status, res.statusText);
            list.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>Failed to load conversations</p>
                    <p style="font-size: 0.9rem;">Please try refreshing the page</p>
                    <button class="btn btn-primary" onclick="loadConversations()" style="margin-top: 15px;">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
            return;
        }

        const data = await res.json();
        console.log("Raw API response:", data);

        // Ensure we have an array
        let convs = [];
        if (Array.isArray(data)) {
            convs = data;
        } else if (data && Array.isArray(data.conversations)) {
            convs = data.conversations;
        } else if (data && data.data && Array.isArray(data.data)) {
            convs = data.data;
        }

        console.log(`Loaded ${convs.length} conversations for user ${currentUser.id}:`, convs);

        // Get unread counts
        let unreadCounts = {};
        try {
            const unreadRes = await fetch("/api/messages/unread-by-conversation", {
                credentials: "include"
            });
            if (unreadRes.ok) {
                unreadCounts = await unreadRes.json();
                console.log("Unread counts:", unreadCounts);
            }
        } catch (e) {
            console.error("Error fetching unread counts:", e);
        }

        if (!convs || convs.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                    <i class="fas fa-comments" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>No conversations yet</p>
                    <p style="font-size: 0.9rem;">Start a chat by clicking on a service</p>
                </div>
            `;
            return;
        }

        list.innerHTML = '';

        for (const c of convs) {
            try {
                console.log("Processing conversation:", c);

                const div = document.createElement('div');
                div.className = 'conversation-item';

                // Get conversation ID - handle different possible property names
                const conversationId = c.conversation_id || c.id;
                const otherUserId = c.other_user_id || c.otherUserId;
                let otherUserName = c.other_user_name || c.otherUserName || c.username || 'User';

                // Ensure username is a string
                if (otherUserName === null || otherUserName === undefined) {
                    otherUserName = 'User';
                } else if (typeof otherUserName !== 'string') {
                    otherUserName = String(otherUserName);
                }

                const serviceTitle = c.service_title || c.serviceTitle || 'Direct Message';
                const createdAt = c.created_at || c.createdAt;

                if (!conversationId) {
                    console.warn("Conversation missing ID:", c);
                    continue;
                }

                if (window.activeConversationId == conversationId) {
                    div.classList.add('active');
                }

                div.dataset.conversationId = conversationId;
                div.dataset.otherUserId = otherUserId;

                const timeAgo = formatTimeAgo(createdAt);
                const unreadCount = unreadCounts[conversationId] || 0;

                // Try to get the last message
                let previewText = 'Click to view conversation';
                let lastMessageTime = createdAt;

                try {
                    const msgRes = await fetch(`/api/messages/${conversationId}`, {
                        credentials: "include"
                    });
                    if (msgRes.ok) {
                        const messages = await msgRes.json();
                        console.log(`Messages for conversation ${conversationId}:`, messages);

                        const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;
                        if (lastMessage) {
                            previewText = lastMessage.message.substring(0, 50);
                            if (lastMessage.message.length > 50) previewText += '...';
                            lastMessageTime = lastMessage.created_at || lastMessage.createdAt;
                        }
                    }
                } catch (e) {
                    console.error("Error fetching last message:", e);
                }

                // Create conversation item with proper structure
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
                                <div class="conversation-time">${formatTimeAgo(lastMessageTime)}</div>
                                <div class="conversation-service">${escapeHtml(serviceTitle)}</div>
                            </div>
                        </div>
                    </div>
                `;

                div.onclick = () => openConversation(conversationId, otherUserName, otherUserId);
                list.appendChild(div);

                console.log(`Added conversation ${conversationId} to list`);

            } catch (e) {
                console.error("Error rendering conversation:", e, c);
            }
        }

        console.log(`Finished rendering ${convs.length} conversations`);

        // If we have an active conversation, make sure it's highlighted
        if (window.activeConversationId) {
            const activeItem = document.querySelector(`.conversation-item[data-conversation-id="${window.activeConversationId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');

                // Scroll to active conversation
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

    } catch (err) {
        console.error("Failed to load conversations:", err);
        list.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>Error loading conversations</p>
                <p style="font-size: 0.9rem;">${escapeHtml(err.message)}</p>
                <button class="btn btn-primary" onclick="loadConversations()" style="margin-top: 15px;">
                    <i class="fas fa-sync-alt"></i> Try Again
                </button>
            </div>
        `;
    }
}

async function debugConversationIssue() {
    if (!currentUser) {
        console.log("No user logged in");
        return;
    }

    console.log("Current user:", currentUser);

    try {
        // Check all conversations
        const convRes = await fetch("/api/messages/conversations", {
            credentials: "include"
        });
        const conversations = await convRes.json();
        console.log("All conversations for user:", conversations);

        // If there's an active conversation, check its details
        if (window.activeConversationId) {
            const debugRes = await fetch(`/api/debug/conversation/${window.activeConversationId}`, {
                credentials: "include"
            });
            const debugData = await debugRes.json();
            console.log("Conversation debug data:", debugData);

            if (debugData.can_access === false) {
                console.error("User cannot access this conversation!");
                showToast("You don't have access to this conversation. It may belong to a different user.", "error");
            }
        }
    } catch (error) {
        console.error("Debug error:", error);
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

function toggleUserInfo() {
    const panel = $('userInfoPanel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function startNewConversation() {
    // Create a modal to search for users
    const modalHtml = `
        <div id="newConversationModal" class="modal" style="display: flex;">
            <div class="modal-card" style="max-width: 500px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;color:var(--text-light);">Start New Conversation</h3>
                    <span onclick="closeNewConversationModal()" class="close-x" style="cursor:pointer">&times;</span>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="color: var(--text-light); display: block; margin-bottom: 10px;">Search for users</label>
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <div style="flex: 1; position: relative;">
                            <i class="fas fa-search" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-gray);"></i>
                            <input type="text" id="userSearch" placeholder="Enter username or email..." 
                                   style="width:100%; padding: 14px 14px 14px 45px; border-radius: 10px; background: var(--secondary-dark); border: 2px solid rgba(255,255,255,0.1); color: var(--text-light);">
                        </div>
                        <button onclick="performUserSearch()" class="btn btn-primary" style="padding: 14px 20px;">
                            <i class="fas fa-search"></i> Search
                        </button>
                    </div>
                    <div id="userSearchResults" style="max-height: 300px; overflow-y: auto;">
                        <p style="color: var(--text-gray); padding: 20px; text-align: center;">Type at least 2 characters and click Search</p>
                    </div>
                </div>

                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button onclick="closeNewConversationModal()" class="btn btn-secondary" style="flex:1;padding:14px;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performUserSearch();
            }
        });
    }
}


function closeNewConversationModal() {
    const modal = $('newConversationModal');
    if (modal) modal.remove();
}


async function performUserSearch() {
    const searchInput = document.getElementById('userSearch');
    if (!searchInput) return;
    
    const query = searchInput.value.trim();
    if (query.length < 2) {
        document.getElementById('userSearchResults').innerHTML = '<p style="color: var(--text-gray); padding: 20px; text-align: center;">Type at least 2 characters to search</p>';
        return;
    }

    // Show loading
    document.getElementById('userSearchResults').innerHTML = '<p style="color: var(--text-gray); padding: 20px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Searching...</p>';

    try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const users = await res.json();
        console.log("Search results:", users); // For debugging

        const resultsDiv = document.getElementById('userSearchResults');
        if (!resultsDiv) return;
        
        if (!users || users.length === 0) {
            resultsDiv.innerHTML = '<p style="color: var(--text-gray); padding: 20px; text-align: center;">No users found</p>';
        } else {
            resultsDiv.innerHTML = users.map(user => {
                // Ensure user object has the expected properties
                const username = user.username || 'User';
                const email = user.email || 'No email';
                const userId = user.id;
                
                return `
                <div onclick="startConversationWithUser(${userId}, '${escapeHtml(username)}')" 
                     style="display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: var(--transition);"
                     onmouseover="this.style.background='rgba(255,255,255,0.05)'"
                     onmouseout="this.style.background='transparent'">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.2rem;">
                        ${username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style="color: var(--text-light); font-weight: 600;">${escapeHtml(username)}</div>
                        <div style="color: var(--text-gray); font-size: 0.9rem;">${escapeHtml(email)}</div>
                    </div>
                </div>
            `}).join('');
        }
    } catch (error) {
        console.error('User search error:', error);
        const resultsDiv = document.getElementById('userSearchResults');
        if (resultsDiv) {
            resultsDiv.innerHTML = '<p style="color: #ef4444; padding: 20px; text-align: center;">Error searching users. Please try again.</p>';
        }
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
        // Since there's no direct message endpoint, we need to create a dummy service conversation
        // First, check if there's any service from this user
        const servicesRes = await fetch(`/api/services?user_id=${userId}`, {
            credentials: 'include'
        });
        const services = await servicesRes.json();

        let serviceId = null;

        if (services && services.length > 0) {
            // Use the first service from this user
            serviceId = services[0].id;
        } else {
            // If user has no services, we can't start a conversation
            showToast('This user has no services to message about', 'error');
            return;
        }

        // Start conversation using the service
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

/*********************
 *  Open Conversation *
 *********************/
async function openConversation(conversationId, username = 'User', otherUserId = null) {
    console.log("Opening conversation:", conversationId, "Username:", username, "User ID:", otherUserId);

    // Ensure username is a string
    if (username === null || username === undefined) {
        username = 'User';
    } else if (typeof username !== 'string') {
        username = String(username);
    }

    // Update all references to the current conversation
    window.activeConversationId = conversationId;
    window.activeConversationUserId = otherUserId;

    // Update form dataset
    const sendMessageForm = $('sendMessageForm');
    if (sendMessageForm) {
        sendMessageForm.dataset.conversationId = conversationId;
    }

    // Update chat header with proper user info
    const chatUserName = $('chatUserName');
    if (chatUserName) {
        chatUserName.textContent = username;
    }

    // Set user avatar with initials
    const chatUserAvatar = $('chatUserAvatar');
    if (chatUserAvatar) {
        chatUserAvatar.innerHTML = username.charAt(0).toUpperCase();
        chatUserAvatar.style.background = 'var(--gradient-primary)';
    }

    // SHOW the message input area
    const messageInputArea = $('messageInputArea');
    if (messageInputArea) {
        messageInputArea.style.display = 'block';
    }

    // Hide empty chat message and show messages container
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

    // Load user info in the sidebar
    if (otherUserId) {
        loadUserInfo(otherUserId);
    }

    // Load messages
    await loadMessagesForConversation(conversationId);

    // Mark messages as read
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

    // Focus the message input
    const messageInput = $('messageInput');
    if (messageInput) {
        messageInput.focus();
    }
}

/*********************
 *  Load Messages    *
 *********************/
async function loadMessagesForConversation(conversationId) {
    if (!conversationId) {
        console.error("No conversation ID provided");
        return;
    }

    console.log("Loading messages for conversation:", conversationId);

    try {
        const res = await fetch(`/api/messages/${conversationId}`, {
            credentials: "include"
        });

        if (!res.ok) {
            console.error("Failed to load messages:", res.status, res.statusText);
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

        const messages = await res.json();
        console.log(`Loaded ${messages.length} messages:`, messages);

        const container = $('messagesContainer');
        if (!container) {
            console.error("Messages container not found");
            return;
        }

        if (!messages || messages.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; color: var(--text-gray); padding: 40px;">
                    <i class="fas fa-comments" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>No messages yet</p>
                    <p style="font-size: 0.9rem;">Send a message to start the conversation!</p>
                </div>
            `;
            return;
        }

        // Group messages by sender and time proximity (within 5 minutes)
        const groupedMessages = [];
        let currentGroup = null;
        
        for (const m of messages) {
            const messageDate = new Date(m.created_at);
            
            // Start new group if:
            // 1. No current group
            // 2. Different sender
            // 3. Time difference > 5 minutes
            if (!currentGroup || 
                currentGroup.sender_id !== m.sender_id || 
                (messageDate - currentGroup.lastTime) > 300000) { // 5 minutes
                
                if (currentGroup) {
                    groupedMessages.push(currentGroup);
                }
                
                currentGroup = {
                    sender_id: m.sender_id,
                    sender_name: m.sender_name,
                    messages: [m],
                    firstTime: messageDate,
                    lastTime: messageDate
                };
            } else {
                // Same sender, add to current group
                currentGroup.messages.push(m);
                currentGroup.lastTime = messageDate;
            }
        }
        
        // Add the last group
        if (currentGroup) {
            groupedMessages.push(currentGroup);
        }

        // Render grouped messages
        container.innerHTML = '';

        groupedMessages.forEach(group => {
            const isMe = group.sender_id === currentUser?.id;
            
            const groupDiv = document.createElement('div');
            groupDiv.className = `message-group ${isMe ? 'sent' : 'received'}`;
            
            // Add sender name for received messages
            if (!isMe) {
                const headerDiv = document.createElement('div');
                headerDiv.className = 'message-group-header';
                headerDiv.textContent = group.sender_name || 'User';
                groupDiv.appendChild(headerDiv);
            }
            
            // Add all messages in the group
            group.messages.forEach((m, index) => {
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${isMe ? 'sent' : 'received'}`;
                messageDiv.dataset.messageId = m.id;

                // Format the time
                const messageDate = new Date(m.created_at);
                const timeString = messageDate.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });

                let contentHtml = '';
                
                // Add image if present
                if (m.image_url) {
                    let imageUrl = m.image_url;
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
                
                // Add text if present
                if (m.message && m.message !== '📷 Sent an image') {
                    contentHtml += `<div class="message-text">${escapeHtml(m.message)}</div>`;
                } else if (m.image_url && !m.message) {
                    contentHtml += `<div class="message-text" style="opacity: 0.7; font-style: italic;">Sent an image</div>`;
                }

                messageDiv.innerHTML = `
                    ${contentHtml}
                    <div class="message-time">${timeString}</div>
                `;

                groupDiv.appendChild(messageDiv);
            });
            
            container.appendChild(groupDiv);
        });

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error("Failed to load messages:", err);
        const container = $('messagesContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align:center; color: var(--text-gray); padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 15px;"></i>
                    <p>Error loading messages: ${escapeHtml(err.message)}</p>
                    <button class="btn btn-primary" onclick="loadMessagesForConversation(${conversationId})" style="margin-top: 10px;">
                        <i class="fas fa-sync-alt"></i> Try Again
                    </button>
                </div>
            `;
        }
    }
}


/*********************
 *  Send Message     *
 *********************/
async function sendMessage(e) {
  e.preventDefault();

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
  
  // Check if we have either text or an image
  if (!textMessage && !selectedFile) {
    showToast("Please enter a message or select an image", "error");
    return;
  }

  // Disable input and button while sending
  input.disabled = true;
  if (sendButton) sendButton.disabled = true;
  
  const originalPlaceholder = input.placeholder;
  input.placeholder = "Sending...";

  // Store the original button text
  const originalButtonText = sendButton ? sendButton.innerHTML : '';
  if (sendButton) {
    sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }

  try {
    let response;
    let responseData;
    
    if (selectedFile) {
      // Use FormData for image upload
      const formData = new FormData();
      formData.append('conversation_id', conversationId);
      formData.append('message', textMessage);
      formData.append('image', selectedFile);
      
      console.log("Sending message with image:", selectedFile.name, "Size:", selectedFile.size);
      
      response = await fetch("/api/messages/send-with-image", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      
    } else {
      // Use JSON for text-only
      console.log("Sending text message:", textMessage);
      
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

    // Check if response is ok
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server error:", response.status, errorText);
      showToast(`Server error: ${response.status}`, "error");
      return;
    }

    // Parse response
    responseData = await response.json();
    console.log("Send response:", responseData);

    if (!responseData.success) {
      showToast(responseData.error || "Failed to send message", "error");
      return;
    }

    // Clear input and selected file on success
    input.value = "";
    clearSelectedFile(); // This should clear the preview and selectedFile
    updateCharCount();

    // Add message to chat
    if (responseData.data) {
      appendMessageToChat(responseData.data);
    }
    
    // Update conversation list and check unread
    await loadConversations();
    checkUnreadMessages();

    // Focus back on input
    input.focus();

  } catch (err) {
    console.error("Send message error:", err);
    showToast("Message sending failed: " + err.message, "error");
  } finally {
    // Re-enable input and button
    input.disabled = false;
    input.placeholder = originalPlaceholder;
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.innerHTML = originalButtonText || '<i class="fas fa-paper-plane"></i>';
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
        console.log("User info loaded:", user); // For debugging

        const userInfoContent = document.getElementById('userInfoContent');
        if (!userInfoContent) return;

        // Safely access user properties with defaults
        const username = user.username || 'User';
        const headline = user.headline || 'Freelancer';
        const avgRating = user.avg_rating || 0;
        const reviewCount = user.review_count || 0;
        const location = user.location || '';
        const profilePicture = user.profile_picture;
        const userInitial = username.charAt(0).toUpperCase();

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

            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button onclick="openFreelancerProfileFromInbox(${userId})" class="btn btn-secondary" style="flex: 1; padding: 12px;">
                    <i class="fas fa-user"></i> View Profile
                </button>
                <button onclick="reportUser(${userId})" class="btn btn-secondary" style="padding: 12px;">
                    <i class="fas fa-flag"></i>
                </button>
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


function openFreelancerProfileFromInbox(userId) {
    // Close the user info panel
    const userInfoPanel = document.getElementById('userInfoPanel');
    if (userInfoPanel) {
        userInfoPanel.style.display = 'none';
    }
    
    // Open the profile
    openFreelancerProfile(userId);
}


function viewFreelancerProfile(userId) {
    closeModal($('freelancerProfileModal'));
    openFreelancerProfile(userId);
}

function reportUser(userId) {
    showToast('Report feature coming soon', 'info');
}

/*********************
 *  Emoji & Char Count *
 *********************/
function updateCharCount() {
    const input = $('messageInput');
    const charCount = $('charCount');
    if (!input || !charCount) return;
    const len = input.value.length;
    charCount.textContent = `${len}/1000`;
    charCount.style.color = len > 900 ? '#ff4444' : 'var(--text-gray)';
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (!picker) {
        createEmojiPicker();
        // After creating, show it
        setTimeout(() => {
            const newPicker = document.getElementById('emojiPicker');
            if (newPicker) {
                newPicker.classList.add('show');
            }
        }, 10);
    } else {
        picker.classList.toggle('show');
    }
}


function createEmojiPicker() {
    // Remove any existing picker
    const existingPicker = document.getElementById('emojiPicker');
    if (existingPicker) {
        existingPicker.remove();
    }
    
    const emojis = ['😀', '😂', '😊', '😍', '👍', '👏', '🎉', '🔥', '💯', '❤️', '🤔', '😎', '🙏', '💪', '✨', '⭐', '🌟', '💫', '⚡', '☀️'];

    const picker = document.createElement('div');
    picker.id = 'emojiPicker';
    picker.className = 'emoji-picker';

    // Create categories
    const categories = [
        { name: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚'] },
        { name: 'Gestures', emojis: ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️'] },
        { name: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'] }
    ];

    let html = '<div class="emoji-categories">';
    categories.forEach((cat, index) => {
        html += `<button class="emoji-category-btn ${index === 0 ? 'active' : ''}" data-category="${index}">${cat.name}</button>`;
    });
    html += '</div>';

    categories.forEach((cat, index) => {
        html += `<div class="emoji-grid" data-category="${index}" ${index !== 0 ? 'style="display:none;"' : ''}>`;
        cat.emojis.forEach(emoji => {
            html += `<div class="emoji-item" onclick="addEmoji('${emoji}'); event.stopPropagation();">${emoji}</div>`;
        });
        html += '</div>';
    });

    picker.innerHTML = html;

    // Add category switching
    picker.querySelectorAll('.emoji-category-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const category = this.dataset.category;
            picker.querySelectorAll('.emoji-category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            picker.querySelectorAll('.emoji-grid').forEach(grid => {
                grid.style.display = grid.dataset.category === category ? 'grid' : 'none';
            });
        });
    });

    // Position the picker above the input
    const messageInput = document.getElementById('messageInput');
    if (messageInput && messageInput.parentElement) {
        messageInput.parentElement.style.position = 'relative';
        messageInput.parentElement.appendChild(picker);
    }

    // Close picker when clicking outside
    document.addEventListener('click', function(e) {
        const picker = document.getElementById('emojiPicker');
        const emojiBtn = document.querySelector('button[onclick="toggleEmojiPicker()"]');
        if (picker && !picker.contains(e.target) && !emojiBtn?.contains(e.target)) {
            picker.classList.remove('show');
        }
    });
}

function addEmoji(emoji) {
    const input = document.getElementById('messageInput');
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
    updateCharCount();

    const picker = document.getElementById('emojiPicker');
    if (picker) {
        picker.style.display = 'none';
    }
}

let selectedFile = null;

function triggerFileUpload() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.click();
  }
}
function updateInboxBadge() {
    const badge = document.getElementById('inboxBadge');
    if (!badge) {
        // Create badge if it doesn't exist
        const inboxButton = document.querySelector('button[onclick="showInbox()"]');
        if (inboxButton) {
            inboxButton.innerHTML = '📩 Inbox <span id="inboxBadge" class="badge hidden"></span>';
        }
    }
    
    // Check for unread messages
    checkUnreadMessages();
}

// Filter conversations by search
function filterConversations() {
  const searchTerm = document.getElementById('conversationSearch').value.toLowerCase();
  const conversations = document.querySelectorAll('.conversation-item');
  
  conversations.forEach(conv => {
    const name = conv.querySelector('.conversation-name').textContent.toLowerCase();
    const preview = conv.querySelector('.conversation-preview')?.textContent.toLowerCase() || '';
    const service = conv.querySelector('.conversation-service')?.textContent.toLowerCase() || '';
    
    if (name.includes(searchTerm) || preview.includes(searchTerm) || service.includes(searchTerm)) {
      conv.style.display = 'block';
    } else {
      conv.style.display = 'none';
    }
  });
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  
  console.log('File selected:', file.name, file.type, file.size);
  
  // Check if it's an image
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }
  
  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image size should be less than 5MB', 'error');
    return;
  }
  
  selectedFile = file;
  
  // Show preview
  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = document.getElementById('imagePreview');
    if (!preview) {
      console.error('Image preview element not found');
      return;
    }
    
    preview.innerHTML = `
      <div style="position: relative; display: inline-block; margin: 10px 0; padding: 10px; background: var(--card-bg); border-radius: 8px;">
        <img src="${e.target.result}" style="max-width: 150px; max-height: 100px; border-radius: 4px; border: 2px solid var(--accent-blue);">
        <div style="font-size: 0.8rem; color: var(--text-gray); margin-top: 5px;">${file.name}</div>
        <button type="button" onclick="clearSelectedFile()" style="position: absolute; top: 0; right: 0; background: #ef4444; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; transform: translate(50%, -50%);">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
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
  console.log("Selected file cleared");
}

function openImageViewer(imageUrl) {
  // Remove any existing viewer
  const existingViewer = document.querySelector('.image-viewer-modal');
  if (existingViewer) {
    existingViewer.remove();
  }
  
  // Create viewer
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
  
  // Close when clicking outside the image
  viewer.addEventListener('click', function(e) {
    if (e.target === viewer) {
      viewer.remove();
    }
  });
  
  document.body.appendChild(viewer);
}

/*********************
 *  Attach File & Audio *
 *********************/
function attachFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,.doc,.docx';
    input.onchange = e => { if (e.target.files.length > 0) alert('File attached: ' + e.target.files[0].name); };
    input.click();
}

function recordAudio() {
    showToast('Audio recording feature coming soon!', 'info');
}

/*********************
 *  Profile Initialization *
 *********************/
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

/*********************
 *  Profile Tab Switching *
 *********************/
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

/*********************
 *  Certificate Upload *
 *********************/
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
            } catch (e) {}
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

/*********************
 *  Freelancer Delete Work *
 *********************/
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

/*********************
 *  Enhanced Category Selection *
 *********************/
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

/*********************
 *  Modal Management *
 *********************/
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

/*********************
 *  Chat & Profile Functions *
 *********************/
async function openChat(serviceId, freelancerId) {
    try {
        if (!currentUser) {
            alert("Please log in to start a chat.");
            openModal($('loginModal'));
            return;
        }

        // REMOVED clientId from request - server gets it from session
        const res = await fetch("/api/messages/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include", // Make sure to include credentials
            body: JSON.stringify({
                serviceId: serviceId,
                freelancerId: freelancerId
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
            openConversation(data.conversationId, 'Freelancer', freelancerId);
        }

        return data.conversationId;

    } catch (err) {
        console.error("Open chat error:", err);
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
        } catch (certError) {}

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

        console.log("Starting conversation with:", {
            serviceId,
            freelancerId,
            currentUserId: currentUser.id
        });

        // Validate that we're not messaging ourselves
        if (parseInt(currentUser.id) === parseInt(freelancerId)) {
            showToast("You cannot message yourself", "warning");
            return;
        }

        // Make the API call to start conversation
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
        console.log("Start conversation response:", data);

        if (!res.ok) {
            showToast(data.error || "Failed to start conversation", "error");
            return;
        }

        if (!data.conversation_id) {
            showToast("Failed to get conversation ID from server", "error");
            return;
        }

        // Store the active conversation
        window.activeConversationId = data.conversation_id;
        window.activeConversationUserId = freelancerId;

        // Get the freelancer's username
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

        console.log("Set active conversation to:", data.conversation_id, "Username:", username);

        showToast("✅ Conversation started!", "success");

        // Show inbox and open the conversation
        showInboxAndOpenConversation(data.conversation_id, username, freelancerId);

    } catch (err) {
        console.error("Start conversation error:", err);
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

function showInboxAndOpenConversation(conversationId, username, userId) {
    console.log("Opening inbox with conversation:", conversationId, "Username:", username, "User ID:", userId);

    hideAllPages();

    const inboxPage = $('inboxPage');
    if (inboxPage) {
        inboxPage.classList.remove('hidden');
    }

    // Set active conversation
    window.activeConversationId = conversationId;
    window.activeConversationUserId = userId;

    // Update form
    const sendMessageForm = $('sendMessageForm');
    if (sendMessageForm) {
        sendMessageForm.dataset.conversationId = conversationId;
    }

    // Setup message form
    setupMessageForm();

    // First load conversations to populate the list
    loadConversations().then(() => {
        // Then open the specific conversation
        setTimeout(() => {
            openConversation(conversationId, username, userId);

            // Force a refresh of conversations after a short delay
            setTimeout(() => {
                loadConversations();
            }, 1000);
        }, 200);
    });

    // Also load conversations for the other user by triggering a refresh
    // when they log in (this will be handled by the polling)
}

function setupMessageForm() {
    const form = $('sendMessageForm');
    const input = $('messageInput');

    if (!form || !input) {
        console.error("Message form elements not found");
        return;
    }

    // Remove existing listener to avoid duplicates
    if (form.dataset.bound === "true" && form.submitHandler) {
        form.removeEventListener('submit', form.submitHandler);
    }

    // Make sure the input area is visible when there's an active conversation
    const messageInputArea = $('messageInputArea');
    if (window.activeConversationId && messageInputArea) {
        messageInputArea.style.display = 'block';
    }

    // Set the submit handler
    form.submitHandler = sendMessage;

    // Add the new listener
    form.addEventListener('submit', form.submitHandler);
    form.dataset.bound = "true";

    // Add keydown handler for Enter key
    input.removeEventListener('keydown', handleMessageKeydown);
    input.addEventListener('keydown', handleMessageKeydown);

    console.log("Message form setup complete");
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

function appendMessageToChat(message) {
    const container = $('messagesContainer');
    if (!container) return;

    // Remove empty state if it exists
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

    // Check if we can add to the last group
    const lastGroup = container.lastElementChild;
    
    if (lastGroup && lastGroup.classList.contains('message-group')) {
        const lastGroupIsMe = lastGroup.classList.contains('sent');
        const lastMessageTime = lastGroup.lastMessageTime ? new Date(lastGroup.lastMessageTime) : null;
        
        // If same sender and within 5 minutes, add to existing group
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

            lastGroup.appendChild(messageDiv);
            lastGroup.lastMessageTime = messageData.created_at;
            container.scrollTop = container.scrollHeight;
            return;
        }
    }

    // Create new group
    const groupDiv = document.createElement('div');
    groupDiv.className = `message-group ${isMe ? 'sent' : 'received'}`;
    groupDiv.lastMessageTime = messageData.created_at;
    
    // Add sender name for received messages
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


// Image viewer function
function openImageViewer(imageUrl) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
  modal.style.zIndex = '9999';
  
  modal.innerHTML = `
    <div style="position: relative; max-width: 90%; max-height: 90vh;">
      <img src="${imageUrl}" style="max-width: 100%; max-height: 90vh; border-radius: 8px; object-fit: contain;">
      <button onclick="this.closest('.modal').remove()" 
              style="position: absolute; top: -40px; right: -40px; background: var(--card-bg); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">
        <i class="fas fa-times"></i>
      </button>
      <a href="${imageUrl}" download 
         style="position: absolute; bottom: -40px; right: -40px; background: var(--accent-blue); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; text-decoration: none; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">
        <i class="fas fa-download"></i>
      </a>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on click outside image
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

async function debugCurrentConversation() {
    if (!window.activeConversationId) {
        console.log("No active conversation");
        return;
    }

    console.log("Debugging conversation:", window.activeConversationId);

    try {
        // Check conversation details
        const convRes = await fetch(`/api/debug/conversation/${window.activeConversationId}`, {
            credentials: 'include'
        });
        const convData = await convRes.json();
        console.log("Conversation details:", convData);

        // Check messages
        const msgRes = await fetch(`/api/messages/${window.activeConversationId}`, {
            credentials: 'include'
        });
        const msgData = await msgRes.json();
        console.log("Messages:", msgData);

        // Check if user has access
        if (!convData.can_access) {
            console.error("❌ User does NOT have access to this conversation!");
            console.log("User ID:", currentUser?.id);
            console.log("Client ID:", convData.client_id);
            console.log("Freelancer ID:", convData.freelancer_id);
        } else {
            console.log("✅ User has access to this conversation");
        }

        return { conversation: convData, messages: msgData };

    } catch (err) {
        console.error("Debug error:", err);
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
        const badge = document.getElementById("inboxBadge");

        if (!badge) {
            // Create badge if it doesn't exist
            const inboxButton = document.querySelector('button[onclick="showInbox()"]');
            if (inboxButton && !document.getElementById('inboxBadge')) {
                inboxButton.innerHTML = '📩 Inbox <span id="inboxBadge" class="badge hidden"></span>';
                checkUnreadMessages(); // Recursive call to check again
            }
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

    } catch (error) {}
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

    switch (category) {
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

/*********************
 *  Page Navigation  *
 *********************/
function showInbox() {
    hideAllPages();
    const inboxPage = document.getElementById('inboxPage');
    if (inboxPage) {
        inboxPage.classList.remove('hidden');
        setupMessageForm();
        loadConversations();
        startMessagePolling();
        
        // Hide badge when opening inbox
        const badge = document.getElementById('inboxBadge');
        if (badge) {
            badge.classList.add('hidden');
        }
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

// Add this to your service.js
let messagePollingInterval = null;

function startMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
    }

    let lastConversationCount = 0;
    let lastMessageCount = {};
    let connectionErrorCount = 0;

    messagePollingInterval = setInterval(async () => {
        // Only poll if user is logged in
        if (!currentUser) return;

        const inboxPage = $('inboxPage');
        if (!inboxPage || inboxPage.classList.contains('hidden')) return;

        try {
            // Check for new conversations first
            const convRes = await fetch("/api/messages/conversations", {
                credentials: "include"
            });

            if (!convRes.ok) {
                throw new Error(`HTTP error! status: ${convRes.status}`);
            }

            // Reset error count on successful connection
            connectionErrorCount = 0;

            const conversations = await convRes.json();
            const currentCount = conversations.length;

            // Only reload if conversation count changed
            if (currentCount !== lastConversationCount) {
                console.log("Conversation count changed, reloading...");
                await loadConversations();
                lastConversationCount = currentCount;
            }

            // If there's an active conversation, check for new messages
            if (window.activeConversationId) {
                const msgRes = await fetch(`/api/messages/${window.activeConversationId}`, {
                    credentials: "include"
                });

                if (msgRes.ok) {
                    const messages = await msgRes.json();
                    const currentMsgCount = messages.length;
                    const lastCount = lastMessageCount[window.activeConversationId] || 0;

                    // Only reload if message count changed
                    if (currentMsgCount > lastCount) {
                        console.log("New messages detected, reloading...");
                        await loadMessagesForConversation(window.activeConversationId);

                        // Mark as read
                        await fetch("/api/messages/mark-read", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ conversation_id: window.activeConversationId })
                        });

                        // Update conversation list to show latest message
                        await loadConversations();
                    }

                    lastMessageCount[window.activeConversationId] = currentMsgCount;
                }
            }

            // Update header badge
            checkUnreadMessages();

        } catch (e) {
            connectionErrorCount++;
            console.error(`Error in polling (attempt ${connectionErrorCount}):`, e.message);

            // Show a subtle indicator that connection is lost
            const inboxHeader = document.querySelector('.inbox-header h3');
            if (inboxHeader && connectionErrorCount > 3) {
                inboxHeader.innerHTML = 'Messages <span style="color: #ef4444; font-size: 0.8rem;">(Disconnected)</span>';
            }
        }
    }, 5000);
}

function stopMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
        messagePollingInterval = null;
    }
}

// Update showInbox to start polling
function showInbox() {
    hideAllPages();
    const inboxPage = $('inboxPage');
    if (inboxPage) {
        inboxPage.classList.remove('hidden');
        setupMessageForm();
        loadConversations();
        startMessagePolling(); // Start polling when inbox opens
    }
}

// Add function to stop polling when leaving inbox
function hideInbox() {
    stopMessagePolling();
    // ... rest of hide logic
}

// Update hideAllPages to stop polling
function hideAllPages() {
    stopMessagePolling(); // Stop polling when leaving inbox

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
    } catch (error) {}

    try {
        const convRes = await fetch('/api/messages/conversations', {
            credentials: "include"
        });
        const conversations = await convRes.json();
    } catch (error) {}
}

/*********************
 *  Admin Deleted Services *
 *********************/
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

/*********************
 *  Service Form Submission *
 *********************/
// Update handleServiceFormSubmit to check for subscription errors
async function handleServiceFormSubmit(e) {
  e.preventDefault();

  const finalCategory = getSelectedCategoryFromEnhancedForm();

  if (!finalCategory) {
    showToast('❌ Please either select an existing category or enter a new one', 'error');
    return;
  }

  const serviceData = {
    title: $("serviceTitle").value.trim(),
    description: $("serviceDescription").value.trim(),
    category: finalCategory,
    hourly_rate: $("hourlyRate").value || null,
    fixed_price: $("fixedPrice").value || null
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
      credentials: 'include',
      body: JSON.stringify(serviceData)
    });

    const data = await response.json();

    if (!response.ok) {
      // Check if it's a subscription error
      if (data.requiresSubscription) {
        showToast('❌ Your free trial has expired. Please subscribe to continue.', 'error');
        // Show subscription modal
        showSubscriptionModal();
        return;
      }
      throw new Error(data.error || 'Failed to create service');
    }

    showToast('🎉 Service created successfully!', 'success');
    $("serviceForm").reset();
    hideCreateServiceForm();
    await loadCategories();
    if (userRole === 'freelancer') await loadMyServices();
    await loadServices();

  } catch (error) {
    showToast("❌ Failed to create service: " + error.message, 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

// Add subscription modal function
function showSubscriptionModal() {
  const modalHtml = `
    <div id="subscriptionModal" class="modal" style="display: flex;">
      <div class="modal-card" style="max-width: 500px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="margin:0;color:var(--text-light);">Subscription Required</h3>
          <span onclick="closeSubscriptionModal()" class="close-x" style="cursor:pointer">&times;</span>
        </div>
        
        <div style="background: rgba(255, 152, 0, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin:0;color:#ff9800;font-weight:500;">
            <i class="fas fa-exclamation-triangle"></i> Free Trial Expired
          </p>
          <p style="margin:10px 0 0 0;color:var(--text-light);">
            Your 90-day free trial has ended. To continue using services, please subscribe to one of our plans.
          </p>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">
          <div style="background: var(--card-bg); padding: 20px; border-radius: 12px; text-align: center;">
            <h4 style="color: var(--text-light); margin-bottom: 10px;">Monthly</h4>
            <div style="font-size: 2rem; color: var(--accent-gold); font-weight: bold; margin-bottom: 10px;">$5</div>
            <p style="color: var(--text-gray); font-size: 0.9rem; margin-bottom: 15px;">per month</p>
            <button onclick="subscribe('monthly')" class="btn btn-primary" style="width: 100%;">Subscribe</button>
          </div>
          
          <div style="background: var(--card-bg); padding: 20px; border-radius: 12px; text-align: center;">
            <h4 style="color: var(--text-light); margin-bottom: 10px;">Yearly</h4>
            <div style="font-size: 2rem; color: var(--accent-gold); font-weight: bold; margin-bottom: 10px;">$57.50</div>
            <p style="color: var(--text-gray); font-size: 0.9rem; margin-bottom: 15px;">per year (save 4%)</p>
            <button onclick="subscribe('yearly')" class="btn btn-primary" style="width: 100%;">Subscribe</button>
          </div>
        </div>
        
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button onclick="closeSubscriptionModal()" class="btn btn-secondary" style="flex:1;padding:14px;">
            <i class="fas fa-times"></i> Later
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeSubscriptionModal() {
  const modal = document.getElementById('subscriptionModal');
  if (modal) modal.remove();
}

/*********************
 *  Render Services  *
 *********************/
// =================== RENDER SERVICES - FIXED ===================
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

        const providerPictureHtml = service.profile_picture_url ?
            `<div class="profile-picture-wrapper">
                <img src="${service.profile_picture_url}" alt="${providerName}" class="provider-profile-picture"
                     onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'provider-initials\\'>${providerName.charAt(0).toUpperCase()}</div>';">
            </div>` :
            `<div class="provider-initials">${providerName.charAt(0).toUpperCase()}</div>`;

        // Check if user is logged in and their role
        const isLoggedIn = !!currentUser;
        const isClient = currentUser?.role === 'client';
        const isFreelancer = currentUser?.role === 'freelancer';
        const isAdmin = currentUser?.role === 'admin';
        const isOwner = currentUser?.id === userId;

        let actionButtons = '';

        // Always show Chat and View Profile for everyone
        actionButtons += `
            <button class="btn chat-btn" onclick="startConversationWithService(${serviceId}, ${userId})">
                <i class="fas fa-comments"></i> Chat
            </button>
            <button class="btn profile-btn" onclick="openFreelancerProfile(${userId})">
                <i class="fas fa-user"></i> View Profile
            </button>
        `;

        // Add Recruit button for clients
        if (isLoggedIn && isClient && !isOwner) {
            actionButtons += `
                <button class="btn recruit-btn" onclick="recruitFreelancer(${userId}, ${serviceId})">
                    <i class="fas fa-user-plus"></i> Recruit
                </button>
            `;
        }

        // Add Favorite button for logged-in users (except owners)
        if (isLoggedIn && !isOwner) {
            actionButtons += `
                <button class="btn favorite-btn" onclick="toggleServiceFavorite(${serviceId})" data-service-id="${serviceId}">
                    <i class="far fa-heart"></i>
                </button>
            `;
        }

        // Add Review button for clients who have used this service
        if (isLoggedIn && isClient) {
            actionButtons += `
                <button class="btn btn-secondary" onclick="showReviewModal(${serviceId}, '${escapeHtml(title)}')">
                    <i class="fas fa-star"></i> Review
                </button>
            `;
        }

        // Add Delete button for owners and admins
        if (isLoggedIn && (isOwner || isAdmin)) {
            actionButtons += `
                <button class="btn btn-danger" onclick="confirmDeleteService(${serviceId}, '${escapeHtml(title)}', ${userId}, ${isOwner})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            `;
        }

        // Add rating display if available
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

                <div class="service-actions">
                    ${actionButtons}
                </div>

                <button class="btn btn-secondary view-details-btn" onclick="viewServiceDetailsModal(${serviceId})" style="width:100%; margin-top:10px;">
                    <i class="fas fa-info-circle"></i> View Details
                </button>
            </div>
        `;
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

/*********************
 *  Admin Delete Service *
 *********************/
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
async function logServiceDeletion({ serviceId, userId, serviceTitle, reason, deletedBy, isFlagged = false }) {
  try {
    await db.query(`
      INSERT INTO service_delete_tracking 
      (user_id, service_id, delete_reason, flagged)
      VALUES (?, ?, ?, ?)
    `, [userId, serviceId, reason, isFlagged]);
    
    if (isFlagged) {
      await updateUserMonitoring(userId);
    }
    
  } catch (error) {}
}

async function updateUserMonitoring(userId) {
  try {
    const [userRows] = await db.query(
      "SELECT username, email FROM users WHERE id = ?",
      [userId]
    );
    
    if (userRows.length === 0) return;
    
    const user = userRows[0];
    
    const [deleteCountRows] = await db.query(`
      SELECT COUNT(*) as count FROM service_delete_tracking 
      WHERE user_id = ? AND deleted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `, [userId]);
    
    const deleteCount = deleteCountRows[0].count;
    
    const [monitoringRows] = await db.query(
      "SELECT id FROM user_delete_monitoring WHERE user_id = ?",
      [userId]
    );
    
    if (monitoringRows.length === 0) {
      await db.query(`
        INSERT INTO user_delete_monitoring 
        (user_id, username, email, delete_count_last_7_days, is_flagged, flagged_reason, flagged_at)
        VALUES (?, ?, ?, ?, TRUE, ?, NOW())
      `, [userId, user.username, user.email, deleteCount, 'Multiple service deletions detected']);
    } else {
      await db.query(`
        UPDATE user_delete_monitoring 
        SET delete_count_last_7_days = ?, 
            is_flagged = TRUE,
            flagged_reason = CONCAT(COALESCE(flagged_reason, ''), ' | Multiple deletions detected on ', NOW()),
            flagged_at = NOW(),
            reviewed = FALSE
        WHERE user_id = ?
      `, [deleteCount, userId]);
    }
    
  } catch (error) {}
}

async function checkAndEnforceDeleteLimits(userId) {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [userRows] = await db.query(
            "SELECT daily_delete_count, last_delete_date FROM users WHERE id = ?",
            [userId]
        );

        if (!userRows || userRows.length === 0) {
            throw new Error("User not found for delete limit check");
        }

        const user = userRows[0];
        const lastDeleteDate = user.last_delete_date
            ? new Date(user.last_delete_date).toISOString().split('T')[0]
            : null;
        const dailyCount = user.daily_delete_count || 0;

        let remainingDeletes = 3;

        if (lastDeleteDate === today) {
            remainingDeletes = 3 - dailyCount;
        }

        if (remainingDeletes <= 0) {
            throw new Error("You have reached your daily delete limit (3 per day).");
        }

        if (lastDeleteDate === today) {
            await db.query(
                "UPDATE users SET daily_delete_count = daily_delete_count + 1 WHERE id = ?",
                [userId]
            );
        } else {
            await db.query(
                "UPDATE users SET daily_delete_count = 1, last_delete_date = ? WHERE id = ?",
                [today, userId]
            );
        }

        return remainingDeletes;
    } catch (err) {
        throw err;
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
// Add review for a service
async function addServiceReview(serviceId, rating, comment) {
    if (!currentUser) {
        showToast('Please login to review', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/services/${serviceId}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ rating, comment })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to add review');
        }

        showToast('✅ Review added successfully!', 'success');
        return data;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

// Load service reviews
async function loadServiceReviews(serviceId) {
    try {
        const response = await fetch(`/api/services/${serviceId}/reviews`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load reviews');
        }

        return data.reviews || [];
    } catch (error) {
        console.error('Error loading reviews:', error);
        return [];
    }
}
// Load service packages
async function loadServicePackages(serviceId) {
    try {
        const response = await fetch(`/api/services/${serviceId}/packages`, {
            credentials: 'include'
        });

        const packages = await response.json();
        return packages || [];
    } catch (error) {
        console.error('Error loading packages:', error);
        return [];
    }
}

// Order a service package
async function orderServicePackage(serviceId, packageId, requirements) {
    if (!currentUser) {
        showToast('Please login to order', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/services/${serviceId}/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ package_id: packageId, requirements })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to place order');
        }

        showToast('✅ Order placed successfully!', 'success');
        return data;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}
// Load freelancer notifications
async function loadFreelancerNotifications() {
    if (!currentUser || currentUser.role !== 'freelancer') return [];

    try {
        const response = await fetch('/api/freelancer/notifications', {
            credentials: 'include'
        });

        const notifications = await response.json();
        return notifications || [];
    } catch (error) {
        console.error('Error loading notifications:', error);
        return [];
    }
}

// Mark notification as read
async function markNotificationRead(notificationId) {
    try {
        const response = await fetch(`/api/freelancer/notifications/${notificationId}/read`, {
            method: 'PUT',
            credentials: 'include'
        });

        return response.ok;
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return false;
    }
}
// Load freelancer dashboard stats
async function loadFreelancerDashboard() {
    if (!currentUser || currentUser.role !== 'freelancer') return null;

    try {
        const response = await fetch('/api/freelancer/dashboard', {
            credentials: 'include'
        });

        if (!response.ok) return null;

        const data = await response.json();
        
        // Update dashboard UI elements
        if (data.services) {
            safeSetText('dashboardServices', data.services.active_services || 0);
            safeSetText('totalServices', data.services.total_services || 0);
        }
        
        if (data.orders) {
            safeSetText('dashboardEarnings', `$${data.orders.net_earnings || 0}`);
            safeSetText('totalEarnings', `$${data.orders.total_revenue || 0}`);
        }
        
        if (data.clients) {
            safeSetText('dashboardClients', data.clients.length || 0);
        }
        
        if (data.services) {
            safeSetText('dashboardRating', (data.services.avg_rating || 0).toFixed(1));
            safeSetText('avgRating', (data.services.avg_rating || 0).toFixed(1));
        }

        return data;
    } catch (error) {
        console.error('Error loading dashboard:', error);
        return null;
    }
}
/*********************
 *  Profile Functionality *
 *********************/
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
        const pictureUrl = freelancerProfile.profile_picture.includes('?') ?
            freelancerProfile.profile_picture :
            freelancerProfile.profile_picture + '?t=' + timestamp;

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
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

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

    } catch (error) {}
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
// Add these functions to your service.js file

/*********************
 *  Service Reviews System
 *********************/
// =================== REVIEW MODAL - FIXED ===================
function showReviewModal(serviceId, serviceTitle) {
    const modalHtml = `
        <div id="reviewModal" class="modal" style="display: flex;">
            <div class="modal-card" style="max-width: 500px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;color:var(--text-light);">Review Service</h3>
                    <span onclick="closeReviewModal()" class="close-x" style="cursor:pointer">&times;</span>
                </div>
                
                <p style="color: var(--text-gray); margin-bottom: 15px;">Reviewing: <strong>${escapeHtml(serviceTitle)}</strong></p>
                
                <div style="margin-bottom: 20px;">
                    <label style="color: var(--text-light); display: block; margin-bottom: 10px;">Rating</label>
                    <div class="star-rating" style="display: flex; gap: 10px; font-size: 2rem;">
                        ${[1,2,3,4,5].map(num => `
                            <span class="star" data-rating="${num}" onclick="setRating(${num})" 
                                  style="cursor: pointer; color: var(--text-gray); transition: color 0.2s;">★</span>
                        `).join('')}
                    </div>
                    <input type="hidden" id="reviewRating" value="0">
                </div>
                
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="color: var(--text-light); display: block; margin-bottom: 10px;">Your Review</label>
                    <textarea id="reviewComment" rows="4" style="width:100%;padding:12px;border-radius:8px;background:var(--card-bg);border:2px solid rgba(255,255,255,0.1);color:var(--text-light);" placeholder="Share your experience..."></textarea>
                </div>
                
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button onclick="submitReview(${serviceId})" class="btn btn-primary" style="flex:1;padding:14px;">
                        <i class="fas fa-star"></i> Submit Review
                    </button>
                    <button onclick="closeReviewModal()" class="btn btn-secondary" style="flex:1;padding:14px;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Add hover effects for stars
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('mouseover', function() {
            const rating = this.dataset.rating;
            highlightStars(rating);
        });
        star.addEventListener('mouseout', function() {
            const currentRating = document.getElementById('reviewRating').value;
            highlightStars(currentRating);
        });
    });
}

function closeReviewModal() {
    const modal = document.getElementById('reviewModal');
    if (modal) modal.remove();
}

let currentRating = 0;

function setRating(rating) {
    currentRating = rating;
    document.getElementById('reviewRating').value = rating;
    highlightStars(rating);
}

function highlightStars(rating) {
    document.querySelectorAll('.star').forEach((star, index) => {
        if (index < rating) {
            star.style.color = 'var(--accent-gold)';
        } else {
            star.style.color = 'var(--text-gray)';
        }
    });
}

async function submitReview(serviceId) {
    const rating = document.getElementById('reviewRating').value;
    const comment = document.getElementById('reviewComment').value.trim();

    if (rating === '0') {
        showToast('Please select a rating', 'error');
        return;
    }

    if (!comment) {
        showToast('Please write a review comment', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/services/${serviceId}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ rating: parseInt(rating), comment })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to add review');
        }

        showToast('✅ Review added successfully!', 'success');
        closeReviewModal();
        
        // Refresh service details if modal is open
        if (window.currentServiceId === serviceId) {
            loadServiceDetails(serviceId);
        }
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

// =================== CONFIRM DELETE - FIXED ===================
function confirmDeleteService(serviceId, serviceTitle, userId, isOwner) {
    const isAdmin = currentUser && currentUser.role === 'admin';
    const canDelete = isAdmin || isOwner || (currentUser && currentUser.id === userId);

    if (!canDelete) {
        showToast('You can only delete your own services', 'error');
        return;
    }

    if (isAdmin) {
        createAdminDeleteModal(serviceId, serviceTitle, userId);
    } else if (isOwner) {
        createFreelancerDeleteModal(serviceId, serviceTitle, userId);
    }
}

/*********************
 *  Service Products System
 *********************/

// Load products for a service
async function loadServiceProducts(serviceId) {
    try {
        const response = await fetch(`/api/services/${serviceId}/products`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load products');
        
        const products = await response.json();
        return products || [];
    } catch (error) {
        console.error('Error loading service products:', error);
        return [];
    }
}

// Buy a service product
async function buyServiceProduct(serviceId, productId) {
    if (!currentUser) {
        showToast('Please login to purchase', 'warning');
        openModal($('loginModal'));
        return;
    }

    try {
        const response = await fetch(`/api/services/${serviceId}/products/${productId}/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to process purchase');
        }

        if (data.link) {
            window.location.href = data.link;
        } else {
            showToast('✅ Purchase successful!', 'success');
        }
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

// Show service products modal
function showServiceProductsModal(serviceId, serviceTitle) {
    loadServiceProducts(serviceId).then(products => {
        const modalHtml = `
            <div id="serviceProductsModal" class="modal" style="display: flex;">
                <div class="modal-card" style="max-width: 600px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h3 style="margin:0;color:var(--text-light);">Service Products</h3>
                        <span onclick="closeServiceProductsModal()" class="close-x" style="cursor:pointer">&times;</span>
                    </div>
                    
                    <p style="color: var(--text-gray); margin-bottom: 20px;">Service: <strong>${escapeHtml(serviceTitle)}</strong></p>
                    
                    <div id="productsList" style="max-height: 400px; overflow-y: auto;">
                        ${products.length === 0 ? `
                            <div style="text-align: center; padding: 40px;">
                                <i class="fas fa-box-open" style="font-size: 3rem; color: var(--text-gray); margin-bottom: 15px;"></i>
                                <p style="color: var(--text-gray);">No products available for this service yet.</p>
                            </div>
                        ` : products.map(product => `
                            <div style="background: var(--card-bg); border-radius: 12px; padding: 20px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.1);">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                    <h4 style="color: var(--text-light); margin: 0;">${escapeHtml(product.title)}</h4>
                                    <span style="background: var(--accent-gold); color: #000; padding: 5px 12px; border-radius: 20px; font-weight: 600;">
                                        $${product.price}
                                    </span>
                                </div>
                                <p style="color: var(--text-gray); margin-bottom: 15px;">${escapeHtml(product.description || 'No description')}</p>
                                <button onclick="buyServiceProduct(${serviceId}, ${product.id})" class="btn btn-primary" style="width: 100%;">
                                    <i class="fas fa-shopping-cart"></i> Purchase Now
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div style="display:flex;gap:12px;margin-top:20px;">
                        <button onclick="closeServiceProductsModal()" class="btn btn-secondary" style="flex:1;padding:14px;">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    });
}

function closeServiceProductsModal() {
    const modal = document.getElementById('serviceProductsModal');
    if (modal) modal.remove();
}

/*********************
 *  Service Orders System
 *********************/

// Load client orders
async function loadClientOrders() {
    if (!currentUser) return [];

    try {
        const response = await fetch('/api/orders/client', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load orders');
        
        const orders = await response.json();
        return orders || [];
    } catch (error) {
        console.error('Error loading client orders:', error);
        return [];
    }
}

// Load freelancer orders
async function loadFreelancerOrders() {
    if (!currentUser) return [];

    try {
        const response = await fetch('/api/orders/freelancer', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load orders');
        
        const orders = await response.json();
        return orders || [];
    } catch (error) {
        console.error('Error loading freelancer orders:', error);
        return [];
    }
}

// Load order details
async function loadOrderDetails(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load order');
        
        const order = await response.json();
        return order;
    } catch (error) {
        console.error('Error loading order details:', error);
        return null;
    }
}

// Update order status
async function updateOrderStatus(orderId, status) {
    if (!currentUser) return false;

    try {
        const response = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update order');
        }

        showToast('✅ Order status updated!', 'success');
        return true;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
        return false;
    }
}

// Deliver order
async function deliverOrder(orderId, message, files) {
    if (!currentUser) return false;

    const formData = new FormData();
    formData.append('message', message);
    files.forEach(file => formData.append('files', file));

    try {
        const response = await fetch(`/api/orders/${orderId}/deliver`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit delivery');
        }

        showToast('✅ Delivery submitted!', 'success');
        return true;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
        return false;
    }
}

// Review delivery
async function reviewDelivery(deliveryId, status, feedback, rating) {
    if (!currentUser) return false;

    try {
        const response = await fetch(`/api/deliveries/${deliveryId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status, feedback, rating })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to review delivery');
        }

        showToast('✅ Delivery reviewed!', 'success');
        return true;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
        return false;
    }
}

// Raise dispute
async function raiseDispute(orderId, reason, evidence) {
    if (!currentUser) return false;

    try {
        const response = await fetch(`/api/orders/${orderId}/dispute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ reason, evidence })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to raise dispute');
        }

        showToast('✅ Dispute raised! Admin will review.', 'success');
        return true;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
        return false;
    }
}

// Show order details modal
function showOrderDetailsModal(orderId) {
    loadOrderDetails(orderId).then(order => {
        if (!order) {
            showToast('Failed to load order details', 'error');
            return;
        }

        const isClient = order.client_id === currentUser?.id;
        const isFreelancer = order.freelancer_id === currentUser?.id;

        const modalHtml = `
            <div id="orderDetailsModal" class="modal" style="display: flex;">
                <div class="modal-card" style="max-width: 700px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h3 style="margin:0;color:var(--text-light);">Order #${order.order_number}</h3>
                        <span onclick="closeOrderDetailsModal()" class="close-x" style="cursor:pointer">&times;</span>
                    </div>
                    
                    <div style="background: var(--card-bg); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 15px;">
                            <div>
                                <div style="color: var(--text-gray); font-size: 0.85rem;">Status</div>
                                <div style="color: var(--text-light); font-weight: 600;">${order.status}</div>
                            </div>
                            <div>
                                <div style="color: var(--text-gray); font-size: 0.85rem;">Amount</div>
                                <div style="color: var(--accent-gold); font-weight: 600;">$${order.amount}</div>
                            </div>
                            <div>
                                <div style="color: var(--text-gray); font-size: 0.85rem;">Service</div>
                                <div style="color: var(--text-light);">${escapeHtml(order.service_title)}</div>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <div style="color: var(--text-gray); font-size: 0.85rem;">Client</div>
                            <div style="color: var(--text-light);">${escapeHtml(order.client_name)}</div>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <div style="color: var(--text-gray); font-size: 0.85rem;">Freelancer</div>
                            <div style="color: var(--text-light);">${escapeHtml(order.freelancer_name)}</div>
                        </div>
                        
                        ${order.requirements ? `
                            <div>
                                <div style="color: var(--text-gray); font-size: 0.85rem;">Requirements</div>
                                <div style="color: var(--text-light);">${escapeHtml(order.requirements)}</div>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${order.deliveries && order.deliveries.length > 0 ? `
                        <div style="margin-bottom: 20px;">
                            <h4 style="color: var(--text-light); margin-bottom: 15px;">Deliveries</h4>
                            ${order.deliveries.map(delivery => `
                                <div style="background: var(--card-bg); padding: 15px; border-radius: 12px; margin-bottom: 10px;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                        <span style="color: var(--accent-blue);">Delivery #${delivery.revision_number}</span>
                                        <span style="color: var(--text-gray);">${new Date(delivery.delivered_at).toLocaleDateString()}</span>
                                    </div>
                                    <p style="color: var(--text-light); margin-bottom: 10px;">${escapeHtml(delivery.delivery_message)}</p>
                                    ${delivery.files && delivery.files.length > 0 ? `
                                        <div style="margin-top: 10px;">
                                            <span style="color: var(--text-gray); font-size: 0.85rem;">Attachments:</span>
                                            <div style="display: flex; gap: 10px; margin-top: 5px;">
                                                ${JSON.parse(delivery.files).map(file => `
                                                    <a href="${file}" target="_blank" style="color: var(--accent-blue);">📎 File</a>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${order.dispute ? `
                        <div style="background: rgba(239, 68, 68, 0.1); padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                            <h4 style="color: #ef4444; margin-bottom: 10px;">Dispute Active</h4>
                            <p style="color: var(--text-light);">Reason: ${escapeHtml(order.dispute.reason)}</p>
                            <p style="color: var(--text-gray);">Status: ${order.dispute.status}</p>
                        </div>
                    ` : ''}
                    
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        ${isFreelancer && order.status === 'active' ? `
                            <button onclick="showDeliverModal(${order.id})" class="btn btn-primary">
                                <i class="fas fa-upload"></i> Submit Delivery
                            </button>
                        ` : ''}
                        
                        ${(isClient || isFreelancer) && order.status !== 'disputed' && order.status !== 'completed' ? `
                            <button onclick="showDisputeModal(${order.id})" class="btn btn-danger">
                                <i class="fas fa-gavel"></i> Raise Dispute
                            </button>
                        ` : ''}
                        
                        ${isFreelancer && order.status === 'pending' ? `
                            <button onclick="updateOrderStatus(${order.id}, 'active')" class="btn btn-success">
                                <i class="fas fa-play"></i> Start Order
                            </button>
                        ` : ''}
                        
                        ${isClient && order.status === 'delivered' ? `
                            <button onclick="showReviewDeliveryModal(${order.id})" class="btn btn-success">
                                <i class="fas fa-check-circle"></i> Review Delivery
                            </button>
                        ` : ''}
                        
                        <button onclick="closeOrderDetailsModal()" class="btn btn-secondary">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    });
}

function closeOrderDetailsModal() {
    const modal = document.getElementById('orderDetailsModal');
    if (modal) modal.remove();
}

function showDeliverModal(orderId) {
    const modalHtml = `
        <div id="deliverModal" class="modal" style="display: flex;">
            <div class="modal-card" style="max-width: 500px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;color:var(--text-light);">Submit Delivery</h3>
                    <span onclick="closeDeliverModal()" class="close-x" style="cursor:pointer">&times;</span>
                </div>
                
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="color: var(--text-light); display: block; margin-bottom: 10px;">Delivery Message</label>
                    <textarea id="deliveryMessage" rows="4" style="width:100%;padding:12px;border-radius:8px;background:var(--card-bg);border:2px solid rgba(255,255,255,0.1);color:var(--text-light);" placeholder="Describe what you've delivered..."></textarea>
                </div>
                
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="color: var(--text-light); display: block; margin-bottom: 10px;">Attach Files</label>
                    <input type="file" id="deliveryFiles" multiple style="width:100%;padding:12px;border-radius:8px;background:var(--card-bg);color:var(--text-light);">
                </div>
                
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button onclick="submitDelivery(${orderId})" class="btn btn-primary" style="flex:1;padding:14px;">
                        <i class="fas fa-paper-plane"></i> Submit Delivery
                    </button>
                    <button onclick="closeDeliverModal()" class="btn btn-secondary" style="flex:1;padding:14px;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeDeliverModal() {
    const modal = document.getElementById('deliverModal');
    if (modal) modal.remove();
}

async function submitDelivery(orderId) {
    const message = document.getElementById('deliveryMessage').value.trim();
    const files = document.getElementById('deliveryFiles').files;

    if (!message) {
        showToast('Please enter a delivery message', 'error');
        return;
    }

    const success = await deliverOrder(orderId, message, files);
    if (success) {
        closeDeliverModal();
        closeOrderDetailsModal();
    }
}

function showDisputeModal(orderId) {
    const modalHtml = `
        <div id="disputeModal" class="modal" style="display: flex;">
            <div class="modal-card" style="max-width: 500px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;color:#ef4444;">Raise a Dispute</h3>
                    <span onclick="closeDisputeModal()" class="close-x" style="cursor:pointer">&times;</span>
                </div>
                
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="color: var(--text-light); display: block; margin-bottom: 10px;">Reason for Dispute</label>
                    <textarea id="disputeReason" rows="4" style="width:100%;padding:12px;border-radius:8px;background:var(--card-bg);border:2px solid rgba(239,68,68,0.3);color:var(--text-light);" placeholder="Explain why you're raising this dispute..."></textarea>
                </div>
                
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button onclick="submitDispute(${orderId})" class="btn btn-danger" style="flex:1;padding:14px;">
                        <i class="fas fa-gavel"></i> Raise Dispute
                    </button>
                    <button onclick="closeDisputeModal()" class="btn btn-secondary" style="flex:1;padding:14px;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeDisputeModal() {
    const modal = document.getElementById('disputeModal');
    if (modal) modal.remove();
}

async function submitDispute(orderId) {
    const reason = document.getElementById('disputeReason').value.trim();

    if (!reason) {
        showToast('Please provide a reason for the dispute', 'error');
        return;
    }

    const success = await raiseDispute(orderId, reason, []);
    if (success) {
        closeDisputeModal();
        closeOrderDetailsModal();
    }
}

/*********************
 *  Service Favorites System
 *********************/

// Toggle favorite
async function toggleServiceFavorite(serviceId) {
    if (!currentUser) {
        showToast('Please login to favorite services', 'warning');
        openModal($('loginModal'));
        return false;
    }

    try {
        const response = await fetch(`/api/services/${serviceId}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to toggle favorite');
        }

        const isFavorited = data.favorited;
        showToast(isFavorited ? '✅ Added to favorites!' : 'Removed from favorites', isFavorited ? 'success' : 'info');
        
        // Update favorite button if present
        updateFavoriteButton(serviceId, isFavorited);
        
        return isFavorited;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
        return false;
    }
}

// Check if service is favorited
async function checkServiceFavorite(serviceId) {
    if (!currentUser) return false;

    try {
        const response = await fetch(`/api/services/${serviceId}/is-favorited`, {
            credentials: 'include'
        });

        if (!response.ok) return false;

        const data = await response.json();
        return data.favorited || false;
    } catch (error) {
        console.error('Error checking favorite:', error);
        return false;
    }
}

// Load user favorites
async function loadUserFavorites() {
    if (!currentUser) return [];

    try {
        const response = await fetch('/api/services/favorites', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load favorites');

        const favorites = await response.json();
        return favorites || [];
    } catch (error) {
        console.error('Error loading favorites:', error);
        return [];
    }
}

// Show favorites modal
function showFavoritesModal() {
    loadUserFavorites().then(favorites => {
        const modalHtml = `
            <div id="favoritesModal" class="modal" style="display: flex;">
                <div class="modal-card" style="max-width: 600px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h3 style="margin:0;color:var(--text-light);">My Favorite Services</h3>
                        <span onclick="closeFavoritesModal()" class="close-x" style="cursor:pointer">&times;</span>
                    </div>
                    
                    <div id="favoritesList" style="max-height: 400px; overflow-y: auto;">
                        ${favorites.length === 0 ? `
                            <div style="text-align: center; padding: 40px;">
                                <i class="fas fa-heart" style="font-size: 3rem; color: var(--text-gray); margin-bottom: 15px;"></i>
                                <p style="color: var(--text-gray);">No favorite services yet.</p>
                                <p style="color: var(--text-gray); font-size: 0.9rem;">Click the heart icon on any service to add it to your favorites.</p>
                            </div>
                        ` : favorites.map(fav => `
                            <div style="background: var(--card-bg); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <h4 style="color: var(--text-light); margin: 0 0 5px 0;">${escapeHtml(fav.title)}</h4>
                                    <p style="color: var(--text-gray); font-size: 0.9rem;">Provider: ${escapeHtml(fav.username)}</p>
                                    <span style="color: var(--accent-gold); font-weight: 600;">$${fav.price}</span>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button onclick="viewServiceDetails(${fav.service_id})" class="btn btn-secondary" style="padding: 8px 16px;">
                                        View
                                    </button>
                                    <button onclick="toggleServiceFavorite(${fav.service_id})" class="btn btn-danger" style="padding: 8px 16px;">
                                        <i class="fas fa-heart-broken"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div style="display:flex;gap:12px;margin-top:20px;">
                        <button onclick="closeFavoritesModal()" class="btn btn-secondary" style="flex:1;padding:14px;">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    });
}

function closeFavoritesModal() {
    const modal = document.getElementById('favoritesModal');
    if (modal) modal.remove();
}

// Update favorite button
function updateFavoriteButton(serviceId, isFavorited) {
    const button = document.querySelector(`.favorite-btn[data-service-id="${serviceId}"]`);
    if (button) {
        if (isFavorited) {
            button.innerHTML = '<i class="fas fa-heart" style="color: #ef4444;"></i>';
            button.classList.add('favorited');
        } else {
            button.innerHTML = '<i class="far fa-heart"></i>';
            button.classList.remove('favorited');
        }
    }
}

/*********************
 *  Advanced Search System
 *********************/

// Advanced search for services
async function advancedSearchServices(params) {
    try {
        const queryParams = new URLSearchParams();
        
        if (params.q) queryParams.append('q', params.q);
        if (params.category) queryParams.append('category', params.category);
        if (params.min_price) queryParams.append('min_price', params.min_price);
        if (params.max_price) queryParams.append('max_price', params.max_price);
        if (params.min_rating) queryParams.append('min_rating', params.min_rating);
        if (params.delivery_time) queryParams.append('delivery_time', params.delivery_time);
        if (params.sort) queryParams.append('sort', params.sort);
        if (params.page) queryParams.append('page', params.page);
        if (params.limit) queryParams.append('limit', params.limit);

        const response = await fetch(`/api/services/search?${queryParams.toString()}`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to search services');

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error searching services:', error);
        return { services: [], pagination: { total: 0, pages: 0 } };
    }
}

// Get search suggestions
async function getSearchSuggestions(query) {
    if (!query || query.length < 2) return [];

    try {
        const response = await fetch(`/api/services/suggestions?q=${encodeURIComponent(query)}`, {
            credentials: 'include'
        });

        if (!response.ok) return [];

        const suggestions = await response.json();
        return suggestions || [];
    } catch (error) {
        console.error('Error getting suggestions:', error);
        return [];
    }
}

// Show advanced search modal
function showAdvancedSearchModal() {
    const modalHtml = `
        <div id="advancedSearchModal" class="modal" style="display: flex;">
            <div class="modal-card" style="max-width: 600px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;color:var(--text-light);">Advanced Search</h3>
                    <span onclick="closeAdvancedSearchModal()" class="close-x" style="cursor:pointer">&times;</span>
                </div>
                
                <div class="form-group">
                    <label style="color: var(--text-light);">Keywords</label>
                    <input type="text" id="searchKeywords" class="form-input-enhanced" placeholder="Search by title or description...">
                </div>
                
                <div class="form-group">
                    <label style="color: var(--text-light);">Category</label>
                    <select id="searchCategory" class="form-select-enhanced">
                        <option value="">All Categories</option>
                        ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                    </select>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="form-group">
                        <label style="color: var(--text-light);">Min Price ($)</label>
                        <input type="number" id="searchMinPrice" class="form-input-enhanced" min="0" step="1">
                    </div>
                    <div class="form-group">
                        <label style="color: var(--text-light);">Max Price ($)</label>
                        <input type="number" id="searchMaxPrice" class="form-input-enhanced" min="0" step="1">
                    </div>
                </div>
                
                <div class="form-group">
                    <label style="color: var(--text-light);">Minimum Rating</label>
                    <select id="searchMinRating" class="form-select-enhanced">
                        <option value="">Any Rating</option>
                        <option value="4">4+ Stars</option>
                        <option value="3">3+ Stars</option>
                        <option value="2">2+ Stars</option>
                        <option value="1">1+ Star</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="color: var(--text-light);">Delivery Time (max days)</label>
                    <input type="number" id="searchDeliveryTime" class="form-input-enhanced" min="1" step="1" placeholder="e.g., 7">
                </div>
                
                <div class="form-group">
                    <label style="color: var(--text-light);">Sort By</label>
                    <select id="searchSort" class="form-select-enhanced">
                        <option value="relevance">Relevance</option>
                        <option value="newest">Newest First</option>
                        <option value="price_low">Price: Low to High</option>
                        <option value="price_high">Price: High to Low</option>
                        <option value="rating">Highest Rated</option>
                    </select>
                </div>
                
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button onclick="performAdvancedSearch()" class="btn btn-primary" style="flex:1;padding:14px;">
                        <i class="fas fa-search"></i> Search
                    </button>
                    <button onclick="closeAdvancedSearchModal()" class="btn btn-secondary" style="flex:1;padding:14px;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeAdvancedSearchModal() {
    const modal = document.getElementById('advancedSearchModal');
    if (modal) modal.remove();
}

async function performAdvancedSearch() {
    const params = {
        q: document.getElementById('searchKeywords')?.value,
        category: document.getElementById('searchCategory')?.value,
        min_price: document.getElementById('searchMinPrice')?.value,
        max_price: document.getElementById('searchMaxPrice')?.value,
        min_rating: document.getElementById('searchMinRating')?.value,
        delivery_time: document.getElementById('searchDeliveryTime')?.value,
        sort: document.getElementById('searchSort')?.value
    };

    // Remove empty values
    Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
    });

    const results = await advancedSearchServices(params);
    
    closeAdvancedSearchModal();
    
    // Update services list with results
    if (results.services) {
        services = results.services;
        renderServices(services);
        
        // Show result count
        showToast(`Found ${results.pagination.total} services`, 'info');
    }
}

/*********************
 *  Admin Controls
 *********************/

// Load deleted services (admin only)
async function loadDeletedServices() {
    if (!currentUser || currentUser.role !== 'admin') return;

    try {
        const response = await fetch('/api/admin/deleted-services', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load deleted services');

        const services = await response.json();
        return services || [];
    } catch (error) {
        console.error('Error loading deleted services:', error);
        return [];
    }
}

// Load flagged users (admin only)
async function loadFlaggedUsers() {
    if (!currentUser || currentUser.role !== 'admin') return;

    try {
        const response = await fetch('/api/admin/flagged-users', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load flagged users');

        const data = await response.json();
        return data.flagged_users || [];
    } catch (error) {
        console.error('Error loading flagged users:', error);
        return [];
    }
}

// Review flagged user (admin only)
async function reviewFlaggedUser(userId, action, notes) {
    if (!currentUser || currentUser.role !== 'admin') return false;

    try {
        const response = await fetch(`/api/admin/flagged-users/${userId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action, notes })
        });

        if (!response.ok) throw new Error('Failed to review user');

        showToast('✅ User reviewed successfully', 'success');
        return true;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
        return false;
    }
}

// Restore deleted service (admin only)
async function restoreDeletedService(serviceId) {
    if (!currentUser || currentUser.role !== 'admin') return false;

    try {
        const response = await fetch(`/api/admin/services/${serviceId}/restore`, {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to restore service');

        showToast('✅ Service restored successfully', 'success');
        return true;
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
        return false;
    }
}

// Show admin dashboard
function showAdminDashboard() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Admin access required', 'error');
        return;
    }

    Promise.all([
        loadDeletedServices(),
        loadFlaggedUsers()
    ]).then(([deletedServices, flaggedUsers]) => {
        const modalHtml = `
            <div id="adminDashboardModal" class="modal" style="display: flex;">
                <div class="modal-card" style="max-width: 800px; width: 90%;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h3 style="margin:0;color:var(--text-light);">Admin Dashboard</h3>
                        <span onclick="closeAdminDashboard()" class="close-x" style="cursor:pointer">&times;</span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <!-- Deleted Services -->
                        <div>
                            <h4 style="color: var(--text-light); margin-bottom: 15px;">Deleted Services</h4>
                            <div style="max-height: 300px; overflow-y: auto;">
                                ${deletedServices.length === 0 ? `
                                    <p style="color: var(--text-gray);">No deleted services</p>
                                ` : deletedServices.map(service => `
                                    <div style="background: var(--card-bg); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <div>
                                                <h5 style="color: var(--text-light); margin: 0 0 5px 0;">${escapeHtml(service.service_title)}</h5>
                                                <p style="color: var(--text-gray); font-size: 0.85rem;">Deleted: ${new Date(service.deleted_at).toLocaleDateString()}</p>
                                                <p style="color: var(--text-gray); font-size: 0.85rem;">Reason: ${escapeHtml(service.reason)}</p>
                                            </div>
                                            <button onclick="restoreDeletedService(${service.service_id})" class="btn btn-success" style="padding: 8px 16px;">
                                                Restore
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <!-- Flagged Users -->
                        <div>
                            <h4 style="color: var(--text-light); margin-bottom: 15px;">Flagged Users</h4>
                            <div style="max-height: 300px; overflow-y: auto;">
                                ${flaggedUsers.length === 0 ? `
                                    <p style="color: var(--text-gray);">No flagged users</p>
                                ` : flaggedUsers.map(user => `
                                    <div style="background: var(--card-bg); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                                        <div>
                                            <h5 style="color: var(--text-light); margin: 0 0 5px 0;">${escapeHtml(user.username)}</h5>
                                            <p style="color: var(--text-gray); font-size: 0.85rem;">Delete count: ${user.delete_count_last_7_days}</p>
                                            <p style="color: var(--text-gray); font-size: 0.85rem;">Reason: ${escapeHtml(user.flagged_reason)}</p>
                                        </div>
                                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                                            <button onclick="reviewFlaggedUser(${user.user_id}, 'clear_flag', 'Cleared by admin')" class="btn btn-success" style="padding: 8px 16px;">
                                                Clear Flag
                                            </button>
                                            <button onclick="reviewFlaggedUser(${user.user_id}, 'warning', 'Warning issued')" class="btn btn-warning" style="padding: 8px 16px;">
                                                Issue Warning
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px;">
                        <button onclick="closeAdminDashboard()" class="btn btn-secondary" style="width: 100%; padding: 14px;">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    });
}

function closeAdminDashboard() {
    const modal = document.getElementById('adminDashboardModal');
    if (modal) modal.remove();
}

/*********************
 *  Delete Limits Display
 *********************/

// Check remaining deletes
async function checkRemainingDeletes() {
    if (!currentUser) return 3;

    try {
        const response = await fetch('/api/user/delete-limits', {
            credentials: 'include'
        });

        if (!response.ok) return 3;

        const data = await response.json();
        return data.remaining_deletes;
    } catch (error) {
        console.error('Error checking delete limits:', error);
        return 3;
    }
}

// Show delete limits info
function showDeleteLimitsInfo() {
    checkRemainingDeletes().then(remaining => {
        showToast(`You have ${remaining} service deletions remaining today`, 'info');
    });
}

/*********************
 *  Dashboard Statistics
 *********************/

// Load client dashboard stats
async function loadClientDashboardStats() {
    if (!currentUser || currentUser.role !== 'client') return null;

    try {
        const response = await fetch('/api/client/dashboard', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load dashboard');

        const stats = await response.json();
        return stats;
    } catch (error) {
        console.error('Error loading client dashboard:', error);
        return null;
    }
}

// Load freelancer dashboard stats
async function loadFreelancerDashboardStats() {
    if (!currentUser || currentUser.role !== 'freelancer') return null;

    try {
        const response = await fetch('/api/freelancer/dashboard', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load dashboard');

        const stats = await response.json();
        return stats;
    } catch (error) {
        console.error('Error loading freelancer dashboard:', error);
        return null;
    }
}

// Load seller analytics
async function loadSellerAnalytics() {
    if (!currentUser) return null;

    try {
        const response = await fetch('/api/seller/dashboard/analytics', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load analytics');

        const analytics = await response.json();
        return analytics;
    } catch (error) {
        console.error('Error loading seller analytics:', error);
        return null;
    }
}

// Show seller dashboard
async function showSellerDashboard() {
    if (!currentUser) {
        showToast('Please login', 'warning');
        return;
    }

    const analytics = await loadSellerAnalytics();
    if (!analytics) {
        showToast('Failed to load analytics', 'error');
        return;
    }

    const modalHtml = `
        <div id="sellerDashboardModal" class="modal" style="display: flex;">
            <div class="modal-card" style="max-width: 700px; width: 90%;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;color:var(--text-light);">Seller Dashboard</h3>
                    <span onclick="closeSellerDashboard()" class="close-x" style="cursor:pointer">&times;</span>
                </div>
                
                <!-- Overview Stats -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px;">
                    <div style="background: var(--card-bg); padding: 20px; border-radius: 12px; text-align: center;">
                        <div style="color: var(--accent-gold); font-size: 1.5rem; font-weight: bold; margin-bottom: 5px;">${analytics.analytics?.allTime?.total_orders || 0}</div>
                        <div style="color: var(--text-gray);">Total Orders</div>
                    </div>
                    <div style="background: var(--card-bg); padding: 20px; border-radius: 12px; text-align: center;">
                        <div style="color: var(--accent-gold); font-size: 1.5rem; font-weight: bold; margin-bottom: 5px;">$${analytics.analytics?.allTime?.total_revenue || 0}</div>
                        <div style="color: var(--text-gray);">Revenue</div>
                    </div>
                    <div style="background: var(--card-bg); padding: 20px; border-radius: 12px; text-align: center;">
                        <div style="color: var(--accent-gold); font-size: 1.5rem; font-weight: bold; margin-bottom: 5px;">${analytics.analytics?.today?.today_orders || 0}</div>
                        <div style="color: var(--text-gray);">Today's Orders</div>
                    </div>
                </div>
                
                <!-- Recent Orders -->
                <h4 style="color: var(--text-light); margin-bottom: 15px;">Recent Orders</h4>
                <div style="max-height: 200px; overflow-y: auto; margin-bottom: 20px;">
                    ${analytics.analytics?.recentOrders?.length === 0 ? `
                        <p style="color: var(--text-gray); text-align: center;">No recent orders</p>
                    ` : analytics.analytics?.recentOrders?.map(order => `
                        <div style="background: var(--card-bg); padding: 12px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="color: var(--text-light); font-weight: 500;">${escapeHtml(order.product_name)}</div>
                                <div style="color: var(--text-gray); font-size: 0.85rem;">${order.order_date_short}</div>
                            </div>
                            <div>
                                <span style="color: var(--accent-gold); font-weight: 600;">$${order.total_amount}</span>
                                <span style="color: var(--text-gray); margin-left: 10px;">(${order.quantity})</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- Top Products -->
                <h4 style="color: var(--text-light); margin-bottom: 15px;">Top Products</h4>
                <div style="max-height: 200px; overflow-y: auto;">
                    ${analytics.analytics?.topProducts?.length === 0 ? `
                        <p style="color: var(--text-gray); text-align: center;">No products sold yet</p>
                    ` : analytics.analytics?.topProducts?.map(product => `
                        <div style="background: var(--card-bg); padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text-light);">${escapeHtml(product.product_name)}</span>
                                <span style="color: var(--accent-gold); font-weight: 600;">$${product.revenue}</span>
                            </div>
                            <div style="color: var(--text-gray); font-size: 0.85rem;">${product.order_count} orders</div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="margin-top: 20px;">
                    <button onclick="closeSellerDashboard()" class="btn btn-secondary" style="width: 100%; padding: 14px;">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeSellerDashboard() {
    const modal = document.getElementById('sellerDashboardModal');
    if (modal) modal.remove();
}

// Initialize all new features
function initNewFeatures() {
    // Add favorite buttons to service cards
    document.querySelectorAll('.service-card').forEach(card => {
        const serviceId = card.dataset.serviceId;
        if (serviceId) {
            const actionsDiv = card.querySelector('.service-actions');
            if (actionsDiv) {
                const favoriteBtn = document.createElement('button');
                favoriteBtn.className = 'btn favorite-btn';
                favoriteBtn.setAttribute('data-service-id', serviceId);
                favoriteBtn.innerHTML = '<i class="far fa-heart"></i>';
                favoriteBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleServiceFavorite(serviceId);
                };
                actionsDiv.appendChild(favoriteBtn);
            }
        }
    });

    // Add advanced search button
    const searchContainer = document.querySelector('#browseTab > div');
    if (searchContainer) {
        const advancedSearchBtn = document.createElement('button');
        advancedSearchBtn.className = 'btn btn-secondary';
        advancedSearchBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Advanced';
        advancedSearchBtn.onclick = showAdvancedSearchModal;
        advancedSearchBtn.style.marginLeft = '10px';
        searchContainer.appendChild(advancedSearchBtn);
    }

    // Add favorites link to header if user is logged in
    if (currentUser) {
        const headerAuth = document.getElementById('headerAuthButtons');
        if (headerAuth) {
            const favoritesLink = document.createElement('button');
            favoritesLink.className = 'auth-btn';
            favoritesLink.innerHTML = '<i class="fas fa-heart"></i> Favorites';
            favoritesLink.onclick = showFavoritesModal;
            headerAuth.insertBefore(favoritesLink, headerAuth.firstChild);
        }
    }

    // Add admin dashboard link for admin users
    if (currentUser?.role === 'admin') {
        const headerAuth = document.getElementById('headerAuthButtons');
        if (headerAuth) {
            const adminLink = document.createElement('button');
            adminLink.className = 'auth-btn';
            adminLink.innerHTML = '<i class="fas fa-shield-alt"></i> Admin';
            adminLink.onclick = showAdminDashboard;
            headerAuth.insertBefore(adminLink, headerAuth.firstChild);
        }
    }

    // Add seller dashboard link for sellers
    if (currentUser?.role === 'seller' || currentUser?.role === 'freelancer') {
        const headerAuth = document.getElementById('headerAuthButtons');
        if (headerAuth) {
            const sellerLink = document.createElement('button');
            sellerLink.className = 'auth-btn';
            sellerLink.innerHTML = '<i class="fas fa-chart-line"></i> Analytics';
            sellerLink.onclick = showSellerDashboard;
            headerAuth.insertBefore(sellerLink, headerAuth.firstChild);
        }
    }

    // Add delete limits info to service delete modals
    const originalDeleteService = window.deleteService;
    window.deleteService = async function(serviceId, serviceTitle, userId, isOwner) {
        if (isOwner) {
            const remaining = await checkRemainingDeletes();
            if (remaining <= 0) {
                showToast('You have reached your daily delete limit (3 per day)', 'error');
                return;
            }
        }
        originalDeleteService(serviceId, serviceTitle, userId, isOwner);
    };
}

// Call initialization when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // ... existing initialization code ...
    setTimeout(initNewFeatures, 1000);
});

/*********************
 *  Enhanced Service Form *
 *********************/
function initEnhancedServiceForm() {
    const form = $('enhancedServiceForm');
    if (!form) return; // 🔥 Stop if not on service page

    currentStep = 1;
    updateFormSteps();

    const nextBtn = $('nextStepBtn');
    const prevBtn = $('prevStepBtn');

    if (nextBtn) {
        nextBtn.addEventListener('click', function(e) {
            e.preventDefault();
            goToNextStep();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', function(e) {
            e.preventDefault();
            goToPreviousStep();
        });
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        publishService();
    });

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
    switch (step) {
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

/*********************
 *  Certificate Viewer *
 *********************/
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
                📩 Inbox <span id="inboxBadge" class="badge hidden"></span>
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

/*********************
 *  Services Functionality *
 *********************/
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

/*********************
 *  UI Navigation    *
 *********************/
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

/*********************
 *  Service Creation *
 *********************/
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

/*********************
 *  Event Listeners  *
 *********************/
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

/*********************
 *  Subscription Management *
 *********************/
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

/*********************
 *  Initialization   *
 *********************/
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

        updateCharCount();

        if (typeof initRecruitmentSystem === 'function') initRecruitmentSystem();
        if (typeof initClientRequestSystem === 'function') initClientRequestSystem();

    } catch (error) {
        console.error("Initialization error:", error);
        const servicesBrowser = $('servicesBrowser');
        if (servicesBrowser) {
            servicesBrowser.classList.remove('hidden');
        }
    }
});

/*********************
 *  Utility Functions *
 *********************/
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        userRole = null;
        updateHeader();
        updateUIForUserRole();
        location.reload();
    } catch (error) {}
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
    console.log("Updating services with new profile picture:", profilePictureUrl);
}

function initRecruitmentSystem() {
    console.log("Recruitment system initialized");
}

function initClientRequestSystem() {
    console.log("Client request system initialized");
}

function viewFreelancerServices(freelancerId) {
    console.log("View freelancer services:", freelancerId);
    showServicesBrowser();
    switchTab('browse');
    $('serviceSearch').value = `user:${freelancerId}`;
    filterAndRenderServices();
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

window.addEventListener('load', () => {
    loadConversations();
    updateCharCount();
});