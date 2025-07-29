const express = require('express');
const { getDatabase, advanceDraftTurn } = require('../models/database');

const router = express.Router();

// Start auction for a player
router.post('/start-player/:playerId', async (req, res) => {
  const playerId = req.params.playerId;
  const teamId = req.user.teamId;
  const db = getDatabase();
  
  try {
    // Check draft turn
    const draftState = await db.collection('draft_state').doc('current').get();
    if (!draftState.exists || !draftState.data().is_active) {
      return res.status(400).json({ error: 'Draft is not active' });
    }
    
    if (draftState.data().current_team_id !== teamId) {
      return res.status(403).json({ error: 'Not your turn to start an auction' });
    }
    
    // Check if auction exists
    const activeAuctions = await db.collection('auctions')
      .where('status', '==', 'active')
      .get();
    
    if (!activeAuctions.empty) {
      return res.status(400).json({ error: 'Another auction is already active' });
    }
    
    // Create auction
    const auctionRef = await db.collection('auctions').add({
      player_id: playerId,
      auction_type: 'player',
      current_bid: 5,
      current_bidder_id: teamId,
      status: 'active',
      started_at: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      auction: {
        id: auctionRef.id,
        currentBid: 5,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Error starting auction:', error);
    res.status(500).json({ error: 'Failed to start auction' });
  }
});

// Place bid
router.post('/bid/:auctionId', async (req, res) => {
  const auctionId = req.params.auctionId;
  const { bidAmount } = req.body;
  const teamId = req.user.teamId;
  const db = getDatabase();
  
  try {
    const auctionRef = db.collection('auctions').doc(auctionId);
    const auctionDoc = await auctionRef.get();
    
    if (!auctionDoc.exists || auctionDoc.data().status !== 'active') {
      return res.status(404).json({ error: 'Auction not found or not active' });
    }
    
    const auction = auctionDoc.data();
    
    if (bidAmount <= auction.current_bid) {
      return res.status(400).json({ error: 'Bid must be higher than current bid' });
    }
    
    // Update auction
    await auctionRef.update({
      current_bid: bidAmount,
      current_bidder_id: teamId
    });
    
    res.json({ success: true, bidAmount });
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Complete auction
router.post('/complete/:auctionId', async (req, res) => {
  const auctionId = req.params.auctionId;
  const db = getDatabase();
  
  try {
    const auctionRef = db.collection('auctions').doc(auctionId);
    const auctionDoc = await auctionRef.get();
    
    if (!auctionDoc.exists) {
      return res.status(404).json({ error: 'Auction not found' });
    }
    
    const auction = auctionDoc.data();
    
    // Update auction status
    await auctionRef.update({
      status: 'completed',
      ended_at: new Date().toISOString()
    });
    
    // Add to team squad
    await db.collection('team_squads').add({
      team_id: auction.current_bidder_id,
      player_id: auction.player_id,
      price_paid: auction.current_bid,
      acquired_at: new Date().toISOString()
    });
    
    // Update team budget
    const teamQuery = await db.collection('teams')
      .where('id', '==', auction.current_bidder_id)
      .limit(1)
      .get();
    
    if (!teamQuery.empty) {
      const teamDoc = teamQuery.docs[0];
      const currentBudget = teamDoc.data().budget;
      await teamDoc.ref.update({
        budget: currentBudget - auction.current_bid
      });
    }
    
    // Advance draft turn
    await advanceDraftTurn();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error completing auction:', error);
    res.status(500).json({ error: 'Failed to complete auction' });
  }
});

module.exports = router;