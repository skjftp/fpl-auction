const { collections, canTeamAcquirePlayer } = require('../models/database');
const admin = require('firebase-admin');

class AutoBidService {
    constructor(io) {
        this.io = io;
        this.checkInterval = null;
        this.isProcessing = false;
    }

    start() {
        if (this.checkInterval) return;
        
        console.log('Starting AutoBid Service...');
        
        // Check every 2 seconds
        this.checkInterval = setInterval(() => {
            this.processAutoBids();
        }, 2000);
        
        // Initial check
        this.processAutoBids();
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('AutoBid Service stopped');
        }
    }

    async processAutoBids() {
        // Prevent concurrent processing
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // Get active auction
            const activeAuctions = await collections.auctions
                .where('status', '==', 'active')
                .limit(1)
                .get();

            if (activeAuctions.empty) {
                this.isProcessing = false;
                return;
            }

            const auctionDoc = activeAuctions.docs[0];
            const auction = auctionDoc.data();
            
            // Only process player auctions
            if (auction.auction_type !== 'player' || !auction.player_id) {
                this.isProcessing = false;
                return;
            }

            // Get all auto-bid configurations
            const configsSnapshot = await collections.autoBidConfigs.get();
            
            for (const configDoc of configsSnapshot.docs) {
                const config = configDoc.data();
                const teamId = config.teamId;
                
                // Skip if auto-bid is not enabled for this team
                if (!config.enabled) continue;
                
                // Skip if team is already the highest bidder
                if (auction.current_bidder_id === teamId) continue;
                
                // Check if this player has auto-bid config
                const playerConfig = config.players?.[auction.player_id];
                if (!playerConfig || !playerConfig.maxBid) continue;
                
                // Check team budget BEFORE calculating bid
                const teamQuery = await collections.teams
                    .where('id', '==', teamId)
                    .limit(1)
                    .get();
                
                if (teamQuery.empty) continue;
                
                const team = teamQuery.docs[0].data();
                
                // Calculate maximum allowed bid based on team composition
                const maxAllowedBid = await this.calculateMaxAllowedBid(teamId, team.budget);
                
                // Calculate next bid
                const nextBid = auction.current_bid + 5;
                
                // The actual max we can bid is the minimum of:
                // 1. Player's configured max bid
                // 2. Team's calculated max allowed bid (budget - reserve for remaining slots)
                // 3. Team's current budget
                const effectiveMaxBid = Math.min(
                    playerConfig.maxBid,
                    maxAllowedBid,
                    team.budget
                );
                
                console.log(`Team ${teamId} auto-bid check for player ${auction.player_id}:
                    - Current bid: ${auction.current_bid}
                    - Next bid would be: ${nextBid}
                    - Config max bid: ${playerConfig.maxBid}
                    - Current budget: ${team.budget}
                    - Max allowed bid (calculated): ${maxAllowedBid}
                    - Effective max bid: ${effectiveMaxBid}
                    - Will bid: ${nextBid <= effectiveMaxBid ? 'YES' : 'NO'}`);
                
                // Skip if next bid exceeds what we can actually afford
                if (nextBid > effectiveMaxBid) {
                    console.log(`Team ${teamId} SKIPPING bid - ${nextBid} exceeds effective max of ${effectiveMaxBid}`);
                    continue;
                }
                
                // Check if team can acquire this player
                const canAcquire = await canTeamAcquirePlayer(teamId, auction.player_id);
                if (!canAcquire.canAcquire) continue;
                
                // Apply player-specific rules
                if (playerConfig.onlySellingStage) {
                    if (!auction.selling_stage || 
                        (auction.selling_stage !== 'selling1' && auction.selling_stage !== 'selling2')) {
                        continue;
                    }
                }
                
                if (playerConfig.neverSecondBidder) {
                    // Check if placing this bid would make them second bidder
                    const bidHistory = await collections.bidHistory
                        .where('auction_id', '==', auction.id)
                        .get();
                    
                    if (bidHistory.size === 1) {
                        // Would be second bidder
                        continue;
                    }
                }
                
                if (playerConfig.skipIfTeamHasClubPlayer) {
                    // Get player's club
                    const playerDoc = await collections.fplPlayers.doc(auction.player_id.toString()).get();
                    if (playerDoc.exists) {
                        const player = playerDoc.data();
                        if (player.team_id) {
                            // Check if team already has a player from this club
                            const squadSnapshot = await collections.teamSquads
                                .where('team_id', '==', teamId)
                                .get();
                            
                            let hasClubPlayer = false;
                            for (const squadDoc of squadSnapshot.docs) {
                                const squadItem = squadDoc.data();
                                if (squadItem.player_id) {
                                    const squadPlayerDoc = await collections.fplPlayers.doc(squadItem.player_id.toString()).get();
                                    if (squadPlayerDoc.exists && squadPlayerDoc.data().team_id === player.team_id) {
                                        hasClubPlayer = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (hasClubPlayer) continue;
                        }
                    }
                }
                
                // Place the auto-bid
                await this.placeAutoBid(auction.id, teamId, nextBid);
                console.log(`Auto-bid placed: Team ${teamId} bid ${nextBid} on player ${auction.player_id}`);
                
                // Only process one bid per cycle to be fair
                break;
            }
        } catch (error) {
            console.error('Error processing auto-bids:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async calculateMaxAllowedBid(teamId, currentBudget) {
        try {
            // Get team's current squad (including the active draft)
            const draftId = await this.getActiveDraftId();
            const squadSnapshot = await collections.teamSquads
                .where('team_id', '==', teamId)
                .where('draft_id', '==', draftId)
                .get();
            
            // Total slots = 15 players + 2 clubs = 17
            const TOTAL_SLOTS = 17;
            const currentSquadSize = squadSnapshot.size;
            const remainingSlots = TOTAL_SLOTS - currentSquadSize;
            
            console.log(`Team ${teamId}: Squad size ${currentSquadSize}, Remaining slots ${remainingSlots}, Budget ${currentBudget}`);
            
            if (remainingSlots <= 0) {
                // Squad is complete
                return 0;
            }
            
            if (remainingSlots === 1) {
                // Last slot - can use full budget
                return currentBudget;
            }
            
            // Need to reserve minimum 5 for each remaining slot (after this purchase)
            // So if we have 17 remaining slots and are buying 1, we need to reserve for 16
            const slotsToReserveFor = remainingSlots - 1;
            const reserveAmount = slotsToReserveFor * 5;
            const maxBid = currentBudget - reserveAmount;
            
            console.log(`Team ${teamId}: Max allowed bid = ${currentBudget} - (${slotsToReserveFor} * 5) = ${maxBid}`);
            
            return Math.max(0, maxBid);
        } catch (error) {
            console.error('Error calculating max allowed bid:', error);
            // Return conservative estimate if error
            return Math.floor(currentBudget * 0.5);
        }
    }
    
    async getActiveDraftId() {
        try {
            const draftStateDoc = await collections.draftState.doc('current').get();
            if (draftStateDoc.exists) {
                const draftState = draftStateDoc.data();
                if (draftState.is_active && draftState.draft_id) {
                    return draftState.draft_id;
                }
            }
            // Return a default draft ID if no active draft
            return 'default';
        } catch (error) {
            console.error('Error getting active draft ID:', error);
            return 'default';
        }
    }

    async placeAutoBid(auctionId, teamId, bidAmount) {
        try {
            // Update auction
            await collections.auctions.doc(auctionId).update({
                current_bid: bidAmount,
                current_bidder_id: teamId,
                bid_count: admin.firestore.FieldValue.increment(1),
                selling_stage: null,
                wait_requested_by: null,
                wait_requested_at: null
            });
            
            // Record bid history
            await collections.bidHistory.add({
                auction_id: auctionId,
                team_id: teamId,
                bid_amount: bidAmount,
                is_auto_bid: true,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Get team name for broadcast
            const teamQuery = await collections.teams
                .where('id', '==', teamId)
                .limit(1)
                .get();
            
            const teamName = teamQuery.empty ? `Team ${teamId}` : teamQuery.docs[0].data().name;
            
            // Broadcast bid to all clients
            if (this.io) {
                this.io.to('auction-room').emit('new-bid', {
                    auctionId,
                    teamId,
                    teamName,
                    bidAmount,
                    timestamp: new Date().toISOString(),
                    isAutoBid: true
                });
            }
        } catch (error) {
            console.error('Error placing auto-bid:', error);
            throw error;
        }
    }
}

module.exports = AutoBidService;