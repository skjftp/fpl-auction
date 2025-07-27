// API utility functions
class API {
    constructor() {
        // Use environment-specific API URL
        this.baseURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/api'
            : 'BACKEND_URL_PLACEHOLDER/api';
        this.token = localStorage.getItem('fpl_token');
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('fpl_token', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('fpl_token');
        localStorage.removeItem('fpl_team');
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // Auth endpoints
    async login(username, password) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        if (response.success) {
            this.setToken(response.token);
            localStorage.setItem('fpl_team', JSON.stringify(response.team));
        }
        
        return response;
    }

    async initializeTeams() {
        return await this.request('/auth/init-teams', { method: 'POST' });
    }

    async getAllTeams() {
        return await this.request('/auth/teams');
    }

    // Player endpoints
    async syncFPLData() {
        return await this.request('/players/sync-fpl-data', { method: 'POST' });
    }

    async getPlayers(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/players?${params}`);
    }

    async getClubs() {
        return await this.request('/players/clubs');
    }

    async getPositions() {
        return await this.request('/players/positions');
    }

    // Auction endpoints
    async startPlayerAuction(playerId) {
        return await this.request(`/auction/start-player/${playerId}`, { method: 'POST' });
    }

    async startClubAuction(clubId) {
        return await this.request(`/auction/start-club/${clubId}`, { method: 'POST' });
    }

    async placeBid(auctionId, bidAmount) {
        return await this.request(`/auction/bid/${auctionId}`, {
            method: 'POST',
            body: JSON.stringify({ bidAmount })
        });
    }

    async completeAuction(auctionId) {
        return await this.request(`/auction/complete/${auctionId}`, { method: 'POST' });
    }

    async getActiveAuctions() {
        return await this.request('/auction/active');
    }

    // Team endpoints
    async getTeamSquad(teamId) {
        return await this.request(`/teams/${teamId}/squad`);
    }

    async getTeamInfo(teamId) {
        return await this.request(`/teams/${teamId}`);
    }

    async canTeamBuy(teamId, type, position) {
        const params = new URLSearchParams({ type, ...(position && { position }) });
        return await this.request(`/teams/${teamId}/can-buy?${params}`);
    }

    async getTeamsLeaderboard() {
        return await this.request('/teams');
    }

    // Scoring endpoints
    async updateGameweekScores(gameweek) {
        return await this.request(`/scoring/update-gameweek/${gameweek}`, { method: 'POST' });
    }

    async getTeamGameweekScores(teamId, gameweek) {
        return await this.request(`/scoring/team/${teamId}/gameweek/${gameweek}`);
    }

    async getLeaderboard(gameweek = null) {
        const params = gameweek ? `?gameweek=${gameweek}` : '';
        return await this.request(`/scoring/leaderboard${params}`);
    }

    async getCurrentGameweek() {
        return await this.request('/scoring/current-gameweek');
    }
}

// Global API instance
window.api = new API();