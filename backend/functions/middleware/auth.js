const jwt = require('jsonwebtoken');
const { getDatabase } = require('../models/database');

function authenticateToken(req, res, next) {
  // Skip authentication for OPTIONS requests
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default_secret', (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    req.user = decoded;
    next();
  });
}

function authorizeTeam(req, res, next) {
  const teamId = parseInt(req.params.teamId);
  
  if (req.user.teamId !== teamId) {
    return res.status(403).json({ error: 'Access denied to this team' });
  }
  
  next();
}

module.exports = {
  authenticateToken,
  authorizeTeam
};