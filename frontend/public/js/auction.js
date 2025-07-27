// Auction management
class AuctionManager {
    constructor() {
        this.currentAuction = null;
        this.players = [];
        this.clubs = [];
        this.positions = [];
        this.draftState = null;
        this.chatMessages = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadInitialData();
        this.initializeChat();
        this.loadDraftState();
    }

    bindEvents() {
        // Sync data button
        document.getElementById('syncDataBtn').addEventListener('click', () => {
            this.syncFPLData();
        });

        // Filter events
        document.getElementById('positionFilter').addEventListener('change', () => {
            this.filterPlayers();
        });

        document.getElementById('teamFilter').addEventListener('change', () => {
            this.filterPlayers();
        });

        document.getElementById('searchPlayers').addEventListener('input', () => {
            this.filterPlayers();
        });
    }

    async loadInitialData() {
        try {
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

    async loadPlayers() {
        try {
            this.players = await api.getPlayers();
            this.displayPlayers(this.players);
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
        teamFilter.innerHTML = '<option value="">All Teams</option>';
        
        const teams = [...new Set(this.players.map(p => ({ id: p.team_id, name: p.team_name })))]
            .filter(t => t.name)
            .sort((a, b) => a.name.localeCompare(b.name));

        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            teamFilter.appendChild(option);
        });
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

    createPlayerCard(player) {
        const div = document.createElement('div');
        div.className = 'player-card bg-gray-50 p-2 rounded border hover:shadow-md transition-shadow';
        
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
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="text-xs font-medium">£${(player.price / 10).toFixed(1)}m</div>
                    <div class="text-sm font-bold">${player.total_points}pts</div>
                    <button onclick="auctionManager.startPlayerAuction(${player.id})" 
                            class="start-auction-btn mt-1 bg-green-500 text-white px-2 py-0.5 rounded text-xs hover:bg-green-600 transition-colors">
                        Auction
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
        div.className = 'bg-gray-50 p-2 rounded border hover:shadow-md text-center';
        
        div.innerHTML = `
            <div class="text-xs font-medium truncate">${club.short_name}</div>
            <button onclick="auctionManager.startClubAuction(${club.id})" 
                    class="start-auction-btn bg-blue-500 text-white px-2 py-0.5 rounded text-xs hover:bg-blue-600 mt-1 w-full">
                Auction
            </button>
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
                this.displayCurrentAuction(response.auction);
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
                this.displayCurrentAuction(response.auction);
                showNotification('Club auction started!', 'success');
            }
        } catch (error) {
            console.error('Error starting club auction:', error);
            showNotification(error.message, 'error');
        }
    }

    displayCurrentAuction(auction) {
        this.currentAuction = auction;
        const container = document.getElementById('currentAuction');
        
        const item = auction.player || auction.club;
        const itemName = auction.player ? item.web_name : item.name;
        const itemImage = auction.player && item.photo ? 
            `https://resources.premierleague.com/premierleague/photos/players/110x140/p${item.photo.replace('.jpg', '')}.png` : 
            null;

        container.innerHTML = `
            <div class="auction-item text-center">
                <div class="mb-3">
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
                    <div class="text-xl font-bold text-green-600 mb-1">£${auction.currentBid}</div>
                    ${auction.currentBidder ? 
                        `<div class="text-xs font-medium">${auction.currentBidder.name || auction.currentBidder}</div>` :
                        `<div class="text-xs text-gray-500">No bids yet</div>`
                    }
                </div>
                
                <div class="space-y-2">
                    <input type="number" id="bidAmount" value="${auction.currentBid + 5}" min="${auction.currentBid + 5}" step="5"
                           class="w-full px-2 py-1 border rounded text-center text-sm">
                    <button onclick="auctionManager.placeBid()" 
                            class="bid-button w-full bg-green-500 text-white py-1 rounded text-sm hover:bg-green-600">
                        Place Bid
                    </button>
                    <button onclick="auctionManager.completeAuction()" 
                            class="w-full bg-red-500 text-white py-1 rounded text-sm hover:bg-red-600">
                        Complete Auction
                    </button>
                </div>
            </div>
        `;
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
            
            // Update the display
            const currentBidEl = document.querySelector('#currentAuction .text-2xl');
            const bidderEl = document.querySelector('#currentAuction .text-sm.text-gray-500:last-child');
            const bidInput = document.getElementById('bidAmount');
            
            if (currentBidEl) currentBidEl.textContent = `£${bidData.bidAmount}`;
            if (bidderEl) bidderEl.textContent = `by ${bidData.teamName}`;
            if (bidInput) bidInput.value = bidData.bidAmount + 5;
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
        container.innerHTML = '<p class="text-gray-500 text-center py-8">No active auction</p>';
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
                    status: auction.status
                };
                
                if (auction.auction_type === 'player') {
                    auctionData.player = {
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
                
                this.displayCurrentAuction(auctionData);
            }
        } catch (error) {
            console.error('Error loading active auctions:', error);
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

        // Listen for new chat messages
        if (window.socketManager && window.socketManager.socket) {
            window.socketManager.socket.on('new-chat-message', (message) => {
                this.addChatMessage(message);
            });
        }

        // Load initial chat messages
        this.loadChatMessages();
    }

    async loadChatMessages() {
        try {
            const messages = await api.getChatMessages();
            this.chatMessages = messages;
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
        this.chatMessages.push(message);
        this.displayChatMessages();
        
        // Scroll to bottom
        const container = document.getElementById('auctionChatMessages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    displayChatMessages() {
        const container = document.getElementById('auctionChatMessages');
        if (!container) return;

        if (this.chatMessages.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center">No messages yet...</div>';
            return;
        }

        container.innerHTML = this.chatMessages.map(msg => `
            <div class="mb-1 text-xs">
                <span class="font-semibold">${msg.team_name}:</span>
                <span>${msg.message}</span>
                <span class="text-gray-400 ml-1">${new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        `).join('');
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
            indicator.innerHTML = `
                <div class="text-center">
                    <span class="text-gray-500">Draft not active</span>
                </div>
            `;
            return;
        }

        const isMyTurn = this.draftState.current_team_id === window.currentTeam.id;
        const turnClass = isMyTurn ? 'bg-green-100 border-green-500' : 'bg-gray-100 border-gray-400';
        const turnText = isMyTurn ? 'Your Turn!' : `${this.draftState.current_team_name}'s Turn`;

        indicator.innerHTML = `
            <div class="text-center ${turnClass} border-2 rounded-lg p-4">
                <div class="text-lg font-bold ${isMyTurn ? 'text-green-600' : 'text-gray-700'}">
                    ${turnText}
                </div>
                <div class="text-sm text-gray-600">
                    Position ${this.draftState.current_position} of ${this.draftState.draft_order?.length || 0}
                </div>
                ${isMyTurn ? '<div class="text-xs text-green-600 mt-2">You can start an auction now!</div>' : ''}
            </div>
        `;

        // Enable/disable auction buttons based on turn
        const startButtons = document.querySelectorAll('.start-auction-btn');
        startButtons.forEach(btn => {
            btn.disabled = !isMyTurn;
            if (!isMyTurn) {
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }
}

// Global auction manager
window.auctionManager = new AuctionManager();