// Draft Reveal Animation System
class DraftRevealAnimation {
    constructor() {
        this.modal = document.getElementById('draftRevealModal');
        this.ballContainer = document.getElementById('ballContainer');
        this.revealedTeams = document.getElementById('revealedTeams');
        this.drawBtn = document.getElementById('drawTeamBtn');
        this.skipBtn = document.getElementById('skipRevealBtn');
        this.congratsOverlay = document.getElementById('congratsOverlay');
        
        this.teamsToReveal = [];
        this.revealedCount = 0;
        this.isAnimating = false;
        this.animationEnabled = true; // Can be toggled by admin
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        if (this.drawBtn) {
            this.drawBtn.addEventListener('click', () => this.drawNextTeam());
        }
        
        if (this.skipBtn) {
            this.skipBtn.addEventListener('click', () => this.skipAnimation());
        }
    }
    
    // Start the reveal animation with draft order data
    async startReveal(draftOrder, animationEnabled = true) {
        this.animationEnabled = animationEnabled;
        
        // If animation is disabled, show results immediately
        if (!this.animationEnabled) {
            this.showInstantResults(draftOrder);
            return;
        }
        
        // Setup for animation
        this.teamsToReveal = [...draftOrder];
        this.revealedCount = 0;
        this.revealedTeams.innerHTML = '';
        
        // Create balls in the bowl
        this.createBalls(draftOrder.length);
        
        // Show modal
        this.modal.classList.remove('hidden');
        
        // Play dramatic sound if TTS is enabled
        if (window.ttsManager && window.ttsManager.enabled) {
            window.ttsManager.speak('The draft order reveal is about to begin! Get ready for the most exciting moment of the auction!');
        }
    }
    
    createBalls(count) {
        this.ballContainer.innerHTML = '';
        
        // Create balls with random positions
        for (let i = 0; i < count; i++) {
            const ball = document.createElement('div');
            ball.className = 'draft-ball animate-bounce-ball';
            ball.style.left = `${Math.random() * 80}px`;
            ball.style.top = `${Math.random() * 80}px`;
            ball.style.animationDelay = `${Math.random() * 2}s`;
            
            const span = document.createElement('span');
            span.textContent = '?';
            ball.appendChild(span);
            
            this.ballContainer.appendChild(ball);
        }
    }
    
    async drawNextTeam() {
        if (this.isAnimating || this.revealedCount >= this.teamsToReveal.length) return;
        
        this.isAnimating = true;
        this.drawBtn.disabled = true;
        this.drawBtn.classList.remove('animate-bounce');
        
        // Get next team
        const team = this.teamsToReveal[this.revealedCount];
        const position = this.revealedCount + 1;
        
        // Shake the bowl
        const bowl = document.querySelector('#draftBowl > div');
        bowl.classList.add('animate-shake');
        
        // Pick a random ball
        const balls = this.ballContainer.querySelectorAll('.draft-ball');
        const remainingBalls = Array.from(balls).filter(b => !b.classList.contains('picked'));
        
        if (remainingBalls.length > 0) {
            const randomBall = remainingBalls[Math.floor(Math.random() * remainingBalls.length)];
            randomBall.classList.add('picked');
            
            // Animate ball being picked
            await this.animateBallPick(randomBall, team, position);
        }
        
        // Remove shake
        setTimeout(() => {
            bowl.classList.remove('animate-shake');
        }, 500);
        
        // Add team to revealed list
        this.addRevealedTeam(team, position);
        
        // Show congratulatory message
        await this.showCongratulations(team, position);
        
        this.revealedCount++;
        
        // Check if all teams revealed
        if (this.revealedCount >= this.teamsToReveal.length) {
            await this.completeReveal();
        } else {
            // Re-enable draw button
            this.drawBtn.disabled = false;
            this.drawBtn.classList.add('animate-bounce');
            this.drawBtn.innerHTML = `🎲 DRAW TEAM #${this.revealedCount + 1}`;
        }
        
        this.isAnimating = false;
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
        // Disable draw button
        this.drawBtn.disabled = true;
        this.drawBtn.innerHTML = '✅ REVEAL COMPLETE!';
        this.drawBtn.classList.remove('animate-bounce');
        
        // Show completion message
        setTimeout(async () => {
            // Show "Auction will begin shortly" popup
            await this.showAuctionStartingSoon();
            
            // Close modal after delay
            setTimeout(() => {
                this.modal.classList.add('hidden');
                
                // Notify that reveal is complete
                if (window.draftManager) {
                    window.draftManager.onRevealComplete();
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
    
    skipAnimation() {
        if (this.teamsToReveal.length === 0) return;
        
        // Show all teams immediately
        this.revealedTeams.innerHTML = '';
        this.teamsToReveal.forEach((team, index) => {
            this.addRevealedTeam(team, index + 1);
        });
        
        // Complete immediately
        this.completeReveal();
    }
    
    showInstantResults(draftOrder) {
        // Show results without animation
        this.modal.classList.remove('hidden');
        this.drawBtn.style.display = 'none';
        this.skipBtn.style.display = 'none';
        
        this.revealedTeams.innerHTML = '';
        draftOrder.forEach((team, index) => {
            this.addRevealedTeam(team, index + 1);
        });
        
        // Auto close after 5 seconds
        setTimeout(() => {
            this.modal.classList.add('hidden');
            if (window.draftManager) {
                window.draftManager.onRevealComplete();
            }
        }, 5000);
    }
}

// Initialize when DOM is ready
window.draftRevealAnimation = new DraftRevealAnimation();