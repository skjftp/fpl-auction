// Auto-bidding functionality
let autoBidEnabled = false;
let autoBidConfig = {
    players: {} // playerId: { maxBid, neverSecondBidder, onlySellingStage, skipIfTeamHasClubPlayer }
};

// Initialize auto-bid functionality
function initAutoBid() {
    // Load initial state
    loadAutoBidConfig().then(() => {
        // Set toggle state from loaded config
        document.getElementById('autoBidToggle').checked = autoBidEnabled;
        updateAutoBidStatus();
        if (autoBidEnabled) {
            startAutoBidding();
        }
    });
    
    // Toggle auto-bidding
    document.getElementById('autoBidToggle').addEventListener('change', async (e) => {
        autoBidEnabled = e.target.checked;
        updateAutoBidStatus();
        
        // Save enabled state immediately
        autoBidConfig.enabled = autoBidEnabled;
        await saveAutoBidEnabledState();
        
        if (autoBidEnabled) {
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

    // Global settings removed - per-player settings only
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
    fetchAndDisplayMaxAllowedBid();
}

// Fetch and display max allowed bid
async function fetchAndDisplayMaxAllowedBid() {
    try {
        const response = await api.getMaxAllowedBid();
        if (response && response.maxAllowedBid !== undefined) {
            // Display max allowed bid in modal header
            const modalHeader = document.querySelector('#autoBidModal .text-xl.font-bold');
            if (modalHeader) {
                const existingInfo = document.getElementById('maxBidInfo');
                if (existingInfo) {
                    existingInfo.remove();
                }
                
                const infoDiv = document.createElement('div');
                infoDiv.id = 'maxBidInfo';
                infoDiv.className = 'text-sm font-normal text-red-600 mt-2';
                infoDiv.innerHTML = `⚠️ Maximum allowed bid: <span class="font-bold">J${response.maxAllowedBid}m</span> (based on your budget and remaining slots)`;
                modalHeader.parentNode.insertBefore(infoDiv, modalHeader.nextSibling);
            }
            
            // Add validation to input fields
            document.querySelectorAll('.player-max-bid').forEach(input => {
                input.max = response.maxAllowedBid;
                input.title = `Maximum allowed: J${response.maxAllowedBid}m`;
            });
        }
    } catch (error) {
        console.error('Error fetching max allowed bid:', error);
    }
}

// Close modal
function closeAutoBidModal() {
    document.getElementById('autoBidModal').classList.add('hidden');
}

// Load players for auto-bid configuration
async function loadPlayersForAutoBid() {
    try {
        const response = await api.getPlayers();
        console.log('Players response:', response); // Debug log
        
        // Handle both array and object responses
        const players = Array.isArray(response) ? response : (response.players || []);
        
        // Filter out sold players
        const availablePlayers = players.filter(p => !p.sold_to_team_id);
        
        const clubs = [...new Set(availablePlayers.map(p => p.team_name))].sort();
        
        // Populate club filter
        const clubFilter = document.getElementById('autoBidFilterClub');
        clubFilter.innerHTML = '<option value="">All Clubs</option>';
        clubs.forEach(club => {
            clubFilter.innerHTML += `<option value="${club}">${club}</option>`;
        });

        // Render players list
        renderAutoBidPlayersList(availablePlayers);
    } catch (error) {
        console.error('Error loading players:', error);
        showNotification('Failed to load players', 'error');
    }
}

// Render players list in modal
function renderAutoBidPlayersList(players) {
    const container = document.getElementById('autoBidPlayersList');
    container.innerHTML = '';
    
    if (!players || players.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-gray-500">No players available</div>';
        return;
    }

    players.forEach(player => {
        const config = autoBidConfig.players[player.id] || {};
        const playerDiv = document.createElement('div');
        playerDiv.className = 'border rounded p-3 mb-2 player-config-item';
        
        // Use web_name as the display name (this is the standard FPL field)
        const displayName = player.web_name || player.name || 'Unknown';
        playerDiv.dataset.playerName = displayName.toLowerCase();
        playerDiv.dataset.position = player.position || player.element_type_name || '';
        playerDiv.dataset.club = player.team_name || '';
        
        playerDiv.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <div class="font-medium">${displayName}</div>
                    <div class="text-sm text-gray-500">${player.position || player.element_type_name || ''} - ${player.team_name || ''} - ${formatCurrency(player.now_cost || player.price || 0, false)}</div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="flex items-center">
                        <label class="text-sm mr-2">Max Bid:</label>
                        <input type="number" 
                               class="w-20 px-2 py-1 border rounded player-max-bid" 
                               data-player-id="${player.id}"
                               value="${config.maxBid || ''}" 
                               placeholder="J" 
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

// Global settings removed - using per-player settings only

// Save auto-bid configuration
async function saveAutoBidConfig() {
    // First get the max allowed bid for validation
    let maxAllowedBid = null;
    try {
        const response = await api.getMaxAllowedBid();
        maxAllowedBid = response.maxAllowedBid;
    } catch (error) {
        console.error('Error fetching max allowed bid:', error);
    }
    
    // Collect all player configurations
    const playerConfigs = {};
    let hasInvalidBids = false;
    const invalidPlayers = [];
    
    document.querySelectorAll('.player-max-bid').forEach(input => {
        const playerId = input.dataset.playerId;
        const maxBid = parseInt(input.value) || 0;
        
        if (maxBid > 0) {
            // Check if bid exceeds max allowed
            if (maxAllowedBid !== null && maxBid > maxAllowedBid) {
                hasInvalidBids = true;
                const playerName = input.closest('.player-config-item').querySelector('.font-medium').textContent;
                invalidPlayers.push(`${playerName}: J${maxBid}m`);
            }
            
            playerConfigs[playerId] = {
                maxBid,
                neverSecondBidder: document.querySelector(`.player-never-second[data-player-id="${playerId}"]`).checked,
                onlySellingStage: document.querySelector(`.player-only-selling[data-player-id="${playerId}"]`).checked,
                skipIfTeamHasClubPlayer: document.querySelector(`.player-skip-club[data-player-id="${playerId}"]`).checked
            };
        }
    });
    
    // Show error if there are invalid bids
    if (hasInvalidBids && maxAllowedBid !== null) {
        showNotification(`Auto-bid amounts exceed maximum allowed bid of J${maxAllowedBid}m. Please adjust: ${invalidPlayers.join(', ')}`, 'error');
        return;
    }

    autoBidConfig.players = playerConfigs;
    
    // Ensure enabled state is included
    autoBidConfig.enabled = autoBidEnabled;
    
    // Save to backend
    try {
        await api.saveAutoBidConfig(autoBidConfig);
        showNotification('Auto-bid configuration saved successfully', 'success');
        closeAutoBidModal();
    } catch (error) {
        console.error('Error saving auto-bid config:', error);
        if (error.response && error.response.data && error.response.data.maxAllowedBid) {
            showNotification(`${error.response.data.error}`, 'error');
        } else {
            showNotification('Failed to save configuration', 'error');
        }
    }
}

// Load auto-bid configuration
async function loadAutoBidConfig() {
    try {
        const config = await api.getAutoBidConfig();
        if (config) {
            autoBidConfig = config;
            
            // Set enabled state
            autoBidEnabled = config.enabled || false;
            
            // Global settings removed - no UI updates needed
        }
    } catch (error) {
        console.error('Error loading auto-bid config:', error);
    }
}

// Save just the enabled state
async function saveAutoBidEnabledState() {
    try {
        await api.saveAutoBidConfig(autoBidConfig);
        console.log('Auto-bid enabled state saved');
    } catch (error) {
        console.error('Error saving auto-bid enabled state:', error);
        showNotification('Failed to save auto-bid state', 'error');
    }
}

// Auto-bidding interval
let autoBidInterval = null;

// Start auto-bidding
function startAutoBidding() {
    if (autoBidInterval) return;
    
    console.log('Starting auto-bid interval');
    
    // Check for bidding opportunities every 2 seconds
    autoBidInterval = setInterval(() => {
        checkAndPlaceAutoBids();
    }, 2000);
    
    // Also check immediately
    checkAndPlaceAutoBids();
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
    console.log('Checking auto-bid:', {
        enabled: autoBidEnabled,
        hasAuctionManager: !!window.auctionManager,
        hasCurrentAuction: !!(window.auctionManager && window.auctionManager.currentAuction)
    });
    
    if (!autoBidEnabled || !window.auctionManager || !window.auctionManager.currentAuction) return;

    const auction = window.auctionManager.currentAuction;
    
    // Only auto-bid on player auctions, not clubs
    if (auction.type !== 'player' || !auction.player) return;
    
    console.log('Current auction:', auction);
    console.log('Player object:', auction.player);
    
    // Try to get player ID from different possible locations
    const playerId = auction.player.id || auction.player.player_id || auction.playerId || auction.player_id;
    
    console.log('Player ID:', playerId);
    console.log('Auto-bid config:', autoBidConfig);
    
    if (!playerId) {
        console.log('No player ID found in auction data');
        return;
    }
    
    const playerConfig = autoBidConfig.players[playerId];
    console.log('Player config for ID', playerId, ':', playerConfig);
    
    if (!playerConfig || !playerConfig.maxBid) {
        console.log('No config or max bid for this player');
        return;
    }

    // Use player-specific rules only
    const config = playerConfig;

    // Check if we should bid
    if (!shouldAutoBid(auction, config)) {
        console.log('Should not auto-bid based on rules');
        return;
    }

    // Calculate next bid amount
    const currentBid = auction.currentBid || 0;
    const nextBid = currentBid + 5;

    console.log('Current bid:', currentBid, 'Next bid would be:', nextBid, 'Max bid:', playerConfig.maxBid);

    // Check if within max bid limit
    if (nextBid > playerConfig.maxBid) {
        console.log('Next bid exceeds max bid limit');
        return;
    }

    // Get current team info
    const currentTeam = JSON.parse(localStorage.getItem('fpl_team') || '{}');
    
    // Check if we're already the highest bidder
    if (auction.currentBidder === currentTeam.name) {
        console.log('Already the highest bidder');
        return;
    }

    // Place bid
    try {
        await api.placeBid(auction.id, nextBid, true);
        console.log(`Auto-bid placed: ${formatCurrencyPlain(nextBid, false)} for player ${playerId}`);
    } catch (error) {
        console.error('Auto-bid failed:', error);
    }
}

// Determine if we should auto-bid based on rules
function shouldAutoBid(auction, config) {
    // Check selling stage rule
    if (config.onlySellingStage) {
        if (auction.status !== 'selling1' && auction.status !== 'selling2' && 
            auction.selling_stage !== 'selling1' && auction.selling_stage !== 'selling2') {
            console.log('Not bidding: Only selling stage is enabled but auction is in', auction.status || 'active', 'status');
            return false;
        }
    }

    // Check second bidder rule
    if (config.neverSecondBidder) {
        // Check if we would be the second unique bidder
        // The auction starter is the first bidder, if current bidder is different, there are already 2 bidders
        
        // Get current team info
        const currentTeam = JSON.parse(localStorage.getItem('fpl_team') || '{}');
        
        // If auction was started by someone else and no one else has bid yet
        // (current bid is still from the starter), we would be the second bidder
        if (auction.currentBid === 5 && auction.currentBidder !== currentTeam.name) {
            console.log('Not bidding: Never second bidder is enabled and we would be the second bidder');
            return false;
        }
        
        // Log for debugging
        console.log('Second bidder check passed - current bid:', auction.currentBid, 'by', auction.currentBidder);
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