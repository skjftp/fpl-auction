// Socket.IO connection and real-time updates
class SocketManager {
    constructor() {
        this.socket = null;
        this.connected = false;
    }

    connect() {
        // Use environment-specific socket URL
        const PRODUCTION_SOCKET_URL = 'https://us-central1-fpl-auction-2025.cloudfunctions.net/api';
        
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

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            showNotification('Connection error', 'error');
        });
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
            this.socket.emit('join-auction', team.id);
            console.log(`👥 Joined auction room as ${team.name}`);
        }
    }

    placeBid(bidData) {
        if (this.socket && this.connected) {
            this.socket.emit('place-bid', bidData);
        }
    }

    handleAuctionStarted(data) {
        window.auctionManager.displayCurrentAuction(data);
        showNotification(
            `New auction started: ${data.player?.web_name || data.club?.name}`,
            'info'
        );
    }

    handleNewBid(data) {
        window.auctionManager.updateCurrentBid(data);
        
        // Add visual feedback for new bid
        const currentAuction = document.getElementById('currentAuction');
        if (currentAuction) {
            currentAuction.classList.add('new-bid');
            setTimeout(() => {
                currentAuction.classList.remove('new-bid');
            }, 500);
        }

        showNotification(
            `${data.teamName} bid £${data.bidAmount}m`,
            'info'
        );
    }

    handleAuctionCompleted(data) {
        window.auctionManager.clearCurrentAuction();
        showNotification('Auction completed!', 'success');
        
        // Refresh team data if current user won
        const team = JSON.parse(localStorage.getItem('fpl_team') || '{}');
        if (team.id === data.winnerId) {
            window.teamManager.loadTeamData();
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