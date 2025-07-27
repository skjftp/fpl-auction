const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase, createDefaultTeams } = require('../models/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const db = getDatabase();
  
  try {
    // Get team by username
    const teamDoc = await db.collection('teams').doc(username).get();
    
    if (!teamDoc.exists) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const team = { id: teamDoc.id, ...teamDoc.data() };
    
    // Verify password
    const validPassword = await bcrypt.compare(password, team.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { teamId: team.id, username: team.username, teamName: team.name },
      JWT_SECRET,
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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Initialize teams (for setup)
router.post('/init-teams', async (req, res) => {
  try {
    await createDefaultTeams();
    res.json({ success: true, message: 'Teams initialized successfully' });
  } catch (error) {
    console.error('Init teams error:', error);
    res.status(500).json({ error: 'Failed to initialize teams' });
  }
});

// Verify token
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

module.exports = router;