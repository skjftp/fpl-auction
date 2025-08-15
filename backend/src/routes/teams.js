const express = require('express');
const { collections } = require('../models/database');
const { requireAdmin } = require('../middleware/auth');
const { getActiveDraftId } = require('../utils/draft');
const axios = require('axios');

const router = express.Router();

// Cache for fixtures and team names
let fixturesCache = null;
let teamNamesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Function to get current gameweek fixtures
async function getCurrentGameweekFixtures() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (fixturesCache && teamNamesCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
    return { fixtures: fixturesCache, teams: teamNamesCache };
  }

  try {
    // First get current or next gameweek
    const bootstrapResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
    const currentEvent = bootstrapResponse.data.events.find(event => event.is_current);
    const nextEvent = bootstrapResponse.data.events.find(event => event.is_next);
    const activeGameweek = currentEvent || nextEvent;
    
    if (!activeGameweek) {
      console.log('No active gameweek found');
      return { fixtures: [], teams: {} };
    }

    console.log(`Fetching fixtures for gameweek ${activeGameweek.id} (${currentEvent ? 'current' : 'next'})`);
    
    // Get fixtures for the active gameweek
    const fixturesResponse = await axios.get(`https://fantasy.premierleague.com/api/fixtures/?event=${activeGameweek.id}`);
    
    // Create team names map
    const teams = {};
    bootstrapResponse.data.teams.forEach(team => {
      teams[team.id] = {
        name: team.name,
        short_name: team.short_name
      };
    });

    fixturesCache = fixturesResponse.data;
    teamNamesCache = teams;
    cacheTimestamp = now;
    
    console.log(`Cached ${fixturesCache.length} fixtures for gameweek ${activeGameweek.id}`);
    
    return { fixtures: fixturesCache, teams: teamNamesCache };
  } catch (error) {
    console.error('Error fetching fixtures:', error.message);
    return { fixtures: [], teams: {} };
  }
}

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({ message: 'Teams route is working', timestamp: new Date().toISOString() });
});

// Get all squad items (for tracking sold players/clubs)
router.get('/all-squads', async (req, res) => {
  try {
    const draftId = await getActiveDraftId();
    const squadSnapshot = await collections.teamSquads
      .where('draft_id', '==', draftId)
      .get();
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
    const draftId = await getActiveDraftId();
    console.log('Getting squad for team:', teamId, 'in draft:', draftId);
    
    // Get fixtures for the requested gameweek (default to current/next)
    // If forGameweek query param is provided, use that specific gameweek
    const forGameweek = req.query.forGameweek ? parseInt(req.query.forGameweek) : null;
    let fixtures = [];
    let teams = {};
    
    if (forGameweek) {
      // Fetch fixtures for specific gameweek
      try {
        const bootstrapResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
        const fixturesResponse = await axios.get(`https://fantasy.premierleague.com/api/fixtures/?event=${forGameweek}`);
        
        // Create team names map
        teams = {};
        bootstrapResponse.data.teams.forEach(team => {
          teams[team.id] = {
            name: team.name,
            short_name: team.short_name
          };
        });
        
        fixtures = fixturesResponse.data;
        console.log(`Fetched ${fixtures.length} fixtures for gameweek ${forGameweek}`);
      } catch (error) {
        console.error(`Error fetching fixtures for gameweek ${forGameweek}:`, error.message);
      }
    } else {
      // Use default logic for current/next gameweek
      const result = await getCurrentGameweekFixtures();
      fixtures = result.fixtures;
      teams = result.teams;
    }
    
    // Get squad for this team in active draft
    const squadSnapshot = await collections.teamSquads
      .where('team_id', '==', teamId)
      .where('draft_id', '==', draftId)
      .get();
    
    console.log('Squad snapshot size:', squadSnapshot.size);
    
    // Collect all player and club IDs first
    const playerIds = [];
    const clubIds = [];
    const squadItems = [];
    let totalSpent = 0;
    
    squadSnapshot.docs.forEach(doc => {
      const squadItem = doc.data();
      squadItems.push(squadItem);
      totalSpent += squadItem.price_paid || 0;
      
      if (squadItem.player_id) {
        playerIds.push(squadItem.player_id.toString());
      } else if (squadItem.club_id) {
        clubIds.push(squadItem.club_id.toString());
      }
    });
    
    // Batch fetch all players and clubs
    const playerPromises = playerIds.map(id => 
      collections.fplPlayers.doc(id).get()
    );
    const clubPromises = clubIds.map(id => 
      collections.fplClubs.doc(id).get()
    );
    
    const [playerDocs, clubDocs] = await Promise.all([
      Promise.all(playerPromises),
      Promise.all(clubPromises)
    ]);
    
    // Create maps for quick lookup
    const playerMap = new Map();
    playerDocs.forEach((doc, index) => {
      if (doc.exists) {
        playerMap.set(playerIds[index], doc.data());
      }
    });
    
    const clubMap = new Map();
    clubDocs.forEach((doc, index) => {
      if (doc.exists) {
        clubMap.set(clubIds[index], doc.data());
      }
    });
    
    // Process squad items with the fetched data
    const players = [];
    const clubs = [];
    
    squadItems.forEach(squadItem => {
      if (squadItem.player_id) {
        const player = playerMap.get(squadItem.player_id.toString());
        if (player) {
          // Add fixture info for the player
          const playerTeamId = player.team_id || player.team;
          let opponent = null;
          let isHome = null;
          
          const fixture = fixtures.find(f => 
            f.team_h === playerTeamId || f.team_a === playerTeamId
          );
          
          if (fixture) {
            isHome = fixture.team_h === playerTeamId;
            const opponentId = isHome ? fixture.team_a : fixture.team_h;
            const opponentTeam = teams[opponentId];
            
            opponent = {
              id: opponentId,
              name: opponentTeam?.name || '',
              short_name: opponentTeam?.short_name || '',
              is_home: isHome
            };
          }
          
          players.push({
            ...player,
            price_paid: squadItem.price_paid || 0,
            acquired_at: squadItem.acquired_at,
            fixture: opponent
          });
        }
      } else if (squadItem.club_id) {
        const club = clubMap.get(squadItem.club_id.toString());
        if (club) {
          clubs.push({
            ...club,
            price_paid: squadItem.price_paid || 0,
            acquired_at: squadItem.acquired_at
          });
        }
      }
    })
    
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
    const draftId = await getActiveDraftId();
    
    // Fetch all teams and all squad items in parallel
    const [teamsSnapshot, allSquadsSnapshot] = await Promise.all([
      collections.teams.get(),
      collections.teamSquads.where('draft_id', '==', draftId).get()
    ]);
    
    // Create a map of team squads for quick lookup
    const teamSquadsMap = new Map();
    
    allSquadsSnapshot.forEach(doc => {
      const item = doc.data();
      const teamId = item.team_id;
      
      if (!teamSquadsMap.has(teamId)) {
        teamSquadsMap.set(teamId, {
          items: [],
          playerCount: 0,
          clubCount: 0,
          totalSpent: 0
        });
      }
      
      const teamData = teamSquadsMap.get(teamId);
      teamData.items.push(item);
      
      if (item.player_id) {
        teamData.playerCount++;
      } else if (item.club_id) {
        teamData.clubCount++;
      }
      teamData.totalSpent += item.price_paid || 0;
    });
    
    // Build teams array with squad data
    const teams = teamsSnapshot.docs.map(doc => {
      const team = doc.data();
      const squadData = teamSquadsMap.get(team.id) || {
        items: [],
        playerCount: 0,
        clubCount: 0,
        totalSpent: 0
      };
      
      return {
        ...team,
        squad_count: squadData.items.length,
        player_count: squadData.playerCount,
        club_count: squadData.clubCount,
        total_spent: squadData.totalSpent,
        total_points: 0 // TODO: Calculate from gameweeks
      };
    });
    
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
    let draftId;
    
    try {
      draftId = await getActiveDraftId();
    } catch (draftError) {
      console.error('Error getting active draft ID:', draftError);
      return res.json([]); // Return empty array if no active draft
    }
    
    // Get recent squad additions (sold items) with team and player/club info
    let soldItemsSnapshot;
    try {
      soldItemsSnapshot = await collections.teamSquads
        .where('draft_id', '==', draftId)
        .orderBy('acquired_at', 'desc')
        .limit(limit)
        .get();
    } catch (queryError) {
      console.error('Query error - trying without orderBy:', queryError);
      // Try without orderBy if index doesn't exist
      soldItemsSnapshot = await collections.teamSquads
        .where('draft_id', '==', draftId)
        .limit(limit)
        .get();
    }
    
    const soldItems = [];
    
    // Sort in-memory if orderBy failed
    const docs = soldItemsSnapshot.docs;
    if (docs.length > 0 && !soldItemsSnapshot.query._queryOptions.orderBy) {
      docs.sort((a, b) => {
        const aTime = a.data().acquired_at?.toDate?.() || new Date(0);
        const bTime = b.data().acquired_at?.toDate?.() || new Date(0);
        return bTime - aTime;
      });
    }
    
    for (const doc of docs.slice(0, limit)) {
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