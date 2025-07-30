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
        const PRODUCTION_SOCKET_URL = 'https://fpl-auction-backend-945963649649.us-central1.run.app';
        
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
            
            // Set up periodic room rejoin as a safety measure
            this.setupPeriodicRejoin();
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
        if (this.rejoinInterval) {
            clearInterval(this.rejoinInterval);
            this.rejoinInterval = null;
        }
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
        console.log('🔍 Mobile: Attempting to join auction room, team:', team);
        if (team && team.id && this.socket) {
            this.socket.emit('join-auction', team.id);
            console.log(`👥 Mobile: Joined auction room as ${team.name || 'Team' + team.id}`);
        } else {
            console.warn('⚠️ Mobile: Cannot join auction room - missing team data or socket:', { team, socketConnected: !!this.socket });
            // Retry after a short delay if team data is not available
            if (this.socket && !team?.id) {
                setTimeout(() => this.joinAuction(), 1000);
            }
        }
    }

    setupPeriodicRejoin() {
        // Clear any existing interval
        if (this.rejoinInterval) {
            clearInterval(this.rejoinInterval);
        }
        
        // Rejoin room every 30 seconds as a safety measure
        this.rejoinInterval = setInterval(() => {
            if (this.connected && this.socket) {
                console.log('🔄 Mobile: Periodic auction room rejoin');
                this.joinAuction();
            }
        }, 30000);
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
        console.log('🔨 Mobile: Received auction-started event:', data);
        if (window.mobileAuction) {
            window.mobileAuction.displayCurrentAuction(data);
        } else {
            console.warn('⚠️ Mobile: mobileAuction not available for auction-started event');
        }
        // Handle nested structure from socket events
        const itemName = data.player?.web_name || data.club?.name || data.player_name || data.club_name || 'Unknown Item';
        window.mobileApp.showToast(
            `New auction: ${itemName}`,
            'info'
        );
        
        // TTS announcement for new auction
        if (window.ttsManager) {
            if (data.player || data.player_name) {
                window.ttsManager.announcePlayerAuction(itemName);
            } else if (data.club || data.club_name) {
                window.ttsManager.announceClubAuction(itemName);
            }
        }
    }

    handleNewBid(data) {
        if (window.mobileAuction) {
            window.mobileAuction.updateCurrentBid(data);
        }

        // Show toast notification
        const bidMessage = data.isAutoBid 
            ? `🤖 ${data.teamName} auto-bid ${formatCurrencyPlain(data.bidAmount)}`
            : `${data.teamName} bid ${formatCurrencyPlain(data.bidAmount)}`;
            
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
        
        // Reload draft state to show updated turn info after auction
        if (window.mobileApp) {
            window.mobileApp.loadDraftState();
        }
        
        window.mobileApp.showToast('Auction completed!', 'success');
        this.vibrate([100, 50, 100]);
        
        // TTS announcement for sold item
        if (window.ttsManager && data) {
            const itemName = data.player?.web_name || data.club?.name || 'Item';
            const teamName = data.team?.name || data.winnerName || 'Unknown Team';
            const amount = data.finalBid || data.price || 0;
            window.ttsManager.announceSold(itemName, teamName, amount + 'm');
        }
    }

    handleSellingStageUpdate(data) {
        if (window.mobileAuction) {
            window.mobileAuction.receiveSellingStageUpdate(data);
        }
        window.mobileApp.showToast(data.message, 'info');
        
        // TTS announcement for selling stages
        if (window.ttsManager) {
            if (data.stage === 'selling1') {
                window.ttsManager.announceSelling1();
            } else if (data.stage === 'selling2') {
                window.ttsManager.announceSelling2();
            }
        }
    }

    handleWaitRequested(data) {
        if (window.mobileAuction) {
            window.mobileAuction.updateWaitRequest(data);
        }
        window.mobileApp.showToast(data.message, 'info');
    }

    handleWaitAccepted(data) {
        if (window.mobileAuction && window.mobileAuction.currentAuction) {
            // Update auction state with data from server
            window.mobileAuction.currentAuction.selling_stage = data.sellingStage;
            window.mobileAuction.currentAuction.wait_requested_by = data.waitRequestedBy;
            // Update UI to reflect the new state
            window.mobileAuction.updateControls(window.mobileAuction.currentAuction);
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
        console.log('💬 Mobile: Received new chat message:', message);
        if (window.mobileApp) {
            // Always add the message to the chat array
            window.mobileApp.addChatMessage(message);
            
            // Show notification badge if not on auction tab (where mini-chat is visible)
            if (window.mobileApp.currentTab !== 'auction') {
                window.mobileApp.incrementChatNotification();
            }
        } else {
            console.warn('⚠️ Mobile: mobileApp not available for chat message');
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