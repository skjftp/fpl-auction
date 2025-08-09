// Mobile API Client for FPL Auction
class MobileAPI {
    constructor() {
        // Use production backend URL
        this.baseURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/api'
            : 'https://fpl-auction-backend-945963649649.us-central1.run.app/api';
        this.token = localStorage.getItem('fpl_token');
    }

    // Authentication
    async login(username, password) {
        try {
            const response = await fetch(`${this.baseURL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Login failed');
            }

            const data = await response.json();
            this.token = data.token;
            localStorage.setItem('fpl_token', this.token);
            localStorage.setItem('fpl_team', JSON.stringify(data.team));
            
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    logout() {
        this.token = null;
        localStorage.removeItem('fpl_token');
        localStorage.removeItem('fpl_team');
    }

    // Get current user
    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('fpl_team') || '{}');
        } catch {
            return {};
        }
    }

    // Helper method for making authenticated requests
    async makeRequest(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Request failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Request error:', error);
            throw error;
        }
    }

    // Teams
    async getTeam(teamId) {
        try {
            const response = await fetch(`${this.baseURL}/teams/${teamId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch team data');
            }

            return await response.json();
        } catch (error) {
            console.error('Get team error:', error);
            throw error;
        }
    }

    async getTeamSquad(teamId) {
        try {
            const response = await fetch(`${this.baseURL}/teams/${teamId}/squad`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch team squad');
            }

            return await response.json();
        } catch (error) {
            console.error('Get team squad error:', error);
            throw error;
        }
    }

    async getAllTeams() {
        try {
            const response = await fetch(`${this.baseURL}/teams`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch teams');
            }

            return await response.json();
        } catch (error) {
            console.error('Get all teams error:', error);
            return [];
        }
    }

    // Players
    async getPlayers() {
        try {
            const response = await fetch(`${this.baseURL}/players`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch players');
            }

            return await response.json();
        } catch (error) {
            console.error('Get players error:', error);
            throw error;
        }
    }

    async getClubs() {
        try {
            const response = await fetch(`${this.baseURL}/players/clubs`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch clubs');
            }

            return await response.json();
        } catch (error) {
            console.error('Get clubs error:', error);
            throw error;
        }
    }

    // Auction
    async getActiveAuctions() {
        try {
            const response = await fetch(`${this.baseURL}/auction/active`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch active auctions');
            }

            return await response.json();
        } catch (error) {
            console.error('Get active auctions error:', error);
            throw error;
        }
    }

    async startPlayerAuction(playerId) {
        try {
            const response = await fetch(`${this.baseURL}/auction/start-player/${playerId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to start auction');
            }

            return await response.json();
        } catch (error) {
            console.error('Start player auction error:', error);
            throw error;
        }
    }

    async startClubAuction(clubId) {
        try {
            const response = await fetch(`${this.baseURL}/auction/start-club/${clubId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to start club auction');
            }

            return await response.json();
        } catch (error) {
            console.error('Start club auction error:', error);
            throw error;
        }
    }

    async placeBid(auctionId, bidAmount, isAutoBid = false) {
        try {
            const response = await fetch(`${this.baseURL}/auction/bid/${auctionId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ bidAmount, isAutoBid })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to place bid');
            }

            return await response.json();
        } catch (error) {
            console.error('Place bid error:', error);
            throw error;
        }
    }

    async updateSellingStage(auctionId, stage) {
        try {
            const response = await fetch(`${this.baseURL}/auction/selling-stage/${auctionId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ stage })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update selling stage');
            }

            return await response.json();
        } catch (error) {
            console.error('Update selling stage error:', error);
            throw error;
        }
    }

    async requestWait(auctionId) {
        try {
            const response = await fetch(`${this.baseURL}/auction/request-wait/${auctionId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to request wait');
            }

            return await response.json();
        } catch (error) {
            console.error('Request wait error:', error);
            throw error;
        }
    }

    async handleWaitRequest(auctionId, action) {
        try {
            const response = await fetch(`${this.baseURL}/auction/handle-wait/${auctionId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to handle wait request');
            }

            return await response.json();
        } catch (error) {
            console.error('Handle wait request error:', error);
            throw error;
        }
    }

    // Draft
    async getDraftState() {
        try {
            const response = await fetch(`${this.baseURL}/draft/state`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch draft state');
            }

            return await response.json();
        } catch (error) {
            console.error('Get draft state error:', error);
            throw error;
        }
    }

    async canStartAuction() {
        try {
            const response = await fetch(`${this.baseURL}/draft/can-start-auction`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to check auction permission');
            }

            return await response.json();
        } catch (error) {
            console.error('Can start auction error:', error);
            return { can_start: false };
        }
    }

    // Chat
    async getChatMessages() {
        try {
            console.log('📡 Mobile API: Fetching chat messages from:', `${this.baseURL}/draft/chat`);
            console.log('📡 Mobile API: Using token:', this.token ? 'Token present' : 'No token!');
            const response = await fetch(`${this.baseURL}/draft/chat`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch chat messages');
            }

            return await response.json();
        } catch (error) {
            console.error('Get chat messages error:', error);
            throw error;
        }
    }

    async sendChatMessage(message) {
        try {
            const response = await fetch(`${this.baseURL}/draft/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to send message');
            }

            return await response.json();
        } catch (error) {
            console.error('Send chat message error:', error);
            throw error;
        }
    }

    // Get bid history
    async getBidHistory() {
        try {
            const response = await fetch(`${this.baseURL}/auction/bid-history`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch bid history');
            }

            const data = await response.json();
            return data.bids || [];
        } catch (error) {
            console.error('Get bid history error:', error);
            return [];
        }
    }

    // Auto-bid
    async getAutoBidConfig() {
        try {
            const response = await fetch(`${this.baseURL}/autobid/config`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch auto-bid config');
            }

            return await response.json();
        } catch (error) {
            console.error('Get auto-bid config error:', error);
            throw error;
        }
    }

    async saveAutoBidConfig(config) {
        try {
            const response = await fetch(`${this.baseURL}/autobid/config`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save auto-bid config');
            }

            return await response.json();
        } catch (error) {
            console.error('Save auto-bid config error:', error);
            throw error;
        }
    }

    // Sold items
    async getSoldItems() {
        try {
            const response = await fetch(`${this.baseURL}/teams/sold-items`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch sold items');
            }

            return await response.json();
        } catch (error) {
            console.error('Get sold items error:', error);
            throw error;
        }
    }

    // Change password
    async changePassword(currentPassword, newPassword) {
        try {
            const response = await fetch(`${this.baseURL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to change password');
            }

            return await response.json();
        } catch (error) {
            console.error('Error changing password:', error);
            throw error;
        }
    }

    // Gameweek endpoints
    async getCurrentGameweek() {
        return this.makeRequest('/gameweek-info/current');
    }

    async getAllGameweeks() {
        return this.makeRequest('/gameweek-info');
    }

    async submitTeam(submission) {
        return this.makeRequest('/gameweek-teams/submit', {
            method: 'POST',
            body: JSON.stringify(submission)
        });
    }

    async getTeamSubmission(gameweek) {
        return this.makeRequest(`/gameweek-teams/submission/${gameweek}`);
    }

    async getChipStatus() {
        return this.makeRequest('/gameweek-teams/chips/status');
    }
    
    async getGameweekInfo(gameweek) {
        return this.makeRequest(`/gameweek-info/${gameweek}`);
    }
    
    async updateGameweekDeadlines() {
        return this.makeRequest('/gameweek-info/update-deadlines', {
            method: 'POST'
        });
    }

    async getGameweekPoints(gameweek) {
        return this.makeRequest(`/gameweek/points/${gameweek}`);
    }

    async getLeaderboard(gameweek = 'overall') {
        return this.makeRequest(`/leaderboard/${gameweek}`);
    }

    async getPointsBreakdown(teamId, gameweek) {
        return this.makeRequest(`/points/breakdown/${teamId}/${gameweek}`);
    }
}

// Global API instance
window.mobileAPI = new MobileAPI();