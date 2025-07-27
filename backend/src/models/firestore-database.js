const { db } = require('../config/firebase-config');
const bcrypt = require('bcryptjs');

// Initialize collections
const collections = {
  teams: db.collection('teams'),
  fplPlayers: db.collection('fpl_players'),
  teamSquads: db.collection('team_squads'),
  auctions: db.collection('auctions'),
  gameweeks: db.collection('gameweeks'),
  draftOrder: db.collection('draft_order'),
  draftState: db.collection('draft_state'),
  chatMessages: db.collection('chat_messages')
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

  // Create snake draft order
  const draftOrder = [];
  
  // Forward pass
  teams.forEach((team, index) => {
    draftOrder.push({
      position: index + 1,
      team_id: team.id,
      round: 1,
      is_forward: true
    });
  });
  
  // Reverse pass
  teams.reverse().forEach((team, index) => {
    draftOrder.push({
      position: teams.length + index + 1,
      team_id: team.id,
      round: 2,
      is_forward: false
    });
  });

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

async function advanceDraftTurn() {
  const stateDoc = await collections.draftState.doc('current').get();
  const currentState = stateDoc.data();
  
  if (!currentState || !currentState.is_active) {
    return { error: 'Draft is not active' };
  }

  const nextPosition = currentState.current_position + 1;
  
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
    return { error: 'Invalid draft position' };
  }

  const nextOrder = nextOrderDoc.docs[0].data();
  
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
  getDatabase,
  initializeDatabase,
  createDefaultTeams,
  initializeDraftOrder,
  startDraft,
  advanceDraftTurn,
  runAsync,
  allAsync,
  getAsync,
  collections,
  db
};