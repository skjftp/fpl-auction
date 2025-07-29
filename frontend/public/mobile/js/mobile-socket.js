// Mobile Socket Manager for FPL Auction
class MobileSocketManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect() {
        // Production Socket URL
        const PRODUCTION_SOCKET_URL = 'https://fpl-auction-backend-mrlyxa4xiq-uc.a.run.app';
        
        const socketURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001'
            : PRODUCTION_SOCKET_URL;

        this.socket = io(socketURL);
        
        this.socket.on('connect', () => {
            console.log('🔌 Mobile: Connected to auction server');
            this.connected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            this.joinAuction();
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Mobile: Disconnected from auction server');
            this.connected = false;
            this.updateConnectionStatus(false);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.handleReconnect();
        });

        // Auction events
        this.socket.on('auction-started', (data) => {
            console.log('🔨 Mobile: New auction started:', data);
            this.handleAuctionStarted(data);
        });

        this.socket.on('new-bid', (data) => {
            console.log('💰 Mobile: New bid placed:', data);
            this.handleNewBid(data);
        });

        this.socket.on('auction-completed', (data) => {
            console.log('✅ Mobile: Auction completed:', data);
            this.handleAuctionCompleted(data);
        });

        // Selling stage events
        this.socket.on('selling-stage-updated', (data) => {
            console.log('🔔 Mobile: Selling stage updated:', data);
            this.handleSellingStageUpdate(data);
        });

        // Wait request events
        this.socket.on('wait-requested', (data) => {
            console.log('⏸️ Mobile: Wait requested:', data);
            this.handleWaitRequested(data);
        });

        this.socket.on('wait-accepted', (data) => {
            console.log('✅ Mobile: Wait accepted:', data);
            this.handleWaitAccepted(data);
        });

        this.socket.on('wait-rejected', (data) => {
            console.log('❌ Mobile: Wait rejected:', data);
            this.handleWaitRejected(data);
        });

        // Draft events
        this.socket.on('draft-turn-advanced', (data) => {
            console.log('🔄 Mobile: Draft turn advanced:', data);
            this.handleDraftTurnAdvanced(data);
        });

        // Chat events
        this.socket.on('new-chat-message', (message) => {
            console.log('💬 Mobile: New chat message:', message);
            this.handleNewChatMessage(message);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            window.mobileApp.showToast('Connection error', 'error');
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connect();
            }, 2000 * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
            window.mobileApp.showToast('Connection lost', 'error');
        }
    }

    joinAuction() {
        const team = window.mobileAPI.getCurrentUser();
        if (team.id && this.socket) {
            this.socket.emit('join-auction', team.id);
            console.log(`👥 Mobile: Joined auction room as ${team.name}`);
        }
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            if (connected) {
                statusEl.classList.add('connected');
                statusEl.querySelector('span').textContent = 'Connected';
            } else {
                statusEl.classList.remove('connected');
                statusEl.querySelector('span').textContent = 'Disconnected';
            }
        }
    }

    handleAuctionStarted(data) {
        if (window.mobileAuction) {
            window.mobileAuction.displayCurrentAuction(data);
        }
        window.mobileApp.showToast(
            `New auction: ${data.player?.web_name || data.club?.name}`,
            'info'
        );
    }

    handleNewBid(data) {
        if (window.mobileAuction) {
            window.mobileAuction.updateCurrentBid(data);
        }

        // Show toast notification
        const bidMessage = data.isAutoBid 
            ? `🤖 ${data.teamName} auto-bid £${data.bidAmount}m`
            : `${data.teamName} bid £${data.bidAmount}m`;
            
        window.mobileApp.showToast(bidMessage, 'info');

        // Add haptic feedback on mobile
        this.vibrate(50);
    }

    handleAuctionCompleted(data) {
        if (window.mobileAuction) {
            window.mobileAuction.clearCurrentAuction();
            // Refresh sold items and update squad if won
            window.mobileAuction.loadSoldItems();
            
            const currentTeam = window.mobileAPI.getCurrentUser();
            if (currentTeam.id === data.winnerId) {
                window.mobileApp.refreshTeamData();
            }
        }
        
        window.mobileApp.showToast('Auction completed!', 'success');
        this.vibrate([100, 50, 100]);
    }

    handleSellingStageUpdate(data) {
        if (window.mobileAuction) {
            window.mobileAuction.updateSellingStage(data);
        }
        window.mobileApp.showToast(data.message, 'info');
    }

    handleWaitRequested(data) {
        if (window.mobileAuction) {
            window.mobileAuction.updateWaitRequest(data);
        }
        window.mobileApp.showToast(data.message, 'info');
    }

    handleWaitAccepted(data) {
        if (window.mobileAuction) {
            window.mobileAuction.clearWaitRequest();
            window.mobileAuction.clearSellingStage();
        }
        window.mobileApp.showToast(data.message, 'success');
    }

    handleWaitRejected(data) {
        if (window.mobileAuction) {
            window.mobileAuction.clearWaitRequest();
        }
        window.mobileApp.showToast(data.message, 'warning');
    }

    handleDraftTurnAdvanced(data) {
        if (window.mobileApp) {
            window.mobileApp.updateDraftStatus(data);
        }
    }

    handleNewChatMessage(message) {
        if (window.mobileApp && window.mobileApp.currentTab === 'chat') {
            window.mobileApp.addChatMessage(message);
        } else {
            // Show notification badge
            window.mobileApp.incrementChatNotification();
        }
        
        // Vibrate for new messages
        this.vibrate(30);
    }

    // Send events
    placeBid(bidData) {
        if (this.socket && this.connected) {
            this.socket.emit('place-bid', bidData);
        }
    }

    sendChatMessage(message) {
        if (this.socket && this.connected) {
            this.socket.emit('send-chat-message', message);
        }
    }

    // Utility methods
    vibrate(pattern) {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    }
}

// Global socket manager instance
window.mobileSocket = new MobileSocketManager();