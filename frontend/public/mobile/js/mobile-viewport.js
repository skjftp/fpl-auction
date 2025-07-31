// Mobile viewport handler for chat input visibility
class MobileViewportHandler {
    constructor() {
        this.chatInput = null;
        this.auctionTab = null;
        this.fixedBottomChat = null;
        this.originalHeight = window.innerHeight;
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.chatInput = document.getElementById('chatInput');
        this.auctionTab = document.getElementById('auctionTab');
        this.fixedBottomChat = document.querySelector('.fixed-bottom-chat');

        if (!this.chatInput) return;

        // Handle viewport changes (keyboard show/hide)
        window.visualViewport?.addEventListener('resize', () => this.handleViewportChange());
        
        // Handle focus events
        this.chatInput.addEventListener('focus', () => this.handleInputFocus());
        this.chatInput.addEventListener('blur', () => this.handleInputBlur());

        // Handle orientation changes
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.adjustLayout(), 300);
        });

        // Initial adjustment
        this.adjustLayout();
    }

    handleViewportChange() {
        if (!window.visualViewport) return;
        
        const currentHeight = window.visualViewport.height;
        const keyboardHeight = this.originalHeight - currentHeight;
        
        if (keyboardHeight > 50) { // Keyboard is shown
            this.adjustForKeyboard(keyboardHeight);
        } else {
            this.resetLayout();
        }
    }

    handleInputFocus() {
        // Scroll chat input into view with some padding
        setTimeout(() => {
            if (this.fixedBottomChat) {
                this.fixedBottomChat.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'end' 
                });
            }
        }, 300);
    }

    handleInputBlur() {
        // Reset any adjustments
        setTimeout(() => {
            this.resetLayout();
        }, 100);
    }

    adjustForKeyboard(keyboardHeight) {
        if (this.auctionTab && this.auctionTab.classList.contains('active')) {
            // Temporarily adjust the auction tab height
            const safeAreaBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0');
            const adjustment = Math.max(keyboardHeight - safeAreaBottom, 0);
            
            this.auctionTab.style.paddingBottom = `${adjustment}px`;
            
            // Ensure chat is visible
            if (this.fixedBottomChat) {
                this.fixedBottomChat.style.marginBottom = `${adjustment + 20}px`;
            }
        }
    }

    resetLayout() {
        if (this.auctionTab) {
            this.auctionTab.style.paddingBottom = '';
        }
        if (this.fixedBottomChat) {
            this.fixedBottomChat.style.marginBottom = '';
        }
    }

    adjustLayout() {
        // Update CSS custom property for safe area bottom
        const safeAreaBottom = parseInt(window.getComputedStyle(document.documentElement).paddingBottom) || 0;
        document.documentElement.style.setProperty('--sab', `${safeAreaBottom}px`);
        
        // Update original height reference
        this.originalHeight = window.innerHeight;
    }
}

// Initialize viewport handler
window.mobileViewportHandler = new MobileViewportHandler();