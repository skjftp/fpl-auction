const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// In-memory break state (can be moved to database if needed)
let breakState = {
    isOnBreak: false,
    startedAt: null,
    startedBy: null
};

// Toggle break status (admin only)
router.post('/toggle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        breakState.isOnBreak = !breakState.isOnBreak;
        
        if (breakState.isOnBreak) {
            breakState.startedAt = new Date();
            breakState.startedBy = req.user.username;
        } else {
            breakState.startedAt = null;
            breakState.startedBy = null;
        }
        
        console.log(`Break ${breakState.isOnBreak ? 'started' : 'ended'} by ${req.user.username}`);
        
        res.json({
            success: true,
            isOnBreak: breakState.isOnBreak,
            startedAt: breakState.startedAt,
            startedBy: breakState.startedBy
        });
    } catch (error) {
        console.error('Error toggling break:', error);
        res.status(500).json({ error: 'Failed to toggle break' });
    }
});

// End break (admin only)
router.post('/end', authenticateToken, requireAdmin, async (req, res) => {
    try {
        breakState.isOnBreak = false;
        breakState.startedAt = null;
        breakState.startedBy = null;
        
        console.log(`Break ended by ${req.user.username}`);
        
        res.json({
            success: true,
            isOnBreak: false
        });
    } catch (error) {
        console.error('Error ending break:', error);
        res.status(500).json({ error: 'Failed to end break' });
    }
});

// Get current break status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        res.json(breakState);
    } catch (error) {
        console.error('Error getting break status:', error);
        res.status(500).json({ error: 'Failed to get break status' });
    }
});

module.exports = {
    router,
    breakState
};