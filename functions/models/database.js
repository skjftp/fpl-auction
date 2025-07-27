const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

// Get Firestore instance
const getDatabase = () => admin.firestore();

// Initialize database (create default teams)
async function initializeDatabase() {
  console.log('Initializing Firestore database...');
  // Firestore creates collections automatically
  return true;
}

// Create default teams
async function createDefaultTeams() {
  const db = getDatabase();
  const batch = db.batch();
  
  const defaultTeams = [
    'Wadde Badmash', 'Baba & Nawaab', 'Kesari', 'Finding Timo', 'Khelenge Jigar Se',
    'Yaya Tours Pvt ltd', 'Shiggy FC', 'Analysis Paralysis', 'Dukes', 'Cash down under redux'
  ];
  
  try {
    for (let i = 0; i < defaultTeams.length; i++) {
      const teamName = defaultTeams[i];
      const username = `team${i + 1}`;
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const teamRef = db.collection('teams').doc(username);
      batch.set(teamRef, {
        id: i + 1,
        name: teamName,
        username: username,
        password_hash: hashedPassword,
        budget: 1000,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log('Default teams created successfully');
    return true;
  } catch (error) {
    console.error('Error creating default teams:', error);
    throw error;
  }
}

// Initialize snake draft order
async function initializeDraftOrder() {
  const db = getDatabase();
  
  try {
    // Get all teams
    const teamsSnapshot = await db.collection('teams').get();
    const teams = [];
    teamsSnapshot.forEach(doc => {
      teams.push({ id: doc.id, ...doc.data() });
    });
    
    // Shuffle teams for random order
    const shuffledTeams = teams.sort(() => Math.random() - 0.5);
    
    // Clear existing draft order
    const draftOrderSnapshot = await db.collection('draft_order').get();
    const deletePromises = [];
    draftOrderSnapshot.forEach(doc => {
      deletePromises.push(doc.ref.delete());
    });
    await Promise.all(deletePromises);
    
    // Create new draft order
    const batch = db.batch();
    shuffledTeams.forEach((team, index) => {
      const draftRef = db.collection('draft_order').doc();
      batch.set(draftRef, {
        team_id: team.id,
        team_name: team.name,
        position: index + 1,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    // Initialize draft state
    const draftStateRef = db.collection('draft_state').doc('current');
    batch.set(draftStateRef, {
      current_team_id: shuffledTeams[0].id,
      current_position: 1,
      is_active: false,
      total_teams: shuffledTeams.length,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    console.log('Draft order initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing draft order:', error);
    throw error;
  }
}

// Start the draft
async function startDraft() {
  const db = getDatabase();
  
  try {
    const draftStateRef = db.collection('draft_state').doc('current');
    await draftStateRef.update({
      is_active: true,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Draft started successfully');
    return true;
  } catch (error) {
    console.error('Error starting draft:', error);
    throw error;
  }
}

// Advance to next team in draft
async function advanceDraftTurn() {
  const db = getDatabase();
  
  try {
    // Get current draft state
    const draftStateDoc = await db.collection('draft_state').doc('current').get();
    const state = draftStateDoc.data();
    
    const nextPosition = state.current_position + 1;
    
    if (nextPosition > state.total_teams) {
      // Draft is complete
      await draftStateDoc.ref.update({
        is_active: false,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { hasNext: false, message: 'Draft completed' };
    }
    
    // Get next team
    const nextTeamSnapshot = await db.collection('draft_order')
      .where('position', '==', nextPosition)
      .limit(1)
      .get();
    
    if (nextTeamSnapshot.empty) {
      throw new Error('Next team not found in draft order');
    }
    
    const nextTeam = nextTeamSnapshot.docs[0].data();
    
    // Update draft state
    await draftStateDoc.ref.update({
      current_team_id: nextTeam.team_id,
      current_position: nextPosition,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      hasNext: true,
      currentTeam: nextTeam.team_name,
      currentPosition: nextPosition
    };
  } catch (error) {
    console.error('Error advancing draft turn:', error);
    throw error;
  }
}

module.exports = {
  getDatabase,
  initializeDatabase,
  createDefaultTeams,
  initializeDraftOrder,
  startDraft,
  advanceDraftTurn
};