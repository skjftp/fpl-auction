// Main Mobile App Controller for FPL Auction
class MobileApp {
    constructor() {
        this.currentUser = null;
        this.currentTab = 'auction';
        this.currentView = 'formation'; // 'formation' or 'list'
        this.chatMessages = [];
        this.unreadChatCount = 0;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('Initializing mobile app...');
            
            // Show loading screen
            this.showLoadingScreen();
            
            // Check if user is already logged in
            const token = localStorage.getItem('fpl_token');
            const userData = localStorage.getItem('fpl_team');
            
            if (token && userData) {
                try {
                    this.currentUser = JSON.parse(userData);
                    if (this.currentUser && this.currentUser.id) {
                        await this.initializeMainApp();
                    } else {
                        console.warn('Invalid user data in localStorage');
                        this.showLoginScreen();
                    }
                } catch (error) {
                    console.error('Error with stored user data:', error);
                    // Clear invalid data
                    localStorage.removeItem('fpl_token');
                    localStorage.removeItem('fpl_team');
                    this.showLoginScreen();
                }
            } else {
                this.showLoginScreen();
            }
            
            this.isInitialized = true;
            console.log('Mobile app initialized');
        } catch (error) {
            console.error('Failed to initialize mobile app:', error);
            this.showToast('Failed to initialize app', 'error');
            this.showLoginScreen();
        }
    }

    showLoadingScreen() {
        this.hideAllScreens();
        document.getElementById('loadingScreen').style.display = 'flex';
    }

    showLoginScreen() {
        this.hideAllScreens();
        document.getElementById('loginScreen').classList.remove('hidden');
        this.setupLoginForm();
    }

    showMainApp() {
        this.hideAllScreens();
        document.getElementById('mainApp').classList.remove('hidden');
    }

    hideAllScreens() {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    }

    setupLoginForm() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const loginBtn = document.querySelector('.login-btn');
        
        if (!username || !password) {
            this.showToast('Please enter username and password', 'error');
            return;
        }

        if (!loginBtn) {
            console.error('Login button not found');
            return;
        }

        try {
            // Show loading state safely
            loginBtn.disabled = true;
            const btnText = loginBtn.querySelector('.btn-text');
            const btnSpinner = loginBtn.querySelector('.btn-spinner');
            
            if (btnText) btnText.textContent = 'Signing In...';
            if (btnSpinner) btnSpinner.classList.remove('hidden');

            const response = await window.mobileAPI.login(username, password);
            
            if (!response || !response.team || !response.team.id) {
                throw new Error('Invalid login response from server');
            }
            
            this.currentUser = response.team;
            
            this.showToast(`Welcome, ${this.currentUser.name || 'User'}!`, 'success');
            await this.initializeMainApp();
        } catch (error) {
            console.error('Login error:', error);
            this.showToast(error.message || 'Login failed', 'error');
        } finally {
            // Reset button state safely
            if (loginBtn) {
                loginBtn.disabled = false;
                const btnText = loginBtn.querySelector('.btn-text');
                const btnSpinner = loginBtn.querySelector('.btn-spinner');
                
                if (btnText) btnText.textContent = 'Sign In';
                if (btnSpinner) btnSpinner.classList.add('hidden');
            }
        }
    }

    async initializeMainApp() {
        try {
            this.showMainApp();
            
            // Update user info in header
            this.updateUserInfo();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize managers
            await this.initializeManagers();
            
            // Load initial data
            await this.loadInitialData();
            
            // Connect to socket
            window.mobileSocket.connect();
            
            console.log('Main app initialized successfully');
        } catch (error) {
            console.error('Error initializing main app:', error);
            this.showToast('Failed to initialize app', 'error');
        }
    }

    updateUserInfo() {
        const teamNameEl = document.getElementById('teamName');
        const teamBudgetEl = document.getElementById('teamBudget');
        
        if (teamNameEl && this.currentUser) {
            teamNameEl.textContent = this.currentUser.name || 'Unknown Team';
        }
        
        // Load team budget
        this.refreshTeamData();
    }

    async refreshTeamData() {
        try {
            if (!this.currentUser?.id) return;
            
            const teamData = await window.mobileAPI.getTeam(this.currentUser.id);
            if (teamData) {
                const teamBudgetEl = document.getElementById('teamBudget');
                if (teamBudgetEl) {
                    teamBudgetEl.textContent = `£${teamData.budget || 0}`;
                }
                
                // Update current user data
                this.currentUser = { ...this.currentUser, ...teamData };
            }
        } catch (error) {
            console.error('Error refreshing team data:', error);
        }
    }

    setupEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Tab navigation
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Chat input
        const chatInput = document.getElementById('chatInput');
        const sendChatBtn = document.getElementById('sendChatBtn');
        
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendChatMessage();
                }
            });
        }
        
        if (sendChatBtn) {
            sendChatBtn.addEventListener('click', () => this.sendChatMessage());
        }

        // View toggle buttons
        const formationViewBtn = document.getElementById('formationViewBtn');
        const listViewBtn = document.getElementById('listViewBtn');
        
        if (formationViewBtn) {
            formationViewBtn.addEventListener('click', () => this.switchView('formation'));
        }
        
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.switchView('list'));
        }

        // Prevent zoom on inputs (iOS)
        document.querySelectorAll('input, select, textarea').forEach(input => {
            input.addEventListener('focus', () => {
                document.querySelector('meta[name=viewport]').setAttribute(
                    'content', 
                    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
                );
            });
            
            input.addEventListener('blur', () => {
                document.querySelector('meta[name=viewport]').setAttribute(
                    'content', 
                    'width=device-width, initial-scale=1.0, user-scalable=no'
                );
            });
        });
    }

    async initializeManagers() {
        // Initialize auction manager
        if (window.mobileAuction) {
            await window.mobileAuction.initialize();
        }
        
        // Initialize auto-bid manager
        if (window.mobileAutoBid) {
            await window.mobileAutoBid.initialize();
        }
    }

    async loadInitialData() {
        try {
            // Load draft state
            await this.loadDraftState();
            
            // Load chat messages
            await this.loadChatMessages();
            
            // Load team squad
            await this.loadTeamSquad();
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async loadDraftState() {
        try {
            const draftState = await window.mobileAPI.getDraftState();
            this.updateDraftStatus(draftState);
        } catch (error) {
            console.error('Error loading draft state:', error);
        }
    }

    updateDraftStatus(draftState) {
        const currentTurnEl = document.getElementById('currentTurn');
        if (currentTurnEl && draftState) {
            if (draftState.is_active) {
                const isMyTurn = this.currentUser && draftState.current_team_id === this.currentUser.id;
                const teamName = draftState.current_team_name || 'Unknown';
                
                if (isMyTurn) {
                    currentTurnEl.innerHTML = `<span style="color: #10b981; font-weight: 700;">Your Turn!</span>`;
                } else {
                    currentTurnEl.textContent = teamName;
                }
            } else {
                currentTurnEl.textContent = 'Draft not active';
            }
        }
    }

    switchTab(tabName) {
        // Update current tab
        this.currentTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
        
        // Clear chat notification when switching to chat
        if (tabName === 'chat') {
            this.clearChatNotification();
        }
        
        // Load tab-specific data
        this.loadTabData(tabName);
    }

    switchView(viewName) {
        // Update current view
        this.currentView = viewName;
        
        // Update view buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (viewName === 'formation') {
            document.getElementById('formationViewBtn').classList.add('active');
        } else {
            document.getElementById('listViewBtn').classList.add('active');
        }
        
        // Re-render team squad with new view
        if (this.currentTab === 'team') {
            this.loadTeamSquad();
        }
    }

    async loadTabData(tabName) {
        switch (tabName) {
            case 'team':
                await this.loadTeamSquad();
                break;
            case 'chat':
                await this.loadChatMessages();
                break;
        }
    }

    async loadTeamSquad() {
        try {
            if (!this.currentUser?.id) return;
            
            const squad = await window.mobileAPI.getTeamSquad(this.currentUser.id);
            this.renderTeamSquad(squad);
        } catch (error) {
            console.error('Error loading team squad:', error);
        }
    }

    renderTeamSquad(squad) {
        const container = document.getElementById('teamSquad');
        const squadCountEl = document.getElementById('squadCount');
        const clubCountEl = document.getElementById('clubCount');
        
        if (!container) return;

        // Update counts
        const playerCount = squad.players?.length || 0;
        const clubCount = squad.clubs?.length || 0;
        
        if (squadCountEl) squadCountEl.textContent = `${playerCount}/15 Players`;
        if (clubCountEl) clubCountEl.textContent = `${clubCount}/2 Clubs`;

        // Group players by position
        const positions = {
            'GKP': [],
            'DEF': [],
            'MID': [],
            'FWD': []
        };

        squad.players?.forEach(player => {
            // Map position numbers to names
            let positionName;
            if (player.position === 1 || player.position === 'GKP') positionName = 'GKP';
            else if (player.position === 2 || player.position === 'DEF') positionName = 'DEF';
            else if (player.position === 3 || player.position === 'MID') positionName = 'MID';
            else if (player.position === 4 || player.position === 'FWD') positionName = 'FWD';
            else positionName = player.element_type_name || 'Unknown';
            
            if (positions[positionName]) {
                positions[positionName].push(player);
            }
        });

        if (this.currentView === 'formation') {
            container.innerHTML = this.renderFormationView(positions, squad.clubs);
        } else {
            container.innerHTML = this.renderListView(positions, squad.clubs);
        }
    }

    renderFormationView(positions, clubs) {
        const gkps = positions['GKP'] || [];
        const defs = positions['DEF'] || [];
        const mids = positions['MID'] || [];
        const fwds = positions['FWD'] || [];

        // Fill empty slots
        const fillEmptySlots = (players, maxCount) => {
            const filled = [...players];
            while (filled.length < maxCount) {
                filled.push(null);
            }
            return filled;
        };

        const renderPlayer = (player, isEmpty = false) => {
            if (isEmpty || !player) {
                return `
                    <div class="formation-player empty">
                        <div class="formation-player-name">Empty</div>
                    </div>
                `;
            }
            return `
                <div class="formation-player">
                    <div class="formation-player-name">${player.web_name || player.name || 'Unknown'}</div>
                    <div class="formation-player-price">£${player.price_paid || 0}m</div>
                </div>
            `;
        };

        const renderClub = (club, isEmpty = false) => {
            if (isEmpty || !club) {
                return `
                    <div class="formation-club empty">
                        <div class="formation-club-name">Empty</div>
                    </div>
                `;
            }
            return `
                <div class="formation-club">
                    <div class="formation-club-name">${club.name || 'Unknown'}</div>
                    <div class="formation-club-price">£${club.price_paid || 0}m</div>
                </div>
            `;
        };

        return `
            <div class="formation-view">
                <div class="formation-pitch">
                    <!-- Forwards -->
                    <div class="formation-line">
                        ${fillEmptySlots(fwds, 3).map(player => renderPlayer(player)).join('')}
                    </div>
                    
                    <!-- Midfielders -->
                    <div class="formation-line">
                        ${fillEmptySlots(mids, 5).map(player => renderPlayer(player)).join('')}
                    </div>
                    
                    <!-- Defenders -->
                    <div class="formation-line">
                        ${fillEmptySlots(defs, 5).map(player => renderPlayer(player)).join('')}
                    </div>
                    
                    <!-- Goalkeepers -->
                    <div class="formation-line">
                        ${fillEmptySlots(gkps, 2).map(player => renderPlayer(player)).join('')}
                    </div>
                </div>
                
                <!-- Clubs -->
                <div class="formation-clubs">
                    ${fillEmptySlots(clubs || [], 2).map(club => renderClub(club)).join('')}
                </div>
            </div>
        `;
    }

    renderListView(positions, clubs) {
        let squadHTML = '<div class="list-view">';
        
        // Position requirements
        const positionLimits = {
            'GKP': 2,
            'DEF': 5,
            'MID': 5,
            'FWD': 3
        };
        
        // Render each position group
        Object.entries(positions).forEach(([position, players]) => {
            const limit = positionLimits[position] || 0;
            squadHTML += `
                <div class="position-group">
                    <div class="position-header">
                        ${position}
                        <span class="position-counter">${players.length}/${limit}</span>
                    </div>
                    ${players.map(player => `
                        <div class="squad-player">
                            <div class="squad-player-info">
                                <h5>${player.web_name || player.name || 'Unknown'}</h5>
                                <p>${player.team_name || 'Unknown Club'}</p>
                            </div>
                            <div class="squad-player-price">£${player.price_paid || 0}m</div>
                        </div>
                    `).join('')}
                    ${players.length === 0 ? '<div style="color: #9ca3af; font-style: italic; padding: 8px 0;">No players</div>' : ''}
                </div>
            `;
        });

        // Add clubs section
        if (clubs && clubs.length > 0) {
            squadHTML += `
                <div class="position-group">
                    <div class="position-header">
                        Clubs
                        <span class="position-counter">${clubs.length}/2</span>
                    </div>
                    ${clubs.map(club => `
                        <div class="squad-player">
                            <div class="squad-player-info">
                                <h5>${club.name || 'Unknown Club'}</h5>
                                <p>${club.short_name || ''}</p>
                            </div>
                            <div class="squad-player-price">£${club.price_paid || 0}m</div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            squadHTML += `
                <div class="position-group">
                    <div class="position-header">
                        Clubs
                        <span class="position-counter">0/2</span>
                    </div>
                    <div style="color: #9ca3af; font-style: italic; padding: 8px 0;">No clubs</div>
                </div>
            `;
        }

        squadHTML += '</div>';
        return squadHTML || '<div style="text-align: center; color: #9ca3af; padding: 40px;">No players or clubs yet</div>';
    }

    async loadChatMessages() {
        try {
            const messages = await window.mobileAPI.getChatMessages();
            this.chatMessages = messages || [];
            this.renderChatMessages();
        } catch (error) {
            console.error('Error loading chat messages:', error);
        }
    }

    renderChatMessages() {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        if (this.chatMessages.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">No messages yet...</div>';
            return;
        }

        container.innerHTML = this.chatMessages.map(msg => {
            let timeString = 'Now';
            try {
                if (msg.created_at) {
                    let date;
                    if (typeof msg.created_at === 'object' && msg.created_at._seconds) {
                        date = new Date(msg.created_at._seconds * 1000);
                    } else {
                        date = new Date(msg.created_at);
                    }
                    if (!isNaN(date.getTime())) {
                        timeString = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    }
                }
            } catch (error) {
                console.warn('Error formatting date:', error);
            }

            return `
                <div class="chat-message">
                    <div class="message-header">
                        <span class="message-author">${msg.team_name || 'Unknown'}</span>
                        <span class="message-time">${timeString}</span>
                    </div>
                    <div class="message-content">${this.escapeHtml(msg.message || '')}</div>
                </div>
            `;
        }).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    addChatMessage(message) {
        // Check for duplicates
        const exists = this.chatMessages.some(msg => 
            msg.team_id === message.team_id && 
            msg.message === message.message && 
            Math.abs(new Date(msg.created_at) - new Date(message.created_at)) < 1000
        );
        
        if (!exists) {
            this.chatMessages.push(message);
            this.renderChatMessages();
        }
    }

    async sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;

        const message = chatInput.value.trim();
        if (!message) return;

        try {
            await window.mobileAPI.sendChatMessage(message);
            chatInput.value = '';
        } catch (error) {
            console.error('Error sending chat message:', error);
            this.showToast('Failed to send message', 'error');
        }
    }

    incrementChatNotification() {
        if (this.currentTab !== 'chat') {
            this.unreadChatCount++;
            this.updateChatNotification();
        }
    }

    clearChatNotification() {
        this.unreadChatCount = 0;
        this.updateChatNotification();
    }

    updateChatNotification() {
        const badge = document.getElementById('chatNotification');
        if (badge) {
            if (this.unreadChatCount > 0) {
                badge.textContent = this.unreadChatCount > 99 ? '99+' : this.unreadChatCount.toString();
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    handleLogout() {
        // Cleanup
        if (window.mobileAutoBid) {
            window.mobileAutoBid.destroy();
        }
        
        if (window.mobileSocket) {
            window.mobileSocket.disconnect();
        }

        // Clear storage and API
        window.mobileAPI.logout();
        this.currentUser = null;
        
        // Show login screen
        this.showLoginScreen();
        this.showToast('Logged out successfully', 'info');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Show toast
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // Hide and remove toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Handle app lifecycle events
    handleVisibilityChange() {
        if (document.hidden) {
            // App went to background
            console.log('App went to background');
        } else {
            // App came to foreground
            console.log('App came to foreground');
            if (this.isInitialized) {
                this.refreshTeamData();
            }
        }
    }

    handleOnline() {
        console.log('App came online');
        if (window.mobileSocket && !window.mobileSocket.connected) {
            window.mobileSocket.connect();
        }
        this.showToast('Connection restored', 'success');
    }

    handleOffline() {
        console.log('App went offline');
        this.showToast('No internet connection', 'warning');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create global app instance
    window.mobileApp = new MobileApp();
    window.mobileApp.initialize();

    // Add lifecycle event listeners
    document.addEventListener('visibilitychange', () => {
        window.mobileApp.handleVisibilityChange();
    });

    window.addEventListener('online', () => {
        window.mobileApp.handleOnline();
    });

    window.addEventListener('offline', () => {
        window.mobileApp.handleOffline();
    });
});

// Prevent zoom on orientation change (iOS)
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        document.querySelector('meta[name=viewport]').setAttribute(
            'content', 
            'width=device-width, initial-scale=1.0, user-scalable=no'
        );
    }, 100);
});