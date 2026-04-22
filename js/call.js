// =====================================================
// DEXTER — WebRTC Call Engine
// Handles: peer connection, ICE candidates, signaling
// =====================================================
const Call = {
    pc: null,              // RTCPeerConnection
    localStream: null,     // Our microphone/camera
    remoteStream: null,    // Remote audio/video
    targetUserId: null,    // Who we are calling
    targetUsername: null,
    callType: null,        // 'audio' or 'video'
    isIncoming: false,
    pendingOffer: null,    // Stored offer for incoming calls

    ICE_SERVERS: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    },

    // ---- INITIATE A CALL ----
    async startCall(userId, username, type = 'audio') {
        this.targetUserId = userId;
        this.targetUsername = username;
        this.callType = type;
        this.isIncoming = false;

        try {
            await this._getLocalMedia();
            this._showCallUI('outgoing');
            this._createPeerConnection();

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            API.sendCallSignal({
                type: 'call_offer',
                target_id: userId,
                call_type: type,
                sdp: offer
            });
        } catch (err) {
            console.error('Failed to start call:', err);
            this._showCallError('Could not access microphone' + (type === 'video' ? '/camera' : '') + '. Please check permissions.');
            this.endCall();
        }
    },

    // ---- HANDLE INCOMING CALL ----
    async handleIncomingCall(data) {
        this.targetUserId = data.from_id;
        this.targetUsername = data.from_username;
        this.callType = data.call_type || 'audio';
        this.isIncoming = true;
        this.pendingOffer = data.sdp;

        this._showCallUI('incoming');
    },

    // ---- ACCEPT INCOMING CALL ----
    async acceptCall() {
        try {
            await this._getLocalMedia();
            this._showCallUI('active');
            this._createPeerConnection();

            await this.pc.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);

            API.sendCallSignal({
                type: 'call_answer',
                target_id: this.targetUserId,
                sdp: answer
            });
        } catch (err) {
            console.error('Failed to accept call:', err);
            this._showCallError('Could not access microphone. Please check permissions.');
            this.endCall();
        }
    },

    // ---- REJECT INCOMING CALL ----
    rejectCall() {
        API.sendCallSignal({
            type: 'call_reject',
            target_id: this.targetUserId
        });
        this._hideCallUI();
        this._cleanup();
    },

    // ---- END ACTIVE CALL ----
    endCall() {
        API.sendCallSignal({
            type: 'call_end',
            target_id: this.targetUserId
        });
        this._hideCallUI();
        this._cleanup();
    },

    // ---- HANDLE SIGNALS FROM REMOTE ----
    async handleSignal(data) {
        switch (data.type) {
            case 'call_offer':
                await this.handleIncomingCall(data);
                break;

            case 'call_answer':
                if (this.pc) {
                    await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    this._showCallUI('active');
                }
                break;

            case 'ice_candidate':
                if (this.pc && data.candidate) {
                    try {
                        await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } catch (e) { /* ignore stale candidates */ }
                }
                break;

            case 'call_reject':
                this._showCallError(`${data.from_username} declined the call.`);
                setTimeout(() => this._hideCallUI(), 2500);
                this._cleanup();
                break;

            case 'call_end':
                this._hideCallUI();
                this._cleanup();
                break;
        }
    },

    // ---- TOGGLE MUTE ----
    toggleMute() {
        if (!this.localStream) return;
        const track = this.localStream.getAudioTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        const btn = document.getElementById('call-mute-btn');
        if (btn) {
            btn.innerHTML = track.enabled
                ? '<i class="fa-solid fa-microphone"></i>'
                : '<i class="fa-solid fa-microphone-slash"></i>';
            btn.classList.toggle('muted', !track.enabled);
        }
    },

    // ---- TOGGLE VIDEO ----
    toggleVideo() {
        if (!this.localStream) return;
        const track = this.localStream.getVideoTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        const btn = document.getElementById('call-video-btn');
        if (btn) {
            btn.innerHTML = track.enabled
                ? '<i class="fa-solid fa-video"></i>'
                : '<i class="fa-solid fa-video-slash"></i>';
            btn.classList.toggle('muted', !track.enabled);
        }
    },

    // ---- PRIVATE HELPERS ----
    async _getLocalMedia() {
        const constraints = {
            audio: true,
            video: this.callType === 'video'
        };
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

        const localVideo = document.getElementById('local-video');
        if (localVideo && this.callType === 'video') {
            localVideo.srcObject = this.localStream;
        }
    },

    _createPeerConnection() {
        this.pc = new RTCPeerConnection(this.ICE_SERVERS);

        // Add local tracks
        this.localStream.getTracks().forEach(track => {
            this.pc.addTrack(track, this.localStream);
        });

        // Receive remote tracks
        this.pc.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remote-video');
            const remoteAudio = document.getElementById('remote-audio');
            if (remoteVideo && this.callType === 'video') {
                remoteVideo.srcObject = this.remoteStream;
            }
            if (remoteAudio) {
                remoteAudio.srcObject = this.remoteStream;
            }
        };

        // Send ICE candidates
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                API.sendCallSignal({
                    type: 'ice_candidate',
                    target_id: this.targetUserId,
                    candidate: event.candidate
                });
            }
        };

        this.pc.onconnectionstatechange = () => {
            console.log('Call state:', this.pc.connectionState);
            const statusEl = document.getElementById('call-status-text');
            if (statusEl) {
                if (this.pc.connectionState === 'connected') {
                    statusEl.textContent = 'Connected · Encrypted';
                    this._startCallTimer();
                } else if (this.pc.connectionState === 'disconnected') {
                    statusEl.textContent = 'Disconnected';
                }
            }
        };
    },

    _cleanup() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        this.targetUserId = null;
        this.targetUsername = null;
        this.isIncoming = false;
        this.pendingOffer = null;
        this._stopCallTimer();
    },

    _showCallUI(state) {
        const overlay = document.getElementById('call-overlay');
        const incoming = document.getElementById('call-incoming');
        const active = document.getElementById('call-active');
        const outgoing = document.getElementById('call-outgoing');
        const name = document.getElementById('call-username-display');
        const videoContainer = document.getElementById('call-video-container');

        if (overlay) overlay.style.display = 'flex';
        if (incoming) incoming.style.display = 'none';
        if (active) active.style.display = 'none';
        if (outgoing) outgoing.style.display = 'none';
        if (name) name.textContent = this.targetUsername;

        if (videoContainer) {
            videoContainer.style.display = this.callType === 'video' ? 'flex' : 'none';
        }

        if (state === 'incoming' && incoming) incoming.style.display = 'flex';
        if (state === 'active' && active) active.style.display = 'flex';
        if (state === 'outgoing' && outgoing) outgoing.style.display = 'flex';

        const typeIcon = document.getElementById('call-type-icon');
        if (typeIcon) {
            typeIcon.className = this.callType === 'video'
                ? 'fa-solid fa-video'
                : 'fa-solid fa-phone';
        }
    },

    _hideCallUI() {
        const overlay = document.getElementById('call-overlay');
        if (overlay) overlay.style.display = 'none';
        this._stopCallTimer();
    },

    _showCallError(msg) {
        const statusEl = document.getElementById('call-status-text');
        if (statusEl) statusEl.textContent = msg;
    },

    _callTimerInterval: null,
    _callStartTime: null,

    _startCallTimer() {
        this._callStartTime = Date.now();
        const timerEl = document.getElementById('call-timer');
        this._callTimerInterval = setInterval(() => {
            if (!timerEl) return;
            const elapsed = Math.floor((Date.now() - this._callStartTime) / 1000);
            const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const s = (elapsed % 60).toString().padStart(2, '0');
            timerEl.textContent = `${m}:${s}`;
        }, 1000);
    },

    _stopCallTimer() {
        if (this._callTimerInterval) {
            clearInterval(this._callTimerInterval);
            this._callTimerInterval = null;
        }
        const timerEl = document.getElementById('call-timer');
        if (timerEl) timerEl.textContent = '00:00';
    }
};
