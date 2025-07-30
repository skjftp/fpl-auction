// Mobile Auto-Bid Manager for FPL Auction
class MobileAutoBidManager {
    constructor() {
        this.enabled = false;
        this.config = {
            players: {},
            global: {
                neverSecondBidder: false,
                onlySellingStage: false,
                skipIfTeamHasPlayer: false
            }
        };
        this.interval = null;
        this.checkIntervalMs = 2000; // 2 seconds
    }

    async initialize() {
        try {
            await this.loadConfig();
            this.setupEventListeners();
            
            // Start auto-bidding if enabled
            if (this.enabled) {
                this.startAutoBidding();
            }
            
            console.log('Mobile auto-bid manager initialized');
        } catch (error) {
            console.error('Failed to initialize auto-bid manager:', error);
        }
    }

    setupEventListeners() {
        // Auto-bid toggle
        const toggle = document.getElementById('autoBidToggle');
        if (toggle) {
            toggle.addEventListener('change', (e) => this.handleToggleChange(e.target.checked));
        }

        // Configuration button
        const configBtn = document.getElementById('autoBidConfigBtn');
        if (configBtn) {
            configBtn.addEventListener('click', () => this.openConfigModal());
        }

        // Modal controls
        const closeBtn = document.getElementById('closeModalBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeConfigModal());
        }

        const saveBtn = document.getElementById('saveConfigBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveConfig());
        }

        const cancelBtn = document.getElementById('cancelConfigBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeConfigModal());
        }

        // Global settings
        const globalNeverSecond = document.getElementById('globalNeverSecond');
        if (globalNeverSecond) {
            globalNeverSecond.addEventListener('change', () => this.updateGlobalSettings());
        }

        const globalOnlySelling = document.getElementById('globalOnlySelling');
        if (globalOnlySelling) {
            globalOnlySelling.addEventListener('change', () => this.updateGlobalSettings());
        }

        // Player search in config
        const configSearch = document.getElementById('configPlayerSearch');
        if (configSearch) {
            configSearch.addEventListener('input', () => this.filterConfigPlayers());
        }

        const configPositionFilter = document.getElementById('configPositionFilter');
        if (configPositionFilter) {
            configPositionFilter.addEventListener('change', () => this.filterConfigPlayers());
        }
    }

    async loadConfig() {
        try {
            const config = await window.mobileAPI.getAutoBidConfig();
            if (config) {
                this.config = config;
                this.enabled = config.enabled || false;
                
                // Update UI
                const toggle = document.getElementById('autoBidToggle');
                if (toggle) {
                    toggle.checked = this.enabled;
                }
                
                this.updateAutoBidStatus();
            }
        } catch (error) {
            console.error('Error loading auto-bid config:', error);
        }
    }

    async handleToggleChange(enabled) {
        this.enabled = enabled;
        this.config.enabled = enabled;
        
        try {
            await window.mobileAPI.saveAutoBidConfig(this.config);
            
            if (enabled) {
                this.startAutoBidding();
                window.mobileApp.showToast('Auto-bidding enabled', 'success');
            } else {
                this.stopAutoBidding();
                window.mobileApp.showToast('Auto-bidding disabled', 'info');
            }
            
            this.updateAutoBidStatus();
        } catch (error) {
            console.error('Error saving auto-bid state:', error);
            window.mobileApp.showToast('Failed to save auto-bid state', 'error');
            
            // Revert toggle state
            const toggle = document.getElementById('autoBidToggle');
            if (toggle) {
                toggle.checked = !enabled;
            }
        }
    }

    updateAutoBidStatus() {
        const statusEl = document.getElementById('autoBidStatus');
        if (statusEl) {
            if (this.enabled) {
                statusEl.classList.remove('hidden');
            } else {
                statusEl.classList.add('hidden');
            }
        }
    }

    async openConfigModal() {
        const modal = document.getElementById('autoBidModal');
        if (modal) {
            modal.classList.remove('hidden');
            await this.loadPlayersForConfig();
            this.updateGlobalSettingsUI();
        }
    }

    closeConfigModal() {
        const modal = document.getElementById('autoBidModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    async loadPlayersForConfig() {
        try {
            // Use players from auction manager if available
            const players = window.mobileAuction?.players || await window.mobileAPI.getPlayers();
            const availablePlayers = players.filter(p => !p.sold_to_team_id);
            
            this.configPlayers = availablePlayers;
            this.filteredConfigPlayers = [...availablePlayers];
            this.renderConfigPlayers();
        } catch (error) {
            console.error('Error loading players for config:', error);
            window.mobileApp.showToast('Failed to load players', 'error');
        }
    }

    filterConfigPlayers() {
        const search = document.getElementById('configPlayerSearch')?.value.toLowerCase() || '';
        const position = document.getElementById('configPositionFilter')?.value || '';

        this.filteredConfigPlayers = this.configPlayers.filter(player => {
            const matchesSearch = !search || 
                (player.web_name || player.name || '').toLowerCase().includes(search);
            const matchesPosition = !position || 
                (player.position || player.element_type_name || '') === position;

            return matchesSearch && matchesPosition;
        });

        this.renderConfigPlayers();
    }

    renderConfigPlayers() {
        const container = document.getElementById('configPlayersList');
        if (!container) return;

        if (this.filteredConfigPlayers.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #6b7280;">No players found</div>';
            return;
        }

        container.innerHTML = this.filteredConfigPlayers.map(player => {
            const playerConfig = this.config.players[player.id] || {};
            
            return `
                <div class="config-player-item">
                    <div class="config-player-header">
                        <div>
                            <div class="config-player-name">${player.web_name || player.name || 'Unknown'}</div>
                            <div class="config-player-details">
                                ${player.position || player.element_type_name || ''} - ${player.team_name || ''} - ${formatCurrency(player.now_cost || player.price || 0)}
                            </div>
                        </div>
                        <input type="number" 
                               class="max-bid-input" 
                               data-player-id="${player.id}"
                               value="${playerConfig.maxBid || ''}" 
                               placeholder="Max J" 
                               min="5" 
                               step="5">
                    </div>
                    <div class="player-settings">
                        <label class="setting-checkbox">
                            <input type="checkbox" 
                                   class="player-never-second" 
                                   data-player-id="${player.id}"
                                   ${playerConfig.neverSecondBidder ? 'checked' : ''}>
                            Never 2nd bidder
                        </label>
                        <label class="setting-checkbox">
                            <input type="checkbox" 
                                   class="player-only-selling" 
                                   data-player-id="${player.id}"
                                   ${playerConfig.onlySellingStage ? 'checked' : ''}>
                            Only selling stages
                        </label>
                        <label class="setting-checkbox">
                            <input type="checkbox" 
                                   class="player-skip-club" 
                                   data-player-id="${player.id}"
                                   ${playerConfig.skipIfTeamHasClubPlayer ? 'checked' : ''}>
                            Skip if team has ${player.team_name} player
                        </label>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateGlobalSettings() {
        this.config.global.neverSecondBidder = document.getElementById('globalNeverSecond')?.checked || false;
        this.config.global.onlySellingStage = document.getElementById('globalOnlySelling')?.checked || false;
    }

    updateGlobalSettingsUI() {
        const globalNeverSecond = document.getElementById('globalNeverSecond');
        if (globalNeverSecond) {
            globalNeverSecond.checked = this.config.global.neverSecondBidder;
        }

        const globalOnlySelling = document.getElementById('globalOnlySelling');
        if (globalOnlySelling) {
            globalOnlySelling.checked = this.config.global.onlySellingStage;
        }
    }

    async saveConfig() {
        try {
            // Update global settings
            this.updateGlobalSettings();

            // Collect player configurations
            const playerConfigs = {};
            
            document.querySelectorAll('.max-bid-input').forEach(input => {
                const playerId = input.dataset.playerId;
                const maxBid = parseInt(input.value) || 0;
                
                if (maxBid > 0) {
                    const neverSecondEl = document.querySelector(`.player-never-second[data-player-id="${playerId}"]`);
                    const onlySellingEl = document.querySelector(`.player-only-selling[data-player-id="${playerId}"]`);
                    const skipClubEl = document.querySelector(`.player-skip-club[data-player-id="${playerId}"]`);
                    
                    playerConfigs[playerId] = {
                        maxBid,
                        neverSecondBidder: neverSecondEl?.checked || false,
                        onlySellingStage: onlySellingEl?.checked || false,
                        skipIfTeamHasClubPlayer: skipClubEl?.checked || false
                    };
                }
            });

            this.config.players = playerConfigs;
            this.config.enabled = this.enabled;

            await window.mobileAPI.saveAutoBidConfig(this.config);
            
            window.mobileApp.showToast('Auto-bid configuration saved', 'success');
            this.closeConfigModal();
        } catch (error) {
            console.error('Error saving config:', error);
            window.mobileApp.showToast('Failed to save configuration', 'error');
        }
    }

    startAutoBidding() {
        if (this.interval) return;
        
        console.log('Starting mobile auto-bidding');
        this.interval = setInterval(() => {
            this.checkAndPlaceAutoBids();
        }, this.checkIntervalMs);
        
        // Also check immediately
        this.checkAndPlaceAutoBids();
    }

    stopAutoBidding() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            console.log('Stopped mobile auto-bidding');
        }
    }

    async checkAndPlaceAutoBids() {
        if (!this.enabled || !window.mobileAuction?.currentAuction) {
            return;
        }

        const auction = window.mobileAuction.currentAuction;
        
        // Only auto-bid on player auctions
        if (auction.type !== 'player' || !auction.player) {
            return;
        }

        const playerId = auction.player.id || auction.player.player_id || auction.playerId || auction.player_id;
        if (!playerId) {
            return;
        }

        const playerConfig = this.config.players[playerId];
        if (!playerConfig || !playerConfig.maxBid) {
            return;
        }

        // Apply global and player-specific rules
        const config = {
            ...this.config.global,
            ...playerConfig
        };

        // Check if we should bid
        if (!this.shouldAutoBid(auction, config)) {
            return;
        }

        // Calculate next bid
        const currentBid = auction.currentBid || 0;
        const nextBid = currentBid + 5;

        // Check if within max bid limit
        if (nextBid > playerConfig.maxBid) {
            return;
        }

        // Check if we're already the highest bidder
        const currentTeam = window.mobileAPI.getCurrentUser();
        if (auction.currentBidder === currentTeam.name) {
            return;
        }

        // Place auto-bid
        try {
            await window.mobileAPI.placeBid(auction.id, nextBid, true);
            console.log(`Mobile auto-bid placed: ${formatCurrencyPlain(nextBid, false)} for player ${playerId}`);
        } catch (error) {
            console.error('Mobile auto-bid failed:', error);
        }
    }

    shouldAutoBid(auction, config) {
        // Check selling stage rule
        if (config.onlySellingStage) {
            if (auction.selling_stage !== 'selling1' && auction.selling_stage !== 'selling2') {
                return false;
            }
        }

        // Check second bidder rule
        if (config.neverSecondBidder) {
            const currentTeam = window.mobileAPI.getCurrentUser();
            
            // If current bid is still 5 (starting bid) and not from us, we would be second bidder
            if (auction.currentBid === 5 && auction.currentBidder !== currentTeam.name) {
                return false;
            }
        }

        // Check club player rule
        if (config.skipIfTeamHasClubPlayer) {
            // This would need squad data to implement properly
            // For now, skip this check in mobile version
        }

        return true;
    }

    // Cleanup on app close
    destroy() {
        this.stopAutoBidding();
    }
}

// Global auto-bid manager instance
window.mobileAutoBid = new MobileAutoBidManager();