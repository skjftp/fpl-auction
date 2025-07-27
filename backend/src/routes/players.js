const express = require('express');
const axios = require('axios');
const { getDatabase } = require('../models/database');

const router = express.Router();

// Fetch and store FPL players from API
router.post('/sync-fpl-data', async (req, res) => {
  try {
    console.log('🔄 Syncing FPL data...');
    
    // Fetch data from FPL API
    const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
    const { elements: players, teams: clubs, element_types: positions } = response.data;
    
    const db = getDatabase();
    
    // Clear existing data
    db.run('DELETE FROM fpl_players');
    db.run('DELETE FROM fpl_clubs');
    
    // Insert clubs
    const clubStmt = db.prepare(`
      INSERT INTO fpl_clubs (id, name, short_name, code, strength) 
      VALUES (?, ?, ?, ?, ?)
    `);
    
    clubs.forEach(club => {
      clubStmt.run(
        club.id,
        club.name,
        club.short_name,
        club.code,
        club.strength
      );
    });
    clubStmt.finalize();
    
    // Insert players
    const playerStmt = db.prepare(`
      INSERT INTO fpl_players (
        id, web_name, first_name, second_name, position, 
        team_id, price, points_per_game, total_points, photo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    players.forEach(player => {
      playerStmt.run(
        player.id,
        player.web_name,
        player.first_name,
        player.second_name,
        player.element_type,
        player.team,
        player.now_cost,
        parseFloat(player.points_per_game || 0),
        player.total_points,
        player.photo
      );
    });
    playerStmt.finalize();
    
    console.log(`✅ Synced ${players.length} players and ${clubs.length} clubs`);
    
    res.json({
      success: true,
      message: `Synced ${players.length} players and ${clubs.length} clubs`,
      stats: {
        players: players.length,
        clubs: clubs.length,
        positions: positions.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error syncing FPL data:', error);
    res.status(500).json({ 
      error: 'Failed to sync FPL data',
      details: error.message 
    });
  }
});

// Get all players with filters
router.get('/', (req, res) => {
  const { position, team, status, search } = req.query;
  const db = getDatabase();
  
  let query = `
    SELECT p.*, c.name as team_name, c.short_name as team_short_name
    FROM fpl_players p
    LEFT JOIN fpl_clubs c ON p.team_id = c.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (position) {
    query += ' AND p.position = ?';
    params.push(position);
  }
  
  if (team) {
    query += ' AND p.team_id = ?';
    params.push(team);
  }
  
  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }
  
  if (search) {
    query += ' AND (p.web_name LIKE ? OR p.first_name LIKE ? OR p.second_name LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  query += ' ORDER BY p.total_points DESC';
  
  db.all(query, params, (err, players) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(players);
  });
});

// Get clubs
router.get('/clubs', (req, res) => {
  const db = getDatabase();
  
  db.all(
    'SELECT * FROM fpl_clubs ORDER BY strength DESC',
    [],
    (err, clubs) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(clubs);
    }
  );
});

// Get position types
router.get('/positions', (req, res) => {
  const positions = [
    { id: 1, name: 'Goalkeeper', short_name: 'GKP', max_count: 2 },
    { id: 2, name: 'Defender', short_name: 'DEF', max_count: 5 },
    { id: 3, name: 'Midfielder', short_name: 'MID', max_count: 5 },
    { id: 4, name: 'Forward', short_name: 'FWD', max_count: 3 }
  ];
  
  res.json(positions);
});

module.exports = router;