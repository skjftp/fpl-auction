// Mobile Auction Manager for FPL Auction
class MobileAuctionManager {
    constructor() {
        this.currentAuction = null;
        this.players = [];
        this.clubs = [];
        this.soldItems = [];
        this.filteredPlayers = [];
        
        // Position mapping
        this.positionMap = {
            1: 'GKP',
            2: 'DEF', 
            3: 'MID',
            4: 'FWD'
        };
    }

    getPositionName(positionId, player) {
        // Try to get from position mapping first
        if (positionId && this.positionMap[positionId]) {
            return this.positionMap[positionId];
        }
        
        // Fallback to player.position or element_type_name
        return player.position || player.element_type_name || 'Unknown';
    }

    async initialize() {
        try {
            // Load initial data
            await this.loadPlayers();
            await this.loadClubs();
            await this.loadActiveAuctions();
            await this.loadSoldItems();
            
            // Setup event listeners
            this.setupEventListeners();
            
            console.log('Mobile auction manager initialized');
        } catch (error) {
            console.error('Failed to initialize auction manager:', error);
            window.mobileApp.showToast('Failed to load auction data', 'error');
        }
    }

    setupEventListeners() {
        // Place bid button
        const placeBidBtn = document.getElementById('placeBidBtn');
        if (placeBidBtn) {
            placeBidBtn.addEventListener('click', () => this.handlePlaceBid());
        }

        // Wait button
        const waitBtn = document.getElementById('waitBtn');
        if (waitBtn) {
            waitBtn.addEventListener('click', () => this.handleWaitRequest());
        }

        // Player search and filters
        const playerSearch = document.getElementById('playerSearch');
        if (playerSearch) {
            playerSearch.addEventListener('input', () => this.filterPlayers());
        }

        const positionFilter = document.getElementById('positionFilter');
        if (positionFilter) {
            positionFilter.addEventListener('change', () => this.filterPlayers());
        }

        const clubFilter = document.getElementById('clubFilter');
        if (clubFilter) {
            clubFilter.addEventListener('change', () => this.filterPlayers());
        }

        // Sold items toggle
        const toggleSoldBtn = document.getElementById('toggleSoldBtn');
        if (toggleSoldBtn) {
            toggleSoldBtn.addEventListener('click', () => this.toggleSoldItems());
        }

        // Bid input Enter key
        const bidInput = document.getElementById('bidAmount');
        if (bidInput) {
            bidInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handlePlaceBid();
                }
            });
        }
    }

    async loadPlayers() {
        try {
            const players = await window.mobileAPI.getPlayers();
            this.players = Array.isArray(players) ? players : (players.players || []);
            this.filteredPlayers = [...this.players];
            this.renderPlayers();
            this.populateClubFilter();
        } catch (error) {
            console.error('Error loading players:', error);
            throw error;
        }
    }

    async loadClubs() {
        try {
            this.clubs = await window.mobileAPI.getClubs();
        } catch (error) {
            console.error('Error loading clubs:', error);
            throw error;
        }
    }

    async loadActiveAuctions() {
        try {
            const auctions = await window.mobileAPI.getActiveAuctions();
            console.log('Loaded active auctions:', auctions);
            if (auctions && auctions.length > 0) {
                console.log('Displaying auction:', auctions[0]);
                this.displayCurrentAuction(auctions[0]);
            } else {
                console.log('No active auctions found');
                this.clearCurrentAuction();
            }
        } catch (error) {
            console.error('Error loading active auctions:', error);
        }
    }

    async loadSoldItems() {
        try {
            this.soldItems = await window.mobileAPI.getSoldItems();
            this.renderSoldItems();
        } catch (error) {
            console.error('Error loading sold items:', error);
        }
    }

    displayCurrentAuction(auctionData) {
        console.log('📅 Mobile: Displaying auction data:', auctionData);
        console.log('📅 Mobile: Selling stage in auction data:', auctionData.selling_stage);
        
        this.currentAuction = auctionData;
        
        const auctionCard = document.getElementById('currentAuction');
        const noAuction = document.getElementById('noAuction');
        
        if (!auctionCard || !noAuction) return;

        // Show auction card, hide no auction message
        auctionCard.classList.remove('hidden');
        noAuction.classList.add('hidden');

        // Update player/club info - backend returns player_id or club_id, not nested objects
        if (auctionData.player_id || auctionData.player_name) {
            this.displayPlayerAuction(auctionData);
        } else if (auctionData.club_id || auctionData.club_name) {
            this.displayClubAuction(auctionData);
        }

        // Update bid info
        this.updateBidDisplay(auctionData);
        
        // Update controls
        this.updateControls(auctionData);
        
        // Re-render players list to disable start buttons
        this.renderPlayers();
    }

    displayPlayerAuction(auctionData) {
        console.log('Displaying player auction:', auctionData);
        
        // The backend returns player data at the top level, not nested under 'player'
        const playerName = auctionData.player_name || (auctionData.player && auctionData.player.web_name) || 'Unknown Player';
        const playerPhoto = auctionData.photo || (auctionData.player && auctionData.player.photo);
        const teamName = auctionData.team_name || (auctionData.player && auctionData.player.team_name) || '';
        const position = auctionData.position || (auctionData.player && auctionData.player.position);
        
        // Player photo
        const photoEl = document.getElementById('playerPhoto');
        if (photoEl) {
            if (playerPhoto) {
                const photoUrl = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${playerPhoto.replace('.jpg', '')}.png`;
                photoEl.innerHTML = `<img src="${photoUrl}" alt="${playerName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.parentNode.innerHTML='👤'">`;
            } else {
                photoEl.innerHTML = '👤';
            }
        }

        // Player name
        const nameEl = document.getElementById('playerName');
        if (nameEl) {
            nameEl.textContent = playerName;
        }

        // Player team and position
        const teamPosEl = document.getElementById('playerTeamPos');
        if (teamPosEl) {
            const positionName = this.getPositionName(position);
            const priceText = auctionData.now_cost ? `£${auctionData.now_cost / 10}m` : '';
            teamPosEl.textContent = `${positionName} - ${teamName} ${priceText}`.trim();
        }
    }

    displayClubAuction(auctionData) {
        console.log('Displaying club auction:', auctionData);
        
        // The backend returns club data at the top level, not nested under 'club'
        const clubName = auctionData.club_name || (auctionData.club && auctionData.club.name) || 'Unknown Club';
        const clubShortName = auctionData.club_short_name || (auctionData.club && auctionData.club.short_name) || '';
        
        // Club logo/icon
        const photoEl = document.getElementById('playerPhoto');
        if (photoEl) {
            photoEl.innerHTML = '🏟️';
        }

        // Club name
        const nameEl = document.getElementById('playerName');
        if (nameEl) {
            nameEl.textContent = clubName;
        }

        // Club details
        const teamPosEl = document.getElementById('playerTeamPos');
        if (teamPosEl) {
            teamPosEl.textContent = `Club - ${clubShortName}`;
        }
    }

    updateBidDisplay(auctionData) {
        const bidAmountEl = document.getElementById('currentBidAmount');
        const bidderEl = document.getElementById('currentBidder');
        const bidInput = document.getElementById('bidAmount');

        // Backend uses current_bid and current_bidder_name
        const currentBid = auctionData.current_bid || 0;
        const bidderName = auctionData.current_bidder_name || '-';

        if (bidAmountEl) {
            bidAmountEl.textContent = `£${currentBid}`;
        }

        if (bidderEl) {
            const isAutoBid = auctionData.is_auto_bid || auctionData.isAutoBid;
            bidderEl.textContent = isAutoBid ? `🤖 ${bidderName}` : bidderName;
        }

        if (bidInput) {
            const nextBid = currentBid + 5;
            bidInput.value = nextBid;
            bidInput.min = nextBid;
            bidInput.placeholder = `£${nextBid}`;
        }
    }

    updateControls(auctionData) {
        const currentUser = window.mobileAPI.getCurrentUser();
        const isAdmin = currentUser.is_admin;
        const sellingStage = auctionData.selling_stage;
        const waitRequested = auctionData.wait_requested_by;

        console.log('🎮 Mobile: Update controls called with:', {
            isAdmin,
            sellingStage,
            waitRequested,
            auctionId: auctionData.id
        });

        // Update selling status
        this.updateSellingStatus(sellingStage);

        // Update wait button - always show but conditionally enable
        const waitBtn = document.getElementById('waitBtn');
        if (waitBtn) {
            waitBtn.classList.remove('hidden'); // Always show the button
            
            if (waitRequested) {
                // Show who requested wait
                waitBtn.disabled = true;
                waitBtn.textContent = 'Wait...';
            } else if (sellingStage && !isAdmin) {
                // Enable during selling stages for non-admin users
                waitBtn.disabled = false;
                waitBtn.textContent = 'Wait!';
            } else if (isAdmin) {
                // Disable for admin users
                waitBtn.disabled = true;
                waitBtn.textContent = 'Wait';
            } else {
                // Disable outside selling stages but keep visible
                waitBtn.disabled = true;
                waitBtn.textContent = 'Wait';
            }
        }

        // Update admin controls
        this.updateAdminControls(auctionData);
    }

    updateSellingStatus(sellingStage) {
        const statusEl = document.getElementById('sellingStatus');
        if (statusEl) {
            if (sellingStage) {
                const statusText = sellingStage === 'selling1' ? 'SELLING 1' : 'SELLING 2';
                statusEl.textContent = statusText;
                statusEl.classList.remove('hidden');
                // Add appropriate class for styling
                statusEl.className = `selling-status ${sellingStage}`;
                console.log('Updated selling status to:', statusText);
            } else {
                statusEl.classList.add('hidden');
                statusEl.className = 'selling-status hidden';
                console.log('Hidden selling status');
            }
        } else {
            console.warn('sellingStatus element not found');
        }
    }

    updateAdminControls(auctionData) {
        const adminControls = document.getElementById('adminControls');
        const currentUser = window.mobileAPI.getCurrentUser();
        
        if (!adminControls) {
            console.warn('adminControls element not found');
            return;
        }
        
        if (!currentUser.is_admin) {
            adminControls.classList.add('hidden');
            return;
        }

        adminControls.classList.remove('hidden');
        
        const sellingStage = auctionData.selling_stage;
        const waitRequested = auctionData.wait_requested_by;

        let controlsHTML = '';

        // Wait request controls
        if (waitRequested) {
            controlsHTML += `
                <div style="background: #dbeafe; padding: 8px; border-radius: 6px; margin-bottom: 8px; text-align: center;">
                    <div style="font-size: 12px; font-weight: 600; color: #1e40af; margin-bottom: 4px;">Wait Requested</div>
                    <div style="display: flex; gap: 4px;">
                        <button onclick="mobileAuction.handleWaitResponse('accept')" 
                                style="flex: 1; background: #10b981; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                            Accept
                        </button>
                        <button onclick="mobileAuction.handleWaitResponse('reject')" 
                                style="flex: 1; background: #ef4444; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                            Reject
                        </button>
                    </div>
                </div>
            `;
        }

        // Selling stage controls
        if (!sellingStage) {
            controlsHTML += `
                <button onclick="mobileAuction.updateSellingStage('selling1')" 
                        style="background: #f59e0b; color: white; border: none; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 600; width: 100%; margin-bottom: 4px;">
                    Selling 1
                </button>
            `;
        } else if (sellingStage === 'selling1' && !waitRequested) {
            controlsHTML += `
                <button onclick="mobileAuction.updateSellingStage('selling2')" 
                        style="background: #ea580c; color: white; border: none; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 600; width: 100%; margin-bottom: 4px;">
                    Selling 2
                </button>
            `;
        } else if (sellingStage === 'selling2' && !waitRequested) {
            controlsHTML += `
                <button onclick="mobileAuction.updateSellingStage('sold')" 
                        style="background: #dc2626; color: white; border: none; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 600; width: 100%; margin-bottom: 4px;">
                    Sold
                </button>
            `;
        }

        // Always show "Sold (Skip wait)" if in any selling stage
        if (sellingStage && !waitRequested) {
            controlsHTML += `
                <button onclick="mobileAuction.updateSellingStage('sold')" 
                        style="background: #7c2d12; color: white; border: none; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 600; width: 100%;">
                    Sold (Skip wait)
                </button>
            `;
        }

        adminControls.innerHTML = controlsHTML;
    }

    clearCurrentAuction() {
        this.currentAuction = null;
        
        const auctionCard = document.getElementById('currentAuction');
        const noAuction = document.getElementById('noAuction');
        
        if (auctionCard) auctionCard.classList.add('hidden');
        if (noAuction) noAuction.classList.remove('hidden');
        
        // Re-render players list to re-enable start buttons
        this.renderPlayers();
    }

    updateCurrentBid(bidData) {
        if (this.currentAuction && this.currentAuction.id === bidData.auctionId) {
            // Update using backend format property names
            this.currentAuction.current_bid = bidData.bidAmount;
            this.currentAuction.current_bidder_name = bidData.teamName;
            this.currentAuction.is_auto_bid = bidData.isAutoBid;
            
            // Reset selling stage when new bid placed
            if (this.currentAuction.selling_stage) {
                this.currentAuction.selling_stage = null;
                this.updateSellingStatus(null);
                this.updateAdminControls(this.currentAuction);
            }
            
            this.updateBidDisplay(this.currentAuction);
        }
    }

    receiveSellingStageUpdate(data) {
        if (this.currentAuction && this.currentAuction.id === data.auctionId) {
            this.currentAuction.selling_stage = data.stage;
            this.updateControls(this.currentAuction);
        }
    }

    updateWaitRequest(data) {
        if (this.currentAuction && this.currentAuction.id === data.auctionId) {
            this.currentAuction.wait_requested_by = data.teamId;
            this.updateControls(this.currentAuction);
        }
    }

    clearWaitRequest() {
        if (this.currentAuction) {
            this.currentAuction.wait_requested_by = null;
            this.updateControls(this.currentAuction);
        }
    }

    clearSellingStage() {
        if (this.currentAuction) {
            this.currentAuction.selling_stage = null;
            this.updateControls(this.currentAuction);
        }
    }

    async handlePlaceBid() {
        if (!this.currentAuction) {
            window.mobileApp.showToast('No active auction', 'error');
            return;
        }

        const bidInput = document.getElementById('bidAmount');
        const placeBidBtn = document.getElementById('placeBidBtn');
        
        if (!bidInput || !placeBidBtn) return;

        const bidAmount = parseInt(bidInput.value);
        if (!bidAmount || bidAmount < 5) {
            window.mobileApp.showToast('Invalid bid amount', 'error');
            return;
        }

        try {
            // Show loading state
            placeBidBtn.disabled = true;
            placeBidBtn.querySelector('.btn-text').textContent = 'Placing...';
            placeBidBtn.querySelector('.btn-spinner').classList.remove('hidden');

            await window.mobileAPI.placeBid(this.currentAuction.id, bidAmount);
            
            window.mobileApp.showToast(`Bid placed: £${bidAmount}`, 'success');
        } catch (error) {
            console.error('Error placing bid:', error);
            window.mobileApp.showToast(error.message, 'error');
        } finally {
            // Reset button state
            placeBidBtn.disabled = false;
            placeBidBtn.querySelector('.btn-text').textContent = 'Place Bid';
            placeBidBtn.querySelector('.btn-spinner').classList.add('hidden');
        }
    }

    async handleWaitRequest() {
        if (!this.currentAuction) return;

        try {
            await window.mobileAPI.requestWait(this.currentAuction.id);
            window.mobileApp.showToast('Wait requested', 'info');
        } catch (error) {
            console.error('Error requesting wait:', error);
            window.mobileApp.showToast(error.message, 'error');
        }
    }

    async updateSellingStage(stage) {
        if (!this.currentAuction) return;

        try {
            await window.mobileAPI.updateSellingStage(this.currentAuction.id, stage);
            
            if (stage === 'sold') {
                window.mobileApp.showToast('Auction completed!', 'success');
                this.clearCurrentAuction();
                await this.loadSoldItems();
            }
        } catch (error) {
            console.error('Error updating selling stage:', error);
            window.mobileApp.showToast(error.message, 'error');
        }
    }

    async handleWaitResponse(action) {
        if (!this.currentAuction) return;

        try {
            await window.mobileAPI.handleWaitRequest(this.currentAuction.id, action);
            const message = action === 'accept' ? 'Wait accepted' : 'Wait rejected';
            window.mobileApp.showToast(message, 'success');
        } catch (error) {
            console.error('Error handling wait request:', error);
            window.mobileApp.showToast(error.message, 'error');
        }
    }

    // Player management
    filterPlayers() {
        const search = document.getElementById('playerSearch')?.value.toLowerCase() || '';
        const position = document.getElementById('positionFilter')?.value || '';
        const club = document.getElementById('clubFilter')?.value || '';

        this.filteredPlayers = this.players.filter(player => {
            const matchesSearch = !search || 
                (player.web_name || player.name || '').toLowerCase().includes(search);
            const playerPosition = this.getPositionName(player.position, player);
            const matchesPosition = !position || playerPosition === position;
            const matchesClub = !club || 
                (player.team_name || '') === club;

            return matchesSearch && matchesPosition && matchesClub;
        });

        this.renderPlayers();
    }

    renderPlayers() {
        const container = document.getElementById('playersList');
        if (!container) return;

        if (this.filteredPlayers.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #6b7280;">No players found</div>';
            return;
        }

        container.innerHTML = this.filteredPlayers.map(player => {
            const isSold = player.sold_to_team_id;
            const currentUser = window.mobileAPI.getCurrentUser();
            const hasActiveAuction = this.currentAuction !== null;
            const canStartAuction = !isSold && currentUser.id && !hasActiveAuction;

            const position = this.getPositionName(player.position, player);
            
            return `
                <div class="player-item ${isSold ? 'sold' : ''}">
                    <div class="player-item-info">
                        <h4>${player.web_name || player.name || 'Unknown'}</h4>
                        <p>${position} - ${player.team_name || ''}</p>
                        ${isSold ? `<p style="color: #ef4444; font-size: 11px;">Sold to ${player.sold_to_team_name || 'Unknown'}</p>` : ''}
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <span class="player-price">£${(player.now_cost || player.price || 0) / 10}m</span>
                        ${canStartAuction ? `
                            <button class="start-auction-btn" onclick="mobileAuction.startPlayerAuction(${player.id})">
                                Start
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    populateClubFilter() {
        const clubFilter = document.getElementById('clubFilter');
        if (!clubFilter) return;

        const clubs = [...new Set(this.players.map(p => p.team_name).filter(Boolean))].sort();
        
        clubFilter.innerHTML = '<option value="">All Clubs</option>' + 
            clubs.map(club => `<option value="${club}">${club}</option>`).join('');
    }

    async startPlayerAuction(playerId) {
        try {
            await window.mobileAPI.startPlayerAuction(playerId);
            window.mobileApp.showToast('Auction started!', 'success');
        } catch (error) {
            console.error('Error starting auction:', error);
            window.mobileApp.showToast(error.message, 'error');
        }
    }

    renderSoldItems() {
        const container = document.getElementById('soldItems');
        if (!container) {
            console.warn('soldItems container not found');
            return;
        }

        console.log('Rendering sold items:', this.soldItems.length, 'items');

        if (this.soldItems.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #6b7280;">No recent sales</div>';
            return;
        }

        // Show only last 10 sales
        const recentSales = this.soldItems.slice(0, 10);
        
        container.innerHTML = recentSales.map(item => `
            <div style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 14px; font-weight: 600; color: #1f2937;">
                        ${item.player_name || item.club_name || 'Unknown'}
                    </div>
                    <div style="font-size: 12px; color: #6b7280;">
                        ${item.team_name || 'Unknown Team'}
                    </div>
                </div>
                <div style="font-size: 14px; font-weight: 600; color: #10b981;">
                    £${item.price_paid || 0}m
                </div>
            </div>
        `).join('');
        
        // Auto-show sold items if there are any
        if (this.soldItems.length > 0) {
            container.classList.remove('hidden');
            const toggleBtn = document.getElementById('toggleSoldBtn');
            if (toggleBtn) {
                toggleBtn.textContent = 'Hide';
            }
        }
    }

    toggleSoldItems() {
        const container = document.getElementById('soldItems');
        const toggleBtn = document.getElementById('toggleSoldBtn');
        
        if (!container || !toggleBtn) return;

        if (container.classList.contains('hidden')) {
            container.classList.remove('hidden');
            toggleBtn.textContent = 'Hide';
        } else {
            container.classList.add('hidden');
            toggleBtn.textContent = 'Show';
        }
    }
}

// Global auction manager instance
window.mobileAuction = new MobileAuctionManager();