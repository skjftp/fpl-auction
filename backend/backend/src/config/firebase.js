const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'fpl-auction-2025',
  });
}

const db = admin.firestore();

module.exports = { admin, db };