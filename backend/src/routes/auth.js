const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const { collections, createDefaultTeams } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Handle viewer login
    if (username === 'viewer' && password === 'viewer123') {
      const token = jwt.sign(
        { 
          teamId: -1, 
          username: 'viewer', 
          teamName: 'Viewer', 
          is_admin: false,
          is_viewer: true 
        },
        process.env.JWT_SECRET || 'default_secret',
        { expiresIn: '60d' }
      );
      
      return res.json({
        success: true,
        token,
        team: {
          id: -1,
          name: 'Viewer',
          username: 'viewer',
          budget: 0,
          is_admin: false,
          is_viewer: true
        }
      });
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
      { 
        teamId: team.id, 
        username: team.username, 
        teamName: team.name, 
        is_admin: team.is_admin || false,
        is_viewer: false 
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '60d' }
    );
    
    res.json({
      success: true,
      token,
      team: {
        id: team.id,
        name: team.name,
        username: team.username,
        budget: team.budget,
        is_admin: team.is_admin || false,
        is_viewer: false
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

// Change password endpoint
router.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const teamId = req.user.teamId;
  
  try {
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    // Get team from database using username as document ID
    const teamDoc = await collections.teams.doc(req.user.username).get();
    
    if (!teamDoc.exists) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const team = teamDoc.data();
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, team.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password in database
    await teamDoc.ref.update({
      password_hash: hashedPassword,
      password_updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
    
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Change team name endpoint
router.post('/change-team-name', authenticateToken, async (req, res) => {
  const { currentPassword, newTeamName } = req.body;
  
  try {
    // Validate input
    if (!currentPassword || !newTeamName) {
      return res.status(400).json({ error: 'Password and new team name are required' });
    }
    
    if (newTeamName.length < 3 || newTeamName.length > 30) {
      return res.status(400).json({ error: 'Team name must be between 3 and 30 characters' });
    }
    
    // Get team from database using username as document ID
    const teamDoc = await collections.teams.doc(req.user.username).get();
    
    if (!teamDoc.exists) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const team = teamDoc.data();
    
    // Verify password for security
    const isValidPassword = await bcrypt.compare(currentPassword, team.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }
    
    // Update team name in database
    await teamDoc.ref.update({
      name: newTeamName,
      name_updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Generate new token with updated team name
    const token = jwt.sign(
      { teamId: team.id, username: team.username, teamName: newTeamName, is_admin: team.is_admin || false },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '60d' }
    );
    
    res.json({ 
      success: true, 
      message: 'Team name changed successfully',
      token,
      team: {
        id: team.id,
        name: newTeamName,
        username: team.username,
        budget: team.budget,
        is_admin: team.is_admin || false
      }
    });
    
  } catch (error) {
    console.error('Error changing team name:', error);
    res.status(500).json({ error: 'Failed to change team name' });
  }
});

module.exports = router;