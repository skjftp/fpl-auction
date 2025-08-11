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
            chip_used,
            is_late_submission
        } = req.body;

        const teamId = req.user.teamId;
        const userId = teamId; // Use teamId as userId since they're the same in this system

        // Validate required fields
        if (!gameweek || !starting_11 || !bench || !captain_id) {
            return res.status(400).json({
                error: 'Missing required fields'
            });
        }

        // Get gameweek info to check deadline
        const gwDoc = await db.collection('gameweekInfo').doc(`gw_${gameweek}`).get();
        let actualGameweek = gameweek;
        let deadlineStatus = 'on_time';
        
        if (gwDoc.exists) {
            const gwData = gwDoc.data();
            const deadline = new Date(gwData.deadline);
            const now = new Date();
            const oneHourAfterDeadline = new Date(deadline.getTime() + (60 * 60 * 1000));
            
            // Check if deadline has passed
            if (now > deadline) {
                // If within grace period (1 hour), accept but mark as late
                if (now <= oneHourAfterDeadline) {
                    deadlineStatus = 'grace_period';
                    // Don't automatically change gameweek here - frontend handles this
                } else {
                    deadlineStatus = 'late';
                    // Don't automatically change gameweek here - frontend handles this
                }
                
                console.log(`Late submission for team ${teamId}: deadline was ${deadline}, submitted at ${now}, status: ${deadlineStatus}`);
            }
        }

        // Create submission document
        const submission = {
            team_id: teamId,
            user_id: userId,
            gameweek: actualGameweek,
            starting_11: starting_11,
            bench: bench,
            captain_id: captain_id,
            vice_captain_id: vice_captain_id,
            club_multiplier_id: club_multiplier_id,
            chip_used: chip_used || null,
            submitted_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            deadline_status: deadlineStatus,
            is_late_submission: is_late_submission || false
        };

        // Save to Firestore
        const docId = `${teamId}_gw${gameweek}`;
        await db.collection('gameweekTeams').doc(docId).set(submission);

        // Also save to submission history for audit trail
        const historyEntry = {
            ...submission,
            submission_version: Date.now(), // Unique version timestamp
            submitted_by_ip: req.ip || 'unknown',
            user_agent: req.headers['user-agent'] || 'unknown'
        };
        
        await db.collection('submissionHistory').add(historyEntry);
        console.log(`Saved submission history for team ${teamId}, gameweek ${gameweek}`);

        // Don't mark chip as used yet - it's only "planned" until deadline passes
        // Chips will be marked as used by a separate process after deadline
        // This allows users to change their mind before deadline

        // Prepare response message based on deadline status
        let message = 'Team submitted successfully';
        if (deadlineStatus === 'grace_period') {
            message = `Team submitted for Gameweek ${actualGameweek} (deadline passed - within grace period)`;
        } else if (deadlineStatus === 'late') {
            message = `Team submitted for Gameweek ${actualGameweek} (deadline passed)`;
        }
        
        res.json({
            success: true,
            message: message,
            submission_id: docId,
            deadline_status: deadlineStatus,
            gameweek: actualGameweek
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

// Get another team's submission for a specific gameweek (only after deadline)
router.get('/submission/:gameweek/:teamId', authenticateToken, async (req, res) => {
    try {
        const gameweek = parseInt(req.params.gameweek);
        const targetTeamId = req.params.teamId;
        
        // Check if deadline has passed for this gameweek
        const gwDoc = await db.collection('gameweekInfo').doc(`gw_${gameweek}`).get();
        if (gwDoc.exists) {
            const gwData = gwDoc.data();
            const deadline = new Date(gwData.deadline);
            const now = new Date();
            
            // Only allow viewing other teams after deadline (with some buffer)
            if (now <= deadline && gameweek === 1) {
                return res.status(403).json({
                    error: 'You can view other teams only after the deadline'
                });
            }
        }

        const docId = `${targetTeamId}_gw${gameweek}`;
        const doc = await db.collection('gameweekTeams').doc(docId).get();

        if (!doc.exists) {
            return res.status(404).json({
                error: 'No submission found for this gameweek'
            });
        }

        res.json(doc.data());
    } catch (error) {
        console.error('Error fetching team submission:', error);
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
        
        // Get actually used chips (after deadline)
        const usedSnapshot = await db.collection('chipUsage')
            .where('team_id', '==', teamId)
            .get();

        const chipStatus = [];
        
        // Mark chips that are permanently used (after deadline)
        usedSnapshot.forEach(doc => {
            const data = doc.data();
            chipStatus.push({
                id: data.chip_id,
                used: true,
                permanent: true,
                gameweek_used: data.gameweek_used
            });
        });
        
        // Get current gameweek submissions to see planned chips
        const currentGW = req.query.gameweek;
        if (currentGW) {
            const docId = `${teamId}_gw${currentGW}`;
            const submission = await db.collection('gameweekTeams').doc(docId).get();
            
            if (submission.exists && submission.data().chip_used) {
                const plannedChip = submission.data().chip_used;
                // Only add if not already in the permanently used list
                if (!chipStatus.find(cs => cs.id === plannedChip)) {
                    chipStatus.push({
                        id: plannedChip,
                        used: false,
                        planned: true,
                        gameweek_planned: currentGW
                    });
                }
            }
        }

        res.json(chipStatus);
    } catch (error) {
        console.error('Error fetching chip status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get submission history for a team
router.get('/history/:teamId/:gameweek', authenticateToken, async (req, res) => {
    try {
        const targetTeamId = parseInt(req.params.teamId);
        const gameweek = parseInt(req.params.gameweek);
        const requestingTeamId = req.user.teamId;
        
        // Only allow viewing own history or admin can view all
        if (targetTeamId !== requestingTeamId && !req.user.is_admin) {
            return res.status(403).json({ error: 'You can only view your own submission history' });
        }
        
        // Get all historical submissions for this team and gameweek
        const historySnapshot = await db.collection('submissionHistory')
            .where('team_id', '==', targetTeamId)
            .where('gameweek', '==', gameweek)
            .orderBy('submitted_at', 'desc')
            .get();
        
        const history = [];
        historySnapshot.forEach(doc => {
            const data = doc.data();
            history.push({
                id: doc.id,
                ...data,
                submitted_at: data.submitted_at?.toDate?.() || data.submitted_at
            });
        });
        
        res.json({
            team_id: targetTeamId,
            gameweek: gameweek,
            submission_count: history.length,
            submissions: history
        });
    } catch (error) {
        console.error('Error fetching submission history:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all submission history for current user
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const teamId = req.user.teamId;
        
        const historySnapshot = await db.collection('submissionHistory')
            .where('team_id', '==', teamId)
            .orderBy('submitted_at', 'desc')
            .limit(50) // Last 50 submissions
            .get();
        
        const history = [];
        historySnapshot.forEach(doc => {
            const data = doc.data();
            history.push({
                id: doc.id,
                ...data,
                submitted_at: data.submitted_at?.toDate?.() || data.submitted_at
            });
        });
        
        res.json(history);
    } catch (error) {
        console.error('Error fetching submission history:', error);
        res.status(500).json({ error: error.message });
    }
});

// Process chips after deadline (admin only)
router.post('/process-chips/:gameweek', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const gameweek = parseInt(req.params.gameweek);
        
        // Get all submissions for this gameweek
        const snapshot = await db.collection('gameweekTeams')
            .where('gameweek', '==', gameweek)
            .get();
        
        const batch = db.batch();
        let processedCount = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.chip_used) {
                // Mark chip as permanently used
                const chipUsageRef = db.collection('chipUsage').doc(`${data.team_id}_${data.chip_used}`);
                batch.set(chipUsageRef, {
                    team_id: data.team_id,
                    chip_id: data.chip_used,
                    gameweek_used: gameweek,
                    used_at: admin.firestore.FieldValue.serverTimestamp(),
                    processed: true
                });
                processedCount++;
            }
        });
        
        await batch.commit();
        
        res.json({
            success: true,
            message: `Processed ${processedCount} chips for gameweek ${gameweek}`
        });
    } catch (error) {
        console.error('Error processing chips:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;