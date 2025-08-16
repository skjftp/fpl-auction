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
            // Try to auto-copy from previous gameweek if gameweek > 1
            if (gameweek > 1) {
                const prevGameweek = gameweek - 1;
                const prevDocId = `${teamId}_gw${prevGameweek}`;
                const prevDoc = await db.collection('gameweekTeams').doc(prevDocId).get();
                
                if (prevDoc.exists) {
                    // Auto-copy previous gameweek's team
                    const prevData = prevDoc.data();
                    const newSubmission = {
                        ...prevData,
                        gameweek: gameweek,
                        chip_used: null, // Reset chip for new gameweek
                        submitted_at: admin.firestore.FieldValue.serverTimestamp(),
                        updated_at: admin.firestore.FieldValue.serverTimestamp(),
                        auto_copied: true,
                        copied_from_gw: prevGameweek,
                        deadline_status: 'on_time' // Reset deadline status for new gameweek
                    };
                    
                    // Save the auto-copied submission
                    await db.collection('gameweekTeams').doc(docId).set(newSubmission);
                    
                    console.log(`Auto-copied team ${teamId} from GW${prevGameweek} to GW${gameweek}`);
                    return res.json(newSubmission);
                }
            }
            
            return res.status(404).json({
                error: 'No submission found for this gameweek'
            });
        }

        const data = doc.data();
        // Convert Firestore Timestamp to ISO string
        if (data.submitted_at && data.submitted_at.toDate) {
            data.submitted_at = data.submitted_at.toDate().toISOString();
        }
        if (data.updated_at && data.updated_at.toDate) {
            data.updated_at = data.updated_at.toDate().toISOString();
        }
        res.json(data);
    } catch (error) {
        console.error('Error fetching submission:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get another team's submission for a specific gameweek WITH player details (optimized)
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

        const data = doc.data();
        // Convert Firestore Timestamp to ISO string
        if (data.submitted_at && data.submitted_at.toDate) {
            data.submitted_at = data.submitted_at.toDate().toISOString();
        }
        if (data.updated_at && data.updated_at.toDate) {
            data.updated_at = data.updated_at.toDate().toISOString();
        }
        
        // Fetch player details for the submission
        const allPlayerIds = [...(data.starting_11 || []), ...(data.bench || [])];
        const playerPromises = allPlayerIds.map(playerId => 
            db.collection('fpl_players').doc(playerId.toString()).get()
        );
        
        const playerDocs = await Promise.all(playerPromises);
        const playerDetails = {};
        const clubIds = new Set(); // Track unique club IDs for fetching club details
        
        playerDocs.forEach(doc => {
            if (doc.exists) {
                const player = doc.data();
                // Only send necessary fields to minimize payload
                playerDetails[player.id] = {
                    id: player.id,
                    web_name: player.web_name,
                    first_name: player.first_name,
                    second_name: player.second_name,
                    position: player.position,
                    team_id: player.team_id,
                    photo: player.photo,
                    total_points: player.total_points
                };
                // Collect club IDs
                if (player.team_id) {
                    clubIds.add(player.team_id.toString());
                }
            }
        });
        
        // Fetch live points if available
        let livePoints = {};
        try {
            const axios = require('axios');
            const cacheKey = `live_points_gw${gameweek}`;
            const cached = global.livePointsCache && global.livePointsCache[cacheKey];
            
            if (cached && (Date.now() - cached.timestamp < 60000)) {
                livePoints = cached.data.points || {};
            } else {
                // Fetch fresh if not cached
                const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
                if (response.data && response.data.elements) {
                    // FPL API returns elements as an array, not an object
                    response.data.elements.forEach(playerData => {
                        if (playerData && playerData.stats) {
                            // Use player ID as key
                            livePoints[playerData.id] = {
                                points: playerData.stats.total_points || 0,
                                minutes: playerData.stats.minutes || 0,
                                bonus: playerData.stats.bonus || 0
                            };
                        }
                    });
                    
                    // Cache it
                    if (!global.livePointsCache) {
                        global.livePointsCache = {};
                    }
                    global.livePointsCache[cacheKey] = {
                        data: { points: livePoints },
                        timestamp: Date.now()
                    };
                }
            }
            
            // Add live points to player details
            Object.keys(playerDetails).forEach(playerId => {
                if (livePoints[playerId]) {
                    playerDetails[playerId].live_points = livePoints[playerId].points;
                    playerDetails[playerId].minutes = livePoints[playerId].minutes;
                    playerDetails[playerId].bonus = livePoints[playerId].bonus;
                }
            });
        } catch (error) {
            console.log('Could not fetch live points:', error.message);
        }
        
        // Fetch all needed club details in parallel
        const clubDetailsMap = {};
        if (clubIds.size > 0) {
            const clubPromises = Array.from(clubIds).map(clubId => 
                db.collection('fpl_clubs').doc(clubId).get()
            );
            const clubDocs = await Promise.all(clubPromises);
            clubDocs.forEach(doc => {
                if (doc.exists) {
                    const club = doc.data();
                    clubDetailsMap[club.id] = {
                        id: club.id,
                        name: club.name,
                        short_name: club.short_name
                    };
                }
            });
        }
        
        // Add club multiplier details if set
        let clubMultiplierDetails = null;
        if (data.club_multiplier_id) {
            if (clubDetailsMap[data.club_multiplier_id]) {
                clubMultiplierDetails = clubDetailsMap[data.club_multiplier_id];
            } else {
                // Fetch if not already in map
                const clubDoc = await db.collection('fpl_clubs').doc(data.club_multiplier_id.toString()).get();
                if (clubDoc.exists) {
                    const club = clubDoc.data();
                    clubMultiplierDetails = {
                        id: club.id,
                        name: club.name,
                        short_name: club.short_name
                    };
                }
            }
        }
        
        // Return submission with player and club details
        res.json({
            ...data,
            player_details: playerDetails,
            club_details: clubDetailsMap,
            club_multiplier_details: clubMultiplierDetails
        });
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

// Get live points for a gameweek (optimized - returns only points mapping)
router.get('/gameweek/:gameweek/live-points', authenticateToken, async (req, res) => {
    try {
        const gameweek = parseInt(req.params.gameweek);
        
        // Check cache first (cache for 1 minute during matches)
        const cacheKey = `live_points_gw${gameweek}`;
        const cached = global.livePointsCache && global.livePointsCache[cacheKey];
        
        if (cached && (Date.now() - cached.timestamp < 60000)) {
            return res.json(cached.data);
        }
        
        // Fetch from FPL API
        const axios = require('axios');
        const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
        
        // Process and extract only what we need
        const pointsMap = {};
        
        if (response.data && response.data.elements) {
            // FPL API returns elements as an array
            response.data.elements.forEach(playerData => {
                if (playerData && playerData.stats) {
                    // Use player ID as key
                    pointsMap[playerData.id] = {
                        points: playerData.stats.total_points || 0,
                        minutes: playerData.stats.minutes || 0,
                        bonus: playerData.stats.bonus || 0
                    };
                }
            });
        }
        
        // Cache the processed data
        if (!global.livePointsCache) {
            global.livePointsCache = {};
        }
        global.livePointsCache[cacheKey] = {
            data: { points: pointsMap, gameweek, timestamp: Date.now() },
            timestamp: Date.now()
        };
        
        res.json({ 
            points: pointsMap,
            gameweek,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('Error fetching live points:', error);
        res.status(500).json({ error: 'Failed to fetch live points' });
    }
});

// Get chip usage status for all teams
router.get('/chips/all-teams', authenticateToken, async (req, res) => {
    try {
        // Get all teams
        const teamsSnapshot = await db.collection('teams').get();
        const teams = {};
        teamsSnapshot.forEach(doc => {
            const team = doc.data();
            teams[team.id] = {
                id: team.id,
                name: team.name,
                chips_used: [],
                chip_current_gw: null
            };
        });
        
        // Get current gameweek
        const currentGwDoc = await db.collection('gameweekInfo').where('is_current', '==', true).limit(1).get();
        let currentGameweek = 1;
        if (!currentGwDoc.empty) {
            currentGameweek = currentGwDoc.docs[0].data().gameweek;
        }
        
        // Get all historical chip usage (from past gameweeks)
        const historicalChipsSnapshot = await db.collection('gameweekTeams')
            .where('gameweek', '<', currentGameweek)
            .get();
            
        historicalChipsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.chip_used && teams[data.team_id]) {
                teams[data.team_id].chips_used.push(data.chip_used);
            }
        });
        
        // Get current gameweek chip usage
        const currentGwSnapshot = await db.collection('gameweekTeams')
            .where('gameweek', '==', currentGameweek)
            .get();
            
        currentGwSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.chip_used && teams[data.team_id]) {
                teams[data.team_id].chip_current_gw = data.chip_used;
            }
        });
        
        res.json({
            teams: teams,
            current_gameweek: currentGameweek,
            all_chips: [
                'triple_captain',
                'bench_boost',
                'free_hit',
                'double_up',
                'negative_chip',
                'attack_chip',
                'park_the_bus',
                'brahmashtra'
            ]
        });
    } catch (error) {
        console.error('Error fetching all teams chip status:', error);
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

// Auto-copy team from previous gameweek
router.post('/auto-copy/:gameweek', authenticateToken, async (req, res) => {
    try {
        const gameweek = parseInt(req.params.gameweek);
        const teamId = req.user.teamId;
        
        if (gameweek <= 1) {
            return res.status(400).json({
                error: 'Cannot auto-copy for gameweek 1'
            });
        }
        
        // Check if submission already exists
        const docId = `${teamId}_gw${gameweek}`;
        const existingDoc = await db.collection('gameweekTeams').doc(docId).get();
        
        if (existingDoc.exists && !existingDoc.data().auto_copied) {
            return res.status(400).json({
                error: 'Submission already exists for this gameweek',
                submission: existingDoc.data()
            });
        }
        
        // Get previous gameweek submission
        const prevGameweek = gameweek - 1;
        const prevDocId = `${teamId}_gw${prevGameweek}`;
        const prevDoc = await db.collection('gameweekTeams').doc(prevDocId).get();
        
        if (!prevDoc.exists) {
            return res.status(404).json({
                error: `No submission found for gameweek ${prevGameweek} to copy from`
            });
        }
        
        // Create auto-copied submission
        const prevData = prevDoc.data();
        const newSubmission = {
            ...prevData,
            gameweek: gameweek,
            chip_used: null, // Reset chip for new gameweek
            submission_time: admin.firestore.FieldValue.serverTimestamp(),
            auto_copied: true,
            copied_from_gw: prevGameweek
        };
        
        // Save the auto-copied submission
        await db.collection('gameweekTeams').doc(docId).set(newSubmission);
        
        console.log(`Auto-copied team ${teamId} from GW${prevGameweek} to GW${gameweek}`);
        res.json({
            message: 'Team auto-copied successfully',
            submission: newSubmission
        });
        
    } catch (error) {
        console.error('Error auto-copying team:', error);
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