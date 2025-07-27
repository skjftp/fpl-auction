// Auction management
class AuctionManager {
    constructor() {
        this.currentAuction = null;
        this.players = [];
        this.clubs = [];
        this.positions = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadInitialData();
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
        div.className = 'player-card bg-gray-50 p-3 rounded border hover:shadow-md';
        
        const positionNames = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
        const positionClasses = { 1: 'position-gkp', 2: 'position-def', 3: 'position-mid', 4: 'position-fwd' };
        
        div.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                        ${player.photo ? 
                            `<img src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.photo.replace('.jpg', '')}.png" 
                                  alt="${player.web_name}" class="w-full h-full object-cover rounded-full">` :
                            '<span class="text-xs font-bold">' + player.web_name.substring(0, 2) + '</span>'
                        }
                    </div>
                    <div>
                        <div class="font-medium">${player.web_name}</div>
                        <div class="text-sm text-gray-500">${player.team_name || 'Unknown Team'}</div>
                        <div class="flex items-center space-x-2 mt-1">
                            <span class="position-badge ${positionClasses[player.position]}">${positionNames[player.position]}</span>
                            <span class="text-xs text-gray-500">£${(player.price / 10).toFixed(1)}m</span>
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm text-gray-500">Points</div>
                    <div class="font-bold">${player.total_points}</div>
                    <button onclick="auctionManager.startPlayerAuction(${player.id})" 
                            class="start-auction-btn mt-2 bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">
                        Start Auction
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
        div.className = 'bg-gray-50 p-3 rounded border hover:shadow-md';
        
        div.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <div class="font-medium">${club.name}</div>
                    <div class="text-sm text-gray-500">${club.short_name}</div>
                </div>
                <button onclick="auctionManager.startClubAuction(${club.id})" 
                        class="start-auction-btn bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">
                    Start Auction
                </button>
            </div>
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
                <div class="mb-4">
                    ${itemImage ? 
                        `<img src="${itemImage}" alt="${itemName}" class="w-20 h-20 object-cover rounded-full mx-auto mb-2">` :
                        `<div class="w-20 h-20 bg-gray-200 rounded-full mx-auto mb-2 flex items-center justify-center">
                            <span class="text-lg font-bold">${itemName.substring(0, 2)}</span>
                        </div>`
                    }
                    <h4 class="font-bold text-lg">${itemName}</h4>
                    ${auction.player ? 
                        `<p class="text-sm text-gray-500">${item.team_name || ''}</p>` :
                        `<p class="text-sm text-gray-500">Club</p>`
                    }
                    ${auction.startedBy ? 
                        `<p class="text-xs text-gray-400">Started by ${auction.startedBy.name || auction.startedBy}</p>` :
                        ''
                    }
                </div>
                
                <div class="mb-4">
                    <div class="text-sm text-gray-500">Current Bid</div>
                    <div class="text-2xl font-bold text-green-600">£${auction.currentBid}</div>
                    ${auction.currentBidder ? 
                        `<div class="text-sm text-gray-500">by ${auction.currentBidder.name || auction.currentBidder}</div>` :
                        `<div class="text-sm text-gray-500">No bids yet</div>`
                    }
                </div>
                
                <div class="space-y-2">
                    <input type="number" id="bidAmount" value="${auction.currentBid + 5}" min="${auction.currentBid + 5}" step="5"
                           class="w-full px-3 py-2 border rounded text-center">
                    <button onclick="auctionManager.placeBid()" 
                            class="bid-button w-full bg-green-500 text-white py-2 rounded hover:bg-green-600">
                        Place Bid
                    </button>
                    <button onclick="auctionManager.completeAuction()" 
                            class="w-full bg-red-500 text-white py-2 rounded hover:bg-red-600">
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
}

// Global auction manager
window.auctionManager = new AuctionManager();