const express = require('express');
const { collections } = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({ message: 'Teams route is working', timestamp: new Date().toISOString() });
});

// Get all squad items (for tracking sold players/clubs)
router.get('/all-squads', async (req, res) => {
  try {
    const squadSnapshot = await collections.teamSquads.get();
    const squads = squadSnapshot.docs.map(doc => doc.data());
    res.json(squads);
  } catch (error) {
    console.error('Error fetching all squads:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get team squad
router.get('/:teamId/squad', async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    console.log('Getting squad for team:', teamId);
    
    // Get squad for this team
    const squadSnapshot = await collections.teamSquads
      .where('team_id', '==', teamId)
      .get();
    
    console.log('Squad snapshot size:', squadSnapshot.size);
    
    const players = [];
    const clubs = [];
    let totalSpent = 0;
    
    for (const doc of squadSnapshot.docs) {
      const squadItem = doc.data();
      const pricePaid = squadItem.price_paid || 0;
      totalSpent += pricePaid;
      
      if (squadItem.player_id) {
        try {
          // Get player details
          const playerDoc = await collections.fplPlayers.doc(squadItem.player_id.toString()).get();
          if (playerDoc.exists) {
            const player = playerDoc.data();
            players.push({
              ...player,
              price_paid: pricePaid,
              acquired_at: squadItem.acquired_at
            });
          }
        } catch (err) {
          console.error('Error fetching player details:', err);
        }
      } else if (squadItem.club_id) {
        // Handle club purchases if any
        clubs.push({
          ...squadItem,
          price_paid: pricePaid
        });
      }
    }
    
    // Count by position (with safety checks)
    const counts = {
      players: players.length,
      clubs: clubs.length,
      gkp: players.filter(p => p.position === 1).length,
      def: players.filter(p => p.position === 2).length,
      mid: players.filter(p => p.position === 3).length,
      fwd: players.filter(p => p.position === 4).length
    };
    
    // Group by position (with safety checks)
    const positions = {
      1: players.filter(p => p.position === 1),
      2: players.filter(p => p.position === 2),
      3: players.filter(p => p.position === 3),
      4: players.filter(p => p.position === 4)
    };
    
    console.log('Squad response:', { 
      playerCount: players.length, 
      clubCount: clubs.length, 
      totalSpent 
    });
    
    res.json({
      players,
      clubs,
      totalSpent,
      counts,
      positions
    });
  } catch (error) {
    console.error('Error fetching squad for team', req.params.teamId, ':', error.message);
    console.error('Full error:', error);
    res.status(500).json({ error: 'Failed to fetch squad', details: error.message });
  }
});

// Get all teams leaderboard
router.get('/', async (req, res) => {
  try {
    const teamsSnapshot = await collections.teams.get();
    const teams = [];
    
    for (const doc of teamsSnapshot.docs) {
      const team = doc.data();
      
      // Get squad details
      const squadSnapshot = await collections.teamSquads
        .where('team_id', '==', team.id)
        .get();
      
      let playerCount = 0;
      let clubCount = 0;
      let totalSpent = 0;
      
      squadSnapshot.forEach(doc => {
        const item = doc.data();
        if (item.player_id) {
          playerCount++;
        } else if (item.club_id) {
          clubCount++;
        }
        totalSpent += item.price_paid || 0;
      });
      
      teams.push({
        ...team,
        squad_count: squadSnapshot.size,
        player_count: playerCount,
        club_count: clubCount,
        total_spent: totalSpent,
        total_points: 0 // TODO: Calculate from gameweeks
      });
    }
    
    // Sort by team id to maintain consistent order
    teams.sort((a, b) => a.id - b.id);
    
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Get all sold items for recent sales display
router.get('/sold-items', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // Get recent squad additions (sold items) with team and player/club info
    const soldItemsSnapshot = await collections.teamSquads
      .orderBy('acquired_at', 'desc')
      .limit(limit)
      .get();
    
    const soldItems = [];
    
    for (const doc of soldItemsSnapshot.docs) {
      const item = doc.data();
      
      // Get team info
      const teamQuery = await collections.teams
        .where('id', '==', item.team_id)
        .limit(1)
        .get();
      
      const teamName = teamQuery.empty ? 'Unknown Team' : teamQuery.docs[0].data().name;
      
      // Get player or club info
      let itemDetails = {};
      
      if (item.player_id) {
        // It's a player
        const playerDoc = await collections.fplPlayers.doc(item.player_id.toString()).get();
        if (playerDoc.exists) {
          const player = playerDoc.data();
          itemDetails = {
            type: 'player',
            player_name: player.web_name,
            position: player.position,
            team_id: player.team_id
          };
          
          // Get player's club name
          if (player.team_id) {
            const clubDoc = await collections.fplClubs.doc(player.team_id.toString()).get();
            if (clubDoc.exists) {
              itemDetails.club_name = clubDoc.data().name;
            }
          }
        }
      } else if (item.club_id) {
        // It's a club
        const clubDoc = await collections.fplClubs.doc(item.club_id.toString()).get();
        if (clubDoc.exists) {
          const club = clubDoc.data();
          itemDetails = {
            type: 'club',
            club_name: club.name,
            club_short_name: club.short_name
          };
        }
      }
      
      soldItems.push({
        ...item,
        ...itemDetails,
        team_name: teamName,
        acquired_at: item.acquired_at
      });
    }
    
    res.json(soldItems);
  } catch (error) {
    console.error('Error fetching sold items:', error);
    res.status(500).json({ error: 'Failed to fetch sold items' });
  }
});

// Get single team info
router.get('/:teamId', async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    console.log('Getting team info for:', teamId);
    
    // Get team info
    const teamQuery = await collections.teams
      .where('id', '==', teamId)
      .limit(1)
      .get();
    
    if (teamQuery.empty) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const team = teamQuery.docs[0].data();
    res.json(team);
    
  } catch (error) {
    console.error('Error fetching team info:', error);
    res.status(500).json({ error: 'Failed to fetch team info' });
  }
});

// Grant admin access to another team (admin only)
router.post('/:teamId/grant-admin', requireAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    
    // Update team's admin status
    const teamQuery = await collections.teams
      .where('id', '==', teamId)
      .limit(1)
      .get();
    
    if (teamQuery.empty) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const teamDoc = teamQuery.docs[0];
    await teamDoc.ref.update({ is_admin: true });
    
    res.json({ success: true, message: `Team ${teamId} granted admin access` });
    
  } catch (error) {
    console.error('Error granting admin access:', error);
    res.status(500).json({ error: 'Failed to grant admin access' });
  }
});

// Revoke admin access from a team (admin only)
router.post('/:teamId/revoke-admin', requireAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    
    // Don't allow removing admin from team10
    if (teamId === 10) {
      return res.status(403).json({ error: 'Cannot revoke admin from Team10' });
    }
    
    // Update team's admin status
    const teamQuery = await collections.teams
      .where('id', '==', teamId)
      .limit(1)
      .get();
    
    if (teamQuery.empty) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const teamDoc = teamQuery.docs[0];
    await teamDoc.ref.update({ is_admin: false });
    
    res.json({ success: true, message: `Team ${teamId} admin access revoked` });
    
  } catch (error) {
    console.error('Error revoking admin access:', error);
    res.status(500).json({ error: 'Failed to revoke admin access' });
  }
});

module.exports = router;