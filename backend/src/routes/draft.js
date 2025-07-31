const express = require('express');
const { collections, initializeDraftOrder, startDraft, advanceDraftTurn } = require('../models/database');
const admin = require('firebase-admin');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get current draft state and order
router.get('/state', async (req, res) => {
  try {
    // Get draft state
    const stateDoc = await collections.draftState.doc('current').get();
    
    if (!stateDoc.exists) {
      return res.json({ 
        is_active: false, 
        current_team_id: null,
        current_position: 0,
        message: 'Draft not initialized' 
      });
    }
    
    const state = stateDoc.data();
    
    // Get current team info if exists
    if (state.current_team_id) {
      const teamQuery = await collections.teams
        .where('id', '==', state.current_team_id)
        .limit(1)
        .get();
      
      if (!teamQuery.empty) {
        const team = teamQuery.docs[0].data();
        state.current_team_name = team.name;
        state.current_team_username = team.username;
      }
    }
    
    // Get draft order
    const orderSnapshot = await collections.draftOrder
      .orderBy('position')
      .get();
    
    const draft_order = [];
    
    for (const doc of orderSnapshot.docs) {
      const orderItem = doc.data();
      
      // Get team info
      const teamQuery = await collections.teams
        .where('id', '==', orderItem.team_id)
        .limit(1)
        .get();
      
      if (!teamQuery.empty) {
        const team = teamQuery.docs[0].data();
        draft_order.push({
          position: orderItem.position,
          team_id: orderItem.team_id,
          name: team.name,
          username: team.username
        });
      }
    }
    
    res.json({
      ...state,
      draft_order
    });
    
  } catch (error) {
    console.error('Error fetching draft state:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Initialize random draft order (admin only)
router.post('/initialize', requireAdmin, async (req, res) => {
  try {
    await initializeDraftOrder();
    req.io.emit('draft-initialized');
    res.json({ success: true, message: 'Draft order initialized' });
  } catch (err) {
    console.error('Initialize draft error:', err);
    res.status(500).json({ error: 'Failed to initialize draft' });
  }
});

// Start the draft (admin only)
router.post('/start', requireAdmin, async (req, res) => {
  try {
    await startDraft();
    req.io.emit('draft-started');
    res.json({ success: true, message: 'Draft started' });
  } catch (err) {
    console.error('Start draft error:', err);
    res.status(500).json({ error: 'Failed to start draft' });
  }
});

// Check if current user can start auction
router.get('/can-start-auction', async (req, res) => {
  const teamId = req.user.teamId;
  
  try {
    const stateDoc = await collections.draftState.doc('current').get();
    
    if (!stateDoc.exists) {
      return res.json({ can_start: false });
    }
    
    const state = stateDoc.data();
    const canStart = state && state.is_active && state.current_team_id === teamId;
    res.json({ can_start: canStart });
    
  } catch (error) {
    console.error('Error checking auction permission:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Complete current team's turn and advance to next
router.post('/advance-turn', async (req, res) => {
  const teamId = req.user.teamId;
  
  try {
    // Verify it's the current team's turn
    const stateDoc = await collections.draftState.doc('current').get();
    
    if (!stateDoc.exists) {
      return res.status(400).json({ error: 'Draft not initialized' });
    }
    
    const state = stateDoc.data();
    
    if (!state.is_active) {
      return res.status(400).json({ error: 'Draft is not active' });
    }
    
    if (state.current_team_id !== teamId) {
      return res.status(403).json({ error: 'Not your turn' });
    }
    
    const result = await advanceDraftTurn();
    
    // Emit draft update to all clients
    req.io.emit('draft-turn-advanced', result);
    res.json({ success: true, ...result });
    
  } catch (err) {
    console.error('Advance turn error:', err);
    res.status(500).json({ error: 'Failed to advance turn' });
  }
});

// Get chat messages
router.get('/chat', async (req, res) => {
  try {
    const messagesSnapshot = await collections.chatMessages
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    
    const messages = [];
    
    for (const doc of messagesSnapshot.docs) {
      const message = doc.data();
      
      // Get team info
      const teamQuery = await collections.teams
        .where('id', '==', message.team_id)
        .limit(1)
        .get();
      
      if (!teamQuery.empty) {
        const team = teamQuery.docs[0].data();
        messages.push({
          id: doc.id,
          message: message.message,
          created_at: message.created_at,
          team_name: team.name,
          username: team.username
        });
      }
    }
    
    res.json(messages.reverse()); // Return in chronological order
    
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Send chat message
router.post('/chat', async (req, res) => {
  const teamId = req.user.teamId;
  const { message } = req.body;
  
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  
  if (message.length > 500) {
    return res.status(400).json({ error: 'Message too long (max 500 characters)' });
  }
  
  try {
    // Add message to Firestore
    const messageRef = await collections.chatMessages.add({
      team_id: teamId,
      message: message.trim(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get team info for response
    const teamQuery = await collections.teams
      .where('id', '==', teamId)
      .limit(1)
      .get();
    
    if (teamQuery.empty) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const team = teamQuery.docs[0].data();
    
    const messageData = {
      id: messageRef.id,
      message: message.trim(),
      created_at: new Date().toISOString(),
      team_name: team.name,
      username: team.username
    };
    
    // Broadcast to all clients in auction room
    req.io.to('auction-room').emit('new-chat-message', messageData);
    res.json({ success: true, message: messageData });
    
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Clear all chat messages (admin only)
router.delete('/chat/clear', requireAdmin, async (req, res) => {
  try {
    // Get all chat messages
    const messagesSnapshot = await collections.chatMessages.get();
    
    // Delete all messages in batches
    const batch = admin.firestore().batch();
    messagesSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    // Emit to all connected clients that chat was cleared
    const io = req.app.get('io');
    if (io) {
      io.emit('chat_cleared', { clearedBy: req.user.username });
    }
    
    res.json({ 
      success: true, 
      message: 'All chat messages cleared successfully',
      deletedCount: messagesSnapshot.size 
    });
  } catch (error) {
    console.error('Error clearing chat messages:', error);
    res.status(500).json({ error: 'Failed to clear chat messages' });
  }
});

module.exports = router;