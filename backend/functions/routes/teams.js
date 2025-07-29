const express = require('express');
const { getDatabase } = require('../models/database');

const router = express.Router();

// Get team info
router.get('/:teamId', async (req, res) => {
  const teamId = req.params.teamId;
  const db = getDatabase();
  
  try {
    const teamQuery = await db.collection('teams')
      .where('id', '==', parseInt(teamId))
      .limit(1)
      .get();
    
    if (teamQuery.empty) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const team = teamQuery.docs[0].data();
    res.json(team);
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Get team squad
router.get('/:teamId/squad', async (req, res) => {
  const teamId = parseInt(req.params.teamId);
  const db = getDatabase();
  
  try {
    const squadSnapshot = await db.collection('team_squads')
      .where('team_id', '==', teamId)
      .get();
    
    const players = [];
    let totalSpent = 0;
    
    for (const doc of squadSnapshot.docs) {
      const squad = doc.data();
      totalSpent += squad.price_paid;
      
      // Get player details
      const playerDoc = await db.collection('players').doc(squad.player_id.toString()).get();
      if (playerDoc.exists) {
        players.push({
          ...playerDoc.data(),
          price_paid: squad.price_paid
        });
      }
    }
    
    res.json({
      players,
      totalSpent,
      counts: {
        players: players.length,
        clubs: 0,
        gkp: players.filter(p => p.position === 1).length,
        def: players.filter(p => p.position === 2).length,
        mid: players.filter(p => p.position === 3).length,
        fwd: players.filter(p => p.position === 4).length
      },
      positions: {
        1: players.filter(p => p.position === 1),
        2: players.filter(p => p.position === 2),
        3: players.filter(p => p.position === 3),
        4: players.filter(p => p.position === 4)
      },
      clubs: []
    });
  } catch (error) {
    console.error('Error fetching squad:', error);
    res.status(500).json({ error: 'Failed to fetch squad' });
  }
});

// Get all teams leaderboard
router.get('/', async (req, res) => {
  const db = getDatabase();
  
  try {
    const teamsSnapshot = await db.collection('teams').get();
    const teams = [];
    
    teamsSnapshot.forEach(doc => {
      teams.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

module.exports = router;