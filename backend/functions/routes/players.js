const express = require('express');
const axios = require('axios');
const { getDatabase } = require('../models/database');

const router = express.Router();

// Sync FPL data
router.post('/sync-fpl-data', async (req, res) => {
  try {
    console.log('🔄 Syncing FPL data...');
    
    // Fetch data from FPL API
    const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
    const { elements: players, teams: clubs } = response.data;
    
    const db = getDatabase();
    const batch = db.batch();
    
    // Update clubs
    clubs.forEach(club => {
      const clubRef = db.collection('clubs').doc(club.id.toString());
      batch.set(clubRef, {
        id: club.id,
        name: club.name,
        short_name: club.short_name,
        code: club.code,
        strength: club.strength
      }, { merge: true });
    });
    
    // Update players
    players.forEach(player => {
      const playerRef = db.collection('players').doc(player.id.toString());
      batch.set(playerRef, {
        id: player.id,
        web_name: player.web_name,
        first_name: player.first_name,
        second_name: player.second_name,
        position: player.element_type,
        team_id: player.team,
        price: player.now_cost,
        points_per_game: player.points_per_game,
        total_points: player.total_points,
        photo: player.photo
      }, { merge: true });
    });
    
    await batch.commit();
    
    res.json({ 
      success: true, 
      message: `Synced ${players.length} players and ${clubs.length} clubs` 
    });
  } catch (error) {
    console.error('❌ Error syncing FPL data:', error);
    res.status(500).json({ error: 'Failed to sync FPL data' });
  }
});

// Get all players
router.get('/', async (req, res) => {
  const { position, team, search } = req.query;
  const db = getDatabase();
  
  try {
    let query = db.collection('players');
    
    if (position) {
      query = query.where('position', '==', parseInt(position));
    }
    
    if (team) {
      query = query.where('team_id', '==', parseInt(team));
    }
    
    const snapshot = await query.get();
    const players = [];
    
    for (const doc of snapshot.docs) {
      const player = { id: doc.id, ...doc.data() };
      
      // Get team name
      const teamDoc = await db.collection('clubs').doc(player.team_id.toString()).get();
      if (teamDoc.exists) {
        player.team_name = teamDoc.data().name;
      }
      
      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        if (!player.web_name.toLowerCase().includes(searchLower) &&
            !player.first_name.toLowerCase().includes(searchLower) &&
            !player.second_name.toLowerCase().includes(searchLower)) {
          continue;
        }
      }
      
      players.push(player);
    }
    
    res.json(players);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Get clubs
router.get('/clubs', async (req, res) => {
  const db = getDatabase();
  
  try {
    const snapshot = await db.collection('clubs').get();
    const clubs = [];
    
    snapshot.forEach(doc => {
      clubs.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(clubs);
  } catch (error) {
    console.error('Error fetching clubs:', error);
    res.status(500).json({ error: 'Failed to fetch clubs' });
  }
});

module.exports = router;