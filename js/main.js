document.addEventListener('DOMContentLoaded', async () => {
    ui.showLoading("Verifying session...");
    
    // Check if token exists and try to auto-login
    if (API.token) {
        try {
            const user = await API.getCurrentUser();
            
            // Try to load private key
            const privKeyJwk = localStorage.getItem(`privKey_${user.username}`);
            if (privKeyJwk) {
                ui.privateKey = await CryptoUtil.importPrivateKey(privKeyJwk);
                await ui.initDashboard();
            } else {
                console.warn("No private key found on this device.");
                // We keep the token but the user might need to import their key
                // For now, let's go to dashboard but with limited capability
                await ui.initDashboard();
            }
        } catch (e) {
            console.error("Auth check failed:", e.message);
            if (e.message === 'Not authenticated') {
                ui.logout();
            } else {
                // Network error or server down, maybe show a retry button?
                alert("Connection problem. Please check your internet or try refreshing.");
                ui.switchView('auth-view');
            }
        }
    } else {
        ui.switchView('auth-view');
    }
    
    ui.hideLoading();
});
