const express = require("express");
const router = express.Router();
const driverController = require("../controllers/driver/driverController");
const { authMiddleware } = require("../middleware/authMiddleware");
const Driver = require("../models/driver/driver");
const bcrypt = require("bcryptjs");
const multer = require('multer');

// Configure multer to handle FormData (without saving files)
const upload = multer();

// =============================
//     PUBLIC ROUTES
// =============================

// Login
router.post("/login", (req, res) => {
  driverController.loginDriver(req, res);
});

// Change password
router.post("/change-password", (req, res) => {
  driverController.changePassword(req, res);
});

// Create a test driver
router.post("/create-test-driver", (req, res) => {
  driverController.createDriver(req, res);
});



// In driverRoutes.js - Add this endpoint
router.post("/accept-ride", async (req, res) => {
  try {
    const { driverId, rideId, vehicleType } = req.body;
    console.log(`✅ DRIVER ACCEPT RIDE: ${driverId} accepting ${rideId}`);
    
    const Ride = require('../models/ride');
    const Driver = require('../models/driver/driver');
    
    // Check if ride exists
    const ride = await Ride.findOne({ RAID_ID: rideId });
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found"
      });
    }
    
    // Check if ride is already accepted
    if (ride.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: "Ride already accepted by another driver",
        currentDriver: ride.driverId || "Unknown driver"
      });
    }
    
    // Update ride
    ride.driverId = driverId;
    ride.driverName = req.body.driverName || "Driver";
    ride.status = 'accepted';
    ride.acceptedAt = new Date();
    await ride.save();
    
    // Update driver status in database
    await Driver.findOneAndUpdate(
      { driverId },
      { 
        status: 'onRide',
        lastRideId: rideId,
        lastUpdate: new Date()
      }
    );
    
    console.log(`✅ Ride ${rideId} accepted by ${driverId}`);
    
    res.json({
      success: true,
      message: "Ride accepted successfully",
      ride: {
        rideId: ride.RAID_ID,
        pickup: ride.pickup || {
          addr: ride.pickupLocation,
          lat: ride.pickupCoordinates?.latitude,
          lng: ride.pickupCoordinates?.longitude
        },
        drop: ride.drop || {
          addr: ride.dropoffLocation,
          lat: ride.dropoffCoordinates?.latitude,
          lng: ride.dropoffCoordinates?.longitude
        },
        fare: ride.fare || ride.price,
        distance: ride.distance,
        vehicleType: ride.rideType || vehicleType,
        userName: ride.name,
        userMobile: ride.userMobile,
        otp: ride.otp
      }
    });
    
  } catch (error) {
    console.error("❌ Accept ride error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to accept ride",
      error: error.message
    });
  }
});



// Token verification
router.get("/verify", authMiddleware, (req, res) => {
  driverController.verifyDriver(req, res);
});


router.post("/create-simple", upload.none(), async (req, res) => {
  try {
    console.log('📝 SIMPLE: Creating driver without files');
    console.log('📝 Content-Type:', req.headers['content-type']);
    console.log('📝 Request body:', req.body);
    
    // Extract data from request body
    const { 
      name, phone, vehicleNumber, licenseNumber, aadharNumber,
      vehicleType = 'taxi', email = '', dob = null, wallet = 0 // ✅ ADD wallet here
    } = req.body;
    
    console.log('📝 Extracted fields:', {
      name, phone, vehicleNumber, licenseNumber, aadharNumber,
      vehicleType, email, dob, wallet // ✅ ADD wallet to logging
    });
    
    // Validate required fields
    if (!name || !phone || !vehicleNumber || !licenseNumber || !aadharNumber) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, phone, vehicleNumber, licenseNumber, aadharNumber',
        received: {
          name: !!name,
          phone: !!phone,
          vehicleNumber: !!vehicleNumber,
          licenseNumber: !!licenseNumber,
          aadharNumber: !!aadharNumber
        }
      });
    }
    
    const Driver = require("../models/driver/driver");
    const bcrypt = require("bcryptjs");
    
    // Check for existing driver (phone, license, Aadhaar, vehicle number)
    const existingDriver = await Driver.findOne({ 
      $or: [
        { phone },
        { licenseNumber },
        { aadharNumber },
        { vehicleNumber }
      ]
    });
    
    if (existingDriver) {
      let conflictField = '';
      if (existingDriver.phone === phone) conflictField = 'phone number';
      else if (existingDriver.licenseNumber === licenseNumber) conflictField = 'license number';
      else if (existingDriver.aadharNumber === aadharNumber) conflictField = 'Aadhaar number';
      else if (existingDriver.vehicleNumber === vehicleNumber) conflictField = 'vehicle number';
      
      return res.status(400).json({
        success: false,
        message: `Driver with this ${conflictField} already exists`,
        existingDriver: {
          driverId: existingDriver.driverId,
          name: existingDriver.name,
          vehicleNumber: existingDriver.vehicleNumber
        }
      });
    }
    
    // ✅ Generate sequential driver ID (NOT based on vehicle number)
    const driverId = await Driver.generateSequentialDriverId();
    console.log('✅ Generated driver ID:', driverId);
    
    // Hash password (use phone as default password)
    const passwordHash = await bcrypt.hash(phone, 12);
    
    // Convert wallet to number
    const initialWallet = Number(wallet) || 0;
    
    // Create driver
    const driver = new Driver({
      driverId,
      name,
      phone,
      passwordHash,
      email,
      dob: dob ? new Date(dob) : null,
      licenseNumber,
      aadharNumber,
      vehicleType,
      vehicleNumber,
      wallet: initialWallet, // ✅ SET INITIAL WALLET AMOUNT
      status: 'Offline',
      active: true,
      mustChangePassword: true,
      location: {
        type: 'Point',
        coordinates: [0, 0]
      }
    });
    
    await driver.save();
    
    console.log(`✅ SIMPLE: Driver created successfully: ${driverId} with wallet: ${initialWallet}`);
    
    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: {
        driverId: driver.driverId,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        wallet: driver.wallet // ✅ RETURN WALLET IN RESPONSE
      }
    });
    
  } catch (error) {
    console.error('❌ SIMPLE: Error creating driver:', error);
    
    // Handle duplicate key error specifically
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      
      return res.status(400).json({
        success: false,
        message: `Driver with this ${field} (${value}) already exists`,
        error: 'DUPLICATE_KEY'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create driver',
      error: error.message
    });
  }
});




// ✅ Get complete driver data with all fields
router.post('/get-complete-driver-data', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    console.log('🔍 Getting COMPLETE driver data for:', phoneNumber);

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    // Clean phone number
    const cleanPhone = phoneNumber.replace('+91', '').replace(/\D/g, '');
    
    const driver = await Driver.findOne({ 
      $or: [
        { phone: cleanPhone },
        { phoneNumber: cleanPhone }
      ]
    })
    .select('-passwordHash') // Exclude password
    .lean(); // Return plain object

    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: driver._id,
        driverId: driver.driverId,
        role: 'driver' 
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    console.log(`✅ COMPLETE Driver data retrieved: ${driver.driverId}`);
    console.log(`   Vehicle Type: ${driver.vehicleType}`);
    console.log(`   Vehicle Number: ${driver.vehicleNumber}`);
    console.log(`   Wallet: ${driver.wallet}`);
    console.log(`   Status: ${driver.status}`);

    res.json({
      success: true,
      token: token,
      driver: {
        // Personal Info
        driverId: driver.driverId,
        name: driver.name,
        phone: driver.phone,
        email: driver.email || '',
        dob: driver.dob || null,
        
        // Vehicle Info
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        
        // Documents
        licenseNumber: driver.licenseNumber || '',
        aadharNumber: driver.aadharNumber || '',
        bankAccountNumber: driver.bankAccountNumber || '',
        ifscCode: driver.ifscCode || '',
        licenseDocument: driver.licenseDocument || '',
        aadharDocument: driver.aadharDocument || '',
        
        // Status & Location
        status: driver.status || 'Offline',
        wallet: driver.wallet || 0,
        location: driver.location || { type: 'Point', coordinates: [0, 0] },
        
        // FCM & Platform
        fcmToken: driver.fcmToken || '',
        platform: driver.platform || 'android',
        notificationEnabled: driver.notificationEnabled || true,
        
        // Performance
        active: driver.active || true,
        totalPayment: driver.totalPayment || 0,
        settlement: driver.settlement || 0,
        hoursLive: driver.hoursLive || 0,
        dailyHours: driver.dailyHours || 0,
        dailyRides: driver.dailyRides || 0,
        totalRides: driver.totalRides || 0,
        rating: driver.rating || 0,
        totalRatings: driver.totalRatings || 0,
        earnings: driver.earnings || 0,
        
        // Security
        mustChangePassword: driver.mustChangePassword || false,
        
        // Timestamps
        createdAt: driver.createdAt,
        updatedAt: driver.updatedAt,
        lastUpdate: driver.lastUpdate
      },
      message: 'Complete driver data fetched successfully'
    });

  } catch (error) {
    console.error('❌ Error getting complete driver data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get driver data',
      error: error.message 
    });
  }
});

router.put('/driver/:driverId/wallet', async (req, res) => {
  try {
    const { driverId } = req.params;
    const { amount } = req.body;
    
    console.log(`💰 Updating wallet for driver: ${driverId} with amount: ${amount}`);
    
    if (!amount || isNaN(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required (must be a positive number)'
      });
    }
    
    // Convert amount to number
    const addAmount = Number(amount);
    
    // Find driver
    const driver = await Driver.findOne({ driverId: driverId });
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    // Update wallet (initialize to 0 if doesn't exist)
    const currentWallet = driver.wallet || 0;
    const newWallet = currentWallet + addAmount;
    
    // Update driver
    driver.wallet = newWallet;
    driver.updatedAt = new Date();
    await driver.save();
    
    console.log(`✅ Wallet updated: ${driverId} from ${currentWallet} to ${newWallet}`);
    
    res.json({
      success: true,
      message: 'Wallet updated successfully',
      data: {
        driverId: driver.driverId,
        name: driver.name,
        addedAmount: addAmount,
        previousWallet: currentWallet,
        wallet: newWallet,
        updatedAt: driver.updatedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Wallet update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wallet',
      error: error.message
    });
  }
});

// Fix the login function that's incorrectly placed in the route:
const loginDriver = async (req, res) => {
  try {
    const { driverId, password, latitude, longitude, fcmToken } = req.body;
    console.log(`🔑 Login attempt for driver: ${driverId}`);

    const driver = await Driver.findOne({ driverId: driverId });
    if (!driver) {
      console.log(`❌ Driver not found: ${driverId}`);
      return res.status(404).json({ msg: "Driver not found" });
    }

    const match = await bcrypt.compare(password, driver.passwordHash);
    if (!match) {
      console.log(`❌ Invalid password for driver: ${driverId}`);
      return res.status(401).json({ msg: "Invalid password" });
    }

    // Update driver location, status, and FCM token
    if (latitude && longitude) {
      driver.location = {
        type: "Point",
        coordinates: [longitude, latitude],
      };
      driver.status = "Live";
      driver.lastUpdate = new Date();
    }

    // Update FCM token if provided
    if (fcmToken) {
      driver.fcmToken = fcmToken;
      console.log(`✅ Updated FCM token for driver: ${driverId}`);
    }

    await driver.save();
    console.log(`✅ Driver ${driverId} logged in at [${latitude}, ${longitude}]`);

    const token = jwt.sign(
      { sub: driver._id, driverId: driver.driverId },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: "30d" }
    );

    res.json({
      token,
      mustChangePassword: driver.mustChangePassword,
      driver: {
        driverId: driver.driverId,
        name: driver.name,
        status: driver.status,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        location: driver.location,
        fcmToken: driver.fcmToken,
        wallet: driver.wallet || 0
      },
    });
  } catch (err) {
    console.error("❌ Error in loginDriver:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update the login route to use the correct function
router.post("/login", async (req, res) => {
  await loginDriver(req, res);
});




// Add to /Users/webasebrandings/Downloads/u&d/exrabackend-main/routes/driverRoutes.js

// ✅ GET DRIVER BY ID - FIXED ENDPOINT
router.get('/get-by-id/:driverId', authMiddleware, async (req, res) => {
  try {
    const { driverId } = req.params;
    console.log(`🔍 Fetching driver by ID: ${driverId}`);
    
    const driver = await Driver.findOne({ driverId: driverId })
      .select('-passwordHash -__v')
      .lean();
    
    if (!driver) {
      console.log(`❌ Driver not found: ${driverId}`);
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }
    
    console.log(`✅ Driver found: ${driver.name} (${driver.vehicleType})`);
    
    res.json({
      success: true,
      driverId: driver.driverId,
      name: driver.name,
      phone: driver.phone,
      email: driver.email || '',
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber || '',
      wallet: driver.wallet || 0,
      status: driver.status || 'Offline',
      licenseNumber: driver.licenseNumber || '',
      aadharNumber: driver.aadharNumber || '',
      location: driver.location || { type: 'Point', coordinates: [0, 0] },
      fcmToken: driver.fcmToken || '',
      platform: driver.platform || 'android',
      totalRides: driver.totalRides || 0,
      rating: driver.rating || 0,
      earnings: driver.earnings || 0,
      createdAt: driver.createdAt,
      lastUpdate: driver.lastUpdate
    });
    
  } catch (error) {
    console.error("❌ Error fetching driver:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch driver data",
      error: error.message
    });
  }
});

// In driverRoutes.js - GET single driver
router.get("/:driverId", authMiddleware, async (req, res) => {
  try {
    const { driverId } = req.params;
    console.log(`🔍 Fetching driver ${driverId}`);
    
    const driver = await Driver.findOne({ driverId })
      .select('-passwordHash -__v')
      .lean();
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }
    
    console.log(`✅ Driver found: ${driver.name}`);
    console.log(`   Vehicle Type: ${driver.vehicleType}`);
    console.log(`   Vehicle Number: ${driver.vehicleNumber}`);
    
    res.json({
      success: true,
      ...driver
    });
    
  } catch (error) {
    console.error("❌ Error fetching driver:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch driver data",
      error: error.message
    });
  }
});




router.get("/nearby", async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }

    const drivers = await Driver.find({
      status: "Live",
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(maxDistance),
        },
      },
    }).select("driverId name location vehicleType status");

    res.json({
      success: true,
      count: drivers.length,
      drivers,
    });

  } catch (err) {
    console.error("❌ Error fetching nearby drivers:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch nearby drivers",
      error: err.message
    });
  }
});

// =============================
//  PROTECTED ROUTES
// =============================
router.use(authMiddleware);

// Update FCM Token (FINAL — no duplication)
router.post("/update-fcm-token", async (req, res) => {
  try {
    const { driverId, fcmToken, platform } = req.body;

    console.log('🔄 FCM Token Update:', {
      driverId,
      tokenLength: fcmToken?.length
    });

    const driver = await Driver.findOneAndUpdate(
      { driverId },
      {
        fcmToken,
        platform: platform || "android",
        lastUpdate: new Date()
      },
      { new: true }
    );

    res.json({ success: true, message: "FCM token updated" });
  } catch (error) {
    console.error("❌ FCM token update error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test Notification
router.post("/test-notification", (req, res) => {
  driverController.sendTestNotification(req, res);
});

// Update Driver Location
router.post("/update-location", (req, res) => {
  driverController.updateLocation(req, res);
});

// =============================
//  RIDE OPERATIONS
// =============================
router.get("/rides/:rideId", (req, res) => {
  driverController.getRideById(req, res);
});

router.put("/rides/:rideId", (req, res) => {
  driverController.updateRideStatus(req, res);
});

// =============================
//  DRIVER MANAGEMENT
// =============================
router.get("/", (req, res) => {
  driverController.getDrivers(req, res);
});

router.get("/nearest", (req, res) => {
  driverController.getNearestDrivers(req, res);
});

router.put("/:driverId", (req, res) => {
  driverController.updateDriver(req, res);
});

router.delete("/:driverId", (req, res) => {
  driverController.deleteDriver(req, res);
});


// In your backend (add to driverRoutes.js)
router.get('/pending-rides/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    
    console.log(`🔍 Checking pending rides for driver: ${driverId}`);
    
    const Ride = require('../models/ride');
    
    // Find rides that are pending and match driver's vehicle type
    const pendingRides = await Ride.find({
      status: 'pending',
      vehicleType: req.query.vehicleType || 'taxi' // Pass driver's vehicle type
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
    
    console.log(`✅ Found ${pendingRides.length} pending rides`);
    
    res.json({
      success: true,
      pendingRides: pendingRides.map(ride => ({
        rideId: ride.RAID_ID,
        pickup: {
          lat: ride.pickupCoordinates?.latitude || ride.pickup?.lat,
          lng: ride.pickupCoordinates?.longitude || ride.pickup?.lng,
          address: ride.pickupLocation || ride.pickup?.addr
        },
        drop: {
          lat: ride.dropoffCoordinates?.latitude || ride.drop?.lat,
          lng: ride.dropoffCoordinates?.longitude || ride.drop?.lng,
          address: ride.dropoffLocation || ride.drop?.addr
        },
        fare: ride.fare || ride.price,
        distance: ride.distance,
        vehicleType: ride.rideType || ride.vehicleType,
        userName: ride.name,
        userMobile: ride.userMobile,
        otp: ride.otp
      }))
    });
    
  } catch (error) {
    console.error('❌ Error fetching pending rides:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending rides',
      error: error.message
    });
  }
});




router.post("/logout", (req, res) => {
  driverController.logoutDriver(req, res);
});

module.exports = router;



// const express = require("express");
// const router = express.Router();
// const driverController = require("../controllers/driver/driverController");
// const { authMiddleware } = require("../middleware/authMiddleware");

// // Debug controller methods
// console.log('🚗 Driver Controller Methods:', Object.keys(driverController).filter(key => typeof driverController[key] === 'function'));

// // Public routes
// router.post("/login", (req, res) => {
//   driverController.loginDriver(req, res);
// });

// router.post("/change-password", (req, res) => {
//   driverController.changePassword(req, res);
// });

// // Test driver creation (public for testing)
// router.post("/create-test-driver", (req, res) => {
//   driverController.createDriver(req, res);
// });

// // Token verification (protected)
// router.get("/verify", authMiddleware, (req, res) => {
//   driverController.verifyDriver(req, res);
// });

// // Protected routes (require authentication)
// router.use(authMiddleware);

// // Make sure this route exists and is properly mounted
// router.post("/update-fcm-token", (req, res) => {
//   driverController.updateFCMToken(req, res);
// });

// router.post("/test-notification", (req, res) => {
//   driverController.sendTestNotification(req, res);
// });

// // Location management
// router.post("/update-location", (req, res) => {
//   driverController.updateLocation(req, res);
// });

// // Nearby drivers (public for users)
// router.get("/nearby", (req, res) => {
//   // This should be in a separate controller, but keeping for compatibility
//   const Driver = require("../models/driver/driver");
  
//   const { latitude, longitude, maxDistance = 5000 } = req.query;
  
//   if (!latitude || !longitude) {
//     return res.status(400).json({ 
//       success: false,
//       message: "Latitude and longitude are required" 
//     });
//   }

//   Driver.find({
//     status: "Live",
//     location: {
//       $near: {
//         $geometry: {
//           type: "Point",
//           coordinates: [parseFloat(longitude), parseFloat(latitude)],
//         },
//         $maxDistance: parseInt(maxDistance),
//       },
//     },
//   })
//   .select("driverId name location vehicleType status")
//   .then(drivers => {
//     res.json({
//       success: true,
//       count: drivers.length,
//       drivers,
//     });
//   })
//   .catch(err => {
//     console.error("❌ Error fetching nearby drivers:", err);
//     res.status(500).json({ 
//       success: false,
//       message: "Failed to fetch nearby drivers",
//       error: err.message 
//     });
//   });
// });

// // Ride operations
// router.get("/rides/:rideId", (req, res) => {
//   driverController.getRideById(req, res);
// });

// router.put("/rides/:rideId", (req, res) => {
//   driverController.updateRideStatus(req, res);
// });

// // Driver management
// router.get("/", (req, res) => {
//   driverController.getDrivers(req, res);
// });

// router.get("/nearest", (req, res) => {
//   driverController.getNearestDrivers(req, res);
// });

// router.put("/:driverId", (req, res) => {
//   driverController.updateDriver(req, res);
// });

// router.delete("/:driverId", (req, res) => {
//   driverController.deleteDriver(req, res);
// });

// router.post("/logout", (req, res) => {
//   driverController.logoutDriver(req, res);
// });

// // DriverRoutes.js-ல் இந்த route add பண்ணு
// router.post('/update-fcm-token', async (req, res) => {
//   try {
//     const { driverId, fcmToken, platform } = req.body;
    
//     console.log('🔄 FCM Token Update:', { 
//       driverId, 
//       tokenLength: fcmToken?.length 
//     });

//     const driver = await Driver.findOneAndUpdate(
//       { driverId },
//       { 
//         fcmToken: fcmToken,
//         platform: platform || 'android',
//         lastUpdate: new Date()
//       },
//       { new: true }
//     );

//     res.json({ success: true, message: 'FCM token updated' });
//   } catch (error) {
//     console.error('FCM token update error:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// module.exports = router;
