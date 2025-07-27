// Database wrapper to switch between SQLite and Firestore
const useFirestore = process.env.USE_FIRESTORE === 'true';

// Import the appropriate database module
const database = useFirestore 
  ? require('./firestore-database')
  : require('./database');

// Export all functions
module.exports = database;