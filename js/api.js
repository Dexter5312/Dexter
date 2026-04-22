const API = {
    baseUrl: window.API_URL || "https://dexter-3-v8rb.onrender.com",
    socket: null,
    token: localStorage.getItem('access_token'),

    headers() {
        return {
            'Content-Type': 'application/json',
            ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
        };
    },

    async register(username, password, publicKey) {
        const res = await fetch(`${this.baseUrl}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, public_key: publicKey })
        });
        
        if (!res.ok) {
            let detail = 'Registration failed';
            try {
                const errJson = await res.json();
                detail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
            } catch (e) {}
            throw new Error(detail);
        }
        return await res.json();
    },

    async login(username, password) {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('username', username);
        formData.append('password', password);

        const res = await fetch(`${this.baseUrl}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });
        
        if (!res.ok) {
            let detail = 'Login failed';
            try {
                const errJson = await res.json();
                detail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
            } catch (e) {}
            throw new Error(detail);
        }
        
        const data = await res.json();
        this.token = data.access_token;
        localStorage.setItem('access_token', this.token);
        return data;
    },

    logout() {
        this.token = null;
        localStorage.removeItem('access_token');
        if (this.socket) {
            this.socket.close();
        }
    },

    async getCurrentUser() {
        const res = await fetch(`${this.baseUrl}/users/me`, { headers: this.headers() });
        if (res.status === 401) {
            this.logout();
            throw new Error('Not authenticated');
        }
        if (!res.ok) throw new Error('Failed to fetch user');
        return await res.json();
    },

    async searchUser(username) {
        const res = await fetch(`${this.baseUrl}/users/${username}`, { headers: this.headers() });
        if (!res.ok) throw new Error((await res.json()).detail || 'User not found');
        return await res.json();
    },

    async sendFriendRequest(receiver_username) {
        const res = await fetch(`${this.baseUrl}/friend-requests`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ receiver_username })
        });
        if (!res.ok) throw new Error((await res.json()).detail);
        return await res.json();
    },

    async getFriendRequests() {
        const res = await fetch(`${this.baseUrl}/friend-requests`, { headers: this.headers() });
        if (!res.ok) throw new Error('Failed to fetch requests');
        return await res.json();
    },

    async acceptFriendRequest(reqId) {
        const res = await fetch(`${this.baseUrl}/friend-requests/${reqId}/accept`, {
            method: 'POST',
            headers: this.headers()
        });
        if (!res.ok) throw new Error('Failed to accept request');
        return await res.json();
    },

    async updateProfile(data) {
        const res = await fetch(`${this.baseUrl}/users/me`, {
            method: 'PUT',
            headers: this.headers(),
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            let detail = 'Update failed';
            try {
                const errJson = await res.json();
                detail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
            } catch (e) {}
            throw new Error(detail);
        }
        return await res.json();
    },

    async getMessages(userId) {
        const res = await fetch(`${this.baseUrl}/messages/${userId}`, { headers: this.headers() });
        if (!res.ok) throw new Error('Failed to fetch messages');
        return await res.json();
    },

    connectWebSocket(onMessageReceived) {
        if (!this.token) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${this.token}`;
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => console.log("WebSocket connected");

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'new_message') {
                onMessageReceived(data.message);
            }
        };

        this.socket.onclose = () => console.log("WebSocket disconnected");
    },

    sendWebSocketMessage(receiverId, encryptedContent, encryptedAesKey) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'chat',
                receiver_id: receiverId,
                encrypted_content: encryptedContent,
                encrypted_aes_key: encryptedAesKey
            }));
        } else {
            throw new Error("WebSocket not connected");
        }
    }
};
