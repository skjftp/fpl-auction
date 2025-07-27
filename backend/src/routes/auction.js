const express = require('express');
const { collections, advanceDraftTurn } = require('../models/database');
const admin = require('firebase-admin');

const router = express.Router();

// Start auction for a player (with draft validation)
router.post('/start-player/:playerId', async (req, res) => {
  const playerId = parseInt(req.params.playerId);
  const teamId = req.user.teamId;
  
  try {
    // First check if it's this team's turn in the draft
    const draftStateDoc = await collections.draftState.doc('current').get();
    
    if (!draftStateDoc.exists) {
      return res.status(400).json({ error: 'Draft state not initialized' });
    }
    
    const draftState = draftStateDoc.data();
    
    if (!draftState.is_active) {
      return res.status(400).json({ error: 'Draft is not active' });
    }
    
    if (draftState.current_team_id !== teamId) {
      return res.status(403).json({ error: 'Not your turn to start an auction' });
    }
    
    // Check if there's already an active auction
    const activeAuctions = await collections.auctions
      .where('status', '==', 'active')
      .get();
    
    if (!activeAuctions.empty) {
      return res.status(400).json({ error: 'Another auction is already active' });
    }
    
    // Check if player is already sold
    const soldPlayers = await collections.teamSquads
      .where('player_id', '==', playerId)
      .get();
    
    if (!soldPlayers.empty) {
      return res.status(400).json({ error: 'Player is already sold' });
    }
    
    // Create new auction with automatic £5 bid
    const auctionRef = collections.auctions.doc();
    const auctionId = auctionRef.id;
    
    const auctionData = {
      id: auctionId,
      player_id: playerId,
      auction_type: 'player',
      current_bid: 5,
      current_bidder_id: teamId,
      status: 'active',
      started_at: admin.firestore.FieldValue.serverTimestamp(),
      bid_count: 1
    };
    
    await auctionRef.set(auctionData);
    
    // Record the automatic £5 bid in bid history
    await collections.bidHistory.add({
      auction_id: auctionId,
      team_id: teamId,
      bid_amount: 5,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get player details for response
    const playerDoc = await collections.fplPlayers.doc(playerId.toString()).get();
    if (!playerDoc.exists) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const player = playerDoc.data();
    
    // Get club info
    if (player.team_id) {
      const clubDoc = await collections.fplClubs.doc(player.team_id.toString()).get();
      if (clubDoc.exists) {
        player.team_name = clubDoc.data().name;
      }
    }
    
    // Get team info for the initial bidder
    const teamDoc = await collections.teams.where('id', '==', teamId).limit(1).get();
    let team = { name: 'Unknown', username: 'unknown' };
    if (!teamDoc.empty) {
      team = teamDoc.docs[0].data();
    }
    
    const responseData = {
      id: auctionId,
      player,
      currentBid: 5,
      currentBidder: team,
      currentBidderId: teamId,
      status: 'active',
      type: 'player',
      startedBy: team
    };
    
    // Broadcast to all connected clients
    req.io.emit('auction-started', responseData);
    
    res.json({ success: true, auction: responseData });
    
  } catch (error) {
    console.error('Error starting player auction:', error);
    res.status(500).json({ error: 'Failed to start auction' });
  }
});

// Start auction for a club (with draft validation)
router.post('/start-club/:clubId', async (req, res) => {
  const clubId = parseInt(req.params.clubId);
  const teamId = req.user.teamId;
  
  try {
    // First check if it's this team's turn in the draft
    const draftStateDoc = await collections.draftState.doc('current').get();
    
    if (!draftStateDoc.exists) {
      return res.status(400).json({ error: 'Draft state not initialized' });
    }
    
    const draftState = draftStateDoc.data();
    
    if (!draftState.is_active) {
      return res.status(400).json({ error: 'Draft is not active' });
    }
    
    if (draftState.current_team_id !== teamId) {
      return res.status(403).json({ error: 'Not your turn to start an auction' });
    }
    
    // Check if there's already an active auction
    const activeAuctions = await collections.auctions
      .where('status', '==', 'active')
      .get();
    
    if (!activeAuctions.empty) {
      return res.status(400).json({ error: 'Another auction is already active' });
    }
    
    // Check if club is already sold
    const soldClubs = await collections.teamSquads
      .where('club_id', '==', clubId)
      .get();
    
    if (!soldClubs.empty) {
      return res.status(400).json({ error: 'Club is already sold' });
    }
    
    // Create new auction with automatic £5 bid
    const auctionRef = collections.auctions.doc();
    const auctionId = auctionRef.id;
    
    const auctionData = {
      id: auctionId,
      club_id: clubId,
      auction_type: 'club',
      current_bid: 5,
      current_bidder_id: teamId,
      status: 'active',
      started_at: admin.firestore.FieldValue.serverTimestamp(),
      bid_count: 1
    };
    
    await auctionRef.set(auctionData);
    
    // Record the automatic £5 bid in bid history
    await collections.bidHistory.add({
      auction_id: auctionId,
      team_id: teamId,
      bid_amount: 5,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get club details
    const clubDoc = await collections.fplClubs.doc(clubId.toString()).get();
    if (!clubDoc.exists) {
      return res.status(404).json({ error: 'Club not found' });
    }
    const club = clubDoc.data();
    
    // Get team info for the initial bidder
    const teamDoc = await collections.teams.where('id', '==', teamId).limit(1).get();
    let team = { name: 'Unknown', username: 'unknown' };
    if (!teamDoc.empty) {
      team = teamDoc.docs[0].data();
    }
    
    const responseData = {
      id: auctionId,
      club,
      currentBid: 5,
      currentBidder: team,
      currentBidderId: teamId,
      status: 'active',
      type: 'club',
      startedBy: team
    };
    
    // Broadcast to all connected clients
    req.io.emit('auction-started', responseData);
    
    res.json({ success: true, auction: responseData });
    
  } catch (error) {
    console.error('Error starting club auction:', error);
    res.status(500).json({ error: 'Failed to start auction' });
  }
});

// Place a bid
router.post('/bid/:auctionId', async (req, res) => {
  const auctionId = req.params.auctionId;
  const { bidAmount } = req.body;
  const teamId = req.user.teamId;
  
  // Validate bid amount (minimum 5, increments of 5)
  if (!bidAmount || bidAmount < 5 || bidAmount % 5 !== 0) {
    return res.status(400).json({ error: 'Invalid bid amount. Minimum 5, increments of 5' });
  }
  
  try {
    // Get current auction
    const auctionDoc = await collections.auctions.doc(auctionId).get();
    
    if (!auctionDoc.exists || auctionDoc.data().status !== 'active') {
      return res.status(404).json({ error: 'Auction not found or not active' });
    }
    
    const auction = auctionDoc.data();
    
    if (bidAmount <= auction.current_bid) {
      return res.status(400).json({ 
        error: `Bid must be higher than current bid of ${auction.current_bid}` 
      });
    }
    
    // Check team budget
    const teamDoc = await collections.teams.where('id', '==', teamId).limit(1).get();
    if (teamDoc.empty) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const team = teamDoc.docs[0].data();
    if (team.budget < bidAmount) {
      return res.status(400).json({ error: 'Insufficient budget' });
    }
    
    // Update auction
    await collections.auctions.doc(auctionId).update({
      current_bid: bidAmount,
      current_bidder_id: teamId,
      bid_count: admin.firestore.FieldValue.increment(1)
    });
    
    // Record bid history
    await collections.bidHistory.add({
      auction_id: auctionId,
      team_id: teamId,
      bid_amount: bidAmount,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const bidData = {
      auctionId,
      teamId,
      teamName: req.user.teamName,
      bidAmount,
      timestamp: new Date().toISOString()
    };
    
    // Broadcast bid to all clients
    req.io.to('auction-room').emit('new-bid', bidData);
    
    res.json({ success: true, bid: bidData });
    
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Complete auction (sell to current highest bidder)
router.post('/complete/:auctionId', async (req, res) => {
  const auctionId = req.params.auctionId;
  
  try {
    const auctionDoc = await collections.auctions.doc(auctionId).get();
    
    if (!auctionDoc.exists || auctionDoc.data().status !== 'active') {
      return res.status(404).json({ error: 'Auction not found or not active' });
    }
    
    const auction = auctionDoc.data();
    
    if (!auction.current_bidder_id) {
      return res.status(400).json({ error: 'No bids placed yet' });
    }
    
    // Use a batch write for atomic operations
    const batch = admin.firestore().batch();
    
    // Add to team squad
    const squadRef = collections.teamSquads.doc();
    batch.set(squadRef, {
      team_id: auction.current_bidder_id,
      [`${auction.auction_type}_id`]: auction.player_id || auction.club_id,
      price_paid: auction.current_bid,
      acquired_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update team budget (need to get current budget first)
    const teamQuery = await collections.teams
      .where('id', '==', auction.current_bidder_id)
      .limit(1)
      .get();
    
    if (teamQuery.empty) {
      return res.status(404).json({ error: 'Winner team not found' });
    }
    
    const teamDoc = teamQuery.docs[0];
    const currentBudget = teamDoc.data().budget;
    
    batch.update(teamDoc.ref, {
      budget: currentBudget - auction.current_bid
    });
    
    // Mark auction as completed
    batch.update(collections.auctions.doc(auctionId), {
      status: 'completed',
      ended_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Commit the batch
    await batch.commit();
    
    const completionData = {
      auctionId,
      winnerId: auction.current_bidder_id,
      finalPrice: auction.current_bid,
      type: auction.auction_type
    };
    
    // Broadcast completion
    req.io.to('auction-room').emit('auction-completed', completionData);
    
    // Advance to next team in draft order
    try {
      const result = await advanceDraftTurn();
      if (result.hasNext) {
        req.io.emit('draft-turn-advanced', {
          currentTeam: result.currentTeam,
          currentPosition: result.currentPosition
        });
      }
    } catch (err) {
      console.error('Failed to advance draft turn:', err);
    }
    
    res.json({ success: true, completion: completionData });
    
  } catch (error) {
    console.error('Error completing auction:', error);
    res.status(500).json({ error: 'Failed to complete auction' });
  }
});

// Get current active auctions
router.get('/active', async (req, res) => {
  try {
    const activeAuctions = await collections.auctions
      .where('status', '==', 'active')
      .orderBy('started_at', 'desc')
      .get();
    
    const auctions = [];
    
    for (const doc of activeAuctions.docs) {
      const auction = doc.data();
      
      // Get player or club details
      if (auction.player_id) {
        const playerDoc = await collections.fplPlayers.doc(auction.player_id.toString()).get();
        if (playerDoc.exists) {
          auction.player_name = playerDoc.data().web_name;
          auction.position = playerDoc.data().position;
          auction.player_team_id = playerDoc.data().team_id;
        }
      } else if (auction.club_id) {
        const clubDoc = await collections.fplClubs.doc(auction.club_id.toString()).get();
        if (clubDoc.exists) {
          const club = clubDoc.data();
          auction.club_name = club.name;
          auction.club_short_name = club.short_name;
        }
      }
      
      // Get current bidder name
      const teamQuery = await collections.teams
        .where('id', '==', auction.current_bidder_id)
        .limit(1)
        .get();
      
      if (!teamQuery.empty) {
        auction.current_bidder_name = teamQuery.docs[0].data().name;
      }
      
      auctions.push(auction);
    }
    
    res.json(auctions);
    
  } catch (error) {
    console.error('Error fetching active auctions:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;