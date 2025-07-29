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
        try {
            // Load all team squads to show bid history
            const response = await fetch(`${window.api.baseURL}/teams/all-squads`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('fpl_token')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Group by auction and get latest bids
                const auctionMap = new Map();
                
                data.forEach(item => {
                    if (item.created_at && item.price_paid > 0) {
                        const key = `${item.player_id || item.club_id}-${item.sold_to_team_id}`;
                        if (!auctionMap.has(key) || new Date(item.created_at) > new Date(auctionMap.get(key).created_at)) {
                            auctionMap.set(key, {
                                ...item,
                                type: 'bid',
                                timestamp: item.created_at,
                                final_price: item.price_paid
                            });
                        }
                    }
                });
                
                this.historyData = Array.from(auctionMap.values())
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }
        } catch (error) {
            console.error('Error loading bid history:', error);
            this.historyData = [];
        }
    }

    async loadSalesHistory() {
        try {
            // Load all completed sales
            const response = await fetch(`${window.api.baseURL}/teams/all-squads`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('fpl_token')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                this.historyData = data
                    .filter(item => item.created_at && item.price_paid > 0)
                    .map(item => ({
                        ...item,
                        type: 'sale',
                        timestamp: item.created_at,
                        seller: 'Market', // Since these are all purchases from market
                        buyer: item.team_name
                    }))
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }
        } catch (error) {
            console.error('Error loading sales history:', error);
            this.historyData = [];
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
            
            // Determine position display
            let positionText = '';
            if (item.position === 1 || item.position === 'GKP') positionText = 'GKP';
            else if (item.position === 2 || item.position === 'DEF') positionText = 'DEF';
            else if (item.position === 3 || item.position === 'MID') positionText = 'MID';
            else if (item.position === 4 || item.position === 'FWD') positionText = 'FWD';
            else if (item.club_id) positionText = 'CLUB';
            
            return `
                <div class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-gray-900 text-sm">
                                    ${item.player_name || item.club_name || 'Unknown'}
                                </span>
                                ${positionText ? `<span class="text-xs px-2 py-0.5 bg-gray-200 rounded">${positionText}</span>` : ''}
                            </div>
                            <div class="text-xs text-gray-600 mt-1">
                                ${this.currentFilter === 'bids' ? 'Won by' : 'Bought by'}: ${item.team_name || 'Unknown Team'}
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                                ${date} at ${time}
                            </div>
                        </div>
                        <div class="text-right ml-4">
                            <div class="font-bold text-base ${item.type === 'sale' ? 'text-emerald-600' : 'text-blue-600'}">
                                £${item.price_paid || item.final_price || 0}m
                            </div>
                            <div class="text-xs text-gray-500">
                                ${item.type === 'sale' ? 'Sold' : 'Winning Bid'}
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