// Main application logic
class App {
    constructor() {
        this.currentUser = null;
        this.currentTab = 'auction';
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
    }

    bindEvents() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            this.handleLogin(e);
        });

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }

    checkAuthStatus() {
        const token = localStorage.getItem('fpl_token');
        const team = localStorage.getItem('fpl_team');
        
        if (token && team) {
            try {
                this.currentUser = JSON.parse(team);
                this.showMainApp();
                window.socketManager.connect();
            } catch (error) {
                console.error('Error parsing stored team data:', error);
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('loginBtn');
        
        btn.textContent = 'Logging in...';
        btn.disabled = true;
        
        try {
            const response = await api.login(username, password);
            
            if (response.success) {
                this.currentUser = response.team;
                this.showMainApp();
                window.socketManager.connect();
                showNotification(`Welcome, ${response.team.name}!`, 'success');
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification(error.message, 'error');
        } finally {
            btn.textContent = 'Login';
            btn.disabled = false;
        }
    }

    logout() {
        api.clearToken();
        this.currentUser = null;
        window.socketManager.disconnect();
        this.showLogin();
        showNotification('Logged out successfully', 'success');
    }

    showLogin() {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
        document.getElementById('navbar').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('navbar').classList.remove('hidden');
        
        this.updateNavbar();
        this.switchTab(this.currentTab);
    }

    updateNavbar() {
        if (this.currentUser) {
            document.getElementById('teamName').textContent = this.currentUser.name;
            document.getElementById('teamBudget').textContent = `£${this.currentUser.budget}`;
        }
    }

    async refreshTeamBudget() {
        if (this.currentUser) {
            try {
                const teamInfo = await api.getTeamInfo(this.currentUser.id);
                this.currentUser.budget = teamInfo.budget;
                this.updateNavbar();
                
                // Update localStorage
                localStorage.setItem('fpl_team', JSON.stringify(this.currentUser));
            } catch (error) {
                console.error('Error refreshing team budget:', error);
            }
        }
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.classList.add('border-transparent', 'text-gray-500');
            btn.classList.remove('border-green-500', 'text-green-600');
        });
        
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.classList.remove('border-transparent', 'text-gray-500');
            activeBtn.classList.add('border-green-500', 'text-green-600');
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        const activeContent = document.getElementById(`${tabName}Tab`);
        if (activeContent) {
            activeContent.classList.remove('hidden');
        }

        this.currentTab = tabName;
        this.loadTabContent(tabName);
    }

    async loadTabContent(tabName) {
        switch (tabName) {
            case 'auction':
                // Auction content is loaded by AuctionManager
                break;
                
            case 'myTeam':
                await this.loadMyTeam();
                break;
                
            case 'scoring':
                await this.loadScoring();
                break;
                
            case 'leaderboard':
                await this.loadLeaderboard();
                break;
        }
    }

    async loadMyTeam() {
        if (!this.currentUser) return;
        
        try {
            const squad = await api.getTeamSquad(this.currentUser.id);
            this.displayMyTeam(squad);
        } catch (error) {
            console.error('Error loading team:', error);
            showNotification('Failed to load team data', 'error');
        }
    }

    displayMyTeam(squad) {
        const container = document.getElementById('mySquad');
        
        const totalSpent = squad.totalSpent || 0;
        const remainingBudget = 1000 - totalSpent;
        
        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Squad Overview -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h4 class="font-semibold mb-4">Squad Overview</h4>
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span>Players:</span>
                            <span>${squad.counts.players}/15</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Clubs:</span>
                            <span>${squad.counts.clubs}/2</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Goalkeepers:</span>
                            <span>${squad.counts.gkp}/2</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Defenders:</span>
                            <span>${squad.counts.def}/5</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Midfielders:</span>
                            <span>${squad.counts.mid}/5</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Forwards:</span>
                            <span>${squad.counts.fwd}/3</span>
                        </div>
                        <hr class="my-2">
                        <div class="flex justify-between font-semibold">
                            <span>Total Spent:</span>
                            <span>£${totalSpent}</span>
                        </div>
                        <div class="flex justify-between font-semibold">
                            <span>Remaining:</span>
                            <span class="${remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}">£${remainingBudget}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Squad Formation -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h4 class="font-semibold mb-4">Formation</h4>
                    <div class="squad-formation">
                        <!-- Goalkeepers -->
                        <div class="formation-row">
                            ${this.renderPositionSlots(squad.positions[1] || [], 2, 'GKP')}
                        </div>
                        <!-- Defenders -->
                        <div class="formation-row">
                            ${this.renderPositionSlots(squad.positions[2] || [], 5, 'DEF')}
                        </div>
                        <!-- Midfielders -->
                        <div class="formation-row">
                            ${this.renderPositionSlots(squad.positions[3] || [], 5, 'MID')}
                        </div>
                        <!-- Forwards -->
                        <div class="formation-row">
                            ${this.renderPositionSlots(squad.positions[4] || [], 3, 'FWD')}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Players List -->
            ${squad.players.length > 0 ? `
                <div class="mt-6">
                    <h4 class="font-semibold mb-4">My Players</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${squad.players.map(player => `
                            <div class="bg-white p-4 rounded border">
                                <div class="flex items-center space-x-3">
                                    <div class="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                        ${player.photo ? 
                                            `<img src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.photo.replace('.jpg', '')}.png" 
                                                  alt="${player.web_name}" class="w-full h-full object-cover rounded-full">` :
                                            '<span class="text-xs font-bold">' + player.web_name.substring(0, 2) + '</span>'
                                        }
                                    </div>
                                    <div class="flex-1">
                                        <div class="font-medium">${player.web_name}</div>
                                        <div class="text-sm text-gray-500">${player.player_club_name}</div>
                                        <div class="text-sm font-semibold text-green-600">£${player.price_paid}</div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Clubs -->
            ${squad.clubs.length > 0 ? `
                <div class="mt-6">
                    <h4 class="font-semibold mb-4">My Clubs</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${squad.clubs.map(club => `
                            <div class="bg-white p-4 rounded border">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <div class="font-medium">${club.club_name}</div>
                                        <div class="text-sm text-gray-500">${club.club_short_name}</div>
                                    </div>
                                    <div class="text-sm font-semibold text-green-600">£${club.price_paid}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }

    renderPositionSlots(players, maxSlots, positionName) {
        const slots = [];
        
        // Add filled slots
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            slots.push(`
                <div class="player-slot filled" title="${player.web_name}">
                    ${player.web_name.substring(0, 3)}
                </div>
            `);
        }
        
        // Add empty slots
        for (let i = players.length; i < maxSlots; i++) {
            slots.push(`
                <div class="player-slot">
                    ${positionName}
                </div>
            `);
        }
        
        return slots.join('');
    }

    async loadScoring() {
        const container = document.getElementById('scoringContent');
        container.innerHTML = `
            <div class="text-center py-8">
                <p class="text-gray-500">Scoring system will be implemented here</p>
                <p class="text-sm text-gray-400 mt-2">Coming soon...</p>
            </div>
        `;
    }

    async loadLeaderboard() {
        try {
            const teams = await api.getTeamsLeaderboard();
            this.displayLeaderboard(teams);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            showNotification('Failed to load leaderboard', 'error');
        }
    }

    displayLeaderboard(teams) {
        const container = document.getElementById('leaderboardContent');
        
        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-4 py-3 text-left">Rank</th>
                            <th class="px-4 py-3 text-left">Team</th>
                            <th class="px-4 py-3 text-right">Players</th>
                            <th class="px-4 py-3 text-right">Clubs</th>
                            <th class="px-4 py-3 text-right">Spent</th>
                            <th class="px-4 py-3 text-right">Remaining</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teams.map((team, index) => `
                            <tr class="border-b ${team.id === this.currentUser?.id ? 'bg-green-50' : ''}">
                                <td class="px-4 py-3">${index + 1}</td>
                                <td class="px-4 py-3 font-medium">${team.name}</td>
                                <td class="px-4 py-3 text-right">${team.player_count}/15</td>
                                <td class="px-4 py-3 text-right">${team.club_count}/2</td>
                                <td class="px-4 py-3 text-right">£${team.total_spent}</td>
                                <td class="px-4 py-3 text-right">£${team.budget}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});