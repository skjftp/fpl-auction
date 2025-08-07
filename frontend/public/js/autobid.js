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
                infoDiv.className = 'text-sm font-normal mt-2';
                infoDiv.innerHTML = `
                    <div class="text-blue-600">ℹ️ Current max allowed bid: <span class="font-bold">J${response.maxAllowedBid}m</span></div>
                    <div class="text-gray-500 text-xs mt-1">This will change as you acquire players. Auto-bid will respect the current limit at bidding time.</div>
                `;
                modalHeader.parentNode.insertBefore(infoDiv, modalHeader.nextSibling);
            }
            
            // Store max allowed bid for validation
            window.currentMaxAllowedBid = response.maxAllowedBid;
            
            // Add visual indicators to input fields that exceed current max
            document.querySelectorAll('.player-max-bid').forEach(input => {
                const currentValue = parseInt(input.value) || 0;
                if (currentValue > response.maxAllowedBid) {
                    input.style.borderColor = 'orange';
                    input.title = `Currently exceeds max allowed (J${response.maxAllowedBid}m), but will be limited at bidding time`;
                } else {
                    input.style.borderColor = '';
                    input.title = `Current max allowed: J${response.maxAllowedBid}m`;
                }
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
    // First get the max allowed bid for information
    let maxAllowedBid = null;
    try {
        const response = await api.getMaxAllowedBid();
        maxAllowedBid = response.maxAllowedBid;
    } catch (error) {
        console.error('Error fetching max allowed bid:', error);
    }
    
    // Collect all player configurations
    const playerConfigs = {};
    let hasHighBids = false;
    const highBidPlayers = [];
    
    document.querySelectorAll('.player-max-bid').forEach(input => {
        const playerId = input.dataset.playerId;
        const maxBid = parseInt(input.value) || 0;
        
        if (maxBid > 0) {
            // Check if bid exceeds current max allowed (just for warning)
            if (maxAllowedBid !== null && maxBid > maxAllowedBid) {
                hasHighBids = true;
                const playerName = input.closest('.player-config-item').querySelector('.font-medium').textContent;
                highBidPlayers.push(`${playerName} (J${maxBid}m)`);
            }
            
            playerConfigs[playerId] = {
                maxBid,
                neverSecondBidder: document.querySelector(`.player-never-second[data-player-id="${playerId}"]`).checked,
                onlySellingStage: document.querySelector(`.player-only-selling[data-player-id="${playerId}"]`).checked,
                skipIfTeamHasClubPlayer: document.querySelector(`.player-skip-club[data-player-id="${playerId}"]`).checked
            };
        }
    });
    
    // Show warning if there are bids exceeding current max, but still allow saving
    if (hasHighBids && maxAllowedBid !== null) {
        showNotification(`Note: Some bids exceed current max of J${maxAllowedBid}m. Auto-bid will respect your budget limits at bidding time.`, 'warning');
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
        showNotification('Failed to save configuration', 'error');
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
    // Client-side auto-bidding is disabled since server-side handles it
    console.log('Auto-bid enabled - server will handle bidding automatically');
    
    // Don't start client-side interval anymore
    // The server-side AutoBidService handles all auto-bidding with proper budget checks
}

// Stop auto-bidding
function stopAutoBidding() {
    // Client-side auto-bidding is disabled
    console.log('Auto-bid disabled');
}

// Client-side auto-bid checking is disabled - server handles everything
// The checkAndPlaceAutoBids function is no longer used since server-side 
// AutoBidService handles all auto-bidding with proper budget enforcement

/* DEPRECATED - Server-side handles auto-bidding now
 * The entire client-side auto-bidding logic has been moved to the server
 * where it can properly enforce budget limits in real-time.
 * Server-side AutoBidService runs every 2 seconds and checks all teams'
 * auto-bid configurations, applying proper budget constraints.
 */

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoBid);
} else {
    initAutoBid();
}