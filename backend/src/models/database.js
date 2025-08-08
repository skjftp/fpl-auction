const { db } = require('../config/firebase-config');
const bcrypt = require('bcryptjs');
const { getActiveDraftId } = require('../utils/draft');

// Initialize collections
const collections = {
  teams: db.collection('teams'),
  fplPlayers: db.collection('fpl_players'),
  fplClubs: db.collection('fpl_clubs'),
  teamSquads: db.collection('team_squads'),
  auctions: db.collection('auctions'),
  bidHistory: db.collection('bid_history'),
  gameweeks: db.collection('gameweeks'),
  gameweekScores: db.collection('gameweek_scores'),
  draftOrder: db.collection('draft_order'),
  draftState: db.collection('draft_state'),
  chatMessages: db.collection('chat_messages'),
  autoBidConfigs: db.collection('auto_bid_configs'),
  drafts: db.collection('drafts')  // New collection for managing multiple drafts
};

async function initializeDatabase() {
  console.log('Firestore database initialized');
  return Promise.resolve();
}

async function createDefaultTeams() {
  const defaultTeams = [
    'Wadde Badmash', 'Baba & Nawaab', 'Kesari', 'Finding Timo', 'Khelenge Jigar Se',
    'Yaya Tours Pvt ltd', 'Shiggy FC', 'Analysis Paralysis', 'Dukes', 'Cash down under redux'
  ];

  const batch = db.batch();
  
  for (let i = 0; i < defaultTeams.length; i++) {
    const username = `team${i + 1}`;
    const passwordHash = await bcrypt.hash('password123', 10);
    
    const teamRef = collections.teams.doc(username);
    batch.set(teamRef, {
      id: i + 1,
      name: defaultTeams[i],
      username: username,
      password_hash: passwordHash,
      budget: 1000,
      is_admin: (i + 1) === 10, // Team10 is super admin
      created_at: new Date().toISOString()
    });
  }
  
  await batch.commit();
  console.log('Default teams created');
}

async function initializeDraftOrder() {
  // Clear existing draft order
  const existingOrder = await collections.draftOrder.get();
  const deleteBatch = db.batch();
  existingOrder.forEach(doc => deleteBatch.delete(doc.ref));
  await deleteBatch.commit();

  // Get all teams
  const teamsSnapshot = await collections.teams.get();
  const teams = [];
  teamsSnapshot.forEach(doc => {
    teams.push({ id: doc.data().id, ...doc.data() });
  });

  // Shuffle teams for random order
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }

  // Create snake draft order for 22 rounds
  const draftOrder = [];
  const totalRounds = 22;
  let position = 1;
  
  for (let round = 1; round <= totalRounds; round++) {
    const isForward = round % 2 === 1; // Odd rounds go forward (1-10), even rounds go reverse (10-1)
    const roundTeams = isForward ? teams : [...teams].reverse();
    
    roundTeams.forEach((team, index) => {
      draftOrder.push({
        position: position++,
        team_id: team.id,
        round: round,
        is_forward: isForward,
        round_position: index + 1
      });
    });
  }

  // Save draft order
  const batch = db.batch();
  draftOrder.forEach((order, index) => {
    const docRef = collections.draftOrder.doc(`position_${index + 1}`);
    batch.set(docRef, order);
  });
  await batch.commit();

  // Initialize draft state
  await collections.draftState.doc('current').set({
    is_active: false,
    current_position: 1,
    current_team_id: draftOrder[0].team_id,
    total_positions: draftOrder.length,
    created_at: new Date().toISOString()
  });

  console.log('Draft order initialized');
}

async function startDraft() {
  await collections.draftState.doc('current').update({
    is_active: true,
    started_at: new Date().toISOString()
  });
}

// Check if a team has completed their squad (15 players + 2 clubs)
async function isTeamCompleted(teamId) {
  const draftId = await getActiveDraftId();
  const squadSnapshot = await collections.teamSquads
    .where('team_id', '==', teamId)
    .where('draft_id', '==', draftId)
    .get();
  
  let playerCount = 0;
  let clubCount = 0;
  
  squadSnapshot.forEach(doc => {
    const item = doc.data();
    if (item.player_id) playerCount++;
    if (item.club_id) clubCount++;
  });
  
  return playerCount >= 15 && clubCount >= 2;
}

// Get team's current squad composition
async function getTeamSquadStats(teamId) {
  const draftId = await getActiveDraftId();
  const squadSnapshot = await collections.teamSquads
    .where('team_id', '==', teamId)
    .where('draft_id', '==', draftId)
    .get();
  
  const stats = {
    players: { total: 0, byPosition: { 1: 0, 2: 0, 3: 0, 4: 0 }, byClub: {} },
    clubs: { total: 0 }
  };
  
  for (const doc of squadSnapshot.docs) {
    const item = doc.data();
    
    if (item.player_id) {
      stats.players.total++;
      
      // Get player details to check position and club
      const playerDoc = await collections.fplPlayers.doc(item.player_id.toString()).get();
      if (playerDoc.exists) {
        const player = playerDoc.data();
        stats.players.byPosition[player.position] = (stats.players.byPosition[player.position] || 0) + 1;
        stats.players.byClub[player.team_id] = (stats.players.byClub[player.team_id] || 0) + 1;
      }
    }
    
    if (item.club_id) {
      stats.clubs.total++;
    }
  }
  
  return stats;
}

// Check if team can acquire a player based on position and club limits
async function canTeamAcquirePlayer(teamId, playerId) {
  const stats = await getTeamSquadStats(teamId);
  
  // Get player details
  const playerDoc = await collections.fplPlayers.doc(playerId.toString()).get();
  if (!playerDoc.exists) {
    return { canAcquire: false, reason: 'Player not found' };
  }
  
  const player = playerDoc.data();
  const position = player.position;
  const clubId = player.team_id;
  
  // Position limits: GKP(1)=2, DEF(2)=5, MID(3)=5, FWD(4)=3
  const positionLimits = { 1: 2, 2: 5, 3: 5, 4: 3 };
  const positionNames = { 1: 'Goalkeeper', 2: 'Defender', 3: 'Midfielder', 4: 'Forward' };
  
  if (stats.players.byPosition[position] >= positionLimits[position]) {
    return { 
      canAcquire: false, 
      reason: `Team already has maximum ${positionNames[position]}s (${positionLimits[position]})` 
    };
  }
  
  // Club limit: max 3 players per club
  if (stats.players.byClub[clubId] >= 3) {
    return { 
      canAcquire: false, 
      reason: 'Team already has 3 players from this club' 
    };
  }
  
  return { canAcquire: true };
}

async function advanceDraftTurn() {
  const stateDoc = await collections.draftState.doc('current').get();
  const currentState = stateDoc.data();
  
  if (!currentState || !currentState.is_active) {
    return { error: 'Draft is not active' };
  }

  let nextPosition = currentState.current_position + 1;
  let attempts = 0;
  const maxAttempts = currentState.total_positions;
  
  // Keep advancing until we find a non-completed team or reach the end
  while (attempts < maxAttempts) {
    if (nextPosition > currentState.total_positions) {
      await collections.draftState.doc('current').update({
        is_active: false,
        ended_at: new Date().toISOString()
      });
      return { completed: true };
    }

    // Get next team from draft order
    const nextOrderDoc = await collections.draftOrder
      .where('position', '==', nextPosition)
      .limit(1)
      .get();
    
    if (nextOrderDoc.empty) {
      nextPosition++;
      attempts++;
      continue;
    }

    const nextOrder = nextOrderDoc.docs[0].data();
    
    // Check if this team is completed (frozen)
    const isCompleted = await isTeamCompleted(nextOrder.team_id);
    
    if (!isCompleted) {
      // Found an active team
      await collections.draftState.doc('current').update({
        current_position: nextPosition,
        current_team_id: nextOrder.team_id
      });

      return {
        hasNext: true,
        currentPosition: nextPosition,
        currentTeam: nextOrder.team_id
      };
    }
    
    // This team is completed, skip to next position
    nextPosition++;
    attempts++;
  }
  
  // If we get here, all teams are completed
  await collections.draftState.doc('current').update({
    is_active: false,
    ended_at: new Date().toISOString()
  });
  return { completed: true };
}

// Convert SQLite-style functions to Firestore
function runAsync(query, params) {
  // This is a compatibility layer - actual implementation would depend on the query
  console.warn('runAsync called with SQLite query - needs conversion to Firestore');
  return Promise.resolve();
}

function allAsync(query, params) {
  // This is a compatibility layer - actual implementation would depend on the query
  console.warn('allAsync called with SQLite query - needs conversion to Firestore');
  return Promise.resolve([]);
}

function getAsync(query, params) {
  // This is a compatibility layer - actual implementation would depend on the query
  console.warn('getAsync called with SQLite query - needs conversion to Firestore');
  return Promise.resolve(null);
}

function getDatabase() {
  // Return Firestore instance for compatibility
  return {
    run: (query, params, callback) => {
      runAsync(query, params).then(() => callback?.(null)).catch(callback);
    },
    all: (query, params, callback) => {
      allAsync(query, params).then(rows => callback?.(null, rows)).catch(callback);
    },
    get: (query, params, callback) => {
      getAsync(query, params).then(row => callback?.(null, row)).catch(callback);
    }
  };
}

module.exports = {
  collections,
  getDatabase,
  initializeDatabase,
  createDefaultTeams,
  initializeDraftOrder,
  startDraft,
  advanceDraftTurn,
  isTeamCompleted,
  getTeamSquadStats,
  canTeamAcquirePlayer,
  runAsync,
  allAsync,
  getAsync,
  db
};