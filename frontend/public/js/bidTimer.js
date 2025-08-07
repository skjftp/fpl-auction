// Bid Timer Management
class BidTimer {
    constructor() {
        this.timerInterval = null;
        this.startTime = null;
        this.isRunning = false;
        this.timerElement = null;
        this.elapsedSeconds = 0;
        
        this.initializeTimer();
        this.setupSocketListeners();
    }
    
    initializeTimer() {
        // Timer will be created dynamically when auction starts
        console.log('Bid timer initialized and ready');
    }
    
    createDesktopTimer() {
        // Check if timer already exists
        if (document.getElementById('bidTimerDisplay')) {
            this.timerElement = document.getElementById('bidTimerValue');
            return;
        }
        
        const timerHTML = `
            <div id="bidTimerDisplay" class="card p-4">
                <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-700">Time Since Last Bid</span>
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span id="bidTimerValue" class="text-xl font-bold text-green-600">00:00</span>
                    </div>
                </div>
            </div>
        `;
        
        // Find the dedicated timer section
        const timerSection = document.getElementById('timerSection');
        if (timerSection) {
            timerSection.innerHTML = timerHTML;
            this.timerElement = document.getElementById('bidTimerValue');
        }
    }
    
    createMobileTimer() {
        // Check if timer already exists
        if (document.getElementById('mobileBidTimerDisplay')) {
            return;
        }
        
        const timerHTML = `
            <div id="mobileBidTimerDisplay" class="hidden bg-gradient-to-r from-green-50 to-blue-50 p-3 rounded-lg border border-green-200 mb-3">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-medium text-gray-600">Time Since Last Bid</span>
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span id="mobileBidTimerValue" class="text-sm font-bold text-green-600">00:00</span>
                    </div>
                </div>
            </div>
        `;
        
        // Insert at the top of auction card
        const auctionContainer = document.getElementById('currentAuction');
        if (auctionContainer) {
            // Insert directly after the auction header
            const auctionHeader = auctionContainer.querySelector('.auction-header');
            if (auctionHeader) {
                auctionHeader.insertAdjacentHTML('afterend', timerHTML);
            } else {
                // Fallback: insert at the beginning of the container
                auctionContainer.insertAdjacentHTML('afterbegin', timerHTML);
            }
            
            // Store mobile timer elements
            if (!this.timerElement) {
                this.timerElement = document.getElementById('mobileBidTimerValue');
            }
        }
    }
    
    startTimer() {
        // Create timer displays if they don't exist
        this.createDesktopTimer();
        this.createMobileTimer();
        
        // Clear existing timer if running
        this.stopTimer();
        
        this.startTime = Date.now();
        this.elapsedSeconds = 0;
        this.isRunning = true;
        
        // Show timer displays
        this.showTimerDisplay();
        
        // Start the incremental timer
        this.updateTimer();
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    }
    
    updateTimer() {
        if (!this.isRunning) return;
        
        this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        
        // Update all timer displays
        this.updateDesktopTimer(this.elapsedSeconds);
        this.updateMobileTimer(this.elapsedSeconds);
    }
    
    updateDesktopTimer(elapsedSeconds) {
        const desktopTimer = document.getElementById('bidTimerValue');
        
        if (desktopTimer) {
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            desktopTimer.textContent = timeString;
            desktopTimer.className = 'text-xl font-bold text-green-600';
        }
    }
    
    updateMobileTimer(elapsedSeconds) {
        const mobileTimer = document.getElementById('mobileBidTimerValue');
        
        if (mobileTimer) {
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            mobileTimer.textContent = timeString;
            mobileTimer.className = 'text-sm font-bold text-green-600';
        }
    }
    
    resetTimer() {
        // Reset and restart the timer
        this.startTimer();
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.isRunning = false;
    }
    
    hideTimerDisplay() {
        // Hide timer section on desktop
        const timerSection = document.getElementById('timerSection');
        if (timerSection) {
            timerSection.classList.add('hidden');
        }
        
        // Hide mobile timer
        const mobileTimer = document.getElementById('mobileBidTimerDisplay');
        if (mobileTimer) {
            mobileTimer.classList.add('hidden');
        }
    }
    
    showTimerDisplay() {
        // Show timer section on desktop
        const timerSection = document.getElementById('timerSection');
        if (timerSection) {
            timerSection.classList.remove('hidden');
        }
        
        // Show mobile timer
        const mobileTimer = document.getElementById('mobileBidTimerDisplay');
        if (mobileTimer) {
            mobileTimer.classList.remove('hidden');
        }
    }
    
    
    setupSocketListeners() {
        // Wait for socket to be available
        setTimeout(() => {
            const socket = window.socketManager?.socket || window.mobileSocket?.socket;
            if (socket) {
                // Listen for bid events to reset timer
                socket.on('new-bid', (data) => {
                    console.log('New bid received, resetting timer');
                    this.resetTimer();
                });
                
                // Listen for auction start to show timer
                socket.on('auction-started', (data) => {
                    console.log('Auction started, starting timer');
                    this.startTimer();
                });
                
                // Listen for auction end to hide timer
                socket.on('auction-ended', (data) => {
                    console.log('Auction ended, stopping timer');
                    this.stopTimer();
                    this.hideTimerDisplay();
                });
                
                console.log('Bid timer socket listeners set up');
            } else {
                // Retry after a moment
                setTimeout(() => this.setupSocketListeners(), 1000);
            }
        }, 500);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.bidTimer = new BidTimer();
        console.log('Bid timer initialized');
    });
} else {
    window.bidTimer = new BidTimer();
    console.log('Bid timer initialized');
}