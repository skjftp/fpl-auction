const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
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

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
}

module.exports = {
  authenticateToken,
  authorizeTeam,
  requireAdmin
};