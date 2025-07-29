// Team management functionality
class TeamManager {
    constructor() {
        this.teamData = null;
    }

    async loadTeamData() {
        const team = JSON.parse(localStorage.getItem('fpl_team') || '{}');
        if (team.id) {
            try {
                this.teamData = await api.getTeamInfo(team.id);
                window.app.currentUser = this.teamData;
                window.app.updateNavbar();
                
                // Update localStorage
                localStorage.setItem('fpl_team', JSON.stringify(this.teamData));
            } catch (error) {
                console.error('Error loading team data:', error);
            }
        }
    }

    async checkSquadLimits(type, position) {
        const team = JSON.parse(localStorage.getItem('fpl_team') || '{}');
        if (team.id) {
            try {
                return await api.canTeamBuy(team.id, type, position);
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