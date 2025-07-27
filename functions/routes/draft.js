const express = require('express');
const { getDatabase, initializeDraftOrder, startDraft, advanceDraftTurn } = require('../models/database');

const router = express.Router();

// Get current draft state
router.get('/state', async (req, res) => {
  const db = getDatabase();
  
  try {
    // Get draft state
    const stateDoc = await db.collection('draft_state').doc('current').get();
    
    if (!stateDoc.exists) {
      return res.json({ 
        is_active: false, 
        message: 'Draft not initialized' 
      });
    }
    
    const state = stateDoc.data();
    
    // Get draft order
    const orderSnapshot = await db.collection('draft_order').orderBy('position').get();
    const draft_order = [];
    
    for (const doc of orderSnapshot.docs) {
      const orderItem = doc.data();
      // Get team details
      const teamDoc = await db.collection('teams').where('id', '==', orderItem.team_id).limit(1).get();
      if (!teamDoc.empty) {
        const team = teamDoc.docs[0].data();
        draft_order.push({
          position: orderItem.position,
          team_id: orderItem.team_id,
          name: team.name,
          username: team.username
        });
      }
    }
    
    // Get current team name
    let current_team_name = '';
    if (state.current_team_id) {
      const currentTeamDoc = await db.collection('teams').where('id', '==', state.current_team_id).limit(1).get();
      if (!currentTeamDoc.empty) {
        current_team_name = currentTeamDoc.docs[0].data().name;
      }
    }
    
    res.json({
      ...state,
      current_team_name,
      draft_order
    });
  } catch (error) {
    console.error('Error getting draft state:', error);
    res.status(500).json({ error: 'Failed to get draft state' });
  }
});

// Initialize draft order
router.post('/initialize', async (req, res) => {
  try {
    await initializeDraftOrder();
    res.json({ success: true, message: 'Draft order initialized' });
  } catch (error) {
    console.error('Initialize draft error:', error);
    res.status(500).json({ error: 'Failed to initialize draft' });
  }
});

// Start draft
router.post('/start', async (req, res) => {
  try {
    await startDraft();
    res.json({ success: true, message: 'Draft started' });
  } catch (error) {
    console.error('Start draft error:', error);
    res.status(500).json({ error: 'Failed to start draft' });
  }
});

// Get chat messages
router.get('/chat', async (req, res) => {
  const db = getDatabase();
  
  try {
    const snapshot = await db.collection('chat_messages')
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    
    const messages = [];
    snapshot.forEach(doc => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send chat message
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  const teamId = req.user.teamId;
  const teamName = req.user.teamName;
  const db = getDatabase();
  
  try {
    const docRef = await db.collection('chat_messages').add({
      team_id: teamId,
      team_name: teamName,
      message,
      created_at: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      id: docRef.id,
      message: {
        id: docRef.id,
        team_id: teamId,
        team_name: teamName,
        message,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;