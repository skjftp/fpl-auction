const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// In production (Cloud Run), this will use Application Default Credentials
// In development, you can use a service account key file

function initializeFirebase() {
  if (!admin.apps.length) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use service account key file if provided
      const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || 'fpl-auction-2025'
      });
    } else {
      // Use Application Default Credentials (for Cloud Run)
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'fpl-auction-2025'
      });
    }
  }
  
  return admin.firestore();
}

const db = initializeFirebase();

module.exports = { admin, db };