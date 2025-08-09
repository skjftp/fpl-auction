// Mobile League Tab for FPL Auction
class MobileLeague {
    constructor() {
        this.teams = [];
        this.currentGameweek = 1;
        this.deadlinePassed = false;
        this.leaderboardData = [];
        this.selectedTeamId = null;
        this.gameweekPoints = {};
        this.initialized = false;
    }

    async initialize() {
        console.log('League tab initialize called');
        
        // Get current gameweek info
        try {
            const gwInfo = await window.mobileAPI.getCurrentGameweek();
            this.currentGameweek = gwInfo.gameweek || 1;
            this.deadlinePassed = new Date() > new Date(gwInfo.deadline_time);
            console.log('Gameweek:', this.currentGameweek, 'Deadline passed:', this.deadlinePassed);
        } catch (error) {
            console.error('Error loading gameweek info:', error);
        }
        
        // Render the UI
        this.render();
        
        // Load leaderboard data
        await this.loadLeaderboard();
        
        this.initialized = true;
    }

    async loadLeaderboard() {
        try {
            // Get all teams
            const teams = await window.mobileAPI.getAllTeams();
            this.teams = teams;
            
            // Get points for current gameweek
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
            <div class="leaderboard-row ${isMyTeam ? 'my-team' : ''}" onclick="mobileLeague.viewTeam('${team.team_id}')">
                <div class="rank-col">
                    <span class="rank-number">${rank}</span>
                    ${rankChange}
                </div>
                <div class="team-col">
                    <div class="team-name">${team.team_name || `Team ${team.team_id}`}</div>
                    ${team.chip_used ? `<span class="chip-indicator">${this.getChipName(team.chip_used)}</span>` : ''}
                </div>
                <div class="points-col">
                    <span class="points-value">${points}</span>
                    ${pointsType === 'gameweek' && team.hit_points ? 
                        `<span class="hit-indicator">-${team.hit_points}</span>` : ''}
                </div>
                <div class="action-col">
                    <button class="view-btn" onclick="event.stopPropagation(); mobileLeague.viewTeam('${team.team_id}')">
                        👁
                    </button>
                </div>
            </div>
        `;
    }

    async viewTeam(teamId) {
        // Check if deadline has passed
        if (!this.deadlinePassed && this.currentGameweek === 1) {
            window.mobileApp.showToast('You can view other teams only after the deadline', 'warning');
            return;
        }
        
        // Check if viewing future gameweek
        const gwInfo = await window.mobileAPI.getCurrentGameweek();
        const actualCurrentGW = gwInfo.gameweek;
        if (this.currentGameweek > actualCurrentGW) {
            window.mobileApp.showToast('Cannot view teams for future gameweeks', 'warning');
            return;
        }
        
        // Show modal
        const modal = document.getElementById('teamViewModal');
        modal.classList.remove('hidden');
        
        // Load team details
        await this.loadTeamDetails(teamId);
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

    getChipName(chipId) {
        const chips = {
            'brahmashtra': '🎯 Brahmashtra',
            'wildcard': '♻️ Wildcard',
            'free_hit': '🎲 Free Hit',
            'bench_boost': '📈 Bench Boost',
            'triple_captain': '👑 Triple Captain'
        };
        return chips[chipId] || chipId;
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
        await this.loadLeaderboard();
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