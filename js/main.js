document.addEventListener('DOMContentLoaded', async () => {
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
                // Token valid but no private key on this device, force re-login/re-register
                ui.logout();
            }
        } catch (e) {
            // Token invalid or expired
            ui.logout();
        }
    } else {
        ui.switchView('auth-view');
    }
});
