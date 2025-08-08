// Draft management and UI controller
class DraftManager {
    constructor() {
        this.draftState = null;
        this.chatMessages = [];
        this.socketRetryCount = 0;
        this.maxSocketRetries = 10;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadDraftState();
        this.loadChatMessages();
        this.setupSocketListeners();
    }

    bindEvents() {
        // Admin controls
        document.getElementById('initializeDraftBtn')?.addEventListener('click', () => {
            this.initializeDraft();
        });

        document.getElementById('startDraftBtn')?.addEventListener('click', () => {
            this.startDraft();
        });

        // Chat controls
        document.getElementById('chatForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendChatMessage();
        });

        document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChatMessage();
            }
        });

    }

    setupSocketListeners() {
        // Check if socket manager and socket exist
        if (!window.socketManager || !window.socketManager.socket) {
            this.socketRetryCount++;
            if (this.socketRetryCount >= this.maxSocketRetries) {
                console.warn('Max socket retry attempts reached. Socket listeners not set up.');
                return;
            }
            console.log(`Socket not ready, retry ${this.socketRetryCount}/${this.maxSocketRetries}`);
            setTimeout(() => this.setupSocketListeners(), 500);
            return;
        }
        
        // Reset retry count on successful connection
        this.socketRetryCount = 0;

        // Note: Draft-related socket events are now handled in socket.js
        // They will call loadDraftState() through the draftManager reference

        window.socketManager.socket.on('new-chat-message', (message) => {
            console.log('💬 New chat message', message);
            this.addChatMessage(message);
        });

        window.socketManager.socket.on('auction-started', (auctionData) => {
            console.log('🔨 Auction started', auctionData);
            this.updateAuctionControls();
        });

        window.socketManager.socket.on('auction-completed', () => {
            console.log('✅ Auction completed');
            this.updateAuctionControls();
        });
    }

    async loadDraftState() {
        try {
            this.draftState = await window.api.getDraftState();
            console.log('Loaded draft state:', this.draftState);
            this.updateDraftUI();
            this.updateAuctionControls();
        } catch (error) {
            console.error('Error loading draft state:', error);
        }
    }

    updateDraftOrderModal() {
        // Use the auction manager's function if available
        if (window.auctionManager) {
            window.auctionManager.updateDraftOrderModal();
        }
    }

    updateDraftUI() {
        if (!this.draftState) return;

        // Update draft status
        const statusEl = document.getElementById('draftStatus');
        if (statusEl) {
            if (this.draftState.is_active) {
                statusEl.innerHTML = `
                    <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                        <strong>Draft Active</strong> - Turn: ${this.draftState.current_position}/${this.draftState.total_teams}
                        <br>Current Team: <strong>${this.draftState.current_team_name}</strong>
                    </div>
                `;
            } else if (this.draftState.draft_order && this.draftState.draft_order.length > 0) {
                statusEl.innerHTML = `
                    <div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
                        <strong>Draft Ready</strong> - Waiting to start
                        <br>First Team: <strong>${this.draftState.draft_order[0]?.name}</strong>
                    </div>
                `;
            } else {
                statusEl.innerHTML = `
                    <div class="bg-gray-100 border border-gray-400 text-gray-700 px-4 py-3 rounded">
                        <strong>Draft Not Initialized</strong>
                    </div>
                `;
            }
        }

        // Update draft order display
        const orderEl = document.getElementById('draftOrder');
        if (orderEl) {
            if (this.draftState.draft_order && this.draftState.draft_order.length > 0) {
                orderEl.innerHTML = this.draftState.draft_order.map((team, index) => {
                    const isCurrent = this.draftState.is_active && team.team_id === this.draftState.current_team_id;
                    const isCurrentUser = team.team_id === window.app.currentUser?.id;
                    
                    return `
                        <div class="flex items-center p-2 rounded ${isCurrent ? 'bg-green-200 font-bold' : 'bg-gray-50'} ${isCurrentUser ? 'border-2 border-blue-400' : ''}">
                            <span class="w-8 text-center font-semibold">${index + 1}</span>
                            <span class="flex-1">${team.name}</span>
                            ${isCurrent ? '<span class="text-green-600">🎯 Current</span>' : ''}
                            ${isCurrentUser ? '<span class="text-blue-600">👤 You</span>' : ''}
                        </div>
                    `;
                }).join('');
            } else {
                orderEl.innerHTML = '<div class="text-gray-500">No draft order yet...</div>';
            }
        }

        // Update admin controls
        this.updateAdminControls();
    }

    updateAdminControls() {
        const initBtn = document.getElementById('initializeDraftBtn');
        const startBtn = document.getElementById('startDraftBtn');
        const clearChatBtn = document.getElementById('clearChatBtn');
        const isAdmin = window.app?.currentUser?.is_admin || false;

        // Hide admin controls from non-admin users
        const adminControlsContainer = initBtn?.parentElement;
        if (adminControlsContainer) {
            adminControlsContainer.style.display = isAdmin ? 'flex' : 'none';
        }

        if (isAdmin) {
            if (initBtn) {
                initBtn.disabled = this.draftState?.is_active || false;
            }

            if (startBtn) {
                startBtn.disabled = !this.draftState?.draft_order || this.draftState?.is_active || false;
            }

            if (clearChatBtn && !clearChatBtn.hasAttribute('data-listener')) {
                clearChatBtn.setAttribute('data-listener', 'true');
                clearChatBtn.addEventListener('click', () => this.clearAllChats());
            }
        }
    }

    async clearAllChats() {
        if (!confirm('Are you sure you want to clear all chat messages? This action cannot be undone.')) {
            return;
        }

        try {
            const result = await window.api.clearAllChats();
            if (result.success) {
                window.app.showNotification(`✅ ${result.message} (${result.deletedCount} messages deleted)`, 'success');
                // Clear the chat display
                const chatContainer = document.getElementById('chatMessages');
                if (chatContainer) {
                    chatContainer.innerHTML = '';
                }
            }
        } catch (error) {
            console.error('Error clearing chats:', error);
            window.app.showNotification('❌ Failed to clear chats', 'error');
        }
    }

    async updateAuctionControls() {
        try {
            const canStart = await window.api.canStartAuction();
            const startButtons = document.querySelectorAll('.start-auction-btn');
            
            startButtons.forEach(btn => {
                btn.disabled = !canStart.can_start;
                if (canStart.can_start) {
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                    if (canStart.is_super_admin && canStart.current_team_id !== window.app.currentUser?.id) {
                        btn.title = 'Start auction on behalf of current team (Super Admin)';
                    } else {
                        btn.title = 'Start auction for this player/club';
                    }
                } else {
                    btn.classList.add('opacity-50', 'cursor-not-allowed');
                    btn.title = 'Not your turn to start an auction';
                }
            });

            // Update turn indicator
            const turnIndicator = document.getElementById('turnIndicator');
            if (turnIndicator) {
                if (canStart.can_start) {
                    if (canStart.is_super_admin && canStart.current_team_id !== window.app.currentUser?.id) {
                        // Get current team name from draft state
                        const currentTeamName = this.draftState?.current_team_name || 'Unknown Team';
                        turnIndicator.innerHTML = `
                            <div class="bg-purple-500 text-white px-4 py-2 rounded-lg animate-pulse">
                                🛡️ Super Admin Mode - Starting on behalf of ${currentTeamName}
                            </div>
                        `;
                    } else {
                        turnIndicator.innerHTML = `
                            <div class="bg-green-500 text-white px-4 py-2 rounded-lg animate-pulse">
                                🎯 Your Turn - Choose a player or club to auction
                            </div>
                        `;
                    }
                } else {
                    turnIndicator.innerHTML = `
                        <div class="bg-gray-400 text-white px-4 py-2 rounded-lg">
                            ⏳ Waiting for your turn...
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Error updating auction controls:', error);
        }
    }

    async initializeDraft() {
        try {
            // Check if animation is enabled (stored in localStorage for admin preference)
            const animationEnabled = localStorage.getItem('draftRevealAnimation') !== 'false';
            
            const result = await window.api.initializeDraft();
            
            // If we have the draft order and animation is available, show it
            if (result && result.draft_order && window.draftRevealAnimation) {
                // Start the reveal animation - admin is the initiator
                window.draftRevealAnimation.startReveal(result.draft_order, animationEnabled, true);
            } else {
                this.showNotification('Draft order initialized!', 'success');
                // Reload draft state immediately if no animation
                await this.loadDraftState();
            }
        } catch (error) {
            console.error('Error initializing draft:', error);
            this.showNotification('Failed to initialize draft', 'error');
        }
    }
    
    // Called when reveal animation completes
    onRevealComplete() {
        this.showNotification('Draft order revealed! Ready to start!', 'success');
        this.loadDraftState();
    }

    async startDraft() {
        try {
            await window.api.startDraft();
            this.showNotification('Draft started!', 'success');
        } catch (error) {
            console.error('Error starting draft:', error);
            this.showNotification('Failed to start draft', 'error');
        }
    }


    async loadChatMessages() {
        try {
            this.chatMessages = await window.api.getChatMessages();
            this.updateChatUI();
        } catch (error) {
            console.error('Error loading chat messages:', error);
        }
    }

    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input?.value?.trim();
        
        if (!message) return;

        try {
            const response = await window.api.sendChatMessage(message);
            input.value = '';
            
            // Immediately add the message to local chat
            if (response.message) {
                this.addChatMessage(response.message);
            }
        } catch (error) {
            console.error('Error sending chat message:', error);
            this.showNotification('Failed to send message', 'error');
        }
    }

    addChatMessage(message) {
        // Check if message already exists (prevent duplicates from socket event)
        const isDuplicate = this.chatMessages.some(m => 
            m.message === message.message && 
            m.username === message.username && 
            m.created_at === message.created_at
        );
        
        if (!isDuplicate) {
            this.chatMessages.push(message);
            this.updateChatUI();
        }
    }

    updateChatUI() {
        const chatContainer = document.getElementById('chatMessages');
        if (!chatContainer) return;

        // Limit to latest 25 messages to prevent layout issues (like mobile does with 50)
        const recentMessages = this.chatMessages.slice(-25);
        
        chatContainer.innerHTML = recentMessages.map(msg => {
            const isCurrentUser = msg.username === window.app.currentUser?.username;
            
            // Handle date properly - check if created_at exists and is valid
            let timeStr = '';
            if (msg.created_at) {
                const date = new Date(msg.created_at);
                // Check if date is valid
                if (!isNaN(date.getTime())) {
                    timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } else {
                    // If created_at is invalid, try to use current time
                    timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
            } else {
                // If no created_at, use current time
                timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            return `
                <div class="mb-2 ${isCurrentUser ? 'text-right' : ''}">
                    <div class="inline-block max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
                        isCurrentUser 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 text-gray-800'
                    }">
                        <div class="text-xs opacity-75">${msg.team_name} • ${timeStr}</div>
                        <div>${this.escapeHtml(msg.message)}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg text-white z-50 transition-all duration-300 ${
            type === 'success' ? 'bg-green-500' :
            type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Global draft manager instance
window.draftManager = new DraftManager();