const ui = {
    authMode: 'login',
    currentUser: null,
    activeChatUser: null,
    privateKey: null, // CryptoKey object
    friends: {}, // map of id -> User object

    showLoading(text = 'Loading...') {
        document.getElementById('loading-text').innerText = text;
        document.getElementById('loading-overlay').classList.add('active');
    },

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    },

    switchAuthTab(mode) {
        this.authMode = mode;
        const btns = document.querySelectorAll('.tab-btn');
        btns[0].classList.toggle('active', mode === 'login');
        btns[1].classList.toggle('active', mode === 'register');
        document.getElementById('auth-submit-btn').innerText = mode === 'login' ? 'Login' : 'Register';
        document.getElementById('auth-error').innerText = '';
    },

    async handleAuth(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('auth-error');
        errorEl.innerText = '';
        
        this.showLoading();
        try {
            if (this.authMode === 'register') {
                // Generate Key Pair
                const keyPair = await CryptoUtil.generateRSAKeyPair();
                const pubKeyJwk = await CryptoUtil.exportPublicKey(keyPair.publicKey);
                const privKeyJwk = await CryptoUtil.exportPrivateKey(keyPair.privateKey);
                
                // Register
                await API.register(username, password, pubKeyJwk);
                
                // Save private key locally
                localStorage.setItem(`privKey_${username}`, privKeyJwk);
                
                // Auto login
                await API.login(username, password);
                this.privateKey = keyPair.privateKey;
            } else {
                // Login
                await API.login(username, password);
                
                // Load private key
                const privKeyJwk = localStorage.getItem(`privKey_${username}`);
                if (privKeyJwk) {
                    this.privateKey = await CryptoUtil.importPrivateKey(privKeyJwk);
                } else {
                    console.warn("Private key not found on this device.");
                    alert("Warning: Your encryption keys were not found on this device. You will not be able to decrypt past messages.");
                    this.privateKey = null;
                }
            }
            
            await this.initDashboard();
        } catch (err) {
            errorEl.innerText = err.message;
        } finally {
            this.hideLoading();
        }
    },

    async checkAuth() {
        if (localStorage.getItem('access_token') || API.token) {
            try {
                this.currentUser = await API.getCurrentUser();
                
                // Restore private key on refresh
                const privKeyJwk = localStorage.getItem(`privKey_${this.currentUser.username}`);
                if (privKeyJwk) {
                    this.privateKey = await CryptoUtil.importPrivateKey(privKeyJwk);
                } else {
                    console.warn("Private key not found after refresh.");
                }
                
                await this.initDashboard();
            } catch (err) {
                console.error("Auth check failed:", err);
                this.logout();
            }
        }
    },

    logout() {
        API.logout();
        this.currentUser = null;
        this.activeChatUser = null;
        this.privateKey = null;
        this.friends = {};
        this.switchView('auth-view');
        document.getElementById('chat-active').classList.remove('active');
        const requestsView = document.getElementById('requests-view');
        if (requestsView) requestsView.classList.remove('active');
        document.getElementById('chat-placeholder').classList.add('active');
    },

    async initDashboard() {
        try {
            this.currentUser = await API.getCurrentUser();
            document.getElementById('current-username').innerText = this.currentUser.username;
            
            this.switchView('dashboard-view');
            
            // Connect WebSocket
            API.connectWebSocket(this.handleNewMessage.bind(this));
            
            // Load requests and friends
            await this.loadFriendRequests();
        } catch (err) {
            console.error(err);
            this.logout();
        }
    },

    async loadFriendRequests() {
        const requests = await API.getFriendRequests();
        const pendingList = document.getElementById('requests-list-page');
        const sentList = document.getElementById('sent-requests-list');
        const friendsEl = document.getElementById('friends-list');
        
        if (pendingList) pendingList.innerHTML = '';
        if (sentList) sentList.innerHTML = '';
        if (friendsEl) friendsEl.innerHTML = '';
        
        let pendingCount = 0;
        let sentCount = 0;
        this.friends = {};

        for (const req of requests) {
            if (req.status === 'pending') {
                if (req.receiver.id === this.currentUser.id) {
                    pendingCount++;
                    if (pendingList) {
                        pendingList.innerHTML += `
                            <div class="request-item card">
                                <div class="req-user-info">
                                    <div class="avatar"><i class="fa-solid fa-user"></i></div>
                                    <div class="req-details">
                                        <span class="req-name">${req.sender.username}</span>
                                        <span class="req-sub">Wants to connect</span>
                                    </div>
                                </div>
                                <div class="req-actions">
                                    <button class="action-btn accept" onclick="ui.acceptRequest(${req.id})" style="background: rgba(0, 255, 102, 0.1); border-color: var(--neon-green); color: var(--neon-green); padding: 8px 16px;">
                                        <i class="fa-solid fa-check"></i> Accept
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                } else if (req.sender.id === this.currentUser.id) {
                    sentCount++;
                    if (sentList) {
                        sentList.innerHTML += `
                            <div class="request-item card">
                                <div class="req-user-info">
                                    <div class="avatar"><i class="fa-solid fa-user"></i></div>
                                    <div class="req-details">
                                        <span class="req-name">${req.receiver.username}</span>
                                        <span class="req-sub" style="color: var(--text-muted);"><i class="fa-regular fa-clock"></i> Waiting for response</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                }
            } else if (req.status === 'accepted') {
                const friend = req.sender.id === this.currentUser.id ? req.receiver : req.sender;
                this.friends[friend.id] = friend;
                
                if (friendsEl) {
                    friendsEl.innerHTML += `
                        <div class="list-item" id="friend-item-${friend.id}" onclick="ui.openChat(${friend.id})">
                            <div class="item-info">
                                <div class="avatar"><i class="fa-solid fa-user"></i></div>
                                <span class="item-name">${friend.username}</span>
                            </div>
                        </div>
                    `;
                }
            }
        }
        
        const countEls = document.querySelectorAll('#request-count');
        countEls.forEach(el => el.innerText = pendingCount);
        const badgeEl = document.getElementById('request-count-badge');
        if (badgeEl) badgeEl.innerText = pendingCount;
        
        if (pendingList && pendingCount === 0) {
            pendingList.innerHTML = `<p class="text-muted" style="text-align:center; padding: 20px; font-style: italic;">No pending requests</p>`;
        }
        if (sentList && sentCount === 0) {
            sentList.innerHTML = `<p class="text-muted" style="text-align:center; padding: 20px; font-style: italic;">No sent requests</p>`;
        }
    },

    openFriendRequestsView() {
        document.getElementById('chat-placeholder').classList.remove('active');
        document.getElementById('chat-active').classList.remove('active');
        document.getElementById('requests-view').classList.add('active');
        
        document.querySelectorAll('#friends-list .list-item').forEach(el => el.classList.remove('active-chat'));
        this.activeChatUser = null;
        
        // Mobile slide-in
        if (window.innerWidth <= 768) {
            document.querySelector('.main-chat').classList.add('mobile-open');
        }
    },

    async handleSearchUser(e) {
        e.preventDefault();
        const username = document.getElementById('search-username').value;
        if (!username) return;
        
        try {
            this.showLoading();
            const user = await API.searchUser(username);
            await API.sendFriendRequest(user.username);
            alert(`Friend request sent to ${username}!`);
            document.getElementById('search-username').value = '';
            await this.loadFriendRequests();
        } catch (err) {
            alert(err.message);
        } finally {
            this.hideLoading();
        }
    },

    async acceptRequest(reqId) {
        try {
            this.showLoading();
            await API.acceptFriendRequest(reqId);
            await this.loadFriendRequests();
        } catch (err) {
            alert(err.message);
        } finally {
            this.hideLoading();
        }
    },

    async openChat(friendId) {
        this.activeChatUser = this.friends[friendId];
        
        // Update UI styling
        document.querySelectorAll('#friends-list .list-item').forEach(el => el.classList.remove('active-chat'));
        document.getElementById(`friend-item-${friendId}`).classList.add('active-chat');
        
        document.getElementById('chat-placeholder').classList.remove('active');
        document.getElementById('requests-view').classList.remove('active');
        document.getElementById('chat-active').classList.add('active');
        document.getElementById('active-chat-username').innerText = this.activeChatUser.username;
        
        // Mobile slide-in
        if (window.innerWidth <= 768) {
            document.querySelector('.main-chat').classList.add('mobile-open');
        }
        
        // Load messages
        await this.loadMessages();
    },

    async loadMessages() {
        if (!this.activeChatUser) return;
        const msgContainer = document.getElementById('chat-messages');
        msgContainer.innerHTML = '<div class="spinner" style="margin: 20px auto; border-color: rgba(255,255,255,0.1); border-top-color: #6366f1;"></div>';
        
        try {
            const messages = await API.getMessages(this.activeChatUser.id);
            msgContainer.innerHTML = '';
            
            for (const msg of messages) {
                await this.renderMessage(msg, msgContainer);
            }
            msgContainer.scrollTop = msgContainer.scrollHeight;
        } catch (err) {
            console.error(err);
            msgContainer.innerHTML = '<p style="text-align:center; color: var(--danger)">Failed to load messages</p>';
        }
    },

    async renderMessage(msg, container) {
        const isSent = msg.sender_id === this.currentUser.id;
        
        try {
            // Determine which AES key to decrypt
            let targetAesKey = msg.encrypted_aes_key;
            if (msg.encrypted_aes_key.includes("|||")) {
                const keys = msg.encrypted_aes_key.split("|||");
                targetAesKey = isSent ? keys[1] : keys[0];
            } else {
                if (isSent) throw new Error("Old messages do not have a sender key stored");
            }
            
            // 1. Decrypt AES Key using our Private RSA Key
            const aesKeyRaw = await CryptoUtil.decryptAESKeyWithRSA(targetAesKey, this.privateKey);
            const aesKey = await CryptoUtil.importAESKey(aesKeyRaw);
            
            // 2. Decrypt message content using AES Key
            const plaintext = await CryptoUtil.decryptMessage(msg.encrypted_content, aesKey);
            
            const timeStr = new Date(msg.timestamp + 'Z').toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            container.innerHTML += `
                <div class="message ${isSent ? 'sent' : 'received'}">
                    ${plaintext}
                    <span class="message-time">${timeStr}</span>
                </div>
            `;
        } catch (err) {
            console.error("Failed to decrypt message:", err);
            container.innerHTML += `
                <div class="message ${isSent ? 'sent' : 'received'}">
                    <i class="fa-solid fa-triangle-exclamation" style="color: #fbbf24"></i> <i>Decryption Failed</i>
                </div>
            `;
        }
    },

    async handleSendMessage(e) {
        e.preventDefault();
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        if (!text || !this.activeChatUser) return;
        
        input.value = '';
        
        try {
            // 1. Get friend's public key AND our own public key
            const friendPubKey = await CryptoUtil.importPublicKey(this.activeChatUser.public_key);
            const myPubKey = await CryptoUtil.importPublicKey(this.currentUser.public_key);
            
            // 2. Generate a new AES key for this message
            const aesKey = await CryptoUtil.generateAESKey();
            
            // 3. Encrypt message with AES key
            const encryptedContent = await CryptoUtil.encryptMessage(text, aesKey);
            
            // 4. Encrypt AES key for BOTH users
            const aesKeyRaw = await CryptoUtil.exportAESKey(aesKey);
            const friendEncryptedKey = await CryptoUtil.encryptAESKeyWithRSA(aesKeyRaw, friendPubKey);
            const myEncryptedKey = await CryptoUtil.encryptAESKeyWithRSA(aesKeyRaw, myPubKey);
            
            // Combine them: friend_key|||my_key
            const combinedAesKey = friendEncryptedKey + "|||" + myEncryptedKey;
            
            // 5. Send via WebSocket
            API.sendWebSocketMessage(this.activeChatUser.id, encryptedContent, combinedAesKey);
            
        } catch (err) {
            console.error(err);
            alert("Failed to send message: " + err.message);
        }
    },

    async handleNewMessage(msg) {
        if (this.activeChatUser && 
           (msg.sender_id === this.activeChatUser.id || 
           (msg.sender_id === this.currentUser.id && msg.receiver_id === this.activeChatUser.id))) {
            
            const container = document.getElementById('chat-messages');
            await this.renderMessage(msg, container);
            container.scrollTop = container.scrollHeight;
        }
        // Could also show a notification or unread badge here if chat isn't active
    },

    closeChat() {
        if (window.innerWidth <= 768) {
            document.querySelector('.main-chat').classList.remove('mobile-open');
            setTimeout(() => {
                document.getElementById('chat-active').classList.remove('active');
                document.getElementById('requests-view').classList.remove('active');
                document.getElementById('chat-placeholder').classList.add('active');
                this.activeChatUser = null;
                document.querySelectorAll('#friends-list .list-item').forEach(el => el.classList.remove('active-chat'));
            }, 300); // Wait for transition
        }
    },
    
    toggleEmojiPicker() {
        const container = document.getElementById('emoji-picker-container');
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }
};
