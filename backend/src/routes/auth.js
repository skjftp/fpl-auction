const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { collections, createDefaultTeams } = require('../models/database');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Get team from Firestore
    const teamDoc = await collections.teams.doc(username).get();
    
    if (!teamDoc.exists) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const team = teamDoc.data();
    
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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Initialize default teams
router.post('/init-teams', async (req, res) => {
  try {
    await createDefaultTeams();
    res.json({ success: true, message: 'Default teams created' });
  } catch (error) {
    console.error('Init teams error:', error);
    res.status(500).json({ error: 'Failed to initialize teams' });
  }
});

module.exports = router;