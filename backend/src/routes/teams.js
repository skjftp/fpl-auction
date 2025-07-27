const express = require('express');
const { getDatabase } = require('../models/database');

const router = express.Router();

// Get team squad
router.get('/:teamId/squad', (req, res) => {
  const teamId = parseInt(req.params.teamId);
  const db = getDatabase();
  
  db.all(
    `SELECT s.*, 
            p.web_name, p.first_name, p.second_name, p.position, p.total_points, p.photo,
            c.name as club_name, c.short_name as club_short_name,
            fc.name as player_club_name
     FROM team_squads s
     LEFT JOIN fpl_players p ON s.player_id = p.id
     LEFT JOIN fpl_clubs c ON s.club_id = c.id
     LEFT JOIN fpl_clubs fc ON p.team_id = fc.id
     WHERE s.team_id = ?
     ORDER BY s.acquired_at DESC`,
    [teamId],
    (err, squad) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Separate players and clubs
      const players = squad.filter(item => item.player_id);
      const clubs = squad.filter(item => item.club_id);
      
      // Group players by position
      const positions = {
        1: players.filter(p => p.position === 1), // GKP
        2: players.filter(p => p.position === 2), // DEF
        3: players.filter(p => p.position === 3), // MID
        4: players.filter(p => p.position === 4)  // FWD
      };
      
      res.json({
        players,
        clubs,
        positions,
        totalSpent: squad.reduce((sum, item) => sum + item.price_paid, 0),
        counts: {
          players: players.length,
          clubs: clubs.length,
          gkp: positions[1].length,
          def: positions[2].length,
          mid: positions[3].length,
          fwd: positions[4].length
        }
      });
    }
  );
});

// Get team info and budget
router.get('/:teamId', (req, res) => {
  const teamId = parseInt(req.params.teamId);
  const db = getDatabase();
  
  db.get(
    'SELECT id, name, username, budget FROM teams WHERE id = ?',
    [teamId],
    (err, team) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      
      res.json(team);
    }
  );
});

// Check if team can make a purchase (squad limits)
router.get('/:teamId/can-buy', (req, res) => {
  const teamId = parseInt(req.params.teamId);
  const { type, position } = req.query;
  const db = getDatabase();
  
  db.all(
    `SELECT s.*, p.position 
     FROM team_squads s
     LEFT JOIN fpl_players p ON s.player_id = p.id
     WHERE s.team_id = ?`,
    [teamId],
    (err, squad) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      const players = squad.filter(item => item.player_id);
      const clubs = squad.filter(item => item.club_id);
      
      const positionCounts = {
        1: players.filter(p => p.position === 1).length, // GKP
        2: players.filter(p => p.position === 2).length, // DEF
        3: players.filter(p => p.position === 3).length, // MID
        4: players.filter(p => p.position === 4).length  // FWD
      };
      
      const limits = {
        totalPlayers: 15,
        totalClubs: 2,
        1: 2, // GKP
        2: 5, // DEF
        3: 5, // MID
        4: 3  // FWD
      };
      
      let canBuy = true;
      let reason = '';
      
      if (type === 'player') {
        if (players.length >= limits.totalPlayers) {
          canBuy = false;
          reason = 'Maximum players reached (15)';
        } else if (position && positionCounts[position] >= limits[position]) {
          canBuy = false;
          const posNames = { 1: 'Goalkeepers', 2: 'Defenders', 3: 'Midfielders', 4: 'Forwards' };
          reason = `Maximum ${posNames[position]} reached (${limits[position]})`;
        }
      } else if (type === 'club') {
        if (clubs.length >= limits.totalClubs) {
          canBuy = false;
          reason = 'Maximum clubs reached (2)';
        }
      }
      
      res.json({
        canBuy,
        reason,
        currentCounts: {
          players: players.length,
          clubs: clubs.length,
          ...positionCounts
        },
        limits
      });
    }
  );
});

// Get all teams with their stats
router.get('/', (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT t.id, t.name, t.username, t.budget,
            COUNT(CASE WHEN s.player_id IS NOT NULL THEN 1 END) as player_count,
            COUNT(CASE WHEN s.club_id IS NOT NULL THEN 1 END) as club_count,
            COALESCE(SUM(s.price_paid), 0) as total_spent
     FROM teams t
     LEFT JOIN team_squads s ON t.id = s.team_id
     GROUP BY t.id, t.name, t.username, t.budget
     ORDER BY total_spent DESC`,
    [],
    (err, teams) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(teams);
    }
  );
});

module.exports = router;