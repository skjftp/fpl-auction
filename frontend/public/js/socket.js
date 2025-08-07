// Socket.IO connection and real-time updates
class SocketManager {
    constructor() {
        this.socket = null;
        this.connected = false;
    }

    connect() {
        // Production Socket URL - FPL Auction Backend on Google Cloud Run
        const PRODUCTION_SOCKET_URL = 'https://fpl-auction-backend-945963649649.us-central1.run.app';
        
        const socketURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001'
            : PRODUCTION_SOCKET_URL;
        this.socket = io(socketURL);
        
        this.socket.on('connect', () => {
            console.log('🔌 Connected to auction server');
            this.connected = true;
            this.joinAuction();
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from auction server');
            this.connected = false;
        });

        // Auction events
        this.socket.on('auction-started', (data) => {
            console.log('🔨 New auction started:', data);
            this.handleAuctionStarted(data);
        });

        this.socket.on('new-bid', (data) => {
            console.log('💰 New bid placed:', data);
            this.handleNewBid(data);
        });

        this.socket.on('auction-completed', (data) => {
            console.log('✅ Auction completed:', data);
            this.handleAuctionCompleted(data);
        });

        // Selling stage events
        this.socket.on('selling-stage-updated', (data) => {
            console.log('🔔 Selling stage updated:', data);
            this.handleSellingStageUpdate(data);
        });

        // Wait request events
        this.socket.on('wait-requested', (data) => {
            console.log('⏸️ Wait requested:', data);
            this.handleWaitRequested(data);
        });

        this.socket.on('wait-accepted', (data) => {
            console.log('✅ Wait accepted:', data);
            this.handleWaitAccepted(data);
        });

        this.socket.on('wait-rejected', (data) => {
            console.log('❌ Wait rejected:', data);
            this.handleWaitRejected(data);
        });

        // Admin auction management events
        this.socket.on('auction-restarted', (data) => {
            console.log('🔄 Auction restarted:', data);
            // Reload auction data
            if (window.auctionManager) {
                window.auctionManager.loadPlayers();
                window.auctionManager.loadCurrentAuction();
            }
            // Reload admin panel if open
            if (window.app?.currentTab === 'admin') {
                window.app.loadAuctionManagement();
            }
            showNotification('Auction has been restarted by admin', 'info');
        });

        this.socket.on('bid-cancelled', (data) => {
            console.log('↩️ Bid cancelled:', data);
            // Update current auction display
            if (window.auctionManager && window.auctionManager.currentAuction?.id === data.auctionId) {
                window.auctionManager.loadCurrentAuction();
            }
            // Reload admin panel if open
            if (window.app?.currentTab === 'admin') {
                window.app.loadAuctionManagement();
            }
            showNotification(`Bid cancelled - Current bid: ${formatCurrencyPlain(data.newCurrentBid)} by ${data.newCurrentBidder}`, 'info');
        });

        // Draft events
        this.socket.on('draft-initialized', () => {
            console.log('🎲 Draft order initialized (broadcast)');
            
            // Update draft state everywhere
            if (window.draftManager) {
                window.draftManager.loadDraftState();
            }
            if (window.auctionManager) {
                window.auctionManager.loadDraftState();
            }
            
            showNotification('Draft order has been initialized', 'success');
        });

        this.socket.on('draft-started', () => {
            console.log('🚀 Draft started (broadcast)');
            
            // Update draft state everywhere
            if (window.draftManager) {
                window.draftManager.loadDraftState();
            }
            if (window.auctionManager) {
                window.auctionManager.loadDraftState();
            }
            
            showNotification('Draft has started!', 'success');
        });

        // Draft turn advancement
        this.socket.on('draft-turn-advanced', (data) => {
            console.log('➡️ Draft turn advanced:', data);
            
            // Update draft state in draft manager
            if (window.draftManager) {
                window.draftManager.loadDraftState();
            }
            
            // Update turn indicator in auction manager
            if (window.auctionManager) {
                window.auctionManager.loadDraftState();
            }
            
            // Show notification about turn change
            if (data.currentTeam) {
                showNotification(`It's now ${data.currentTeam.name}'s turn`, 'info');
            }
        });

        // Draft reset event
        this.socket.on('draft-reset', (data) => {
            console.log('🔄 Draft reset:', data);
            showNotification(data.message, 'warning');
            
            // Reload the page after a short delay to refresh all data
            setTimeout(() => {
                location.reload();
            }, 2000);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            showNotification('Connection error', 'error');
        });

        // Chat cleared event
        this.socket.on('chat_cleared', (data) => {
            console.log('🗑️ Chat cleared:', data);
            // Clear the chat display
            const chatContainer = document.getElementById('chatMessages');
            if (chatContainer) {
                chatContainer.innerHTML = '';
            }
            showNotification(`Chat cleared by ${data.clearedBy}`, 'info');
        });
        
        // Team connection events
        this.socket.on('team-connected', (data) => {
            console.log('🟢 Team connected:', data.teamName);
            this.addSystemMessageToChat(`${data.teamName} connected`, 'connect');
        });
        
        this.socket.on('team-disconnected', (data) => {
            console.log('🔴 Team disconnected:', data.teamName);
            this.addSystemMessageToChat(`${data.teamName} disconnected`, 'disconnect');
        });
    }
    
    addSystemMessageToChat(message, type) {
        const chatContainer = document.getElementById('chatMessages');
        if (!chatContainer) return;
        
        // Create system message element
        const messageDiv = document.createElement('div');
        messageDiv.className = 'text-center text-xs py-1 my-1';
        
        if (type === 'connect') {
            messageDiv.innerHTML = `<span class="text-green-600 font-medium">→ ${message}</span>`;
        } else if (type === 'disconnect') {
            messageDiv.innerHTML = `<span class="text-red-600 font-medium">← ${message}</span>`;
        } else {
            messageDiv.innerHTML = `<span class="text-gray-500">${message}</span>`;
        }
        
        // Add to chat
        chatContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    }

    joinAuction() {
        const team = JSON.parse(localStorage.getItem('fpl_team') || '{}');
        if (team.id && this.socket) {
            this.socket.emit('join-auction', {
                teamId: team.id,
                teamName: team.name || `Team ${team.id}`
            });
            console.log(`👥 Joined auction room as ${team.name}`);
        }
    }

    placeBid(bidData) {
        if (this.socket && this.connected) {
            this.socket.emit('place-bid', bidData);
        }
    }

    async handleAuctionStarted(data) {
        await window.auctionManager.displayCurrentAuction(data);
        showNotification(
            `New auction started: ${data.player?.web_name || data.club?.name}`,
            'info'
        );
        
        // TTS announcement for new auction
        if (window.ttsManager) {
            if (data.player) {
                window.ttsManager.announcePlayerAuction(data.player.web_name);
            } else if (data.club) {
                window.ttsManager.announceClubAuction(data.club.name);
            }
        }
    }

    handleNewBid(data) {
        window.auctionManager.updateCurrentBid(data);
        
        // Add bid to history for real-time updates
        window.auctionManager.addBidToHistory(data);
        
        // Add visual feedback for new bid
        const currentAuction = document.getElementById('currentAuction');
        if (currentAuction) {
            currentAuction.classList.add('new-bid');
            setTimeout(() => {
                currentAuction.classList.remove('new-bid');
            }, 500);
        }
        
        // Remove selling status immediately when new bid is placed
        const sellingStatus = document.getElementById('sellingStatus');
        if (sellingStatus) {
            sellingStatus.remove();
        }

        // Show notification with auto-bid indicator
        const bidMessage = data.isAutoBid 
            ? `🤖 ${data.teamName} auto-bid ${formatCurrencyPlain(data.bidAmount)}`
            : `${data.teamName} bid ${formatCurrencyPlain(data.bidAmount)}`;
            
        showNotification(bidMessage, 'info');
    }

    handleAuctionCompleted(data) {
        window.auctionManager.clearCurrentAuction();
        showNotification('Auction completed!', 'success');
        
        // TTS announcement for sold item
        if (window.ttsManager && data) {
            const itemName = data.player?.web_name || data.club?.name || 'Item';
            const teamName = data.team?.name || data.winnerName || 'Unknown Team';
            const amount = data.finalBid || data.price || 0;
            window.ttsManager.announceSold(itemName, teamName, amount + 'm');
        }
        
        // Refresh sold items and player display for everyone
        window.auctionManager.loadSoldItems().then(() => {
            window.auctionManager.displayPlayers(window.auctionManager.players);
            window.auctionManager.displayClubs(window.auctionManager.clubs);
        });
        
        // Refresh team data and budget for everyone (budget affects bidding ability)
        if (window.app && window.app.refreshTeamBudget) {
            window.app.refreshTeamBudget();
        }
        
        // Refresh team squad if current user won
        const team = JSON.parse(localStorage.getItem('fpl_team') || '{}');
        if (team.id === data.winnerId && window.teamManager) {
            window.teamManager.loadTeamData();
        }
    }

    handleSellingStageUpdate(data) {
        if (window.auctionManager && window.auctionManager.currentAuction) {
            // Update the selling status display
            const sellingStatus = document.getElementById('sellingStatus');
            if (sellingStatus) {
                sellingStatus.className = `bg-${data.stage === 'selling1' ? 'yellow' : 'orange'}-100 border border-${data.stage === 'selling1' ? 'yellow' : 'orange'}-400 text-${data.stage === 'selling1' ? 'yellow' : 'orange'}-700 px-3 py-2 rounded mb-3 text-sm font-bold text-center animate-pulse`;
                sellingStatus.textContent = data.message;
            } else if (window.auctionManager.currentAuction.id === data.auctionId) {
                // Update the auction display to show selling status
                window.auctionManager.currentAuction.selling_stage = data.stage;
                window.auctionManager.displayCurrentAuction(window.auctionManager.currentAuction);
            }
            
            showNotification(data.message, 'info');
            
            // TTS announcement for selling stages
            if (window.ttsManager) {
                if (data.stage === 'selling1') {
                    window.ttsManager.announceSelling1();
                } else if (data.stage === 'selling2') {
                    window.ttsManager.announceSelling2();
                }
            }
        }
    }

    handleWaitRequested(data) {
        if (window.auctionManager && window.auctionManager.currentAuction && 
            window.auctionManager.currentAuction.id === data.auctionId) {
            // Update auction state with wait request
            window.auctionManager.currentAuction.wait_requested_by = data.teamId;
            window.auctionManager.displayCurrentAuction(window.auctionManager.currentAuction);
            
            showNotification(data.message, 'info');
        }
    }

    handleWaitAccepted(data) {
        if (window.auctionManager && window.auctionManager.currentAuction && 
            window.auctionManager.currentAuction.id === data.auctionId) {
            // Reset auction to normal state
            window.auctionManager.currentAuction.selling_stage = null;
            window.auctionManager.currentAuction.wait_requested_by = null;
            window.auctionManager.displayCurrentAuction(window.auctionManager.currentAuction);
            
            showNotification(data.message, 'success');
        }
    }

    handleWaitRejected(data) {
        if (window.auctionManager && window.auctionManager.currentAuction && 
            window.auctionManager.currentAuction.id === data.auctionId) {
            // Clear wait request but keep selling stage
            window.auctionManager.currentAuction.wait_requested_by = null;
            window.auctionManager.displayCurrentAuction(window.auctionManager.currentAuction);
            
            showNotification(data.message, 'warning');
        }
    }
}

// Notification system
function showNotification(message, type = 'success') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Hide notification after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Global socket manager
window.socketManager = new SocketManager();