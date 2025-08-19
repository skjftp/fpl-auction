const express = require('express');
const router = express.Router();
const { collections } = require('../models/database');
const { getActiveDraftId } = require('../utils/draft');
const axios = require('axios');
const { applyAutomaticSubstitutions } = require('../utils/substitutions');

// Cache for current gameweek info (5 minutes)
let gameweekCache = null;
let gameweekCacheTime = 0;
const GAMEWEEK_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get current gameweek info
async function getCurrentGameweek() {
  const now = Date.now();
  if (gameweekCache && (now - gameweekCacheTime < GAMEWEEK_CACHE_DURATION)) {
    return gameweekCache;
  }

  try {
    const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
    const currentEvent = response.data.events.find(event => event.is_current);
    const nextEvent = response.data.events.find(event => event.is_next);
    
    gameweekCache = {
      current: currentEvent,
      next: nextEvent,
      activeGameweek: currentEvent || nextEvent
    };
    gameweekCacheTime = now;
    
    return gameweekCache;
  } catch (error) {
    console.error('Error fetching gameweek info:', error);
    return null;
  }
}

// Get team submission for a specific gameweek
router.get('/team/:teamId/gameweek/:gameweek', async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const gameweek = parseInt(req.params.gameweek);
    
    // Get current gameweek info to check deadline
    const gwInfo = await getCurrentGameweek();
    const currentGw = gwInfo?.activeGameweek;
    
    if (!currentGw) {
      return res.status(500).json({ error: 'Could not fetch gameweek info' });
    }
    
    // Check if deadline has passed for this gameweek
    const requestedGwInfo = gwInfo.current?.id === gameweek ? gwInfo.current : 
                            gwInfo.next?.id === gameweek ? gwInfo.next : null;
    
    if (requestedGwInfo) {
      const deadline = new Date(requestedGwInfo.deadline_time);
      const now = new Date();
      
      if (now < deadline) {
        return res.status(403).json({ 
          error: 'Teams will be visible after deadline',
          deadline: deadline.toISOString()
        });
      }
    }
    
    // Fetch the submission
    const submissionSnapshot = await collections.teamSubmissions
      .where('team_id', '==', teamId)
      .where('gameweek', '==', gameweek)
      .limit(1)
      .get();
    
    if (submissionSnapshot.empty) {
      return res.status(404).json({ error: 'No submission found for this gameweek' });
    }
    
    const submission = submissionSnapshot.docs[0].data();
    
    // Get team details
    const teamSnapshot = await collections.teams
      .where('id', '==', teamId)
      .limit(1)
      .get();
    
    const team = teamSnapshot.empty ? null : teamSnapshot.docs[0].data();
    
    res.json({
      submission,
      team: team ? { id: team.id, name: team.name } : null,
      gameweek
    });
    
  } catch (error) {
    console.error('Error fetching team submission:', error);
    res.status(500).json({ error: 'Failed to fetch team submission' });
  }
});

// Get live points for a gameweek
router.get('/gameweek/:gameweek/live', async (req, res) => {
  try {
    const gameweek = parseInt(req.params.gameweek);
    
    // Fetch live points from FPL API (never cached)
    const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
    
    res.json({
      gameweek,
      elements: response.data.elements // This contains live points for all players
    });
    
  } catch (error) {
    console.error('Error fetching live points:', error);
    res.status(500).json({ error: 'Failed to fetch live points' });
  }
});

// Get all team submissions with calculated points for a gameweek
router.get('/gameweek/:gameweek/standings', async (req, res) => {
  try {
    const gameweek = parseInt(req.params.gameweek);
    
    // Check deadline
    const gwInfo = await getCurrentGameweek();
    const requestedGwInfo = gwInfo?.current?.id === gameweek ? gwInfo.current : 
                            gwInfo?.next?.id === gameweek ? gwInfo.next : null;
    
    if (requestedGwInfo) {
      const deadline = new Date(requestedGwInfo.deadline_time);
      const now = new Date();
      
      if (now < deadline) {
        return res.status(403).json({ 
          error: 'Standings will be available after deadline',
          deadline: deadline.toISOString()
        });
      }
    }
    
    // Fetch all submissions for this gameweek
    const submissionsSnapshot = await collections.teamSubmissions
      .where('gameweek', '==', gameweek)
      .get();
    
    // Fetch all teams
    const teamsSnapshot = await collections.teams.get();
    const teamsMap = new Map();
    teamsSnapshot.docs.forEach(doc => {
      const team = doc.data();
      teamsMap.set(team.id, team);
    });
    
    // Fetch live points
    let livePoints = {};
    try {
      const liveResponse = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
      livePoints = liveResponse.data.elements;
    } catch (error) {
      console.error('Could not fetch live points:', error);
    }
    
    // Calculate points for each team
    const standings = [];
    
    for (const doc of submissionsSnapshot.docs) {
      const submission = doc.data();
      const team = teamsMap.get(submission.team_id);
      
      if (!team) continue;
      
      // Calculate total points
      let totalPoints = 0;
      let playerPoints = {};
      let substitutions = [];
      
      // First, get all player data for this submission
      const allPlayerIds = [...(submission.starting_11 || []), ...(submission.bench || [])];
      const playerDataMap = {};
      
      for (const playerId of allPlayerIds) {
        const playerDoc = await collections.fplPlayers.doc(playerId.toString()).get();
        if (playerDoc.exists) {
          playerDataMap[playerId] = playerDoc.data();
        }
      }
      
      // Apply automatic substitutions
      const subsResult = applyAutomaticSubstitutions(
        submission.starting_11 || [],
        submission.bench || [],
        livePoints,
        playerDataMap,
        submission.chip_used === 'bench_boost'
      );
      
      const finalStarting11 = subsResult.finalStarting11;
      const finalBench = subsResult.finalBench;
      substitutions = subsResult.substitutions;
      
      // Check for captain/vice-captain substitution
      let effectiveCaptainId = submission.captain_id;
      const captainLive = livePoints[submission.captain_id];
      if (captainLive && captainLive.stats.minutes === 0 && submission.vice_captain_id) {
        effectiveCaptainId = submission.vice_captain_id;
      }
      
      // Calculate points for final starting 11 (after substitutions)
      if (finalStarting11.length > 0) {
        for (const playerId of finalStarting11) {
          const playerLive = livePoints[playerId];
          if (playerLive) {
            let points = playerLive.stats.total_points || 0;
            
            // Apply captain multiplier (using effective captain)
            if (playerId === effectiveCaptainId) {
              points *= submission.chip_used === 'triple_captain' ? 3 : 2;
            }
            // Apply vice-captain multiplier (1.25x during active gameweek if still VC)
            else if (playerId === submission.vice_captain_id && effectiveCaptainId === submission.captain_id) {
              points *= 1.25;
            }
            
            // Apply chip effects
            const player = playerDataMap[playerId];
            if (player) {
              if (submission.chip_used === 'attack_chip' && (player.position === 3 || player.position === 4)) {
                points *= 2;
              } else if (submission.chip_used === 'park_the_bus' && (player.position === 1 || player.position === 2)) {
                points *= 2;
              }
            }
            
            // Apply club multiplier
            if (submission.club_multiplier_id && player && player.team === submission.club_multiplier_id) {
              points *= 1.5;
            }
            
            playerPoints[playerId] = points;
            totalPoints += points;
          }
        }
      }
      
      // Add bench points if bench boost is active
      if (submission.chip_used === 'bench_boost' && finalBench.length > 0) {
        for (const playerId of finalBench) {
          const playerLive = livePoints[playerId];
          if (playerLive) {
            let points = playerLive.stats.total_points || 0;
            
            // Apply club multiplier for bench players too
            const player = playerDataMap[playerId];
            if (submission.club_multiplier_id && player && player.team === submission.club_multiplier_id) {
              points *= 1.5;
            }
            
            playerPoints[playerId] = points;
            totalPoints += points;
          }
        }
      }
      
      // Apply global chip multipliers
      if (submission.chip_used === 'double_up') {
        totalPoints *= 2;
      } else if (submission.chip_used === 'negative_chip') {
        totalPoints /= 2;
      }
      
      standings.push({
        team_id: team.id,
        team_name: team.name,
        gameweek_points: totalPoints,
        player_points: playerPoints,
        chip_used: submission.chip_used,
        captain_id: submission.captain_id,
        vice_captain_id: submission.vice_captain_id,
        effective_captain_id: effectiveCaptainId,
        substitutions: substitutions.length,
        auto_subs_applied: substitutions.length > 0
      });
    }
    
    // Sort by points
    standings.sort((a, b) => b.gameweek_points - a.gameweek_points);
    
    // Add rank
    standings.forEach((team, index) => {
      team.rank = index + 1;
    });
    
    res.json({
      gameweek,
      standings,
      has_live_points: Object.keys(livePoints).length > 0
    });
    
  } catch (error) {
    console.error('Error calculating standings:', error);
    res.status(500).json({ error: 'Failed to calculate standings' });
  }
});

module.exports = router;