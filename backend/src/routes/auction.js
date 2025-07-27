const express = require('express');
const { getDatabase } = require('../models/database');

const router = express.Router();

// Start auction for a player (with draft validation)
router.post('/start-player/:playerId', (req, res) => {
  const playerId = parseInt(req.params.playerId);
  const teamId = req.user.teamId;
  const db = getDatabase();
  
  // First check if it's this team's turn in the draft
  db.get(
    'SELECT current_team_id, is_active FROM draft_state WHERE id = 1',
    [],
    (err, draftState) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!draftState || !draftState.is_active) {
        return res.status(400).json({ error: 'Draft is not active' });
      }
      
      if (draftState.current_team_id !== teamId) {
        return res.status(403).json({ error: 'Not your turn to start an auction' });
      }
      
      // Check if there's already an active auction
      db.get(
        'SELECT * FROM auctions WHERE status = "active"',
        [],
        (err, activeAuction) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          
          if (activeAuction) {
            return res.status(400).json({ error: 'Another auction is already active' });
          }
          
          // Check if player is already sold
          db.get(
            'SELECT * FROM team_squads WHERE player_id = ?',
            [playerId],
            (err, sold) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              
              if (sold) {
                return res.status(400).json({ error: 'Player is already sold' });
              }
              
              // Create new auction with automatic £5 bid
              db.run(
                `INSERT INTO auctions (player_id, auction_type, current_bid, current_bidder_id, status) 
                 VALUES (?, 'player', 5, ?, 'active')`,
                [playerId, teamId],
                function(err) {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to start auction' });
                  }
                  
                  const auctionId = this.lastID;
                  
                  // Record the automatic £5 bid in bid history
                  db.run(
                    'INSERT INTO bid_history (auction_id, team_id, bid_amount) VALUES (?, ?, 5)',
                    [auctionId, teamId],
                    (err) => {
                      if (err) {
                        console.error('Failed to record initial bid:', err);
                      }
                    }
                  );
              
              // Get player details for response
              db.get(
                `SELECT p.*, c.name as team_name 
                 FROM fpl_players p 
                 LEFT JOIN fpl_clubs c ON p.team_id = c.id 
                 WHERE p.id = ?`,
                [playerId],
                (err, player) => {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to fetch player details' });
                  }
                  
                  // Get team info for the initial bidder
                  db.get(
                    'SELECT name, username FROM teams WHERE id = ?',
                    [teamId],
                    (err, team) => {
                      if (err) {
                        console.error('Failed to get team info:', err);
                      }
                      
                      const auctionData = {
                        id: auctionId,
                        player,
                        currentBid: 5,
                        currentBidder: team || { name: 'Unknown', username: 'unknown' },
                        currentBidderId: teamId,
                        status: 'active',
                        type: 'player',
                        startedBy: team || { name: 'Unknown', username: 'unknown' }
                      };
                      
                      // Broadcast to all connected clients
                      req.io.emit('auction-started', auctionData);
                      
                      res.json({ success: true, auction: auctionData });
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// Start auction for a club (with draft validation)
router.post('/start-club/:clubId', (req, res) => {
  const clubId = parseInt(req.params.clubId);
  const teamId = req.user.teamId;
  const db = getDatabase();
  
  // First check if it's this team's turn in the draft
  db.get(
    'SELECT current_team_id, is_active FROM draft_state WHERE id = 1',
    [],
    (err, draftState) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!draftState || !draftState.is_active) {
        return res.status(400).json({ error: 'Draft is not active' });
      }
      
      if (draftState.current_team_id !== teamId) {
        return res.status(403).json({ error: 'Not your turn to start an auction' });
      }
      
      // Check if there's already an active auction
      db.get(
        'SELECT * FROM auctions WHERE status = "active"',
        [],
        (err, activeAuction) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          
          if (activeAuction) {
            return res.status(400).json({ error: 'Another auction is already active' });
          }
          
          // Check if club is already sold
          db.get(
            'SELECT * FROM team_squads WHERE club_id = ?',
            [clubId],
            (err, sold) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              
              if (sold) {
                return res.status(400).json({ error: 'Club is already sold' });
              }
              
              // Create new auction with automatic £5 bid
              db.run(
                `INSERT INTO auctions (club_id, auction_type, current_bid, current_bidder_id, status) 
                 VALUES (?, 'club', 5, ?, 'active')`,
                [clubId, teamId],
                function(err) {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to start auction' });
                  }
                  
                  const auctionId = this.lastID;
                  
                  // Record the automatic £5 bid in bid history
                  db.run(
                    'INSERT INTO bid_history (auction_id, team_id, bid_amount) VALUES (?, ?, 5)',
                    [auctionId, teamId],
                    (err) => {
                      if (err) {
                        console.error('Failed to record initial bid:', err);
                      }
                    }
                  );
                  
                  // Get club details
                  db.get(
                    'SELECT * FROM fpl_clubs WHERE id = ?',
                    [clubId],
                    (err, club) => {
                      if (err) {
                        return res.status(500).json({ error: 'Failed to fetch club details' });
                      }
                      
                      // Get team info for the initial bidder
                      db.get(
                        'SELECT name, username FROM teams WHERE id = ?',
                        [teamId],
                        (err, team) => {
                          if (err) {
                            console.error('Failed to get team info:', err);
                          }
                          
                          const auctionData = {
                            id: auctionId,
                            club,
                            currentBid: 5,
                            currentBidder: team || { name: 'Unknown', username: 'unknown' },
                            currentBidderId: teamId,
                            status: 'active',
                            type: 'club',
                            startedBy: team || { name: 'Unknown', username: 'unknown' }
                          };
                          
                          // Broadcast to all connected clients
                          req.io.emit('auction-started', auctionData);
                          
                          res.json({ success: true, auction: auctionData });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// Place a bid
router.post('/bid/:auctionId', (req, res) => {
  const auctionId = parseInt(req.params.auctionId);
  const { bidAmount } = req.body;
  const teamId = req.user.teamId;
  
  const db = getDatabase();
  
  // Validate bid amount (minimum 5, increments of 5)
  if (!bidAmount || bidAmount < 5 || bidAmount % 5 !== 0) {
    return res.status(400).json({ error: 'Invalid bid amount. Minimum 5, increments of 5' });
  }
  
  // Get current auction
  db.get(
    'SELECT * FROM auctions WHERE id = ? AND status = "active"',
    [auctionId],
    (err, auction) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!auction) {
        return res.status(404).json({ error: 'Auction not found or not active' });
      }
      
      if (bidAmount <= auction.current_bid) {
        return res.status(400).json({ 
          error: `Bid must be higher than current bid of ${auction.current_bid}` 
        });
      }
      
      // Check team budget
      db.get(
        'SELECT budget FROM teams WHERE id = ?',
        [teamId],
        (err, team) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          
          if (team.budget < bidAmount) {
            return res.status(400).json({ error: 'Insufficient budget' });
          }
          
          // Update auction
          db.run(
            'UPDATE auctions SET current_bid = ?, current_bidder_id = ? WHERE id = ?',
            [bidAmount, teamId, auctionId],
            (err) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to place bid' });
              }
              
              // Record bid history
              db.run(
                'INSERT INTO bid_history (auction_id, team_id, bid_amount) VALUES (?, ?, ?)',
                [auctionId, teamId, bidAmount],
                (err) => {
                  if (err) {
                    console.error('Failed to record bid history:', err);
                  }
                  
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
                }
              );
            }
          );
        }
      );
    }
  );
});

// Complete auction (sell to current highest bidder)
router.post('/complete/:auctionId', (req, res) => {
  const auctionId = parseInt(req.params.auctionId);
  const db = getDatabase();
  
  db.get(
    'SELECT * FROM auctions WHERE id = ? AND status = "active"',
    [auctionId],
    (err, auction) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!auction) {
        return res.status(404).json({ error: 'Auction not found or not active' });
      }
      
      if (!auction.current_bidder_id) {
        return res.status(400).json({ error: 'No bids placed yet' });
      }
      
      // Start transaction
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Add to team squad
        db.run(
          `INSERT INTO team_squads (team_id, ${auction.auction_type}_id, price_paid) 
           VALUES (?, ?, ?)`,
          [auction.current_bidder_id, auction.player_id || auction.club_id, auction.current_bid],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to add to team squad' });
            }
            
            // Update team budget
            db.run(
              'UPDATE teams SET budget = budget - ? WHERE id = ?',
              [auction.current_bid, auction.current_bidder_id],
              (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Failed to update budget' });
                }
                
                // Mark auction as completed
                db.run(
                  'UPDATE auctions SET status = "completed", ended_at = CURRENT_TIMESTAMP WHERE id = ?',
                  [auctionId],
                  (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return res.status(500).json({ error: 'Failed to complete auction' });
                    }
                    
                    db.run('COMMIT');
                    
                    const completionData = {
                      auctionId,
                      winnerId: auction.current_bidder_id,
                      finalPrice: auction.current_bid,
                      type: auction.auction_type
                    };
                    
                    // Broadcast completion
                    req.io.to('auction-room').emit('auction-completed', completionData);
                    
                    res.json({ success: true, completion: completionData });
                  }
                );
              }
            );
          }
        );
      });
    }
  );
});

// Get current active auctions
router.get('/active', (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT a.*, 
            p.web_name as player_name, p.position, p.team_id as player_team_id,
            c.name as club_name, c.short_name as club_short_name,
            t.name as current_bidder_name
     FROM auctions a
     LEFT JOIN fpl_players p ON a.player_id = p.id
     LEFT JOIN fpl_clubs c ON a.club_id = c.id
     LEFT JOIN teams t ON a.current_bidder_id = t.id
     WHERE a.status = 'active'
     ORDER BY a.started_at DESC`,
    [],
    (err, auctions) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(auctions);
    }
  );
});

module.exports = router;