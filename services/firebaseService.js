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


// In firebaseService.js - Add this function
const cleanupInvalidFCMTokens = async (driverId, invalidToken) => {
  try {
    console.log(`🧹 CLEANING UP INVALID FCM TOKEN FOR DRIVER: ${driverId}`);
    
    const Driver = require('../models/driver/driver');
    
    const result = await Driver.findOneAndUpdate(
      { driverId: driverId, fcmToken: invalidToken },
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

// Update the sendNotificationToMultipleDrivers function to use cleanup
const sendNotificationToMultipleDrivers = async (driverTokens, title, body, data = {}) => {
  try {
    console.log('📱 Starting notification process...');
    
    const isInitialized = ensureFirebaseInitialized();
    if (!isInitialized) {
      throw new Error('Firebase not initialized');
    }

    const validTokens = driverTokens.filter((token) => {
      const isValid = token && typeof token === 'string' && token.length > 10;
      if (!isValid) {
        console.log(`❌ Invalid token format: ${token}`);
      }
      return isValid;
    });

    console.log(`✅ Valid tokens: ${validTokens.length}/${driverTokens.length}`);

    if (validTokens.length === 0) {
      return {
        success: false,
        successCount: 0,
        failureCount: 0,
        errors: ['No valid FCM tokens found'],
      };
    }

    const message = {
      tokens: validTokens,
      notification: {
        title: title,
        body: body
      },
      data: {
        ...data,
        type: data.type || 'ride_request',
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'high_priority_channel',
          sound: 'default'
        }
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

    console.log('📤 Sending FCM notifications...');
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log('✅ FCM Response - Success:', response.successCount, 'Failed:', response.failureCount);

    // 🔥 CRITICAL: Clean up invalid tokens automatically
    if (response.failureCount > 0) {
      console.log('🧹 CHECKING FOR INVALID TOKENS TO CLEAN UP...');
      
      for (let i = 0; i < response.responses.length; i++) {
        const resp = response.responses[i];
        if (!resp.success && resp.error) {
          console.log(`❌ Token ${i + 1} failed:`, resp.error.message);
          
          // Remove invalid tokens from database
          if (resp.error.code === 'messaging/registration-token-not-registered') {
            console.log(`🗑️ Token is invalid, scheduling cleanup...`);
            // We need to know which driver this token belongs to
            // This will be handled by the calling function
          }
        }
      }
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: validTokens.length,
      responses: response.responses,
      errors: response.responses
        .filter((r) => !r.success)
        .map((r) => r.error?.message || 'Unknown error'),
    };
  } catch (error) {
    console.error('❌ FCM Error:', error);
    return {
      success: false,
      successCount: 0,
      failureCount: driverTokens?.length || 0,
      errors: [error.message],
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

    // 2. CORRECT FCM message structure
    const message = {
      token: driver.fcmToken,
      notification: {
        title: notificationData.title,
        body: notificationData.body,
      },
      data: {
        // All ride data goes here - ALL VALUES AS STRINGS
        type: 'ride_request',
        rideId: notificationData.data.rideId || '',
        pickup: typeof notificationData.data.pickup === 'string' 
          ? notificationData.data.pickup 
          : JSON.stringify(notificationData.data.pickup),
        drop: typeof notificationData.data.drop === 'string'
          ? notificationData.data.drop
          : JSON.stringify(notificationData.data.drop),
        fare: notificationData.data.fare?.toString() || '0',
        distance: notificationData.data.distance || '0 km',
        userName: notificationData.data.userName || 'Customer',
        userMobile: notificationData.data.userMobile || 'N/A',
        vehicleType: notificationData.data.vehicleType || 'taxi',
        timestamp: new Date().toISOString(),
        priority: 'high',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        sound: 'notification', // Sound in data for custom handling
        channelId: 'high_priority_channel'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'high_priority_channel',
          sound: 'notification',
          defaultSound: true,
          defaultVibrateTimings: true,
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          }
        }
      },
      webpush: {
        headers: {
          Urgency: 'high'
        }
      }
    };

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
