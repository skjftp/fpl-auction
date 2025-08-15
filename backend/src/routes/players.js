const express = require('express');
const axios = require('axios');
const { collections } = require('../models/database');
const admin = require('firebase-admin');
const { getActiveDraftId } = require('../utils/draft');

const router = express.Router();

// Fetch and store FPL players from API
router.post('/sync-fpl-data', async (req, res) => {
  try {
    console.log('🔄 Syncing FPL data...');
    
    // Fetch data from FPL API
    const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
    const { elements: players, teams: clubs, element_types: positions } = response.data;
    
    // Use batch write for better performance
    const batch = admin.firestore().batch();
    
    // Update or insert clubs
    clubs.forEach(club => {
      const clubRef = collections.fplClubs.doc(club.id.toString());
      batch.set(clubRef, {
        id: club.id,
        name: club.name,
        short_name: club.short_name,
        code: club.code,
        strength: club.strength
      });
    });
    
    // Update or insert ALL players (including unavailable ones)
    players.forEach(player => {
      const playerRef = collections.fplPlayers.doc(player.id.toString());
      batch.set(playerRef, {
        id: player.id,
        web_name: player.web_name,
        first_name: player.first_name,
        second_name: player.second_name,
        position: player.element_type,
        team_id: player.team,
        price: player.now_cost,
        points_per_game: parseFloat(player.points_per_game || 0),
        total_points: player.total_points,
        photo: player.photo,
        status: player.status // Store status for reference
      });
    });
    
    // Commit the batch
    await batch.commit();
    
    // Count available and unavailable players for logging
    const availablePlayers = players.filter(player => player.status !== 'u');
    const unavailablePlayers = players.filter(player => player.status === 'u');
    
    console.log(`✅ Synced ${players.length} total players (${availablePlayers.length} available, ${unavailablePlayers.length} unavailable) and ${clubs.length} clubs`);
    
    res.json({
      success: true,
      message: `Synced ${players.length} total players (${availablePlayers.length} available, ${unavailablePlayers.length} unavailable) and ${clubs.length} clubs`,
      stats: {
        total_players: players.length,
        available_players: availablePlayers.length,
        unavailable_players: unavailablePlayers.length,
        clubs: clubs.length,
        positions: positions.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error syncing FPL data:', error);
    res.status(500).json({ 
      error: 'Failed to sync FPL data',
      details: error.message 
    });
  }
});

// Get all players with filters
router.get('/', async (req, res) => {
  try {
    const { position, team, status, search } = req.query;
    
    // Start with all players
    let playersQuery = collections.fplPlayers;
    
    // Apply filters
    if (position) {
      playersQuery = playersQuery.where('position', '==', parseInt(position));
    }
    
    if (team) {
      playersQuery = playersQuery.where('team_id', '==', parseInt(team));
    }
    
    if (status) {
      playersQuery = playersQuery.where('status', '==', status);
    }
    
    // Get players
    const playersSnapshot = await playersQuery.get();
    const players = [];
    
    // Get all clubs for joining
    const clubsSnapshot = await collections.fplClubs.get();
    const clubsMap = {};
    clubsSnapshot.docs.forEach(doc => {
      const club = doc.data();
      clubsMap[club.id] = club;
    });
    
    // Get active draft ID
    const draftId = await getActiveDraftId();
    
    // Get sold players information for active draft
    const soldPlayersSnapshot = await collections.teamSquads
      .where('draft_id', '==', draftId)
      .get();
    const soldPlayersMap = {};
    
    // Get team names for sold players
    const teamsSnapshot = await collections.teams.get();
    const teamsMap = {};
    teamsSnapshot.docs.forEach(doc => {
      const team = doc.data();
      teamsMap[team.id] = team;
    });
    
    soldPlayersSnapshot.docs.forEach(doc => {
      const soldPlayer = doc.data();
      if (soldPlayer.player_id) { // Only process player entries
        const team = teamsMap[soldPlayer.team_id];
        soldPlayersMap[soldPlayer.player_id] = {
          sold_to_team_id: soldPlayer.team_id,
          sold_to_team_name: team ? team.name : 'Unknown Team',
          price_paid: soldPlayer.price_paid
        };
      }
    });
    
    // Process players and add club info
    playersSnapshot.docs.forEach(doc => {
      const player = doc.data();
      const club = clubsMap[player.team_id] || {};
      
      // Apply search filter if needed
      if (search) {
        const searchLower = search.toLowerCase();
        if (!player.web_name.toLowerCase().includes(searchLower) &&
            !player.first_name.toLowerCase().includes(searchLower) &&
            !player.second_name.toLowerCase().includes(searchLower)) {
          return; // Skip this player
        }
      }
      
      const soldInfo = soldPlayersMap[player.id] || {};
      
      players.push({
        ...player,
        team_name: club.name,
        team_short_name: club.short_name,
        ...soldInfo
      });
    });
    
    // Sort by total points
    players.sort((a, b) => b.total_points - a.total_points);
    
    res.json(players);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get clubs - MUST BE BEFORE /:id route
router.get('/clubs', async (req, res) => {
  try {
    const clubsSnapshot = await collections.fplClubs
      .orderBy('strength', 'desc')
      .get();
    
    // Get active draft ID
    const draftId = await getActiveDraftId();
    
    // Get sold clubs information for active draft
    const soldClubsSnapshot = await collections.teamSquads
      .where('draft_id', '==', draftId)
      .get();
    
    const soldClubsMap = {};
    
    // Get team names for sold clubs
    const teamsSnapshot = await collections.teams.get();
    const teamsMap = {};
    teamsSnapshot.docs.forEach(doc => {
      const team = doc.data();
      teamsMap[team.id] = team;
    });
    
    soldClubsSnapshot.docs.forEach(doc => {
      const soldClub = doc.data();
      if (soldClub.club_id) { // Only process club entries
        const team = teamsMap[soldClub.team_id];
        soldClubsMap[soldClub.club_id] = {
          sold_to_team_id: soldClub.team_id,
          sold_to_team_name: team ? team.name : 'Unknown Team',
          price_paid: soldClub.price_paid
        };
      }
    });
    
    const clubs = [];
    clubsSnapshot.docs.forEach(doc => {
      const club = doc.data();
      const soldInfo = soldClubsMap[club.id] || {};
      clubs.push({
        ...club,
        ...soldInfo
      });
    });
    
    res.json(clubs);
  } catch (error) {
    console.error('Error fetching clubs:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get position types - MUST BE BEFORE /:id route
router.get('/positions', (req, res) => {
  const positions = [
    { id: 1, name: 'Goalkeeper', short_name: 'GKP', max_count: 2 },
    { id: 2, name: 'Defender', short_name: 'DEF', max_count: 5 },
    { id: 3, name: 'Midfielder', short_name: 'MID', max_count: 5 },
    { id: 4, name: 'Forward', short_name: 'FWD', max_count: 3 }
  ];
  
  res.json(positions);
});

// Get single player by ID - MUST BE LAST (after all specific routes)
router.get('/:id', async (req, res) => {
  try {
    const playerId = req.params.id;
    const playerDoc = await collections.fplPlayers.doc(playerId.toString()).get();
    
    if (!playerDoc.exists) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const player = playerDoc.data();
    
    // Get club info
    if (player.team_id) {
      const clubDoc = await collections.fplClubs.doc(player.team_id.toString()).get();
      if (clubDoc.exists) {
        const club = clubDoc.data();
        player.team_name = club.name;
        player.team_short_name = club.short_name;
      }
    }
    
    res.json(player);
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

module.exports = router;