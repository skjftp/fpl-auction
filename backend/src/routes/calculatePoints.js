const express = require('express');
const router = express.Router();
const { collections } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios');

// FPL API endpoints
const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

// Calculate points for all teams for a specific gameweek
router.post('/calculate/:gameweek', authenticateToken, async (req, res) => {
    try {
        const gameweek = parseInt(req.params.gameweek);
        
        // Get FPL gameweek data
        console.log(`Fetching FPL data for gameweek ${gameweek}...`);
        const fplResponse = await axios.get(`${FPL_API_BASE}/event/${gameweek}/live/`);
        const elementStats = fplResponse.data.elements;
        
        // Get gameweek deadline
        const gwDoc = await collections.gameweekInfo.doc(`gw_${gameweek}`).get();
        let deadline = null;
        if (gwDoc.exists) {
            deadline = new Date(gwDoc.data().deadline);
            console.log(`Gameweek ${gameweek} deadline: ${deadline}`);
        }
        
        // Get all team submissions for this gameweek
        const submissionsSnapshot = await collections.gameweekTeams
            .where('gameweek', '==', gameweek)
            .get();
        
        let processedTeams = 0;
        let skippedTeams = 0;
        const results = [];
        
        for (const doc of submissionsSnapshot.docs) {
            const submission = doc.data();
            const teamId = submission.team_id;
            
            // Check if submission was before deadline
            if (deadline && submission.submitted_at) {
                const submittedTime = submission.submitted_at.toDate();
                if (submittedTime > deadline) {
                    console.log(`Skipping team ${teamId} - submitted after deadline (${submittedTime} > ${deadline})`);
                    skippedTeams++;
                    continue;
                }
            }
            
            console.log(`Processing team ${teamId} for gameweek ${gameweek}...`);
            
            try {
                // Calculate points for this team
                const teamPoints = await calculateTeamPoints(submission, elementStats);
                
                // Save to gameweekPoints collection
                await collections.gameweekPoints.doc(`${teamId}_gw${gameweek}`).set({
                    team_id: teamId,
                    gameweek: gameweek,
                    base_points: teamPoints.base_total,
                    total_points: teamPoints.final_total,
                    chip_used: submission.chip_used,
                    captain_id: submission.captain_id,
                    vice_captain_id: submission.vice_captain_id,
                    club_multiplier_id: submission.club_multiplier_id,
                    calculated_at: new Date().toISOString(),
                    auto_subs_made: teamPoints.auto_subs_made || []
                });
                
                results.push({
                    team_id: teamId,
                    points: teamPoints.final_total,
                    auto_subs: teamPoints.auto_subs_made?.length || 0
                });
                
                processedTeams++;
            } catch (error) {
                console.error(`Error processing team ${teamId}:`, error);
                results.push({
                    team_id: teamId,
                    error: error.message
                });
            }
        }
        
        // Update leaderboard ranks
        await updateLeaderboardRanks(gameweek);
        
        res.json({
            success: true,
            gameweek: gameweek,
            processed_teams: processedTeams,
            skipped_teams: skippedTeams,
            results: results
        });
        
    } catch (error) {
        console.error('Error calculating points:', error);
        res.status(500).json({ 
            error: 'Failed to calculate points',
            details: error.message 
        });
    }
});

// Calculate points for a single team
async function calculateTeamPoints(submission, elementStats) {
    const playerPoints = [];
    let baseTotal = 0;
    let autoSubsMade = [];
    
    // Get all players data
    const allPlayerIds = [...submission.starting_11, ...submission.bench];
    const playersData = {};
    
    for (const playerId of allPlayerIds) {
        const playerDoc = await collections.fplPlayers.doc(playerId.toString()).get();
        if (playerDoc.exists) {
            playersData[playerId] = playerDoc.data();
        }
    }
    
    // Check which starting players didn't play (for auto-substitution)
    const nonPlayingStarters = [];
    const activeStarters = [];
    
    for (const playerId of submission.starting_11) {
        const player = playersData[playerId];
        if (!player) continue;
        
        const fplId = player.fpl_id || player.id;
        const stats = elementStats[fplId];
        const minutes = stats?.stats?.minutes || 0;
        
        if (minutes === 0) {
            nonPlayingStarters.push({ playerId, player });
        } else {
            activeStarters.push({ playerId, player, stats, minutes });
        }
    }
    
    // Auto-substitution logic
    let finalStarting11 = [...submission.starting_11];
    let finalBench = [...submission.bench];
    
    if (nonPlayingStarters.length > 0) {
        // Try to substitute non-playing players
        for (const nonPlayer of nonPlayingStarters) {
            const substitute = findValidSubstitute(
                nonPlayer, 
                submission.bench, 
                playersData, 
                elementStats, 
                finalStarting11, 
                finalBench
            );
            
            if (substitute) {
                // Make substitution
                const starterIndex = finalStarting11.indexOf(nonPlayer.playerId);
                const benchIndex = finalBench.indexOf(substitute.playerId);
                
                finalStarting11[starterIndex] = substitute.playerId;
                finalBench[benchIndex] = nonPlayer.playerId;
                
                autoSubsMade.push({
                    out: nonPlayer.playerId,
                    in: substitute.playerId,
                    reason: 'did_not_play'
                });
            }
        }
    }
    
    // Calculate points for final starting 11
    for (const playerId of finalStarting11) {
        const player = playersData[playerId];
        if (!player) continue;
        
        const fplId = player.fpl_id || player.id;
        const stats = elementStats[fplId];
        if (!stats) continue;
        
        const basePoints = stats.stats.total_points || 0;
        let multiplier = 1;
        let bonusTypes = [];
        
        // Captain/Vice captain bonus
        if (playerId === submission.captain_id) {
            // Check for Triple Captain chip
            if (submission.chip_used === 'triple_captain') {
                multiplier = 3;
                bonusTypes.push('Triple Captain');
            } else {
                multiplier = 2;
                bonusTypes.push('Captain');
            }
        } else if (playerId === submission.vice_captain_id) {
            // Check if captain didn't play
            const captainPlayer = playersData[submission.captain_id];
            if (captainPlayer) {
                const captainFplId = captainPlayer.fpl_id || captainPlayer.id;
                const captainStats = elementStats[captainFplId];
                if (!captainStats || (captainStats.stats.minutes || 0) === 0) {
                    multiplier = 2;
                    bonusTypes.push('Vice Captain (Active)');
                }
            }
        }
        
        // Club multiplier
        if (submission.club_multiplier_id && player.team_id === submission.club_multiplier_id) {
            multiplier *= 1.5;
            bonusTypes.push('Club 1.5x');
        }
        
        // Position-specific chip bonuses
        const chipMultiplier = getChipMultiplier(submission.chip_used, player.position);
        if (chipMultiplier > 1) {
            multiplier *= chipMultiplier;
            bonusTypes.push(`Chip ${chipMultiplier}x`);
        }
        
        const finalPoints = Math.floor(basePoints * multiplier);
        baseTotal += basePoints;
        
        playerPoints.push({
            player_id: playerId,
            player_name: player.web_name || player.name,
            position: getPositionName(player.position),
            base_points: basePoints,
            multiplier: multiplier,
            final_points: finalPoints,
            bonuses: bonusTypes,
            is_starting: true
        });
    }
    
    // Add bench points only for Bench Boost chip
    if (submission.chip_used === 'bench_boost') {
        for (const playerId of finalBench) {
            const player = playersData[playerId];
            if (!player) continue;
            
            const fplId = player.fpl_id || player.id;
            const stats = elementStats[fplId];
            if (!stats) continue;
            
            const basePoints = stats.stats.total_points || 0;
            let multiplier = 1;
            let bonusTypes = ['Bench Boost'];
            
            // Club multiplier applies to bench too
            if (submission.club_multiplier_id && player.team_id === submission.club_multiplier_id) {
                multiplier *= 1.5;
                bonusTypes.push('Club 1.5x');
            }
            
            const finalPoints = Math.floor(basePoints * multiplier);
            baseTotal += basePoints;
            
            playerPoints.push({
                player_id: playerId,
                player_name: player.web_name || player.name,
                position: getPositionName(player.position),
                base_points: basePoints,
                multiplier: multiplier,
                final_points: finalPoints,
                bonuses: bonusTypes,
                is_starting: false
            });
        }
    }
    
    // Calculate final total with global chip effects
    let totalPoints = playerPoints.reduce((sum, p) => sum + p.final_points, 0);
    let finalTotal = totalPoints;
    
    if (submission.chip_used === 'double_up') {
        finalTotal *= 2;
    } else if (submission.chip_used === 'negative_chip') {
        finalTotal = Math.floor(finalTotal / 2);
    }
    
    return {
        base_total: baseTotal,
        total_points: totalPoints,
        final_total: finalTotal,
        players: playerPoints,
        auto_subs_made: autoSubsMade
    };
}

// Find valid substitute for a non-playing player
function findValidSubstitute(nonPlayer, bench, playersData, elementStats, currentStarting11, currentBench) {
    // Can't substitute goalkeeper with outfield player
    if (nonPlayer.player.position === 1) {
        // Look for playing goalkeeper on bench
        for (const benchPlayerId of currentBench) {
            const benchPlayer = playersData[benchPlayerId];
            if (benchPlayer?.position === 1) {
                const fplId = benchPlayer.fpl_id || benchPlayer.id;
                const stats = elementStats[fplId];
                if (stats && (stats.stats.minutes || 0) > 0) {
                    return { playerId: benchPlayerId, player: benchPlayer };
                }
            }
        }
        return null;
    }
    
    // For outfield players, find any playing substitute that maintains formation
    const currentPositions = getCurrentFormation(currentStarting11, playersData);
    
    for (const benchPlayerId of currentBench) {
        const benchPlayer = playersData[benchPlayerId];
        if (!benchPlayer || benchPlayer.position === 1) continue; // Skip goalkeepers
        
        const fplId = benchPlayer.fpl_id || benchPlayer.id;
        const stats = elementStats[fplId];
        if (!stats || (stats.stats.minutes || 0) === 0) continue;
        
        // Check if substitution maintains valid formation
        const newFormation = getFormationAfterSub(
            currentPositions, 
            nonPlayer.player.position, 
            benchPlayer.position
        );
        
        if (isValidFormation(newFormation)) {
            return { playerId: benchPlayerId, player: benchPlayer };
        }
    }
    
    return null;
}

// Get current formation count by position
function getCurrentFormation(starting11, playersData) {
    const formation = { 1: 0, 2: 0, 3: 0, 4: 0 }; // GK, DEF, MID, FWD
    
    for (const playerId of starting11) {
        const player = playersData[playerId];
        if (player) {
            formation[player.position]++;
        }
    }
    
    return formation;
}

// Calculate formation after substitution
function getFormationAfterSub(currentFormation, outPosition, inPosition) {
    const newFormation = { ...currentFormation };
    newFormation[outPosition]--;
    newFormation[inPosition]++;
    return newFormation;
}

// Check if formation is valid (1 GK, 3+ DEF, 2+ MID, 1+ FWD)
function isValidFormation(formation) {
    return formation[1] === 1 && // 1 Goalkeeper
           formation[2] >= 3 && // At least 3 Defenders
           formation[3] >= 2 && // At least 2 Midfielders
           formation[4] >= 1;   // At least 1 Forward
}

// Update leaderboard ranks after calculating points
async function updateLeaderboardRanks(gameweek) {
    // Get all points for this gameweek
    const pointsSnapshot = await collections.gameweekPoints
        .where('gameweek', '==', gameweek)
        .orderBy('total_points', 'desc')
        .get();
    
    const batch = collections.gameweekPoints.firestore.batch();
    
    pointsSnapshot.forEach((doc, index) => {
        batch.update(doc.ref, { 
            rank: index + 1,
            rank_updated_at: new Date().toISOString()
        });
    });
    
    await batch.commit();
}

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

function getChipMultiplier(chipName, position) {
    switch (chipName) {
        case 'attack_chip':
            return (position === 3 || position === 4) ? 2 : 1; // 2x for MID/FWD
        case 'park_the_bus':
            return (position === 1 || position === 2) ? 2 : 1; // 2x for GKP/DEF
        case 'brahmashtra':
            return 3; // 3x for all players
        default:
            return 1;
    }
}

// Trigger points calculation for current gameweek (convenience endpoint)
router.post('/calculate-current', authenticateToken, async (req, res) => {
    try {
        // Get current gameweek
        const gwDoc = await collections.gameweekInfo.doc('current').get();
        if (!gwDoc.exists) {
            return res.status(404).json({ error: 'Current gameweek not found' });
        }
        
        const currentGameweek = gwDoc.data().current_gameweek;
        
        // Redirect to specific gameweek calculation
        req.params.gameweek = currentGameweek.toString();
        return router.stack.find(layer => 
            layer.route?.path === '/calculate/:gameweek' && 
            layer.route?.methods?.post
        ).route.stack[0].handle(req, res);
        
    } catch (error) {
        console.error('Error calculating current gameweek points:', error);
        res.status(500).json({ error: 'Failed to calculate current gameweek points' });
    }
});

module.exports = router;