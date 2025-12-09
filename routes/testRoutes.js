const express = require('express');
const router = express.Router();
const { sendNotificationToMultipleDrivers } = require('../services/firebaseService');
const Driver = require('../models/driver/driver');

console.log('🧪 Test Routes loaded');

/**
 * @route GET /api/test
 * @description Simple test to verify routes are working
 */
router.get('/', (req, res) => {
  console.log('🧪 Test route accessed!');
  res.json({
    success: true,
    message: 'Test routes are working!',
    timestamp: new Date().toISOString(),
    availableRoutes: [
      'GET /api/test',
      'GET /api/test/routes',
      'GET /api/test/check-driver',
      'GET /api/test/check-driver-token/:driverId',
      'GET /api/test/debug-driver-token',
      'GET /api/test/drivers',
      'POST /api/test/send-notification',
      'POST /api/test/send-to-specific-driver',
      'GET /api/test/firebase-status',
      'GET /api/test/check-service-account'
    ]
  });
});

/**
 * @route GET /api/test/routes
 * @description List all available routes
 */
router.get('/routes', (req, res) => {
  const app = req.app;
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes
      const methods = Object.keys(middleware.route.methods)
        .filter(method => method !== '_all')
        .map(method => method.toUpperCase());
      
      routes.push({
        path: middleware.route.path,
        methods: methods
      });
    }
  });
  
  console.log('📋 Available routes requested');
  res.json({
    success: true,
    totalRoutes: routes.length,
    routes: routes
  });
});

/**
 * @route GET /api/test/check-driver
 * @description Check driver without ID parameter
 */
router.get('/check-driver', async (req, res) => {
  try {
    console.log('🔍 Checking driver dri123...');
    
    const driver = await Driver.findOne({ driverId: 'dri123' });
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver dri123 not found'
      });
    }
    
    console.log(`✅ Driver found: ${driver.driverId}`);
    console.log(`📱 FCM Token: ${driver.fcmToken ? 'EXISTS' : 'NULL'}`);
    console.log(`📊 Status: ${driver.status}`);
    
    res.json({
      success: true,
      driverId: driver.driverId,
      name: driver.name,
      hasFCMToken: !!driver.fcmToken,
      fcmToken: driver.fcmToken ? `${driver.fcmToken.substring(0, 20)}...` : 'NULL',
      fcmTokenFull: driver.fcmToken || 'NULL', // For debugging
      status: driver.status,
      lastUpdate: driver.lastUpdate,
      location: driver.location,
      platform: driver.platform,
      notificationEnabled: driver.notificationEnabled,
      fullDocument: driver // For debugging
    });
    
  } catch (error) {
    console.error('❌ Error checking driver:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/test/check-driver-token/:driverId
 * @description Check specific driver's FCM token
 */
router.get('/check-driver-token/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    
    console.log(`🔍 Checking token for driver: ${driverId}`);
    
    const driver = await Driver.findOne({ driverId });
    
    if (!driver) {
      console.log(`❌ Driver not found: ${driverId}`);
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    console.log(`✅ Driver found: ${driver.driverId}`);
    console.log(`📱 FCM Token: ${driver.fcmToken ? 'EXISTS' : 'NULL'}`);
    console.log(`📊 Status: ${driver.status}`);
    
    res.json({
      success: true,
      driverId: driver.driverId,
      name: driver.name,
      hasFCMToken: !!driver.fcmToken,
      fcmToken: driver.fcmToken ? `${driver.fcmToken.substring(0, 20)}...` : 'NULL',
      fcmTokenFull: driver.fcmToken || 'NULL', // For debugging
      status: driver.status,
      lastUpdate: driver.lastUpdate,
      location: driver.location,
      platform: driver.platform,
      notificationEnabled: driver.notificationEnabled
    });
    
  } catch (error) {
    console.error('❌ Error checking driver token:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/test/debug-driver-token
 * @description Debug driver's FCM token with full details
 */
router.get('/debug-driver-token', async (req, res) => {
  try {
    console.log('🔍 Debugging driver token...');
    
    const driver = await Driver.findOne({ driverId: 'dri123' });
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver dri123 not found'
      });
    }
    
    // Calculate token age in hours
    const tokenAge = driver.fcmToken && driver.lastUpdate ? 
      Math.floor((Date.now() - new Date(driver.lastUpdate).getTime()) / (1000 * 60 * 60)) : 
      'N/A';
    
    res.json({
      success: true,
      driverId: driver.driverId,
      name: driver.name,
      fcmToken: driver.fcmToken || 'NULL',
      fcmTokenLength: driver.fcmToken ? driver.fcmToken.length : 0,
      fcmTokenPrefix: driver.fcmToken ? driver.fcmToken.substring(0, 10) : 'NULL',
      fcmTokenSuffix: driver.fcmToken ? driver.fcmToken.slice(-10) : 'NULL',
      status: driver.status,
      lastUpdate: driver.lastUpdate,
      platform: driver.platform,
      notificationEnabled: driver.notificationEnabled,
      tokenAge: tokenAge,
      tokenAgeHours: tokenAge,
      lastUpdateFormatted: driver.lastUpdate ? new Date(driver.lastUpdate).toLocaleString() : 'N/A'
    });
    
  } catch (error) {
    console.error('❌ Error debugging driver token:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/test/drivers
 * @description Get all drivers with FCM tokens
 */
router.get('/drivers', async (req, res) => {
  try {
    console.log('📋 Getting all drivers...');
    
    const drivers = await Driver.find({})
      .select('driverId name fcmToken status platform notificationEnabled lastUpdate')
      .sort({ lastUpdate: -1 });

    const driversWithTokens = drivers.filter(d => d.fcmToken);
    const onlineDrivers = drivers.filter(d => d.status === 'Live');
    
    console.log(`📊 Total drivers: ${drivers.length}`);
    console.log(`📱 Drivers with tokens: ${driversWithTokens.length}`);
    console.log(`🟢 Online drivers: ${onlineDrivers.length}`);
    
    res.json({
      success: true,
      totalDrivers: drivers.length,
      driversWithTokens: driversWithTokens.length,
      onlineDrivers: onlineDrivers.length,
      drivers: drivers.map(driver => ({
        driverId: driver.driverId,
        name: driver.name,
        status: driver.status,
        hasFCMToken: !!driver.fcmToken,
        tokenPreview: driver.fcmToken ? `***${driver.fcmToken.slice(-8)}` : 'No token',
        platform: driver.platform,
        notificationEnabled: driver.notificationEnabled,
        lastUpdate: driver.lastUpdate
      }))
    });

  } catch (error) {
    console.error('❌ Error getting drivers:', error);
    res.status(500).json({
      success: false,
      message: "Failed to get drivers",
      error: error.message
    });
  }
});



// In /routes/testRoutes.js - Add this route
router.post('/create-test-driver', async (req, res) => {
  try {
    const Driver = require('../models/driver/driver');
    const bcrypt = require('bcryptjs');
    
    // Check if driver already exists
    const existingDriver = await Driver.findOne({ driverId: 'dri123' });
    if (existingDriver) {
      return res.json({
        success: true,
        message: 'Driver already exists',
        driver: existingDriver
      });
    }

    // Create test driver
    const passwordHash = await bcrypt.hash('password123', 12);
    
    const testDriver = new Driver({
      driverId: 'dri123',
      name: 'Test Driver',
      phone: '9876543210',
      passwordHash: passwordHash,
      vehicleType: 'taxi',
      status: 'Live',
      location: {
        type: 'Point',
        coordinates: [77.716728, 11.331288] // [longitude, latitude]
      },
      fcmToken: null,
      platform: 'android',
      notificationEnabled: true
    });

    await testDriver.save();
    
    console.log('✅ Test driver created successfully:', testDriver);
    
    res.json({
      success: true,
      message: 'Test driver created successfully',
      driver: {
        driverId: testDriver.driverId,
        name: testDriver.name,
        status: testDriver.status,
        location: testDriver.location
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating test driver:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// In testRoutes.js - Add these new routes

// Test FCM token directly
router.post('/test-fcm-direct', async (req, res) => {
  try {
    const { driverId, fcmToken } = req.body;
    
    console.log('🧪 DIRECT FCM TEST:', { driverId, tokenLength: fcmToken?.length });
    
    if (!driverId || !fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'driverId and fcmToken are required'
      });
    }

    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: `Driver ${driverId} not found`
      });
    }

    console.log(`📱 Current FCM token in DB: ${driver.fcmToken ? 'EXISTS' : 'NULL'}`);
    
    // Test notification with provided token
    const testData = {
      type: "test_direct",
      message: "DIRECT FCM TEST",
      timestamp: new Date().toISOString(),
      test: "true"
    };
    
    const result = await sendNotificationToMultipleDrivers(
      [fcmToken],
      "🧪 DIRECT FCM TEST",
      "This is a direct FCM test",
      testData
    );
    
    res.json({
      success: true,
      message: `Direct FCM test completed`,
      driverId: driverId,
      currentTokenInDB: driver.fcmToken ? `${driver.fcmToken.substring(0, 15)}...` : 'NULL',
      testTokenUsed: `${fcmToken.substring(0, 15)}...`,
      result: result
    });
    
  } catch (error) {
    console.error('❌ Direct FCM test error:', error);
    res.status(500).json({
      success: false,
      message: 'Direct FCM test failed',
      error: error.message
    });
  }
});

// Get detailed driver FCM info
router.get('/driver-fcm-details/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    
    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    res.json({
      success: true,
      driverId: driver.driverId,
      name: driver.name,
      fcmToken: driver.fcmToken || 'NULL',
      fcmTokenLength: driver.fcmToken ? driver.fcmToken.length : 0,
      fcmTokenPreview: driver.fcmToken ? `${driver.fcmToken.substring(0, 10)}...${driver.fcmToken.slice(-10)}` : 'NULL',
      platform: driver.platform,
      status: driver.status,
      lastUpdate: driver.lastUpdate,
      notificationEnabled: driver.notificationEnabled
    });
    
  } catch (error) {
    console.error('❌ Error getting driver FCM details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// Add this debug function to your app
const checkFirebaseConfig = async () => {
  try {
    console.log('🔍 Checking Firebase configuration...');
    
    // Check if Firebase is available
    console.log('📱 Firebase available:', !!messaging);
    
    // Get current FCM token
    const token = await messaging().getToken();
    console.log('🔑 Current FCM Token:', token);
    console.log('📏 Token Length:', token.length);
    
    // Check if authorized
    const authStatus = await messaging().hasPermission();
    console.log('🔐 Notification Permission:', authStatus);
    
    // Request permission if not granted
    if (authStatus === messaging.AuthorizationStatus.NOT_DETERMINED) {
      const newStatus = await messaging().requestPermission();
      console.log('🔐 New Permission Status:', newStatus);
    }
    
    // Test token with Firebase
    console.log('🧪 Testing FCM token validity...');
    
  } catch (error) {
    console.error('❌ Firebase config check error:', error);
  }
};


// In testRoutes.js - Update the send-notification endpoint
router.post('/send-notification', async (req, res) => {
  try {
    const { 
      driverId, 
      title = "🚖 Test Ride Request", 
      body = "Test notification from Thunder Client",
      pickup = "Test Location, Erode",
      drop = "Test Destination, Erode",
      fare = 100,
      distance = "5 km"
    } = req.body;

    console.log('🧪 Thunder Client Test Notification Request:', req.body);

    // Get driver FCM tokens
    let driverTokens = [];
    let targetDriver = null;
    
    if (driverId) {
      // Send to specific driver
      const driver = await Driver.findOne({ driverId });
      if (driver && driver.fcmToken) {
        driverTokens = [driver.fcmToken];
        targetDriver = driver;
        console.log(`✅ Found driver: ${driverId}, Token: ${driver.fcmToken.substring(0, 20)}...`);
      } else {
        console.log(`❌ Driver ${driverId} not found or no FCM token`);
      }
    } else {
      // Send to all drivers
      const allDrivers = await Driver.find({ 
        fcmToken: { $exists: true, $ne: null } 
      });
      driverTokens = allDrivers.map(driver => driver.fcmToken).filter(token => token);
      console.log(`📱 Sending to all ${driverTokens.length} drivers`);
    }

    if (driverTokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No drivers with FCM tokens found"
      });
    }

    // Test notification data
    const testData = {
      type: "ride_request",
      rideId: "TEST_" + Date.now(),
      pickup: JSON.stringify({
        address: pickup,
        lat: 11.3410,
        lng: 77.7172
      }),
      drop: JSON.stringify({
        address: drop,
        lat: 11.3510,
        lng: 77.7272
      }),
      fare: fare.toString(),
      distance: distance,
      vehicleType: "taxi",
      userName: "Test Customer",
      userMobile: "9876543210",
      timestamp: new Date().toISOString(),
      priority: "high",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      test: "true"
    };

    console.log('📤 Sending test notification with data:', testData);

    // Send notification
    const result = await sendNotificationToMultipleDrivers(
      driverTokens,
      title,
      body,
      testData
    );

    console.log('📊 Test Notification Result:', result);

    // 🔥 AUTOMATIC CLEANUP: Remove invalid tokens
    if (targetDriver && result.failureCount > 0) {
      const invalidToken = targetDriver.fcmToken;
      console.log(`🧹 Attempting to clean up invalid token for driver: ${targetDriver.driverId}`);
      await cleanupInvalidFCMTokens(targetDriver.driverId, invalidToken);
    }

    res.json({
      success: true,
      message: `Test notification sent: ${result.successCount} success, ${result.failureCount} failed`,
      result: result,
      sentTo: driverTokens.length,
      data: testData,
      cleanupPerformed: targetDriver ? true : false
    });

  } catch (error) {
    console.error('❌ Error in test notification:', error);
    res.status(500).json({
      success: false,
      message: "Failed to send test notification",
      error: error.message
    });
  }
});



// Clean up invalid FCM token
router.post('/cleanup-invalid-token', async (req, res) => {
  try {
    const { driverId } = req.body;
    
    console.log(`🧹 MANUAL CLEANUP REQUEST FOR DRIVER: ${driverId}`);
    
    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    console.log(`📱 Current FCM token: ${driver.fcmToken ? 'EXISTS' : 'NULL'}`);
    
    // Remove the FCM token
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
    
    console.log(`✅ FCM TOKEN CLEANED UP FOR DRIVER: ${driverId}`);
    
    res.json({
      success: true,
      message: 'Invalid FCM token cleaned up successfully',
      driver: {
        driverId: result.driverId,
        name: result.name,
        fcmToken: result.fcmToken || 'NULL',
        notificationEnabled: result.notificationEnabled
      }
    });
    
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



/**
 * @route POST /api/test/send-to-specific-driver
 * @description Send to specific driver by driverId
 */
router.post('/send-to-specific-driver', async (req, res) => {
  try {
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "driverId is required"
      });
    }

    console.log(`🧪 Sending test notification to driver: ${driverId}`);

    const driver = await Driver.findOne({ driverId });
    if (!driver || !driver.fcmToken) {
      return res.status(404).json({
        success: false,
        message: `Driver ${driverId} not found or no FCM token`
      });
    }

    const testData = {
      type: "ride_request",
      rideId: "TEST_" + Date.now(),
      pickup: JSON.stringify({
        address: "Thunder Client Test Location",
        lat: 11.3410,
        lng: 77.7172
      }),
      drop: JSON.stringify({
        address: "Thunder Client Test Destination", 
        lat: 11.3510,
        lng: 77.7272
      }),
      fare: "150",
      distance: "7 km",
      vehicleType: "taxi",
      userName: "Thunder Client User",
      userMobile: "9876543210",
      timestamp: new Date().toISOString(),
      priority: "high",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      test: "true",
      source: "thunder_client"
    };

    const result = await sendNotificationToMultipleDrivers(
      [driver.fcmToken],
      "🚖 Thunder Client Test Ride",
      "This is a test notification from Thunder Client API",
      testData
    );

    res.json({
      success: true,
      message: `Test notification sent to driver ${driverId}`,
      driverId: driverId,
      driverName: driver.name,
      tokenPreview: driver.fcmToken.substring(0, 20) + '...',
      result: result,
      data: testData
    });

  } catch (error) {
    console.error('❌ Error sending to specific driver:', error);
    res.status(500).json({
      success: false,
      message: "Failed to send test notification",
      error: error.message
    });
  }
});

/**
 * @route GET /api/test/check-service-account
 * @description Check service account file
 */
router.get('/check-service-account', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const serviceAccountPath = path.join(__dirname, '../service-account-key.json');
    const fileExists = fs.existsSync(serviceAccountPath);
    
    let fileInfo = {};
    if (fileExists) {
      const serviceAccount = require(serviceAccountPath);
      fileInfo = {
        exists: true,
        project_id: serviceAccount.project_id,
        client_email: serviceAccount.client_email,
        private_key_length: serviceAccount.private_key ? serviceAccount.private_key.length : 0,
        file_size: fs.statSync(serviceAccountPath).size + ' bytes',
        path: serviceAccountPath
      };
    } else {
      fileInfo = { 
        exists: false,
        path: serviceAccountPath
      };
    }
    
    res.json({
      success: true,
      serviceAccount: fileInfo
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// Add this to your testRoutes.js or create a new route

router.post('/test-fcm-immediate', async (req, res) => {
  try {
    const { driverId } = req.body;
    
    console.log('🧪 IMMEDIATE FCM TEST for driver:', driverId);
    
    // Get driver with FCM token
    const driver = await Driver.findOne({ driverId });
    if (!driver || !driver.fcmToken) {
      return res.status(404).json({
        success: false,
        message: `Driver ${driverId} not found or no FCM token`
      });
    }
    
    console.log(`📱 Driver FCM token: ${driver.fcmToken.substring(0, 20)}...`);
    
    const testData = {
      type: "test_immediate",
      message: "IMMEDIATE TEST - Ride Request",
      timestamp: new Date().toISOString(),
      test: "true"
    };
    
    const result = await sendNotificationToMultipleDrivers(
      [driver.fcmToken],
      "🚖 IMMEDIATE TEST - Ride Request",
      "This is an immediate test notification with sound",
      testData
    );
    
    res.json({
      success: true,
      message: `Immediate FCM test completed`,
      driverId: driverId,
      driverName: driver.name,
      fcmToken: `${driver.fcmToken.substring(0, 15)}...`,
      result: result
    });
    
  } catch (error) {
    console.error('❌ Immediate FCM test error:', error);
    res.status(500).json({
      success: false,
      message: 'Immediate FCM test failed',
      error: error.message
    });
  }
});



/**
 * @route GET /api/test/firebase-status
 * @description Check Firebase Admin SDK status
 */
router.get('/firebase-status', async (req, res) => {
  try {
    const admin = require('firebase-admin');
    
    let status = {
      initialized: false,
      apps: [],
      error: null
    };

    try {
      // Check if Firebase is initialized
      const apps = admin.apps;
      status.apps = apps ? apps.map(app => app?.name || 'unknown') : [];
      status.initialized = apps && apps.length > 0;
      
      if (status.initialized) {
        // Test Firebase functionality
        const app = admin.app();
        status.appName = app.name;
        status.projectId = app.options?.credential?.projectId || 'Unknown';
        
        res.json({
          success: true,
          message: '✅ Firebase Admin is working correctly',
          status: status
        });
      } else {
        res.status(500).json({
          success: false,
          message: '❌ Firebase Admin is NOT initialized',
          status: status
        });
      }
    } catch (firebaseError) {
      status.error = firebaseError.message;
      res.status(500).json({
        success: false,
        message: '❌ Firebase Admin initialization failed',
        status: status,
        error: firebaseError.message
      });
    }

  } catch (error) {
    console.error('❌ Error checking Firebase status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check Firebase status',
      error: error.message
    });
  }
});

module.exports = router;
