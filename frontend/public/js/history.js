// History tab management
class HistoryManager {
    constructor() {
        this.historyData = [];
        this.filteredData = [];
        this.currentFilter = 'bids';
        this.searchTerm = '';
        this.init();
    }

    init() {
        // Load history when tab is shown
        document.addEventListener('DOMContentLoaded', () => {
            const historyTab = document.querySelector('[data-tab="history"]');
            if (historyTab) {
                historyTab.addEventListener('click', () => {
                    setTimeout(() => this.loadHistory(this.currentFilter), 100);
                });
            }
        });
    }

    async loadHistory(filter = 'bids') {
        this.currentFilter = filter;
        
        try {
            if (filter === 'bids') {
                await this.loadBidHistory();
            } else {
                await this.loadSalesHistory();
            }
            this.applySearchFilter();
        } catch (error) {
            console.error('Error loading history:', error);
            this.renderError();
        }
    }

    async loadBidHistory() {
        // For now, we'll use auction events
        // In a real implementation, you'd have a dedicated bid history endpoint
        const response = await fetch(`${window.api.baseURL}/teams/all-squads`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('fpl_token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            this.historyData = data
                .filter(item => item.created_at)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(item => ({
                    ...item,
                    type: 'bid',
                    timestamp: item.created_at
                }));
        }
    }

    async loadSalesHistory() {
        const response = await fetch(`${window.api.baseURL}/teams/all-squads`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('fpl_token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            this.historyData = data
                .filter(item => item.created_at && item.price_paid)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(item => ({
                    ...item,
                    type: 'sale',
                    timestamp: item.created_at
                }));
        }
    }

    filterHistory(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase();
        this.applySearchFilter();
    }

    applySearchFilter() {
        if (!this.searchTerm) {
            this.filteredData = this.historyData;
        } else {
            this.filteredData = this.historyData.filter(item => {
                const playerName = (item.player_name || item.club_name || '').toLowerCase();
                const teamName = (item.team_name || '').toLowerCase();
                return playerName.includes(this.searchTerm) || teamName.includes(this.searchTerm);
            });
        }
        this.render();
    }

    render() {
        const container = document.getElementById('historyList');
        if (!container) return;

        if (this.filteredData.length === 0) {
            container.innerHTML = `
                <div class="text-gray-500 text-center py-8">
                    ${this.searchTerm ? 'No matching history found' : 'No history data available'}
                </div>
            `;
            return;
        }

        container.innerHTML = this.filteredData.map(item => {
            const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const date = new Date(item.timestamp).toLocaleDateString();
            
            return `
                <div class="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="font-semibold text-gray-900">
                                ${item.player_name || item.club_name || 'Unknown'}
                            </div>
                            <div class="text-sm text-gray-600">
                                ${item.team_name || 'Unknown Team'}
                                ${item.position ? ` • ${item.position}` : ''}
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                                ${date} at ${time}
                            </div>
                        </div>
                        <div class="text-right ml-4">
                            <div class="font-bold text-lg ${item.type === 'sale' ? 'text-emerald-600' : 'text-blue-600'}">
                                £${item.price_paid || 0}m
                            </div>
                            <div class="text-xs text-gray-500">
                                ${item.type === 'sale' ? 'Sold' : 'Final Bid'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderError() {
        const container = document.getElementById('historyList');
        if (container) {
            container.innerHTML = `
                <div class="text-red-500 text-center py-8">
                    Error loading history data. Please try again.
                </div>
            `;
        }
    }
}

// Global history manager instance
window.historyManager = new HistoryManager();