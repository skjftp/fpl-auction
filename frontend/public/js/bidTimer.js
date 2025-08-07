// Bid Timer Management
class BidTimer {
    constructor() {
        this.timerInterval = null;
        this.startTime = null;
        this.timerDuration = 30; // 30 seconds default
        this.isRunning = false;
        this.timerElement = null;
        this.progressElement = null;
        
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
            this.progressElement = document.getElementById('bidTimerProgress');
            return;
        }
        
        const timerHTML = `
            <div id="bidTimerDisplay" class="hidden mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-gray-700">Time Remaining</span>
                    <span id="bidTimerValue" class="text-2xl font-bold text-blue-600">30</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div id="bidTimerProgress" class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-linear" style="width: 100%"></div>
                </div>
            </div>
        `;
        
        // Find the container with auction details
        const auctionContainer = document.getElementById('currentAuction');
        if (auctionContainer) {
            const auctionItem = auctionContainer.querySelector('.auction-item');
            if (auctionItem) {
                // Insert timer after the auction item
                auctionItem.insertAdjacentHTML('afterend', timerHTML);
                this.timerElement = document.getElementById('bidTimerValue');
                this.progressElement = document.getElementById('bidTimerProgress');
            }
        }
    }
    
    createMobileTimer() {
        // Check if timer already exists
        if (document.getElementById('mobileBidTimerDisplay')) {
            return;
        }
        
        const timerHTML = `
            <div id="mobileBidTimerDisplay" class="hidden bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-200 mb-3">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-gray-600">Time Remaining</span>
                    <div class="flex items-center gap-2">
                        <div class="relative w-8 h-8">
                            <svg class="transform -rotate-90 w-8 h-8">
                                <circle cx="16" cy="16" r="14" stroke="#e5e7eb" stroke-width="3" fill="none"></circle>
                                <circle id="mobileTimerCircle" cx="16" cy="16" r="14" stroke="#3b82f6" stroke-width="3" fill="none"
                                        stroke-dasharray="88" stroke-dashoffset="0" class="transition-all duration-1000 ease-linear"></circle>
                            </svg>
                            <span id="mobileBidTimerValue" class="absolute inset-0 flex items-center justify-center text-sm font-bold text-blue-600">30</span>
                        </div>
                    </div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div id="mobileBidTimerProgress" class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-linear" style="width: 100%"></div>
                </div>
            </div>
        `;
        
        // Insert at the top of auction card
        const auctionContainer = document.getElementById('currentAuction');
        if (auctionContainer) {
            const auctionDetails = auctionContainer.querySelector('.auction-details');
            if (auctionDetails) {
                auctionDetails.insertAdjacentHTML('beforebegin', timerHTML);
            
            // Store mobile timer elements
            if (!this.timerElement) {
                this.timerElement = document.getElementById('mobileBidTimerValue');
                this.progressElement = document.getElementById('mobileBidTimerProgress');
            }
        }
    }
    
    startTimer(duration = null) {
        // Create timer displays if they don't exist
        this.createDesktopTimer();
        this.createMobileTimer();
        
        // Clear existing timer if running
        this.stopTimer();
        
        // Set duration if provided
        if (duration !== null) {
            this.timerDuration = duration;
        }
        
        this.startTime = Date.now();
        this.isRunning = true;
        
        // Show timer displays
        this.showTimerDisplay();
        
        // Start the countdown
        this.updateTimer();
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    }
    
    updateTimer() {
        if (!this.isRunning) return;
        
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const remaining = Math.max(0, this.timerDuration - elapsed);
        
        // Update all timer displays
        this.updateDesktopTimer(remaining);
        this.updateMobileTimer(remaining);
        
        // Check if timer expired
        if (remaining === 0) {
            this.onTimerExpired();
        }
    }
    
    updateDesktopTimer(remaining) {
        const desktopTimer = document.getElementById('bidTimerValue');
        const desktopProgress = document.getElementById('bidTimerProgress');
        
        if (desktopTimer) {
            desktopTimer.textContent = remaining;
            
            // Update color based on time remaining
            if (remaining <= 5) {
                desktopTimer.className = 'text-2xl font-bold text-red-600 animate-pulse';
            } else if (remaining <= 10) {
                desktopTimer.className = 'text-2xl font-bold text-orange-600';
            } else {
                desktopTimer.className = 'text-2xl font-bold text-blue-600';
            }
        }
        
        if (desktopProgress) {
            const percentage = (remaining / this.timerDuration) * 100;
            desktopProgress.style.width = `${percentage}%`;
            
            // Update progress bar color
            if (remaining <= 5) {
                desktopProgress.className = 'h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-1000 ease-linear';
            } else if (remaining <= 10) {
                desktopProgress.className = 'h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-1000 ease-linear';
            } else {
                desktopProgress.className = 'h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-linear';
            }
        }
    }
    
    updateMobileTimer(remaining) {
        const mobileTimer = document.getElementById('mobileBidTimerValue');
        const mobileProgress = document.getElementById('mobileBidTimerProgress');
        const mobileCircle = document.getElementById('mobileTimerCircle');
        
        if (mobileTimer) {
            mobileTimer.textContent = remaining;
            
            // Update color based on time remaining
            if (remaining <= 5) {
                mobileTimer.className = 'absolute inset-0 flex items-center justify-center text-sm font-bold text-red-600 animate-pulse';
            } else if (remaining <= 10) {
                mobileTimer.className = 'absolute inset-0 flex items-center justify-center text-sm font-bold text-orange-600';
            } else {
                mobileTimer.className = 'absolute inset-0 flex items-center justify-center text-sm font-bold text-blue-600';
            }
        }
        
        if (mobileProgress) {
            const percentage = (remaining / this.timerDuration) * 100;
            mobileProgress.style.width = `${percentage}%`;
            
            // Update progress bar color
            if (remaining <= 5) {
                mobileProgress.className = 'h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-1000 ease-linear';
            } else if (remaining <= 10) {
                mobileProgress.className = 'h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-1000 ease-linear';
            } else {
                mobileProgress.className = 'h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-linear';
            }
        }
        
        if (mobileCircle) {
            const circumference = 88; // 2 * π * r where r = 14
            const offset = circumference - (remaining / this.timerDuration) * circumference;
            mobileCircle.style.strokeDashoffset = offset;
            
            // Update circle color
            if (remaining <= 5) {
                mobileCircle.setAttribute('stroke', '#dc2626');
            } else if (remaining <= 10) {
                mobileCircle.setAttribute('stroke', '#ea580c');
            } else {
                mobileCircle.setAttribute('stroke', '#3b82f6');
            }
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
        const desktopTimer = document.getElementById('bidTimerDisplay');
        const mobileTimer = document.getElementById('mobileBidTimerDisplay');
        
        if (desktopTimer) {
            desktopTimer.classList.add('hidden');
        }
        if (mobileTimer) {
            mobileTimer.classList.add('hidden');
        }
    }
    
    showTimerDisplay() {
        const desktopTimer = document.getElementById('bidTimerDisplay');
        const mobileTimer = document.getElementById('mobileBidTimerDisplay');
        
        if (desktopTimer) {
            desktopTimer.classList.remove('hidden');
        }
        if (mobileTimer) {
            mobileTimer.classList.remove('hidden');
        }
    }
    
    onTimerExpired() {
        this.stopTimer();
        
        // Add visual/audio notification
        if (window.ttsManager && window.ttsManager.enabled) {
            window.ttsManager.speak('Bidding time expired!');
        }
        
        // Flash the timer display
        const desktopDisplay = document.getElementById('bidTimerDisplay');
        const mobileDisplay = document.getElementById('mobileBidTimerDisplay');
        
        if (desktopDisplay) {
            desktopDisplay.classList.add('animate-pulse', 'bg-red-50', 'border-red-300');
        }
        if (mobileDisplay) {
            mobileDisplay.classList.add('animate-pulse', 'bg-red-50', 'border-red-300');
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