const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { collections } = require('../models/database');
const admin = require('firebase-admin');
const { getActiveDraftId } = require('../utils/draft');

// Get auto-bid configuration for the authenticated team
router.get('/config', authenticateToken, async (req, res) => {
    try {
        const teamId = req.user.teamId || req.user.id;
        const configDoc = await collections.autoBidConfigs.doc(`team_${teamId}`).get();
        
        if (!configDoc.exists) {
            return res.json({
                players: {}
            });
        }
        
        res.json(configDoc.data());
    } catch (error) {
        console.error('Error getting auto-bid config:', error);
        res.status(500).json({ error: 'Failed to get auto-bid configuration' });
    }
});

// Helper function to calculate max allowed bid
async function calculateMaxAllowedBid(teamId) {
    try {
        // Get team's current budget
        const teamQuery = await collections.teams
            .where('id', '==', teamId)
            .limit(1)
            .get();
        
        if (teamQuery.empty) {
            return 0;
        }
        
        const team = teamQuery.docs[0].data();
        const currentBudget = team.budget || 0;
        
        // Get active draft ID using the shared function
        const draftId = await getActiveDraftId();
        
        // Try both string and number formats for team_id
        let squadSnapshot = await collections.teamSquads
            .where('team_id', '==', teamId)
            .where('draft_id', '==', draftId)
            .get();
        
        // If no results, try with team_id as a number
        if (squadSnapshot.empty && typeof teamId === 'string') {
            const teamIdNum = parseInt(teamId);
            if (!isNaN(teamIdNum)) {
                squadSnapshot = await collections.teamSquads
                    .where('team_id', '==', teamIdNum)
                    .where('draft_id', '==', draftId)
                    .get();
            }
        }
        
        // Total slots = 15 players + 2 clubs = 17
        const TOTAL_SLOTS = 17;
        const currentSquadSize = squadSnapshot.size;
        const remainingSlots = TOTAL_SLOTS - currentSquadSize;
        
        if (remainingSlots <= 0) {
            return 0; // Squad is complete
        }
        
        if (remainingSlots === 1) {
            return currentBudget; // Last slot - can use full budget
        }
        
        // Need to reserve minimum 5 for each remaining slot (after this purchase)
        const slotsToReserveFor = remainingSlots - 1;
        const reserveAmount = slotsToReserveFor * 5;
        const maxBid = currentBudget - reserveAmount;
        
        return Math.max(0, maxBid);
    } catch (error) {
        console.error('Error calculating max allowed bid:', error);
        return 0;
    }
}

// Save auto-bid configuration for the authenticated team
router.post('/config', authenticateToken, async (req, res) => {
    try {
        const teamId = req.user.teamId || req.user.id;
        const config = req.body;
        
        console.log('Auto-bid save - User:', req.user);
        console.log('Auto-bid save - TeamId:', teamId);
        
        // Validate configuration
        if (!config || typeof config !== 'object') {
            return res.status(400).json({ error: 'Invalid configuration' });
        }
        
        // Calculate max allowed bid for informational purposes only
        const maxAllowedBid = await calculateMaxAllowedBid(teamId);
        
        // Log if any configs exceed current max (but don't block saving)
        if (config.players && typeof config.players === 'object') {
            const highBids = [];
            
            for (const [playerId, playerConfig] of Object.entries(config.players)) {
                if (playerConfig.maxBid && playerConfig.maxBid > maxAllowedBid) {
                    highBids.push({
                        playerId,
                        configuredMax: playerConfig.maxBid,
                        currentAllowedMax: maxAllowedBid
                    });
                }
            }
            
            if (highBids.length > 0) {
                console.log(`Team ${teamId} saved auto-bid config with bids exceeding current max of J${maxAllowedBid}m:`, highBids);
                console.log('These will be limited to the allowed max at bidding time');
            }
        }
        
        // Save configuration (allow saving even if exceeds current max)
        await collections.autoBidConfigs.doc(`team_${teamId}`).set({
            ...config,
            teamId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ 
            success: true, 
            message: 'Auto-bid configuration saved',
            currentMaxAllowed: maxAllowedBid,
            note: 'Auto-bid will respect budget limits at bidding time'
        });
    } catch (error) {
        console.error('Error saving auto-bid config:', error);
        res.status(500).json({ error: 'Failed to save auto-bid configuration' });
    }
});

// Get auto-bid status for a team
router.get('/status/:teamId', authenticateToken, async (req, res) => {
    try {
        const { teamId } = req.params;
        const configDoc = await collections.autoBidConfigs.doc(`team_${teamId}`).get();
        
        if (!configDoc.exists) {
            return res.json({ enabled: false });
        }
        
        const config = configDoc.data();
        res.json({ 
            enabled: config.enabled || false,
            activePlayersCount: Object.keys(config.players || {}).length
        });
    } catch (error) {
        console.error('Error getting auto-bid status:', error);
        res.status(500).json({ error: 'Failed to get auto-bid status' });
    }
});

// Get max allowed bid for the authenticated team
router.get('/max-allowed-bid', authenticateToken, async (req, res) => {
    try {
        const teamId = req.user.teamId || req.user.id;
        const maxAllowedBid = await calculateMaxAllowedBid(teamId);
        
        res.json({ 
            maxAllowedBid,
            message: `Maximum bid allowed based on your budget and remaining slots: J${maxAllowedBid}m`
        });
    } catch (error) {
        console.error('Error getting max allowed bid:', error);
        res.status(500).json({ error: 'Failed to calculate max allowed bid' });
    }
});

module.exports = router;