const express = require('express');
const router = express.Router();
const { collections } = require('../models/database');
const axios = require('axios');

// FPL API endpoints
const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

// Get detailed points breakdown for a team in a gameweek
router.get('/breakdown/:teamId/:gameweek', async (req, res) => {
    try {
        const { teamId, gameweek } = req.params;
        const gwNumber = parseInt(gameweek);
        
        // Get team submission
        const submissionId = `${teamId}_gw${gwNumber}`;
        const submissionDoc = await collections.teamSubmissions.doc(submissionId).get();
        
        if (!submissionDoc.exists) {
            return res.status(404).json({ error: 'No team submission found for this gameweek' });
        }
        
        const submission = submissionDoc.data();
        
        // Get FPL player data for this gameweek
        const fplResponse = await axios.get(`${FPL_API_BASE}/event/${gwNumber}/live/`);
        const elementStats = fplResponse.data.elements;
        
        // Calculate points for each player
        const playerPoints = [];
        
        // Process starting 11
        for (const playerId of submission.starting_11) {
            const playerDoc = await collections.fplPlayers.doc(playerId.toString()).get();
            if (!playerDoc.exists) continue;
            
            const player = playerDoc.data();
            const fplId = player.fpl_id || player.id;
            const stats = elementStats[fplId];
            
            if (!stats) continue;
            
            const basePoints = stats.stats.total_points || 0;
            let multiplier = 1;
            let bonusType = [];
            
            // Captain/Vice captain bonus
            if (playerId === submission.captain_id) {
                multiplier = 2;
                bonusType.push('Captain');
            } else if (playerId === submission.vice_captain_id && isCaptainNotPlaying(submission.captain_id, elementStats)) {
                multiplier = 2;
                bonusType.push('Vice Captain (Active)');
            }
            
            // Club multiplier
            if (submission.club_multiplier_id && player.team_id === submission.club_multiplier_id) {
                multiplier *= 1.5;
                bonusType.push('Club 1.5x');
            }
            
            // Chip bonuses
            if (submission.chip_used) {
                const chipMultiplier = getChipMultiplier(submission.chip_used, player.position, true);
                if (chipMultiplier > 1) {
                    multiplier *= chipMultiplier;
                    bonusType.push(`Chip ${chipMultiplier}x`);
                }
            }
            
            playerPoints.push({
                player_id: playerId,
                player_name: player.web_name || player.name,
                position: getPositionName(player.position),
                team: player.team_name,
                is_starting: true,
                base_points: basePoints,
                multiplier: multiplier,
                final_points: Math.floor(basePoints * multiplier),
                bonuses: bonusType,
                stats: {
                    minutes: stats.stats.minutes || 0,
                    goals: stats.stats.goals_scored || 0,
                    assists: stats.stats.assists || 0,
                    clean_sheets: stats.stats.clean_sheets || 0,
                    saves: stats.stats.saves || 0,
                    bonus: stats.stats.bonus || 0,
                    yellow_cards: stats.stats.yellow_cards || 0,
                    red_cards: stats.stats.red_cards || 0
                }
            });
        }
        
        // Process bench (only counted with Bench Boost chip)
        if (submission.chip_used === 'bench_boost') {
            for (const playerId of submission.bench) {
                const playerDoc = await collections.fplPlayers.doc(playerId.toString()).get();
                if (!playerDoc.exists) continue;
                
                const player = playerDoc.data();
                const fplId = player.fpl_id || player.id;
                const stats = elementStats[fplId];
                
                if (!stats) continue;
                
                const basePoints = stats.stats.total_points || 0;
                let multiplier = 1;
                let bonusType = ['Bench Boost'];
                
                // Club multiplier applies to bench too
                if (submission.club_multiplier_id && player.team_id === submission.club_multiplier_id) {
                    multiplier *= 1.5;
                    bonusType.push('Club 1.5x');
                }
                
                playerPoints.push({
                    player_id: playerId,
                    player_name: player.web_name || player.name,
                    position: getPositionName(player.position),
                    team: player.team_name,
                    is_starting: false,
                    base_points: basePoints,
                    multiplier: multiplier,
                    final_points: Math.floor(basePoints * multiplier),
                    bonuses: bonusType,
                    stats: {
                        minutes: stats.stats.minutes || 0,
                        goals: stats.stats.goals_scored || 0,
                        assists: stats.stats.assists || 0,
                        clean_sheets: stats.stats.clean_sheets || 0,
                        saves: stats.stats.saves || 0,
                        bonus: stats.stats.bonus || 0,
                        yellow_cards: stats.stats.yellow_cards || 0,
                        red_cards: stats.stats.red_cards || 0
                    }
                });
            }
        }
        
        // Calculate totals
        const totalPoints = playerPoints.reduce((sum, p) => sum + p.final_points, 0);
        const baseTotal = playerPoints.reduce((sum, p) => sum + p.base_points, 0);
        
        // Apply global chip effects
        let finalTotal = totalPoints;
        if (submission.chip_used === 'double_up') {
            finalTotal *= 2;
        } else if (submission.chip_used === 'negative_chip') {
            finalTotal = Math.floor(finalTotal / 2);
        }
        
        // Save to database
        await collections.gameweekPoints.doc(`${teamId}_gw${gwNumber}`).set({
            team_id: parseInt(teamId),
            gameweek: gwNumber,
            base_points: baseTotal,
            total_points: finalTotal,
            chip_used: submission.chip_used,
            captain_id: submission.captain_id,
            vice_captain_id: submission.vice_captain_id,
            club_multiplier_id: submission.club_multiplier_id,
            calculated_at: new Date().toISOString()
        });
        
        res.json({
            team_id: teamId,
            gameweek: gwNumber,
            players: playerPoints,
            summary: {
                base_total: baseTotal,
                bonus_total: totalPoints - baseTotal,
                final_total: finalTotal,
                chip_used: submission.chip_used,
                club_multiplier: submission.club_multiplier_id
            }
        });
    } catch (error) {
        console.error('Error calculating points breakdown:', error);
        res.status(500).json({ error: 'Failed to calculate points breakdown' });
    }
});

// Helper functions
function getPositionName(positionId) {
    const positions = {
        1: 'GKP',
        2: 'DEF',
        3: 'MID',
        4: 'FWD'
    };
    return positions[positionId] || 'Unknown';
}

function isCaptainNotPlaying(captainId, elementStats) {
    // Check if captain played less than 1 minute
    if (!captainId || !elementStats[captainId]) return false;
    return (elementStats[captainId].stats.minutes || 0) < 1;
}

function getChipMultiplier(chipName, position, isStarting) {
    if (!isStarting && chipName !== 'bench_boost') return 1;
    
    switch (chipName) {
        case 'triple_captain':
            // Handled separately for captain only
            return 1;
        case 'attack_chip':
            // 2x for MID and FWD
            return (position === 3 || position === 4) ? 2 : 1;
        case 'park_the_bus':
            // 2x for GKP and DEF
            return (position === 1 || position === 2) ? 2 : 1;
        default:
            return 1;
    }
}

module.exports = router;