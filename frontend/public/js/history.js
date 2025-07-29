// History tab management
class HistoryManager {
    constructor() {
        this.historyItems = [];
        this.currentFilter = 'bids';
        this.init();
    }

    init() {
        // Initialize event listeners
        document.addEventListener('DOMContentLoaded', () => {
            // Tab click listener
            const historyTab = document.querySelector('[data-tab="history"]');
            if (historyTab) {
                historyTab.addEventListener('click', () => {
                    setTimeout(() => this.loadHistory(), 100);
                });
            }

            // Filter button listeners
            const filterButtons = document.querySelectorAll('.filter-btn');
            filterButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Update button states
                    filterButtons.forEach(b => {
                        b.classList.remove('bg-emerald-500', 'text-white');
                        b.classList.add('bg-gray-200', 'text-gray-700');
                    });
                    e.target.classList.remove('bg-gray-200', 'text-gray-700');
                    e.target.classList.add('bg-emerald-500', 'text-white');
                    
                    // Filter history
                    this.filterHistory(e.target.dataset.filter);
                });
            });

            // Search input listener
            const searchInput = document.getElementById('historySearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchHistory();
                });
            }
        });
    }

    async loadHistory() {
        try {
            // Load both sales and bid history in parallel
            const [soldItems, bidHistory] = await Promise.all([
                this.getSoldItems(),
                this.getBidHistory()
            ]);
            
            console.log('Loaded bid history:', bidHistory);
            console.log('Loaded sold items:', soldItems);
            
            // Combine and sort history items
            this.historyItems = [
                ...soldItems.map(item => ({ ...item, type: 'sale' })),
                ...(Array.isArray(bidHistory) ? bidHistory.map(item => ({ 
                    ...item, 
                    type: item.isAutoBid ? 'auto-bid' : 'bid' 
                })) : [])
            ].sort((a, b) => new Date(b.created_at || b.sold_at) - new Date(a.created_at || a.sold_at));
            
            console.log('Combined history items:', this.historyItems);
            
            // Render with current filter
            this.renderHistory(this.currentFilter);
        } catch (error) {
            console.error('Error loading history:', error);
            this.renderError();
        }
    }

    async getSoldItems() {
        try {
            const response = await fetch(`${window.api.baseURL}/teams/sold-items`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('fpl_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch sold items');
            }

            const data = await response.json();
            return data.soldItems || [];
        } catch (error) {
            console.error('Error fetching sold items:', error);
            return [];
        }
    }

    async getBidHistory() {
        try {
            const response = await fetch(`${window.api.baseURL}/auction/bid-history`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('fpl_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch bid history');
            }

            const data = await response.json();
            return data.bids || data || [];
        } catch (error) {
            console.error('Error fetching bid history:', error);
            return [];
        }
    }

    filterHistory(filter) {
        this.currentFilter = filter;
        const search = document.getElementById('historySearch')?.value || '';
        this.renderHistory(filter, search);
    }

    searchHistory() {
        const filter = document.querySelector('.filter-btn.bg-emerald-500')?.dataset.filter || 'bids';
        const search = document.getElementById('historySearch')?.value || '';
        this.renderHistory(filter, search);
    }

    renderHistory(filter = 'bids', search = '') {
        const container = document.getElementById('historyList');
        if (!container) return;
        
        let items = this.historyItems || [];
        console.log('Rendering history with filter:', filter);
        console.log('All history items:', items);
        
        // Apply filter
        if (filter === 'bids') {
            items = items.filter(item => item.type === 'bid' || item.type === 'auto-bid');
            console.log('Filtered bid items:', items);
        } else if (filter === 'sales') {
            items = items.filter(item => item.type === 'sale');
        }
        
        // Apply search
        if (search) {
            const searchLower = search.toLowerCase();
            items = items.filter(item => 
                (item.player_name || item.club_name || '').toLowerCase().includes(searchLower) ||
                (item.buyer_name || item.team_name || '').toLowerCase().includes(searchLower)
            );
        }
        
        if (items.length === 0) {
            container.innerHTML = `
                <div class="text-gray-500 text-center py-8">
                    ${search ? 'No matching history found' : `No ${filter} history available`}
                </div>
            `;
            return;
        }
        
        container.innerHTML = items.map(item => this.renderHistoryItem(item)).join('');
    }

    renderHistoryItem(item) {
        const time = this.formatHistoryTime(item.created_at || item.sold_at);
        
        if (item.type === 'sale') {
            return `
                <div class="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-gray-900">
                                    ${item.player_name || item.club_name || 'Unknown'}
                                </span>
                                ${item.position ? `<span class="text-xs px-2 py-0.5 bg-gray-200 rounded">${this.getPositionName(item.position)}</span>` : ''}
                                ${item.is_club ? `<span class="text-xs px-2 py-0.5 bg-purple-200 text-purple-700 rounded">CLUB</span>` : ''}
                            </div>
                            <div class="text-sm text-gray-600 mt-1">
                                Sold by ${item.seller_name || 'Team ' + item.sold_by_team_id}
                            </div>
                            <div class="text-sm text-gray-600">
                                Bought by ${item.buyer_name || 'Team ' + item.sold_to_team_id}
                            </div>
                            <div class="text-xs text-gray-500 mt-1">${time}</div>
                        </div>
                        <div class="text-right ml-4">
                            <div class="font-bold text-lg text-emerald-600">
                                £${item.price || 0}m
                            </div>
                            <div class="text-xs text-gray-500">Sold</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Bid item
            return `
                <div class="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-gray-900">
                                    ${item.player_name || item.club_name || 'Unknown'}
                                </span>
                                ${item.position ? `<span class="text-xs px-2 py-0.5 bg-gray-200 rounded">${this.getPositionName(item.position)}</span>` : ''}
                                ${item.is_club ? `<span class="text-xs px-2 py-0.5 bg-purple-200 text-purple-700 rounded">CLUB</span>` : ''}
                                ${item.type === 'auto-bid' ? `<span class="text-xs px-2 py-0.5 bg-blue-200 text-blue-700 rounded">AUTO</span>` : ''}
                            </div>
                            <div class="text-sm text-gray-600 mt-1">
                                Bid by ${item.team_name || 'Team ' + item.team_id}
                            </div>
                            <div class="text-xs text-gray-500 mt-1">${time}</div>
                        </div>
                        <div class="text-right ml-4">
                            <div class="font-bold text-lg text-blue-600">
                                £${item.amount || 0}m
                            </div>
                            <div class="text-xs text-gray-500">
                                ${item.isWinning ? 'Winning Bid' : 'Bid'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    getPositionName(position) {
        if (position === 1 || position === 'GKP') return 'GKP';
        if (position === 2 || position === 'DEF') return 'DEF';
        if (position === 3 || position === 'MID') return 'MID';
        if (position === 4 || position === 'FWD') return 'FWD';
        return position;
    }

    formatHistoryTime(timestamp) {
        try {
            let date;
            
            // Handle Firestore timestamp format
            if (timestamp && typeof timestamp === 'object' && timestamp._seconds) {
                date = new Date(timestamp._seconds * 1000);
            } else {
                date = new Date(timestamp);
            }
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return '';
            }
            
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            
            return date.toLocaleDateString();
        } catch (error) {
            console.error('Error formatting time:', error);
            return '';
        }
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