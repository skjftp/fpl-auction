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

    hideViewerRestrictedElements() {
        // Hide password and team name buttons
        const passwordBtn = document.getElementById('passwordBtn');
        const teamNameBtn = document.getElementById('teamNameBtn');
        if (passwordBtn) passwordBtn.style.display = 'none';
        if (teamNameBtn) teamNameBtn.style.display = 'none';
        
        // Hide auto-bid card
        const autoBidCard = document.querySelector('.auto-bid-card');
        if (autoBidCard) autoBidCard.style.display = 'none';
        
        // Update budget display for viewer
        const budgetElement = document.getElementById('teamBudget');
        if (budgetElement) {
            budgetElement.innerHTML = '<span style="color: #999; font-size: 12px;">Viewer</span>';
        }
        
        // Hide bid controls in auction tab
        const bidControls = document.querySelector('.bid-controls');
        if (bidControls) bidControls.style.display = 'none';
        
        // Hide wait button
        const waitBtn = document.getElementById('waitBtn');
        if (waitBtn) waitBtn.style.display = 'none';
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
            this.isViewer = response.team.is_viewer || false;
            
            // Show different welcome message for viewers
            if (this.isViewer) {
                this.showToast(`Welcome, ${this.currentUser.name || 'Viewer'}! (View-only mode)`, 'info');
            } else {
                this.showToast(`Welcome, ${this.currentUser.name || 'User'}!`, 'success');
            }
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
            
            // Hide viewer-restricted UI elements
            if (this.isViewer) {
                this.hideViewerRestrictedElements();
            }
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize managers
            await this.initializeManagers();
            
            // Load initial data
            await this.loadInitialData();
            
            // Connect to socket
            window.mobileSocket.connect();
            
            // Show auction tab active state
            const mainApp = document.getElementById('mainApp');
            if (this.currentTab === 'auction') {
                mainApp.classList.add('auction-active');
            }
            
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
                    teamBudgetEl.innerHTML = formatCurrency(teamData.budget || 0, false);
                }
                
                // Update current user data
                this.currentUser = { ...this.currentUser, ...teamData };
            }
        } catch (error) {
            console.error('Error refreshing team data:', error);
        }
    }

    setupEventListeners() {
        // TTS toggle button
        const ttsToggleBtn = document.getElementById('ttsToggleBtn');
        if (ttsToggleBtn) {
            ttsToggleBtn.addEventListener('click', () => this.toggleTTS());
            // Initialize button state
            this.initializeTTSButton();
        }
        
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Password button
        const passwordBtn = document.getElementById('passwordBtn');
        if (passwordBtn) {
            passwordBtn.addEventListener('click', () => this.showPasswordModal());
        }

        // Team name button
        const teamNameBtn = document.getElementById('teamNameBtn');
        if (teamNameBtn) {
            teamNameBtn.addEventListener('click', () => this.showTeamNameModal());
        }

        // Password modal
        this.initializePasswordModal();

        // Team name modal
        this.initializeTeamNameModal();

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

        // View toggle removed - always use formation view

        // Team selector dropdown
        const teamSelector = document.getElementById('teamSelector');
        if (teamSelector) {
            teamSelector.addEventListener('change', (e) => this.loadSelectedTeamSquad(e.target.value));
        }

        // History tab filters
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterHistory(e.target.dataset.filter);
            });
        });
        
        const historySearch = document.getElementById('historySearch');
        if (historySearch) {
            historySearch.addEventListener('input', () => this.searchHistory());
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

        // Page visibility API - refresh auction when tab becomes active
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentUser) {
                console.log('Mobile tab became active, refreshing auction data...');
                this.refreshDataOnTabFocus();
            }
        });

        // Also handle window focus for better mobile browser support
        window.addEventListener('focus', () => {
            if (this.currentUser) {
                console.log('Mobile window focused, refreshing auction data...');
                this.refreshDataOnTabFocus();
            }
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
            // Show loading state for chat immediately
            this.showChatLoadingState();
            
            // Load all critical data including chat in parallel for instant loading
            await Promise.all([
                this.loadDraftState(),
                this.loadTeamSquad(),
                this.loadChatMessages()  // Load chat synchronously with other data
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    // Show chat loading state immediately to prevent empty UI
    showChatLoadingState() {
        if (this.currentTab === 'auction') {
            const container = document.getElementById('chatMessagesMini');
            if (container) {
                container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 12px; font-size: 12px;">Loading messages...</div>';
            }
        }
    }

    // Load chat messages
    async loadChatMessages() {
        try {
            console.log('💬 Mobile App: Starting to load chat messages...');
            const messages = await window.mobileAPI.getChatMessages();
            this.chatMessages = messages || [];
            console.log(`💬 Mobile App: Successfully loaded ${this.chatMessages.length} chat messages`);
            // Only render if we're currently on the auction tab
            if (this.currentTab === 'auction') {
                this.renderChatMessagesMini();
            }
        } catch (error) {
            console.error('Error loading chat messages:', error);
            // Show empty state if chat fails to load
            this.chatMessages = [];
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
        console.log('📊 Mobile: Updating draft status with state:', draftState);
        
        const currentTurnEl = document.getElementById('currentTurn');
        const nextTurnEl = document.getElementById('nextTurn');
        
        if (currentTurnEl && draftState) {
            if (draftState.is_active) {
                const isMyTurn = this.currentUser && draftState.current_team_id === this.currentUser.id;
                const teamName = draftState.current_team_name || 'Unknown';
                
                if (isMyTurn) {
                    currentTurnEl.innerHTML = `<span style="color: #10b981; font-weight: 700;">Your Turn!</span>`;
                } else {
                    currentTurnEl.textContent = teamName;
                }

                // Calculate next turn with snake draft logic
                if (nextTurnEl) {
                    const nextTurnInfo = this.calculateNextTurn(draftState);
                    console.log('🐍 Mobile: Next turn calculation:', {
                        currentRound: draftState.current_round,
                        currentTeamId: draftState.current_team_id,
                        currentTeamName: draftState.current_team_name,
                        nextTurnInfo: nextTurnInfo
                    });
                    const isMyNextTurn = this.currentUser && nextTurnInfo.teamId === this.currentUser.id;
                    
                    if (isMyNextTurn) {
                        nextTurnEl.innerHTML = `<span style="color: #10b981; font-weight: 700;">You!</span>`;
                    } else {
                        nextTurnEl.textContent = nextTurnInfo.teamName;
                    }
                }
            } else if (draftState.draft_order && draftState.draft_order.length > 0) {
                // Draft initialized but not started - show first team
                const firstTeam = draftState.draft_order[0];
                currentTurnEl.textContent = firstTeam.name || 'Team1';
                if (nextTurnEl) {
                    const secondTeam = draftState.draft_order[1];
                    nextTurnEl.textContent = secondTeam ? secondTeam.name : '-';
                }
            } else {
                currentTurnEl.textContent = 'Draft not active';
                if (nextTurnEl) {
                    nextTurnEl.textContent = '-';
                }
            }
        }
    }

    calculateNextTurn(draftState) {
        // Snake draft logic: 22 rounds, 10 teams
        // Positions 1-10: Round 1 (teams 1→10)
        // Positions 11-20: Round 2 (teams 10→1) 
        // Positions 21-30: Round 3 (teams 1→10)
        // etc.
        
        const totalTeams = 10; // Always 10 teams in FPL auction
        const teams = draftState.draft_order || draftState.teams || [];
        
        // Get current cumulative position
        const currentCumulativePosition = draftState.current_position || 1;
        
        // Calculate next cumulative position
        const nextCumulativePosition = currentCumulativePosition + 1;
        
        // Check if draft is complete (22 rounds * 10 teams = 220 picks)
        if (nextCumulativePosition > 220) {
            return { teamId: null, teamName: 'Draft Complete' };
        }
        
        // Calculate which round and position within that round
        const nextRound = Math.ceil(nextCumulativePosition / totalTeams);
        const positionInRound = ((nextCumulativePosition - 1) % totalTeams) + 1;
        
        // Determine team position based on snake draft
        let teamPosition;
        if (nextRound % 2 === 1) {
            // Odd rounds go 1→10
            teamPosition = positionInRound;
        } else {
            // Even rounds go 10→1
            teamPosition = totalTeams - positionInRound + 1;
        }
        
        console.log('🐍 Mobile: Snake draft calculation:', {
            currentCumulativePosition,
            nextCumulativePosition,
            nextRound,
            positionInRound,
            teamPosition
        });
        
        // Get team at the next position from draft_order (teams already declared above)
        
        console.log('🐍 Mobile: Draft order teams:', teams.map(t => ({
            name: t.name,
            team_id: t.team_id,
            position: t.position,
            index: teams.indexOf(t) + 1
        })));
        
        // Find team at the calculated team position
        let nextTeam;
        if (teams.length > 0 && teams[0].position !== undefined) {
            nextTeam = teams.find(team => team.position === teamPosition);
        } else {
            // Use array index (position 1 = index 0, position 2 = index 1, etc.)
            nextTeam = teams[teamPosition - 1];
        }
        
        const nextTeamName = nextTeam?.name || `Team ${teamPosition}`;
        const nextTeamId = nextTeam?.team_id || nextTeam?.id || teamPosition;
            
        return { 
            teamId: nextTeamId, 
            teamName: nextTeamName, 
            position: teamPosition,
            cumulativePosition: nextCumulativePosition,
            round: nextRound
        };
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
        
        // Show auction tab with chat
        const mainApp = document.getElementById('mainApp');
        if (tabName === 'auction') {
            mainApp.classList.add('auction-active');
            // Delay chat rendering to ensure proper DOM setup
            setTimeout(() => {
                this.renderChatMessagesMini();
                this.fixChatScroll();
            }, 100);
        } else {
            mainApp.classList.remove('auction-active');
        }
        
        // Load tab-specific data
        this.loadTabData(tabName);
    }

    // Fix chat scroll issues when switching to auction tab
    fixChatScroll() {
        const chatContainer = document.getElementById('chatMessagesMini');
        if (chatContainer) {
            // Force reflow to fix scroll issues
            chatContainer.style.overflow = 'hidden';
            setTimeout(() => {
                chatContainer.style.overflow = 'scroll';
                // Ensure we're scrolled to bottom
                chatContainer.scrollTop = chatContainer.scrollHeight;
                // Trigger scroll capability
                chatContainer.dispatchEvent(new Event('scroll'));
            }, 50);
        }
    }

    // View switching removed - always use formation view

    async loadTabData(tabName) {
        switch (tabName) {
            case 'team':
                await this.loadTeamSquad();
                await this.populateTeamDropdown();
                break;
            case 'history':
                await this.loadHistory();
                break;
            case 'auction':
                // Ensure chat messages are loaded if not already
                if (this.chatMessages.length === 0) {
                    await this.loadChatMessages();
                } else {
                    this.renderChatMessagesMini();
                }
                break;
        }
    }

    async populateTeamDropdown() {
        try {
            const teamSelector = document.getElementById('teamSelector');
            if (!teamSelector) return;
            
            // Get all teams
            const teams = await window.mobileAPI.getAllTeams();
            
            // Clear existing options
            teamSelector.innerHTML = '';
            
            // Add current user's team first
            const myOption = document.createElement('option');
            myOption.value = this.currentUser.id;
            myOption.textContent = 'My Squad';
            myOption.selected = true;
            teamSelector.appendChild(myOption);
            
            // Add separator
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '──────────';
            teamSelector.appendChild(separator);
            
            // Add other teams
            teams.forEach(team => {
                if (team.id !== this.currentUser.id) {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = team.name;
                    teamSelector.appendChild(option);
                }
            });
        } catch (error) {
            console.error('Error populating team dropdown:', error);
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
    
    async loadSelectedTeamSquad(teamId) {
        try {
            const selectedTeamId = teamId || this.currentUser.id;
            const squad = await window.mobileAPI.getTeamSquad(selectedTeamId);
            this.renderTeamSquad(squad);
        } catch (error) {
            console.error('Error loading selected team squad:', error);
            this.showToast('Failed to load team squad', 'error');
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

        // Always use formation view
        container.innerHTML = this.renderFormationView(positions, squad.clubs);
    }

    renderFormationView(positions, clubs) {
        const gkps = positions['GKP'] || [];
        const defs = positions['DEF'] || [];
        const mids = positions['MID'] || [];
        const fwds = positions['FWD'] || [];

        // Create club color mapping
        const clubColors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
            '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
        ];
        const clubColorMap = new Map();
        let colorIndex = 0;

        // Assign colors to clubs
        [...gkps, ...defs, ...mids, ...fwds].forEach(player => {
            if (player && player.team_name && !clubColorMap.has(player.team_name)) {
                clubColorMap.set(player.team_name, clubColors[colorIndex % clubColors.length]);
                colorIndex++;
            }
        });

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
                        <div class="formation-player-image empty-image">
                            <span>+</span>
                        </div>
                        <div class="formation-player-name">Empty</div>
                    </div>
                `;
            }
            
            const clubColor = clubColorMap.get(player.team_name) || '#6b7280';
            
            // Get player image URL (same logic as web version)
            const getPlayerImageUrl = () => {
                if (player.photo) {
                    const photoCode = player.photo.replace('.jpg', '');
                    return `https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoCode}.png`;
                } else if (player.code) {
                    return `https://resources.premierleague.com/premierleague/photos/players/250x250/p${player.code}.png`;
                } else if (player.id) {
                    return `https://resources.premierleague.com/premierleague/photos/players/250x250/p${player.id}.png`;
                }
                return null;
            };
            
            const playerImageUrl = getPlayerImageUrl();
            const isLightColor = ['#FFFFFF', '#FDB913', '#95BFE5', '#6CABDD', '#3AAFDD'].includes(clubColor);
            const borderColor = isLightColor ? '#374151' : '#FFFFFF';
            
            return `
                <div class="formation-player">
                    <div class="formation-player-image" style="border-color: ${borderColor}; background-color: ${clubColor};">
                        ${playerImageUrl ? 
                            `<img src="${playerImageUrl}" 
                                 alt="${player.web_name}" 
                                 onerror="this.style.display='none'; this.parentElement.querySelector('.player-initials').style.display='flex';">
                             <div class="player-initials" style="display: none; color: ${borderColor};">
                                ${player.web_name ? player.web_name.substring(0, 2).toUpperCase() : 'UN'}
                             </div>` :
                            `<div class="player-initials" style="color: ${borderColor};">
                                ${player.web_name ? player.web_name.substring(0, 2).toUpperCase() : 'UN'}
                             </div>`
                        }
                    </div>
                    <div class="formation-player-name">${player.web_name || player.name || 'Unknown'}</div>
                    <div class="formation-player-price">${formatCurrency(player.price_paid || 0)}</div>
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
                    <div class="formation-club-price">${formatCurrency(club.price_paid || 0)}</div>
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
                            <div class="squad-player-price">${formatCurrency(player.price_paid || 0)}</div>
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
                            <div class="squad-player-price">${formatCurrency(club.price_paid || 0)}</div>
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

    renderChatMessages() {
        // Render to mini chat at bottom
        this.renderChatMessagesMini();
    }
    
    renderChatMessagesMini() {
        const container = document.getElementById('chatMessagesMini');
        if (!container) return;

        if (this.chatMessages.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 8px; font-size: 12px;">Loading messages...</div>';
            return;
        }

        // Limit to last 50 messages for better performance
        const messagesToShow = this.chatMessages.slice(-50);
        const wasScrolledToBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 5;

        container.innerHTML = messagesToShow.map(msg => {
            // Handle system messages
            if (msg.isSystem) {
                const color = msg.systemType === 'connect' ? '#10b981' : msg.systemType === 'disconnect' ? '#ef4444' : '#6b7280';
                const arrow = msg.systemType === 'connect' ? '→' : msg.systemType === 'disconnect' ? '←' : '';
                return `
                    <div style="text-align: center; padding: 4px 0;">
                        <span style="color: ${color}; font-size: 11px; font-weight: 500;">
                            ${arrow} ${this.escapeHtml(msg.message || '')}
                        </span>
                    </div>
                `;
            }
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

            // Check if this is the current user's message
            const isOwnMessage = this.currentUser && (
                msg.team_id === this.currentUser.id || 
                msg.team_name === this.currentUser.name
            );

            if (isOwnMessage) {
                // Right-aligned style for own messages
                return `
                    <div class="chat-message" style="text-align: right;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <span style="color: #9ca3af; font-size: 10px;">${timeString}</span>
                            <span style="font-weight: 600; color: #059669; font-size: 11px;">You</span>
                        </div>
                        <div style="
                            display: inline-block; 
                            background-color: #10b981; 
                            color: white; 
                            padding: 6px 10px; 
                            border-radius: 12px 12px 0 12px; 
                            max-width: 80%; 
                            text-align: left;
                            font-size: 12px;
                        ">${this.escapeHtml(msg.message || '')}</div>
                    </div>
                `;
            } else {
                // Left-aligned style for other messages
                return `
                    <div class="chat-message">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <span style="font-weight: 600; color: #374151; font-size: 11px;">${msg.team_name || 'Unknown'}</span>
                            <span style="color: #9ca3af; font-size: 10px;">${timeString}</span>
                        </div>
                        <div style="
                            display: inline-block; 
                            background-color: #f3f4f6; 
                            color: #1f2937; 
                            padding: 6px 10px; 
                            border-radius: 12px 12px 12px 0; 
                            max-width: 80%;
                            font-size: 12px;
                        ">${this.escapeHtml(msg.message || '')}</div>
                    </div>
                `;
            }
        }).join('');

        // Only auto-scroll if user was already at bottom or on initial load
        if (wasScrolledToBottom || !container.hasScrolled) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
                container.hasScrolled = true;
            }, 10);
        }
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
            // Update mini chat at bottom if on auction tab
            if (this.currentTab === 'auction') {
                this.renderChatMessagesMini();
            }
        }
    }

    addSystemChatMessage(message) {
        // Add system message without duplicate check
        this.chatMessages.push(message);
        // Update mini chat at bottom if on auction tab
        if (this.currentTab === 'auction') {
            this.renderChatMessagesMini();
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

    initializeTTSButton() {
        if (window.ttsManager) {
            const btn = document.getElementById('ttsToggleBtn');
            
            if (window.ttsManager.enabled) {
                btn?.classList.add('active');
            } else {
                btn?.classList.remove('active');
            }
        }
    }

    toggleTTS() {
        if (window.ttsManager) {
            const isEnabled = window.ttsManager.toggle();
            const btn = document.getElementById('ttsToggleBtn');
            
            if (isEnabled) {
                btn?.classList.add('active');
                this.showToast('Voice announcements enabled', 'success');
                
                // Test TTS
                window.ttsManager.test();
            } else {
                btn?.classList.remove('active');
                this.showToast('Voice announcements disabled', 'info');
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

    // Refresh data when tab becomes active
    async refreshDataOnTabFocus() {
        try {
            // Refresh current auction immediately if on auction tab
            if (this.currentTab === 'auction' && window.mobileAuction) {
                await window.mobileAuction.loadActiveAuction();
                await window.mobileAuction.loadSoldItems();
                await window.mobileAuction.renderPlayers();
            }
            
            // Refresh team data
            await this.refreshTeamData();
            
            // Refresh draft state
            await this.loadDraftState();
            
            // Refresh other tab-specific data
            switch (this.currentTab) {
                case 'squad':
                    await this.loadTeamSquad();
                    break;
                case 'history':
                    await this.loadHistory();
                    break;
                case 'chat':
                    await this.loadChatMessages();
                    break;
            }
            
            console.log('Mobile data refreshed for tab:', this.currentTab);
        } catch (error) {
            console.error('Error refreshing mobile data on tab focus:', error);
        }
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

    // History methods
    async loadHistory() {
        try {
            // Load both sales and bid history
            const [soldItems, bidHistory] = await Promise.all([
                window.mobileAPI.getSoldItems(),
                window.mobileAPI.getBidHistory()
            ]);
            
            console.log('Loaded bid history:', bidHistory);
            console.log('Loaded sold items:', soldItems);
            
            // Handle different response formats for bid history
            let bidData = [];
            if (bidHistory && bidHistory.bids && Array.isArray(bidHistory.bids)) {
                bidData = bidHistory.bids;
            } else if (Array.isArray(bidHistory)) {
                bidData = bidHistory;
            }
            
            this.historyItems = [
                ...(Array.isArray(soldItems) ? soldItems.map(item => ({ 
                    ...item, 
                    type: 'sale',
                    // Use acquired_at for sold items
                    timestamp: item.acquired_at || item.sold_at || item.created_at
                })) : []),
                ...bidData.map(item => ({ 
                    ...item, 
                    type: item.isAutoBid ? 'auto-bid' : 'bid',
                    timestamp: item.created_at
                }))
            ].sort((a, b) => {
                const aTime = this.parseTimestamp(a.timestamp);
                const bTime = this.parseTimestamp(b.timestamp);
                return bTime - aTime;
            });
            
            console.log('Combined history items:', this.historyItems);
            
            this.renderHistory('bids');
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }
    
    renderHistory(filter = 'bids', search = '') {
        const container = document.getElementById('historyList');
        if (!container) return;
        
        let items = this.historyItems || [];
        console.log('Rendering history with filter:', filter);
        console.log('All history items:', items);
        
        // Apply filter
        if (filter === 'bids') {
            items = items.filter(item => item.type === 'bid' || item.type === 'auto-bid');
            console.log('Filtered bid items:', items);
        } else if (filter === 'sales') {
            items = items.filter(item => item.type === 'sale');
        }
        
        // Apply search
        if (search) {
            const searchLower = search.toLowerCase();
            items = items.filter(item => 
                (item.player_name || item.club_name || '').toLowerCase().includes(searchLower) ||
                (item.team_name || '').toLowerCase().includes(searchLower)
            );
        }
        
        if (items.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 40px;">No history found</div>';
            return;
        }
        
        container.innerHTML = items.map(item => {
            const typeClass = item.type === 'sale' ? 'sale' : (item.type === 'auto-bid' ? 'auto-bid' : 'bid');
            const typeText = item.type === 'sale' ? 'SOLD' : (item.type === 'auto-bid' ? 'AUTO-BID' : 'BID');
            
            return `
                <div class="history-item">
                    <div class="history-item-info">
                        <span class="history-item-type ${typeClass}">${typeText}</span>
                        <div style="font-weight: 600; color: #1f2937; margin-top: 4px;">
                            ${item.player_name || item.club_name || 'Unknown'}
                        </div>
                        <div style="font-size: 12px; color: #6b7280;">
                            ${item.team_name || 'Unknown Team'}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 16px; font-weight: 600; color: #10b981;">
                            ${formatCurrency(item.price_paid || item.bidAmount || 0)}
                        </div>
                        <div style="font-size: 10px; color: #9ca3af;">
                            ${this.formatHistoryTime(item.timestamp || item.created_at || item.acquired_at || item.sold_at)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    filterHistory(filter) {
        const search = document.getElementById('historySearch')?.value || '';
        this.renderHistory(filter, search);
    }
    
    searchHistory() {
        const filter = document.querySelector('.filter-btn.active')?.dataset.filter || 'bids';
        const search = document.getElementById('historySearch')?.value || '';
        this.renderHistory(filter, search);
    }
    
    parseTimestamp(timestamp) {
        if (!timestamp) return new Date(0);
        
        // Handle Firestore timestamp format
        if (timestamp && typeof timestamp === 'object' && timestamp._seconds) {
            return new Date(timestamp._seconds * 1000);
        }
        
        // Handle regular date string
        return new Date(timestamp);
    }
    
    formatHistoryTime(timestamp) {
        try {
            const date = this.parseTimestamp(timestamp);
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return '';
            }
            
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
            return date.toLocaleDateString();
        } catch (error) {
            return '';
        }
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

    // Password change functionality
    initializePasswordModal() {
        const modal = document.getElementById('passwordModal');
        const closeBtn = document.getElementById('closePasswordModalBtn');
        const form = document.getElementById('passwordForm');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hidePasswordModal());
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hidePasswordModal();
                }
            });
        }

        if (form) {
            form.addEventListener('submit', (e) => this.handlePasswordChange(e));
        }
    }

    showPasswordModal() {
        const modal = document.getElementById('passwordModal');
        if (modal) {
            modal.classList.remove('hidden');
            // Reset form
            document.getElementById('passwordForm')?.reset();
            this.hidePasswordError();
        }
    }

    hidePasswordModal() {
        const modal = document.getElementById('passwordModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showPasswordError(message) {
        const errorEl = document.getElementById('passwordError');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    }

    hidePasswordError() {
        const errorEl = document.getElementById('passwordError');
        if (errorEl) {
            errorEl.classList.add('hidden');
        }
    }

    async handlePasswordChange(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validate passwords match
        if (newPassword !== confirmPassword) {
            this.showPasswordError('New passwords do not match');
            return;
        }

        // Validate password length
        if (newPassword.length < 6) {
            this.showPasswordError('New password must be at least 6 characters');
            return;
        }

        try {
            const result = await window.mobileAPI.changePassword(currentPassword, newPassword);
            
            if (result.success) {
                this.showToast('Password changed successfully', 'success');
                this.hidePasswordModal();
            }
        } catch (error) {
            console.error('Password change error:', error);
            this.showPasswordError(error.message || 'Failed to change password');
        }
    }

    // Team name change functionality
    initializeTeamNameModal() {
        const modal = document.getElementById('teamNameModal');
        const closeBtn = document.getElementById('closeTeamNameModalBtn');
        const form = document.getElementById('teamNameForm');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideTeamNameModal());
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideTeamNameModal();
                }
            });
        }

        if (form) {
            form.addEventListener('submit', (e) => this.handleTeamNameChange(e));
        }
    }

    showTeamNameModal() {
        const modal = document.getElementById('teamNameModal');
        if (modal) {
            modal.classList.remove('hidden');
            // Set current team name
            const currentNameDisplay = document.getElementById('currentTeamNameDisplay');
            if (currentNameDisplay && this.currentTeam) {
                currentNameDisplay.textContent = this.currentTeam.name;
            }
            // Reset form
            document.getElementById('teamNameForm')?.reset();
            this.hideTeamNameError();
        }
    }

    hideTeamNameModal() {
        const modal = document.getElementById('teamNameModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showTeamNameError(message) {
        const errorDiv = document.getElementById('teamNameError');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
        }
    }

    hideTeamNameError() {
        const errorDiv = document.getElementById('teamNameError');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    }

    async handleTeamNameChange(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('teamNamePassword').value;
        const newTeamName = document.getElementById('newTeamName').value;

        // Validate team name length
        if (newTeamName.length < 3 || newTeamName.length > 30) {
            this.showTeamNameError('Team name must be between 3 and 30 characters');
            return;
        }

        try {
            const response = await fetch(`${window.mobileAPI.baseURL}/auth/change-team-name`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.mobileAPI.token}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newTeamName
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Update local token and team info
                window.mobileAPI.setToken(data.token);
                this.currentTeam = data.team;
                
                // Update UI with new team name
                const teamNameElement = document.getElementById('teamName');
                if (teamNameElement) {
                    teamNameElement.textContent = data.team.name;
                }
                
                this.showToast('Team name changed successfully', 'success');
                this.hideTeamNameModal();
            } else {
                this.showTeamNameError(data.error || 'Failed to change team name');
            }
        } catch (error) {
            console.error('Team name change error:', error);
            this.showTeamNameError('Network error. Please try again.');
        }
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