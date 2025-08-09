const express = require('express');
const router = express.Router();
const { collections } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

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
            // Calculate overall points
            const leaderboard = [];
            
            for (const team of teams) {
                // Get all gameweek points for this team
                const pointsSnapshot = await collections.gameweekPoints
                    .where('team_id', '==', team.id)
                    .get();
                
                let totalPoints = 0;
                let gameweeksPlayed = 0;
                
                pointsSnapshot.forEach(doc => {
                    const points = doc.data();
                    totalPoints += points.total_points || 0;
                    gameweeksPlayed++;
                });
                
                leaderboard.push({
                    team_id: team.id,
                    team_name: team.name,
                    username: team.username,
                    total_points: totalPoints,
                    gameweeks_played: gameweeksPlayed,
                    gameweek_points: 0, // For overall view
                    average_points: gameweeksPlayed > 0 ? Math.round(totalPoints / gameweeksPlayed) : 0,
                    chip_used: null,
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
            // Get specific gameweek points
            const gwNumber = parseInt(gameweek);
            const leaderboard = [];
            
            for (const team of teams) {
                // Get points for this gameweek
                const pointsDoc = await collections.gameweekPoints
                    .doc(`${team.id}_gw${gwNumber}`)
                    .get();
                
                let gwPoints = 0;
                let chipUsed = null;
                
                if (pointsDoc.exists) {
                    const data = pointsDoc.data();
                    gwPoints = data.total_points || 0;
                    chipUsed = data.chip_used || null;
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