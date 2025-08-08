// Auction management
class AuctionManager {
    constructor() {
        this.currentAuction = null;
        this.players = [];
        this.clubs = [];
        this.positions = [];
        this.draftState = null;
        this.chatMessages = [];
        this.soldPlayers = new Set(); // Track sold players
        this.soldClubs = new Set(); // Track sold clubs
        this.currentFilters = null; // Track filter state
        this.init();
    }

    init() {
        this.bindEvents();
        // Only load data if user is authenticated
        if (this.isAuthenticated()) {
            this.loadInitialData();
            this.initializeChat();
            this.loadDraftState();
        }
    }

    isAuthenticated() {
        // Check if we have a token (don't wait for app.currentUser on initial load)
        const token = localStorage.getItem('fpl_token');
        const team = localStorage.getItem('fpl_team');
        return !!(token && team);
    }

    updateAdminControls() {
        // Update sync button visibility based on admin status
        const syncBtn = document.getElementById('syncDataBtn');
        if (syncBtn) {
            const isAdmin = window.app?.currentUser?.is_admin || false;
            syncBtn.style.display = isAdmin ? 'block' : 'none';
        }
    }

    // Called after successful login to load data
    onUserLogin() {
        if (this.isAuthenticated()) {
            this.loadInitialData();
            this.initializeChat();
            this.loadDraftState();
        }
    }

    bindEvents() {
        // Sync data button - only show for admins
        const syncBtn = document.getElementById('syncDataBtn');
        if (syncBtn) {
            // Hide sync button if not admin
            const isAdmin = window.app?.currentUser?.is_admin || false;
            if (!isAdmin) {
                syncBtn.style.display = 'none';
            } else {
                syncBtn.addEventListener('click', () => {
                    this.syncFPLData();
                });
            }
        }

        // Filter events
        document.getElementById('positionFilter').addEventListener('change', () => {
            this.saveFilterState();
            this.filterPlayers();
        });

        document.getElementById('teamFilter').addEventListener('change', () => {
            this.saveFilterState();
            this.filterPlayers();
        });

        document.getElementById('searchPlayers').addEventListener('input', () => {
            this.saveFilterState();
            this.filterPlayers();
        });

        // Page visibility API - refresh auction when tab becomes active
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('Tab became active, refreshing auction data...');
                this.refreshAuctionOnTabFocus();
            }
        });

        // Also handle window focus for better cross-browser support
        window.addEventListener('focus', () => {
            console.log('Window focused, refreshing auction data...');
            this.refreshAuctionOnTabFocus();
        });
    }

    async loadInitialData() {
        try {
            await this.loadSoldItems();
            await this.loadPlayers();
            await this.loadClubs();
            await this.loadActiveAuctions();
            await this.populateTeamFilter();
        } catch (error) {
            console.error('Error loading initial data:', error);
            showNotification('Failed to load auction data', 'error');
        }
    }

    async syncFPLData() {
        try {
            const btn = document.getElementById('syncDataBtn');
            btn.textContent = 'Syncing...';
            btn.disabled = true;

            const response = await api.syncFPLData();
            showNotification(response.message, 'success');
            
            await this.loadPlayers();
            await this.loadClubs();
            await this.populateTeamFilter();
            
        } catch (error) {
            console.error('Error syncing FPL data:', error);
            showNotification('Failed to sync FPL data', 'error');
        } finally {
            const btn = document.getElementById('syncDataBtn');
            btn.textContent = 'Sync FPL Data';
            btn.disabled = false;
        }
    }

    async loadSoldItems() {
        try {
            // Load all sold players and clubs from team squads
            const response = await fetch(`${api.baseURL}/teams/all-squads`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('fpl_token')}`
                }
            });
            if (response.ok) {
                const squads = await response.json();
                this.soldPlayers.clear();
                this.soldClubs.clear();
                
                // Sort by created_at to get recent sales
                const recentSales = squads
                    .filter(item => item.created_at)
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, 10);
                
                this.renderRecentSales(recentSales);
                
                squads.forEach(item => {
                    if (item.player_id) {
                        this.soldPlayers.add(item.player_id);
                    }
                    if (item.club_id) {
                        this.soldClubs.add(item.club_id);
                    }
                });
            }
        } catch (error) {
            console.error('Error loading sold items:', error);
        }
    }

    renderRecentSales(sales) {
        const container = document.getElementById('recentSales');
        if (!container) return;
        
        if (sales.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-8">No recent sales</div>';
            return;
        }
        
        container.innerHTML = sales.map(sale => {
            const time = new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const date = new Date(sale.created_at).toLocaleDateString();
            
            return `
                <div class="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="font-semibold text-gray-900">
                                ${sale.player_name || sale.club_name || 'Unknown'}
                            </div>
                            <div class="text-sm text-gray-600">
                                ${sale.team_name || 'Unknown Team'}
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                                ${date} ${time}
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="font-bold text-emerald-600">
                                ${formatCurrency(sale.price_paid || 0)}
                            </div>
                            ${sale.player_id ? `<div class="text-xs text-gray-500">${sale.position || ''}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async loadPlayers() {
        try {
            this.players = await api.getPlayers();
            this.displayPlayers(this.players);
            // Restore filters after loading players
            this.restoreFilterState();
        } catch (error) {
            console.error('Error loading players:', error);
        }
    }

    async loadClubs() {
        try {
            this.clubs = await api.getClubs();
            this.displayClubs(this.clubs);
        } catch (error) {
            console.error('Error loading clubs:', error);
        }
    }

    async populateTeamFilter() {
        const teamFilter = document.getElementById('teamFilter');
        // Save current selection before repopulating
        const currentSelection = teamFilter.value;
        
        teamFilter.innerHTML = '<option value="">All Teams</option>';
        
        // Create a Map to ensure unique teams by ID
        const teamsMap = new Map();
        this.players.forEach(player => {
            if (player.team_id && player.team_name) {
                teamsMap.set(player.team_id, player.team_name);
            }
        });
        
        // Convert to array and sort by name
        const teams = Array.from(teamsMap.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            teamFilter.appendChild(option);
        });
        
        // Restore previous selection if it still exists
        if (currentSelection && Array.from(teamFilter.options).some(opt => opt.value === currentSelection)) {
            teamFilter.value = currentSelection;
        }
    }

    displayPlayers(players) {
        const container = document.getElementById('playersList');
        container.innerHTML = '';

        if (players.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">No players found</p>';
            return;
        }

        players.forEach(player => {
            const playerCard = this.createPlayerCard(player);
            container.appendChild(playerCard);
        });
    }

    // Save current filter state
    saveFilterState() {
        const position = document.getElementById('positionFilter').value;
        const team = document.getElementById('teamFilter').value;
        const search = document.getElementById('searchPlayers').value;
        
        this.currentFilters = { position, team, search };
    }

    // Restore filter state
    restoreFilterState() {
        if (this.currentFilters) {
            document.getElementById('positionFilter').value = this.currentFilters.position || '';
            document.getElementById('teamFilter').value = this.currentFilters.team || '';
            document.getElementById('searchPlayers').value = this.currentFilters.search || '';
            
            // Re-apply filters
            this.filterPlayers();
        }
    }

    createPlayerCard(player) {
        const div = document.createElement('div');
        const isSold = this.soldPlayers.has(player.id);
        
        div.className = `player-card p-2 rounded border transition-shadow ${
            isSold 
                ? 'bg-red-50 border-red-200 opacity-60' 
                : 'bg-gray-50 hover:shadow-md'
        }`;
        
        const positionNames = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
        const positionClasses = { 
            1: 'bg-yellow-100 text-yellow-800', 
            2: 'bg-green-100 text-green-800', 
            3: 'bg-blue-100 text-blue-800', 
            4: 'bg-red-100 text-red-800' 
        };
        
        div.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center space-x-2 flex-1 min-w-0">
                    <div class="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                        ${player.photo ? 
                            `<img src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.photo.replace('.jpg', '')}.png" 
                                  alt="${player.web_name}" class="w-full h-full object-cover">` :
                            '<span class="text-xs font-bold">' + player.web_name.substring(0, 2) + '</span>'
                        }
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-medium text-sm truncate">${player.web_name}</div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs ${positionClasses[player.position]} px-1.5 py-0.5 rounded font-medium">${positionNames[player.position]}</span>
                            <span class="text-xs text-gray-500 truncate">${player.team_name || 'Unknown'}</span>
                        </div>
                        ${isSold ? '<div class="text-xs text-red-600 font-medium">SOLD</div>' : ''}
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="text-xs font-medium">${formatCurrency((player.price / 10).toFixed(1))}</div>
                    <div class="text-sm font-bold">${player.total_points}pts</div>
                    <button onclick="auctionManager.startPlayerAuction(${player.id})" 
                            class="start-auction-btn mt-1 px-2 py-0.5 rounded text-xs transition-colors ${
                                isSold 
                                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                                    : 'bg-green-500 text-white hover:bg-green-600'
                            }" ${isSold ? 'disabled' : ''}>
                        ${isSold ? 'Sold' : 'Auction'}
                    </button>
                </div>
            </div>
        `;
        
        return div;
    }

    displayClubs(clubs) {
        const container = document.getElementById('clubsList');
        container.innerHTML = '';

        if (clubs.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">No clubs found</p>';
            return;
        }

        clubs.forEach(club => {
            const clubCard = this.createClubCard(club);
            container.appendChild(clubCard);
        });
    }

    createClubCard(club) {
        const div = document.createElement('div');
        const isSold = this.soldClubs.has(club.id);
        div.className = `bg-gray-50 p-2 rounded border ${isSold ? 'opacity-50' : 'hover:shadow-md'} text-center`;
        
        div.innerHTML = `
            <div class="text-xs font-medium truncate">${club.short_name}</div>
            ${isSold ? 
                '<span class="inline-block bg-red-500 text-white px-2 py-0.5 rounded text-xs w-full">Sold</span>' :
                `<button onclick="auctionManager.startClubAuction(${club.id})" 
                        class="start-auction-btn bg-blue-500 text-white px-2 py-0.5 rounded text-xs hover:bg-blue-600 mt-1 w-full">
                    Auction
                </button>`
            }
        `;
        
        return div;
    }

    filterPlayers() {
        const position = document.getElementById('positionFilter').value;
        const team = document.getElementById('teamFilter').value;
        const search = document.getElementById('searchPlayers').value.toLowerCase();

        let filtered = this.players.filter(player => {
            const matchPosition = !position || player.position.toString() === position;
            const matchTeam = !team || player.team_id.toString() === team;
            const matchSearch = !search || 
                player.web_name.toLowerCase().includes(search) ||
                player.first_name.toLowerCase().includes(search) ||
                player.second_name.toLowerCase().includes(search);
            
            return matchPosition && matchTeam && matchSearch;
        });

        this.displayPlayers(filtered);
    }

    async startPlayerAuction(playerId) {
        try {
            const response = await api.startPlayerAuction(playerId);
            if (response.success) {
                await this.displayCurrentAuction(response.auction);
                showNotification('Auction started!', 'success');
            }
        } catch (error) {
            console.error('Error starting auction:', error);
            showNotification(error.message, 'error');
        }
    }

    async startClubAuction(clubId) {
        try {
            const response = await api.startClubAuction(clubId);
            if (response.success) {
                await this.displayCurrentAuction(response.auction);
                showNotification('Club auction started!', 'success');
            }
        } catch (error) {
            console.error('Error starting club auction:', error);
            showNotification(error.message, 'error');
        }
    }

    async displayCurrentAuction(auction) {
        this.currentAuction = auction;
        const container = document.getElementById('currentAuction');
        
        
        const item = auction.player || auction.club;
        const itemName = auction.player ? item.web_name : item.name;
        const itemImage = auction.player && item.photo ? 
            `https://resources.premierleague.com/premierleague/photos/players/110x140/p${item.photo.replace('.jpg', '')}.png` : 
            null;

        // Calculate maximum bid for current user
        const maxBid = await this.calculateMaxBid();
        
        // Initialize bid history for this auction if not exists
        if (!this.currentAuctionBidHistory) {
            this.currentAuctionBidHistory = [];
        }

        container.innerHTML = `
            <div class="auction-item text-center">
                <div class="mb-3 relative">
                    <!-- Bid History Icon -->
                    <button onclick="auctionManager.showBidHistory()" 
                            class="absolute top-0 right-0 text-gray-400 hover:text-gray-600 transition-colors" 
                            title="View bid history">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </button>
                    
                    ${itemImage ? 
                        `<img src="${itemImage}" alt="${itemName}" class="w-16 h-16 object-cover rounded-full mx-auto mb-2">` :
                        `<div class="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-2 flex items-center justify-center">
                            <span class="text-sm font-bold">${itemName.substring(0, 2)}</span>
                        </div>`
                    }
                    <h4 class="font-bold text-base">${itemName}</h4>
                    ${auction.player ? 
                        `<p class="text-xs text-gray-500">${item.team_name || ''}</p>` :
                        `<p class="text-xs text-gray-500">Club</p>`
                    }
                    ${auction.startedBy ? 
                        `<p class="text-xs text-gray-400">by ${auction.startedBy.name || auction.startedBy}</p>` :
                        ''
                    }
                </div>
                
                <div class="bg-gray-50 rounded p-3 mb-3">
                    <div class="text-xs text-gray-500 mb-1">Current Bid</div>
                    <div id="currentBidAmount" class="text-xl font-bold text-green-600 mb-1">${formatCurrency(auction.currentBid, false)}</div>
                    <div id="currentBidder" class="${auction.currentBidder ? 'text-xs font-medium' : 'text-xs text-gray-500'}">
                        ${auction.currentBidder ? 
                            (auction.isAutoBid ? '🤖 ' : '') + (auction.currentBidder.name || auction.currentBidder) :
                            'No bids yet'
                        }
                    </div>
                </div>
                
                ${auction.selling_stage ? `
                    <div id="sellingStatus" class="bg-${auction.selling_stage === 'selling1' ? 'yellow' : 'orange'}-100 border border-${auction.selling_stage === 'selling1' ? 'yellow' : 'orange'}-400 text-${auction.selling_stage === 'selling1' ? 'yellow' : 'orange'}-700 px-3 py-2 rounded mb-3 text-sm font-bold text-center animate-pulse">
                        ${auction.selling_stage === 'selling1' ? 'SELLING 1...' : 'SELLING 2...'}
                    </div>
                    ${auction.wait_requested_by ? `
                        <div id="waitStatus" class="bg-blue-100 border border-blue-400 text-blue-700 px-3 py-2 rounded mb-3 text-sm font-bold text-center">
                            ${auction.wait_requested_by === window.app?.currentUser?.id ? 'You requested wait' : 'Wait requested'}
                        </div>
                    ` : ''}
                ` : ''}
                
                <div class="space-y-2">
                    <div class="text-xs text-gray-600 mb-1">
                        Max bid: ${maxBid > 0 ? formatCurrency(maxBid, false) : 'N/A'}
                    </div>
                    <input type="number" id="bidAmount" value="${auction.currentBid + 5}" min="${auction.currentBid + 5}" max="${maxBid > 0 ? maxBid : ''}" step="5"
                           class="w-full px-2 py-1 border rounded text-center text-sm">
                    <button onclick="auctionManager.placeBid()" 
                            class="bid-button w-full bg-green-500 text-white py-1 rounded text-sm hover:bg-green-600">
                        Place Bid
                    </button>
                    ${auction.selling_stage && !window.app?.currentUser?.is_admin && !auction.wait_requested_by ? `
                        <button onclick="auctionManager.requestWait()" 
                                class="w-full bg-blue-500 text-white py-1 rounded text-sm hover:bg-blue-600 mt-1">
                            Wait!
                        </button>
                    ` : ''}
                    ${window.app?.currentUser?.is_admin ? `
                        <div id="adminControls" class="space-y-1">
                            ${auction.wait_requested_by ? `
                                <div class="bg-blue-50 border border-blue-200 rounded p-2 mb-1">
                                    <div class="text-xs font-medium text-blue-800 mb-1">Wait requested</div>
                                    <div class="flex gap-1">
                                        <button onclick="auctionManager.handleWaitRequest('accept')" 
                                                class="flex-1 bg-green-500 text-white py-1 px-2 rounded text-xs hover:bg-green-600">
                                            Accept
                                        </button>
                                        <button onclick="auctionManager.handleWaitRequest('reject')" 
                                                class="flex-1 bg-red-500 text-white py-1 px-2 rounded text-xs hover:bg-red-600">
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            ` : ''}
                            ${!auction.selling_stage ? `
                                <button onclick="auctionManager.updateSellingStage('selling1')" 
                                        class="w-full bg-yellow-500 text-white py-1 rounded text-sm hover:bg-yellow-600">
                                    Selling 1
                                </button>
                            ` : ''}
                            ${auction.selling_stage === 'selling1' && !auction.wait_requested_by ? `
                                <button onclick="auctionManager.updateSellingStage('selling2')" 
                                        class="w-full bg-orange-500 text-white py-1 rounded text-sm hover:bg-orange-600">
                                    Selling 2
                                </button>
                            ` : ''}
                            ${auction.selling_stage === 'selling2' && !auction.wait_requested_by ? `
                                <button onclick="auctionManager.updateSellingStage('sold')" 
                                        class="w-full bg-red-500 text-white py-1 rounded text-sm hover:bg-red-600">
                                    Sold
                                </button>
                            ` : ''}
                            ${auction.selling_stage && !auction.wait_requested_by ? `
                                <button onclick="auctionManager.updateSellingStage('sold')" 
                                        class="w-full bg-red-500 text-white py-1 rounded text-sm hover:bg-red-600">
                                    Sold (Skip wait)
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    async calculateMaxBid() {
        try {
            const currentUser = window.app?.currentUser;
            if (!currentUser) return 0;
            
            const currentBudget = currentUser.budget;
            
            // Get actual squad count from backend
            let remainingPicks = 17; // Default to full picks
            
            try {
                const squadData = await api.getTeamSquad(currentUser.id);
                const totalOwned = (squadData.counts?.players || 0) + (squadData.counts?.clubs || 0);
                remainingPicks = Math.max(0, 17 - totalOwned);
            } catch (error) {
                console.warn('Could not get squad data, using estimated remaining picks');
                // Fallback to estimation based on draft position
                if (this.draftState && this.draftState.current_position) {
                    const userCompletedPicks = Math.floor((this.draftState.current_position - 1) / (this.draftState.total_teams || 10));
                    remainingPicks = Math.max(0, 17 - userCompletedPicks);
                }
            }
            
            // Minimum bid for remaining picks (excluding current auction)
            // Each remaining pick needs at least J10
            const minForRemaining = Math.max(0, (remainingPicks - 1) * 10);
            
            // Maximum bid = current budget - minimum needed for remaining picks
            const maxBid = Math.max(0, currentBudget - minForRemaining);
            
            // Make sure it's a multiple of 5 (since bids are in increments of 5)
            return Math.floor(maxBid / 5) * 5;
            
        } catch (error) {
            console.error('Error calculating max bid:', error);
            return 0;
        }
    }

    async placeBid() {
        try {
            const bidInput = document.getElementById('bidAmount');
            const bidAmount = parseInt(bidInput.value);
            
            if (bidAmount <= this.currentAuction.currentBid) {
                showNotification('Bid must be higher than current bid', 'error');
                return;
            }
            
            if (bidAmount % 5 !== 0) {
                showNotification('Bid must be in increments of 5', 'error');
                return;
            }

            // Check if bid exceeds maximum allowed bid
            const maxBid = await this.calculateMaxBid();
            if (maxBid > 0 && bidAmount > maxBid) {
                showNotification(`Bid cannot exceed ${formatCurrencyPlain(maxBid, false)} (budget constraint)`, 'error');
                return;
            }

            await api.placeBid(this.currentAuction.id, bidAmount);
            showNotification('Bid placed!', 'success');
            
        } catch (error) {
            console.error('Error placing bid:', error);
            showNotification(error.message, 'error');
        }
    }

    updateCurrentBid(bidData) {
        if (this.currentAuction && this.currentAuction.id === bidData.auctionId) {
            this.currentAuction.currentBid = bidData.bidAmount;
            this.currentAuction.currentBidder = bidData.teamName;
            this.currentAuction.isAutoBid = bidData.isAutoBid;
            
            // Reset selling stage when a new bid is placed
            const wasInSellingStage = this.currentAuction.selling_stage;
            if (this.currentAuction.selling_stage) {
                this.currentAuction.selling_stage = null;
                // Remove selling status display
                const sellingStatus = document.getElementById('sellingStatus');
                if (sellingStatus) {
                    sellingStatus.remove();
                }
            }
            
            // Update the display using specific IDs
            const currentBidEl = document.getElementById('currentBidAmount');
            const bidderEl = document.getElementById('currentBidder');
            const bidInput = document.getElementById('bidAmount');
            
            if (currentBidEl) {
                currentBidEl.innerHTML = formatCurrency(bidData.bidAmount, false);
            }
            
            if (bidderEl) {
                // Add robot emoji for auto-bids
                const bidderText = bidData.isAutoBid ? `🤖 ${bidData.teamName}` : bidData.teamName;
                bidderEl.textContent = bidderText;
                // Update classes to show it's now a real bidder
                bidderEl.className = 'text-xs font-medium';
            }
            
            if (bidInput) {
                bidInput.value = bidData.bidAmount + 5;
                bidInput.min = bidData.bidAmount + 5;
            }
            
            // Update admin controls if selling stage was reset
            if (wasInSellingStage && window.app?.currentUser?.is_admin) {
                this.updateAdminControls();
            }
            
            console.log('Updated bid display:', { 
                currentBidEl: !!currentBidEl, 
                bidderEl: !!bidderEl, 
                bidAmount: bidData.bidAmount, 
                teamName: bidData.teamName,
                sellingStageReset: wasInSellingStage
            });
        }
    }

    async completeAuction() {
        try {
            if (!this.currentAuction) return;
            
            await api.completeAuction(this.currentAuction.id);
            showNotification('Auction completed!', 'success');
            this.clearCurrentAuction();
            
        } catch (error) {
            console.error('Error completing auction:', error);
            showNotification(error.message, 'error');
        }
    }

    clearCurrentAuction() {
        this.currentAuction = null;
        const container = document.getElementById('currentAuction');
        
        // Show teams overview instead of just "No active auction"
        container.innerHTML = `
            <div id="noAuctionContent" class="space-y-2 text-xs">
                <div class="text-center py-2 text-gray-500 font-medium">Teams Overview</div>
                <div id="teamsOverview" class="space-y-1">
                    <div class="text-gray-400 text-center py-8">Loading teams...</div>
                </div>
            </div>
        `;
        
        // Load teams overview
        this.loadTeamsOverview();
        
    }

    async loadTeamsOverview() {
        try {
            const teams = await api.getAllTeams();
            const teamsOverviewContainer = document.getElementById('teamsOverview');
            
            if (!teamsOverviewContainer) return;
            
            if (!teams || teams.length === 0) {
                teamsOverviewContainer.innerHTML = '<div class="text-gray-400 text-center py-8">No teams found</div>';
                return;
            }
            
            // Sort teams by budget descending
            const sortedTeams = teams.sort((a, b) => (b.budget || 0) - (a.budget || 0));
            
            const teamsHTML = sortedTeams.map(team => {
                const budget = team.budget || 0;
                const playersCount = team.player_count || 0;
                const clubsCount = team.club_count || 0;
                
                return `
                    <div class="flex items-center justify-between py-1 px-2 hover:bg-gray-50 rounded">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                                ${team.id}
                            </div>
                            <span class="font-medium text-gray-700">${team.name}</span>
                        </div>
                        <div class="flex items-center gap-3 text-right">
                            <div class="text-emerald-600 font-bold">
                                <span class="currency-j">J</span>${budget}
                            </div>
                            <div class="text-gray-500 text-xs">
                                ${playersCount}P • ${clubsCount}C
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            teamsOverviewContainer.innerHTML = teamsHTML;
            
        } catch (error) {
            console.error('Error loading teams overview:', error);
            const teamsOverviewContainer = document.getElementById('teamsOverview');
            if (teamsOverviewContainer) {
                teamsOverviewContainer.innerHTML = '<div class="text-gray-400 text-center py-8">Error loading teams</div>';
            }
        }
    }

    // Refresh auction data when tab becomes active
    async refreshAuctionOnTabFocus() {
        try {
            // Only refresh if on auction tab
            if (window.app && window.app.currentTab !== 'auction') {
                return;
            }

            // Refresh active auctions
            await this.loadActiveAuctions();
            
            // Refresh sold items to update player/club availability
            await this.loadSoldItems();
            
            // Refresh players list to update sold status
            this.displayPlayers(this.players);
            this.displayClubs(this.clubs);
            
            // Restore filter state
            this.restoreFilterState();
            
            // Refresh draft state
            await this.loadDraftState();
            
            console.log('Auction data refreshed successfully');
        } catch (error) {
            console.error('Error refreshing auction data:', error);
        }
    }

    async loadActiveAuctions() {
        try {
            const auctions = await api.getActiveAuctions();
            if (auctions.length > 0) {
                // Display the first active auction
                const auction = auctions[0];
                const auctionData = {
                    id: auction.id,
                    currentBid: auction.current_bid,
                    currentBidder: auction.current_bidder_name,
                    type: auction.auction_type,
                    status: auction.status,
                    selling_stage: auction.selling_stage,
                    wait_requested_by: auction.wait_requested_by
                };
                
                if (auction.auction_type === 'player') {
                    auctionData.player = {
                        id: auction.player_id,
                        web_name: auction.player_name,
                        team_name: auction.team_name,
                        position: auction.position,
                        photo: auction.photo
                    };
                } else {
                    auctionData.club = {
                        name: auction.club_name,
                        short_name: auction.club_short_name
                    };
                }
                
                await this.displayCurrentAuction(auctionData);
            } else {
                // No active auctions - show teams overview
                this.clearCurrentAuction();
            }
        } catch (error) {
            console.error('Error loading active auctions:', error);
            // If there's an error, also show teams overview instead of empty state
            this.clearCurrentAuction();
        }
    }

    // Initialize chat functionality
    initializeChat() {
        const chatForm = document.getElementById('auctionChatForm');
        const chatInput = document.getElementById('auctionChatInput');
        
        if (chatForm) {
            chatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const message = chatInput.value.trim();
                if (message) {
                    await this.sendChatMessage(message);
                    chatInput.value = '';
                }
            });
        }

        // Setup socket listeners for chat with retry mechanism
        this.setupChatSocketListeners();

        // Load initial chat messages
        this.loadChatMessages();
        
        // Set up periodic refresh as fallback (every 10 seconds)
        this.chatRefreshInterval = setInterval(() => {
            this.loadChatMessages();
        }, 10000);
    }

    setupChatSocketListeners(retryCount = 0) {
        const maxRetries = 10;
        
        if (!window.socketManager || !window.socketManager.socket) {
            if (retryCount < maxRetries) {
                console.log(`Chat: Socket not ready, retry ${retryCount + 1}/${maxRetries}`);
                setTimeout(() => this.setupChatSocketListeners(retryCount + 1), 500);
            } else {
                console.warn('Chat: Max socket retry attempts reached');
            }
            return;
        }

        console.log('Chat: Setting up socket listeners');
        
        // Remove existing listeners to prevent duplicates from both Draft and Auction managers
        window.socketManager.socket.off('new-chat-message');
        
        // Add listener for new chat messages in auction context
        window.socketManager.socket.on('new-chat-message', (message) => {
            console.log('Auction Chat: Received new message', message);
            
            // Only handle if we're on the auction tab
            if (window.app && window.app.currentTab === 'auction') {
                this.addChatMessage(message);
            }
        });
    }

    async loadChatMessages() {
        try {
            const messages = await api.getChatMessages();
            this.chatMessages = messages;
            
            // Debug: Log message format to see created_at structure
            if (messages.length > 0) {
                console.log('Chat message sample:', messages[0]);
                console.log('created_at type:', typeof messages[0].created_at);
                console.log('created_at value:', messages[0].created_at);
            }
            
            this.displayChatMessages();
        } catch (error) {
            console.error('Error loading chat messages:', error);
        }
    }

    async sendChatMessage(message) {
        try {
            await api.sendChatMessage(message);
        } catch (error) {
            console.error('Error sending chat message:', error);
            showNotification('Failed to send message', 'error');
        }
    }

    addChatMessage(message) {
        console.log('Adding chat message:', message);
        
        // Check if message already exists to prevent duplicates
        const exists = this.chatMessages.some(msg => 
            msg.team_id === message.team_id && 
            msg.message === message.message && 
            Math.abs(new Date(msg.created_at) - new Date(message.created_at)) < 1000
        );
        
        if (!exists) {
            this.chatMessages.push(message);
            this.displayChatMessages();
            
            // Scroll to bottom
            const container = document.getElementById('auctionChatMessages');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }
    }

    displayChatMessages() {
        const container = document.getElementById('auctionChatMessages');
        if (!container) return;

        if (this.chatMessages.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center">No messages yet...</div>';
            return;
        }

        container.innerHTML = this.chatMessages.map(msg => {
            // Fix date formatting - handle Firestore timestamps
            let timeString = '';
            try {
                if (msg.created_at) {
                    let date;
                    
                    // Handle Firestore timestamp format
                    if (typeof msg.created_at === 'object' && msg.created_at._seconds) {
                        date = new Date(msg.created_at._seconds * 1000);
                    } 
                    // Handle standard ISO string or timestamp
                    else {
                        date = new Date(msg.created_at);
                    }
                    
                    if (!isNaN(date.getTime())) {
                        timeString = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    } else {
                        timeString = 'now';
                    }
                } else {
                    timeString = 'now';
                }
            } catch (error) {
                console.warn('Error formatting date:', msg.created_at, error);
                timeString = 'now';
            }
            
            return `
                <div class="mb-1 text-xs">
                    <span class="font-semibold">${msg.team_name}:</span>
                    <span>${this.escapeHtml(msg.message)}</span>
                    <span class="text-gray-400 ml-1">${timeString}</span>
                </div>
            `;
        }).join('');
    }

    // Load and display draft state
    async loadDraftState() {
        try {
            const state = await api.getDraftState();
            this.draftState = state;
            this.updateTurnIndicator();

            // Listen for draft updates
            if (window.socketManager && window.socketManager.socket) {
                window.socketManager.socket.on('draft-turn-advanced', (data) => {
                    this.draftState = { ...this.draftState, ...data };
                    this.updateTurnIndicator();
                });
            }
        } catch (error) {
            console.error('Error loading draft state:', error);
        }
    }

    updateTurnIndicator() {
        const indicator = document.getElementById('auctionTurnIndicator');
        if (!indicator || !this.draftState) return;

        if (!this.draftState.is_active) {
            indicator.innerHTML = `<span class="text-gray-500">Draft not active</span>`;
            return;
        }

        const currentUser = window.app?.currentUser;
        const isMyTurn = currentUser && this.draftState.current_team_id === currentUser.id;
        const currentTeamName = this.draftState.current_team_name;
        
        // Get next team
        let nextTeamName = '';
        if (this.draftState.draft_order && this.draftState.current_position < 170) {
            const nextPosition = this.draftState.current_position + 1;
            const nextTeam = this.draftState.draft_order.find(t => t.cumulative_position === nextPosition);
            if (nextTeam) {
                nextTeamName = nextTeam.name || nextTeam.username || `Team ${nextTeam.team_id}`;
            }
        }
        
        // Create minimal indicator
        let html = '';
        if (isMyTurn) {
            html = `<span class="text-green-600 font-bold">🎯 Your turn</span>`;
        } else {
            html = `<span class="text-gray-700"><strong>Now:</strong> ${currentTeamName}</span>`;
            if (nextTeamName) {
                html += ` <span class="text-gray-500 ml-2">Next: ${nextTeamName}</span>`;
            }
        }
        
        indicator.innerHTML = html;
    }
    
    updateDraftOrderModal() {
        const modalList = document.getElementById('draftOrderList');
        if (!modalList || !this.draftState) return;
        
        if (!this.draftState.is_active || !this.draftState.draft_order) {
            modalList.innerHTML = '<div class="text-gray-500 text-center">No draft order available</div>';
            return;
        }
        
        // Get current round
        const currentRound = Math.ceil(this.draftState.current_position / 10);
        const isForward = currentRound % 2 === 1;
        
        // Get unique teams for display
        const uniqueTeams = [];
        const seenTeamIds = new Set();
        
        for (const team of this.draftState.draft_order) {
            if (!seenTeamIds.has(team.team_id)) {
                uniqueTeams.push(team);
                seenTeamIds.add(team.team_id);
            }
        }
        
        uniqueTeams.sort((a, b) => a.position - b.position);
        
        const currentUser = window.app?.currentUser;
        
        const teamsHtml = uniqueTeams.map((team, index) => {
            const isActive = team.team_id === this.draftState.current_team_id;
            const isMyTeam = currentUser && team.team_id === currentUser.id;
            const teamName = team.name || team.username || `Team ${team.team_id}`;
            
            let classes = 'p-2 rounded text-sm';
            if (isActive) {
                classes += ' bg-green-100 border-2 border-green-500 font-bold';
            } else if (isMyTeam) {
                classes += ' bg-blue-50 border border-blue-300';
            } else {
                classes += ' bg-gray-50 border border-gray-200';
            }
            
            return `
                <div class="${classes}">
                    <span class="font-medium">${index + 1}.</span> ${teamName}
                    ${isActive ? ' <span class="text-green-600">← Current</span>' : ''}
                </div>
            `;
        }).join('');
        
        modalList.innerHTML = `
            <div class="mb-3 text-center">
                <span class="text-sm font-medium text-gray-600">Round ${currentRound} - Position ${this.draftState.current_position}/170</span>
                <span class="ml-2 text-xs text-gray-500">(${isForward ? 'Forward' : 'Reverse'})</span>
            </div>
            ${teamsHtml}
        `;
    }

    async updateSellingStage(stage) {
        try {
            if (!this.currentAuction) {
                showNotification('No active auction', 'error');
                return;
            }
            
            const response = await fetch(`${api.baseURL}/auction/selling-stage/${this.currentAuction.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${api.token}`
                },
                body: JSON.stringify({ stage })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update selling stage');
            }
            
            if (stage === 'sold') {
                // Auction will be completed, clear the display
                showNotification('Auction completed!', 'success');
                this.clearCurrentAuction();
                await this.loadSoldItems();
                await this.loadPlayers();
            } else {
                // Update local state
                this.currentAuction.selling_stage = stage;
                await this.displayCurrentAuction(this.currentAuction);
            }
            
        } catch (error) {
            console.error('Error updating selling stage:', error);
            showNotification(error.message, 'error');
        }
    }

    updateAdminControls() {
        const adminControls = document.getElementById('adminControls');
        if (!adminControls || !this.currentAuction || !window.app?.currentUser?.is_admin) {
            return;
        }

        const auction = this.currentAuction;
        
        // Re-render admin controls with current auction state
        adminControls.innerHTML = `
            ${auction.wait_requested_by ? `
                <div class="bg-blue-50 border border-blue-200 rounded p-2 mb-1">
                    <div class="text-xs font-medium text-blue-800 mb-1">Wait requested</div>
                    <div class="flex gap-1">
                        <button onclick="auctionManager.handleWaitRequest('accept')" 
                                class="flex-1 bg-green-500 text-white py-1 px-2 rounded text-xs hover:bg-green-600">
                            Accept
                        </button>
                        <button onclick="auctionManager.handleWaitRequest('reject')" 
                                class="flex-1 bg-red-500 text-white py-1 px-2 rounded text-xs hover:bg-red-600">
                            Reject
                        </button>
                    </div>
                </div>
            ` : ''}
            ${!auction.selling_stage ? `
                <button onclick="auctionManager.updateSellingStage('selling1')" 
                        class="w-full bg-yellow-500 text-white py-1 rounded text-sm hover:bg-yellow-600">
                    Selling 1
                </button>
            ` : ''}
            ${auction.selling_stage === 'selling1' && !auction.wait_requested_by ? `
                <button onclick="auctionManager.updateSellingStage('selling2')" 
                        class="w-full bg-orange-500 text-white py-1 rounded text-sm hover:bg-orange-600">
                    Selling 2
                </button>
            ` : ''}
            ${auction.selling_stage === 'selling2' && !auction.wait_requested_by ? `
                <button onclick="auctionManager.updateSellingStage('sold')" 
                        class="w-full bg-red-500 text-white py-1 rounded text-sm hover:bg-red-600">
                    Sold
                </button>
            ` : ''}
            ${auction.selling_stage && !auction.wait_requested_by ? `
                <button onclick="auctionManager.updateSellingStage('sold')" 
                        class="w-full bg-red-500 text-white py-1 rounded text-sm hover:bg-red-600">
                    Sold (Skip wait)
                </button>
            ` : ''}
        `;
        
        console.log('Admin controls updated - selling stage:', auction.selling_stage);
    }

    async requestWait() {
        try {
            if (!this.currentAuction) {
                showNotification('No active auction', 'error');
                return;
            }
            
            const response = await fetch(`${api.baseURL}/auction/request-wait/${this.currentAuction.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${api.token}`
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to request wait');
            }
            
            showNotification('Wait requested!', 'success');
            
        } catch (error) {
            console.error('Error requesting wait:', error);
            showNotification(error.message, 'error');
        }
    }

    async handleWaitRequest(action) {
        try {
            if (!this.currentAuction) {
                showNotification('No active auction', 'error');
                return;
            }
            
            const response = await fetch(`${api.baseURL}/auction/handle-wait/${this.currentAuction.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${api.token}`
                },
                body: JSON.stringify({ action })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to handle wait request');
            }
            
            showNotification(`Wait ${action}ed!`, 'success');
            
        } catch (error) {
            console.error('Error handling wait request:', error);
            showNotification(error.message, 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Bid history methods
    showBidHistory() {
        // Create or update the bid history modal
        let modal = document.getElementById('bidHistoryModal');
        if (!modal) {
            // Create modal if it doesn't exist
            modal = document.createElement('div');
            modal.id = 'bidHistoryModal';
            modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full hidden z-50';
            modal.innerHTML = `
                <div class="relative top-20 mx-auto p-5 w-full max-w-md">
                    <div class="card p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold text-gray-900">📊 Bid History</h3>
                            <button onclick="auctionManager.closeBidHistory()" class="text-gray-400 hover:text-gray-600">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div id="bidHistoryList" class="space-y-2 max-h-96 overflow-y-auto">
                            <div class="text-gray-500 text-center">Loading bid history...</div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        modal.classList.remove('hidden');
        this.loadBidHistoryForCurrentAuction();
    }
    
    closeBidHistory() {
        const modal = document.getElementById('bidHistoryModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    async loadBidHistoryForCurrentAuction() {
        if (!this.currentAuction || !this.currentAuction.id) return;
        
        try {
            const response = await fetch(`${api.baseURL}/auction/bid-history/${this.currentAuction.id}`, {
                headers: {
                    'Authorization': `Bearer ${api.token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load bid history');
            }
            
            const data = await response.json();
            this.currentAuctionBidHistory = data.bids || [];
            this.updateBidHistoryDisplay();
        } catch (error) {
            console.error('Error loading bid history:', error);
            const historyList = document.getElementById('bidHistoryList');
            if (historyList) {
                historyList.innerHTML = '<div class="text-red-500 text-center">Failed to load bid history</div>';
            }
        }
    }
    
    updateBidHistoryDisplay() {
        const historyList = document.getElementById('bidHistoryList');
        if (!historyList) return;
        
        if (!this.currentAuctionBidHistory || this.currentAuctionBidHistory.length === 0) {
            historyList.innerHTML = '<div class="text-gray-500 text-center">No bids yet</div>';
            return;
        }
        
        // Sort bids by time (newest first)
        const sortedBids = [...this.currentAuctionBidHistory].sort((a, b) => {
            const timeA = a.created_at?._seconds || a.timestamp || 0;
            const timeB = b.created_at?._seconds || b.timestamp || 0;
            return timeB - timeA;
        });
        
        const bidsHtml = sortedBids.map((bid, index) => {
            const isLatest = index === 0;
            const isAutoBid = bid.is_auto_bid || bid.isAutoBid;
            
            return `
                <div class="p-2 rounded ${isLatest ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}">
                    <div class="flex justify-between items-center">
                        <div>
                            <span class="font-medium">${bid.team_name || bid.teamName || 'Unknown'}</span>
                            ${isAutoBid ? '<span class="ml-1 text-xs text-blue-600">🤖</span>' : ''}
                        </div>
                        <div class="text-right">
                            <div class="font-bold text-green-600">${formatCurrency(bid.bid_amount || bid.bidAmount || bid.amount, false)}</div>
                            ${isLatest ? '<div class="text-xs text-green-600">Current</div>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        historyList.innerHTML = bidsHtml;
    }
    
    // Add bid to history when new bid is received (called from socket handler)
    addBidToHistory(bidData) {
        if (!this.currentAuction || bidData.auctionId !== this.currentAuction.id) return;
        
        if (!this.currentAuctionBidHistory) {
            this.currentAuctionBidHistory = [];
        }
        
        // Add the new bid
        this.currentAuctionBidHistory.push({
            team_name: bidData.teamName,
            bid_amount: bidData.bidAmount,
            is_auto_bid: bidData.isAutoBid,
            created_at: { _seconds: Date.now() / 1000 }
        });
        
        // Update display if modal is open
        if (document.getElementById('bidHistoryModal') && !document.getElementById('bidHistoryModal').classList.contains('hidden')) {
            this.updateBidHistoryDisplay();
        }
    }

    // Clean up method
    cleanup() {
        if (this.chatRefreshInterval) {
            clearInterval(this.chatRefreshInterval);
            this.chatRefreshInterval = null;
        }
    }
}

// Global auction manager
window.auctionManager = new AuctionManager();