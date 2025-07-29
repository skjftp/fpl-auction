// Scoring system functionality
class ScoringManager {
    constructor() {
        this.currentGameweek = null;
        this.gameweeks = [];
    }

    async loadCurrentGameweek() {
        try {
            const response = await api.getCurrentGameweek();
            this.currentGameweek = response.current;
            this.gameweeks = response.all;
            return response;
        } catch (error) {
            console.error('Error loading current gameweek:', error);
            throw error;
        }
    }

    async updateGameweekScores(gameweek) {
        try {
            return await api.updateGameweekScores(gameweek);
        } catch (error) {
            console.error('Error updating gameweek scores:', error);
            throw error;
        }
    }

    async getTeamScores(teamId, gameweek) {
        try {
            return await api.getTeamGameweekScores(teamId, gameweek);
        } catch (error) {
            console.error('Error getting team scores:', error);
            throw error;
        }
    }

    async getOverallLeaderboard(gameweek = null) {
        try {
            return await api.getLeaderboard(gameweek);
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            throw error;
        }
    }
}

// Global scoring manager
window.scoringManager = new ScoringManager();