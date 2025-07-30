const { db } = require('../config/firebase-config');

// Get active draft ID
async function getActiveDraftId() {
  try {
    const draftsCollection = db.collection('drafts');
    const activeDraftSnapshot = await draftsCollection
      .where('is_active', '==', true)
      .limit(1)
      .get();
    
    if (activeDraftSnapshot.empty) {
      // No active draft, create a default one
      const draftRef = draftsCollection.doc();
      await draftRef.set({
        name: 'Default Draft',
        description: 'Automatically created default draft',
        is_active: true,
        created_at: new Date()
      });
      return draftRef.id;
    }
    
    return activeDraftSnapshot.docs[0].id;
  } catch (error) {
    console.error('Error getting active draft:', error);
    throw error;
  }
}

module.exports = {
  getActiveDraftId
};