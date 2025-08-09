// Mobile Submit Team Manager V2 - FPL Style
class MobileSubmitTeamManagerV2 {
    constructor() {
        this.initialized = false; // Track initialization
        this.loading = false; // Track loading state - start as false
        this.mySquad = [];
        this.starting11 = [];
        this.bench = [];
        this.captainId = null;
        this.viceCaptainId = null;
        this.clubMultiplierId = null;
        this.selectedChip = null;
        this.currentGameweek = null;
        this.deadline = null;
        this.deadlineTimer = null;
        this.formationValid = false;
        this.myClubs = [];
        this.viewMode = 'pitch'; // 'pitch' or 'list'
        this.editMode = false; // Track edit mode
        
        // Store original state for cancel
        this.originalStarting11 = [];
        this.originalBench = [];
        this.hasChanges = false;
        
        // Position requirements
        this.positionLimits = {
            1: { min: 1, max: 1, name: 'GKP' },
            2: { min: 3, max: 5, name: 'DEF' },
            3: { min: 2, max: 5, name: 'MID' },
            4: { min: 1, max: 3, name: 'FWD' }
        };

        // Chips configuration (FPL Auction custom chips)
        this.chips = {
            'triple_captain': {
                name: 'Triple Captain',
                short: 'TC',
                description: '3x points for Captain',
                icon: '👑'
            },
            'attack_chip': {
                name: 'Attack Chip',
                short: 'ATK',
                description: '2x for MID & FWD in playing 11',
                icon: '⚔️'
            },
            'negative_chip': {
                name: 'Negative Chip',
                short: 'NC',
                description: 'Points divided by 2',
                icon: '➗'
            },
            'double_up': {
                name: 'Double Up',
                short: 'DU',
                description: 'Points multiplied by 2',
                icon: '✖️'
            },
            'bench_boost': {
                name: 'Bench Boost',
                short: 'BB',
                description: 'All 15 players count',
                icon: '💪'
            },
            'park_the_bus': {
                name: 'Park the Bus',
                short: 'PB',
                description: '2x for GKP & DEF',
                icon: '🚌'
            },
            'brahmasthra': {
                name: 'Brahmasthra',
                short: 'BRM',
                description: 'Auto-picks best 11',
                icon: '🔱'
            }
        };
    }

    initialize() {
        console.log('Submit Team initialize called');
        
        // If already initialized, just re-render
        if (this.initialized) {
            this.renderHeader();
            this.renderView();
            return;
        }
        
        // IMMEDIATELY mark as initialized and render
        this.initialized = true;
        
        // Get cached squad if available
        let cached = false;
        let currentUser = null;
        let cacheKey = null;
        
        try {
            currentUser = window.mobileAPI.getCurrentUser();
            cacheKey = `fpl_squad_cache_${currentUser.id}`;
            const cachedData = localStorage.getItem(cacheKey);
            
            if (cachedData) {
                const data = JSON.parse(cachedData);
                this.mySquad = data.players || [];
                this.myClubs = data.clubs || [];
                cached = true;
            }
        } catch (e) {
            console.log('Cache read failed:', e);
        }
        
        // Set defaults
        this.currentGameweek = 1;
        this.deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        // Auto-select if needed
        if (this.starting11.length === 0 && this.mySquad.length >= 15) {
            this.autoSelectTeam();
        }
        
        // Render NOW
        this.renderHeader();
        this.renderView();
        this.setupEventListeners();
        
        // If no cache, fetch in background (don't block)
        if (!cached && currentUser) {
            window.mobileAPI.getTeamSquad(currentUser.id).then(squadData => {
                this.mySquad = squadData.players || [];
                this.myClubs = squadData.clubs || [];
                localStorage.setItem(cacheKey, JSON.stringify({
                    players: this.mySquad,
                    clubs: this.myClubs,
                    timestamp: Date.now()
                }));
                if (this.starting11.length === 0 && this.mySquad.length >= 15) {
                    this.autoSelectTeam();
                }
                this.renderView();
            }).catch(() => {
                // Ignore errors - just show empty
            });
        }
        
        // Load existing submission for this gameweek
        window.mobileAPI.getTeamSubmission(this.currentGameweek || 1).then(submission => {
            if (submission) {
                console.log('Found existing submission:', submission);
                this.existingSubmission = submission;
                // Apply the submission to current state
                if (submission.starting_11) this.starting11 = submission.starting_11;
                if (submission.bench) this.bench = submission.bench;
                if (submission.captain_id) this.captainId = submission.captain_id;
                if (submission.vice_captain_id) this.viceCaptainId = submission.vice_captain_id;
                if (submission.club_multiplier_id) this.clubMultiplierId = submission.club_multiplier_id;
                if (submission.chip_used) this.selectedChip = submission.chip_used;
                
                this.renderHeader();
                this.renderView();
            }
        }).catch((error) => {
            // No existing submission - that's ok, user hasn't submitted yet
            console.log('No existing submission for gameweek', this.currentGameweek || 1);
        });
        
        // Load chip status
        window.mobileAPI.getChipStatus().then(chipStatus => {
            this.chipStatus = chipStatus;
            this.renderHeader();
        }).catch(() => {
            // Ignore errors
        });
    }
    
    showLoader() {
        // Not needed anymore - we render immediately
    }
    
    showError(message) {
        const container = document.getElementById('submitTeamContent');
        if (container) {
            container.innerHTML = `
                <div class="error-container">
                    <p class="error-text">${message}</p>
                    <button onclick="mobileSubmitTeam.forceRenderEmpty()" class="retry-btn">Show Empty Team</button>
                </div>
            `;
        }
        window.mobileApp.showToast(message, 'error');
    }
    
    // Force render with empty data to get out of stuck state
    forceRenderEmpty() {
        console.log('Force rendering with empty data...');
        this.loading = false;
        this.initialized = true;
        this.mySquad = [];
        this.myClubs = [];
        this.starting11 = [];
        this.bench = [];
        this.renderHeader();
        this.renderView();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // View toggle
        const pitchBtn = document.getElementById('pitchViewBtn');
        const listBtn = document.getElementById('listViewBtn');
        
        if (pitchBtn) {
            pitchBtn.addEventListener('click', () => this.switchView('pitch'));
        }
        if (listBtn) {
            listBtn.addEventListener('click', () => this.switchView('list'));
        }

        if (this.editMode) {
            // Edit mode buttons
            const saveBtn = document.getElementById('saveEditBtn');
            const cancelEditBtn = document.getElementById('cancelEditBtn');
            
            console.log('Setting up edit mode buttons:', { saveBtn, cancelEditBtn });
            
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    if (!saveBtn.classList.contains('disabled')) {
                        this.saveEdit();
                    }
                });
            }
            if (cancelEditBtn) {
                cancelEditBtn.addEventListener('click', () => this.cancelEdit());
            }
        } else {
            // Normal mode buttons
            const editBtn = document.getElementById('editTeamBtn');
            const cancelBtn = document.getElementById('cancelTeamBtn');
            const confirmBtn = document.getElementById('confirmTeamBtn');
            
            console.log('Setting up normal mode buttons:', { editBtn, cancelBtn, confirmBtn });
            
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    console.log('Edit button clicked');
                    this.toggleEditMode();
                });
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    window.mobileApp.switchTab('team');
                });
            }
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => this.submitTeam());
            }
        }
    }

    toggleEditMode() {
        this.editMode = !this.editMode;
        
        if (this.editMode) {
            // Entering edit mode
            window.mobileApp.showToast('Edit mode: Make changes and click Submit to save', 'info');
        } else {
            // Exiting edit mode
            window.mobileApp.showToast('Edit mode closed', 'info');
        }
        
        this.renderHeader();
        this.renderView();
    }
    
    saveEdit() {
        // Save the current state
        this.hasChanges = false;
        this.editMode = false;
        this.renderHeader();
        this.renderView();
        this.setupEventListeners();
        window.mobileApp.showToast('Team changes saved', 'success');
    }
    
    cancelEdit() {
        // Restore original state
        this.starting11 = [...this.originalStarting11];
        this.bench = [...this.originalBench];
        this.hasChanges = false;
        this.editMode = false;
        this.renderHeader();
        this.renderView();
        this.setupEventListeners();
        window.mobileApp.showToast('Changes cancelled', 'info');
    }

    renderHeader() {
        const headerContainer = document.getElementById('submitTeamHeader');
        if (!headerContainer) return;

        headerContainer.innerHTML = `
            <div class="submit-header-compact">
                <div class="gameweek-row">
                    <div class="gameweek-info">
                        <span class="gw-label">Gameweek ${this.currentGameweek || 1}</span>
                        <span class="deadline-label">Deadline: <span id="deadlineTime">${this.getDeadlineDisplay()}</span></span>
                    </div>
                    <button id="editModeBtn" class="edit-mode-btn ${this.editMode ? 'active' : ''}" title="Edit Team">
                        ${this.editMode ? '✕' : '✏️'}
                    </button>
                </div>
                
                ${this.editMode ? `
                    <div class="edit-controls">
                        <div class="club-selector-row">
                            ${this.renderClubSelector()}
                        </div>
                        
                        <div class="chips-row">
                            ${this.renderChipsButtons()}
                        </div>
                    </div>
                ` : ''}
                
                <div class="submit-section">
                    <button id="confirmTeamBtn" class="confirm-team-btn" ${!this.formationValid || !this.captainId || !this.clubMultiplierId ? 'disabled' : ''}>
                        ${this.existingSubmission ? 'Update Team' : 'Submit Team'}
                    </button>
                    ${this.existingSubmission && this.existingSubmission.chip_used ? `
                        <div class="submission-info">
                            <small>Chip used: ${this.chips[this.existingSubmission.chip_used]?.name || this.existingSubmission.chip_used}</small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Re-setup event listeners after rendering new buttons
        this.setupHeaderEventListeners();
    }
    
    setupHeaderEventListeners() {
        // Edit mode toggle button
        const editModeBtn = document.getElementById('editModeBtn');
        if (editModeBtn) {
            editModeBtn.onclick = () => {
                console.log('Edit mode button clicked');
                this.toggleEditMode();
            };
        }
        
        // Submit button
        const confirmBtn = document.getElementById('confirmTeamBtn');
        if (confirmBtn) {
            confirmBtn.onclick = () => this.submitTeam();
        }
    }

    renderClubSelector() {
        if (!this.myClubs || this.myClubs.length === 0) {
            return '<div class="no-clubs">No clubs owned</div>';
        }
        
        return this.myClubs.map(club => `
            <button class="club-select-btn ${this.clubMultiplierId === club.id ? 'selected' : ''}" 
                    onclick="mobileSubmitTeam.selectClubMultiplier(${club.id})">
                <span class="club-icon">🏟️</span>
                <span class="club-name">${club.name || club.club_name || 'Unknown'}</span>
                ${this.clubMultiplierId === club.id ? '<span class="club-badge">1.5x</span>' : ''}
            </button>
        `).join('');
    }
    
    selectClubMultiplier(clubId) {
        this.clubMultiplierId = this.clubMultiplierId === clubId ? null : clubId;
        this.renderHeader();
        this.validateFormation();
    }
    
    renderChipsButtons() {
        return Object.entries(this.chips).map(([chipId, chip]) => {
            const isSelected = this.selectedChip === chipId;
            const chipStatus = this.chipStatus?.find(cs => cs.id === chipId);
            const isUsed = chipStatus?.used;
            
            return `
                <div class="chip-button ${isSelected ? 'selected' : ''} ${isUsed ? 'used' : ''}">
                    <div class="chip-icon">${chip.icon}</div>
                    <div class="chip-name">${chip.short}</div>
                    ${!isUsed ? 
                        `<button onclick="mobileSubmitTeam.toggleChip('${chipId}')" class="chip-play-btn">
                            ${isSelected ? '✕' : '+'}
                        </button>` : 
                        `<div class="chip-status">Used</div>`
                    }
                </div>
            `;
        }).join('');
    }

    switchView(mode) {
        this.viewMode = mode;
        this.renderHeader();
        this.renderView();
    }

    renderView() {
        const container = document.getElementById('submitTeamContent');
        if (!container) return;

        // Always render pitch view
        this.renderPitchView(container);
    }

    renderPitchView(container) {
        // Group players by position
        const positions = { 1: [], 2: [], 3: [], 4: [] };
        this.starting11.forEach(playerId => {
            const player = this.mySquad.find(p => p.id === playerId);
            if (player) {
                const pos = player.position || player.element_type;
                positions[pos].push(player);
            }
        });

        container.innerHTML = `
            <div class="pitch-view">
                <div class="pitch-container">
                    <div class="pitch-gradient">
                        <!-- Forwards -->
                        <div class="pitch-row forwards">
                            ${this.renderPitchRow(positions[4], 4)}
                        </div>
                        
                        <!-- Midfielders -->
                        <div class="pitch-row midfielders">
                            ${this.renderPitchRow(positions[3], 3)}
                        </div>
                        
                        <!-- Defenders -->
                        <div class="pitch-row defenders">
                            ${this.renderPitchRow(positions[2], 2)}
                        </div>
                        
                        <!-- Goalkeeper -->
                        <div class="pitch-row goalkeeper">
                            ${this.renderPitchRow(positions[1], 1)}
                        </div>
                    </div>
                </div>
                
                <div class="bench-section">
                    <div class="bench-label">BENCH</div>
                    <div class="bench-players">
                        ${this.renderBenchPlayers()}
                    </div>
                </div>
            </div>
            
            ${this.renderSubstitutionModal()}
        `;
    }

    renderListView(container) {
        // List view shows all players in a simple list format
        container.innerHTML = `
            <div class="list-view">
                <div class="list-section">
                    <h3 class="list-title">Starting 11</h3>
                    <div class="list-players">
                        ${this.starting11.map(playerId => {
                            const player = this.mySquad.find(p => p.id === playerId);
                            if (!player) return '';
                            return this.renderListPlayer(player, true);
                        }).join('')}
                    </div>
                </div>
                
                <div class="list-section">
                    <h3 class="list-title">Bench</h3>
                    <div class="list-players">
                        ${this.bench.map(playerId => {
                            const player = this.mySquad.find(p => p.id === playerId);
                            if (!player) return '';
                            return this.renderListPlayer(player, false);
                        }).join('')}
                    </div>
                </div>
            </div>
            
            ${this.renderSubstitutionModal()}
        `;
    }

    renderListPlayer(player, isStarting) {
        const isCaptain = player.id === this.captainId;
        const isViceCaptain = player.id === this.viceCaptainId;
        const positionName = this.positionLimits[player.position || player.element_type]?.name || '';
        
        return `
            <div class="list-player-card player-card" data-player-id="${player.id}">
                <div class="list-player-photo">
                    <img src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.photo?.replace('.jpg', '') || '0'}.png" 
                         onerror="this.style.display='none'" alt="">
                </div>
                <div class="list-player-info">
                    <div class="list-player-name">
                        ${player.web_name || player.name}
                        ${isCaptain ? '<span class="captain-tag">C</span>' : ''}
                        ${isViceCaptain ? '<span class="vice-tag">V</span>' : ''}
                    </div>
                    <div class="list-player-details">
                        ${positionName} • ${player.team_short_name || ''}
                    </div>
                </div>
                <div class="list-player-actions">
                    ${isStarting ? `
                        <button class="list-captain-btn ${isCaptain ? 'active' : ''}" 
                                onclick="mobileSubmitTeam.toggleCaptain(${player.id})">C</button>
                        <button class="list-vice-btn ${isViceCaptain ? 'active' : ''}" 
                                onclick="mobileSubmitTeam.toggleViceCaptain(${player.id})">V</button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderPitchRow(players, positionId) {
        return players.map(player => this.renderPlayerCard(player, true)).join('');
    }

    renderPlayerCard(player, isStarting = true) {
        const isCaptain = player.id === this.captainId;
        const isViceCaptain = player.id === this.viceCaptainId;
        
        return `
            <div class="player-card ${isStarting ? 'pitch-player' : 'bench-player'}" 
                 data-player-id="${player.id}">
                ${this.editMode && isStarting ? `
                    <button class="remove-player-btn" onclick="mobileSubmitTeam.removePlayer(${player.id})">
                        ✕
                    </button>
                ` : ''}
                <div class="player-shirt">
                    <img src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.photo?.replace('.jpg', '') || '0'}.png" 
                         onerror="this.style.display='none'" alt="">
                    ${!this.editMode && isCaptain ? '<div class="captain-badge">C</div>' : ''}
                    ${!this.editMode && isViceCaptain ? '<div class="vice-badge">V</div>' : ''}
                </div>
                <div class="player-info">
                    <div class="player-name">${player.web_name || player.name}</div>
                    <div class="player-team">${player.team_short_name || ''}</div>
                </div>
                ${!this.editMode && isStarting ? `
                    <div class="player-actions">
                        <button class="captain-toggle" onclick="mobileSubmitTeam.toggleCaptain(${player.id})">
                            ${isCaptain ? '©' : 'C'}
                        </button>
                        <button class="vice-toggle" onclick="mobileSubmitTeam.toggleViceCaptain(${player.id})">
                            ${isViceCaptain ? 'Ⓥ' : 'V'}
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderBenchPlayers() {
        return this.bench.map(playerId => {
            const player = this.mySquad.find(p => p.id === playerId);
            return player ? this.renderPlayerCard(player, false) : '';
        }).join('');
    }

    renderSubstitutionModal() {
        return `
            <div id="substitutionModal" class="substitution-modal hidden">
                <div class="modal-overlay" onclick="mobileSubmitTeam.cancelSubstitution()"></div>
                <div class="modal-content">
                    <h3>Select Substitute</h3>
                    <div id="substituteOptions" class="substitute-list"></div>
                    <button onclick="mobileSubmitTeam.cancelSubstitution()" class="cancel-sub-btn">Cancel</button>
                </div>
            </div>
        `;
    }

    removePlayer(playerId) {
        const player = this.mySquad.find(p => p.id === playerId);
        if (!player) return;
        
        // Only show bench players that can replace without breaking formation
        this.showSubstitutionOptions(player, 'remove');
    }

    showSubstitutionOptions(player, mode) {
        const modal = document.getElementById('substitutionModal');
        const optionsContainer = document.getElementById('substituteOptions');
        
        if (!modal || !optionsContainer) return;
        
        // Get valid substitutes based on mode
        const validSubs = mode === 'remove' 
            ? this.getBenchSubstitutes(player)
            : this.getStartingSubstitutes(player);
        
        const title = mode === 'remove' 
            ? `Replace ${player.web_name || player.name} with:`
            : `Add ${player.web_name || player.name} for:`;
        
        const playerPosition = player.position || player.element_type;
        const positionName = this.positionLimits[playerPosition]?.name || 'Unknown';
        
        modal.innerHTML = `
            <div class="modal-overlay" onclick="mobileSubmitTeam.cancelSubstitution()"></div>
            <div class="modal-content">
                <h3>${title}</h3>
                <div class="player-position-info">Position: ${positionName}</div>
                <div id="substituteOptions" class="substitute-list">
                    ${validSubs.length > 0 ? validSubs.map(sub => `
                        <div class="substitute-option" onclick="mobileSubmitTeam.performSwap(${player.id}, ${sub.id})">
                            <div class="sub-player-info">
                                <img src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${sub.photo?.replace('.jpg', '') || '0'}.png" 
                                     class="sub-player-img" onerror="this.style.display='none'">
                                <div>
                                    <div class="sub-player-name">${sub.web_name || sub.name}</div>
                                    <div class="sub-player-team">${sub.team_short_name || ''}</div>
                                </div>
                            </div>
                            <div class="swap-icon">⇄</div>
                        </div>
                    `).join('') : `
                        <div class="no-substitutes-message">
                            <p>No valid substitutes available.</p>
                            <p class="text-sm">Formation rules: 1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD</p>
                        </div>
                    `}
                </div>
                <button onclick="mobileSubmitTeam.cancelSubstitution()" class="cancel-sub-btn">Cancel</button>
            </div>
        `;
        
        modal.classList.remove('hidden');
    }

    getBenchSubstitutes(player) {
        const playerPosition = player.position || player.element_type;
        // Get bench players that can replace this starting player
        const validSubs = this.bench.map(id => this.mySquad.find(p => p.id === id))
            .filter(p => {
                if (!p) return false;
                const benchPos = p.position || p.element_type;
                return this.canSwapPositions(playerPosition, benchPos);
            });
            
        // If no valid substitutes, show message
        if (validSubs.length === 0) {
            console.log(`No valid substitutes for ${player.web_name || player.name} (${this.positionLimits[playerPosition]?.name})`);
        }
        
        return validSubs;
    }
    
    getStartingSubstitutes(player) {
        const playerPosition = player.position || player.element_type;
        // Get starting 11 players that can be replaced by this bench player
        return this.starting11.map(id => this.mySquad.find(p => p.id === id))
            .filter(p => p && this.canSwapPositions(playerPosition, p.position || p.element_type));
    }

    canSwapPositions(pos1, pos2) {
        // Same position always valid
        if (pos1 === pos2) return true;
        
        // Goalkeepers can only swap with goalkeepers
        if (pos1 === 1 || pos2 === 1) {
            return pos1 === pos2;
        }
        
        // Check if swap maintains valid formation
        return this.isValidFormationAfterSwap(pos1, pos2);
    }

    isValidFormationAfterSwap(pos1, pos2) {
        // Simulate the swap and check if formation is valid
        const tempStarting11 = [...this.starting11];
        const tempBench = [...this.bench];
        
        // Count current positions in starting 11
        const positionCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        
        tempStarting11.forEach(playerId => {
            const player = this.mySquad.find(p => p.id === playerId);
            if (player) {
                const pos = player.position || player.element_type;
                positionCounts[pos]++;
            }
        });
        
        // Adjust counts for the swap
        positionCounts[pos1]--;
        positionCounts[pos2]++;
        
        // Check FPL formation rules
        const validFormation = 
            positionCounts[1] === 1 && // Exactly 1 GKP
            positionCounts[2] >= 3 && positionCounts[2] <= 5 && // 3-5 DEF
            positionCounts[3] >= 2 && positionCounts[3] <= 5 && // 2-5 MID
            positionCounts[4] >= 1 && positionCounts[4] <= 3 && // 1-3 FWD
            (positionCounts[1] + positionCounts[2] + positionCounts[3] + positionCounts[4]) === 11;
            
        return validFormation;
    }

    performSwap(player1Id, player2Id) {
        const player1InStarting = this.starting11.includes(player1Id);
        const player2InStarting = this.starting11.includes(player2Id);
        
        if (player1InStarting && !player2InStarting) {
            // Swap starting with bench
            const index1 = this.starting11.indexOf(player1Id);
            const index2 = this.bench.indexOf(player2Id);
            
            if (index1 !== -1 && index2 !== -1) {
                this.starting11[index1] = player2Id;
                this.bench[index2] = player1Id;
                this.hasChanges = true;
            }
        } else if (!player1InStarting && player2InStarting) {
            // Swap bench with starting
            const index1 = this.bench.indexOf(player1Id);
            const index2 = this.starting11.indexOf(player2Id);
            
            if (index1 !== -1 && index2 !== -1) {
                this.bench[index1] = player2Id;
                this.starting11[index2] = player1Id;
                this.hasChanges = true;
            }
        } else if (player1InStarting && player2InStarting) {
            // Swap within starting 11
            const index1 = this.starting11.indexOf(player1Id);
            const index2 = this.starting11.indexOf(player2Id);
            
            if (index1 !== -1 && index2 !== -1) {
                [this.starting11[index1], this.starting11[index2]] = [this.starting11[index2], this.starting11[index1]];
                this.hasChanges = true;
            }
        }
        
        // Clear selection
        this.cancelSubstitution();
        
        // Re-render to update Save button state
        this.renderHeader();
        this.renderViewWithAnimation();
        this.setupEventListeners();
        
        // Validate formation
        this.validateFormation();
    }

    renderViewWithAnimation() {
        // Add swap animation class
        const container = document.getElementById('submitTeamContent');
        if (container) {
            container.classList.add('swapping');
            this.renderView();
            setTimeout(() => {
                container.classList.remove('swapping');
            }, 300);
        }
    }

    cancelSubstitution() {
        // Hide modal
        const modal = document.getElementById('substitutionModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    toggleChip(chipId) {
        if (this.selectedChip === chipId) {
            this.selectedChip = null;
        } else {
            this.selectedChip = chipId;
        }
        this.renderHeader();
    }

    toggleCaptain(playerId) {
        if (this.captainId === playerId) {
            this.captainId = null;
        } else {
            this.captainId = playerId;
            // Remove vice captain if same
            if (this.viceCaptainId === playerId) {
                this.viceCaptainId = null;
            }
        }
        this.renderView();
    }
    
    toggleViceCaptain(playerId) {
        if (this.viceCaptainId === playerId) {
            this.viceCaptainId = null;
        } else {
            this.viceCaptainId = playerId;
            // Remove captain if same
            if (this.captainId === playerId) {
                this.captainId = null;
            }
        }
        this.renderView();
    }

    async loadMySquad() {
        const startTime = performance.now();
        try {
            const currentUser = window.mobileAPI.getCurrentUser();
            if (!currentUser || !currentUser.id) {
                console.error('No user found');
                return;
            }
            
            const cacheKey = `fpl_squad_cache_${currentUser.id}`;
            const cached = localStorage.getItem(cacheKey);
            
            // Always use cache first if available (instant load)
            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    this.mySquad = data.players || [];
                    this.myClubs = data.clubs || [];
                    
                    // Squad loaded from cache instantly
                    
                    // Initialize with default formation if no existing submission
                    if (this.starting11.length === 0 && this.mySquad.length >= 15) {
                        this.autoSelectTeam();
                    }
                    
                    // Refresh cache in background if old (non-blocking)
                    const cacheAge = Date.now() - data.timestamp;
                    if (cacheAge > 10 * 60 * 1000) {
                        console.log('Cache is old, refreshing in background...');
                        setTimeout(() => this.refreshSquadInBackground(currentUser.id, cacheKey), 1000);
                    }
                    return;
                } catch (e) {
                    console.error('Cache parse error:', e);
                    localStorage.removeItem(cacheKey);
                }
            }
            
            // No cache - need to fetch from API
            console.log('No cache found, need to fetch from API');
            
            // Don't wait for API - render with empty data first
            this.mySquad = [];
            this.myClubs = [];
            
            // Fetch in background after rendering
            window.mobileAPI.getTeamSquad(currentUser.id).then(squadData => {
                this.mySquad = squadData.players || [];
                this.myClubs = squadData.clubs || [];
                console.log(`Background squad fetch completed in ${performance.now() - startTime}ms`);
                
                // Cache it
                localStorage.setItem(cacheKey, JSON.stringify({
                    players: this.mySquad,
                    clubs: this.myClubs,
                    timestamp: Date.now()
                }));
                
                // Re-render with the data
                if (this.initialized) {
                    this.renderView();
                    if (this.starting11.length === 0 && this.mySquad.length >= 15) {
                        this.autoSelectTeam();
                        this.renderView();
                    }
                }
            }).catch(err => {
                console.error('Background squad fetch failed:', err);
            });
        } catch (error) {
            console.error(`Squad load failed after ${performance.now() - startTime}ms:`, error);
            // Don't throw - continue with empty data
            this.mySquad = [];
            this.myClubs = [];
        }
    }
    
    // Refresh squad data in background without blocking UI
    async refreshSquadInBackground(userId, cacheKey) {
        try {
            const squadData = await window.mobileAPI.getTeamSquad(userId);
            localStorage.setItem(cacheKey, JSON.stringify({
                players: squadData.players || [],
                clubs: squadData.clubs || [],
                timestamp: Date.now()
            }));
            console.log('Squad cache refreshed in background');
        } catch (error) {
            console.error('Background refresh failed:', error);
        }
    }

    async loadCurrentGameweek() {
        try {
            // Check localStorage cache first
            const cacheKey = 'fpl_gameweek_cache';
            const cached = localStorage.getItem(cacheKey);
            
            if (cached) {
                const data = JSON.parse(cached);
                const cacheAge = Date.now() - data.timestamp;
                
                // Use cache if less than 1 hour old
                if (cacheAge < 60 * 60 * 1000) {
                    this.currentGameweek = data.gameweek;
                    this.deadline = new Date(data.deadline_time);
                    this.gameweekType = data.type || 'Normal';
                    this.matchCount = data.match_count || 10;
                    return;
                }
            }
            
            // Fetch fresh data with timeout
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Gameweek load timeout')), 5000)
            );
            
            const response = await Promise.race([
                window.mobileAPI.getCurrentGameweek(),
                timeoutPromise
            ]);
            
            this.currentGameweek = response.gameweek;
            this.deadline = new Date(response.deadline_time);
            this.gameweekType = response.type || 'Normal';
            this.matchCount = response.match_count || 10;
            
            // Cache the response
            localStorage.setItem(cacheKey, JSON.stringify({
                ...response,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('Error loading gameweek:', error);
            // Set defaults on error
            this.currentGameweek = 1;
            this.deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
            this.gameweekType = 'Normal';
        }
    }

    async loadExistingSubmission() {
        try {
            // Skip if no gameweek yet
            if (!this.currentGameweek) return;
            
            // Add timeout for submission loading
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Submission load timeout')), 3000)
            );
            
            const submission = await Promise.race([
                window.mobileAPI.getTeamSubmission(this.currentGameweek),
                timeoutPromise
            ]);
            
            if (submission) {
                this.starting11 = submission.starting_11 || [];
                this.bench = submission.bench || [];
                this.captainId = submission.captain_id;
                this.viceCaptainId = submission.vice_captain_id;
                this.clubMultiplierId = submission.club_multiplier_id;
            }
        } catch (error) {
            console.log('No existing submission found or timeout:', error.message);
            // Continue with default team selection
        }
    }

    async loadChipStatus() {
        // Defer chip loading - not critical for initial display
        setTimeout(async () => {
            try {
                const chipStatus = await window.mobileAPI.getChipStatus();
                this.chipStatus = chipStatus;
                // Re-render header to update chips
                if (this.initialized && !this.editMode) {
                    this.renderHeader();
                }
            } catch (error) {
                console.error('Error loading chip status:', error);
                // Set empty chip status on error
                this.chipStatus = [];
            }
        }, 100);
    }

    autoSelectTeam() {
        // Sort players by position
        const byPosition = {};
        this.mySquad.forEach(player => {
            const pos = player.position || player.element_type;
            if (!byPosition[pos]) byPosition[pos] = [];
            byPosition[pos].push(player);
        });

        // Auto-select starting 11 with 4-4-2 formation
        this.starting11 = [];
        
        // 1 GKP
        if (byPosition[1] && byPosition[1].length > 0) {
            this.starting11.push(byPosition[1][0].id);
        }
        
        // 4 DEF
        if (byPosition[2]) {
            this.starting11.push(...byPosition[2].slice(0, 4).map(p => p.id));
        }
        
        // 4 MID
        if (byPosition[3]) {
            this.starting11.push(...byPosition[3].slice(0, 4).map(p => p.id));
        }
        
        // 2 FWD
        if (byPosition[4]) {
            this.starting11.push(...byPosition[4].slice(0, 2).map(p => p.id));
        }

        // Rest go to bench
        this.bench = this.mySquad
            .filter(p => !this.starting11.includes(p.id))
            .slice(0, 4)
            .map(p => p.id);

        // Auto-select captain
        if (this.starting11.length > 0) {
            this.captainId = this.starting11[0];
        }
    }

    getDeadlineDisplay() {
        if (!this.deadline) return 'Loading...';
        
        const now = new Date();
        const diff = this.deadline - now;
        
        if (diff <= 0) {
            return 'DEADLINE PASSED';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        let timeStr = '';
        if (days > 0) {
            timeStr += `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            timeStr += `${hours}h ${minutes}m ${seconds}s`;
        } else {
            timeStr += `${minutes}m ${seconds}s`;
        }

        return timeStr;
    }

    startDeadlineTimer() {
        // Clear existing timer if any
        if (this.deadlineTimer) {
            clearInterval(this.deadlineTimer);
        }
        
        const updateTimer = () => {
            const timerEl = document.getElementById('deadlineTime');
            if (!timerEl) return;
            
            timerEl.textContent = this.getDeadlineDisplay();
            
            // Check if deadline passed
            if (this.deadline && new Date() > this.deadline) {
                clearInterval(this.deadlineTimer);
                this.disableSubmission();
            }
        };

        // Initial update
        updateTimer();
        
        // Set interval for updates
        this.deadlineTimer = setInterval(updateTimer, 1000); // Update every second
    }

    validateFormation() {
        const positions = { 1: 0, 2: 0, 3: 0, 4: 0 };
        
        this.starting11.forEach(playerId => {
            const player = this.mySquad.find(p => p.id === playerId);
            if (player) {
                const pos = player.position || player.element_type;
                positions[pos]++;
            }
        });

        // Check formation validity
        this.formationValid = 
            positions[1] === 1 && // Exactly 1 GKP
            positions[2] >= 3 && positions[2] <= 5 && // 3-5 DEF
            positions[3] >= 2 && positions[3] <= 5 && // 2-5 MID
            positions[4] >= 1 && positions[4] <= 3 && // 1-3 FWD
            (positions[1] + positions[2] + positions[3] + positions[4]) === 11;

        // Update UI
        const confirmBtn = document.getElementById('confirmTeamBtn');
        if (confirmBtn) {
            confirmBtn.disabled = !this.formationValid || !this.captainId;
        }
    }

    async submitTeam() {
        try {
            console.log('Submitting team...');
            
            // Check deadline
            if (new Date() > this.deadline) {
                window.mobileApp.showToast('Deadline has passed!', 'error');
                return;
            }

            // Validate
            if (!this.formationValid) {
                window.mobileApp.showToast('Invalid formation', 'error');
                return;
            }

            if (!this.captainId) {
                window.mobileApp.showToast('Please select a captain', 'error');
                return;
            }

            const submission = {
                gameweek: this.currentGameweek,
                starting_11: this.starting11,
                bench: this.bench,
                captain_id: this.captainId,
                vice_captain_id: this.viceCaptainId,
                club_multiplier_id: this.clubMultiplierId,
                chip_used: this.selectedChip
            };

            console.log('Submission data:', submission);
            
            const result = await window.mobileAPI.submitTeam(submission);
            console.log('Submission result:', result);
            
            window.mobileApp.showToast('Team submitted successfully!', 'success');
            
            // Mark existing submission
            this.existingSubmission = submission;
            
            // Update UI to show submission was saved
            this.renderHeader();
            
            // If chip was used, reload chip status
            if (this.selectedChip) {
                await this.loadChipStatus();
            }
            
        } catch (error) {
            console.error('Error submitting team:', error);
            window.mobileApp.showToast(error.message || 'Failed to submit team', 'error');
        }
    }

    resetTeam() {
        this.autoSelectTeam();
        this.selectedChip = null;
        this.renderView();
        window.mobileApp.showToast('Team reset', 'info');
    }

    disableSubmission() {
        const confirmBtn = document.getElementById('confirmTeamBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Deadline Passed';
        }
    }

    destroy() {
        if (this.deadlineTimer) {
            clearInterval(this.deadlineTimer);
        }
    }
}

// Initialize global instance
window.mobileSubmitTeam = new MobileSubmitTeamManagerV2();