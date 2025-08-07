// Break Management System
class BreakManager {
    constructor() {
        this.isOnBreak = false;
        this.initializeEventListeners();
        this.setupSocketListeners();
    }
    
    initializeEventListeners() {
        // Desktop toggle break button in Draft tab
        const toggleBreakBtn = document.getElementById('toggleBreakBtn');
        if (toggleBreakBtn) {
            toggleBreakBtn.addEventListener('click', () => this.toggleBreak());
        }
        
        // Desktop toggle break button in Auction tab
        const toggleBreakBtnAuction = document.getElementById('toggleBreakBtnAuction');
        if (toggleBreakBtnAuction) {
            toggleBreakBtnAuction.addEventListener('click', () => this.toggleBreak());
            
            // Show button for admins
            const currentUser = window.app?.currentUser;
            if (currentUser?.is_admin) {
                toggleBreakBtnAuction.classList.remove('hidden');
            }
        }
        
        // Desktop toggle break button in Admin panel
        const toggleBreakBtnAdmin = document.getElementById('toggleBreakBtnAdmin');
        if (toggleBreakBtnAdmin) {
            toggleBreakBtnAdmin.addEventListener('click', () => this.toggleBreak());
        }
        
        // Desktop end break button
        const endBreakBtn = document.getElementById('endBreakBtn');
        if (endBreakBtn) {
            endBreakBtn.addEventListener('click', () => this.endBreak());
        }
        
        // Mobile end break button
        const endBreakBtnMobile = document.getElementById('endBreakBtnMobile');
        if (endBreakBtnMobile) {
            endBreakBtnMobile.addEventListener('click', () => this.endBreak());
        }
    }
    
    setupSocketListeners() {
        // Wait for socket to be available
        setTimeout(() => {
            if (window.socketManager && window.socketManager.socket) {
                // Listen for break status updates
                window.socketManager.socket.on('break-status', (data) => {
                    console.log('Break status received:', data);
                    if (data.isOnBreak) {
                        this.showBreakScreen();
                    } else {
                        this.hideBreakScreen();
                    }
                });
                
                console.log('Break socket listeners set up');
            } else {
                // Retry after a moment
                setTimeout(() => this.setupSocketListeners(), 1000);
            }
        }, 500);
    }
    
    async toggleBreak() {
        try {
            // Use the API instance
            const response = await window.api.request('/break/toggle', {
                method: 'POST'
            });
            
            console.log('Break toggled:', response);
            
            // Emit socket event to notify all clients
            if (window.socketManager && window.socketManager.socket) {
                window.socketManager.socket.emit('toggle-break', { 
                    isOnBreak: response.isOnBreak 
                });
            }
            
        } catch (error) {
            console.error('Error toggling break:', error);
            alert('Failed to toggle break');
        }
    }
    
    async endBreak() {
        try {
            // Use the API instance
            const response = await window.api.request('/break/end', {
                method: 'POST'
            });
            
            console.log('Break ended:', response);
            
            // Emit socket event to notify all clients
            if (window.socketManager && window.socketManager.socket) {
                window.socketManager.socket.emit('toggle-break', { 
                    isOnBreak: false 
                });
            }
            
        } catch (error) {
            console.error('Error ending break:', error);
            alert('Failed to end break');
        }
    }
    
    showBreakScreen() {
        this.isOnBreak = true;
        const breakScreen = document.getElementById('breakScreen');
        if (breakScreen) {
            breakScreen.classList.remove('hidden');
            
            // Show end break button for admin
            const currentUser = window.app?.currentUser || window.mobileAPI?.getCurrentUser();
            if (currentUser?.is_admin) {
                const endBreakBtn = document.getElementById('endBreakBtn') || 
                                   document.getElementById('endBreakBtnMobile');
                if (endBreakBtn) {
                    endBreakBtn.classList.remove('hidden');
                }
            }
        }
    }
    
    updateAdminVisibility() {
        const currentUser = window.app?.currentUser || window.mobileAPI?.getCurrentUser();
        const toggleBreakBtnAuction = document.getElementById('toggleBreakBtnAuction');
        
        if (toggleBreakBtnAuction) {
            if (currentUser?.is_admin) {
                toggleBreakBtnAuction.classList.remove('hidden');
            } else {
                toggleBreakBtnAuction.classList.add('hidden');
            }
        }
    }
    
    hideBreakScreen() {
        this.isOnBreak = false;
        const breakScreen = document.getElementById('breakScreen');
        if (breakScreen) {
            breakScreen.classList.add('hidden');
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.breakManager = new BreakManager();
        console.log('Break manager initialized');
    });
} else {
    window.breakManager = new BreakManager();
    console.log('Break manager initialized');
}