const path = require('path');
const fs = require('fs');

// ✅ Import from firebaseConfig.js - CORRECTED IMPORT
const { initializeFirebase, admin, getFirebaseStatus } = require('../config/firebaseConfig');

let firebaseInitialized = false;
let initializationError = null;

/**
 * ✅ Ensure Firebase is initialized before any operation
 */
const ensureFirebaseInitialized = () => {
  try {
    if (firebaseInitialized || (admin.apps && admin.apps.length > 0)) {
      console.log('✅ Firebase already initialized (service layer)');
      return true;
    }

    console.log('🔥 Initializing Firebase (service layer)...');
    const result = initializeFirebase();
    if (result) {
      firebaseInitialized = true;
      initializationError = null;
      console.log('✅ Firebase initialized successfully (service layer)');
      return true;
    } else {
      throw new Error('Firebase initialization returned null');
    }
  } catch (error) {
    console.error('❌ Firebase initialization failed in service:', error.message);
    initializationError = error;
    return false;
  }
};


// Add this function if it doesn't exist
const cleanupInvalidFCMTokens = async (driverId, invalidToken) => {
  try {
    console.log(`🧹 CLEANING UP INVALID FCM TOKEN FOR DRIVER: ${driverId}`);
    
    const Driver = require('../models/driver/driver');
    
    const result = await Driver.findOneAndUpdate(
      { driverId: driverId },
      { 
        $unset: { fcmToken: 1 },
        $set: { 
          notificationEnabled: false,
          lastUpdate: new Date()
        }
      },
      { new: true }
    );

    if (result) {
      console.log(`✅ INVALID FCM TOKEN REMOVED FOR DRIVER: ${driverId}`);
      console.log(`🔄 Driver ${driverId} needs to register a new FCM token`);
    } else {
      console.log(`⚠️ Driver ${driverId} not found or token already changed`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error cleaning up invalid FCM token:`, error);
    return null;
  }
};




const sendNotificationToMultipleDrivers = async (driverTokens, title, body, data = {}) => {
  try {
    console.log(`🚀 Starting FCM send to ${driverTokens?.length || 0} drivers`);
    
    // 1. Initialize Firebase
    let messaging;
    try {
      if (!admin.apps || admin.apps.length === 0) {
        console.log('🔥 Initializing Firebase Admin...');
        const serviceAccount = require('../service-account-key.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      }
      messaging = admin.messaging();
      console.log('✅ Firebase Admin ready');
    } catch (initError) {
      console.error('❌ Firebase initialization failed:', initError);
      return {
        success: false,
        successCount: 0,
        failureCount: driverTokens?.length || 0,
        errors: ['Firebase initialization failed']
      };
    }

    // 2. Validate tokens
    if (!driverTokens || !Array.isArray(driverTokens)) {
      console.error('❌ Invalid driverTokens:', driverTokens);
      return {
        success: false,
        successCount: 0,
        failureCount: 0,
        errors: ['Invalid driver tokens array']
      };
    }

    const validTokens = driverTokens.filter(token => {
      return token && typeof token === 'string' && token.length > 10;
    });

    console.log(`📱 Valid tokens: ${validTokens.length}/${driverTokens.length}`);

    if (validTokens.length === 0) {
      console.log('⚠️ No valid FCM tokens to send');
      return {
        success: false,
        successCount: 0,
        failureCount: driverTokens.length,
        errors: ['No valid FCM tokens']
      };
    }

    // 3. Create message - SIMPLIFIED VERSION
    const message = {
      tokens: validTokens,
      notification: {
        title: title || 'New Ride Request',
        body: body || 'You have a new ride request'
      },
      data: {
        type: data.type || 'ride_request',
        rideId: data.rideId || '',
        vehicleType: data.vehicleType || '',
        fare: data.fare || '0',
        ...data
      },
      android: {
        priority: 'high'
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    console.log('📄 Sending FCM message with structure:', {
      tokensCount: message.tokens.length,
      title: message.notification.title,
      dataKeys: Object.keys(message.data)
    });

    // 4. Send the message
    const response = await messaging.sendEachForMulticast(message);

    console.log('📊 FCM Send Results:', {
      successCount: response.successCount,
      failureCount: response.failureCount,
      total: validTokens.length
    });

    // 5. Handle failures
    if (response.failureCount > 0) {
      console.log('⚠️ Some FCM sends failed:');
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`   Token ${idx}:`, resp.error?.message || 'Unknown error');
        }
      });
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: validTokens.length,
      errors: response.responses
        .filter(r => !r.success)
        .map(r => r.error?.message || 'Unknown error')
    };

  } catch (error) {
    console.error('❌ FCM send error:', error.message);
    console.error('❌ Stack trace:', error.stack);
    
    return {
      success: false,
      successCount: 0,
      failureCount: driverTokens?.length || 0,
      errors: [error.message]
    };
  }
};

// In your backend notification service
const sendNotificationToDriver = async (driverId, notificationData) => {
  try {
    // 1. Get driver's FCM token from your database
    const driver = await Driver.findById(driverId);
    if (!driver || !driver.fcmToken) {
      console.log('❌ Driver not found or no FCM token');
      return { success: false, error: 'Driver not found or no FCM token' };
    }



    console.log('📤 Sending FCM message:', JSON.stringify(message, null, 2));

    // 3. Send the message
    const response = await admin.messaging().send(message);
    console.log('✅ Notification sent successfully:', response);
    
    return { 
      success: true, 
      messageId: response,
      driverId: driverId 
    };

  } catch (error) {
    console.error('❌ Error sending notification:', error);
    
    // Handle specific FCM errors
    if (error.code === 'messaging/registration-token-not-registered') {
      // Token is no longer valid, remove it from database
      await Driver.findByIdAndUpdate(driverId, { $unset: { fcmToken: 1 } });
      console.log('🔄 Removed invalid FCM token for driver:', driverId);
    }
    
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

/**
 * 🧪 Test Firebase Connection
 */
const testFirebaseConnection = async () => {
  try {
    const isInitialized = ensureFirebaseInitialized();
    if (!isInitialized) {
      throw new Error('Firebase initialization failed');
    }

    // Test by getting apps list
    const apps = admin.apps;
    return {
      success: true,
      message: 'Firebase connected successfully',
      appsCount: apps ? apps.length : 0,
      status: getFirebaseStatus(),
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      status: getFirebaseStatus()
    };
  }
};

/**
 * ℹ️ Get Firebase Initialization Status
 */
const getFirebaseServiceStatus = () => {
  const serviceAccountPath = path.join(__dirname, '../service-account-key.json');
  return {
    initialized: firebaseInitialized,
    hasServiceAccountFile: fs.existsSync(serviceAccountPath),
    error: initializationError?.message,
    apps: admin.apps?.map((app) => app?.name) || [],
    configStatus: getFirebaseStatus()
  };
};

module.exports = {
  ensureFirebaseInitialized,
  sendNotificationToMultipleDrivers,
  sendNotificationToDriver,
  testFirebaseConnection,
  getFirebaseServiceStatus,
};


// const admin = require('firebase-admin');
// const path = require('path');
// const fs = require('fs');

// let firebaseInitialized = false;
// let initializationError = null;

// const initializeFirebase = () => {
//   try {
//     if (firebaseInitialized) {
//       console.log('✅ Firebase already initialized');
//       return true;
//     }

//     console.log('🔥 Attempting Firebase Admin initialization...');

//     // ✅ FIX: Define serviceAccountPath FIRST
//     const serviceAccountPath = path.join(__dirname, '../service-account-key.json');
//     console.log('📁 Service account path:', serviceAccountPath);

//     if (fs.existsSync(serviceAccountPath)) {
//       console.log('📁 Using service account file');
      
//       try {
//         const serviceAccount = require(serviceAccountPath);
        
//         // Validate service account
//         if (!serviceAccount.private_key || !serviceAccount.project_id || !serviceAccount.client_email) {
//           throw new Error('Invalid service account file: missing required fields');
//         }

//         console.log('📋 Service Account Details:', {
//           project_id: serviceAccount.project_id,
//           client_email: serviceAccount.client_email,
//           private_key_length: serviceAccount.private_key.length
//         });

//         // ✅ FIX: Add better error handling and timeout
//         admin.initializeApp({
//           credential: admin.credential.cert(serviceAccount)
//         });
        
//         console.log('✅ Firebase initialized with service account file');
//         firebaseInitialized = true;
//         initializationError = null;
//         return true;
        
//       } catch (fileError) {
//         console.error('❌ Error loading service account file:', fileError.message);
//         initializationError = fileError;
//         firebaseInitialized = false;
//         return false;
//       }
      
//     } else {
//       console.error('❌ No service account file found at:', serviceAccountPath);
//       initializationError = new Error('Service account file not found');
//       firebaseInitialized = false;
//       return false;
//     }

//   } catch (error) {
//     console.error('❌ Firebase Admin initialization FAILED:', error.message);
//     initializationError = error;
//     firebaseInitialized = false;
//     return false;
//   }
// };

// // Rest of your existing code remains same...
// // Send notification to multiple drivers
// const sendNotificationToMultipleDrivers = async (driverTokens, title, body, data = {}) => {
//   try {
//     // Initialize Firebase if not already done
//     if (!firebaseInitialized) {
//       const initialized = initializeFirebase();
//       if (!initialized) {
//         throw new Error(`Firebase not initialized: ${initializationError?.message}`);
//       }
//     }

//     if (!driverTokens || !Array.isArray(driverTokens) || driverTokens.length === 0) {
//       console.log('❌ No driver tokens provided');
//       return { successCount: 0, failureCount: 0, errors: ['No tokens provided'] };
//     }

//     // Filter valid tokens
//     const validTokens = driverTokens.filter(token => 
//       token && typeof token === 'string' && token.length > 50
//     );

//     if (validTokens.length === 0) {
//       console.log('❌ No valid FCM tokens found');
//       return { successCount: 0, failureCount: 0, errors: ['No valid tokens'] };
//     }

//     console.log(`📤 Sending notification to ${validTokens.length} drivers`);
//     console.log(`📝 Title: ${title}`);
//     console.log(`📝 Body: ${body}`);

//    const message = {
//       tokens: validTokens,
//       notification: {
//         title: title,
//         body: body,
//       },
//       data: {
//         ...data,
//         click_action: 'FLUTTER_NOTIFICATION_CLICK'
//       },
//       android: {
//         priority: 'high',
//         notification: {
//           sound: 'default',
//           priority: 'max',
//          vibrateTimings: ["1s", "0.5s", "1s"],
//           default_light_settings: true,
//           notification_count: 1
//         }
//       },
//       apns: {
//         payload: {
//           aps: {
//             sound: 'default',
//             badge: 1,
//             'content-available': 1
//           }
//         }
//       },
//       webpush: {
//         headers: {
//           Urgency: 'high'
//         }
//       }
//     };
//     console.log('📋 FCM Message prepared');

//     // Send the message
//     const response = await admin.messaging().sendEachForMulticast(message);
    
//     console.log('✅ FCM Response:', {
//       successCount: response.successCount,
//       failureCount: response.failureCount
//     });

//     if (response.failureCount > 0) {
//       response.responses.forEach((resp, idx) => {
//         if (!resp.success) {
//           console.error(`❌ Failed to send to token ${validTokens[idx].substring(0, 10)}...:`, resp.error?.message);
//         }
//       });
//     }

//     return {
//       successCount: response.successCount,
//       failureCount: response.failureCount,
//       errors: response.responses
//         .filter(resp => !resp.success)
//         .map(resp => resp.error?.message || 'Unknown error')
//     };

//   } catch (error) {
//     console.error('❌ Error in sendNotificationToMultipleDrivers:', error);
//     return {
//       successCount: 0,
//       failureCount: driverTokens?.length || 0,
//       errors: [error.message]
//     };
//   }
// };

// // Send notification to a single driver
// const sendNotificationToDriver = async (driverToken, title, body, data = {}) => {
//   try {
//     const result = await sendNotificationToMultipleDrivers([driverToken], title, body, data);
//     return {
//       success: result.successCount > 0,
//       ...result
//     };
//   } catch (error) {
//     console.error('❌ Error in sendNotificationToDriver:', error);
//     return {
//       success: false,
//       error: error.message
//     };
//   }
// };

// // Get Firebase initialization status
// const getFirebaseStatus = () => {
//   const serviceAccountPath = path.join(__dirname, '../service-account-key.json');
//   const hasServiceAccountFile = fs.existsSync(serviceAccountPath);
  
//   return {
//     initialized: firebaseInitialized,
//     error: initializationError?.message,
//     hasServiceAccountFile: hasServiceAccountFile,
//     apps: admin.apps ? admin.apps.map(app => app?.name) : []
//   };
// };

// module.exports = {
//   initializeFirebase,
//   sendNotificationToMultipleDrivers,
//   sendNotificationToDriver,
//   getFirebaseStatus
// };
