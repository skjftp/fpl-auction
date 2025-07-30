// Text-to-Speech announcements for auction events
class TTSManager {
    constructor() {
        this.enabled = true;
        this.voices = [];
        this.selectedVoice = null;
        this.init();
    }

    init() {
        // Load available voices
        this.loadVoices();
        
        // Listen for voices changed event (some browsers load voices asynchronously)
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.loadVoices();
        }

        // Load settings from localStorage
        this.loadSettings();
    }

    loadVoices() {
        this.voices = speechSynthesis.getVoices();
        
        // Prefer English voices
        const englishVoices = this.voices.filter(voice => 
            voice.lang.startsWith('en-') && 
            (voice.name.includes('Male') || voice.name.includes('Female') || voice.default)
        );
        
        // Select the best voice (prefer UK or US English)
        this.selectedVoice = englishVoices.find(voice => 
            voice.lang === 'en-GB' || voice.lang === 'en-US'
        ) || englishVoices[0] || this.voices[0];
    }

    loadSettings() {
        const settings = localStorage.getItem('fpl-tts-settings');
        if (settings) {
            const parsed = JSON.parse(settings);
            this.enabled = parsed.enabled !== false; // Default to true
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
        };

        speechSynthesis.speak(utterance);
    }

    // Auction event announcements
    announcePlayerAuction(playerName) {
        const text = `Next player up for auction is ${playerName}`;
        this.speak(text, true);
    }

    announceClubAuction(clubName) {
        const text = `Next club up for auction is ${clubName}`;
        this.speak(text, true);
    }

    announceSelling1() {
        this.speak("Selling one", false);
    }

    announceSelling2() {
        this.speak("Selling two", false);
    }

    announceSold(playerName, teamName, amount) {
        const text = `Sold! ${playerName} goes to ${teamName} for ${amount}`;
        this.speak(text, true);
    }

    // Test function
    test() {
        this.speak("Text to speech is working correctly", true);
    }
}

// Global TTS manager instance
window.ttsManager = new TTSManager();