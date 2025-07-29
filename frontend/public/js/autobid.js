// Auto-bidding functionality
let autoBidEnabled = false;
let autoBidConfig = {
    players: {}, // playerId: { maxBid, neverSecondBidder, onlySellingStage, skipIfTeamHasClubPlayer }
    global: {
        neverSecondBidder: false,
        onlySellingStage: false,
        skipIfTeamHasPlayer: false
    }
};

// Initialize auto-bid functionality
function initAutoBid() {
    // Toggle auto-bidding
    document.getElementById('autoBidToggle').addEventListener('change', (e) => {
        autoBidEnabled = e.target.checked;
        updateAutoBidStatus();
        if (autoBidEnabled) {
            loadAutoBidConfig();
            startAutoBidding();
        } else {
            stopAutoBidding();
        }
    });

    // Open configuration modal
    document.getElementById('autoBidConfigBtn').addEventListener('click', () => {
        openAutoBidModal();
    });

    // Modal controls
    document.getElementById('autoBidSaveBtn').addEventListener('click', saveAutoBidConfig);
    document.getElementById('autoBidCancelBtn').addEventListener('click', closeAutoBidModal);

    // Search and filter handlers
    document.getElementById('autoBidSearchPlayer').addEventListener('input', filterAutoBidPlayers);
    document.getElementById('autoBidFilterPosition').addEventListener('change', filterAutoBidPlayers);
    document.getElementById('autoBidFilterClub').addEventListener('change', filterAutoBidPlayers);

    // Global settings
    document.getElementById('globalNeverSecondBidder').addEventListener('change', updateGlobalSettings);
    document.getElementById('globalOnlySellingStage').addEventListener('change', updateGlobalSettings);
    document.getElementById('globalSkipIfTeamHasPlayer').addEventListener('change', updateGlobalSettings);
}

// Update visual status
function updateAutoBidStatus() {
    const statusDiv = document.getElementById('autoBidStatus');
    if (autoBidEnabled) {
        statusDiv.classList.remove('hidden');
    } else {
        statusDiv.classList.add('hidden');
    }
}

// Open auto-bid configuration modal
async function openAutoBidModal() {
    document.getElementById('autoBidModal').classList.remove('hidden');
    await loadPlayersForAutoBid();
    loadAutoBidConfig();
}

// Close modal
function closeAutoBidModal() {
    document.getElementById('autoBidModal').classList.add('hidden');
}

// Load players for auto-bid configuration
async function loadPlayersForAutoBid() {
    try {
        const players = await api.getPlayers();
        const clubs = [...new Set(players.map(p => p.team_name))].sort();
        
        // Populate club filter
        const clubFilter = document.getElementById('autoBidFilterClub');
        clubFilter.innerHTML = '<option value="">All Clubs</option>';
        clubs.forEach(club => {
            clubFilter.innerHTML += `<option value="${club}">${club}</option>`;
        });

        // Render players list
        renderAutoBidPlayersList(players);
    } catch (error) {
        console.error('Error loading players:', error);
    }
}

// Render players list in modal
function renderAutoBidPlayersList(players) {
    const container = document.getElementById('autoBidPlayersList');
    container.innerHTML = '';

    players.forEach(player => {
        const config = autoBidConfig.players[player.id] || {};
        const playerDiv = document.createElement('div');
        playerDiv.className = 'border rounded p-3 mb-2 player-config-item';
        playerDiv.dataset.playerName = player.name.toLowerCase();
        playerDiv.dataset.position = player.position;
        playerDiv.dataset.club = player.team_name;
        
        playerDiv.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <div class="font-medium">${player.name}</div>
                    <div class="text-sm text-gray-500">${player.position} - ${player.team_name} - £${player.now_cost || 0}</div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="flex items-center">
                        <label class="text-sm mr-2">Max Bid:</label>
                        <input type="number" 
                               class="w-20 px-2 py-1 border rounded player-max-bid" 
                               data-player-id="${player.id}"
                               value="${config.maxBid || ''}" 
                               placeholder="£" 
                               min="0" 
                               step="5">
                    </div>
                    <button class="text-sm bg-gray-200 px-2 py-1 rounded hover:bg-gray-300 player-settings-btn"
                            data-player-id="${player.id}">
                        Settings
                    </button>
                </div>
            </div>
            <div class="player-advanced-settings hidden mt-2 pt-2 border-t" data-player-id="${player.id}">
                <div class="space-y-1 text-sm">
                    <label class="flex items-center">
                        <input type="checkbox" class="mr-2 player-never-second" 
                               data-player-id="${player.id}"
                               ${config.neverSecondBidder ? 'checked' : ''}>
                        <span>Never be second bidder</span>
                    </label>
                    <label class="flex items-center">
                        <input type="checkbox" class="mr-2 player-only-selling" 
                               data-player-id="${player.id}"
                               ${config.onlySellingStage ? 'checked' : ''}>
                        <span>Only bid during selling stages</span>
                    </label>
                    <label class="flex items-center">
                        <input type="checkbox" class="mr-2 player-skip-club" 
                               data-player-id="${player.id}"
                               ${config.skipIfTeamHasClubPlayer ? 'checked' : ''}>
                        <span>Skip if any team has ${player.team_name} player</span>
                    </label>
                </div>
            </div>
        `;
        
        container.appendChild(playerDiv);
    });

    // Add event listeners for settings buttons
    container.querySelectorAll('.player-settings-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.dataset.playerId;
            const settingsDiv = container.querySelector(`.player-advanced-settings[data-player-id="${playerId}"]`);
            settingsDiv.classList.toggle('hidden');
        });
    });
}

// Filter players in modal
function filterAutoBidPlayers() {
    const search = document.getElementById('autoBidSearchPlayer').value.toLowerCase();
    const position = document.getElementById('autoBidFilterPosition').value;
    const club = document.getElementById('autoBidFilterClub').value;

    document.querySelectorAll('.player-config-item').forEach(item => {
        const matchesSearch = !search || item.dataset.playerName.includes(search);
        const matchesPosition = !position || item.dataset.position === position;
        const matchesClub = !club || item.dataset.club === club;

        if (matchesSearch && matchesPosition && matchesClub) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Update global settings
function updateGlobalSettings() {
    autoBidConfig.global.neverSecondBidder = document.getElementById('globalNeverSecondBidder').checked;
    autoBidConfig.global.onlySellingStage = document.getElementById('globalOnlySellingStage').checked;
    autoBidConfig.global.skipIfTeamHasPlayer = document.getElementById('globalSkipIfTeamHasPlayer').checked;
}

// Save auto-bid configuration
async function saveAutoBidConfig() {
    // Collect all player configurations
    const playerConfigs = {};
    
    document.querySelectorAll('.player-max-bid').forEach(input => {
        const playerId = input.dataset.playerId;
        const maxBid = parseInt(input.value) || 0;
        
        if (maxBid > 0) {
            playerConfigs[playerId] = {
                maxBid,
                neverSecondBidder: document.querySelector(`.player-never-second[data-player-id="${playerId}"]`).checked,
                onlySellingStage: document.querySelector(`.player-only-selling[data-player-id="${playerId}"]`).checked,
                skipIfTeamHasClubPlayer: document.querySelector(`.player-skip-club[data-player-id="${playerId}"]`).checked
            };
        }
    });

    autoBidConfig.players = playerConfigs;
    
    // Save to backend
    try {
        await api.saveAutoBidConfig(autoBidConfig);
        showNotification('Auto-bid configuration saved successfully', 'success');
        closeAutoBidModal();
    } catch (error) {
        console.error('Error saving auto-bid config:', error);
        showNotification('Failed to save configuration', 'error');
    }
}

// Load auto-bid configuration
async function loadAutoBidConfig() {
    try {
        const config = await api.getAutoBidConfig();
        if (config) {
            autoBidConfig = config;
            
            // Update global settings UI
            document.getElementById('globalNeverSecondBidder').checked = config.global.neverSecondBidder;
            document.getElementById('globalOnlySellingStage').checked = config.global.onlySellingStage;
            document.getElementById('globalSkipIfTeamHasPlayer').checked = config.global.skipIfTeamHasPlayer;
        }
    } catch (error) {
        console.error('Error loading auto-bid config:', error);
    }
}

// Auto-bidding interval
let autoBidInterval = null;

// Start auto-bidding
function startAutoBidding() {
    if (autoBidInterval) return;
    
    // Check for bidding opportunities every 2 seconds
    autoBidInterval = setInterval(() => {
        checkAndPlaceAutoBids();
    }, 2000);
}

// Stop auto-bidding
function stopAutoBidding() {
    if (autoBidInterval) {
        clearInterval(autoBidInterval);
        autoBidInterval = null;
    }
}

// Check and place auto-bids
async function checkAndPlaceAutoBids() {
    if (!autoBidEnabled || !window.currentAuction) return;

    const playerId = window.currentAuction.playerId;
    const playerConfig = autoBidConfig.players[playerId];
    
    if (!playerConfig || !playerConfig.maxBid) return;

    // Apply global and player-specific rules
    const config = {
        ...autoBidConfig.global,
        ...playerConfig
    };

    // Check if we should bid
    if (!shouldAutoBid(window.currentAuction, config)) return;

    // Calculate next bid amount
    const currentBid = window.currentAuction.currentBid || 0;
    const nextBid = currentBid + 5;

    // Check if within max bid limit
    if (nextBid > playerConfig.maxBid) return;

    // Check if we're already the highest bidder
    if (window.currentAuction.highestBidder === window.currentTeam.id) return;

    // Place bid
    try {
        await api.placeBid(window.currentAuction.id, nextBid, true);
        console.log(`Auto-bid placed: £${nextBid} for player ${playerId}`);
    } catch (error) {
        console.error('Auto-bid failed:', error);
    }
}

// Determine if we should auto-bid based on rules
function shouldAutoBid(auction, config) {
    // Check selling stage rule
    if (config.onlySellingStage) {
        if (auction.status !== 'selling1' && auction.status !== 'selling2') {
            return false;
        }
    }

    // Check second bidder rule
    if (config.neverSecondBidder) {
        const bidCount = auction.bids ? auction.bids.length : 0;
        if (bidCount === 1) {
            return false;
        }
    }

    // Check club player rule
    if (config.skipIfTeamHasClubPlayer) {
        // This would need access to all teams' squads
        // Implementation depends on available data
    }

    return true;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoBid);
} else {
    initAutoBid();
}