const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');

// Save team submission for a gameweek
router.post('/submit', authenticateToken, async (req, res) => {
    try {
        const {
            gameweek,
            starting_11,
            bench,
            captain_id,
            vice_captain_id,
            club_multiplier_id,
            chip_used
        } = req.body;

        const teamId = req.user.teamId;
        const userId = teamId; // Use teamId as userId since they're the same in this system

        // Validate required fields
        if (!gameweek || !starting_11 || !bench || !captain_id) {
            return res.status(400).json({
                error: 'Missing required fields'
            });
        }

        // Create submission document
        const submission = {
            team_id: teamId,
            user_id: userId,
            gameweek: gameweek,
            starting_11: starting_11,
            bench: bench,
            captain_id: captain_id,
            vice_captain_id: vice_captain_id,
            club_multiplier_id: club_multiplier_id,
            chip_used: chip_used || null,
            submitted_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        // Save to Firestore
        const docId = `${teamId}_gw${gameweek}`;
        await db.collection('gameweekTeams').doc(docId).set(submission);

        // Update chip usage if a chip was used
        if (chip_used) {
            await db.collection('chipUsage').doc(`${teamId}_${chip_used}`).set({
                team_id: teamId,
                chip_id: chip_used,
                gameweek_used: gameweek,
                used_at: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        res.json({
            success: true,
            message: 'Team submitted successfully',
            submission_id: docId
        });
    } catch (error) {
        console.error('Error submitting team:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get team submission for a specific gameweek
router.get('/submission/:gameweek', authenticateToken, async (req, res) => {
    try {
        const gameweek = parseInt(req.params.gameweek);
        const teamId = req.user.teamId;

        const docId = `${teamId}_gw${gameweek}`;
        const doc = await db.collection('gameweekTeams').doc(docId).get();

        if (!doc.exists) {
            return res.status(404).json({
                error: 'No submission found for this gameweek'
            });
        }

        res.json(doc.data());
    } catch (error) {
        console.error('Error fetching submission:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all teams for a specific gameweek (admin only)
router.get('/all/:gameweek', authenticateToken, async (req, res) => {
    try {
        const gameweek = parseInt(req.params.gameweek);
        
        const snapshot = await db.collection('gameweekTeams')
            .where('gameweek', '==', gameweek)
            .get();

        const teams = [];
        snapshot.forEach(doc => {
            teams.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json(teams);
    } catch (error) {
        console.error('Error fetching all teams:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get chip usage status for a team
router.get('/chips/status', authenticateToken, async (req, res) => {
    try {
        const teamId = req.user.teamId;
        
        const snapshot = await db.collection('chipUsage')
            .where('team_id', '==', teamId)
            .get();

        const chipStatus = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            chipStatus.push({
                id: data.chip_id,
                used: true,
                gameweek_used: data.gameweek_used
            });
        });

        res.json(chipStatus);
    } catch (error) {
        console.error('Error fetching chip status:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;