// API utility functions
class API {
    constructor() {
        // Production API URL - FPL Auction Backend on Google Cloud Run
        const PRODUCTION_API_URL = 'https://fpl-auction-backend-mrlyxa4xiq-uc.a.run.app/api';
        
        this.baseURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/api'
            : PRODUCTION_API_URL;
        this.token = localStorage.getItem('fpl_token');
        
        console.log('API Base URL:', this.baseURL);
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
                headers,
                credentials: 'include' // Include cookies for CORS requests
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

    async placeBid(auctionId, bidAmount, isAutoBid = false) {
        return await this.request(`/auction/bid/${auctionId}`, {
            method: 'POST',
            body: JSON.stringify({ bidAmount, isAutoBid })
        });
    }

    // Auto-bid configuration endpoints
    async saveAutoBidConfig(config) {
        return await this.request('/autobid/config', {
            method: 'POST',
            body: JSON.stringify(config)
        });
    }

    async getAutoBidConfig() {
        return await this.request('/autobid/config');
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

    // Draft endpoints
    async getDraftState() {
        return await this.request('/draft/state');
    }

    async initializeDraft() {
        return await this.request('/draft/initialize', { method: 'POST' });
    }

    async startDraft() {
        return await this.request('/draft/start', { method: 'POST' });
    }

    async canStartAuction() {
        return await this.request('/draft/can-start-auction');
    }


    async getChatMessages() {
        return await this.request('/draft/chat');
    }

    async sendChatMessage(message) {
        return await this.request('/draft/chat', {
            method: 'POST',
            body: JSON.stringify({ message })
        });
    }

    // Admin auction management endpoints
    async restartCompletedAuction(auctionId) {
        return await this.request(`/admin/auction/restart/${auctionId}`, { method: 'POST' });
    }

    async cancelPreviousBid(auctionId) {
        return await this.request(`/admin/auction/cancel-bid/${auctionId}`, { method: 'POST' });
    }

    async getCompletedAuctions() {
        return await this.request('/admin/auctions/completed');
    }

    async getActiveAuctionWithBids() {
        return await this.request('/admin/auction/current-with-bids');
    }
}

// Global API instance
window.api = new API();