// Team management functionality
class TeamManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            // Tab click listener
            const myTeamTab = document.querySelector('[data-tab="myTeam"]');
            if (myTeamTab) {
                myTeamTab.addEventListener('click', () => {
                    setTimeout(() => {
                        this.loadTeamSquad();
                        this.populateTeamDropdown();
                    }, 100);
                });
            }

            // Team selector listener
            const teamSelector = document.getElementById('teamSelector');
            if (teamSelector) {
                teamSelector.addEventListener('change', (e) => {
                    const selectedTeamId = e.target.value;
                    if (selectedTeamId) {
                        this.loadSelectedTeamSquad(selectedTeamId);
                    } else {
                        this.loadTeamSquad();
                    }
                });
            }
        });
    }

    async loadTeamData() {
        const team = JSON.parse(localStorage.getItem('fpl_team') || '{}');
        if (team.id) {
            try {
                const teamData = await window.api.getTeamInfo(team.id);
                this.currentUser = teamData;
                if (window.app) {
                    window.app.currentUser = teamData;
                    window.app.updateNavbar();
                }
                
                // Update localStorage
                localStorage.setItem('fpl_team', JSON.stringify(teamData));
                return teamData;
            } catch (error) {
                console.error('Error loading team data:', error);
            }
        }
        return null;
    }

    async populateTeamDropdown() {
        try {
            const teamSelector = document.getElementById('teamSelector');
            if (!teamSelector) return;
            
            // Get all teams
            const teams = await window.api.getTeamsLeaderboard();
            
            // Clear and rebuild options
            teamSelector.innerHTML = '<option value="">My Squad</option>';
            
            if (Array.isArray(teams)) {
                teams.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = team.name;
                    teamSelector.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error populating team dropdown:', error);
        }
    }

    async loadTeamSquad() {
        try {
            // Get current user data if not available
            if (!this.currentUser) {
                const team = JSON.parse(localStorage.getItem('fpl_team') || '{}');
                if (team.id) {
                    this.currentUser = team;
                } else {
                    return;
                }
            }
            
            const squad = await window.api.getTeamSquad(this.currentUser.id);
            this.renderTeamSquad(squad);
        } catch (error) {
            console.error('Error loading team squad:', error);
            this.renderError();
        }
    }
    
    async loadSelectedTeamSquad(teamId) {
        try {
            const selectedTeamId = teamId || this.currentUser.id;
            const squad = await window.api.getTeamSquad(selectedTeamId);
            this.renderTeamSquad(squad);
        } catch (error) {
            console.error('Error loading selected team squad:', error);
            this.renderError();
        }
    }

    renderTeamSquad(squad) {
        const container = document.getElementById('mySquad');
        const squadCountEl = document.getElementById('squadCount');
        const clubCountEl = document.getElementById('clubCount');
        
        if (!container) return;

        // Update counts
        const playerCount = squad.players?.length || 0;
        const clubCount = squad.clubs?.length || 0;
        
        if (squadCountEl) squadCountEl.textContent = `${playerCount}/15 Players`;
        if (clubCountEl) clubCountEl.textContent = `${clubCount}/2 Clubs`;

        // Group players by position
        const positions = {
            'GKP': [],
            'DEF': [],
            'MID': [],
            'FWD': []
        };

        squad.players?.forEach(player => {
            // Map position numbers to names
            let positionName;
            if (player.position === 1 || player.position === 'GKP') positionName = 'GKP';
            else if (player.position === 2 || player.position === 'DEF') positionName = 'DEF';
            else if (player.position === 3 || player.position === 'MID') positionName = 'MID';
            else if (player.position === 4 || player.position === 'FWD') positionName = 'FWD';
            else positionName = player.element_type_name || 'Unknown';
            
            if (positions[positionName]) {
                positions[positionName].push(player);
            }
        });

        // Render formation view
        container.innerHTML = this.renderFormationView(positions, squad.clubs);
    }

    renderFormationView(positions, clubs) {
        const gkps = positions['GKP'] || [];
        const defs = positions['DEF'] || [];
        const mids = positions['MID'] || [];
        const fwds = positions['FWD'] || [];

        // Create club color mapping
        const clubColors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
            '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
        ];
        const clubColorMap = new Map();
        let colorIndex = 0;

        // Assign colors to clubs
        [...gkps, ...defs, ...mids, ...fwds].forEach(player => {
            if (player && player.team_name && !clubColorMap.has(player.team_name)) {
                clubColorMap.set(player.team_name, clubColors[colorIndex % clubColors.length]);
                colorIndex++;
            }
        });

        // Fill empty slots
        const fillEmptySlots = (players, maxCount) => {
            const filled = [...players];
            while (filled.length < maxCount) {
                filled.push(null);
            }
            return filled;
        };

        const renderPlayer = (player, isEmpty = false) => {
            if (isEmpty || !player) {
                return `
                    <div class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-3 text-center">
                        <div class="text-sm text-gray-500">Empty</div>
                    </div>
                `;
            }
            
            const clubColor = clubColorMap.get(player.team_name) || '#6b7280';
            return `
                <div class="bg-white border-2 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow" style="border-color: ${clubColor};">
                    <div class="font-semibold text-sm text-gray-900">${player.web_name || player.name || 'Unknown'}</div>
                    <div class="text-xs text-gray-600 mt-1">£${player.price_paid || 0}m</div>
                    <div class="text-xs mt-1" style="color: ${clubColor};">${player.team_name || ''}</div>
                </div>
            `;
        };

        const renderClub = (club, isEmpty = false) => {
            if (isEmpty || !club) {
                return `
                    <div class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-500">Empty Club Slot</div>
                    </div>
                `;
            }
            return `
                <div class="bg-purple-50 border-2 border-purple-300 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div class="font-semibold text-purple-900">${club.name || 'Unknown'}</div>
                    <div class="text-sm text-purple-700 mt-1">£${club.price_paid || 0}m</div>
                </div>
            `;
        };

        return `
            <div class="space-y-6">
                <!-- Formation View -->
                <div class="bg-gradient-to-b from-green-400 to-green-600 rounded-lg p-6">
                    <!-- Forwards -->
                    <div class="grid grid-cols-3 gap-3 mb-4">
                        ${fillEmptySlots(fwds, 3).map(player => renderPlayer(player)).join('')}
                    </div>
                    
                    <!-- Midfielders -->
                    <div class="grid grid-cols-5 gap-3 mb-4">
                        ${fillEmptySlots(mids, 5).map(player => renderPlayer(player)).join('')}
                    </div>
                    
                    <!-- Defenders -->
                    <div class="grid grid-cols-5 gap-3 mb-4">
                        ${fillEmptySlots(defs, 5).map(player => renderPlayer(player)).join('')}
                    </div>
                    
                    <!-- Goalkeepers -->
                    <div class="grid grid-cols-2 gap-3 mx-auto max-w-xs">
                        ${fillEmptySlots(gkps, 2).map(player => renderPlayer(player)).join('')}
                    </div>
                </div>
                
                <!-- Clubs Section -->
                <div class="bg-purple-100 rounded-lg p-4">
                    <h4 class="text-sm font-semibold text-purple-900 mb-3">Clubs</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${fillEmptySlots(clubs || [], 2).map(club => renderClub(club)).join('')}
                    </div>
                </div>
                
                <!-- Budget Summary -->
                <div class="bg-gray-100 rounded-lg p-4">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-700">Total Spent:</span>
                        <span class="text-lg font-bold text-gray-900">
                            £${this.calculateTotalSpent(positions, clubs)}m
                        </span>
                    </div>
                    <div class="flex justify-between items-center mt-2">
                        <span class="text-sm font-medium text-gray-700">Remaining Budget:</span>
                        <span class="text-lg font-bold text-emerald-600">
                            £${(1000 - this.calculateTotalSpent(positions, clubs)).toFixed(1)}m
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    calculateTotalSpent(positions, clubs) {
        let total = 0;
        
        // Sum player costs
        Object.values(positions).forEach(players => {
            players.forEach(player => {
                if (player && player.price_paid) {
                    total += parseFloat(player.price_paid);
                }
            });
        });
        
        // Sum club costs
        if (clubs) {
            clubs.forEach(club => {
                if (club && club.price_paid) {
                    total += parseFloat(club.price_paid);
                }
            });
        }
        
        return total.toFixed(1);
    }

    renderError() {
        const container = document.getElementById('mySquad');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-red-500 mb-2">Failed to load team data</div>
                    <button onclick="window.teamManager.loadTeamSquad()" 
                            class="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    async checkSquadLimits(type, position) {
        const team = JSON.parse(localStorage.getItem('fpl_team') || '{}');
        if (team.id) {
            try {
                return await window.api.canTeamBuy(team.id, type, position);
            } catch (error) {
                console.error('Error checking squad limits:', error);
                return { canBuy: false, reason: 'Error checking limits' };
            }
        }
        return { canBuy: false, reason: 'No team selected' };
    }
}

// Global team manager
window.teamManager = new TeamManager();