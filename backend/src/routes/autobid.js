const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { collections } = require('../models/database');
const admin = require('firebase-admin');

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
        
        // Save configuration
        await collections.autoBidConfigs.doc(`team_${teamId}`).set({
            ...config,
            teamId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ success: true, message: 'Auto-bid configuration saved' });
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

module.exports = router;