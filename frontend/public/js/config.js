// Feature flags configuration
window.FEATURE_FLAGS = {
    // Essential features (always enabled)
    POINTS_CALCULATION: true,
    TEAM_SUBMISSION: true,
    LEADERBOARD: true,
    
    // Non-essential features (disabled for performance)
    WEBSOCKET: false,
    CHAT: false,
    AUCTION: false,
    DRAFT: false,
    TTS: false,
    DRAFT_REVEAL: false,
    BREAK_MANAGER: false,
    AUTO_BID: false,
    LIVE_UPDATES: false,
    NOTIFICATIONS: false
};

// Override console logs for disabled features
const originalLog = console.log;
console.log = function(...args) {
    const message = args[0];
    if (typeof message === 'string') {
        // Filter out socket/chat related logs
        if (message.includes('Socket') || 
            message.includes('Chat') || 
            message.includes('socket') ||
            message.includes('auction') ||
            message.includes('draft') ||
            message.includes('TTS') ||
            message.includes('Break')) {
            return;
        }
    }
    originalLog.apply(console, args);
};