// Main application logic
class App {
    constructor() {
        this.currentUser = null;
        this.currentTab = 'auction'; // Changed default tab to auction
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

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }

    checkAuthStatus() {
        const token = localStorage.getItem('fpl_token');
        const team = localStorage.getItem('fpl_team');
        
        if (token && team) {
            try {
                this.currentUser = JSON.parse(team);
                this.showMainApp();
                window.socketManager.connect();
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
                console.log('Logged in user:', this.currentUser); // Debug log
                this.showMainApp();
                window.socketManager.connect();
                showNotification(`Welcome, ${response.team.name}!`, 'success');
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification(error.message, 'error');
        } finally {
            btn.textContent = 'Login';
            btn.disabled = false;
        }
    }

    logout() {
        api.clearToken();
        this.currentUser = null;
        window.socketManager.disconnect();
        this.showLogin();
        showNotification('Logged out successfully', 'success');
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
        
        // Show admin tab if user is admin
        const adminTab = document.querySelector('[data-tab="admin"]');
        if (adminTab) {
            adminTab.style.display = this.currentUser?.is_admin ? 'block' : 'none';
        }
        
        this.updateNavbar();
        this.switchTab(this.currentTab);
    }

    updateNavbar() {
        if (this.currentUser) {
            document.getElementById('teamName').textContent = this.currentUser.name;
            document.getElementById('teamBudget').textContent = `£${this.currentUser.budget}`;
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
                    <div class="player-price">£${player.price_paid || 0}m</div>
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
                                    <div class="text-sm text-emerald-600">£${club.price_paid || 0}m</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                
                <!-- Budget Summary -->
                <div class="mt-4 bg-gray-100 rounded-lg p-3">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium">Total Spent:</span>
                        <span class="text-sm font-bold">£${totalSpent}m</span>
                    </div>
                    <div class="flex justify-between items-center mt-1">
                        <span class="text-sm font-medium">Remaining Budget:</span>
                        <span class="text-sm font-bold ${remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}">£${remainingBudget}m</span>
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
                                <td class="px-4 py-3 text-right">£${team.total_spent}</td>
                                <td class="px-4 py-3 text-right">£${team.budget}</td>
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
        
        container.innerHTML = auctions.slice(-10).map(auction => `
            <div class="flex items-center justify-between p-3 bg-white rounded border">
                <div class="flex-1">
                    <div class="font-semibold">${auction.player_name || auction.club_name || 'Unknown'}</div>
                    <div class="text-sm text-gray-600">
                        Sold to ${auction.winning_team_name || 'Unknown'} for £${auction.final_price || 0}m
                    </div>
                    <div class="text-xs text-gray-500">
                        ${new Date(auction.completed_at).toLocaleString()}
                    </div>
                </div>
                <button onclick="window.app.restartAuction('${auction.id}')" 
                        class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                    Restart
                </button>
            </div>
        `).join('');
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
                            <div class="text-sm text-gray-600">£${bid.amount || 0}m</div>
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
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});