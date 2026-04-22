const ui = {
    authMode: 'login',
    currentUser: null,
    activeChatUser: null,
    privateKey: null,
    friends: {},

    // ── LOADING ──
    showLoading(text = 'Loading...') {
        const el = document.getElementById('loading-overlay');
        const txt = document.getElementById('loading-text');
        if (txt) txt.innerText = text;
        if (el) { el.classList.add('active'); el.style.display = 'flex'; }
    },
    hideLoading() {
        const el = document.getElementById('loading-overlay');
        if (el) { el.classList.remove('active'); el.style.display = ''; }
    },

    // ── VIEW SWITCHING ──
    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => {
            v.style.display = 'none';
            v.classList.remove('active');
        });
        const target = document.getElementById(viewId);
        if (target) { target.style.display = 'flex'; target.classList.add('active'); }
        window.scrollTo(0, 0);
    },

    // ── AUTH ──
    switchAuthTab(mode) {
        this.authMode = mode;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(mode === 'login' ? 'tab-login' : 'tab-register');
        if (btn) btn.classList.add('active');
        const submitBtn = document.getElementById('auth-submit-btn');
        if (submitBtn) {
            submitBtn.innerHTML = mode === 'login'
                ? '<i class="fa-solid fa-right-to-bracket"></i> Sign In'
                : '<i class="fa-solid fa-user-plus"></i> Create Account';
        }
        const errEl = document.getElementById('auth-error');
        if (errEl) errEl.innerText = '';
    },

    togglePasswordVisibility() {
        const input = document.getElementById('password');
        const icon = document.getElementById('pw-eye-icon');
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            if (icon) icon.className = 'fa-solid fa-eye-slash';
        } else {
            input.type = 'password';
            if (icon) icon.className = 'fa-solid fa-eye';
        }
    },

    async handleAuth(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('auth-error');
        if (errorEl) errorEl.innerText = '';
        if (!username || !password) return;

        this.showLoading(this.authMode === 'login' ? 'Signing in...' : 'Creating account...');
        try {
            if (this.authMode === 'register') {
                const keyPair = await CryptoUtil.generateRSAKeyPair();
                const pubKeyJwk = await CryptoUtil.exportPublicKey(keyPair.publicKey);
                const privKeyJwk = await CryptoUtil.exportPrivateKey(keyPair.privateKey);
                await API.register(username, password, pubKeyJwk);
                localStorage.setItem(`privKey_${username}`, privKeyJwk);
                await API.login(username, password);
                this.privateKey = keyPair.privateKey;
            } else {
                await API.login(username, password);
                const privKeyJwk = localStorage.getItem(`privKey_${username}`);
                if (privKeyJwk) {
                    this.privateKey = await CryptoUtil.importPrivateKey(privKeyJwk);
                } else {
                    console.warn('Private key not found on this device.');
                    this.privateKey = null;
                }
            }
            await this.initDashboard();
        } catch (err) {
            console.error(err);
            if (errorEl) errorEl.innerText = err.message || 'Authentication failed';
        } finally {
            this.hideLoading();
        }
    },

    // ── LOGOUT ──
    logout() {
        API.logout();
        this.currentUser = null;
        this.activeChatUser = null;
        this.privateKey = null;
        this.friends = {};
        this.switchView('auth-view');
        this._resetChatArea();
    },

    _resetChatArea() {
        const placeholder = document.getElementById('chat-placeholder');
        const chatActive = document.getElementById('chat-active');
        const reqView = document.getElementById('requests-view');
        const profileView = document.getElementById('profile-view');
        if (placeholder) placeholder.classList.add('active'), placeholder.style.display = '';
        if (chatActive) chatActive.classList.remove('active');
        if (reqView) reqView.classList.remove('active');
        if (profileView) profileView.classList.remove('active');
    },

    // ── NAV RAIL ──
    navTo(section, btn) {
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
        if (btn) btn.classList.add('active');

        const placeholder = document.getElementById('chat-placeholder');
        const chatActive = document.getElementById('chat-active');
        const reqView = document.getElementById('requests-view');
        const profileView = document.getElementById('profile-view');

        [placeholder, chatActive, reqView, profileView].forEach(el => {
            if (el) { el.classList.remove('active'); el.style.display = ''; }
        });

        if (section === 'chats') {
            if (placeholder) { placeholder.classList.add('active'); }
            if (window.innerWidth <= 768) document.querySelector('.main-content')?.classList.remove('mobile-open');
        } else if (section === 'friends') {
            this.openFriendRequestsView();
        } else if (section === 'profile') {
            this.openProfileView();
        }
    },

    // ── DASHBOARD INIT ──
    async initDashboard() {
        try {
            this.currentUser = await API.getCurrentUser();
            this._updateSidebarUser();
            this.switchView('dashboard-view');
            this._initEmojiPicker();
            API.connectWebSocket(this.handleNewMessage.bind(this));
            await this.loadFriendRequests();
            this.updateProfileUI();
            this.navTo('chats', document.getElementById('nav-chats'));
        } catch (err) {
            console.error(err);
            this.logout();
        }
    },

    _updateSidebarUser() {
        if (!this.currentUser) return;
        const name = this.currentUser.display_name || this.currentUser.username;
        const nameEl = document.getElementById('current-username');
        if (nameEl) nameEl.innerText = name;
        const avatarEl = document.getElementById('sidebar-avatar');
        if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
        const bigAvatar = document.getElementById('profile-big-avatar');
        if (bigAvatar) bigAvatar.textContent = name.charAt(0).toUpperCase();
    },

    // ── EMOJI PICKER (WORKING) ──
    _initEmojiPicker() {
        const pickerEl = document.getElementById('emoji-picker-el');
        if (!pickerEl) return;
        if (pickerEl._dexterInitialized) return;
        pickerEl._dexterInitialized = true;

        pickerEl.addEventListener('emoji-click', (event) => {
            const emoji = event.detail.unicode;
            const input = document.getElementById('message-input');
            if (!input || !emoji) return;
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const before = input.value.slice(0, start);
            const after = input.value.slice(end);
            input.value = before + emoji + after;
            const newPos = start + emoji.length;
            input.setSelectionRange(newPos, newPos);
            input.focus();
            // Close picker after selection
            this.closeEmojiPicker();
        });

        // Close picker when clicking outside
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('emoji-picker-wrap');
            const trigger = document.getElementById('emoji-trigger-btn');
            if (wrap && !wrap.contains(e.target) && e.target !== trigger && !trigger?.contains(e.target)) {
                this.closeEmojiPicker();
            }
        }, true);
    },

    toggleEmojiPicker() {
        const wrap = document.getElementById('emoji-picker-wrap');
        const trigger = document.getElementById('emoji-trigger-btn');
        if (!wrap) return;
        const isOpen = wrap.classList.contains('open');
        if (isOpen) {
            this.closeEmojiPicker();
        } else {
            wrap.classList.add('open');
            wrap.style.display = 'block';
            if (trigger) trigger.classList.add('open');
        }
    },

    closeEmojiPicker() {
        const wrap = document.getElementById('emoji-picker-wrap');
        const trigger = document.getElementById('emoji-trigger-btn');
        if (wrap) { wrap.classList.remove('open'); wrap.style.display = 'none'; }
        if (trigger) trigger.classList.remove('open');
    },

    // ── FRIENDS ──
    async loadFriendRequests() {
        try {
            const requests = await API.getFriendRequests();
            const pendingList = document.getElementById('requests-list-page');
            const sentList = document.getElementById('sent-requests-list');
            const friendsEl = document.getElementById('friends-list');

            if (pendingList) pendingList.innerHTML = '';
            if (sentList) sentList.innerHTML = '';
            if (friendsEl) friendsEl.innerHTML = '';

            this.friends = {};
            let pendingCount = 0;

            for (const req of requests) {
                // API returns: { id, sender: {id, username, public_key}, receiver: {id, username, public_key}, status }
                const sender = req.sender;
                const receiver = req.receiver;
                if (!sender || !receiver) continue;

                if (req.status === 'pending') {
                    const isReceiver = receiver.id === this.currentUser.id;
                    if (isReceiver) {
                        pendingCount++;
                        this._renderPendingRequest(req, pendingList);
                    } else {
                        this._renderSentRequest(req, sentList);
                    }
                } else if (req.status === 'accepted') {
                    const isSender = sender.id === this.currentUser.id;
                    const friend = isSender ? receiver : sender;
                    this.friends[friend.id] = friend;
                    this._renderFriendItem(friend, friendsEl);
                }
            }

            // Update badges
            const pip = document.getElementById('nav-pip');
            const badge = document.getElementById('request-count-badge');
            const countEl = document.getElementById('request-count');
            if (pip) pip.style.display = pendingCount > 0 ? 'block' : 'none';
            if (badge) { badge.style.display = pendingCount > 0 ? 'block' : 'none'; badge.textContent = pendingCount; }
            if (countEl) countEl.textContent = pendingCount;

            if (friendsEl && Object.keys(this.friends).length === 0) {
                const empty = friendsEl.querySelector('.empty-chat-list');
                if (!empty) friendsEl.innerHTML = '<div class="empty-chat-list"><i class="fa-regular fa-comment-dots"></i><p>No conversations yet</p><small>Add friends to start chatting</small></div>';
            }
        } catch (err) {
            console.error('Failed to load friend requests:', err);
        }
    },

    _renderFriendItem(friend, container) {
        if (!container) return;
        const initial = (friend.username || '?').charAt(0).toUpperCase();
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.dataset.friendId = friend.id;
        div.innerHTML = `
            <div class="chat-item-avatar">${initial}</div>
            <div class="chat-item-info">
                <span class="chat-item-name">${friend.username}</span>
                <span class="chat-item-preview">Click to open chat</span>
            </div>
        `;
        div.onclick = () => this.openChat(friend);
        container.appendChild(div);
        // Remove empty state if present
        const empty = container.querySelector('.empty-chat-list');
        if (empty) empty.remove();
    },

    _renderPendingRequest(req, container) {
        if (!container) return;
        // Use nested sender object from API
        const sender = req.sender || {};
        const username = sender.username || `User #${req.id}`;
        const initial = username.charAt(0).toUpperCase();
        const div = document.createElement('div');
        div.className = 'req-item';
        div.innerHTML = `
            <div class="req-user">
                <div class="req-avatar">${initial}</div>
                <div class="req-meta">
                    <span class="req-name">${username}</span>
                    <span class="req-sub">Wants to connect with you</span>
                </div>
            </div>
            <div class="req-actions">
                <button class="accept-btn" onclick="ui.acceptRequest(${req.id})">Accept</button>
            </div>
        `;
        container.appendChild(div);
    },

    _renderSentRequest(req, container) {
        if (!container) return;
        // Use nested receiver object from API
        const receiver = req.receiver || {};
        const username = receiver.username || `User #${req.id}`;
        const initial = username.charAt(0).toUpperCase();
        const div = document.createElement('div');
        div.className = 'req-item';
        div.innerHTML = `
            <div class="req-user">
                <div class="req-avatar">${initial}</div>
                <div class="req-meta">
                    <span class="req-name">${username}</span>
                    <span class="req-sub" style="color:#f59e0b;">Request pending...</span>
                </div>
            </div>
        `;
        container.appendChild(div);
    },

    async acceptRequest(reqId) {
        try {
            this.showLoading('Accepting...');
            await API.acceptFriendRequest(reqId);
            await this.loadFriendRequests();
        } catch (err) {
            alert(err.message);
        } finally {
            this.hideLoading();
        }
    },

    async handleSearchUser(e) {
        e.preventDefault();
        const input = document.getElementById('search-username');
        const username = input?.value.trim();
        if (!username) return;
        try {
            this.showLoading('Searching...');
            await API.sendFriendRequest(username);
            alert(`Friend request sent to @${username}!`);
            if (input) input.value = '';
            await this.loadFriendRequests();
        } catch (err) {
            alert(err.message || 'Failed to send request');
        } finally {
            this.hideLoading();
        }
    },

    // ── CHAT ──
    async openChat(friend) {
        this.activeChatUser = friend;

        // Update header
        const nameEl = document.getElementById('active-chat-username');
        const avatarEl = document.getElementById('chat-peer-avatar');
        if (nameEl) nameEl.textContent = friend.username;
        if (avatarEl) avatarEl.textContent = friend.username.charAt(0).toUpperCase();

        // Hide other panels, show chat
        const placeholder = document.getElementById('chat-placeholder');
        const chatActive = document.getElementById('chat-active');
        const reqView = document.getElementById('requests-view');
        const profileView = document.getElementById('profile-view');
        if (placeholder) { placeholder.classList.remove('active'); placeholder.style.display = 'none'; }
        if (reqView) reqView.classList.remove('active');
        if (profileView) profileView.classList.remove('active');
        if (chatActive) { chatActive.classList.add('active'); chatActive.style.display = 'flex'; }

        // Highlight in sidebar
        document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
        const chatItem = document.querySelector(`.chat-item[data-friend-id="${friend.id}"]`);
        if (chatItem) chatItem.classList.add('active');

        // Mobile
        if (window.innerWidth <= 768) {
            document.querySelector('.main-content')?.classList.add('mobile-open');
            const backBtns = document.querySelectorAll('.back-btn');
            backBtns.forEach(b => b.style.display = 'flex');
        }

        await this.loadMessages();
        document.getElementById('message-input')?.focus();
    },

    async loadMessages() {
        if (!this.activeChatUser) return;
        const container = document.getElementById('chat-messages');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;"><div class="loading-spinner" style="margin:0 auto;"></div></div>';

        try {
            const messages = await API.getMessages(this.activeChatUser.id);
            container.innerHTML = '';
            if (messages.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;font-size:.9rem;">Start the conversation! 👋</div>';
                return;
            }
            for (const msg of messages) await this.renderMessage(msg, container);
            container.scrollTop = container.scrollHeight;
        } catch (err) {
            container.innerHTML = '<p style="text-align:center;color:#f43f5e;padding:20px;">Failed to load messages</p>';
        }
    },

    async renderMessage(msg, container) {
        const isSent = msg.sender_id === this.currentUser.id;
        try {
            let targetAesKey = msg.encrypted_aes_key;
            if (msg.encrypted_aes_key.includes('|||')) {
                const keys = msg.encrypted_aes_key.split('|||');
                targetAesKey = isSent ? keys[1] : keys[0];
            } else {
                if (isSent) throw new Error('No sender key stored');
            }
            const aesKeyRaw = await CryptoUtil.decryptAESKeyWithRSA(targetAesKey, this.privateKey);
            const aesKey = await CryptoUtil.importAESKey(aesKeyRaw);
            const plaintext = await CryptoUtil.decryptMessage(msg.encrypted_content, aesKey);
            const timeStr = new Date(msg.timestamp + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const div = document.createElement('div');
            div.className = `message ${isSent ? 'sent' : 'received'}`;
            div.innerHTML = `${plaintext}<span class="msg-time">${timeStr}</span>`;
            container.appendChild(div);
        } catch (err) {
            const div = document.createElement('div');
            div.className = `message ${isSent ? 'sent' : 'received'}`;
            div.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#fbbf24;"></i> <i>Decryption failed</i>';
            container.appendChild(div);
        }
    },

    async handleSendMessage(e) {
        e.preventDefault();
        const input = document.getElementById('message-input');
        const text = input?.value.trim();
        if (!text || !this.activeChatUser) return;
        input.value = '';
        this.closeEmojiPicker();
        try {
            const friendPubKey = await CryptoUtil.importPublicKey(this.activeChatUser.public_key);
            const myPubKey = await CryptoUtil.importPublicKey(this.currentUser.public_key);
            const aesKey = await CryptoUtil.generateAESKey();
            const encryptedContent = await CryptoUtil.encryptMessage(text, aesKey);
            const aesKeyRaw = await CryptoUtil.exportAESKey(aesKey);
            const friendEncKey = await CryptoUtil.encryptAESKeyWithRSA(aesKeyRaw, friendPubKey);
            const myEncKey = await CryptoUtil.encryptAESKeyWithRSA(aesKeyRaw, myPubKey);
            API.sendWebSocketMessage(this.activeChatUser.id, encryptedContent, `${friendEncKey}|||${myEncKey}`);
        } catch (err) {
            console.error(err);
            alert('Failed to send message: ' + err.message);
        }
    },

    async handleNewMessage(msg) {
        if (this.activeChatUser &&
            (msg.sender_id === this.activeChatUser.id ||
             (msg.sender_id === this.currentUser.id && msg.receiver_id === this.activeChatUser.id))) {
            const container = document.getElementById('chat-messages');
            if (container) {
                // Remove "start conversation" placeholder if present
                const empty = container.querySelector('div[style*="Start the conversation"]');
                if (empty) empty.remove();
                await this.renderMessage(msg, container);
                container.scrollTop = container.scrollHeight;
            }
        }
    },

    closeChat() {
        if (window.innerWidth <= 768) {
            document.querySelector('.main-content')?.classList.remove('mobile-open');
            setTimeout(() => {
                this._resetChatArea();
                this.activeChatUser = null;
                document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
            }, 300);
        }
    },

    // ── PROFILE ──
    openProfileView() {
        this._resetChatArea();
        const profileView = document.getElementById('profile-view');
        if (profileView) { profileView.classList.add('active'); profileView.style.display = 'flex'; }
        this.activeChatUser = null;
        const editUsername = document.getElementById('edit-username');
        const editName = document.getElementById('edit-display-name');
        const editBio = document.getElementById('edit-bio');
        if (editUsername) editUsername.value = this.currentUser?.username || '';
        if (editName) editName.value = this.currentUser?.display_name || '';
        if (editBio) editBio.value = this.currentUser?.bio || '';
        this.updateProfileUI();
        if (window.innerWidth <= 768) document.querySelector('.main-content')?.classList.add('mobile-open');
    },

    updateProfileUI() {
        if (!this.currentUser) return;
        const name = this.currentUser.display_name || this.currentUser.username;
        const nameEl = document.getElementById('current-username');
        if (nameEl) nameEl.innerText = name;
        const avatarEl = document.getElementById('sidebar-avatar');
        if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
        const bigAvatar = document.getElementById('profile-big-avatar');
        if (bigAvatar) bigAvatar.textContent = name.charAt(0).toUpperCase();
        const headingEl = document.getElementById('profile-display-name-heading');
        if (headingEl) headingEl.innerText = name;
        const subEl = document.getElementById('profile-username-sub');
        if (subEl) subEl.innerText = `@${this.currentUser.username}`;
        const keyStatus = document.getElementById('key-status-text');
        if (keyStatus) {
            keyStatus.innerText = this.privateKey ? 'Loaded ✓' : 'Not Found';
            keyStatus.className = this.privateKey ? 'text-green' : '';
            keyStatus.style.color = this.privateKey ? '' : '#f43f5e';
        }
        const deviceEl = document.getElementById('device-info-text');
        if (deviceEl) {
            const ua = navigator.userAgent;
            let device = 'Unknown Device';
            if (/android/i.test(ua)) device = 'Android Device';
            else if (/iPhone|iPad|iPod/i.test(ua)) device = 'iOS Device';
            else if (/Windows/i.test(ua)) device = 'Windows PC';
            else if (/Macintosh/i.test(ua)) device = 'Apple Mac';
            else if (/Linux/i.test(ua)) device = 'Linux PC';
            deviceEl.innerText = `${device} (This Browser)`;
        }
    },

    async handleUpdateProfile(e) {
        e.preventDefault();
        const username = document.getElementById('edit-username')?.value.trim();
        const displayName = document.getElementById('edit-display-name')?.value.trim();
        const bio = document.getElementById('edit-bio')?.value.trim();
        if (!username) return;
        try {
            this.showLoading('Saving profile...');
            if (username !== this.currentUser.username) {
                const privKey = localStorage.getItem(`privKey_${this.currentUser.username}`);
                if (privKey) {
                    localStorage.setItem(`privKey_${username}`, privKey);
                    localStorage.removeItem(`privKey_${this.currentUser.username}`);
                }
            }
            const updated = await API.updateProfile({ username, display_name: displayName, bio });
            this.currentUser = updated;
            this.updateProfileUI();
            alert('Profile saved!');
            this.goToChats();
        } catch (err) {
            alert(err.message);
        } finally {
            this.hideLoading();
        }
    },

    // ── FRIENDS VIEW ──
    openFriendRequestsView() {
        this._resetChatArea();
        const reqView = document.getElementById('requests-view');
        if (reqView) { reqView.classList.add('active'); reqView.style.display = 'flex'; }
        this.activeChatUser = null;
        if (window.innerWidth <= 768) document.querySelector('.main-content')?.classList.add('mobile-open');
    },

    goToChats() {
        this._resetChatArea();
        if (window.innerWidth <= 768) document.querySelector('.main-content')?.classList.remove('mobile-open');
        const nav = document.getElementById('nav-chats');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        if (nav) nav.classList.add('active');
    },

    // ── FILTER ──
    setFilter(chipEl) {
        document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
        chipEl.classList.add('active');
        const filter = chipEl.dataset.filter;
        const items = document.querySelectorAll('#friends-list .chat-item');
        items.forEach(item => item.style.display = '');
        if (filter === 'unread') {
            items.forEach(item => {
                const badge = item.querySelector('.unread-badge');
                item.style.display = badge ? '' : 'none';
            });
        }
    },

    _showToast(message, duration = 4000) {
        let toast = document.getElementById('dexter-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'dexter-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('toast-visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('toast-visible'), duration);
    }
};
