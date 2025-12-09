// ✅ firebaseConfig.js
// Handles both local (service-account-key.json) & production (.env)

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let firebaseInitialized = false;

// ✅ Initialize Firebase Admin SDK
function initializeFirebase() {
  try {
    if (firebaseInitialized || admin.apps.length > 0) {
      console.log('✅ Firebase already initialized (config layer)');
      firebaseInitialized = true;
      return admin;
    }

    const serviceAccountPath = path.join(__dirname, '../service-account-key.json');
    const hasLocalFile = fs.existsSync(serviceAccountPath);

    if (hasLocalFile) {
      console.log('📁 Using local service-account-key.json for Firebase');
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('🌍 Using .env variables for Firebase (Render Production)');
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    } else {
      throw new Error('No Firebase credentials found');
    }

    firebaseInitialized = true;
    console.log('✅ Firebase initialized successfully');
    return admin;

  } catch (error) {
    console.error('❌ Firebase initialization failed in config file:', error.message);
    return null;
  }
}

// ✅ Firebase status
function getFirebaseStatus() {
  return {
    initialized: firebaseInitialized,
    appsCount: admin.apps.length,
    method: process.env.FIREBASE_PROJECT_ID ? 'environment-variables' : 'service-account-file'
  };
}

// ✅ Exported properly
module.exports = {
  initializeFirebase,
  admin, // ✅ சரியான export name
  getFirebaseStatus,
};