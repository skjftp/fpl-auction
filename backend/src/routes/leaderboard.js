const express = require('express');
const router = express.Router();
const { collections } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios');

// Helper function to calculate points for a submission
async function calculateSubmissionPoints(submission, livePointsData) {
    let totalPoints = 0;
    const starting11Points = [];
    const benchPoints = [];
    
    // Get player details for multiplier calculations
    const allPlayerIds = [...(submission.starting_11 || []), ...(submission.bench || [])];
    const playerDetails = {};
    
    // Fetch player info for multipliers (club and position-based chips)
    if (allPlayerIds.length > 0) {
        const playerPromises = allPlayerIds.map(playerId => 
            collections.fplPlayers.doc(playerId.toString()).get()
        );
        const playerDocs = await Promise.all(playerPromises);
        playerDocs.forEach(doc => {
            if (doc.exists) {
                const player = doc.data();
                // Store both team_id and position for each player
                playerDetails[player.id] = {
                    team_id: player.team_id,
                    position: player.position
                };
            }
        });
        if (submission.club_multiplier_id) {
            console.log(`Team ${submission.team_id}: Club multiplier ${submission.club_multiplier_id}, Matching players:`, Object.entries(playerDetails).filter(([id, data]) => data.team_id == submission.club_multiplier_id).length);
        }
    }
    
    // Calculate starting 11 points
    for (const playerId of submission.starting_11 || []) {
        const playerPoints = livePointsData[playerId]?.points || 0;
        let finalPoints = playerPoints;
        const playerData = playerDetails[playerId] || {};
        
        // Apply captain/vice-captain multiplier first
        if (playerId == submission.captain_id) {
            const multiplier = submission.chip_used === 'triple_captain' ? 3 : 2;
            finalPoints = playerPoints * multiplier;
        } else if (playerId == submission.vice_captain_id && submission.captain_played === false) {
            finalPoints = playerPoints * 2;
        }
        
        // Apply position-specific chip bonuses
        if (submission.chip_used === 'attack_chip' && playerData.position && (playerData.position === 3 || playerData.position === 4)) {
            finalPoints = finalPoints * 2;
        } else if (submission.chip_used === 'park_the_bus' && playerData.position && (playerData.position === 1 || playerData.position === 2)) {
            finalPoints = finalPoints * 2;
        }
        
        // Apply club multiplier (1.5x for players from selected club) - use loose equality for type coercion
        if (submission.club_multiplier_id && playerData.team_id && playerData.team_id == submission.club_multiplier_id) {
            finalPoints = finalPoints * 1.5;
        }
        
        // Keep 3 decimal places for precision
        finalPoints = Math.round(finalPoints * 1000) / 1000;
        starting11Points.push({ playerId, points: finalPoints });
        totalPoints += finalPoints;
    }
    
    // Calculate bench points if bench boost is active
    if (submission.chip_used === 'bench_boost') {
        for (const playerId of submission.bench || []) {
            const playerPoints = livePointsData[playerId]?.points || 0;
            let finalPoints = playerPoints;
            const playerData = playerDetails[playerId] || {};
            
            // Apply club multiplier to bench players too - use loose equality for type coercion
            if (submission.club_multiplier_id && playerData.team_id && playerData.team_id == submission.club_multiplier_id) {
                finalPoints = finalPoints * 1.5;
            }
            
            // Keep 3 decimal places for precision
            finalPoints = Math.round(finalPoints * 1000) / 1000;
            benchPoints.push({ playerId, points: finalPoints });
            totalPoints += finalPoints;
        }
    }
    
    // Apply chip effects
    if (submission.chip_used === 'double_up') {
        totalPoints = totalPoints * 2;
    } else if (submission.chip_used === 'negative_chip') {
        totalPoints = Math.floor(totalPoints / 2);
    }
    
    // Round final total to 3 decimal places
    totalPoints = Math.round(totalPoints * 1000) / 1000;
    
    return {
        total: totalPoints,
        starting11: starting11Points,
        bench: benchPoints
    };
}

// Get leaderboard for a specific gameweek or overall
router.get('/:gameweek', authenticateToken, async (req, res) => {
    try {
        const { gameweek } = req.params;
        
        // Get all teams
        const teamsSnapshot = await collections.teams.get();
        const teams = [];
        teamsSnapshot.forEach(doc => {
            const team = doc.data();
            teams.push({
                id: team.id,
                name: team.name,
                username: team.username
            });
        });

        if (gameweek === 'overall') {
            // Calculate overall points with fresh live data for current gameweek
            const leaderboard = [];
            
            // Get current gameweek
            const currentGwDoc = await collections.gameweekInfo.where('is_current', '==', true).limit(1).get();
            let currentGameweek = 1;
            if (!currentGwDoc.empty) {
                currentGameweek = currentGwDoc.docs[0].data().gameweek;
            }
            
            // Fetch live points for current gameweek
            let livePointsData = {};
            try {
                const cacheKey = `live_points_gw${currentGameweek}`;
                const cached = global.livePointsCache && global.livePointsCache[cacheKey];
                
                if (cached && (Date.now() - cached.timestamp < 60000)) {
                    livePointsData = cached.data.points || {};
                } else {
                    const response = await axios.get(`https://fantasy.premierleague.com/api/event/${currentGameweek}/live/`);
                    if (response.data && response.data.elements) {
                        // FPL API returns elements as an array, not an object
                        response.data.elements.forEach(playerData => {
                            if (playerData && playerData.stats) {
                                // Use player ID as key
                                livePointsData[playerData.id] = {
                                    points: playerData.stats.total_points || 0,
                                    minutes: playerData.stats.minutes || 0
                                };
                            }
                        });
                        
                        // Cache it
                        if (!global.livePointsCache) {
                            global.livePointsCache = {};
                        }
                        global.livePointsCache[cacheKey] = {
                            data: { points: livePointsData },
                            timestamp: Date.now()
                        };
                    }
                }
            } catch (error) {
                console.log('Could not fetch live points for current gameweek:', error.message);
            }
            
            for (const team of teams) {
                // Get historical points (all gameweeks except current)
                // Note: We need to get all points and filter in memory to avoid index requirement
                const pointsSnapshot = await collections.gameweekPoints
                    .where('team_id', '==', team.id)
                    .get();
                
                let totalPoints = 0;
                let gameweeksPlayed = 0;
                
                pointsSnapshot.forEach(doc => {
                    const points = doc.data();
                    // Only include gameweeks before the current one (historical points)
                    if (points.gameweek < currentGameweek) {
                        totalPoints += points.total_points || 0;
                        gameweeksPlayed++;
                    }
                });
                
                // Calculate live points for current gameweek
                let latestGameweekPoints = 0;
                let latestChipUsed = null;
                
                const submissionDoc = await collections.gameweekTeams
                    .doc(`${team.id}_gw${currentGameweek}`)
                    .get();
                
                if (submissionDoc.exists && Object.keys(livePointsData).length > 0) {
                    const submission = submissionDoc.data();
                    latestChipUsed = submission.chip_used || null;
                    
                    // Calculate points with live data
                    const calculatedPoints = await calculateSubmissionPoints(submission, livePointsData);
                    latestGameweekPoints = calculatedPoints.total;
                    
                    // Add to total
                    totalPoints += latestGameweekPoints;
                    gameweeksPlayed++;
                }
                
                leaderboard.push({
                    team_id: team.id,
                    team_name: team.name,
                    username: team.username,
                    total_points: totalPoints,
                    gameweeks_played: gameweeksPlayed,
                    latest_gameweek_points: latestGameweekPoints,
                    gameweek_points: 0, // For overall view
                    average_points: gameweeksPlayed > 0 ? Math.round(totalPoints / gameweeksPlayed) : 0,
                    chip_used: latestChipUsed,
                    hit_points: 0
                });
            }
            
            // Sort by total points
            leaderboard.sort((a, b) => b.total_points - a.total_points);
            
            // Add rank
            leaderboard.forEach((team, index) => {
                team.rank = index + 1;
                team.movement = 0; // No movement for overall
            });
            
            res.json(leaderboard);
        } else {
            // Get specific gameweek points with fresh live data
            const gwNumber = parseInt(gameweek);
            const leaderboard = [];
            
            // Check if this is the current gameweek
            const currentGwDoc = await collections.gameweekInfo.where('is_current', '==', true).limit(1).get();
            let currentGameweek = 1;
            let isCurrentGw = false;
            if (!currentGwDoc.empty) {
                currentGameweek = currentGwDoc.docs[0].data().gameweek;
                isCurrentGw = (gwNumber === currentGameweek);
            }
            
            // Fetch live points if this is the current gameweek
            let livePointsData = {};
            if (isCurrentGw) {
                try {
                    const cacheKey = `live_points_gw${gwNumber}`;
                    const cached = global.livePointsCache && global.livePointsCache[cacheKey];
                    
                    if (cached && (Date.now() - cached.timestamp < 60000)) {
                        livePointsData = cached.data.points || {};
                    } else {
                        const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gwNumber}/live/`);
                        if (response.data && response.data.elements) {
                            // FPL API returns elements as an array, not an object
                            response.data.elements.forEach(playerData => {
                                if (playerData && playerData.stats) {
                                    // Use player ID as key
                                    livePointsData[playerData.id] = {
                                        points: playerData.stats.total_points || 0,
                                        minutes: playerData.stats.minutes || 0
                                    };
                                }
                            });
                            
                            // Cache it
                            if (!global.livePointsCache) {
                                global.livePointsCache = {};
                            }
                            global.livePointsCache[cacheKey] = {
                                data: { points: livePointsData },
                                timestamp: Date.now()
                            };
                        }
                    }
                } catch (error) {
                    console.log('Could not fetch live points for gameweek:', error.message);
                }
            }
            
            for (const team of teams) {
                let gwPoints = 0;
                let chipUsed = null;
                
                if (isCurrentGw && Object.keys(livePointsData).length > 0) {
                    // Calculate live points for current gameweek
                    const submissionDoc = await collections.gameweekTeams
                        .doc(`${team.id}_gw${gwNumber}`)
                        .get();
                    
                    if (submissionDoc.exists) {
                        const submission = submissionDoc.data();
                        chipUsed = submission.chip_used || null;
                        
                        // Calculate points with live data
                        const calculatedPoints = await calculateSubmissionPoints(submission, livePointsData);
                        gwPoints = calculatedPoints.total;
                    }
                } else {
                    // For past gameweeks, use stored points
                    const pointsDoc = await collections.gameweekPoints
                        .doc(`${team.id}_gw${gwNumber}`)
                        .get();
                    
                    if (pointsDoc.exists) {
                        const data = pointsDoc.data();
                        gwPoints = data.total_points || 0;
                        chipUsed = data.chip_used || null;
                    }
                }
                
                // Get previous gameweek rank for movement
                let previousRank = null;
                if (gwNumber > 1) {
                    const prevPointsDoc = await collections.gameweekPoints
                        .doc(`${team.id}_gw${gwNumber - 1}`)
                        .get();
                    
                    if (prevPointsDoc.exists) {
                        previousRank = prevPointsDoc.data().rank || null;
                    }
                }
                
                leaderboard.push({
                    team_id: team.id,
                    team_name: team.name,
                    username: team.username,
                    total_points: 0, // Will calculate below
                    gameweek_points: gwPoints,
                    chip_used: chipUsed,
                    previous_rank: previousRank
                });
            }
            
            // Sort by gameweek points
            leaderboard.sort((a, b) => b.gameweek_points - a.gameweek_points);
            
            // Add rank and movement
            leaderboard.forEach((team, index) => {
                team.rank = index + 1;
                team.movement = team.previous_rank ? team.previous_rank - team.rank : 0;
            });
            
            res.json(leaderboard);
        }
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// Get team rank history
router.get('/history/:teamId', authenticateToken, async (req, res) => {
    try {
        const { teamId } = req.params;
        
        const pointsSnapshot = await collections.gameweekPoints
            .where('team_id', '==', parseInt(teamId))
            .orderBy('gameweek', 'asc')
            .get();
        
        const history = [];
        pointsSnapshot.forEach(doc => {
            const data = doc.data();
            history.push({
                gameweek: data.gameweek,
                points: data.total_points,
                rank: data.rank,
                chip_used: data.chip_used
            });
        });
        
        res.json({
            team_id: teamId,
            history: history
        });
    } catch (error) {
        console.error('Error getting rank history:', error);
        res.status(500).json({ error: 'Failed to get rank history' });
    }
});

module.exports = router;