// Mobile Submit Team Manager
class MobileSubmitTeamManager {
    constructor() {
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
        this.draggedPlayer = null;
        this.myClubs = [];
        this.editMode = false; // Track edit mode state
        
        // Position requirements
        this.positionLimits = {
            1: { min: 1, max: 1, name: 'GKP' }, // Goalkeeper
            2: { min: 3, max: 5, name: 'DEF' }, // Defender
            3: { min: 2, max: 5, name: 'MID' }, // Midfielder
            4: { min: 1, max: 3, name: 'FWD' }  // Forward
        };

        // Chips configuration
        this.chips = {
            'triple_captain': {
                name: 'Triple Captain (TC)',
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
                name: 'Negative Chip (NC)',
                short: 'NC',
                description: 'Points divided by 2',
                icon: '➗'
            },
            'double_up': {
                name: 'Double Up (DU)',
                short: 'DU',
                description: 'Points multiplied by 2',
                icon: '✖️'
            },
            'bench_boost': {
                name: 'Bench Boost (BB)',
                short: 'BB',
                description: 'All 15 players count',
                icon: '💪'
            },
            'park_the_bus': {
                name: 'Park the Bus (PB)',
                short: 'PB',
                description: '2x for GKP & DEF',
                icon: '🚌'
            },
            'brahmasthra': {
                name: 'Brahmasthra',
                short: 'BRM',
                description: 'Auto-picks best 11',
                icon: '🏹'
            }
        };
    }

    async initialize() {
        try {
            await this.loadMySquad();
            await this.loadCurrentGameweek();
            await this.loadExistingSubmission();
            await this.loadChipStatus();
            this.setupEventListeners();
            this.startDeadlineTimer();
            this.renderPitch();
            this.renderBench();
            this.renderClubSelector();
            this.renderChips();
            
            // Setup drag and drop if in edit mode
            if (this.editMode) {
                this.setupDragAndDrop();
            }
        } catch (error) {
            console.error('Failed to initialize submit team:', error);
            window.mobileApp.showToast('Failed to load team data', 'error');
        }
    }

    async loadMySquad() {
        try {
            const currentUser = window.mobileAPI.getCurrentUser();
            const squadData = await window.mobileAPI.getTeamSquad(currentUser.id);
            
            this.mySquad = squadData.players || [];
            this.myClubs = squadData.clubs || [];
            
            // Initialize with default formation if no existing submission
            if (this.starting11.length === 0 && this.mySquad.length >= 15) {
                this.autoSelectTeam();
            }
        } catch (error) {
            console.error('Error loading squad:', error);
            throw error;
        }
    }

    async loadCurrentGameweek() {
        try {
            const response = await window.mobileAPI.getCurrentGameweek();
            this.currentGameweek = response.gameweek;
            this.deadline = new Date(response.deadline_time);
            
            // Update UI with gameweek info
            const gwHeader = document.getElementById('gameweekHeader');
            if (gwHeader) {
                gwHeader.innerHTML = `
                    <div class="gameweek-info">
                        <h3>Gameweek ${this.currentGameweek}</h3>
                        <div id="deadlineTimer" class="deadline-timer"></div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading gameweek:', error);
            throw error;
        }
    }

    async loadExistingSubmission() {
        try {
            const submission = await window.mobileAPI.getTeamSubmission(this.currentGameweek);
            
            if (submission) {
                this.starting11 = submission.starting_11 || [];
                this.bench = submission.bench || [];
                this.captainId = submission.captain_id;
                this.viceCaptainId = submission.vice_captain_id;
                this.clubMultiplierId = submission.club_multiplier_id;
                
                // Show if this was auto-copied
                if (submission.auto_copied) {
                    console.log(`Team auto-copied from GW${submission.copied_from_gw}`);
                    // Enable form validation after auto-copy
                    this.validateFormation();
                    if (window.mobileApp && window.mobileApp.showToast) {
                        window.mobileApp.showToast(`Your team from GW${submission.copied_from_gw} has been automatically loaded. You can make changes before the deadline.`, 'info');
                    }
                } else if (submission.is_default) {
                    window.mobileApp.showToast('Using previous gameweek team as default', 'info');
                }
            }
        } catch (error) {
            console.log('No existing submission found');
        }
    }

    async loadChipStatus() {
        try {
            const chipStatus = await window.mobileAPI.getChipStatus();
            this.chipStatus = chipStatus;
        } catch (error) {
            console.error('Error loading chip status:', error);
        }
    }

    autoSelectTeam() {
        // Sort players by position
        const byPosition = {};
        this.mySquad.forEach(player => {
            const pos = player.position || player.element_type;
            if (!byPosition[pos]) byPosition[pos] = [];
            byPosition[pos].push(player);
        });

        // Auto-select starting 11 with valid formation (4-4-2)
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

        // Auto-select captain (highest value player in starting 11)
        const starting11Players = this.mySquad.filter(p => this.starting11.includes(p.id));
        if (starting11Players.length > 0) {
            const highestValue = starting11Players.reduce((prev, curr) => 
                (curr.now_cost || 0) > (prev.now_cost || 0) ? curr : prev
            );
            this.captainId = highestValue.id;
            
            // Vice captain is second highest
            const secondHighest = starting11Players
                .filter(p => p.id !== this.captainId)
                .reduce((prev, curr) => 
                    (curr.now_cost || 0) > (prev.now_cost || 0) ? curr : prev
                );
            if (secondHighest) {
                this.viceCaptainId = secondHighest.id;
            }
        }
    }

    setupEventListeners() {
        // Submit team button
        const submitBtn = document.getElementById('submitTeamBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.submitTeam());
        }

        // Edit team button
        const editBtn = document.getElementById('editTeamBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.toggleEditMode());
        }

        // Reset button
        const resetBtn = document.getElementById('resetTeamBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetTeam());
        }
    }

    startDeadlineTimer() {
        const updateTimer = () => {
            const now = new Date();
            const diff = this.deadline - now;
            
            const timerEl = document.getElementById('deadlineTimer');
            if (!timerEl) return;

            if (diff <= 0) {
                timerEl.innerHTML = '<span class="text-red-600 font-bold">DEADLINE PASSED</span>';
                clearInterval(this.deadlineTimer);
                this.disableSubmission();
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            let timeStr = '';
            if (days > 0) timeStr += `${days}d `;
            if (hours > 0 || days > 0) timeStr += `${hours}h `;
            if (minutes > 0 || hours > 0 || days > 0) timeStr += `${minutes}m `;
            timeStr += `${seconds}s`;

            const urgency = diff < 60 * 60 * 1000 ? 'text-red-600 animate-pulse' : 
                          diff < 24 * 60 * 60 * 1000 ? 'text-orange-600' : 
                          'text-gray-600';

            timerEl.innerHTML = `
                <span class="${urgency} font-semibold">
                    Deadline: ${timeStr}
                </span>
            `;
        };

        updateTimer();
        this.deadlineTimer = setInterval(updateTimer, 1000);
    }

    renderPitch() {
        const pitchContainer = document.getElementById('teamPitch');
        if (!pitchContainer) return;

        // Group starting 11 by position
        const positions = { 1: [], 2: [], 3: [], 4: [] };
        this.starting11.forEach(playerId => {
            const player = this.mySquad.find(p => p.id === playerId);
            if (player) {
                const pos = player.position || player.element_type;
                positions[pos].push(player);
            }
        });

        // Create pitch layout
        pitchContainer.innerHTML = `
            <div class="pitch-container">
                <div class="pitch">
                    <!-- Forwards -->
                    <div class="pitch-row forwards">
                        ${this.renderPositionRow(positions[4], 4)}
                    </div>
                    
                    <!-- Midfielders -->
                    <div class="pitch-row midfielders">
                        ${this.renderPositionRow(positions[3], 3)}
                    </div>
                    
                    <!-- Defenders -->
                    <div class="pitch-row defenders">
                        ${this.renderPositionRow(positions[2], 2)}
                    </div>
                    
                    <!-- Goalkeeper -->
                    <div class="pitch-row goalkeeper">
                        ${this.renderPositionRow(positions[1], 1)}
                    </div>
                </div>
            </div>
        `;

        // Add drag and drop listeners
        this.setupDragAndDrop();
        
        // Validate formation
        this.validateFormation();
    }

    renderPositionRow(players, positionId) {
        const positionName = this.positionLimits[positionId].name;
        const maxPlayers = this.positionLimits[positionId].max;
        
        let html = '';
        for (let i = 0; i < maxPlayers; i++) {
            const player = players[i];
            if (player) {
                const isCaptain = player.id === this.captainId;
                const isViceCaptain = player.id === this.viceCaptainId;
                
                html += `
                    <div class="pitch-player" data-player-id="${player.id}" draggable="${this.editMode}">
                        <div class="player-shirt ${isCaptain ? 'captain' : ''} ${isViceCaptain ? 'vice-captain' : ''}">
                            <img src="https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.photo?.replace('.jpg', '').replace('.png', '') || '0'}.png" 
                                 onerror="this.style.display='none'" alt="">
                            ${isCaptain ? '<span class="captain-badge">C</span>' : ''}
                            ${isViceCaptain ? '<span class="vice-badge">V</span>' : ''}
                        </div>
                        <div class="player-name">${player.web_name || player.name}</div>
                        <div class="player-team">${player.team_short_name || ''}</div>
                        <div class="player-actions">
                            <button onclick="mobileSubmitTeam.toggleCaptain(${player.id})" class="captain-btn" ${this.editMode ? 'style="pointer-events: none; opacity: 0.5;"' : ''}>
                                ${isCaptain ? '©' : 'C'}
                            </button>
                            <button onclick="mobileSubmitTeam.toggleViceCaptain(${player.id})" class="vice-btn" ${this.editMode ? 'style="pointer-events: none; opacity: 0.5;"' : ''}>
                                ${isViceCaptain ? 'Ⓥ' : 'V'}
                            </button>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="pitch-player empty" data-position="${positionId}">
                        <div class="empty-slot">${positionName}</div>
                    </div>
                `;
            }
        }
        
        return html;
    }

    renderBench() {
        const benchContainer = document.getElementById('teamBench');
        if (!benchContainer) return;

        const benchPlayers = this.bench.map(playerId => 
            this.mySquad.find(p => p.id === playerId)
        ).filter(Boolean);

        benchContainer.innerHTML = `
            <div class="bench-container">
                <h4 class="bench-title">Bench</h4>
                <div class="bench-players">
                    ${benchPlayers.map((player, index) => `
                        <div class="bench-player" data-player-id="${player.id}" draggable="${this.editMode}">
                            <span class="bench-number">${index + 1}</span>
                            <div class="player-info">
                                <div class="player-name">${player.web_name || player.name}</div>
                                <div class="player-position">${this.getPositionName(player.position || player.element_type)}</div>
                            </div>
                        </div>
                    `).join('')}
                    ${[...Array(4 - benchPlayers.length)].map((_, i) => `
                        <div class="bench-player empty">
                            <span class="bench-number">${benchPlayers.length + i + 1}</span>
                            <div class="empty-slot">Empty</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderClubSelector() {
        const clubContainer = document.getElementById('clubMultiplier');
        if (!clubContainer) return;

        // Show message if no clubs owned yet
        if (!this.myClubs || this.myClubs.length === 0) {
            clubContainer.innerHTML = `
                <div class="club-selector">
                    <h4 class="selector-title">Club Multiplier (1.5x points)</h4>
                    <div class="no-clubs-message">
                        <p>You haven't acquired any clubs yet.</p>
                        <p class="text-sm text-gray-500">Clubs will appear here once you win them in auction.</p>
                    </div>
                </div>
            `;
            return;
        }

        // Show the 2 owned clubs for selection
        clubContainer.innerHTML = `
            <div class="club-selector">
                <h4 class="selector-title">Select Club for 1.5x Points (Required)</h4>
                <p class="selector-subtitle">All players from selected club get 1.5x multiplier</p>
                <div class="clubs-grid">
                    ${this.myClubs.map(club => `
                        <div class="club-option ${this.clubMultiplierId === club.id ? 'selected' : ''}"
                             onclick="mobileSubmitTeam.selectClubMultiplier(${club.id})">
                            <div class="club-badge">🏟️</div>
                            <div class="club-info">
                                <div class="club-name">${club.name || club.club_name || 'Unknown Club'}</div>
                                <div class="club-short">${club.short_name || club.club_short_name || ''}</div>
                            </div>
                            ${this.clubMultiplierId === club.id ? '<div class="selected-badge">1.5x Selected</div>' : '<div class="select-prompt">Tap to select</div>'}
                        </div>
                    `).join('')}
                </div>
                ${this.myClubs.length === 1 ? '<p class="text-xs text-gray-500 mt-2">You own 1 club. Acquire another club in auction for more options.</p>' : ''}
            </div>
        `;
    }

    renderChips() {
        const chipsContainer = document.getElementById('chipsSelector');
        if (!chipsContainer) return;

        chipsContainer.innerHTML = `
            <div class="chips-container">
                <h4 class="chips-title">Chips (Optional - One per GW)</h4>
                <div class="chips-grid">
                    ${Object.entries(this.chips).map(([chipId, chip]) => {
                        const chipStatus = this.chipStatus?.find(cs => cs.id === chipId);
                        const isUsed = chipStatus?.used;
                        const isSelected = this.selectedChip === chipId;
                        
                        return `
                            <div class="chip-card ${isUsed ? 'used' : ''} ${isSelected ? 'selected' : ''}"
                                 onclick="${!isUsed ? `mobileSubmitTeam.selectChip('${chipId}')` : ''}">
                                <div class="chip-icon">${chip.icon}</div>
                                <div class="chip-name">${chip.short}</div>
                                ${isUsed ? `<div class="used-badge">GW${chipStatus.gameweek_used}</div>` : ''}
                                ${isSelected ? '<div class="selected-badge">✓</div>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
                ${this.selectedChip ? `
                    <div class="chip-description">
                        ${this.chips[this.selectedChip].description}
                    </div>
                ` : ''}
            </div>
        `;
    }

    toggleEditMode() {
        this.editMode = !this.editMode;
        const editBtn = document.getElementById('editTeamBtn');
        
        if (this.editMode) {
            editBtn.textContent = 'Done Editing';
            editBtn.classList.add('editing');
            window.mobileApp.showToast('Edit mode enabled - drag players to swap', 'info');
            this.enableDragAndDrop();
        } else {
            editBtn.textContent = 'Edit Team';
            editBtn.classList.remove('editing');
            window.mobileApp.showToast('Edit mode disabled', 'info');
            this.disableDragAndDrop();
        }
        
        // Re-render to update draggable states
        this.renderPitch();
        this.renderBench();
    }

    setupDragAndDrop() {
        // Only setup if in edit mode
        if (!this.editMode) return;
        
        const draggables = document.querySelectorAll('[draggable="true"]');
        const dropZones = document.querySelectorAll('.pitch-player, .bench-player');

        draggables.forEach(draggable => {
            draggable.addEventListener('dragstart', (e) => {
                this.draggedPlayer = e.target.dataset.playerId;
                e.target.classList.add('dragging');
            });

            draggable.addEventListener('dragend', (e) => {
                e.target.classList.remove('dragging');
                this.draggedPlayer = null;
            });
        });

        dropZones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drag-over');
            });

            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                
                if (this.draggedPlayer) {
                    const targetPlayerId = zone.dataset.playerId;
                    this.swapPlayers(this.draggedPlayer, targetPlayerId);
                }
            });
        });
    }

    enableDragAndDrop() {
        // Add visual indicator that edit mode is active
        const pitch = document.querySelector('.pitch');
        if (pitch) {
            pitch.classList.add('edit-mode');
        }
        this.setupDragAndDrop();
    }
    
    disableDragAndDrop() {
        // Remove visual indicator
        const pitch = document.querySelector('.pitch');
        if (pitch) {
            pitch.classList.remove('edit-mode');
        }
        
        // Remove all drag event listeners
        const draggables = document.querySelectorAll('[draggable]');
        draggables.forEach(element => {
            element.setAttribute('draggable', 'false');
        });
    }

    swapPlayers(player1Id, player2Id) {
        // Find players in starting 11 and bench
        const player1InStarting = this.starting11.includes(parseInt(player1Id));
        const player2InStarting = this.starting11.includes(parseInt(player2Id));
        
        if (player1InStarting && player2InStarting) {
            // Swap within starting 11
            const index1 = this.starting11.indexOf(parseInt(player1Id));
            const index2 = this.starting11.indexOf(parseInt(player2Id));
            [this.starting11[index1], this.starting11[index2]] = [this.starting11[index2], this.starting11[index1]];
        } else if (player1InStarting && !player2InStarting) {
            // Swap between starting 11 and bench
            const index1 = this.starting11.indexOf(parseInt(player1Id));
            const index2 = this.bench.indexOf(parseInt(player2Id));
            
            if (index2 !== -1) {
                [this.starting11[index1], this.bench[index2]] = [this.bench[index2], this.starting11[index1]];
            }
        }
        
        this.renderPitch();
        this.renderBench();
        this.validateFormation();
    }

    toggleCaptain(playerId) {
        if (this.captainId === playerId) {
            this.captainId = null;
        } else {
            this.captainId = playerId;
            // Remove vice captain if same player
            if (this.viceCaptainId === playerId) {
                this.viceCaptainId = null;
            }
        }
        this.renderPitch();
    }

    toggleViceCaptain(playerId) {
        if (this.viceCaptainId === playerId) {
            this.viceCaptainId = null;
        } else {
            this.viceCaptainId = playerId;
            // Remove captain if same player
            if (this.captainId === playerId) {
                this.captainId = null;
            }
        }
        this.renderPitch();
    }

    selectClubMultiplier(clubId) {
        this.clubMultiplierId = this.clubMultiplierId === clubId ? null : clubId;
        this.renderClubSelector();
    }

    selectChip(chipId) {
        this.selectedChip = this.selectedChip === chipId ? null : chipId;
        this.renderChips();
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
        const validationEl = document.getElementById('formationValidation');
        if (validationEl) {
            if (this.formationValid) {
                validationEl.innerHTML = '<span class="text-green-600">✓ Valid formation</span>';
            } else {
                validationEl.innerHTML = '<span class="text-red-600">✗ Invalid formation</span>';
            }
        }

        // Enable/disable submit button
        const submitBtn = document.getElementById('submitTeamBtn');
        if (submitBtn) {
            submitBtn.disabled = !this.formationValid || !this.captainId || !this.viceCaptainId;
        }
    }

    getPositionName(positionId) {
        return this.positionLimits[positionId]?.name || 'Unknown';
    }

    async submitTeam() {
        try {
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

            if (!this.captainId || !this.viceCaptainId) {
                window.mobileApp.showToast('Please select captain and vice-captain', 'error');
                return;
            }

            if (!this.clubMultiplierId) {
                window.mobileApp.showToast('Please select a club for 1.5x multiplier', 'error');
                return;
            }

            const submitBtn = document.getElementById('submitTeamBtn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Submitting...';
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

            await window.mobileAPI.submitTeam(submission);
            
            window.mobileApp.showToast('Team submitted successfully!', 'success');
            
            // Reload chip status if chip was used
            if (this.selectedChip) {
                await this.loadChipStatus();
                this.renderChips();
            }
        } catch (error) {
            console.error('Error submitting team:', error);
            window.mobileApp.showToast(error.message || 'Failed to submit team', 'error');
        } finally {
            const submitBtn = document.getElementById('submitTeamBtn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Team';
            }
        }
    }

    resetTeam() {
        this.autoSelectTeam();
        this.selectedChip = null;
        this.clubMultiplierId = this.myClubs[0]?.id || null;
        this.renderPitch();
        this.renderBench();
        this.renderClubSelector();
        this.renderChips();
        window.mobileApp.showToast('Team reset to default', 'info');
    }

    disableSubmission() {
        const submitBtn = document.getElementById('submitTeamBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Deadline Passed';
        }
    }

    destroy() {
        if (this.deadlineTimer) {
            clearInterval(this.deadlineTimer);
        }
    }
}

// Initialize global instance
window.mobileSubmitTeam = new MobileSubmitTeamManager();