const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase, createDefaultTeams } = require('../models/database');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const db = getDatabase();
    
    db.get(
      'SELECT * FROM teams WHERE username = ?',
      [username],
      async (err, team) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (!team) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, team.password_hash);
        if (!validPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
          { teamId: team.id, username: team.username, teamName: team.name },
          process.env.JWT_SECRET || 'default_secret',
          { expiresIn: '24h' }
        );
        
        res.json({
          success: true,
          token,
          team: {
            id: team.id,
            name: team.name,
            username: team.username,
            budget: team.budget
          }
        });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize teams (development only)
router.post('/init-teams', async (req, res) => {
  try {
    await createDefaultTeams();
    res.json({ success: true, message: 'Default teams created' });
  } catch (error) {
    console.error('Init teams error:', error);
    res.status(500).json({ error: 'Failed to initialize teams' });
  }
});

// Get all teams (for admin/debugging)
router.get('/teams', (req, res) => {
  const db = getDatabase();
  
  db.all(
    'SELECT id, name, username, budget FROM teams ORDER BY id',
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