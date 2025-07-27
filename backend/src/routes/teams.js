const express = require('express');
const { collections } = require('../models/database');

const router = express.Router();

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({ message: 'Teams route is working', timestamp: new Date().toISOString() });
});

// Get all squad items (for tracking sold players/clubs)
router.get('/all-squads', async (req, res) => {
  try {
    const squadSnapshot = await collections.teamSquads.get();
    const squads = squadSnapshot.docs.map(doc => doc.data());
    res.json(squads);
  } catch (error) {
    console.error('Error fetching all squads:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get team squad
router.get('/:teamId/squad', async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    console.log('Getting squad for team:', teamId);
    
    // Get squad for this team
    const squadSnapshot = await collections.teamSquads
      .where('team_id', '==', teamId)
      .get();
    
    console.log('Squad snapshot size:', squadSnapshot.size);
    
    const players = [];
    const clubs = [];
    let totalSpent = 0;
    
    for (const doc of squadSnapshot.docs) {
      const squadItem = doc.data();
      const pricePaid = squadItem.price_paid || 0;
      totalSpent += pricePaid;
      
      if (squadItem.player_id) {
        try {
          // Get player details
          const playerDoc = await collections.fplPlayers.doc(squadItem.player_id.toString()).get();
          if (playerDoc.exists) {
            const player = playerDoc.data();
            players.push({
              ...player,
              price_paid: pricePaid,
              acquired_at: squadItem.acquired_at
            });
          }
        } catch (err) {
          console.error('Error fetching player details:', err);
        }
      } else if (squadItem.club_id) {
        // Handle club purchases if any
        clubs.push({
          ...squadItem,
          price_paid: pricePaid
        });
      }
    }
    
    // Count by position (with safety checks)
    const counts = {
      players: players.length,
      clubs: clubs.length,
      gkp: players.filter(p => p.position === 1).length,
      def: players.filter(p => p.position === 2).length,
      mid: players.filter(p => p.position === 3).length,
      fwd: players.filter(p => p.position === 4).length
    };
    
    // Group by position (with safety checks)
    const positions = {
      1: players.filter(p => p.position === 1),
      2: players.filter(p => p.position === 2),
      3: players.filter(p => p.position === 3),
      4: players.filter(p => p.position === 4)
    };
    
    console.log('Squad response:', { 
      playerCount: players.length, 
      clubCount: clubs.length, 
      totalSpent 
    });
    
    res.json({
      players,
      clubs,
      totalSpent,
      counts,
      positions
    });
  } catch (error) {
    console.error('Error fetching squad for team', req.params.teamId, ':', error.message);
    console.error('Full error:', error);
    res.status(500).json({ error: 'Failed to fetch squad', details: error.message });
  }
});

// Get all teams leaderboard
router.get('/', async (req, res) => {
  try {
    const teamsSnapshot = await collections.teams.get();
    const teams = [];
    
    for (const doc of teamsSnapshot.docs) {
      const team = doc.data();
      
      // Get squad count
      const squadSnapshot = await collections.teamSquads
        .where('team_id', '==', team.id)
        .get();
      
      teams.push({
        ...team,
        squad_count: squadSnapshot.size,
        total_points: 0 // TODO: Calculate from gameweeks
      });
    }
    
    // Sort by points
    teams.sort((a, b) => b.total_points - a.total_points);
    
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

module.exports = router;