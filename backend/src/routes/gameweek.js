const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { collections } = require('../models/database');
const axios = require('axios');

// FPL Bootstrap API endpoint
const FPL_API_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

// Cache for FPL data
let fplDataCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Chips configuration
const CHIPS = {
    'triple_captain': {
        name: 'Triple Captain',
        description: '3x points for Captain in that GW',
        rules: 'Captain gets 3x points instead of 2x'
    },
    'attack_chip': {
        name: 'Attack Chip',
        description: 'Points Doubled for Midfield and Forward Players in the playing 11',
        rules: 'MID and FWD players in playing 11 get 2x points'
    },
    'negative_chip': {
        name: 'Negative Chip (NC)',
        description: 'Team points total is divided by 2 for that GW. Can\'t play in Blank GW. Auto-Applied if not used in GW38',
        rules: 'Total points divided by 2, cannot use in blank GW'
    },
    'double_up': {
        name: 'Double Up (DU)',
        description: 'Team points total is multiplied by 2 for that GW. Can\'t play in Double GW',
        rules: 'Total points multiplied by 2, cannot use in double GW'
    },
    'bench_boost': {
        name: 'Bench Boost (BB)',
        description: 'All 15 players\' points counted for that GW',
        rules: 'All 15 players contribute points'
    },
    'park_the_bus': {
        name: 'Park the Bus (PB)',
        description: 'All defenders and goalkeeper in starting XI get 2X points in that GW',
        rules: 'GKP and DEF in starting 11 get 2x points'
    },
    'brahmasthra': {
        name: 'Brahmasthra',
        description: 'Top 11 Player points (irrespective of the formation/selection to be considered for Point calculation of that GW. Club Multiplier which allows maximum points will be consider. Top Player points to be consider for Captain, in case of highest point player being eligible for club multiplier, Next best player to be consider for capt points',
        rules: 'Auto-selects best 11 players for points, applies optimal club multiplier and captain'
    }
};

// Get FPL bootstrap data
async function getFPLData() {
    try {
        // Check cache
        if (fplDataCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
            return fplDataCache;
        }

        const response = await axios.get(FPL_API_URL);
        fplDataCache = response.data;
        cacheTimestamp = Date.now();
        return fplDataCache;
    } catch (error) {
        console.error('Error fetching FPL data:', error);
        throw error;
    }
}

// Get current gameweek and deadline
router.get('/current', async (req, res) => {
    try {
        const fplData = await getFPLData();
        
        // Find current and next gameweek
        const currentEvent = fplData.events.find(event => event.is_current);
        const nextEvent = fplData.events.find(event => event.is_next);
        
        if (!currentEvent && !nextEvent) {
            return res.status(404).json({ error: 'No current gameweek found' });
        }
        
        const now = new Date();
        let activeEvent = currentEvent || nextEvent;
        let submissionGameweek = activeEvent.id;
        let playingGameweek = activeEvent.id;
        
        // If current gameweek exists and its deadline has passed by more than 1 hour,
        // start accepting submissions for next gameweek
        if (currentEvent && nextEvent) {
            const currentDeadline = new Date(currentEvent.deadline_time);
            const oneHourAfterDeadline = new Date(currentDeadline.getTime() + (60 * 60 * 1000));
            
            if (now > oneHourAfterDeadline) {
                // More than 1 hour past current deadline - switch to next gameweek for submissions
                submissionGameweek = nextEvent.id;
                activeEvent = nextEvent;
                console.log(`Deadline + 1 hour passed for GW${currentEvent.id}, switching submissions to GW${nextEvent.id}`);
            }
            
            // Playing gameweek is the one currently being played (finished or in progress)
            if (currentEvent.finished) {
                playingGameweek = currentEvent.id;
            } else if (now > currentDeadline) {
                // Current gameweek deadline passed but not finished - still playing current
                playingGameweek = currentEvent.id;
            } else {
                // Before current deadline - show previous gameweek if available
                const previousGw = Math.max(1, currentEvent.id - 1);
                playingGameweek = previousGw;
            }
        }

        res.json({
            gameweek: submissionGameweek, // For submissions
            playing_gameweek: playingGameweek, // For league standings
            name: activeEvent.name,
            deadline_time: activeEvent.deadline_time,
            finished: activeEvent.finished,
            is_current: activeEvent.is_current,
            is_next: activeEvent.is_next,
            auto_advanced: submissionGameweek !== (currentEvent?.id || nextEvent?.id) // Flag if we auto-advanced
        });
    } catch (error) {
        console.error('Error getting current gameweek:', error);
        res.status(500).json({ error: 'Failed to get gameweek data' });
    }
});

// Get all gameweeks
router.get('/all', async (req, res) => {
    try {
        const fplData = await getFPLData();
        
        const gameweeks = fplData.events.map(event => ({
            gameweek: event.id,
            name: event.name,
            deadline_time: event.deadline_time,
            finished: event.finished,
            is_current: event.is_current,
            is_next: event.is_next
        }));

        res.json(gameweeks);
    } catch (error) {
        console.error('Error getting gameweeks:', error);
        res.status(500).json({ error: 'Failed to get gameweeks data' });
    }
});

// Submit team for gameweek
router.post('/submit-team', authenticateToken, async (req, res) => {
    try {
        const { 
            gameweek, 
            starting_11, // Array of player IDs
            bench, // Array of player IDs (4 players)
            captain_id,
            vice_captain_id,
            club_multiplier_id, // Club ID for 1.5x multiplier
            chip_used // Optional chip name
        } = req.body;

        const teamId = req.user.id;

        // Get current gameweek deadline
        const fplData = await getFPLData();
        const gwEvent = fplData.events.find(e => e.id === gameweek);
        
        if (!gwEvent) {
            return res.status(400).json({ error: 'Invalid gameweek' });
        }

        // Check deadline with 1 hour grace period logic
        const deadline = new Date(gwEvent.deadline_time);
        const now = new Date();
        const oneHourAfterDeadline = new Date(deadline.getTime() + (60 * 60 * 1000));
        
        // Allow submissions if:
        // 1. Before deadline, OR
        // 2. Within 1 hour after deadline (submissions go to next gameweek)
        if (now > oneHourAfterDeadline) {
            return res.status(400).json({ 
                error: 'Submission window closed. Please wait for next gameweek.', 
                deadline_passed: true,
                grace_period_ended: true 
            });
        }

        // Validate team composition
        if (starting_11.length !== 11) {
            return res.status(400).json({ error: 'Starting 11 must have exactly 11 players' });
        }

        if (bench.length !== 4) {
            return res.status(400).json({ error: 'Bench must have exactly 4 players' });
        }

        // Validate formation (1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD)
        const allPlayers = [...starting_11];
        const playerDocs = await Promise.all(
            allPlayers.map(id => collections.fplPlayers.doc(id.toString()).get())
        );

        const positions = { 1: 0, 2: 0, 3: 0, 4: 0 }; // GKP, DEF, MID, FWD
        playerDocs.forEach(doc => {
            if (doc.exists) {
                positions[doc.data().position]++;
            }
        });

        // Validate formation
        if (positions[1] !== 1) {
            return res.status(400).json({ error: 'Must have exactly 1 goalkeeper in starting 11' });
        }
        if (positions[2] < 3 || positions[2] > 5) {
            return res.status(400).json({ error: 'Must have 3-5 defenders in starting 11' });
        }
        if (positions[3] < 2 || positions[3] > 5) {
            return res.status(400).json({ error: 'Must have 2-5 midfielders in starting 11' });
        }
        if (positions[4] < 1 || positions[4] > 3) {
            return res.status(400).json({ error: 'Must have 1-3 forwards in starting 11' });
        }

        // Validate captain and vice-captain
        if (!starting_11.includes(captain_id)) {
            return res.status(400).json({ error: 'Captain must be in starting 11' });
        }
        if (!starting_11.includes(vice_captain_id)) {
            return res.status(400).json({ error: 'Vice-captain must be in starting 11' });
        }
        if (captain_id === vice_captain_id) {
            return res.status(400).json({ error: 'Captain and vice-captain must be different players' });
        }

        // Validate chip usage
        if (chip_used) {
            if (!CHIPS[chip_used]) {
                return res.status(400).json({ error: 'Invalid chip' });
            }

            // Check if chip already used
            const chipHistory = await collections.chipUsage
                .where('team_id', '==', teamId)
                .where('chip', '==', chip_used)
                .get();

            if (!chipHistory.empty) {
                return res.status(400).json({ error: 'This chip has already been used' });
            }

            // Check if any chip used this gameweek
            const gwChips = await collections.chipUsage
                .where('team_id', '==', teamId)
                .where('gameweek', '==', gameweek)
                .get();

            if (!gwChips.empty) {
                return res.status(400).json({ error: 'Only one chip can be used per gameweek' });
            }

            // Special rules for specific chips
            if (chip_used === 'negative_chip' && gwEvent.is_blank) {
                return res.status(400).json({ error: 'Cannot use Negative Chip in blank gameweek' });
            }
            if (chip_used === 'double_up' && gwEvent.is_dgw) {
                return res.status(400).json({ error: 'Cannot use Double Up in double gameweek' });
            }
        }

        // Save team submission
        const submissionId = `${teamId}_gw${gameweek}`;
        await collections.teamSubmissions.doc(submissionId).set({
            team_id: teamId,
            gameweek: gameweek,
            starting_11: starting_11,
            bench: bench,
            captain_id: captain_id,
            vice_captain_id: vice_captain_id,
            club_multiplier_id: club_multiplier_id,
            chip_used: chip_used,
            submitted_at: new Date().toISOString(),
            deadline: gwEvent.deadline_time
        });

        // Record chip usage
        if (chip_used) {
            await collections.chipUsage.add({
                team_id: teamId,
                gameweek: gameweek,
                chip: chip_used,
                used_at: new Date().toISOString()
            });
        }

        res.json({ 
            success: true, 
            message: 'Team submitted successfully',
            submission_id: submissionId
        });
    } catch (error) {
        console.error('Error submitting team:', error);
        res.status(500).json({ error: 'Failed to submit team' });
    }
});

// Get team submission for a gameweek
router.get('/team-submission/:gameweek', authenticateToken, async (req, res) => {
    try {
        const { gameweek } = req.params;
        const teamId = req.user.id;
        const submissionId = `${teamId}_gw${gameweek}`;

        const submissionDoc = await collections.teamSubmissions.doc(submissionId).get();
        
        if (!submissionDoc.exists) {
            // Try to get previous gameweek submission as default
            if (parseInt(gameweek) > 1) {
                const prevSubmissionId = `${teamId}_gw${parseInt(gameweek) - 1}`;
                const prevDoc = await collections.teamSubmissions.doc(prevSubmissionId).get();
                
                if (prevDoc.exists) {
                    const prevData = prevDoc.data();
                    // Remove chip from previous submission
                    delete prevData.chip_used;
                    return res.json({ 
                        ...prevData,
                        gameweek: parseInt(gameweek),
                        is_default: true 
                    });
                }
            }
            
            return res.status(404).json({ error: 'No team submission found' });
        }

        res.json(submissionDoc.data());
    } catch (error) {
        console.error('Error getting team submission:', error);
        res.status(500).json({ error: 'Failed to get team submission' });
    }
});

// Get chip usage history
router.get('/chips-used', authenticateToken, async (req, res) => {
    try {
        const teamId = req.user.id;
        
        const chipsSnapshot = await collections.chipUsage
            .where('team_id', '==', teamId)
            .get();

        const usedChips = [];
        chipsSnapshot.forEach(doc => {
            usedChips.push(doc.data());
        });

        // Get all available chips with usage status
        const chipStatus = Object.keys(CHIPS).map(chipKey => ({
            id: chipKey,
            ...CHIPS[chipKey],
            used: usedChips.some(uc => uc.chip === chipKey),
            gameweek_used: usedChips.find(uc => uc.chip === chipKey)?.gameweek
        }));

        res.json(chipStatus);
    } catch (error) {
        console.error('Error getting chip usage:', error);
        res.status(500).json({ error: 'Failed to get chip usage' });
    }
});

// Calculate points for a gameweek
router.get('/points/:gameweek', async (req, res) => {
    try {
        const { gameweek } = req.params;
        
        // Get all team submissions for this gameweek
        const submissionsSnapshot = await collections.teamSubmissions
            .where('gameweek', '==', parseInt(gameweek))
            .get();

        const teamPoints = [];
        
        for (const doc of submissionsSnapshot.docs) {
            const submission = doc.data();
            const points = await calculateTeamPoints(submission, gameweek);
            teamPoints.push({
                team_id: submission.team_id,
                gameweek: gameweek,
                points: points,
                chip_used: submission.chip_used
            });
        }

        res.json(teamPoints);
    } catch (error) {
        console.error('Error calculating points:', error);
        res.status(500).json({ error: 'Failed to calculate points' });
    }
});

// Helper function to calculate team points
async function calculateTeamPoints(submission, gameweek) {
    // This would integrate with FPL API to get actual player points
    // For now, returning placeholder
    return {
        total: 0,
        breakdown: {
            starting_11: 0,
            bench: 0,
            captain_bonus: 0,
            club_multiplier: 0,
            chip_bonus: 0
        }
    };
}

module.exports = router;