// Mobile Team Viewer - View submitted teams with live points
class MobileTeamViewer {
    constructor() {
        this.currentTeamId = null;
        this.currentGameweek = null;
        this.submission = null;
        this.livePoints = null;
        this.playerData = new Map();
    }

    async show(teamId, gameweek) {
        this.currentTeamId = teamId;
        this.currentGameweek = gameweek || 1;
        
        // Create and show modal
        this.createModal();
        this.showLoader();
        
        try {
            // Fetch submission and live points in parallel
            const [submissionData, liveData] = await Promise.all([
                this.fetchSubmission(teamId, this.currentGameweek),
                this.fetchLivePoints(this.currentGameweek)
            ]);
            
            if (!submissionData.submission) {
                this.showError('No team submitted for this gameweek');
                return;
            }
            
            this.submission = submissionData.submission;
            this.teamName = submissionData.team?.name || `Team ${teamId}`;
            this.livePoints = liveData.elements || {};
            
            // Fetch player details for display
            await this.fetchPlayerDetails();
            
            // Render the team
            this.renderTeam();
            
        } catch (error) {
            console.error('Error loading team:', error);
            if (error.message?.includes('deadline')) {
                this.showError('Teams will be visible after deadline');
            } else {
                this.showError('Failed to load team');
            }
        }
    }
    
    async fetchSubmission(teamId, gameweek) {
        // Use existing gameweek-teams endpoint which works
        const submission = await window.mobileAPI.getTeamSubmission(gameweek, teamId);
        if (!submission) {
            throw new Error('No submission found for this gameweek');
        }
        
        // Get team info
        const teams = await window.mobileAPI.getAllTeams();
        const team = teams.find(t => t.id === teamId);
        
        return {
            submission,
            team: team ? { id: team.id, name: team.name } : null
        };
    }
    
    async fetchLivePoints(gameweek) {
        try {
            // For now, return empty as live points aren't available yet
            // This will be implemented when FPL API is available
            return { elements: {} };
        } catch (error) {
            console.error('Failed to fetch live points');
            return { elements: {} };
        }
    }
    
    async fetchPlayerDetails() {
        const allPlayerIds = [
            ...(this.submission.starting_11 || []),
            ...(this.submission.bench || [])
        ];
        
        // Get team squad data which includes all player details
        try {
            const currentUser = window.mobileAPI.getCurrentUser();
            const squadData = await window.mobileAPI.getTeamSquad(this.currentTeamId);
            
            if (squadData && squadData.players) {
                // Map all players by ID for quick lookup
                squadData.players.forEach(player => {
                    if (allPlayerIds.includes(player.id)) {
                        this.playerData.set(player.id, player);
                    }
                });
            }
        } catch (error) {
            console.error('Failed to fetch player details:', error);
        }
    }
    
    createModal() {
        // Remove existing modal if any
        const existing = document.getElementById('teamViewerModal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'teamViewerModal';
        modal.className = 'team-viewer-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="mobileTeamViewer.close()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="teamViewerTitle">Loading...</h2>
                    <button class="close-btn" onclick="mobileTeamViewer.close()">✕</button>
                </div>
                <div id="teamViewerContent" class="modal-body">
                    <!-- Content will be rendered here -->
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add styles if not already present
        if (!document.getElementById('teamViewerStyles')) {
            const styles = document.createElement('style');
            styles.id = 'teamViewerStyles';
            styles.innerHTML = `
                .team-viewer-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .modal-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                }
                
                .modal-content {
                    position: relative;
                    background: white;
                    width: 95%;
                    max-width: 600px;
                    max-height: 90vh;
                    border-radius: 12px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                
                .modal-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .modal-header h2 {
                    margin: 0;
                    font-size: 18px;
                }
                
                .close-btn {
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    color: white;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    font-size: 20px;
                    cursor: pointer;
                }
                
                .modal-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                }
                
                .team-stats {
                    background: #f8f9fa;
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 16px;
                    display: flex;
                    justify-content: space-around;
                    text-align: center;
                }
                
                .stat-item {
                    flex: 1;
                }
                
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #667eea;
                }
                
                .stat-label {
                    font-size: 12px;
                    color: #6c757d;
                    margin-top: 4px;
                }
                
                .pitch-view {
                    background: linear-gradient(to bottom, #2ecc71, #27ae60);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                
                .pitch-row {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    margin-bottom: 16px;
                }
                
                .player-card {
                    background: white;
                    border-radius: 8px;
                    padding: 8px;
                    text-align: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    position: relative;
                    min-width: 70px;
                }
                
                .player-photo {
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    margin: 0 auto 4px;
                    background: #e9ecef;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                }
                
                .player-photo img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                
                .player-name {
                    font-size: 10px;
                    font-weight: 600;
                    margin-bottom: 2px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .player-points {
                    font-size: 14px;
                    font-weight: bold;
                    color: #667eea;
                }
                
                .captain-badge, .vice-badge {
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    background: #ff6b6b;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                }
                
                .vice-badge {
                    background: #4ecdc4;
                }
                
                .bench-section {
                    background: #f8f9fa;
                    border-radius: 8px;
                    padding: 12px;
                }
                
                .bench-label {
                    font-size: 12px;
                    font-weight: 600;
                    color: #6c757d;
                    margin-bottom: 8px;
                }
                
                .bench-players {
                    display: flex;
                    gap: 8px;
                    overflow-x: auto;
                }
                
                .chip-active {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    display: inline-block;
                    margin-bottom: 12px;
                }
            `;
            document.head.appendChild(styles);
        }
    }
    
    showLoader() {
        const content = document.getElementById('teamViewerContent');
        const title = document.getElementById('teamViewerTitle');
        
        title.textContent = 'Loading...';
        content.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 300px;">
                <div class="loader" style="
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #667eea;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                "></div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
    }
    
    showError(message) {
        const content = document.getElementById('teamViewerContent');
        const title = document.getElementById('teamViewerTitle');
        
        title.textContent = 'Error';
        content.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #dc3545;">
                <p>${message}</p>
            </div>
        `;
    }
    
    calculatePlayerPoints(playerId) {
        const playerLive = this.livePoints[playerId];
        if (!playerLive) return 0;
        
        let points = playerLive.stats?.total_points || 0;
        
        // Apply captain multiplier
        if (playerId === this.submission.captain_id) {
            points *= this.submission.chip_used === 'triple_captain' ? 3 : 2;
        }
        // Apply vice-captain multiplier (if captain didn't play)
        else if (playerId === this.submission.vice_captain_id) {
            const captainLive = this.livePoints[this.submission.captain_id];
            if (captainLive && captainLive.stats?.minutes === 0) {
                points *= 2;
            }
        }
        
        // Apply chip effects for specific positions
        const player = this.playerData.get(playerId);
        if (player) {
            if (this.submission.chip_used === 'attack_chip') {
                if (player.position === 3 || player.position === 4) {
                    points *= 2;
                }
            } else if (this.submission.chip_used === 'park_the_bus') {
                if (player.position === 1 || player.position === 2) {
                    points *= 2;
                }
            }
        }
        
        return points;
    }
    
    calculateTotalPoints() {
        let total = 0;
        
        // Starting 11 points
        if (this.submission.starting_11) {
            this.submission.starting_11.forEach(playerId => {
                total += this.calculatePlayerPoints(playerId);
            });
        }
        
        // Bench points if bench boost
        if (this.submission.chip_used === 'bench_boost' && this.submission.bench) {
            this.submission.bench.forEach(playerId => {
                const playerLive = this.livePoints[playerId];
                if (playerLive) {
                    total += playerLive.stats?.total_points || 0;
                }
            });
        }
        
        // Apply global multipliers
        if (this.submission.chip_used === 'double_up') {
            total *= 2;
        } else if (this.submission.chip_used === 'negative_chip') {
            total /= 2;
        }
        
        return Math.round(total * 10) / 10; // Round to 1 decimal
    }
    
    renderTeam() {
        const title = document.getElementById('teamViewerTitle');
        const content = document.getElementById('teamViewerContent');
        
        title.textContent = `${this.teamName} - GW${this.currentGameweek}`;
        
        // Group players by position
        const positions = { 1: [], 2: [], 3: [], 4: [] };
        const benchPlayers = [];
        
        if (this.submission.starting_11) {
            this.submission.starting_11.forEach(playerId => {
                const player = this.playerData.get(playerId) || { id: playerId };
                const pos = player.position || player.element_type || 1;
                positions[pos] = positions[pos] || [];
                positions[pos].push(player);
            });
        }
        
        if (this.submission.bench) {
            this.submission.bench.forEach(playerId => {
                const player = this.playerData.get(playerId) || { id: playerId };
                benchPlayers.push(player);
            });
        }
        
        const totalPoints = this.calculateTotalPoints();
        
        content.innerHTML = `
            ${this.submission.chip_used ? `<div class="chip-active">Chip: ${this.getChipName(this.submission.chip_used)}</div>` : ''}
            
            <div class="team-stats">
                <div class="stat-item">
                    <div class="stat-value">${totalPoints}</div>
                    <div class="stat-label">Total Points</div>
                </div>
            </div>
            
            <div class="pitch-view">
                <!-- Forwards -->
                <div class="pitch-row">
                    ${this.renderPositionRow(positions[4] || [], 4)}
                </div>
                
                <!-- Midfielders -->
                <div class="pitch-row">
                    ${this.renderPositionRow(positions[3] || [], 3)}
                </div>
                
                <!-- Defenders -->
                <div class="pitch-row">
                    ${this.renderPositionRow(positions[2] || [], 2)}
                </div>
                
                <!-- Goalkeeper -->
                <div class="pitch-row">
                    ${this.renderPositionRow(positions[1] || [], 1)}
                </div>
            </div>
            
            ${benchPlayers.length > 0 ? `
                <div class="bench-section">
                    <div class="bench-label">BENCH</div>
                    <div class="bench-players">
                        ${benchPlayers.map(player => this.renderPlayer(player, true)).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }
    
    renderPositionRow(players, position) {
        if (players.length === 0) return '';
        return players.map(player => this.renderPlayer(player, false)).join('');
    }
    
    renderPlayer(player, isBench = false) {
        const points = isBench && this.submission.chip_used !== 'bench_boost' ? 
                      '-' : this.calculatePlayerPoints(player.id);
        const isCaptain = player.id === this.submission.captain_id;
        const isViceCaptain = player.id === this.submission.vice_captain_id;
        
        return `
            <div class="player-card">
                ${isCaptain ? '<div class="captain-badge">C</div>' : ''}
                ${isViceCaptain ? '<div class="vice-badge">V</div>' : ''}
                <div class="player-photo">
                    ${player.photo ? 
                        `<img src="https://resources.premierleague.com/premierleague25/photos/players/110x140/${player.photo.replace('.jpg', '').replace('.png', '')}.png" 
                             onerror="this.style.display='none'; this.parentElement.innerHTML='${(player.web_name || 'P').substring(0, 2).toUpperCase()}'">` :
                        `<span>${(player.web_name || 'P').substring(0, 2).toUpperCase()}</span>`
                    }
                </div>
                <div class="player-name">${player.web_name || 'Unknown'}</div>
                <div class="player-points">${points}pts</div>
            </div>
        `;
    }
    
    getChipName(chipId) {
        const chips = {
            'brahmasthra': 'Brahmasthra',
            'triple_captain': 'Triple Captain',
            'attack_chip': 'Attack Chip',
            'negative_chip': 'Negative Chip',
            'double_up': 'Double Up',
            'bench_boost': 'Bench Boost',
            'park_the_bus': 'Park the Bus'
        };
        return chips[chipId] || chipId;
    }
    
    close() {
        const modal = document.getElementById('teamViewerModal');
        if (modal) {
            modal.remove();
        }
    }
}

// Create global instance
window.mobileTeamViewer = new MobileTeamViewer();