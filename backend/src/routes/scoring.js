const express = require('express');
const axios = require('axios');
const { collections } = require('../models/database');
const admin = require('firebase-admin');

const router = express.Router();

// Update scores for a specific gameweek
router.post('/update-gameweek/:gameweek', async (req, res) => {
  try {
    const gameweek = parseInt(req.params.gameweek);
    
    // Fetch gameweek data from FPL API
    const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
    const liveData = response.data;
    
    // Get all team squads
    const squadsSnapshot = await collections.teamSquads
      .where('player_id', '!=', null)
      .get();
    
    const batch = admin.firestore().batch();
    let updateCount = 0;
    
    squadsSnapshot.docs.forEach(doc => {
      const squad = doc.data();
      const playerData = liveData.elements[squad.player_id];
      
      if (playerData && playerData.stats) {
        const points = playerData.stats.total_points || 0;
        
        // Create or update gameweek score document
        const scoreRef = collections.gameweekScores.doc(`${squad.team_id}_${gameweek}_${squad.player_id}`);
        batch.set(scoreRef, {
          team_id: squad.team_id,
          gameweek: gameweek,
          player_id: squad.player_id,
          points: points,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        updateCount++;
      }
    });
    
    // Commit the batch
    await batch.commit();
    
    res.json({ 
      success: true, 
      message: `Updated scores for gameweek ${gameweek}`,
      updated: updateCount
    });
    
  } catch (error) {
    console.error('Error updating gameweek scores:', error);
    res.status(500).json({ error: 'Failed to update gameweek scores' });
  }
});

// Get team scores for a gameweek
router.get('/team/:teamId/gameweek/:gameweek', async (req, res) => {
  const teamId = parseInt(req.params.teamId);
  const gameweek = parseInt(req.params.gameweek);
  
  try {
    // Get scores for this team and gameweek
    const scoresSnapshot = await collections.gameweekScores
      .where('team_id', '==', teamId)
      .where('gameweek', '==', gameweek)
      .get();
    
    const scores = [];
    let totalPoints = 0;
    
    // Get player details for each score
    for (const doc of scoresSnapshot.docs) {
      const score = doc.data();
      totalPoints += score.points;
      
      // Get player details
      const playerDoc = await collections.fplPlayers.doc(score.player_id.toString()).get();
      if (playerDoc.exists) {
        const player = playerDoc.data();
        scores.push({
          ...score,
          web_name: player.web_name,
          position: player.position,
          photo: player.photo
        });
      }
    }
    
    // Sort by points descending
    scores.sort((a, b) => b.points - a.points);
    
    res.json({
      gameweek,
      teamId,
      scores,
      totalPoints,
      playerCount: scores.length
    });
    
  } catch (error) {
    console.error('Error fetching team gameweek scores:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get overall leaderboard
router.get('/leaderboard', async (req, res) => {
  const { gameweek } = req.query;
  
  try {
    // Get all teams
    const teamsSnapshot = await collections.teams.get();
    const leaderboard = [];
    
    for (const teamDoc of teamsSnapshot.docs) {
      const team = teamDoc.data();
      
      // Build query for scores
      let scoresQuery = collections.gameweekScores
        .where('team_id', '==', team.id);
      
      if (gameweek) {
        scoresQuery = scoresQuery.where('gameweek', '==', parseInt(gameweek));
      }
      
      const scoresSnapshot = await scoresQuery.get();
      
      // Calculate total points
      let totalPoints = 0;
      const gameweeksPlayed = new Set();
      
      scoresSnapshot.docs.forEach(doc => {
        const score = doc.data();
        totalPoints += score.points;
        gameweeksPlayed.add(score.gameweek);
      });
      
      leaderboard.push({
        id: team.id,
        name: team.name,
        username: team.username,
        total_points: totalPoints,
        gameweeks_played: gameweeksPlayed.size
      });
    }
    
    // Sort by total points descending
    leaderboard.sort((a, b) => b.total_points - a.total_points);
    
    res.json(leaderboard);
    
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get current gameweek info
router.get('/current-gameweek', async (req, res) => {
  try {
    const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
    const events = response.data.events;
    
    const currentGameweek = events.find(event => event.is_current);
    const nextGameweek = events.find(event => event.is_next);
    
    res.json({
      current: currentGameweek,
      next: nextGameweek,
      all: events.map(e => ({
        id: e.id,
        name: e.name,
        deadline_time: e.deadline_time,
        finished: e.finished,
        is_current: e.is_current,
        is_next: e.is_next
      }))
    });
    
  } catch (error) {
    console.error('Error fetching gameweek info:', error);
    res.status(500).json({ error: 'Failed to fetch gameweek info' });
  }
});

module.exports = router;