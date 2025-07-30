const express = require('express');
const admin = require('firebase-admin');
const { collections } = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all drafts - Admin only
router.get('/list', requireAdmin, async (req, res) => {
  try {
    const draftsSnapshot = await collections.drafts.orderBy('created_at', 'desc').get();
    const drafts = [];
    
    for (const doc of draftsSnapshot.docs) {
      const draft = { id: doc.id, ...doc.data() };
      
      // Get basic stats for each draft
      if (draft.is_active) {
        // Get auction count
        const auctionsSnapshot = await collections.auctions.get();
        draft.total_auctions = auctionsSnapshot.size;
        
        // Get completed auctions
        const completedSnapshot = await collections.auctions
          .where('status', '==', 'completed')
          .get();
        draft.completed_auctions = completedSnapshot.size;
      }
      
      drafts.push(draft);
    }
    
    res.json(drafts);
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

// Create new draft - Admin only
router.post('/create', requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  
  try {
    if (!name) {
      return res.status(400).json({ error: 'Draft name is required' });
    }
    
    // Check if this is the first draft
    const existingDrafts = await collections.drafts.get();
    const isFirstDraft = existingDrafts.empty;
    
    // Create new draft
    const draftRef = collections.drafts.doc();
    const draftId = draftRef.id;
    
    await draftRef.set({
      name,
      description: description || '',
      is_active: isFirstDraft, // Auto-activate if first draft
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by: req.user.teamId
    });
    
    res.json({ 
      success: true, 
      draftId,
      message: 'Draft created successfully' 
    });
    
  } catch (error) {
    console.error('Error creating draft:', error);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

// Set active draft - Admin only
router.post('/set-active/:draftId', requireAdmin, async (req, res) => {
  const { draftId } = req.params;
  
  try {
    // First, deactivate all drafts
    const allDraftsSnapshot = await collections.drafts.get();
    const batch = admin.firestore().batch();
    
    allDraftsSnapshot.forEach(doc => {
      batch.update(doc.ref, { is_active: false });
    });
    
    // Activate the selected draft
    const draftRef = collections.drafts.doc(draftId);
    batch.update(draftRef, { 
      is_active: true,
      activated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    res.json({ 
      success: true, 
      message: 'Active draft changed successfully' 
    });
    
  } catch (error) {
    console.error('Error setting active draft:', error);
    res.status(500).json({ error: 'Failed to set active draft' });
  }
});

// Reset draft (clear all data) - Admin only
router.post('/reset/:draftId', requireAdmin, async (req, res) => {
  const { draftId } = req.params;
  const { resetTeamBudgets = true } = req.body;
  
  try {
    // Verify draft exists
    const draftDoc = await collections.drafts.doc(draftId).get();
    if (!draftDoc.exists) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    
    const batch = admin.firestore().batch();
    
    // Clear all auctions
    const auctionsSnapshot = await collections.auctions.get();
    auctionsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Clear all bid history
    const bidHistorySnapshot = await collections.bidHistory.get();
    bidHistorySnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Clear all team squads
    const teamSquadsSnapshot = await collections.teamSquads.get();
    teamSquadsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Clear draft state
    const draftStateDoc = await collections.draftState.doc('current').get();
    if (draftStateDoc.exists) {
      batch.update(draftStateDoc.ref, {
        is_active: false,
        current_round: 1,
        current_position: 0,
        current_team_id: null,
        direction: 'forward'
      });
    }
    
    // Clear draft order
    const draftOrderSnapshot = await collections.draftOrder.get();
    draftOrderSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Clear chat messages
    const chatSnapshot = await collections.chatMessages.get();
    chatSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Reset team budgets if requested
    if (resetTeamBudgets) {
      const teamsSnapshot = await collections.teams.get();
      teamsSnapshot.forEach(doc => {
        batch.update(doc.ref, { budget: 1000 });
      });
    }
    
    // Update draft reset timestamp
    batch.update(collections.drafts.doc(draftId), {
      last_reset_at: admin.firestore.FieldValue.serverTimestamp(),
      reset_by: req.user.teamId
    });
    
    await batch.commit();
    
    // Broadcast draft reset event
    req.io.to('auction-room').emit('draft-reset', {
      draftId,
      message: 'Draft has been reset by admin'
    });
    
    res.json({ 
      success: true, 
      message: 'Draft reset successfully' 
    });
    
  } catch (error) {
    console.error('Error resetting draft:', error);
    res.status(500).json({ error: 'Failed to reset draft' });
  }
});

// Get current active draft
router.get('/active', async (req, res) => {
  try {
    const activeDraftSnapshot = await collections.drafts
      .where('is_active', '==', true)
      .limit(1)
      .get();
    
    if (activeDraftSnapshot.empty) {
      return res.json({ active_draft: null });
    }
    
    const activeDraft = {
      id: activeDraftSnapshot.docs[0].id,
      ...activeDraftSnapshot.docs[0].data()
    };
    
    res.json({ active_draft: activeDraft });
    
  } catch (error) {
    console.error('Error fetching active draft:', error);
    res.status(500).json({ error: 'Failed to fetch active draft' });
  }
});

module.exports = router;