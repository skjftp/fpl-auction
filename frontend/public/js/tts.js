// Text-to-Speech announcements for auction events
class TTSManager {
    constructor() {
        this.enabled = false; // Start disabled by default, will load from localStorage
        this.voices = [];
        this.selectedVoice = null;
        this.init();
    }

    init() {
        // Load settings from localStorage FIRST
        this.loadSettings();
        
        // Check if TTS is supported
        if (!('speechSynthesis' in window)) {
            console.warn('TTS not supported in this browser');
            this.enabled = false;
            return;
        }

        // Load available voices
        this.loadVoices();
        
        // Listen for voices changed event (some browsers load voices asynchronously)
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.loadVoices();
        }
        
        console.log('TTS Manager initialized, enabled:', this.enabled);
    }

    loadVoices() {
        this.voices = speechSynthesis.getVoices();
        console.log('Available voices:', this.voices.length);
        
        // Prefer English voices
        const englishVoices = this.voices.filter(voice => 
            voice.lang.startsWith('en-') && 
            (voice.name.includes('Male') || voice.name.includes('Female') || voice.default)
        );
        
        // Select the best voice (prefer UK or US English)
        this.selectedVoice = englishVoices.find(voice => 
            voice.lang === 'en-GB' || voice.lang === 'en-US'
        ) || englishVoices[0] || this.voices[0];
        
        if (this.selectedVoice) {
            console.log('Selected voice:', this.selectedVoice.name, this.selectedVoice.lang);
        }
    }

    loadSettings() {
        const settings = localStorage.getItem('fpl-tts-settings');
        if (settings) {
            try {
                const parsed = JSON.parse(settings);
                this.enabled = parsed.enabled === true; // Only enable if explicitly true
            } catch (e) {
                console.error('Error parsing TTS settings:', e);
                this.enabled = false; // Default to disabled if parsing fails
            }
        } else {
            // No saved settings, keep default (disabled)
            this.enabled = false;
        }
    }

    saveSettings() {
        localStorage.setItem('fpl-tts-settings', JSON.stringify({
            enabled: this.enabled
        }));
    }

    toggle() {
        this.enabled = !this.enabled;
        this.saveSettings();
        return this.enabled;
    }

    speak(text, priority = false) {
        if (!this.enabled) return;
        
        // Cancel previous speech if this is high priority
        if (priority && speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }

        // Mobile browsers need a slight delay after user interaction
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            
            if (this.selectedVoice) {
                utterance.voice = this.selectedVoice;
            }
            
            utterance.rate = 0.9; // Slightly slower for clarity
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            
            // Error handling
            utterance.onerror = (event) => {
                console.error('TTS Error:', event.error);
                // On mobile, errors often occur if TTS isn't enabled in settings
                if (event.error === 'not-allowed') {
                    console.warn('TTS not allowed - user may need to enable in browser settings');
                }
            };

            // Ensure voices are loaded before speaking
            if (this.voices.length === 0) {
                this.loadVoices();
            }

            try {
                speechSynthesis.speak(utterance);
            } catch (error) {
                console.error('TTS speak error:', error);
            }
        }, 100);
    }

    // Auction event announcements
    announcePlayerAuction(playerName) {
        const text = `Next player up for auction is ${playerName}`;
        console.log('TTS announcing player:', text);
        this.speak(text, true);
    }

    announceClubAuction(clubName) {
        const text = `Next club up for auction is ${clubName}`;
        console.log('TTS announcing club:', text);
        this.speak(text, true);
    }

    announceSelling1() {
        this.speak("Selling one", false);
    }

    announceSelling2() {
        this.speak("Selling two", false);
    }

    announceSold(playerName, teamName, amount) {
        const text = `Sold! ${playerName} goes to ${teamName} for J ${amount}`;
        this.speak(text, true);
    }

    // Test function
    test() {
        this.speak("Text to speech is working correctly", true);
    }
}

// Global TTS manager instance
window.ttsManager = new TTSManager();