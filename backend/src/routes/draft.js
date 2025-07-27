const express = require('express');
const { getDatabase, initializeDraftOrder, startDraft, advanceDraftTurn } = require('../models/database');

const router = express.Router();

// Get current draft state and order
router.get('/state', (req, res) => {
  const db = getDatabase();
  
  db.get(
    `SELECT ds.*, t.name as current_team_name, t.username as current_team_username
     FROM draft_state ds
     LEFT JOIN teams t ON ds.current_team_id = t.id
     WHERE ds.id = 1`,
    [],
    (err, state) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!state) {
        return res.json({ 
          is_active: false, 
          current_team_id: null,
          current_position: 0,
          message: 'Draft not initialized' 
        });
      }
      
      // Get draft order
      db.all(
        `SELECT do.position, do.team_id, t.name, t.username
         FROM draft_order do
         JOIN teams t ON do.team_id = t.id
         ORDER BY do.position`,
        [],
        (err, order) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          
          res.json({
            ...state,
            draft_order: order
          });
        }
      );
    }
  );
});

// Initialize random draft order (admin only)
router.post('/initialize', (req, res) => {
  initializeDraftOrder()
    .then(() => {
      req.io.emit('draft-initialized');
      res.json({ success: true, message: 'Draft order initialized' });
    })
    .catch(err => {
      console.error('Initialize draft error:', err);
      res.status(500).json({ error: 'Failed to initialize draft' });
    });
});

// Start the draft (admin only)
router.post('/start', (req, res) => {
  startDraft()
    .then(() => {
      req.io.emit('draft-started');
      res.json({ success: true, message: 'Draft started' });
    })
    .catch(err => {
      console.error('Start draft error:', err);
      res.status(500).json({ error: 'Failed to start draft' });
    });
});

// Check if current user can start auction
router.get('/can-start-auction', (req, res) => {
  const teamId = req.user.teamId;
  const db = getDatabase();
  
  db.get(
    'SELECT current_team_id, is_active FROM draft_state WHERE id = 1',
    [],
    (err, state) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      const canStart = state && state.is_active && state.current_team_id === teamId;
      res.json({ can_start: canStart });
    }
  );
});

// Complete current team's turn and advance to next
router.post('/advance-turn', (req, res) => {
  const teamId = req.user.teamId;
  const db = getDatabase();
  
  // Verify it's the current team's turn
  db.get(
    'SELECT current_team_id, is_active FROM draft_state WHERE id = 1',
    [],
    (err, state) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!state || !state.is_active) {
        return res.status(400).json({ error: 'Draft is not active' });
      }
      
      if (state.current_team_id !== teamId) {
        return res.status(403).json({ error: 'Not your turn' });
      }
      
      advanceDraftTurn()
        .then(result => {
          // Emit draft update to all clients
          req.io.emit('draft-turn-advanced', result);
          res.json({ success: true, ...result });
        })
        .catch(err => {
          console.error('Advance turn error:', err);
          res.status(500).json({ error: 'Failed to advance turn' });
        });
    }
  );
});

// Get chat messages
router.get('/chat', (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT cm.id, cm.message, cm.created_at, t.name as team_name, t.username
     FROM chat_messages cm
     JOIN teams t ON cm.team_id = t.id
     ORDER BY cm.created_at DESC
     LIMIT 50`,
    [],
    (err, messages) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(messages.reverse()); // Return in chronological order
    }
  );
});

// Send chat message
router.post('/chat', (req, res) => {
  const teamId = req.user.teamId;
  const { message } = req.body;
  
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  
  if (message.length > 500) {
    return res.status(400).json({ error: 'Message too long (max 500 characters)' });
  }
  
  const db = getDatabase();
  
  db.run(
    'INSERT INTO chat_messages (team_id, message) VALUES (?, ?)',
    [teamId, message.trim()],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to send message' });
      }
      
      // Get the complete message with team info
      db.get(
        `SELECT cm.id, cm.message, cm.created_at, t.name as team_name, t.username
         FROM chat_messages cm
         JOIN teams t ON cm.team_id = t.id
         WHERE cm.id = ?`,
        [this.lastID],
        (err, messageData) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          
          // Broadcast to all clients
          req.io.emit('new-chat-message', messageData);
          res.json({ success: true, message: messageData });
        }
      );
    }
  );
});

module.exports = router;