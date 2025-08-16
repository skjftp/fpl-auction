// Main application logic
class App {
    constructor() {
        this.currentUser = null;
        // Set default tab based on enabled features
        if (window.FEATURE_FLAGS) {
            if (window.FEATURE_FLAGS.TEAM_SUBMISSION) {
                this.currentTab = 'scoring';
            } else if (window.FEATURE_FLAGS.POINTS_CALCULATION) {
                this.currentTab = 'leaderboard';
            } else {
                this.currentTab = 'auction';
            }
        } else {
            this.currentTab = 'auction';
        }
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
    }

    bindEvents() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            this.handleLogin(e);
        });

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // TTS toggle functionality
        document.getElementById('ttsToggleBtn').addEventListener('click', () => {
            this.toggleTTS();
        });

        // Password change functionality
        document.getElementById('changePasswordBtn').addEventListener('click', () => {
            this.showPasswordModal();
        });

        document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handlePasswordChange();
        });

        document.getElementById('cancelPasswordBtn').addEventListener('click', () => {
            this.hidePasswordModal();
        });

        // Team name change functionality
        document.getElementById('changeTeamNameBtn').addEventListener('click', () => {
            this.showTeamNameModal();
        });

        document.getElementById('changeTeamNameForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleTeamNameChange();
        });

        document.getElementById('cancelTeamNameBtn').addEventListener('click', () => {
            this.hideTeamNameModal();
        });

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Page visibility API - refresh data when tab becomes active
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentUser) {
                console.log('App tab became active, refreshing data...');
                this.refreshDataOnTabFocus();
            }
        });

        // Also handle window focus for better cross-browser support
        window.addEventListener('focus', () => {
            if (this.currentUser) {
                console.log('App window focused, refreshing data...');
                this.refreshDataOnTabFocus();
            }
        });
    }

    checkAuthStatus() {
        const token = localStorage.getItem('fpl_token');
        const team = localStorage.getItem('fpl_team');
        
        if (token && team) {
            try {
                this.currentUser = JSON.parse(team);
                this.isViewer = this.currentUser.is_viewer || false;
                this.showMainApp();
                
                // Only connect to WebSocket if feature is enabled
                if (!window.FEATURE_FLAGS || window.FEATURE_FLAGS.WEBSOCKET) {
                    window.socketManager.connect();
                }
                
                // Trigger data load after a small delay to ensure DOM is ready
                setTimeout(() => {
                    if ((!window.FEATURE_FLAGS || window.FEATURE_FLAGS.AUCTION) && window.auctionManager) {
                        window.auctionManager.onUserLogin();
                    }
                    if ((!window.FEATURE_FLAGS || window.FEATURE_FLAGS.DRAFT) && window.draftManager) {
                        window.draftManager.onUserLogin();
                    }
                }, 100);
            } catch (error) {
                console.error('Error parsing stored team data:', error);
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('loginBtn');
        
        btn.textContent = 'Logging in...';
        btn.disabled = true;
        
        try {
            const response = await api.login(username, password);
            
            if (response.success) {
                this.currentUser = response.team;
                this.isViewer = response.team.is_viewer || false;
                console.log('Logged in user:', this.currentUser); // Debug log
                this.showMainApp();
                
                // Only connect to WebSocket if feature is enabled
                if (!window.FEATURE_FLAGS || window.FEATURE_FLAGS.WEBSOCKET) {
                    window.socketManager.connect();
                }
                
                // Show viewer notification
                if (this.isViewer) {
                    showNotification(`Welcome, ${response.team.name}! (View-only mode)`, 'info');
                } else {
                    showNotification(`Welcome, ${response.team.name}!`, 'success');
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification(error.message, 'error');
        } finally {
            btn.textContent = 'Login';
            btn.disabled = false;
        }
    }

    initializeTTSButton() {
        if (window.ttsManager) {
            const btn = document.getElementById('ttsToggleBtn');
            const span = btn.querySelector('span');
            
            if (window.ttsManager.enabled) {
                btn.className = 'bg-green-100 hover:bg-green-200 text-green-700 px-3 py-2 rounded-lg transition-all duration-200 mr-2';
                span.textContent = 'Sound On';
            } else {
                btn.className = 'bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-all duration-200 mr-2';
                span.textContent = 'Sound Off';
            }
        }
    }

    toggleTTS() {
        if (window.ttsManager) {
            const isEnabled = window.ttsManager.toggle();
            const btn = document.getElementById('ttsToggleBtn');
            const span = btn.querySelector('span');
            
            if (isEnabled) {
                btn.className = 'bg-green-100 hover:bg-green-200 text-green-700 px-3 py-2 rounded-lg transition-all duration-200 mr-2';
                span.textContent = 'Sound On';
                showNotification('Voice announcements enabled', 'success');
                
                // Test TTS
                window.ttsManager.test();
            } else {
                btn.className = 'bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-all duration-200 mr-2';
                span.textContent = 'Sound Off';
                showNotification('Voice announcements disabled', 'info');
            }
        }
    }

    logout() {
        api.clearToken();
        this.currentUser = null;
        window.socketManager.disconnect();
        this.showLogin();
        showNotification('Logged out successfully', 'success');
    }

    showPasswordModal() {
        document.getElementById('changePasswordModal').classList.remove('hidden');
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        document.getElementById('passwordError').classList.add('hidden');
    }

    hidePasswordModal() {
        document.getElementById('changePasswordModal').classList.add('hidden');
    }

    showTeamNameModal() {
        document.getElementById('changeTeamNameModal').classList.remove('hidden');
        document.getElementById('currentTeamName').textContent = this.currentTeam.name;
        document.getElementById('newTeamName').value = '';
        document.getElementById('teamNamePassword').value = '';
        document.getElementById('teamNameError').classList.add('hidden');
    }

    hideTeamNameModal() {
        document.getElementById('changeTeamNameModal').classList.add('hidden');
    }

    async handleTeamNameChange() {
        const currentPassword = document.getElementById('teamNamePassword').value;
        const newTeamName = document.getElementById('newTeamName').value;
        const errorDiv = document.getElementById('teamNameError');
        const saveBtn = document.getElementById('saveTeamNameBtn');
        
        // Reset error
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
        
        // Disable button to prevent double submission
        saveBtn.disabled = true;
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Changing...';
        
        try {
            const response = await fetch(`${api.baseURL}/auth/change-team-name`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${api.token}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newTeamName
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Update local token and team info
                api.setToken(data.token);
                this.currentTeam = data.team;
                
                // Update UI with new team name
                document.getElementById('teamName').textContent = data.team.name;
                
                showNotification('Team name changed successfully', 'success');
                this.hideTeamNameModal();
            } else {
                errorDiv.textContent = data.error || 'Failed to change team name';
                errorDiv.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error changing team name:', error);
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.classList.remove('hidden');
        } finally {
            // Re-enable button
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }

    async handlePasswordChange() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorDiv = document.getElementById('passwordError');
        const saveBtn = document.getElementById('savePasswordBtn');
        
        // Reset error
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
        
        // Validate passwords match
        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'New passwords do not match';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        // Validate minimum length
        if (newPassword.length < 6) {
            errorDiv.textContent = 'New password must be at least 6 characters';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        saveBtn.disabled = true;
        saveBtn.textContent = 'Changing...';
        
        try {
            const response = await api.changePassword(currentPassword, newPassword);
            
            if (response.success) {
                showNotification('Password changed successfully', 'success');
                this.hidePasswordModal();
            } else {
                errorDiv.textContent = response.error || 'Failed to change password';
                errorDiv.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            errorDiv.textContent = error.message || 'Failed to change password';
            errorDiv.classList.remove('hidden');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Change Password';
        }
    }

    showLogin() {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
        document.getElementById('navbar').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('navbar').classList.remove('hidden');
        
        // Hide disabled tabs
        if (window.FEATURE_FLAGS) {
            const tabFeatureMap = {
                'auction': 'AUCTION',
                'draft': 'DRAFT',
                'myTeam': 'MY_TEAM',
                'scoring': 'TEAM_SUBMISSION',
                'leaderboard': 'POINTS_CALCULATION',
                'admin': 'ADMIN',
                'history': 'HISTORY'
            };
            
            Object.entries(tabFeatureMap).forEach(([tabName, featureFlag]) => {
                if (!window.FEATURE_FLAGS[featureFlag]) {
                    // Hide tab button
                    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
                    if (tabBtn) tabBtn.style.display = 'none';
                    
                    // Hide nav item
                    const navItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
                    if (navItem) navItem.style.display = 'none';
                }
            });
        }
        
        // Update break button visibility for admins
        if (window.breakManager) {
            window.breakManager.updateAdminVisibility();
        }

        // Update auction manager admin controls and load data
        if (window.auctionManager) {
            window.auctionManager.updateAdminControls();
            window.auctionManager.onUserLogin();
        }

        // Load draft manager data after login
        if (window.draftManager) {
            window.draftManager.onUserLogin();
        }
        
        // Show admin tab if user is admin (but only if admin feature is enabled)
        const adminTab = document.querySelector('[data-tab="admin"]');
        const adminTabNav = document.querySelector('.nav-item[data-tab="admin"]');
        const adminEnabled = !window.FEATURE_FLAGS || window.FEATURE_FLAGS.ADMIN;
        if (adminTab) {
            adminTab.style.display = (this.currentUser?.is_admin && adminEnabled) ? 'block' : 'none';
        }
        if (adminTabNav) {
            adminTabNav.style.display = (this.currentUser?.is_admin && adminEnabled) ? 'flex' : 'none';
        }
        
        // Hide action buttons for viewers
        if (this.isViewer) {
            // Hide password and team name change buttons
            document.getElementById('changePasswordBtn').style.display = 'none';
            document.getElementById('changeTeamNameBtn').style.display = 'none';
            
            // Hide auto-bid functionality
            const autoBidCard = document.querySelector('.auto-bid-card');
            if (autoBidCard) {
                autoBidCard.style.display = 'none';
            }
            
            // Update team budget display for viewer
            const budgetElement = document.getElementById('teamBudget');
            if (budgetElement) {
                budgetElement.innerHTML = '<span class="text-gray-500">Viewer Mode</span>';
            }
        }
        
        console.log('Current user admin status:', this.currentUser?.is_admin);
        console.log('Is viewer:', this.isViewer);
        console.log('Admin tab visibility:', adminTab?.style.display, adminTabNav?.style.display);
        
        // Initialize TTS button state
        this.initializeTTSButton();
        
        this.updateNavbar();
        this.switchTab(this.currentTab);
    }

    updateNavbar() {
        if (this.currentUser) {
            document.getElementById('teamName').textContent = this.currentUser.name;
            document.getElementById('teamBudget').innerHTML = formatCurrency(this.currentUser.budget, false);
        }
    }

    async refreshTeamBudget() {
        if (this.currentUser) {
            try {
                const teamInfo = await api.getTeamInfo(this.currentUser.id);
                this.currentUser.budget = teamInfo.budget;
                this.updateNavbar();
                
                // Update localStorage
                localStorage.setItem('fpl_team', JSON.stringify(this.currentUser));
            } catch (error) {
                console.error('Error refreshing team budget:', error);
            }
        }
    }

    switchTab(tabName) {
        // Check if tab is enabled
        if (window.FEATURE_FLAGS) {
            const tabFeatureMap = {
                'auction': 'AUCTION',
                'draft': 'DRAFT',
                'myTeam': 'MY_TEAM',
                'scoring': 'TEAM_SUBMISSION',
                'leaderboard': 'POINTS_CALCULATION',
                'admin': 'ADMIN',
                'history': 'HISTORY'
            };
            
            const featureFlag = tabFeatureMap[tabName];
            if (featureFlag && !window.FEATURE_FLAGS[featureFlag]) {
                console.log(`Tab ${tabName} is disabled`);
                return;
            }
        }
        
        // Update tab buttons (old style)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.classList.add('border-transparent', 'text-gray-500');
            btn.classList.remove('border-green-500', 'text-green-600');
        });
        
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.classList.remove('border-transparent', 'text-gray-500');
            activeBtn.classList.add('border-green-500', 'text-green-600');
        }
        
        // Update bottom navigation (new style)
        document.querySelectorAll('.nav-item').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        })

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        const activeContent = document.getElementById(`${tabName}Tab`);
        if (activeContent) {
            activeContent.classList.remove('hidden');
        }

        this.currentTab = tabName;
        this.loadTabContent(tabName);
    }

    async loadTabContent(tabName) {
        switch (tabName) {
            case 'draft':
                // Draft content is loaded by DraftManager
                break;
                
            case 'auction':
                // Auction content is loaded by AuctionManager
                // Re-setup chat socket listeners when auction tab becomes active
                if (window.auctionManager) {
                    window.auctionManager.setupChatSocketListeners();
                }
                break;
                
            case 'myTeam':
                // Team content is now handled by TeamManager
                break;
                
            case 'scoring':
                await this.loadScoring();
                break;
                
            case 'leaderboard':
                await this.loadLeaderboard();
                break;
                
            case 'admin':
                await this.loadAdminPanel();
                break;
        }
    }

    async loadMyTeam(teamId = null) {
        if (!this.currentUser) {
            console.error('No current user found');
            return;
        }
        
        // Use provided teamId or default to current user's team
        const selectedTeamId = teamId || this.currentUser.id;
        console.log('Loading team with ID:', selectedTeamId);
        
        try {
            // Load team selector options first time
            if (!teamId) {
                await this.loadTeamSelector();
            }
            
            const squad = await api.getTeamSquad(selectedTeamId);
            console.log('Squad loaded:', squad);
            
            if (!squad) {
                console.error('No squad data returned');
                const container = document.getElementById('mySquad');
                if (container) {
                    container.innerHTML = '<div class="text-center py-8 text-gray-500">No squad data available</div>';
                }
                return;
            }
            
            // Get team name if viewing another team
            let teamName = null;
            if (teamId && teamId !== this.currentUser.id) {
                const teamInfo = await api.getTeamInfo(selectedTeamId);
                teamName = teamInfo.name;
            }
            
            this.displayMyTeam(squad, selectedTeamId, teamName);
        } catch (error) {
            console.error('Error loading team:', error);
            showNotification('Failed to load team data', 'error');
            
            // Show error in UI
            const container = document.getElementById('mySquad');
            if (container) {
                container.innerHTML = '<div class="text-center py-8 text-red-500">Failed to load team data</div>';
            }
        }
    }

    async loadTeamSelector() {
        try {
            const teams = await api.getTeamsLeaderboard();
            const selector = document.getElementById('teamSelector');
            
            if (!selector) {
                console.error('Team selector element not found');
                return;
            }
            
            // Clear existing options
            selector.innerHTML = '';
            
            // Add "My Squad" as default option
            const mySquadOption = document.createElement('option');
            mySquadOption.value = '';
            mySquadOption.textContent = 'My Squad';
            mySquadOption.selected = true;
            selector.appendChild(mySquadOption);
            
            // Add all teams
            if (Array.isArray(teams)) {
                teams.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = team.name;
                    selector.appendChild(option);
                });
            }
            
            // Team selector event listener is now handled by TeamManager
            // if (!selector.hasAttribute('data-listener-added')) {
            //     selector.addEventListener('change', (e) => {
            //         const selectedTeamId = e.target.value || this.currentUser.id;
            //         this.loadMyTeam(selectedTeamId);
            //     });
            //     selector.setAttribute('data-listener-added', 'true');
            // }
            
        } catch (error) {
            console.error('Error loading teams for selector:', error);
            // Add at least the current option on error
            const selector = document.getElementById('teamSelector');
            if (selector) {
                selector.innerHTML = '<option value="">My Squad</option>';
            }
        }
    }

    displayMyTeam(squadData, selectedTeamId = null, teamName = null) {
        const container = document.getElementById('mySquad');
        
        if (!container) {
            console.error('My squad container not found');
            return;
        }
        
        console.log('DisplayMyTeam called with:', squadData);
        
        // Parse the squad data - it comes as arrays of players and clubs
        const players = squadData.players || [];
        const clubs = squadData.clubs || [];
        
        // Group players by position
        const positions = {
            1: [], // GKP
            2: [], // DEF
            3: [], // MID
            4: []  // FWD
        };
        
        players.forEach(player => {
            const pos = player.position || player.element_type;
            if (positions[pos]) {
                positions[pos].push(player);
            }
        });
        
        // Calculate counts
        const counts = {
            players: players.length,
            clubs: clubs.length,
            gkp: positions[1].length,
            def: positions[2].length,
            mid: positions[3].length,
            fwd: positions[4].length
        };
        
        // Calculate total spent
        const totalSpent = players.reduce((sum, p) => sum + (p.price_paid || 0), 0) + 
                          clubs.reduce((sum, c) => sum + (c.price_paid || 0), 0);
        const remainingBudget = 1000 - totalSpent;
        
        // Build squad object in expected format
        const squad = {
            positions,
            clubs,
            counts,
            totalSpent
        };
        
        // Update header to show which team is being viewed
        const isMyTeam = !selectedTeamId || selectedTeamId === this.currentUser.id;
        
        // Update the dropdown selection if viewing another team
        const selector = document.getElementById('teamSelector');
        if (selector) {
            if (selectedTeamId && selectedTeamId !== this.currentUser.id) {
                selector.value = selectedTeamId;
            } else {
                selector.value = ''; // My Squad
            }
        }
        
        // Update squad counts
        const squadCount = document.getElementById('squadCount');
        const clubCount = document.getElementById('clubCount');
        if (squadCount) {
            squadCount.textContent = `${squad.counts.players}/15 Players`;
        }
        if (clubCount) {
            clubCount.textContent = `${squad.counts.clubs}/2 Clubs`;
        }

        // Create club color mapping
        const clubColors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
            '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
        ];
        const clubColorMap = new Map();
        let colorIndex = 0;

        // Assign colors to clubs
        const allPlayers = [];
        Object.values(squad.positions).forEach(players => {
            allPlayers.push(...players);
        });
        
        allPlayers.forEach(player => {
            const clubName = player?.team_name || player?.club_name;
            if (player && clubName && !clubColorMap.has(clubName)) {
                clubColorMap.set(clubName, clubColors[colorIndex % clubColors.length]);
                colorIndex++;
            }
        });

        // Formation View Style
        const formationStyles = `
            <style>
                .formation-container {
                    background: linear-gradient(to bottom, #059669, #10b981);
                    border-radius: 12px;
                    padding: 20px;
                    min-height: 400px;
                    position: relative;
                }
                .formation-row {
                    display: flex;
                    justify-content: center;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .player-card {
                    background: white;
                    border-radius: 8px;
                    padding: 8px;
                    text-align: center;
                    width: 80px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    border: 2px solid;
                    transition: transform 0.2s;
                }
                .player-card:hover {
                    transform: scale(1.05);
                }
                .player-card.empty {
                    background: rgba(255,255,255,0.3);
                    border: 2px dashed #fff;
                }
                .player-name {
                    font-size: 11px;
                    font-weight: 600;
                    margin-bottom: 2px;
                }
                .player-price {
                    font-size: 10px;
                    color: #059669;
                }
                .player-club {
                    font-size: 9px;
                    margin-top: 2px;
                }
                .clubs-section {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 2px solid rgba(255,255,255,0.3);
                }
                .club-card {
                    background: white;
                    border-radius: 8px;
                    padding: 10px 20px;
                    text-align: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
            </style>
        `;

        const renderPlayer = (player) => {
            if (!player) {
                return `<div class="player-card empty"><div class="player-name">Empty</div></div>`;
            }
            const clubName = player.team_name || player.club_name || '';
            const clubColor = clubColorMap.get(clubName) || '#6b7280';
            return `
                <div class="player-card" style="border-color: ${clubColor};">
                    <div class="player-name">${player.web_name || player.player_name || player.name || 'Unknown'}</div>
                    <div class="player-price">${formatCurrency(player.price_paid || 0)}</div>
                    <div class="player-club" style="color: ${clubColor};">${clubName}</div>
                </div>
            `;
        };

        const fillSlots = (players, max) => {
            const filled = [...players];
            while (filled.length < max) filled.push(null);
            return filled;
        };

        try {
            container.innerHTML = formationStyles + `
                <div class="formation-container">
                    <!-- Goalkeepers -->
                    <div class="formation-row">
                        ${fillSlots(squad.positions[1] || [], 2).map(p => renderPlayer(p)).join('')}
                    </div>
                    <!-- Defenders -->
                    <div class="formation-row">
                        ${fillSlots(squad.positions[2] || [], 5).map(p => renderPlayer(p)).join('')}
                    </div>
                    <!-- Midfielders -->
                    <div class="formation-row">
                        ${fillSlots(squad.positions[3] || [], 5).map(p => renderPlayer(p)).join('')}
                    </div>
                    <!-- Forwards -->
                    <div class="formation-row">
                        ${fillSlots(squad.positions[4] || [], 3).map(p => renderPlayer(p)).join('')}
                    </div>
                    
                    <!-- Clubs Section -->
                    ${squad.clubs.length > 0 ? `
                        <div class="clubs-section">
                            ${squad.clubs.map(club => `
                                <div class="club-card">
                                    <div class="font-semibold">${club.club_name || club.name || 'Unknown Club'}</div>
                                    <div class="text-xs text-gray-600">${club.club_short_name || club.short_name || ''}</div>
                                    <div class="text-sm text-emerald-600">${formatCurrency(club.price_paid || 0)}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                
                <!-- Budget Summary -->
                <div class="mt-4 bg-gray-100 rounded-lg p-3">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium">Total Spent:</span>
                        <span class="text-sm font-bold">${formatCurrency(totalSpent)}</span>
                    </div>
                    <div class="flex justify-between items-center mt-1">
                        <span class="text-sm font-medium">Remaining Budget:</span>
                        <span class="text-sm font-bold ${remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(remainingBudget)}</span>
                    </div>
                </div>
            `;
        } catch (renderError) {
            console.error('Error rendering team display:', renderError);
            container.innerHTML = '<div class="text-center py-8 text-red-500">Error displaying team data</div>';
        }
    }

    renderPositionSlots(players, maxSlots, positionName) {
        const slots = [];
        
        // Add filled slots
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            slots.push(`
                <div class="player-slot filled" title="${player.web_name}">
                    ${player.web_name.substring(0, 3)}
                </div>
            `);
        }
        
        // Add empty slots
        for (let i = players.length; i < maxSlots; i++) {
            slots.push(`
                <div class="player-slot">
                    ${positionName}
                </div>
            `);
        }
        
        return slots.join('');
    }

    async loadScoring() {
        const container = document.getElementById('scoringContent');
        container.innerHTML = `
            <div class="text-center py-8">
                <p class="text-gray-500">Scoring system will be implemented here</p>
                <p class="text-sm text-gray-400 mt-2">Coming soon...</p>
            </div>
        `;
    }

    async loadLeaderboard() {
        try {
            const teams = await api.getTeamsLeaderboard();
            this.displayLeaderboard(teams);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            showNotification('Failed to load leaderboard', 'error');
        }
    }

    displayLeaderboard(teams) {
        const container = document.getElementById('leaderboardContent');
        
        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-4 py-3 text-left">Rank</th>
                            <th class="px-4 py-3 text-left">Team</th>
                            <th class="px-4 py-3 text-right">Players</th>
                            <th class="px-4 py-3 text-right">Clubs</th>
                            <th class="px-4 py-3 text-right">Spent</th>
                            <th class="px-4 py-3 text-right">Remaining</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teams.map((team, index) => `
                            <tr class="border-b ${team.id === this.currentUser?.id ? 'bg-green-50' : ''}">
                                <td class="px-4 py-3">${index + 1}</td>
                                <td class="px-4 py-3 font-medium">${team.name}</td>
                                <td class="px-4 py-3 text-right">${team.player_count}/15</td>
                                <td class="px-4 py-3 text-right">${team.club_count}/2</td>
                                <td class="px-4 py-3 text-right">${formatCurrency(team.total_spent, false)}</td>
                                <td class="px-4 py-3 text-right">${formatCurrency(team.budget, false)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async loadAdminPanel() {
        if (!this.currentUser?.is_admin) {
            showNotification('Admin access required', 'error');
            return;
        }

        try {
            console.log('Loading admin panel...');
            
            // Load teams list for admin access management
            console.log('Fetching teams leaderboard...');
            const teams = await api.getTeamsLeaderboard();
            console.log('Teams received:', teams);
            
            this.displayAdminTeams(teams);
            
            // Load draft management
            await this.loadDraftManagement();
            
            // Load auction management data
            await this.loadAuctionManagement();
        } catch (error) {
            console.error('Error loading admin panel:', error);
            showNotification('Failed to load admin panel', 'error');
            
            // Display error in the teams list container
            const container = document.getElementById('adminTeamsList');
            if (container) {
                container.innerHTML = `<div class="text-red-500 text-center py-4">Error loading teams: ${error.message}</div>`;
            }
        }
    }

    displayAdminTeams(teams) {
        const container = document.getElementById('adminTeamsList');
        console.log('Displaying admin teams:', teams);
        
        if (!container) {
            console.error('adminTeamsList container not found');
            return;
        }
        
        if (!teams || teams.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-4">No teams found</div>';
            return;
        }
        
        container.innerHTML = teams.map(team => {
            const isSuper = team.id === 10;
            const isAdmin = team.is_admin || isSuper;
            
            return `
                <div class="flex items-center justify-between p-3 bg-white rounded border">
                    <div>
                        <span class="font-medium">${team.name}</span>
                        <span class="text-sm text-gray-500 ml-2">(${team.username})</span>
                        ${isSuper ? '<span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded ml-2">Super Admin</span>' : ''}
                        ${isAdmin && !isSuper ? '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded ml-2">Admin</span>' : ''}
                    </div>
                    <div>
                        ${!isSuper ? `
                            ${isAdmin ? `
                                <button onclick="app.revokeAdmin(${team.id})" 
                                        class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                                    Revoke Admin
                                </button>
                            ` : `
                                <button onclick="app.grantAdmin(${team.id})" 
                                        class="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">
                                    Grant Admin
                                </button>
                            `}
                        ` : '<span class="text-xs text-gray-500">Cannot modify</span>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    async grantAdmin(teamId) {
        try {
            const response = await fetch(`${api.baseURL}/teams/${teamId}/grant-admin`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${api.token}`
                }
            });

            if (response.ok) {
                showNotification('Admin access granted', 'success');
                await this.loadAdminPanel();
            } else {
                const error = await response.json();
                showNotification(error.error || 'Failed to grant admin', 'error');
            }
        } catch (error) {
            console.error('Error granting admin:', error);
            showNotification('Failed to grant admin access', 'error');
        }
    }

    async revokeAdmin(teamId) {
        try {
            const response = await fetch(`${api.baseURL}/teams/${teamId}/revoke-admin`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${api.token}`
                }
            });

            if (response.ok) {
                showNotification('Admin access revoked', 'success');
                await this.loadAdminPanel();
            } else {
                const error = await response.json();
                showNotification(error.error || 'Failed to revoke admin', 'error');
            }
        } catch (error) {
            console.error('Error revoking admin:', error);
            showNotification('Failed to revoke admin access', 'error');
        }
    }

    async loadAuctionManagement() {
        try {
            console.log('Loading auction management data...');
            
            // Load completed auctions for restart functionality
            console.log('Fetching completed auctions...');
            const completedAuctions = await api.getCompletedAuctions();
            console.log('Completed auctions response:', completedAuctions);
            this.displayCompletedAuctions(completedAuctions);
            
            // Load current auction with bids for cancel bid functionality
            console.log('Fetching current auction with bids...');
            const currentAuction = await api.getActiveAuctionWithBids();
            console.log('Current auction response:', currentAuction);
            this.displayCurrentAuctionBids(currentAuction);
        } catch (error) {
            console.error('Error loading auction management data:', error);
            
            // Show error messages in the UI
            const completedContainer = document.getElementById('completedAuctionsList');
            if (completedContainer) {
                completedContainer.innerHTML = `<div class="text-red-500 text-center py-4">Error loading completed auctions: ${error.message}</div>`;
            }
            
            const currentContainer = document.getElementById('currentAuctionBids');
            if (currentContainer) {
                currentContainer.innerHTML = `<div class="text-red-500 text-center py-4">Error loading current auction: ${error.message}</div>`;
            }
        }
    }

    displayCompletedAuctions(auctions) {
        const container = document.getElementById('completedAuctionsList');
        if (!container) return;
        
        if (!auctions || auctions.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-4">No completed auctions</div>';
            return;
        }
        
        container.innerHTML = auctions.slice(-10).map(auction => {
            // Handle Firestore timestamp format
            let dateStr = '';
            if (auction.completed_at) {
                if (auction.completed_at._seconds) {
                    // Firestore timestamp
                    dateStr = new Date(auction.completed_at._seconds * 1000).toLocaleString();
                } else {
                    // Regular date
                    dateStr = new Date(auction.completed_at).toLocaleString();
                }
            }
            
            return `
                <div class="flex items-center justify-between p-3 bg-white rounded border">
                    <div class="flex-1">
                        <div class="font-semibold">${auction.player_name || auction.club_name || 'Unknown'}</div>
                        <div class="text-sm text-gray-600">
                            Sold to ${auction.winning_team_name || 'Unknown'} for ${formatCurrency(auction.final_price || 0)}
                        </div>
                        <div class="text-xs text-gray-500">
                            ${dateStr}
                        </div>
                    </div>
                    <button onclick="window.app.restartAuction('${auction.id}')" 
                            class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                        Restart
                    </button>
                </div>
            `;
        }).join('');
    }

    displayCurrentAuctionBids(auction) {
        const container = document.getElementById('currentAuctionBids');
        if (!container) return;
        
        if (!auction || !auction.bids || auction.bids.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-4">No active auction or bids</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="mb-4">
                <div class="font-semibold text-lg">${auction.player_name || auction.club_name || 'Unknown'}</div>
                <div class="text-sm text-gray-600">Current Status: ${auction.stage || 'Unknown'}</div>
            </div>
            <div class="space-y-2 max-h-48 overflow-y-auto">
                ${auction.bids.slice(-5).map((bid, index) => `
                    <div class="flex items-center justify-between p-2 bg-gray-50 rounded ${index === auction.bids.length - 1 ? 'border-l-4 border-blue-500' : ''}">
                        <div class="flex-1">
                            <div class="font-medium">${bid.team_name || 'Unknown Team'}</div>
                            <div class="text-sm text-gray-600">${formatCurrency(bid.amount || 0)}</div>
                            <div class="text-xs text-gray-500">
                                ${new Date(bid.created_at).toLocaleString()}
                            </div>
                        </div>
                        ${index === auction.bids.length - 1 ? `
                            <button onclick="window.app.cancelLastBid('${auction.id}')" 
                                    class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs">
                                Cancel
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    async restartAuction(auctionId) {
        if (!confirm('Are you sure you want to restart this completed auction? This will reopen it at the exact same point.')) {
            return;
        }
        
        try {
            const response = await api.restartCompletedAuction(auctionId);
            showNotification('Auction restarted successfully', 'success');
            
            // Refresh auction data
            await this.loadAuctionManagement();
            
            // Notify other users via socket if available
            if (window.socketManager?.socket) {
                window.socketManager.socket.emit('auction-restarted', { auctionId });
            }
        } catch (error) {
            console.error('Error restarting auction:', error);
            showNotification('Failed to restart auction', 'error');
        }
    }

    async cancelLastBid(auctionId) {
        if (!confirm('Are you sure you want to cancel the last bid? This will go back one step in the auction.')) {
            return;
        }
        
        try {
            const response = await api.cancelPreviousBid(auctionId);
            showNotification('Last bid cancelled successfully', 'success');
            
            // Refresh auction data
            await this.loadAuctionManagement();
            
            // Notify other users via socket if available
            if (window.socketManager?.socket) {
                window.socketManager.socket.emit('bid-cancelled', { auctionId });
            }
        } catch (error) {
            console.error('Error cancelling bid:', error);
            showNotification('Failed to cancel bid', 'error');
        }
    }

    // Draft Management Methods
    async loadDraftManagement() {
        try {
            const drafts = await api.getDrafts();
            this.displayDrafts(drafts);
        } catch (error) {
            console.error('Error loading drafts:', error);
            const container = document.getElementById('draftsList');
            if (container) {
                container.innerHTML = `<div class="text-red-500 text-center py-4">Error loading drafts: ${error.message}</div>`;
            }
        }
    }

    displayDrafts(drafts) {
        const container = document.getElementById('draftsList');
        if (!container) return;
        
        if (!drafts || drafts.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-4">No drafts created yet</div>';
            return;
        }
        
        container.innerHTML = drafts.map(draft => `
            <div class="flex items-center justify-between p-3 bg-white rounded border ${draft.is_active ? 'border-green-500 bg-green-50' : ''}">
                <div>
                    <div class="font-medium">${draft.name}</div>
                    <div class="text-sm text-gray-600">
                        ${draft.description || 'No description'}
                        ${draft.is_active ? '<span class="text-green-600 font-medium ml-2">(Active)</span>' : ''}
                    </div>
                    ${draft.total_auctions !== undefined ? `
                        <div class="text-xs text-gray-500 mt-1">
                            Auctions: ${draft.completed_auctions || 0}/${draft.total_auctions || 0}
                        </div>
                    ` : ''}
                </div>
                <div class="flex gap-2">
                    ${!draft.is_active ? `
                        <button onclick="window.app.setActiveDraft('${draft.id}')" 
                                class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                            Activate
                        </button>
                    ` : ''}
                    <button onclick="window.app.resetDraft('${draft.id}')" 
                            class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">
                        Reset
                    </button>
                </div>
            </div>
        `).join('');
    }

    async createNewDraft() {
        const nameInput = document.getElementById('newDraftName');
        const name = nameInput?.value?.trim();
        
        if (!name) {
            showNotification('Please enter a draft name', 'error');
            return;
        }
        
        try {
            const response = await api.createDraft(name, '');
            if (response.success) {
                showNotification('Draft created successfully', 'success');
                nameInput.value = '';
                await this.loadDraftManagement();
            }
        } catch (error) {
            console.error('Error creating draft:', error);
            showNotification('Failed to create draft', 'error');
        }
    }

    async setActiveDraft(draftId) {
        try {
            if (!confirm('Are you sure you want to activate this draft? This will make it the current active draft.')) {
                return;
            }
            
            const response = await api.setActiveDraft(draftId);
            if (response.success) {
                showNotification('Draft activated successfully', 'success');
                
                // Reload the page to refresh all data for the new active draft
                setTimeout(() => location.reload(), 1000);
            }
        } catch (error) {
            console.error('Error activating draft:', error);
            showNotification('Failed to activate draft', 'error');
        }
    }

    async resetDraft(draftId) {
        try {
            const resetBudgets = confirm('Reset team budgets to J1000?\n\nOK = Reset budgets\nCancel = Keep current budgets');
            
            if (!confirm(`This will clear all auction data${resetBudgets ? ' and reset budgets' : ''}. Are you sure?`)) {
                return;
            }
            
            const response = await api.resetDraft(draftId, resetBudgets);
            if (response.success) {
                showNotification('Draft reset successfully', 'success');
                await this.loadDraftManagement();
                
                // Reload the page to refresh all data
                setTimeout(() => location.reload(), 1000);
            }
        } catch (error) {
            console.error('Error resetting draft:', error);
            showNotification('Failed to reset draft', 'error');
        }
    }

    // Refresh data when tab becomes active
    async refreshDataOnTabFocus() {
        try {
            // Refresh team budget
            await this.refreshTeamBudget();
            
            // Let each tab handle its own refresh
            switch (this.currentTab) {
                case 'auction':
                    if (window.auctionManager) {
                        await window.auctionManager.refreshAuctionOnTabFocus();
                    }
                    break;
                case 'myTeam':
                    if (window.teamManager) {
                        await window.teamManager.loadTeamSquad();
                    }
                    break;
                case 'draft':
                    if (window.draftManager) {
                        await window.draftManager.loadDraftState();
                    }
                    break;
                case 'history':
                    if (window.historyManager) {
                        await window.historyManager.loadHistory();
                    }
                    break;
                case 'scoring':
                    if (window.scoringManager) {
                        await window.scoringManager.loadCurrentGameweek();
                    }
                    break;
                case 'admin':
                    if (this.currentUser?.is_admin) {
                        await this.loadAdminPanel();
                    }
                    break;
            }
            
            console.log('Data refreshed for tab:', this.currentTab);
        } catch (error) {
            console.error('Error refreshing data on tab focus:', error);
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});