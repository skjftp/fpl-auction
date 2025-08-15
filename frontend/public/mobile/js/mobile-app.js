// Main Mobile App Controller for FPL Auction
class MobileApp {
    constructor() {
        this.currentUser = null;
        this.currentTab = 'submitTeam';  // Start with Submit Team tab
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
            
            // Connect to socket - DISABLED FOR PLAYING PHASE
            // window.mobileSocket.connect();
            
            // Show auction tab active state
            const mainApp = document.getElementById('mainApp');
            if (this.currentTab === 'auction') {
                mainApp.classList.add('auction-active');
            }
            
            // Load the initial tab data (Submit Team is first tab)
            await this.loadTabData(this.currentTab);
            
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
        // COMPLETELY DISABLED FOR PLAYING PHASE
        // No auction or auto-bid functionality needed during playing phase
        console.log('Auction/auto-bid managers disabled for playing phase');
        return;
        
        /* COMMENTED OUT FOR PLAYING PHASE
        // SKIP auction manager initialization during app startup
        // It will be initialized lazily when auction tab is accessed
        // This saves 5-7 seconds on app startup
        console.log('Skipping auction/autobid initialization for faster startup');
        
        // Mark managers as not initialized
        if (window.mobileAuction) {
            window.mobileAuction.initialized = false;
        }
        if (window.mobileAutoBid) {
            window.mobileAutoBid.initialized = false;
        }
        */
    }

    async loadInitialData() {
        try {
            // ALL INITIAL DATA LOADING DISABLED FOR PLAYING PHASE
            // No draft state, team squad, or chat needed on startup
            console.log('Playing phase - skipping all initial data loading for instant startup');
            
            // await this.loadDraftState() - DISABLED FOR PLAYING PHASE
            // await this.loadTeamSquad() - SKIP for faster startup
            // this.loadChatMessages() - DISABLED FOR PLAYING PHASE
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
        // DISABLED FOR PLAYING PHASE - Draft is complete
        console.log('Draft state loading disabled for playing phase');
        return;
        
        /* COMMENTED OUT FOR PLAYING PHASE
        try {
            const draftState = await window.mobileAPI.getDraftState();
            this.updateDraftStatus(draftState);
        } catch (error) {
            console.error('Error loading draft state:', error);
        }
        */
    }

    updateDraftStatus(draftState) {
        // DISABLED FOR PLAYING PHASE
        return;
        
        /* COMMENTED OUT FOR PLAYING PHASE
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
        */
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
        } else if (tabName === 'league') {
            // Initialize league tab if not already done
            if (!window.mobileLeague.initialized) {
                window.mobileLeague.initialize();
            }
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
                // AUCTION TAB DISABLED FOR PLAYING PHASE
                console.log('Auction tab - no initialization needed during playing phase');
                
                /* COMMENTED OUT FOR PLAYING PHASE
                // Initialize auction manager lazily if not already initialized
                if (window.mobileAuction && !window.mobileAuction.initialized) {
                    console.log('Initializing auction manager on first access...');
                    await window.mobileAuction.initialize();
                    window.mobileAuction.initialized = true;
                }
                
                // Initialize auto-bid manager lazily if not already initialized
                if (window.mobileAutoBid && !window.mobileAutoBid.initialized) {
                    console.log('Initializing auto-bid manager on first access...');
                    await window.mobileAutoBid.initialize();
                    window.mobileAutoBid.initialized = true;
                }
                
                // CHAT DISABLED FOR PLAYING PHASE
                // if (this.chatMessages.length === 0) {
                //     await this.loadChatMessages();
                // } else {
                //     this.renderChatMessagesMini();
                // }
                */
                break;
            case 'submitTeam':
                // Initialize submit team V2 (FPL-style)
                // Force reset if stuck loading
                if (window.mobileSubmitTeam.loading && !window.mobileSubmitTeam.initialized) {
                    console.log('Forcing reset of stuck loader...');
                    window.mobileSubmitTeam.loading = false;
                    window.mobileSubmitTeam.initialized = false;
                }
                
                if (!window.mobileSubmitTeam.initialized) {
                    // Initialize is no longer async - it renders immediately
                    window.mobileSubmitTeam.initialize();
                } else {
                    // Re-render if already initialized
                    window.mobileSubmitTeam.renderHeader();
                    window.mobileSubmitTeam.renderView();
                    window.mobileSubmitTeam.setupEventListeners();
                }
                break;
            case 'leaderboard':
                // Load leaderboard data
                await this.loadLeaderboard();
                break;
            case 'more':
                // More tab stays on current content, just shows menu
                break;
            case 'players':
                // Load players if needed
                if (window.mobileAuction && window.mobileAuction.players.length === 0) {
                    await window.mobileAuction.loadPlayers();
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
            
            // Show loader while loading
            this.showTeamLoader();
            
            const squad = await window.mobileAPI.getTeamSquad(this.currentUser.id);
            this.renderTeamSquad(squad);
        } catch (error) {
            console.error('Error loading team squad:', error);
            // Show error state
            const container = document.getElementById('teamSquad');
            if (container) {
                container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Failed to load team squad</div>';
            }
        }
    }
    
    showTeamLoader() {
        const container = document.getElementById('teamSquad');
        if (container) {
            container.innerHTML = `
                <div class="loader-container" style="display: flex; justify-content: center; align-items: center; height: 400px;">
                    <div class="loader" style="
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #00ff87;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                    "></div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
        }
    }
    
    async loadSelectedTeamSquad(teamId) {
        try {
            // Show loader while loading
            this.showTeamLoader();
            
            const selectedTeamId = teamId || this.currentUser.id;
            const squad = await window.mobileAPI.getTeamSquad(selectedTeamId);
            this.renderTeamSquad(squad);
        } catch (error) {
            console.error('Error loading selected team squad:', error);
            this.showToast('Failed to load team squad', 'error');
            // Show error state
            const container = document.getElementById('teamSquad');
            if (container) {
                container.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;">Failed to load team squad</div>';
            }
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
                    const photoCode = player.photo.replace('.jpg', '').replace('.png', '');
                    return `https://resources.premierleague.com/premierleague25/photos/players/110x140/${photoCode}.png`;
                } else if (player.code) {
                    return `https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.code}.png`;
                } else if (player.id) {
                    return `https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.id}.png`;
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
                await window.mobileAuction.loadActiveAuctions();
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

// Add modal and utility functions
MobileApp.prototype.showLeaderboard = async function() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) {
        modal.classList.remove('hidden');
        await this.loadLeaderboard();
    }
};

MobileApp.prototype.showPointsBreakdown = async function() {
    const modal = document.getElementById('pointsBreakdownModal');
    if (modal) {
        modal.classList.remove('hidden');
        await this.loadPointsBreakdown();
    }
};

MobileApp.prototype.showSubmissionHistory = async function() {
    try {
        // Show modal
        const modal = document.getElementById('submissionHistoryModal');
        modal.classList.remove('hidden');
        
        // Setup close button
        document.getElementById('closeSubmissionHistoryBtn').onclick = () => {
            modal.classList.add('hidden');
            // Reset to list view
            document.getElementById('historyListView').classList.remove('hidden');
            document.getElementById('historyDetailView').classList.add('hidden');
            document.getElementById('historyModalTitle').textContent = 'Submission History';
        };
        
        // Setup back button
        document.getElementById('backToHistoryList').onclick = () => {
            document.getElementById('historyListView').classList.remove('hidden');
            document.getElementById('historyDetailView').classList.add('hidden');
            document.getElementById('historyModalTitle').textContent = 'Submission History';
        };
        
        // Show loading
        const content = document.getElementById('submissionHistoryContent');
        content.innerHTML = '<div class="loading">Loading submission history...</div>';
        
        // Fetch submission history
        const history = await window.mobileAPI.getSubmissionHistory();
        
        if (!history || history.length === 0) {
            content.innerHTML = '<div class="no-data">No submission history found</div>';
            return;
        }
        
        // Group by gameweek
        const groupedHistory = {};
        history.forEach(submission => {
            const gw = submission.gameweek;
            if (!groupedHistory[gw]) {
                groupedHistory[gw] = [];
            }
            groupedHistory[gw].push(submission);
        });
        
        // Render history
        let html = '';
        Object.keys(groupedHistory).sort((a, b) => b - a).forEach(gw => {
            html += `
                <div class="history-gameweek" style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #1f2937; font-size: 16px;">Gameweek ${gw}</h4>
                    <div class="history-submissions">
            `;
            
            groupedHistory[gw].forEach(submission => {
                const submitTime = new Date(submission.submitted_at);
                const deadlineStatus = submission.deadline_status || 'on_time';
                const statusClass = deadlineStatus === 'late' ? 'late' : deadlineStatus === 'grace_period' ? 'grace' : 'on-time';
                const statusColor = deadlineStatus === 'late' ? '#ef4444' : deadlineStatus === 'grace_period' ? '#f59e0b' : '#10b981';
                
                // Store submission data in window for access
                const submissionId = `submission_${gw}_${submission.submission_version || Date.now()}`;
                if (!window.submissionHistoryData) {
                    window.submissionHistoryData = {};
                }
                window.submissionHistoryData[submissionId] = submission;
                
                html += `
                    <div class="submission-entry" style="padding: 10px; background: white; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid ${statusColor}; cursor: pointer; transition: all 0.2s;" 
                         onclick="mobileApp.showSubmissionDetail('${submissionId}')"
                         onmouseover="this.style.background='#f9fafb'" 
                         onmouseout="this.style.background='white'">
                        <div class="submission-time" style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">${submitTime.toLocaleString()}</div>
                        <div class="submission-details" style="display: flex; gap: 8px; align-items: center; justify-content: space-between;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span class="submission-status" style="font-size: 11px; padding: 2px 6px; background: ${statusColor}20; color: ${statusColor}; border-radius: 4px; font-weight: 600;">${deadlineStatus.replace('_', ' ').toUpperCase()}</span>
                                ${submission.chip_used ? `<span class="chip-used" style="font-size: 11px; padding: 2px 6px; background: #3b82f620; color: #3b82f6; border-radius: 4px;">${submission.chip_used}</span>` : ''}
                            </div>
                            <span style="color: #6b7280; font-size: 14px;">→</span>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });
        
        content.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading submission history:', error);
        this.showToast('Failed to load submission history', 'error');
    }
};

MobileApp.prototype.showSubmissionDetail = async function(submissionId) {
    try {
        const submission = window.submissionHistoryData[submissionId];
        if (!submission) {
            this.showToast('Submission not found', 'error');
            return;
        }
        
        // Hide list view, show detail view
        document.getElementById('historyListView').classList.add('hidden');
        document.getElementById('historyDetailView').classList.remove('hidden');
        document.getElementById('historyModalTitle').textContent = `Gameweek ${submission.gameweek} Submission`;
        
        const detailContent = document.getElementById('historyDetailContent');
        detailContent.innerHTML = '<div class="loading">Loading team details...</div>';
        
        // Fetch player and club details
        const playerIds = [...(submission.starting_11 || []), ...(submission.bench || [])];
        const players = [];
        
        // Instead of fetching ALL players, fetch only the ones we need
        // This is much faster for displaying team submissions
        const playerPromises = playerIds.map(async (playerId) => {
            try {
                // Check if we have this player cached
                if (window.playerCache && window.playerCache[playerId]) {
                    return window.playerCache[playerId];
                }
                
                // Fetch individual player (much smaller response)
                const response = await fetch(`${window.API_BASE_URL}/api/players/${playerId}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                
                if (response.ok) {
                    const player = await response.json();
                    // Cache for future use
                    if (!window.playerCache) window.playerCache = {};
                    window.playerCache[playerId] = player;
                    return player;
                }
            } catch (error) {
                console.error(`Failed to fetch player ${playerId}:`, error);
            }
            return null;
        });
        
        // Fetch players in parallel (much faster)
        const fetchedPlayers = await Promise.all(playerPromises);
        fetchedPlayers.forEach(player => {
            if (player) players.push(player);
        });
        
        // Only fetch clubs if needed (small dataset, ok to cache)
        if (!window.cachedClubs) {
            window.cachedClubs = await window.mobileAPI.getClubs();
        }
        const allClubs = window.cachedClubs;
        
        // Find club details
        let clubMultiplier = null;
        if (submission.club_multiplier_id) {
            clubMultiplier = allClubs.find(c => c.id === submission.club_multiplier_id);
        }
        
        // Separate starting 11 and bench
        const starting11 = [];
        const bench = [];
        
        submission.starting_11.forEach(id => {
            const player = players.find(p => p.id === id);
            if (player) starting11.push(player);
        });
        
        submission.bench.forEach(id => {
            const player = players.find(p => p.id === id);
            if (player) bench.push(player);
        });
        
        // Group starting 11 by position
        const positions = { 1: [], 2: [], 3: [], 4: [] };
        starting11.forEach(player => {
            if (positions[player.position]) {
                positions[player.position].push(player);
            }
        });
        
        // Render the team in pitch view style
        let html = `
            <div style="background: white; border-radius: 12px; padding: 8px;">
                <!-- Submission Info -->
                <div style="background: #f9fafb; padding: 8px; border-radius: 6px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: #1f2937; font-size: 12px;">Submitted:</span>
                        <span style="color: #6b7280; font-size: 11px;">${new Date(submission.submitted_at).toLocaleString()}</span>
                    </div>
                    ${submission.chip_used ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;">
                            <span style="font-weight: 600; color: #1f2937; font-size: 12px;">Chip Used:</span>
                            <span style="background: #3b82f620; color: #3b82f6; padding: 2px 5px; border-radius: 3px; font-size: 11px; font-weight: 600;">${submission.chip_used}</span>
                        </div>
                    ` : ''}
                    ${clubMultiplier ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <span style="font-weight: 600; color: #1f2937; font-size: 12px;">Club Multiplier:</span>
                            <span style="background: #10b98120; color: #059669; padding: 2px 5px; border-radius: 3px; font-size: 11px; font-weight: 600;">${clubMultiplier.name} (1.5x)</span>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Pitch View -->
                <div style="background: linear-gradient(to bottom, #10b981 0%, #059669 50%, #047857 100%); border-radius: 10px; padding: 12px 3px; position: relative; min-height: 340px;">
        `;
        
        // Render each position row
        const positionNames = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
        [4, 3, 2, 1].forEach(posId => {
            const posPlayers = positions[posId] || [];
            if (posPlayers.length > 0) {
                html += `<div style="display: flex; justify-content: center; gap: 3px; margin-bottom: 15px; flex-wrap: wrap;">`;
                posPlayers.forEach(player => {
                    const isCaptain = player.id === submission.captain_id;
                    const isViceCaptain = player.id === submission.vice_captain_id;
                    
                    // Calculate points with multipliers
                    let displayPoints = 0;
                    if (playerPoints && playerPoints[player.id]) {
                        const liveStats = playerPoints[player.id].stats;
                        let basePoints = liveStats.total_points || 0;
                        displayPoints = basePoints;
                        
                        // Apply captain/vice-captain multiplier
                        if (isCaptain) {
                            const captainMultiplier = submission.chip_used === 'triple_captain' ? 3 : 2;
                            displayPoints = basePoints * captainMultiplier;
                        } else if (isViceCaptain && submission.captain_played === false) {
                            displayPoints = basePoints * 2;
                        }
                        
                        // Apply chip multipliers
                        if (submission.chip_used === 'attack_chip' && (player.position === 3 || player.position === 4)) {
                            displayPoints = displayPoints * 2;
                        } else if (submission.chip_used === 'park_the_bus' && (player.position === 1 || player.position === 2)) {
                            displayPoints = displayPoints * 2;
                        } else if (submission.chip_used === 'double_up') {
                            displayPoints = displayPoints * 2;
                        } else if (submission.chip_used === 'negative_chip') {
                            displayPoints = Math.floor(displayPoints / 2);
                        }
                        
                        // Apply club multiplier
                        if (clubMultiplier && player.team === clubMultiplier.id) {
                            displayPoints = Math.floor(displayPoints * 1.5);
                        }
                    }
                    
                    html += `
                        <div style="width: 52px; text-align: center; flex: 0 0 auto;">
                            <div style="width: 44px; height: 44px; margin: 0 auto 2px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 6px 6px 16px 16px; position: relative; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.2);">
                                <img src="https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.photo?.replace('.jpg', '').replace('.png', '') || '0'}.png" 
                                     style="width: 32px; height: 32px; object-fit: cover; border-radius: 50%; background: white;"
                                     onerror="this.style.display='none'">
                                ${isCaptain ? '<div style="position: absolute; top: -5px; right: -5px; background: white; color: #1f2937; width: 17px; height: 17px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.3); border: 1.5px solid #fbbf24;">C</div>' : ''}
                                ${isViceCaptain ? '<div style="position: absolute; top: -5px; right: -5px; background: white; color: #1f2937; width: 17px; height: 17px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.3); border: 1.5px solid #a78bfa;">V</div>' : ''}
                            </div>
                            <div style="background: white; border-radius: 3px; padding: 1px 2px; margin-top: 2px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                                <div style="font-size: 9px; font-weight: 700; color: #1f2937; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${player.web_name || player.name}</div>
                                <div style="font-size: ${displayPoints > 0 ? '10px' : '8px'}; color: ${displayPoints > 0 ? '#059669' : '#374151'}; font-weight: ${displayPoints > 0 ? '700' : '600'}; margin-top: 1px;">${displayPoints > 0 ? displayPoints + 'pts' : positionNames[player.position]}</div>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
            }
        });
        
        html += `
                </div>
                
                <!-- Bench -->
                <div style="background: #f3f4f6; padding: 10px 8px; border-radius: 6px; margin-top: 12px;">
                    <div style="font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">BENCH</div>
                    <div style="display: flex; gap: 8px; overflow-x: auto; justify-content: center;">
        `;
        
        bench.forEach((player, index) => {
            // Calculate bench player points (only with bench boost chip)
            let benchPoints = 0;
            if (submission.chip_used === 'bench_boost' && playerPoints && playerPoints[player.id]) {
                const liveStats = playerPoints[player.id].stats;
                benchPoints = liveStats.total_points || 0;
                
                // Apply club multiplier if applicable
                if (clubMultiplier && player.team === clubMultiplier.id) {
                    benchPoints = Math.floor(benchPoints * 1.5);
                }
            }
            
            html += `
                <div style="flex: 0 0 auto; width: 65px; background: white; border-radius: 6px; padding: 6px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                    <div style="width: 35px; height: 35px; margin: 0 auto 3px; background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); border-radius: 8px 8px 12px 12px; display: flex; align-items: center; justify-content: center;">
                        <img src="https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.photo?.replace('.jpg', '').replace('.png', '') || '0'}.png" 
                             style="width: 26px; height: 26px; object-fit: cover; border-radius: 50%; background: white;"
                             onerror="this.style.display='none'">
                    </div>
                    <div style="font-size: 9px; font-weight: 600; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${player.web_name || player.name}</div>
                    <div style="font-size: 8px; color: ${benchPoints > 0 ? '#059669' : '#6b7280'}; font-weight: ${benchPoints > 0 ? '700' : '400'};">${benchPoints > 0 ? benchPoints + 'pts' : positionNames[player.position]}</div>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
            </div>
        `;
        
        detailContent.innerHTML = html;
        
    } catch (error) {
        console.error('Error showing submission detail:', error);
        this.showToast('Failed to load submission details', 'error');
    }
};

MobileApp.prototype.showAllClubs = async function() {
    const modal = document.getElementById('allClubsModal');
    if (modal) {
        modal.classList.remove('hidden');
        await this.loadAllClubs();
    }
};

MobileApp.prototype.loadLeaderboard = async function(gameweek = 'overall') {
    try {
        // Show loader
        const content = document.getElementById('leaderboardContent');
        if (content) {
            content.innerHTML = `
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 200px;">
                    <div style="border: 3px solid #f3f3f3; border-top: 3px solid #10B981; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
                    <p style="margin-top: 16px; color: #666; font-size: 14px;">Loading league standings...</p>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
        }
        
        // Populate gameweek selector if not already done
        const gwSelector = document.getElementById('leaderboardGameweek');
        if (gwSelector && gwSelector.options.length <= 1) {
            try {
                const gameweeks = await window.mobileAPI.getAllGameweeks();
                gameweeks.forEach(gw => {
                    if (gw.finished) {
                        const option = document.createElement('option');
                        option.value = gw.gameweek;
                        option.textContent = `Gameweek ${gw.gameweek}`;
                        gwSelector.appendChild(option);
                    }
                });
            } catch (error) {
                console.log('Could not load gameweeks');
            }
        }
        
        const data = await window.mobileAPI.getLeaderboard(gameweek);
        const currentUser = window.mobileAPI.getCurrentUser();
        
        if (content) {
            content.innerHTML = data.map((team, index) => `
                <div class="leaderboard-item ${team.team_id === currentUser.id ? 'current-team' : ''}" 
                     onclick="event.stopPropagation(); window.mobileApp.viewTeamSubmission(${team.team_id}, ${gameweek === 'overall' ? 1 : gameweek})"
                     style="cursor: pointer; transition: all 0.2s ease;"
                     ontouchstart="this.style.transform='scale(0.98)'; this.style.opacity='0.8';"
                     ontouchend="this.style.transform='scale(1)'; this.style.opacity='1';"
                     ontouchcancel="this.style.transform='scale(1)'; this.style.opacity='1';">
                    <div class="rank">
                        <span class="rank-number">${team.rank}</span>
                        ${team.movement > 0 ? '<span class="movement up">↑' + team.movement + '</span>' : ''}
                        ${team.movement < 0 ? '<span class="movement down">↓' + Math.abs(team.movement) + '</span>' : ''}
                    </div>
                    <div class="team-info">
                        <div class="team-name">${team.team_name}</div>
                        <div class="team-stats">
                            ${gameweek === 'overall' ? 
                                `<span>GW: ${team.latest_gameweek_points || 0} pts</span> • <span>Total: ${team.total_points} pts</span>` :
                                `<span>${team.gameweek_points} pts</span>${team.chip_used ? ' • <span class="chip">' + team.chip_used + '</span>' : ''}`
                            }
                        </div>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        this.showToast('Failed to load leaderboard', 'error');
    }
};

MobileApp.prototype.viewTeamSubmission = async function(teamId, gameweek = null) {
    // Show modal immediately with loader for better UX
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>Loading Team...</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 300px;">
                    <div style="border: 3px solid #f3f3f3; border-top: 3px solid #10B981; border-radius: 50%; width: 40px; height: 40px; animation: spin3 1s linear infinite;"></div>
                    <p style="margin-top: 16px; color: #666; font-size: 14px;">Loading team details...</p>
                </div>
                <style>
                    @keyframes spin3 {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    try {
        // Use provided gameweek or get current
        let targetGameweek = gameweek;
        if (!targetGameweek) {
            const gwInfo = await window.mobileAPI.getCurrentGameweek();
            targetGameweek = gwInfo.gameweek || 1;
        }
        
        // Get team submission for the target gameweek
        const submission = await window.mobileAPI.getTeamSubmission(targetGameweek, teamId);
        
        if (!submission) {
            // No submission yet, remove modal and show squad instead
            modal.remove();
            await this.showTeamSquad(teamId);
            return;
        }
        
        // Cache teams data if not already cached
        if (!window.cachedTeams) {
            window.cachedTeams = await window.mobileAPI.getAllTeams();
        }
        const team = window.cachedTeams.find(t => t.id === teamId);
        
        // Remove the loading modal
        modal.remove();
        
        // Show submission in nice pitch view
        await this.showTeamSubmissionDetail(submission, team ? team.name : `Team ${teamId}`);
        
    } catch (error) {
        console.error('Error viewing team submission:', error);
        // Remove modal and fall back to showing squad
        modal.remove();
        await this.showTeamSquad(teamId);
    }
};

MobileApp.prototype.showTeamSubmissionDetail = async function(submission, teamName, gameweek = null) {
    try {
        // Create modal container (no loader needed as it's already shown)
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>Gameweek ${submission.gameweek} Submission</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body" id="submissionDetailBody">
                    <!-- Content will be added immediately -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Fetch live points data if available
        let playerPoints = {};
        try {
            // Fetch live points from backend (which proxies FPL API to avoid CORS)
            const pointsResponse = await fetch(`${window.API_BASE_URL}/api/submissions/gameweek/${submission.gameweek || gameweek || 1}/live`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('fpl_token')}`
                }
            });
            if (pointsResponse.ok) {
                const liveData = await pointsResponse.json();
                if (liveData.elements) {
                    playerPoints = liveData.elements;
                    console.log('Fetched live points for gameweek', submission.gameweek || gameweek || 1, ':', playerPoints);
                }
            }
        } catch (error) {
            console.log('Could not fetch live points:', error);
        }
        
        // Use the optimized endpoint data if available
        let players = [];
        let clubMultiplier = null;
        
        if (submission.player_details && submission.club_details) {
            // We already have player and club details from the optimized endpoint
            const playerIds = [...(submission.starting_11 || []), ...(submission.bench || [])];
            players = playerIds.map(id => submission.player_details[id]).filter(p => p);
            
            // Get club multiplier details
            if (submission.club_multiplier_id) {
                clubMultiplier = submission.club_multiplier_details || 
                                submission.club_details[submission.club_multiplier_id];
            }
        } else {
            // Fallback to old method (should not happen with new endpoint)
            const playerIds = [...(submission.starting_11 || []), ...(submission.bench || [])];
            
            // Fetch players in parallel 
            const playerPromises = playerIds.map(async (playerId) => {
                try {
                    // Check if we have this player cached
                    if (window.playerCache && window.playerCache[playerId]) {
                        return window.playerCache[playerId];
                    }
                    
                    // Fetch individual player
                    const response = await fetch(`${window.API_BASE_URL}/api/players/${playerId}`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                    });
                    
                    if (response.ok) {
                        const player = await response.json();
                        // Cache for future use
                        if (!window.playerCache) window.playerCache = {};
                        window.playerCache[playerId] = player;
                        return player;
                    }
                } catch (error) {
                    console.error(`Failed to fetch player ${playerId}:`, error);
                }
                return null;
            });
            
            const fetchedPlayers = await Promise.all(playerPromises);
            players = fetchedPlayers.filter(p => p);
            
            // Get club details
            if (submission.club_multiplier_id && !clubMultiplier) {
                if (!window.cachedClubs) {
                    window.cachedClubs = await window.mobileAPI.getClubs();
                }
                clubMultiplier = window.cachedClubs.find(c => c.id === submission.club_multiplier_id);
            }
        }
        
        // Separate starting 11 and bench
        const starting11 = [];
        const bench = [];
        
        submission.starting_11.forEach(id => {
            const player = players.find(p => p.id === id);
            if (player) starting11.push(player);
        });
        
        submission.bench.forEach(id => {
            const player = players.find(p => p.id === id);
            if (player) bench.push(player);
        });
        
        // Group starting 11 by position
        const positions = { 1: [], 2: [], 3: [], 4: [] };
        starting11.forEach(player => {
            if (positions[player.position]) {
                positions[player.position].push(player);
            }
        });
        
        // Render the team in pitch view style
        const detailContent = document.getElementById('submissionDetailBody');
        
        // Format submission date safely
        let submittedDate = 'Not available';
        if (submission.submitted_at) {
            try {
                submittedDate = new Date(submission.submitted_at).toLocaleString();
            } catch (e) {
                submittedDate = 'Recently';
            }
        } else if (submission.createdAt) {
            try {
                submittedDate = new Date(submission.createdAt).toLocaleString();
            } catch (e) {
                submittedDate = 'Recently';
            }
        }
        
        let html = `
            <div style="background: white; border-radius: 12px; padding: 8px;">
                <!-- Back button and Team Name -->
                <div style="margin-bottom: 10px;">
                    <h4 style="text-align: center; color: #1f2937; margin: 8px 0;">${teamName}</h4>
                </div>
                
                <!-- Submission Info -->
                <div style="background: #f9fafb; padding: 8px; border-radius: 6px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: #1f2937; font-size: 12px;">Gameweek ${submission.gameweek || ''}:</span>
                        <span style="color: #6b7280; font-size: 11px;">${submittedDate}</span>
                    </div>
                    ${submission.chip_used ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;">
                            <span style="font-weight: 600; color: #1f2937; font-size: 12px;">Chip Used:</span>
                            <span style="background: #3b82f620; color: #3b82f6; padding: 2px 5px; border-radius: 3px; font-size: 11px; font-weight: 600;">${submission.chip_used}</span>
                        </div>
                    ` : ''}
                    ${clubMultiplier ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <span style="font-weight: 600; color: #1f2937; font-size: 12px;">Club Multiplier:</span>
                            <span style="background: #10b98120; color: #059669; padding: 2px 5px; border-radius: 3px; font-size: 11px; font-weight: 600;">${clubMultiplier.name} (1.5x)</span>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Pitch View -->
                <div style="background: linear-gradient(to bottom, #10b981 0%, #059669 50%, #047857 100%); border-radius: 10px; padding: 12px 3px; position: relative; min-height: 340px;">
        `;
        
        // Render each position row
        const positionNames = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
        [4, 3, 2, 1].forEach(posId => {
            const posPlayers = positions[posId] || [];
            if (posPlayers.length > 0) {
                html += `<div style="display: flex; justify-content: center; gap: 3px; margin-bottom: 15px; flex-wrap: wrap;">`;
                posPlayers.forEach(player => {
                    const isCaptain = player.id === submission.captain_id;
                    const isViceCaptain = player.id === submission.vice_captain_id;
                    
                    // Calculate points with multipliers
                    let displayPoints = 0;
                    if (playerPoints && playerPoints[player.id]) {
                        const liveStats = playerPoints[player.id].stats;
                        let basePoints = liveStats.total_points || 0;
                        displayPoints = basePoints;
                        
                        // Apply captain/vice-captain multiplier
                        if (isCaptain) {
                            const captainMultiplier = submission.chip_used === 'triple_captain' ? 3 : 2;
                            displayPoints = basePoints * captainMultiplier;
                        } else if (isViceCaptain && submission.captain_played === false) {
                            displayPoints = basePoints * 2;
                        }
                        
                        // Apply chip multipliers
                        if (submission.chip_used === 'attack_chip' && (player.position === 3 || player.position === 4)) {
                            displayPoints = displayPoints * 2;
                        } else if (submission.chip_used === 'park_the_bus' && (player.position === 1 || player.position === 2)) {
                            displayPoints = displayPoints * 2;
                        } else if (submission.chip_used === 'double_up') {
                            displayPoints = displayPoints * 2;
                        } else if (submission.chip_used === 'negative_chip') {
                            displayPoints = Math.floor(displayPoints / 2);
                        }
                        
                        // Apply club multiplier
                        if (clubMultiplier && player.team === clubMultiplier.id) {
                            displayPoints = Math.floor(displayPoints * 1.5);
                        }
                    }
                    
                    html += `
                        <div style="width: 52px; text-align: center; flex: 0 0 auto;">
                            <div style="width: 44px; height: 44px; margin: 0 auto 2px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 6px 6px 16px 16px; position: relative; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.2);">
                                <img src="https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.photo?.replace('.jpg', '').replace('.png', '') || '0'}.png" 
                                     style="width: 32px; height: 32px; object-fit: cover; border-radius: 50%; background: white;"
                                     onerror="this.style.display='none'">
                                ${isCaptain ? '<div style="position: absolute; top: -5px; right: -5px; background: white; color: #1f2937; width: 17px; height: 17px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.3); border: 1.5px solid #fbbf24;">C</div>' : ''}
                                ${isViceCaptain ? '<div style="position: absolute; top: -5px; right: -5px; background: white; color: #1f2937; width: 17px; height: 17px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.3); border: 1.5px solid #a78bfa;">V</div>' : ''}
                            </div>
                            <div style="background: white; border-radius: 3px; padding: 1px 2px; margin-top: 2px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                                <div style="font-size: 9px; font-weight: 700; color: #1f2937; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${player.web_name || player.name}</div>
                                <div style="font-size: ${displayPoints > 0 ? '10px' : '8px'}; color: ${displayPoints > 0 ? '#059669' : '#374151'}; font-weight: ${displayPoints > 0 ? '700' : '600'}; margin-top: 1px;">${displayPoints > 0 ? displayPoints + 'pts' : positionNames[player.position]}</div>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
            }
        });
        
        html += `
                </div>
                
                <!-- Bench -->
                <div style="background: #f3f4f6; padding: 10px 8px; border-radius: 6px; margin-top: 12px;">
                    <div style="font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">BENCH</div>
                    <div style="display: flex; gap: 8px; overflow-x: auto; justify-content: center;">
        `;
        
        bench.forEach((player, index) => {
            // Calculate bench player points (only with bench boost chip)
            let benchPoints = 0;
            if (submission.chip_used === 'bench_boost' && playerPoints && playerPoints[player.id]) {
                const liveStats = playerPoints[player.id].stats;
                benchPoints = liveStats.total_points || 0;
                
                // Apply club multiplier if applicable
                if (clubMultiplier && player.team === clubMultiplier.id) {
                    benchPoints = Math.floor(benchPoints * 1.5);
                }
            }
            
            html += `
                <div style="flex: 0 0 auto; width: 65px; background: white; border-radius: 6px; padding: 6px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                    <div style="width: 35px; height: 35px; margin: 0 auto 3px; background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); border-radius: 8px 8px 12px 12px; display: flex; align-items: center; justify-content: center;">
                        <img src="https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.photo?.replace('.jpg', '').replace('.png', '') || '0'}.png" 
                             style="width: 26px; height: 26px; object-fit: cover; border-radius: 50%; background: white;"
                             onerror="this.style.display='none'">
                    </div>
                    <div style="font-size: 9px; font-weight: 600; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${player.web_name || player.name}</div>
                    <div style="font-size: 8px; color: ${benchPoints > 0 ? '#059669' : '#6b7280'}; font-weight: ${benchPoints > 0 ? '700' : '400'};">${benchPoints > 0 ? benchPoints + 'pts' : positionNames[player.position]}</div>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
            </div>
        `;
        
        detailContent.innerHTML = html;
        
    } catch (error) {
        console.error('Error showing team submission detail:', error);
        this.showToast('Failed to load submission details', 'error');
        // Close the modal
        const modal = document.querySelector('.modal');
        if (modal) modal.remove();
    }
};

MobileApp.prototype.getPositionName = function(position) {
    const positions = {
        1: 'GKP',
        2: 'DEF', 
        3: 'MID',
        4: 'FWD'
    };
    return positions[position] || 'Unknown';
};

MobileApp.prototype.showTeamSquad = async function(teamId) {
    try {
        const squadData = await window.mobileAPI.getTeamSquad(teamId);
        const teams = await window.mobileAPI.getAllTeams();
        const team = teams.find(t => t.id === teamId);
        
        // If no squad data or error, show appropriate message
        if (!squadData) {
            this.showToast('No squad data available', 'error');
            return;
        }
        
        // Create modal to show team squad
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <style>
                .squad-summary {
                    background: #f5f5f5;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 16px;
                }
                .squad-summary p {
                    margin: 4px 0;
                }
                .squad-section {
                    margin-top: 20px;
                }
                .squad-section h4 {
                    margin-bottom: 12px;
                    color: #333;
                }
                .squad-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .squad-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: white;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                }
                .player-info {
                    display: flex;
                    flex-direction: column;
                }
                .player-name, .club-name {
                    font-weight: 600;
                    color: #333;
                }
                .player-details {
                    font-size: 12px;
                    color: #666;
                    margin-top: 2px;
                }
                .player-price, .club-price {
                    font-weight: 600;
                    color: #10B981;
                }
            </style>
            <div class="modal-content" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>${team ? team.name : `Team ${teamId}`}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="squad-summary">
                        <p><strong>Players:</strong> ${squadData.players ? squadData.players.length : 0}/15</p>
                        <p><strong>Clubs:</strong> ${squadData.clubs ? squadData.clubs.length : 0}/2</p>
                        <p><strong>Budget Remaining:</strong> ${formatCurrency(squadData.budget_remaining || 0)}</p>
                    </div>
                    
                    ${squadData.players && squadData.players.length > 0 ? `
                        <div class="squad-section">
                            <h4>Players</h4>
                            <div class="squad-list">
                                ${squadData.players.map(player => `
                                    <div class="squad-item">
                                        <div class="player-info">
                                            <span class="player-name">${player.web_name || player.name}</span>
                                            <span class="player-details">${this.getPositionName(player.position)} - ${player.team_name || ''}</span>
                                        </div>
                                        <span class="player-price">${formatCurrency(player.price_paid || 0)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : '<p>No players in squad</p>'}
                    
                    ${squadData.clubs && squadData.clubs.length > 0 ? `
                        <div class="squad-section">
                            <h4>Clubs</h4>
                            <div class="squad-list">
                                ${squadData.clubs.map(club => `
                                    <div class="squad-item">
                                        <span class="club-name">${club.name || club.club_name}</span>
                                        <span class="club-price">${formatCurrency(club.price_paid || 0)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error loading team squad:', error);
        this.showToast('Failed to load team squad', 'error');
    }
};

MobileApp.prototype.loadPointsBreakdown = async function(teamId = null, gameweek = null) {
    try {
        const currentUser = window.mobileAPI.getCurrentUser();
        teamId = teamId || currentUser.id;
        
        if (!gameweek) {
            const gwData = await window.mobileAPI.getCurrentGameweek();
            gameweek = gwData.gameweek;
        }
        
        const data = await window.mobileAPI.getPointsBreakdown(teamId, gameweek);
        const content = document.getElementById('pointsBreakdownContent');
        
        if (content) {
            content.innerHTML = `
                <div class="points-summary">
                    <div class="summary-item">
                        <span>Base Points:</span>
                        <span>${data.summary.base_total}</span>
                    </div>
                    <div class="summary-item">
                        <span>Bonus Points:</span>
                        <span>+${data.summary.bonus_total}</span>
                    </div>
                    ${data.summary.chip_used ? `
                        <div class="summary-item chip">
                            <span>Chip Used:</span>
                            <span>${data.summary.chip_used}</span>
                        </div>
                    ` : ''}
                    <div class="summary-item total">
                        <span>Total Points:</span>
                        <span>${data.summary.final_total}</span>
                    </div>
                </div>
                <div class="players-breakdown">
                    ${data.players.map(player => `
                        <div class="player-points">
                            <div class="player-info">
                                <span class="player-name">${player.player_name}</span>
                                <span class="player-position">${player.position}</span>
                            </div>
                            <div class="points-info">
                                <span class="base-points">${player.base_points}</span>
                                ${player.multiplier > 1 ? `<span class="multiplier">×${player.multiplier}</span>` : ''}
                                <span class="final-points">${player.final_points}</span>
                            </div>
                            ${player.bonuses.length > 0 ? `
                                <div class="bonuses">${player.bonuses.join(', ')}</div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading points breakdown:', error);
        this.showToast('Failed to load points breakdown', 'error');
    }
};

MobileApp.prototype.loadAllClubs = async function() {
    try {
        const clubs = await window.mobileAPI.getClubs();
        const soldItems = await window.mobileAPI.getSoldItems();
        const soldClubIds = new Set(soldItems.filter(item => item.club_id).map(item => item.club_id));
        
        const content = document.getElementById('allClubsList');
        if (content) {
            content.innerHTML = clubs.map(club => {
                const isSold = soldClubIds.has(club.id);
                const soldItem = soldItems.find(item => item.club_id === club.id);
                
                return `
                    <div class="club-card ${isSold ? 'sold' : ''}">
                        <div class="club-icon">🏟️</div>
                        <div class="club-details">
                            <h4 class="club-name">${club.name}</h4>
                            <p class="club-short">${club.short_name || ''}</p>
                            ${isSold && soldItem ? `
                                <p class="sold-info">
                                    Sold to ${soldItem.team_name} for <span class="currency-j">J</span>${soldItem.price_paid}m
                                </p>
                            ` : ''}
                        </div>
                        ${!isSold && window.mobileAuction && window.mobileAuction.canStartAuction ? `
                            <button class="start-club-auction" onclick="mobileAuction.startClubAuction(${club.id})">
                                Start
                            </button>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading clubs:', error);
        this.showToast('Failed to load clubs', 'error');
    }
};

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
    
    // Setup leaderboard gameweek selector
    document.getElementById('leaderboardGameweek')?.addEventListener('change', (e) => {
        window.mobileApp.loadLeaderboard(e.target.value);
    });
    
    // Setup modal close buttons
    document.getElementById('closeLeaderboardBtn')?.addEventListener('click', () => {
        document.getElementById('leaderboardModal')?.classList.add('hidden');
    });
    
    document.getElementById('closePointsBreakdownBtn')?.addEventListener('click', () => {
        document.getElementById('pointsBreakdownModal')?.classList.add('hidden');
    });
    
    document.getElementById('closeAllClubsBtn')?.addEventListener('click', () => {
        document.getElementById('allClubsModal')?.classList.add('hidden');
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