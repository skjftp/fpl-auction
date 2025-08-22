// Mobile League Tab for FPL Auction
class MobileLeague {
    constructor() {
        this.teams = [];
        this.currentGameweek = 1;
        this.deadlinePassed = false;
        this.leaderboardData = [];
        this.selectedTeamId = null;
        this.gameweekPoints = {};
        this.allChipsData = null;
        this.initialized = false;
        
        // Chip configuration with icons and names
        this.chipConfig = {
            'brahmashtra': {
                name: 'Brahmashtra',
                icon: '🏹',
                description: 'Auto-picks best 11'
            },
            'triple_captain': {
                name: 'Triple Captain',
                icon: '👑',
                description: '3x points for Captain'
            },
            'attack_chip': {
                name: 'Attack Chip',
                icon: '⚔️',
                description: '2x for MID & FWD in playing 11'
            },
            'negative_chip': {
                name: 'Negative Chip',
                icon: '➗',
                description: 'Points divided by 2'
            },
            'double_up': {
                name: 'Double Up',
                icon: '✖️',
                description: 'Points multiplied by 2'
            },
            'bench_boost': {
                name: 'Bench Boost',
                icon: '💪',
                description: 'All 15 players count'
            },
            'park_the_bus': {
                name: 'Park the Bus',
                icon: '🚌',
                description: '2x for GKP & DEF'
            }
        };
    }

    async initialize() {
        console.log('League tab initialize called');
        
        // Get the current playing gameweek from gameweek info API
        try {
            const gwInfo = await window.mobileAPI.getCurrentGameweek();
            if (gwInfo && gwInfo.gameweek) {
                // The API returns the submission gameweek (GW3)
                // For league standings, we want the PLAYING gameweek (GW2)
                // Playing gameweek = submission gameweek - 1 (unless it's GW1)
                const submissionGw = gwInfo.gameweek;
                this.currentGameweek = Math.max(1, submissionGw - 1);
                console.log(`League: Submission GW${submissionGw}, showing playing GW${this.currentGameweek}`);
            } else {
                // Default to GW2 as fallback
                this.currentGameweek = 2;
                console.log('Using default playing gameweek:', this.currentGameweek);
            }
            this.deadlinePassed = true; // Playing gameweek deadline has passed
        } catch (error) {
            console.error('Error loading gameweek info:', error);
            this.currentGameweek = 2; // Default to GW2
        }
        
        // Render the UI with correct gameweek
        this.render();
        
        // Load chip data and leaderboard in parallel
        console.log('League: Starting to load chip data and leaderboard...');
        try {
            await Promise.all([
                this.loadChipData(),
                this.loadLeaderboard()
            ]);
            console.log('League: Chip data and leaderboard loaded successfully');
        } catch (error) {
            console.error('League: Error loading data:', error);
        }
        
        this.initialized = true;
    }

    async loadChipData() {
        try {
            this.allChipsData = await window.mobileAPI.getAllTeamsChipStatus();
            console.log('Chip data loaded successfully');
        } catch (error) {
            console.error('Error loading chip data:', error);
            this.allChipsData = null;
        }
    }
    
    async loadLeaderboard() {
        try {
            // Get all teams
            const teams = await window.mobileAPI.getAllTeams();
            this.teams = teams;
            
            // Try to get live standings with calculated points
            try {
                const response = await fetch(`${window.API_BASE_URL}/api/submissions/gameweek/${this.currentGameweek}/standings`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.standings && data.standings.length > 0) {
                        // Use live standings if available
                        this.leaderboardData = data.standings.map(standing => ({
                            team_id: standing.team_id,
                            team_name: standing.team_name,
                            gameweek_points: standing.gameweek_points,
                            total_points: standing.total_points || 0,
                            chip_used: standing.chip_used,
                            rank: standing.rank
                        }));
                        this.renderLeaderboard();
                        return;
                    }
                }
            } catch (error) {
                console.log('Live standings not available yet');
            }
            
            // Fallback to regular leaderboard
            const leaderboard = await window.mobileAPI.getLeaderboard(this.currentGameweek);
            this.leaderboardData = leaderboard || [];
            
            // Sort by total points
            this.leaderboardData.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
            
            this.renderLeaderboard();
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.renderError('Failed to load leaderboard');
        }
    }

    render() {
        const container = document.getElementById('leagueContent');
        if (!container) return;
        
        container.innerHTML = `
            <div class="league-container">
                <div class="league-header">
                    <h2 class="league-title">League Standings</h2>
                    <div class="gameweek-selector">
                        <button class="gw-nav-btn" onclick="mobileLeague.changeGameweek(-1)">←</button>
                        <span class="gw-display">GW ${this.currentGameweek}</span>
                        <button class="gw-nav-btn" onclick="mobileLeague.changeGameweek(1)">→</button>
                    </div>
                </div>
                
                <div class="points-type-toggle">
                    <button class="points-toggle-btn active" onclick="mobileLeague.togglePointsView('total')">
                        Total Points
                    </button>
                    <button class="points-toggle-btn" onclick="mobileLeague.togglePointsView('gameweek')">
                        GW Points
                    </button>
                </div>
                
                <div id="leaderboardContainer" class="leaderboard-container">
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                        <p>Loading standings...</p>
                    </div>
                </div>
                
                <div id="teamViewModal" class="team-view-modal hidden">
                    <div class="modal-overlay" onclick="mobileLeague.closeTeamView()"></div>
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 id="modalTeamName">Team Details</h3>
                            <button class="close-btn" onclick="mobileLeague.closeTeamView()">✕</button>
                        </div>
                        <div id="modalTeamContent" class="modal-body">
                            <!-- Team details will be loaded here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderLeaderboard() {
        const container = document.getElementById('leaderboardContainer');
        if (!container) return;
        
        if (this.leaderboardData.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <p>No points data available yet</p>
                    <small>Points will be calculated after the first gameweek deadline</small>
                </div>
            `;
            return;
        }
        
        const pointsType = document.querySelector('.points-toggle-btn.active')?.textContent.includes('Total') ? 'total' : 'gameweek';
        
        container.innerHTML = `
            <div class="leaderboard-table">
                <div class="leaderboard-header-row">
                    <div class="rank-col">Rank</div>
                    <div class="team-col">Team</div>
                    <div class="points-col">${pointsType === 'total' ? 'Total' : 'GW'}</div>
                    <div class="action-col"></div>
                </div>
                ${this.leaderboardData.map((team, index) => this.renderTeamRow(team, index + 1, pointsType)).join('')}
            </div>
        `;
    }

    renderTeamRow(team, rank, pointsType) {
        const points = pointsType === 'total' ? (team.total_points || 0) : (team.gameweek_points || 0);
        const currentUser = window.mobileAPI.getCurrentUser();
        const isMyTeam = team.team_id === currentUser.id;
        
        // Determine rank change indicator
        let rankChange = '';
        if (team.previous_rank && this.currentGameweek > 1) {
            const change = team.previous_rank - rank;
            if (change > 0) {
                rankChange = `<span class="rank-up">↑${change}</span>`;
            } else if (change < 0) {
                rankChange = `<span class="rank-down">↓${Math.abs(change)}</span>`;
            } else {
                rankChange = '<span class="rank-same">−</span>';
            }
        }
        
        return `
            <div class="leaderboard-row ${isMyTeam ? 'my-team' : ''}" onclick="mobileLeague.viewTeam(${team.team_id})">
                <div class="rank-col">
                    <span class="rank-number">${rank}</span>
                    ${rankChange}
                </div>
                <div class="team-col">
                    <div class="team-name">${team.team_name || `Team ${team.team_id}`}</div>
                    <div class="chip-icons">
                        ${this.renderChipIcons(team.team_id)}
                    </div>
                </div>
                <div class="points-col">
                    <span class="points-value">${points}</span>
                    ${pointsType === 'gameweek' && team.hit_points ? 
                        `<span class="hit-indicator">-${team.hit_points}</span>` : ''}
                </div>
                <div class="action-col">
                    <button class="view-btn" onclick="event.stopPropagation(); mobileLeague.viewTeam(${team.team_id})">
                        👀
                    </button>
                </div>
            </div>
        `;
    }

    async viewTeam(teamId) {
        // Show the submission for the current playing gameweek
        // Use mobileApp's viewTeamSubmission which shows the nice pitch view
        if (window.mobileApp && window.mobileApp.viewTeamSubmission) {
            // Pass the current playing gameweek explicitly
            console.log(`Viewing team ${teamId} for GW${this.currentGameweek}`);
            window.mobileApp.viewTeamSubmission(teamId, this.currentGameweek);
        } else if (window.mobileTeamViewer) {
            window.mobileTeamViewer.show(teamId, this.currentGameweek);
        } else {
            // Fallback to old modal
            const modal = document.getElementById('teamViewModal');
            modal.classList.remove('hidden');
            await this.loadTeamDetails(teamId);
        }
    }

    async loadTeamDetails(teamId) {
        const contentEl = document.getElementById('modalTeamContent');
        const headerEl = document.getElementById('modalTeamName');
        
        contentEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
        
        try {
            // Get team submission for the gameweek
            const submission = await window.mobileAPI.getTeamSubmission(this.currentGameweek, teamId);
            
            if (!submission) {
                contentEl.innerHTML = '<p class="no-data">No team submitted for this gameweek</p>';
                return;
            }
            
            // Get team info
            const team = this.teams.find(t => t.id === teamId);
            headerEl.textContent = team?.name || `Team ${teamId}`;
            
            // Get squad details
            const squadData = await window.mobileAPI.getTeamSquad(teamId);
            const players = squadData.players || [];
            const clubs = squadData.clubs || [];
            
            // Map player IDs to player objects
            const starting11 = submission.starting_11.map(id => players.find(p => p.id === id)).filter(Boolean);
            const bench = submission.bench.map(id => players.find(p => p.id === id)).filter(Boolean);
            
            // Get captain and vice captain
            const captain = players.find(p => p.id === submission.captain_id);
            const viceCaptain = players.find(p => p.id === submission.vice_captain_id);
            
            // Get club multiplier
            const clubMultiplier = clubs.find(c => c.id === submission.club_multiplier_id);
            
            contentEl.innerHTML = `
                <div class="team-details">
                    <div class="team-info-row">
                        ${submission.chip_used ? 
                            `<div class="chip-used">Chip: <strong>${this.getChipName(submission.chip_used)}</strong></div>` : ''}
                        ${clubMultiplier ? 
                            `<div class="club-multiplier">Club: <strong>${clubMultiplier.name || clubMultiplier.club_name}</strong> (1.5x)</div>` : ''}
                    </div>
                    
                    <div class="formation-view">
                        <h4>Starting XI</h4>
                        <div class="players-grid">
                            ${this.renderFormation(starting11, captain, viceCaptain, clubMultiplier)}
                        </div>
                    </div>
                    
                    <div class="bench-view">
                        <h4>Bench</h4>
                        <div class="bench-list">
                            ${bench.map((player, index) => this.renderBenchPlayer(player, index)).join('')}
                        </div>
                    </div>
                    
                    ${submission.gameweek_points !== undefined ? `
                        <div class="points-breakdown">
                            <h4>Points Breakdown</h4>
                            <div class="points-details">
                                <div class="points-row">
                                    <span>Base Points:</span>
                                    <span>${submission.base_points || 0}</span>
                                </div>
                                <div class="points-row">
                                    <span>Captain Bonus:</span>
                                    <span>+${submission.captain_points || 0}</span>
                                </div>
                                ${submission.club_bonus ? `
                                    <div class="points-row">
                                        <span>Club Multiplier:</span>
                                        <span>+${submission.club_bonus || 0}</span>
                                    </div>
                                ` : ''}
                                ${submission.chip_bonus ? `
                                    <div class="points-row">
                                        <span>Chip Bonus:</span>
                                        <span>+${submission.chip_bonus || 0}</span>
                                    </div>
                                ` : ''}
                                ${submission.auto_sub_points ? `
                                    <div class="points-row">
                                        <span>Auto Subs:</span>
                                        <span>+${submission.auto_sub_points || 0}</span>
                                    </div>
                                ` : ''}
                                <div class="points-row total">
                                    <span>Total:</span>
                                    <span>${submission.gameweek_points || 0}</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        } catch (error) {
            console.error('Error loading team details:', error);
            contentEl.innerHTML = '<p class="error-text">Failed to load team details</p>';
        }
    }

    renderFormation(players, captain, viceCaptain, clubMultiplier) {
        // Group by position
        const positions = {
            1: [], // GKP
            2: [], // DEF
            3: [], // MID
            4: []  // FWD
        };
        
        players.forEach(player => {
            const pos = player.position || player.element_type;
            if (positions[pos]) {
                positions[pos].push(player);
            }
        });
        
        return `
            <div class="formation-rows">
                <div class="formation-row forwards">
                    ${positions[4].map(p => this.renderPlayerCard(p, captain, viceCaptain, clubMultiplier)).join('')}
                </div>
                <div class="formation-row midfielders">
                    ${positions[3].map(p => this.renderPlayerCard(p, captain, viceCaptain, clubMultiplier)).join('')}
                </div>
                <div class="formation-row defenders">
                    ${positions[2].map(p => this.renderPlayerCard(p, captain, viceCaptain, clubMultiplier)).join('')}
                </div>
                <div class="formation-row goalkeeper">
                    ${positions[1].map(p => this.renderPlayerCard(p, captain, viceCaptain, clubMultiplier)).join('')}
                </div>
            </div>
        `;
    }

    renderPlayerCard(player, captain, viceCaptain, clubMultiplier) {
        const isCaptain = captain && player.id === captain.id;
        const isViceCaptain = viceCaptain && player.id === viceCaptain.id;
        const isFromMultiplierClub = clubMultiplier && player.team === clubMultiplier.id;
        
        return `
            <div class="mini-player-card">
                <div class="mini-player-shirt">
                    ${isCaptain ? '<span class="badge-c">C</span>' : ''}
                    ${isViceCaptain ? '<span class="badge-vc">V</span>' : ''}
                    ${isFromMultiplierClub ? '<span class="badge-club">1.5x</span>' : ''}
                </div>
                <div class="mini-player-name">${player.web_name || player.name}</div>
                ${player.gameweek_points !== undefined ? 
                    `<div class="mini-player-points">${player.gameweek_points}pts</div>` : ''}
            </div>
        `;
    }

    renderBenchPlayer(player, index) {
        return `
            <div class="bench-player-row">
                <span class="bench-order">${index === 0 ? 'GK' : `S${index}`}</span>
                <span class="bench-name">${player.web_name || player.name}</span>
                ${player.gameweek_points !== undefined ? 
                    `<span class="bench-points">${player.gameweek_points}pts</span>` : ''}
                ${player.auto_subbed ? '<span class="auto-sub-badge">↔</span>' : ''}
            </div>
        `;
    }

    renderChipIcons(teamId) {
        if (!this.allChipsData || !this.allChipsData.teams) {
            return '';
        }
        
        const teamChipData = this.allChipsData.teams[teamId];
        if (!teamChipData) {
            return '';
        }
        
        const currentGameweek = this.allChipsData.current_gameweek || this.currentGameweek;
        const allChips = this.allChipsData.all_chips || [];
        
        return allChips.map(chipId => {
            const chipConfig = this.chipConfig[chipId];
            if (!chipConfig) return '';
            
            // Check if chip is already used (permanently)
            const isUsed = teamChipData.chips_used.includes(chipId);
            
            // Check if chip is being played in current gameweek
            const isCurrentlyPlaying = teamChipData.chip_current_gw === chipId;
            
            // Don't show used chips
            if (isUsed) {
                return '';
            }
            
            // Determine the class and color
            let chipClass = 'chip-icon';
            if (isCurrentlyPlaying) {
                chipClass += ' chip-playing'; // Green for currently playing
                console.log(`Team ${teamId} ${chipId}: PLAYING - class: ${chipClass}`);
            } else {
                chipClass += ' chip-available'; // Blue for available
                console.log(`Team ${teamId} ${chipId}: AVAILABLE - class: ${chipClass}`);
            }
            
            return `
                <span class="${chipClass}" 
                      title="${chipConfig.name}: ${chipConfig.description}${isCurrentlyPlaying ? ' (Playing this GW)' : ' (Available)'}" 
                      onclick="mobileLeague.showChipTooltip(event, '${chipId}', ${isCurrentlyPlaying})">
                    ${chipConfig.icon}
                </span>
            `;
        }).join('');
    }
    
    showChipTooltip(event, chipId, isPlaying) {
        event.stopPropagation();
        const chipConfig = this.chipConfig[chipId];
        if (!chipConfig) return;
        
        const status = isPlaying ? 'Playing this Gameweek' : 'Available';
        const message = `${chipConfig.name}\n${chipConfig.description}\nStatus: ${status}`;
        
        // For mobile, show alert for now (can be enhanced with custom tooltip later)
        alert(message);
    }
    
    getChipName(chipId) {
        const chipConfig = this.chipConfig[chipId];
        return chipConfig ? `${chipConfig.icon} ${chipConfig.name}` : chipId;
    }

    async changeGameweek(direction) {
        const newGW = this.currentGameweek + direction;
        if (newGW < 1 || newGW > 38) return;
        
        this.currentGameweek = newGW;
        
        // Check if deadline passed for new gameweek
        try {
            const gwInfo = await window.mobileAPI.getGameweekInfo(newGW);
            this.deadlinePassed = new Date() > new Date(gwInfo.deadline_time);
        } catch (error) {
            console.error('Error checking deadline:', error);
        }
        
        this.render();
        await Promise.all([
            this.loadChipData(),
            this.loadLeaderboard()
        ]);
    }

    togglePointsView(type) {
        // Update button states
        document.querySelectorAll('.points-toggle-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Re-render leaderboard
        this.renderLeaderboard();
    }

    closeTeamView() {
        const modal = document.getElementById('teamViewModal');
        modal.classList.add('hidden');
    }

    renderError(message) {
        const container = document.getElementById('leaderboardContainer');
        if (container) {
            container.innerHTML = `
                <div class="error-container">
                    <p class="error-text">${message}</p>
                    <button onclick="mobileLeague.loadLeaderboard()" class="retry-btn">Retry</button>
                </div>
            `;
        }
    }
}

// Initialize when needed
window.mobileLeague = new MobileLeague();