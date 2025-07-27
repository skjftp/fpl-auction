const express = require('express');
const axios = require('axios');
const { getDatabase } = require('../models/database');

const router = express.Router();

// Update scores for a specific gameweek
router.post('/update-gameweek/:gameweek', async (req, res) => {
  try {
    const gameweek = parseInt(req.params.gameweek);
    
    // Fetch gameweek data from FPL API
    const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
    const liveData = response.data;
    
    const db = getDatabase();
    
    // Get all team squads
    db.all(
      `SELECT ts.team_id, ts.player_id, ts.price_paid
       FROM team_squads ts
       WHERE ts.player_id IS NOT NULL`,
      [],
      (err, squads) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        
        const updatePromises = [];
        
        squads.forEach(squad => {
          const playerData = liveData.elements[squad.player_id];
          if (playerData && playerData.stats) {
            const points = playerData.stats.total_points || 0;
            
            updatePromises.push(new Promise((resolve, reject) => {
              db.run(
                `INSERT OR REPLACE INTO gameweek_scores 
                 (team_id, gameweek, player_id, points) 
                 VALUES (?, ?, ?, ?)`,
                [squad.team_id, gameweek, squad.player_id, points],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            }));
          }
        });
        
        Promise.all(updatePromises)
          .then(() => {
            res.json({ 
              success: true, 
              message: `Updated scores for gameweek ${gameweek}`,
              updated: updatePromises.length
            });
          })
          .catch(error => {
            console.error('Error updating scores:', error);
            res.status(500).json({ error: 'Failed to update some scores' });
          });
      }
    );
    
  } catch (error) {
    console.error('Error fetching gameweek data:', error);
    res.status(500).json({ error: 'Failed to fetch gameweek data' });
  }
});

// Get team scores for a gameweek
router.get('/team/:teamId/gameweek/:gameweek', (req, res) => {
  const teamId = parseInt(req.params.teamId);
  const gameweek = parseInt(req.params.gameweek);
  const db = getDatabase();
  
  db.all(
    `SELECT gs.*, p.web_name, p.position, p.photo
     FROM gameweek_scores gs
     JOIN fpl_players p ON gs.player_id = p.id
     WHERE gs.team_id = ? AND gs.gameweek = ?
     ORDER BY gs.points DESC`,
    [teamId, gameweek],
    (err, scores) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      const totalPoints = scores.reduce((sum, score) => sum + score.points, 0);
      
      res.json({
        gameweek,
        teamId,
        scores,
        totalPoints,
        playerCount: scores.length
      });
    }
  );
});

// Get overall leaderboard
router.get('/leaderboard', (req, res) => {
  const { gameweek } = req.query;
  const db = getDatabase();
  
  let query = `
    SELECT t.id, t.name, t.username,
           COALESCE(SUM(gs.points), 0) as total_points,
           COUNT(DISTINCT gs.gameweek) as gameweeks_played
    FROM teams t
    LEFT JOIN gameweek_scores gs ON t.id = gs.team_id
  `;
  
  const params = [];
  
  if (gameweek) {
    query += ' WHERE gs.gameweek = ?';
    params.push(parseInt(gameweek));
  }
  
  query += `
    GROUP BY t.id, t.name, t.username
    ORDER BY total_points DESC
  `;
  
  db.all(query, params, (err, leaderboard) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json(leaderboard);
  });
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