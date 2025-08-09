// Draft Reveal Animation System
class DraftRevealAnimation {
    constructor() {
        // Initialize properties first
        this.teamsToReveal = [];
        this.revealedCount = 0;
        this.isAnimating = false;
        this.animationEnabled = true; // Can be toggled by admin
        this.isInitiator = false;
        this.maxTeams = 10; // Maximum 10 teams
        
        // Get DOM elements
        this.updateDOMReferences();
        
        // Create Champions League anthem audio element
        this.anthemAudio = this.createAnthemAudio();
        
        this.initializeEventListeners();
        this.setupSocketListeners();
    }
    
    updateDOMReferences() {
        this.modal = document.getElementById('draftRevealModal');
        this.ballContainer = document.getElementById('ballContainer');
        this.revealedTeams = document.getElementById('revealedTeams');
        this.drawBtn = document.getElementById('drawTeamBtn');
        this.congratsOverlay = document.getElementById('congratsOverlay');
        
        if (!this.modal) {
            console.warn('Draft reveal modal not found in DOM - will retry when needed');
        }
    }
    
    createAnthemAudio() {
        const audio = document.createElement('audio');
        audio.id = 'championsLeagueAnthem';
        // Use the uploaded Champions League anthem
        audio.src = 'uefa_champions_leagu.mp3';
        audio.volume = 0.3; // Lower volume for background music
        audio.loop = true; // Loop during the reveal
        audio.setAttribute('playsinline', 'true'); // Important for iOS
        audio.setAttribute('preload', 'auto');
        
        document.body.appendChild(audio);
        return audio;
    }
    
    setupMobileAudioFallback() {
        // Add a one-time touch handler to enable audio on mobile
        const enableAudio = () => {
            if (this.anthemAudio && this.anthemAudio.paused) {
                this.anthemAudio.play().catch(e => console.log('Still cannot play audio:', e));
            }
            document.removeEventListener('touchstart', enableAudio);
            document.removeEventListener('click', enableAudio);
        };
        document.addEventListener('touchstart', enableAudio, { once: true });
        document.addEventListener('click', enableAudio, { once: true });
    }
    
    initializeEventListeners() {
        // No buttons to initialize anymore
    }
    
    // Start the reveal animation with draft order data
    async startReveal(draftOrder, animationEnabled = true, isInitiator = false) {
        // Retry getting DOM elements if not found initially
        if (!this.modal) {
            this.updateDOMReferences();
        }
        
        console.log('Starting draft reveal:', { 
            draftOrderLength: draftOrder?.length, 
            animationEnabled, 
            isInitiator, 
            modalExists: !!this.modal 
        });
        
        if (!this.modal) {
            console.error('Cannot start reveal - modal not found after retry');
            return;
        }
        
        this.animationEnabled = animationEnabled;
        this.isInitiator = isInitiator; // Only the admin who initiated will control the draw
        
        // If animation is disabled, show results immediately
        if (!this.animationEnabled) {
            this.showInstantResults(draftOrder);
            return;
        }
        
        // Setup for animation - limit to maxTeams
        this.teamsToReveal = [...draftOrder].slice(0, this.maxTeams);
        this.revealedCount = 0;
        this.revealedTeams.innerHTML = '';
        
        // Create balls in the bowl
        this.createBalls(Math.min(draftOrder.length, this.maxTeams));
        
        // Hide draw button - we'll use auto-draw
        if (this.drawBtn) {
            this.drawBtn.style.display = 'none';
        }
        
        // Show modal
        this.modal.classList.remove('hidden');
        
        // Start playing the Champions League anthem
        // Mobile browsers need user interaction first, so add a play button or user gesture
        try {
            this.anthemAudio.currentTime = 0;
            // Try to play with user gesture context (from the socket event that triggered this)
            const playPromise = this.anthemAudio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Anthem playing successfully');
                }).catch(e => {
                    console.log('Could not play anthem, trying with user interaction:', e);
                    // For mobile, we'll add a silent user interaction handler
                    this.setupMobileAudioFallback();
                });
            }
        } catch (e) {
            console.log('Error playing anthem:', e);
            this.setupMobileAudioFallback();
        }
        
        // Don't announce start - will announce with first team
        
        // Start automatic drawing
        // If initiator, they control the timing
        // If not initiator, start watching for draws
        this.startAutoDraw();
    }
    
    async startAutoDraw() {
        // Wait a moment for everyone to see the modal
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Only the initiator starts drawing teams
        // Others will receive the draws via socket events
        if (this.isInitiator) {
            this.autoDrawNextTeam();
        }
    }
    
    async autoDrawNextTeam() {
        if (this.revealedCount >= this.teamsToReveal.length) return;
        
        console.log('Auto-drawing team', this.revealedCount + 1);
        
        // Show drum roll effect
        await this.showDrumRoll();
        
        // Get the team to draw
        const position = this.revealedCount + 1;
        const team = this.teamsToReveal[this.revealedCount];
        
        // Broadcast the draw event to all clients (including self)
        if (this.isInitiator && window.socketManager && window.socketManager.socket) {
            console.log('Emitting draft-draw-team:', { position, team });
            window.socketManager.socket.emit('draft-draw-team', { 
                position,
                team
            });
        } else if (this.isInitiator) {
            // If socket not available, draw locally
            console.log('Socket not available, drawing locally');
            await this.drawTeam(position, team);
        }
    }
    
    async showDrumRoll() {
        return new Promise(resolve => {
            // Add visual effect - bowl shake
            const bowl = document.querySelector('#draftBowl > div');
            if (bowl) {
                bowl.classList.add('animate-shake');
            }
            
            // Create drawing text
            const drawingDiv = document.createElement('div');
            drawingDiv.className = 'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-3xl font-bold text-yellow-400 animate-pulse z-50';
            drawingDiv.innerHTML = '⚽ DRAWING... ⚽';
            const bowlContainer = document.getElementById('draftBowl');
            if (bowlContainer) {
                bowlContainer.appendChild(drawingDiv);
            }
            
            // The anthem is already playing in the background
            
            // Don't announce drawing - will announce the team result
            
            // After 2 seconds, remove drawing text and resolve
            setTimeout(() => {
                drawingDiv.remove();
                if (bowl) {
                    bowl.classList.remove('animate-shake');
                }
                resolve();
            }, 2000);
        });
    }
    
    createBalls(count) {
        this.ballContainer.innerHTML = '';
        
        // Check if mobile
        const isMobile = window.innerWidth < 768;
        const maxLeft = isMobile ? 90 : 140;
        const maxTop = isMobile ? 40 : 80;
        const leftOffset = isMobile ? 20 : 10;
        const topOffset = isMobile ? 15 : 10;
        
        // Create balls with random positions
        for (let i = 0; i < count; i++) {
            const ball = document.createElement('div');
            ball.className = 'draft-ball animate-bounce-ball';
            ball.style.left = `${leftOffset + Math.random() * maxLeft}px`;
            ball.style.top = `${topOffset + Math.random() * maxTop}px`;
            ball.style.animationDelay = `${Math.random() * 2}s`;
            
            const span = document.createElement('span');
            span.textContent = '?';
            ball.appendChild(span);
            
            this.ballContainer.appendChild(ball);
        }
    }
    
    // Handle the actual team draw (called by socket event or locally)
    async drawTeam(position, team) {
        if (this.isAnimating || position !== this.revealedCount + 1) return;
        
        this.isAnimating = true;
        
        // Pick a random ball
        const balls = this.ballContainer.querySelectorAll('.draft-ball');
        const remainingBalls = Array.from(balls).filter(b => !b.classList.contains('picked'));
        
        if (remainingBalls.length > 0) {
            const randomBall = remainingBalls[Math.floor(Math.random() * remainingBalls.length)];
            randomBall.classList.add('picked');
            
            // Animate ball being picked
            await this.animateBallPick(randomBall, team, position);
        }
        
        // Add team to revealed list
        this.addRevealedTeam(team, position);
        
        // Show congratulatory message
        await this.showCongratulations(team, position);
        
        this.revealedCount++;
        
        // Check if all teams revealed
        if (this.revealedCount >= this.teamsToReveal.length) {
            await this.completeReveal();
        } else if (this.isInitiator) {
            // Continue auto-drawing if we're the initiator
            setTimeout(() => {
                this.autoDrawNextTeam();
            }, 1000); // Wait 1 second before next draw
        }
        
        this.isAnimating = false;
    }
    
    // Setup socket listeners for synchronized drawing
    setupSocketListeners() {
        // Check if socket exists after a delay (socket might not be ready)
        setTimeout(() => {
            if (window.socketManager && window.socketManager.socket) {
                // Remove any existing listener first
                window.socketManager.socket.off('draft-team-drawn');
                
                // Listen for draw events from the initiator
                window.socketManager.socket.on('draft-team-drawn', async (data) => {
                    console.log('Team drawn event received:', data);
                    await this.drawTeam(data.position, data.team);
                });
                console.log('Draft reveal socket listener set up');
            } else {
                // DISABLED FOR PLAYING PHASE - No socket during gameplay
                // console.log('Socket not available for draft reveal');
                // setTimeout(() => this.setupSocketListeners(), 1000);
            }
        }, 500);
    }
    
    async animateBallPick(ball, team, position) {
        return new Promise(resolve => {
            // Create picked ball animation
            const pickedBall = document.getElementById('pickedBall');
            const ballRect = ball.getBoundingClientRect();
            
            // Position picked ball at original location
            pickedBall.style.left = `${ballRect.left}px`;
            pickedBall.style.top = `${ballRect.top}px`;
            pickedBall.querySelector('span').textContent = position;
            
            // Show and animate
            pickedBall.classList.remove('hidden');
            pickedBall.classList.add('animate-float-up');
            
            // Hide original ball
            ball.style.opacity = '0';
            
            // Hide picked ball after animation
            setTimeout(() => {
                pickedBall.classList.add('hidden');
                pickedBall.classList.remove('animate-float-up');
                ball.remove();
                resolve();
            }, 2000);
        });
    }
    
    addRevealedTeam(team, position) {
        const teamDiv = document.createElement('div');
        teamDiv.className = 'bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-4 text-white transform scale-0 animate-scale-up';
        teamDiv.style.animationDelay = '0.5s';
        
        teamDiv.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="flex items-center space-x-3">
                    <div class="text-3xl font-bold bg-white text-blue-900 w-12 h-12 rounded-full flex items-center justify-center">
                        ${position}
                    </div>
                    <div>
                        <div class="font-bold text-xl">${team.name}</div>
                        <div class="text-sm opacity-75">Position ${position} ${this.getPositionSuffix(position)}</div>
                    </div>
                </div>
                <div class="text-2xl">
                    ${this.getPositionEmoji(position)}
                </div>
            </div>
        `;
        
        this.revealedTeams.appendChild(teamDiv);
    }
    
    async showCongratulations(team, position) {
        return new Promise(resolve => {
            const messages = this.getCongratulatoryMessage(position);
            
            document.getElementById('congratsTeamName').textContent = team.name;
            document.getElementById('congratsMessage').textContent = messages.message;
            document.getElementById('congratsPosition').textContent = messages.position;
            
            // Show overlay
            this.congratsOverlay.classList.remove('hidden');
            const innerDiv = this.congratsOverlay.querySelector('div > div');
            innerDiv.classList.remove('scale-0');
            innerDiv.classList.add('animate-scale-up');
            
            // Announce if TTS enabled
            if (window.ttsManager && window.ttsManager.enabled) {
                window.ttsManager.speak(`${team.name} will pick ${this.getPositionText(position)}! ${messages.message}`);
            }
            
            // Hide after 3 seconds
            setTimeout(() => {
                innerDiv.classList.add('scale-0');
                innerDiv.classList.remove('animate-scale-up');
                setTimeout(() => {
                    this.congratsOverlay.classList.add('hidden');
                    resolve();
                }, 300);
            }, 3000);
        });
    }
    
    getCongratulatoryMessage(position) {
        const messages = {
            1: {
                position: '🥇 FIRST PICK!',
                message: 'The champions of destiny! First to build their dream team!'
            },
            2: {
                position: '🥈 SECOND PICK',
                message: 'Strong position! Great opportunities await!'
            },
            3: {
                position: '🥉 THIRD PICK',
                message: 'Bronze position with golden opportunities!'
            },
            4: {
                position: '4️⃣ FOURTH PICK',
                message: 'Solid position in the draft order!'
            },
            5: {
                position: '5️⃣ FIFTH PICK',
                message: 'Right in the middle - perfectly balanced!'
            },
            6: {
                position: '6️⃣ SIXTH PICK',
                message: 'Strategic position with great potential!'
            },
            7: {
                position: '7️⃣ SEVENTH PICK',
                message: 'Lucky number seven! Fortune favors you!'
            },
            8: {
                position: '8️⃣ EIGHTH PICK',
                message: 'Great position for strategic picks!'
            },
            9: {
                position: '9️⃣ NINTH PICK',
                message: 'Almost last but definitely not least!'
            },
            10: {
                position: '🔟 TENTH PICK',
                message: 'Last pick advantage - double picks in even rounds!'
            }
        };
        
        return messages[position] || { position: `#${position}`, message: 'Ready to compete!' };
    }
    
    getPositionEmoji(position) {
        const emojis = ['🥇', '🥈', '🥉', '🏆', '⭐', '🌟', '✨', '💫', '🔥', '💪'];
        return emojis[position - 1] || '🎯';
    }
    
    getPositionSuffix(position) {
        if (position === 1) return 'in the draft';
        if (position === 2) return 'in the draft';
        if (position === 3) return 'in the draft';
        return 'in the draft';
    }
    
    getPositionText(position) {
        const positions = ['first', 'second', 'third', 'fourth', 'fifth', 
                          'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
        return positions[position - 1] || `position ${position}`;
    }
    
    async completeReveal() {
        // Stop the Champions League anthem
        if (this.anthemAudio) {
            this.anthemAudio.pause();
            this.anthemAudio.currentTime = 0;
        }
        
        // Show completion message
        setTimeout(async () => {
            // Show "Auction will begin shortly" popup
            await this.showAuctionStartingSoon();
            
            // Close modal after delay
            setTimeout(() => {
                this.modal.classList.add('hidden');
                
                // Notify that reveal is complete (desktop has draftManager, mobile has mobileApp)
                if (window.draftManager) {
                    window.draftManager.onRevealComplete();
                } else if (window.mobileApp) {
                    window.mobileApp.loadDraftState();
                }
            }, 3000);
        }, 2000);
    }
    
    async showAuctionStartingSoon() {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[80]';
            overlay.innerHTML = `
                <div class="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-12 shadow-2xl transform scale-0 animate-scale-up">
                    <div class="text-center text-white">
                        <div class="text-6xl mb-4">🔨</div>
                        <h2 class="text-4xl font-bold mb-4">DRAFT ORDER SET!</h2>
                        <p class="text-2xl mb-2">The auction will begin shortly...</p>
                        <p class="text-lg opacity-90">Get ready to build your dream team!</p>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            const innerDiv = overlay.querySelector('div > div');
            
            setTimeout(() => {
                innerDiv.classList.remove('scale-0');
                innerDiv.classList.add('animate-scale-up');
            }, 100);
            
            // Announce
            if (window.ttsManager && window.ttsManager.enabled) {
                window.ttsManager.speak('Draft order is set! The auction will begin shortly. Get ready to build your dream team!');
            }
            
            // Remove after 3 seconds
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 3000);
        });
    }
    
    showInstantResults(draftOrder) {
        // Show results without animation - limit to maxTeams
        this.modal.classList.remove('hidden');
        if (this.drawBtn) this.drawBtn.style.display = 'none';
        
        this.revealedTeams.innerHTML = '';
        const teamsToShow = draftOrder.slice(0, this.maxTeams);
        teamsToShow.forEach((team, index) => {
            this.addRevealedTeam(team, index + 1);
        });
        
        // Auto close after 5 seconds
        setTimeout(() => {
            this.modal.classList.add('hidden');
            if (window.draftManager) {
                window.draftManager.onRevealComplete();
            } else if (window.mobileApp) {
                window.mobileApp.loadDraftState();
            }
        }, 5000);
    }
}

// DISABLED FOR PLAYING PHASE - Draft is complete
console.log('Draft reveal animation disabled for playing phase');

/* COMMENTED OUT FOR PLAYING PHASE
// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.draftRevealAnimation = new DraftRevealAnimation();
        console.log('Draft reveal animation initialized on DOMContentLoaded');
    });
} else {
    // DOM is already ready
    window.draftRevealAnimation = new DraftRevealAnimation();
    console.log('Draft reveal animation initialized immediately');
}
*/