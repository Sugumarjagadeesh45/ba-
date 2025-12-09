const { Server } = require("socket.io");
const DriverLocation = require("./models/DriverLocation");
const Driver = require("./models/driver/driver");
const Ride = require("./models/ride");
const RaidId = require("./models/user/raidId");
const UserLocation = require("./models/user/UserLocation");
const ridePriceController = require("./controllers/ridePriceController");
const mongoose = require('mongoose');
const { sendNotificationToMultipleDrivers } = require("./services/firebaseService");

let io;
const rides = {};
const activeDriverSockets = new Map();
const processingRides = new Set();
const userLocationTracking = new Map();



const sendRideRequestToAllDrivers = async (rideData, savedRide) => {
  try {
    console.log('📢 Sending FCM notifications to ALL drivers...');
    
    // Get ALL active drivers with FCM tokens
    const allDrivers = await Driver.find({ 
      status: "Live",
      fcmToken: { $exists: true, $ne: null, $ne: '' }
    }).select('fcmToken driverId name vehicleType');
    
    console.log(`📊 Total online drivers: ${allDrivers.length}`);
    console.log(`📱 Drivers with FCM tokens: ${allDrivers.filter(d => d.fcmToken).length}`);

    if (allDrivers.length === 0) {
      console.log('⚠️ No drivers with FCM tokens found');
      return {
        success: false,
        message: 'No drivers with FCM tokens available',
        sentCount: 0,
        totalDrivers: 0,
        fcmSent: false
      };
    }

    // Always send socket notification as primary method
    console.log('🔔 Sending socket notification to all drivers...');
    io.emit("newRideRequest", {
      ...rideData,
      rideId: rideData.rideId,
      _id: savedRide?._id?.toString() || null,
      timestamp: new Date().toISOString()
    });

    // FCM notification to drivers with tokens
    const driversWithFCM = allDrivers.filter(driver => driver.fcmToken);
    
    if (driversWithFCM.length > 0) {
      console.log(`🎯 Sending FCM to ${driversWithFCM.length} drivers`);
      
      // FIXED: Ensure all data values are strings
      const notificationData = {
        type: "ride_request",
        rideId: rideData.rideId,
        pickup: JSON.stringify(rideData.pickup || {}),
        drop: JSON.stringify(rideData.drop || {}),
        fare: rideData.fare?.toString() || "0",
        distance: rideData.distance?.toString() || "0",
        vehicleType: rideData.vehicleType || "taxi",
        userName: rideData.userName || "Customer",
        userMobile: rideData.userMobile || "N/A",
        otp: rideData.otp || "0000",
        timestamp: new Date().toISOString(),
        priority: "high",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        sound: "default"
      };

      const fcmResult = await sendNotificationToMultipleDrivers(
        driversWithFCM.map(d => d.fcmToken),
        "🚖 New Ride Request!",
        `Pickup: ${rideData.pickup?.address?.substring(0, 40) || 'Location'}... | Fare: ₹${rideData.fare}`,
        notificationData
      );

      console.log('📊 FCM Notification Result:', fcmResult);

      return {
        success: fcmResult.successCount > 0,
        driversNotified: fcmResult.successCount,
        totalDrivers: driversWithFCM.length,
        fcmSent: fcmResult.successCount > 0,
        fcmMessage: fcmResult.successCount > 0 ? 
          `FCM sent to ${fcmResult.successCount} drivers` : 
          `FCM failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
      };
    } else {
      console.log('⚠️ No drivers with FCM tokens');
      return {
        success: false,
        driversNotified: 0,
        totalDrivers: 0,
        fcmSent: false,
        fcmMessage: "No drivers with FCM tokens available"
      };
    }

  } catch (error) {
    console.error('❌ Error in notification system:', error);
    return {
      success: false,
      error: error.message,
      fcmSent: false,
      fcmMessage: `FCM error: ${error.message}`
    };
  }
};
const broadcastPricesToAllUsers = () => {
  try {
    const currentPrices = ridePriceController.getCurrentPrices();
    console.log('💰 BROADCASTING PRICES TO ALL USERS:', currentPrices);
   
    if (io) {
      io.emit('priceUpdate', currentPrices);
      io.emit('currentPrices', currentPrices);
      console.log('✅ Prices broadcasted to all connected users');
    }
  } catch (error) {
    console.error('❌ Error broadcasting prices:', error);
  }
};

// Helper function to log current driver status
const logDriverStatus = () => {
  console.log("\n📊 === CURRENT DRIVER STATUS ===");
  if (activeDriverSockets.size === 0) {
    console.log("❌ No drivers currently online");
  } else {
    console.log(`✅ ${activeDriverSockets.size} drivers currently online:`);
    activeDriverSockets.forEach((driver, driverId) => {
      const timeSinceUpdate = Math.floor((Date.now() - driver.lastUpdate) / 1000);
      console.log(` 🚗 ${driver.driverName} (${driverId})`);
      console.log(` Status: ${driver.status}`);
      console.log(` Vehicle: ${driver.vehicleType}`);
      console.log(` Location: ${driver.location.latitude.toFixed(6)}, ${driver.location.longitude.toFixed(6)}`);
      console.log(` Last update: ${timeSinceUpdate}s ago`);
      console.log(` Socket: ${driver.socketId}`);
      console.log(` Online: ${driver.isOnline ? 'Yes' : 'No'}`);
    });
  }
  console.log("================================\n");
};

// Helper function to log ride status
const logRideStatus = () => {
  console.log("\n🚕 === CURRENT RIDE STATUS ===");
  const rideEntries = Object.entries(rides);
  if (rideEntries.length === 0) {
    console.log("❌ No active rides");
  } else {
    console.log(`✅ ${rideEntries.length} active rides:`);
    rideEntries.forEach(([rideId, ride]) => {
      console.log(` 📍 Ride ${rideId}:`);
      console.log(` Status: ${ride.status}`);
      console.log(` Driver: ${ride.driverId || 'Not assigned'}`);
      console.log(` User ID: ${ride.userId}`);
      console.log(` Customer ID: ${ride.customerId}`);
      console.log(` User Name: ${ride.userName}`);
      console.log(` User Mobile: ${ride.userMobile}`);
      console.log(` Pickup: ${ride.pickup?.address || ride.pickup?.lat + ',' + ride.pickup?.lng}`);
      console.log(` Drop: ${ride.drop?.address || ride.drop?.lat + ',' + ride.drop?.lng}`);
     
      if (userLocationTracking.has(ride.userId)) {
        const userLoc = userLocationTracking.get(ride.userId);
        console.log(` 📍 USER CURRENT/LIVE LOCATION: ${userLoc.latitude}, ${userLoc.longitude}`);
        console.log(` 📍 Last location update: ${new Date(userLoc.lastUpdate).toLocaleTimeString()}`);
      } else {
        console.log(` 📍 USER CURRENT/LIVE LOCATION: Not available`);
      }
    });
  }
  console.log("================================\n");
};

// Function to log user location updates
const logUserLocationUpdate = (userId, location, rideId) => {
  console.log(`\n📍 === USER LOCATION UPDATE ===`);
  console.log(`👤 User ID: ${userId}`);
  console.log(`🚕 Ride ID: ${rideId}`);
  console.log(`🗺️ Current Location: ${location.latitude}, ${location.longitude}`);
  console.log(`⏰ Update Time: ${new Date().toLocaleTimeString()}`);
  console.log("================================\n");
};

// Function to save user location to database
const saveUserLocationToDB = async (userId, latitude, longitude, rideId = null) => {
  try {
    const userLocation = new UserLocation({
      userId,
      latitude,
      longitude,
      rideId,
      timestamp: new Date()
    });
   
    await userLocation.save();
    console.log(`💾 Saved user location to DB: User ${userId}, Ride ${rideId}, Location: ${latitude}, ${longitude}`);
    return true;
  } catch (error) {
    console.error("❌ Error saving user location to DB:", error);
    return false;
  }
};

// Test the RaidId model on server startup
async function testRaidIdModel() {
  try {
    console.log('🧪 Testing RaidId model...');
    const testDoc = await RaidId.findOne({ _id: 'raidId' });
    console.log('🧪 RaidId document:', testDoc);
   
    if (!testDoc) {
      console.log('🧪 Creating initial RaidId document');
      const newDoc = new RaidId({ _id: 'raidId', sequence: 100000 });
      await newDoc.save();
      console.log('🧪 Created initial RaidId document');
    }
  } catch (error) {
    console.error('❌ Error testing RaidId model:', error);
  }
}

// RAID_ID generation function
async function generateSequentialRaidId() {
  try {
    console.log('🔢 Starting RAID_ID generation');
   
    const raidIdDoc = await RaidId.findOneAndUpdate(
      { _id: 'raidId' },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
   
    console.log('🔢 RAID_ID document:', raidIdDoc);
    let sequenceNumber = raidIdDoc.sequence;
    console.log('🔢 Sequence number:', sequenceNumber);
    
    if (sequenceNumber > 999999) {
      console.log('🔄 Resetting sequence to 100000');
      await RaidId.findOneAndUpdate(
        { _id: 'raidId' },
        { sequence: 100000 }
      );
      sequenceNumber = 100000;
    }
    
    const formattedSequence = sequenceNumber.toString().padStart(6, '0');
    const raidId = `RID${formattedSequence}`;
    console.log(`🔢 Generated RAID_ID: ${raidId}`);
   
    return raidId;
  } catch (error) {
    console.error('❌ Error generating sequential RAID_ID:', error);
   
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const fallbackId = `RID${timestamp}${random}`;
    console.log(`🔄 Using fallback ID: ${fallbackId}`);
   
    return fallbackId;
  }
}

// Helper function to save driver location to database
async function saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType, status = "Live") {
  try {
    const locationDoc = new DriverLocation({
      driverId,
      driverName,
      latitude,
      longitude,
      vehicleType,
      status,
      timestamp: new Date()
    });
   
    await locationDoc.save();
    console.log(`💾 Saved location for driver ${driverId} (${driverName}) to database`);
    return true;
  } catch (error) {
    console.error("❌ Error saving driver location to DB:", error);
    return false;
  }
}

// Helper function to broadcast driver locations to all users
function broadcastDriverLocationsToAllUsers() {
  const drivers = Array.from(activeDriverSockets.values())
    .filter(driver => driver.isOnline)
    .map(driver => ({
      driverId: driver.driverId,
      name: driver.driverName,
      location: {
        coordinates: [driver.location.longitude, driver.location.latitude]
      },
      vehicleType: driver.vehicleType,
      status: driver.status,
      lastUpdate: driver.lastUpdate
    }));
 
  io.emit("driverLocationsUpdate", { drivers });
}

const init = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
  });
 
  // Test the RaidId model on startup
  testRaidIdModel();
 
  // Log server status every 2 seconds
  setInterval(() => {
    console.log(`\n⏰ ${new Date().toLocaleString()} - Server Status Check`);
    logDriverStatus();
    logRideStatus();
  }, 2000);
 
  // Broadcast prices when server starts
  setTimeout(() => {
    console.log('🚀 Server started, broadcasting initial prices...');
    broadcastPricesToAllUsers();
  }, 3000);
 
  io.on("connection", (socket) => {
    console.log(`\n⚡ New client connected: ${socket.id}`);
    console.log(`📱 Total connected clients: ${io.engine.clientsCount}`);
   
    // IMMEDIATELY SEND PRICES TO NEWLY CONNECTED CLIENT
    console.log('💰 Sending current prices to new client:', socket.id);
    try {
      const currentPrices = ridePriceController.getCurrentPrices();
      console.log('💰 Current prices from controller:', currentPrices);
      socket.emit('currentPrices', currentPrices);
      socket.emit('priceUpdate', currentPrices);
    } catch (error) {
      console.error('❌ Error sending prices to new client:', error);
    }

    // FIXED: Moved retryFCMNotification inside connection block
    socket.on("retryFCMNotification", async (data, callback) => {
      try {
        const { rideId, retryCount } = data;
        
        console.log(`🔄 FCM retry attempt #${retryCount} for ride: ${rideId}`);
        
        // Get ride details
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (!ride) {
          if (callback) callback({ 
            success: false, 
            message: 'Ride not found' 
          });
          return;
        }
        
        // Get drivers with FCM tokens
        const driversWithFCM = await Driver.find({ 
          status: "Live",
          fcmToken: { $exists: true, $ne: null, $ne: '' }
        });
        
        if (driversWithFCM.length === 0) {
          if (callback) callback({ 
            success: false, 
            message: 'No drivers with FCM tokens available' 
          });
          return;
        }
        
        const driverTokens = driversWithFCM.map(driver => driver.fcmToken);
        
        // Prepare notification data
        const notificationData = {
          type: "ride_request",
          rideId: rideId,
          pickup: JSON.stringify(ride.pickup),
          drop: JSON.stringify(ride.drop),
          fare: ride.fare.toString(),
          distance: ride.distance,
          vehicleType: ride.rideType,
          userName: ride.name,
          userMobile: ride.userMobile,
          timestamp: new Date().toISOString(),
          priority: "high",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          isRetry: true,
          retryCount: retryCount,
          sound: "default",
          android: {
            channelId: "high_priority_channel",
            priority: "high",
            visibility: "public",
            sound: "default",
            vibrate: true,
            lights: true
          },
          ios: {
            sound: "default",
            badge: 1,
            critical: true
          }
        };
        
        // Send notifications
        const fcmResult = await sendNotificationToMultipleDrivers(
          driverTokens,
          "🚖 Ride Request (Retry)",
          `Retry #${retryCount}: ${ride.pickup?.address?.substring(0, 30)}... | Fare: ₹${ride.fare}`,
          notificationData
        );
        
        if (callback) callback({
          success: fcmResult.successCount > 0,
          driversNotified: fcmResult.successCount,
          message: fcmResult.successCount > 0 ? 
            `Retry successful: ${fcmResult.successCount} drivers notified` : 
            `Retry failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
        });
        
      } catch (error) {
        console.error('❌ Error in FCM retry:', error);
        if (callback) callback({ 
          success: false, 
          message: error.message 
        });
      }
    });

    // DRIVER LOCATION UPDATE
    socket.on("driverLocationUpdate", async (data) => {
      try {
        const { driverId, latitude, longitude, status } = data;
       
        console.log(`📍 REAL-TIME: Driver ${driverId} location update received`);
       
        // Update driver in activeDriverSockets
        if (activeDriverSockets.has(driverId)) {
          const driverData = activeDriverSockets.get(driverId);
          driverData.location = { latitude, longitude };
          driverData.lastUpdate = Date.now();
          driverData.status = status || "Live";
          driverData.isOnline = true;
          activeDriverSockets.set(driverId, driverData);
        }
       
        // Broadcast to ALL connected users in REAL-TIME
        io.emit("driverLiveLocationUpdate", {
          driverId: driverId,
          lat: latitude,
          lng: longitude,
          status: status || "Live",
          vehicleType: "taxi",
          timestamp: Date.now()
        });
       
        // Also update database
        const driverData = activeDriverSockets.get(driverId);
        await saveDriverLocationToDB(
          driverId,
          driverData?.driverName || "Unknown",
          latitude,
          longitude,
          "taxi",
          status || "Live"
        );
       
      } catch (error) {
        console.error("❌ Error processing driver location update:", error);
      }
    });
   
    // DRIVER LIVE LOCATION UPDATE
    socket.on("driverLiveLocationUpdate", async ({ driverId, driverName, lat, lng }) => {
      try {
        if (activeDriverSockets.has(driverId)) {
          const driverData = activeDriverSockets.get(driverId);
          driverData.location = { latitude: lat, longitude: lng };
          driverData.lastUpdate = Date.now();
          driverData.isOnline = true;
          activeDriverSockets.set(driverId, driverData);
         
          // Save to database immediately
          await saveDriverLocationToDB(driverId, driverName, lat, lng, driverData.vehicleType);
         
          // Broadcast real-time update to ALL users
          io.emit("driverLiveLocationUpdate", {
            driverId: driverId,
            lat: lat,
            lng: lng,
            status: driverData.status,
            vehicleType: driverData.vehicleType,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error("❌ Error updating driver location:", error);
      }
    });
   
    // USER REGISTRATION
    socket.on('registerUser', ({ userId, userMobile }) => {
      if (!userId) {
        console.error('❌ No userId provided for user registration');
        return;
      }
     
      socket.userId = userId.toString();
      socket.join(userId.toString());
     
      console.log(`👤 USER REGISTERED SUCCESSFULLY: ${userId}`);
    });
   
    // DRIVER REGISTRATION
    socket.on("registerDriver", async ({ driverId, driverName, latitude, longitude, vehicleType = "taxi" }) => {
      try {
        console.log(`\n📝 DRIVER REGISTRATION: ${driverName} (${driverId})`);
       
        if (!driverId) {
          console.log("❌ Registration failed: No driverId provided");
          return;
        }
       
        if (!latitude || !longitude) {
          console.log("❌ Registration failed: Invalid location");
          return;
        }
        
        socket.driverId = driverId;
        socket.driverName = driverName;
       
        // Store driver connection info
        activeDriverSockets.set(driverId, {
          socketId: socket.id,
          driverId,
          driverName,
          location: { latitude, longitude },
          vehicleType,
          lastUpdate: Date.now(),
          status: "Live",
          isOnline: true
        });
       
        // Join driver to rooms
        socket.join("allDrivers");
        socket.join(`driver_${driverId}`);
       
        console.log(`✅ DRIVER REGISTERED SUCCESSFULLY: ${driverName} (${driverId})`);
       
        // Save initial location to database
        await saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType);
       
        // Broadcast updated driver list to ALL connected users
        broadcastDriverLocationsToAllUsers();
       
        // Send confirmation to driver
        socket.emit("driverRegistrationConfirmed", {
          success: true,
          message: "Driver registered successfully"
        });
       
      } catch (error) {
        console.error("❌ Error registering driver:", error);
       
        socket.emit("driverRegistrationConfirmed", {
          success: false,
          message: "Registration failed: " + error.message
        });
      }
    });

    // REQUEST NEARBY DRIVERS
    socket.on("requestNearbyDrivers", ({ latitude, longitude, radius = 5000 }) => {
      try {
        console.log(`\n🔍 USER REQUESTED NEARBY DRIVERS: ${socket.id}`);
        
        // Get all active drivers (only those who are online)
        const drivers = Array.from(activeDriverSockets.values())
          .filter(driver => driver.isOnline)
          .map(driver => ({
            driverId: driver.driverId,
            name: driver.driverName,
            location: {
              coordinates: [driver.location.longitude, driver.location.latitude]
            },
            vehicleType: driver.vehicleType,
            status: driver.status,
            lastUpdate: driver.lastUpdate
          }));

        console.log(`📊 Online drivers: ${drivers.length}`);
        
        // Send to the requesting client only
        socket.emit("nearbyDriversResponse", { drivers });
      } catch (error) {
        console.error("❌ Error fetching nearby drivers:", error);
        socket.emit("nearbyDriversResponse", { drivers: [] });
      }
    });

  
    // In socket.js - Replace the bookRide handler with this enhanced version
socket.on("bookRide", async (data, callback) => {
  let rideId;
  try {
    console.log('\n🚨 ===== 🚖 NEW RIDE BOOKING REQUEST ===== 🚖');
    console.log('📦 USER APP DATA RECEIVED:');
    console.log('   👤 User ID:', data.userId);
    console.log('   📞 Customer ID:', data.customerId);
    console.log('   🚗 Vehicle Type:', data.vehicleType);
    console.log('   📍 Pickup:', data.pickup?.address);
    console.log('   🎯 Drop:', data.drop?.address);
    console.log('   💰 Estimated Fare:', data.estimatedPrice);
    console.log('   📏 Distance:', data.distance);
    console.log('   ⏱️ Travel Time:', data.travelTime);
    console.log('   🔑 FCM Required:', data._fcmRequired);

    const { userId, customerId, userName, userMobile, pickup, drop, vehicleType, estimatedPrice, distance, travelTime, wantReturn } = data;
    
    // Calculate price on backend using admin prices
    const distanceKm = parseFloat(distance);
    const backendCalculatedPrice = await ridePriceController.calculateRidePrice(vehicleType, distanceKm);
   
    // Generate sequential RAID_ID on backend
    rideId = await generateSequentialRaidId();
    
    let otp;
    if (customerId && customerId.length >= 4) {
      otp = customerId.slice(-4);
    } else {
      otp = Math.floor(1000 + Math.random() * 9000).toString();
    }
    
    console.log('💰 PRICE CALCULATION:');
    console.log('   📊 Distance (km):', distanceKm);
    console.log('   🚗 Vehicle Type:', vehicleType);
    console.log('   💵 Calculated Fare:', backendCalculatedPrice);
    console.log('   🔢 Generated OTP:', otp);
    console.log('   🆔 Generated RAID_ID:', rideId);

    // Check if this ride is already being processed
    if (processingRides.has(rideId)) {
      console.log(`⏭️ Ride ${rideId} is already being processed, skipping`);
      if (callback) {
        callback({
          success: false,
          message: "Ride is already being processed"
        });
      }
      return;
    }
   
    // Add to processing set
    processingRides.add(rideId);
    
    // Validate required fields
    if (!userId || !customerId || !userName || !pickup || !drop) {
      console.log("❌ MISSING REQUIRED FIELDS");
      processingRides.delete(rideId);
      if (callback) {
        callback({
          success: false,
          message: "Missing required fields"
        });
      }
      return;
    }

    // Check if ride with this ID already exists in database
    const existingRide = await Ride.findOne({ RAID_ID: rideId });
    if (existingRide) {
      console.log(`⏭️ Ride ${rideId} already exists in database, skipping`);
      processingRides.delete(rideId);
      if (callback) {
        callback({
          success: true,
          rideId: rideId,
          _id: existingRide._id.toString(),
          otp: existingRide.otp,
          message: "Ride already exists"
        });
      }
      return;
    }

    // Create a new ride document in MongoDB
    const rideData = {
      user: userId,
      customerId: customerId,
      name: userName,
      userMobile: userMobile || "N/A",
      RAID_ID: rideId,
      pickupLocation: pickup.address || "Selected Location",
      dropoffLocation: drop.address || "Selected Location",
      pickupCoordinates: {
        latitude: pickup.lat,
        longitude: pickup.lng
      },
      dropoffCoordinates: {
        latitude: drop.lat,
        longitude: drop.lng
      },
      fare: backendCalculatedPrice,
      rideType: vehicleType,
      otp: otp,
      distance: distance || "0 km",
      travelTime: travelTime || "0 mins",
      isReturnTrip: wantReturn || false,
      status: "pending",
      Raid_date: new Date(),
      Raid_time: new Date().toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: true
      }),
      pickup: {
        addr: pickup.address || "Selected Location",
        lat: pickup.lat,
        lng: pickup.lng,
      },
      drop: {
        addr: drop.address || "Selected Location",
        lat: drop.lat,
        lng: drop.lng,
      },
      price: backendCalculatedPrice,
      distanceKm: distanceKm || 0
    };

    // Create and save the ride
    console.log('💾 SAVING RIDE TO DATABASE...');
    const newRide = new Ride(rideData);
    const savedRide = await newRide.save();
    console.log(`✅ RIDE SAVED TO MONGODB: ${savedRide._id}`);

    // Store ride data in memory for socket operations
    rides[rideId] = {
      ...data,
      rideId: rideId,
      status: "pending",
      timestamp: Date.now(),
      _id: savedRide._id.toString(),
      userLocation: { latitude: pickup.lat, longitude: pickup.lng },
      fare: backendCalculatedPrice
    };

    // Initialize user location tracking
    userLocationTracking.set(userId, {
      latitude: pickup.lat,
      longitude: pickup.lng,
      lastUpdate: Date.now(),
      rideId: rideId
    });

    // Save initial user location to database
    await saveUserLocationToDB(userId, pickup.lat, pickup.lng, rideId);

    console.log('\n📢 ===== SENDING NOTIFICATIONS TO DRIVERS =====');
    console.log(`🎯 Target: ALL online drivers with FCM tokens`);

    // ✅ CRITICAL FIX: Send FCM notifications to ALL online drivers
    const notificationResult = await sendRideRequestToAllDrivers({
      rideId: rideId,
      pickup: pickup,
      drop: drop,
      fare: backendCalculatedPrice,
      distance: distance,
      vehicleType: vehicleType,
      userName: userName,
      userMobile: userMobile,
      otp: otp
    }, savedRide);

    console.log('📱 FCM NOTIFICATION RESULT:');
    console.log('   ✅ Success Count:', notificationResult.successCount || 0);
    console.log('   ❌ Failure Count:', notificationResult.failureCount || 0);
    console.log('   📊 Total Drivers:', notificationResult.totalDrivers || 0);
    console.log('   🔔 FCM Sent:', notificationResult.fcmSent ? 'YES' : 'NO');
    console.log('   💬 Message:', notificationResult.fcmMessage);

    // Also send socket notification as backup
    console.log('🔔 SENDING SOCKET NOTIFICATION AS BACKUP...');
    io.emit("newRideRequest", {
      rideId: rideId,
      pickup: pickup,
      drop: drop,
      fare: backendCalculatedPrice,
      distance: distance,
      vehicleType: vehicleType,
      userName: userName,
      userMobile: userMobile,
      otp: otp,
      timestamp: new Date().toISOString()
    });

    console.log('\n✅ ===== RIDE BOOKING COMPLETED SUCCESSFULLY =====');
    console.log(`🆔 RAID_ID: ${rideId}`);
    console.log(`👤 Customer: ${userName}`);
    console.log(`📞 Mobile: ${userMobile}`);
    console.log(`📍 From: ${pickup.address}`);
    console.log(`🎯 To: ${drop.address}`);
    console.log(`💰 Fare: ₹${backendCalculatedPrice}`);
    console.log(`📏 Distance: ${distance}`);
    console.log(`🚗 Vehicle: ${vehicleType}`);
    console.log(`🔢 OTP: ${otp}`);
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    console.log('================================================\n');

    if (callback) {
      callback({
        success: true,
        rideId: rideId,
        _id: savedRide._id.toString(),
        otp: otp,
        message: "Ride booked successfully!",
        notificationResult: notificationResult,
        fcmSent: notificationResult.fcmSent,
        driversNotified: notificationResult.driversNotified || 0
      });
    }

  } catch (error) {
    console.error("❌ ERROR IN RIDE BOOKING PROCESS:", error);
    console.error("❌ Stack Trace:", error.stack);
   
    if (callback) {
      callback({
        success: false,
        message: "Failed to process ride booking",
        error: error.message
      });
    }
  } finally {
    // Always remove from processing set
    if (rideId) {
      processingRides.delete(rideId);
    }
  }
});


    // JOIN ROOM
    socket.on('joinRoom', async (data) => {
      try {
        const { userId } = data;
        if (userId) {
          socket.join(userId.toString());
          console.log(`✅ User ${userId} joined their room via joinRoom event`);
        }
      } catch (error) {
        console.error('Error in joinRoom:', error);
      }
    });

    

socket.on("acceptRide", async (data, callback) => {
  const { rideId, driverId, driverName } = data;
  console.log("🚨 ===== BACKEND ACCEPT RIDE START =====");
  console.log("📥 Acceptance Data:", { rideId, driverId, driverName });
  
  try {
    // FIND RIDE IN DATABASE
    console.log(`🔍 Looking for ride: ${rideId}`);
    const ride = await Ride.findOne({ RAID_ID: rideId });
   
    if (!ride) {
      console.error(`❌ Ride ${rideId} not found in database`);
      if (typeof callback === "function") {
        callback({ success: false, message: "Ride not found" });
      }
      return;
    }
    
    console.log(`✅ Found ride: ${ride.RAID_ID}, Status: ${ride.status}`);

    // ✅ CRITICAL FIX: IMMEDIATELY NOTIFY ALL OTHER DRIVERS
    // This should happen BEFORE any database updates
    console.log(`📢 IMMEDIATELY NOTIFYING ALL DRIVERS THAT RIDE ${rideId} IS TAKEN`);
    
    // Method 1: Broadcast to all drivers except the one who accepted
    socket.broadcast.emit("rideTakenByDriver", {
      rideId: rideId,
      driverId: driverId,
      driverName: driverName,
      message: "This ride has already been accepted by another driver. Please wait for the next ride request.",
      timestamp: new Date().toISOString()
    });

    // Method 2: Specific event for ride already accepted
    socket.broadcast.emit("rideAlreadyAccepted", {
      rideId: rideId,
      acceptedBy: driverName,
      message: "This ride has already been accepted by another driver. Please wait for the next ride request.",
      timestamp: new Date().toISOString()
    });

    // Method 3: Global notification
    io.emit("rideStatusUpdate", {
      rideId: rideId,
      status: "accepted",
      acceptedBy: driverId,
      message: "Ride accepted by another driver",
      timestamp: new Date().toISOString()
    });

    console.log(`✅ Notified all other drivers that ride ${rideId} was taken by ${driverName}`);

    // CHECK IF RIDE IS ALREADY ACCEPTED (existing logic)
    if (ride.status === "accepted") {
      console.log(`🚫 Ride ${rideId} already accepted by: ${ride.driverId}`);
     
      if (typeof callback === "function") {
        callback({
          success: false,
          message: "This ride has already been accepted by another driver."
        });
      }
      return;
    }


        // UPDATE RIDE STATUS
        console.log(`🔄 Updating ride status to 'accepted'`);
        ride.status = "accepted";
        ride.driverId = driverId;
        ride.driverName = driverName;

        // GET DRIVER DETAILS
        const driver = await Driver.findOne({ driverId });
       
        if (driver) {
          ride.driverMobile = driver.phone;
          console.log(`📱 Driver mobile: ${driver.phone}`);
        } else {
          ride.driverMobile = "N/A";
          console.log(`⚠️ Driver not found in Driver collection`);
        }

        // ENSURE OTP EXISTS
        if (!ride.otp) {
          const otp = Math.floor(1000 + Math.random() * 9000).toString();
          ride.otp = otp;
          console.log(`🔢 Generated new OTP: ${otp}`);
        }

        // SAVE TO DATABASE
        await ride.save();
        console.log(`💾 Ride saved successfully`);

        // Update in-memory ride status if exists
        if (rides[rideId]) {
          rides[rideId].status = "accepted";
          rides[rideId].driverId = driverId;
          rides[rideId].driverName = driverName;
        }

        // SEND NOTIFICATION TO USER (if user has FCM token)
        try {
          const User = require('./models/User');
          const user = await User.findById(ride.user);
          
          if (user && user.fcmToken) {
            // You can implement sendNotificationToUser here
            console.log(`📢 Ride accepted notification would be sent to user: ${user._id}`);
          }
        } catch (notificationError) {
          console.error("❌ Error sending ride accepted notification:", notificationError);
        }

        const driverData = {
          success: true,
          rideId: ride.RAID_ID,
          driverId: driverId,
          driverName: driverName,
          driverMobile: ride.driverMobile,
          driverLat: driver?.location?.coordinates?.[1] || 0,
          driverLng: driver?.location?.coordinates?.[0] || 0,
          otp: ride.otp,
          pickup: ride.pickup,
          drop: ride.drop,
          status: ride.status,
          vehicleType: driver?.vehicleType || "taxi",
          userName: ride.name,
          userMobile: rides[rideId]?.userMobile || ride.userMobile || "N/A",
          timestamp: new Date().toISOString(),
          fare: ride.fare || ride.price || 0,
          distance: ride.distance || "0 km"
        };

        // SEND CONFIRMATION TO DRIVER
        if (typeof callback === "function") {
          console.log("📨 Sending callback to driver");
          callback(driverData);
        }

        // NOTIFY USER WITH MULTIPLE CHANNELS
        const userRoom = ride.user.toString();
        console.log(`📡 Notifying user room: ${userRoom}`);
       
        // Method 1: Standard room emission
        io.to(userRoom).emit("rideAccepted", driverData);
        console.log("✅ Notification sent via standard room channel");
        
        // Method 2: Direct to all sockets in room
        const userSockets = await io.in(userRoom).fetchSockets();
        console.log(`🔍 Found ${userSockets.length} sockets in user room`);
        userSockets.forEach((userSocket, index) => {
          userSocket.emit("rideAccepted", driverData);
        });

        // Method 3: Global emit with user filter
        io.emit("rideAcceptedGlobal", {
          ...driverData,
          targetUserId: userRoom,
          timestamp: new Date().toISOString()
        });

        // Method 4: Backup delayed emission
        setTimeout(() => {
          io.to(userRoom).emit("rideAccepted", driverData);
          console.log("✅ Backup notification sent after delay");
        }, 1000);

        // Send user data to the driver who accepted the ride
        const userDataForDriver = {
          success: true,
          rideId: ride.RAID_ID,
          userId: ride.user,
          customerId: ride.customerId,
          userName: ride.name,
          userMobile: rides[rideId]?.userMobile || ride.userMobile || "N/A",
          pickup: ride.pickup,
          drop: ride.drop,
          otp: ride.otp,
          status: ride.status,
          timestamp: new Date().toISOString()
        };

        // Send to the specific driver socket
        const driverSocket = Array.from(io.sockets.sockets.values()).find(s => s.driverId === driverId);
        if (driverSocket) {
          driverSocket.emit("userDataForDriver", userDataForDriver);
          console.log("✅ User data sent to driver:", driverId);
        } else {
          io.to(`driver_${driverId}`).emit("userDataForDriver", userDataForDriver);
          console.log("✅ User data sent to driver room:", driverId);
        }

        // NOTIFY OTHER DRIVERS
        socket.broadcast.emit("rideAlreadyAccepted", {
          rideId,
          message: "This ride has already been accepted by another driver."
        });

        console.log("📢 Other drivers notified");

        // UPDATE DRIVER STATUS IN MEMORY
        if (activeDriverSockets.has(driverId)) {
          const driverInfo = activeDriverSockets.get(driverId);
          driverInfo.status = "onRide";
          driverInfo.isOnline = true;
          activeDriverSockets.set(driverId, driverInfo);
          console.log(`🔄 Updated driver ${driverId} status to 'onRide'`);
        }

        console.log(`🎉 RIDE ${rideId} ACCEPTED SUCCESSFULLY BY ${driverName}`);
      } catch (error) {
        console.error(`❌ ERROR ACCEPTING RIDE ${rideId}:`, error);
        console.error("Stack:", error.stack);
       
        if (typeof callback === "function") {
          callback({
            success: false,
            message: "Server error: " + error.message
          });
        }
      }
    });



// Add this in socket.js connection section
socket.onAny((eventName, data) => {
  if (eventName.includes('ride') || eventName.includes('accept') || eventName.includes('driver')) {
    console.log(`🔍 [SOCKET EVENT] ${eventName}:`, JSON.stringify(data, null, 2));
  }
});

// Specific debug for rideAccepted events
socket.on("rideAccepted", (data) => {
  console.log('🎯 [DIRECT rideAccepted EVENT]:', JSON.stringify(data, null, 2));
});

socket.on("rideAcceptedBroadcast", (data) => {
  console.log('📡 [BROADCAST rideAccepted EVENT]:', JSON.stringify(data, null, 2));
});


    // USER LOCATION UPDATE
    socket.on("userLocationUpdate", async (data) => {
      try {
        const { userId, rideId, latitude, longitude } = data;
       
        console.log(`📍 USER LOCATION UPDATE: User ${userId} for ride ${rideId}`);
       
        // Update user location in tracking map
        userLocationTracking.set(userId, {
          latitude,
          longitude,
          lastUpdate: Date.now(),
          rideId: rideId
        });
       
        // Log the location update
        logUserLocationUpdate(userId, { latitude, longitude }, rideId);
       
        // Save to database
        await saveUserLocationToDB(userId, latitude, longitude, rideId);
       
        // Update in-memory ride data if exists
        if (rides[rideId]) {
          rides[rideId].userLocation = { latitude, longitude };
          console.log(`✅ Updated user location in memory for ride ${rideId}`);
        }
       
        // Find driver ID
        let driverId = null;
       
        // Check in-memory rides first
        if (rides[rideId] && rides[rideId].driverId) {
          driverId = rides[rideId].driverId;
          console.log(`✅ Found driver ID in memory: ${driverId} for ride ${rideId}`);
        } else {
          // If not in memory, check database
          const ride = await Ride.findOne({ RAID_ID: rideId });
          if (ride && ride.driverId) {
            driverId = ride.driverId;
            console.log(`✅ Found driver ID in database: ${driverId} for ride ${rideId}`);
           
            // Update in-memory ride data
            if (!rides[rideId]) {
              rides[rideId] = {};
            }
            rides[rideId].driverId = driverId;
          } else {
            console.log(`❌ No driver assigned for ride ${rideId} in database either`);
            return;
          }
        }
       
        // Send user location to the specific driver
        const driverRoom = `driver_${driverId}`;
        const locationData = {
          rideId: rideId,
          userId: userId,
          lat: latitude,
          lng: longitude,
          timestamp: Date.now()
        };
       
        console.log(`📡 Sending user location to driver ${driverId} in room ${driverRoom}`);
       
        // Send to the specific driver room
        io.to(driverRoom).emit("userLiveLocationUpdate", locationData);
       
        // Also broadcast to all drivers for debugging
        io.emit("userLiveLocationUpdate", locationData);
       
      } catch (error) {
        console.error("❌ Error processing user location update:", error);
      }
    });

    // In socket.js - Add this function to update driver FCM token
    const updateDriverFCMToken = async (driverId, fcmToken) => {
      try {
        console.log(`📱 Updating FCM token for driver: ${driverId}`);
        
        const Driver = require('./models/driver/driver');
        const result = await Driver.findOneAndUpdate(
          { driverId: driverId },
          { 
            fcmToken: fcmToken,
            fcmTokenUpdatedAt: new Date(),
            platform: 'android' // or detect platform
          },
          { new: true, upsert: false }
        );

        if (result) {
          console.log(`✅ FCM token updated for driver: ${driverId}`);
          return true;
        } else {
          console.log(`❌ Driver not found: ${driverId}`);
          return false;
        }
      } catch (error) {
        console.error('❌ Error updating FCM token:', error);
        return false;
      }
    };

    // Add this socket event handler in the connection section
    socket.on("updateFCMToken", async (data, callback) => {
      try {
        const { driverId, fcmToken, platform } = data;
        
        if (!driverId || !fcmToken) {
          if (callback) callback({ success: false, message: 'Missing driverId or fcmToken' });
          return;
        }

        const updated = await updateDriverFCMToken(driverId, fcmToken);
        
        if (callback) {
          callback({ 
            success: updated, 
            message: updated ? 'FCM token updated' : 'Failed to update FCM token' 
          });
        }
      } catch (error) {
        console.error('❌ Error in updateFCMToken:', error);
        if (callback) callback({ success: false, message: error.message });
      }
    });

    // Add this socket event handler for requesting OTP
    socket.on("requestRideOTP", async (data, callback) => {
      try {
        const { rideId } = data;
        
        if (!rideId) {
          if (callback) callback({ success: false, message: "No ride ID provided" });
          return;
        }
        
        // Find the ride in the database
        const ride = await Ride.findOne({ RAID_ID: rideId });
        
        if (!ride) {
          if (callback) callback({ success: false, message: "Ride not found" });
          return;
        }
        
        // Send the OTP back to the driver
        socket.emit("rideOTPUpdate", {
          rideId: rideId,
          otp: ride.otp
        });
        
        if (callback) callback({ success: true, otp: ride.otp });
      } catch (error) {
        console.error("❌ Error requesting ride OTP:", error);
        if (callback) callback({ success: false, message: "Server error" });
      }
    });

    // GET USER DATA FOR DRIVER
    socket.on("getUserDataForDriver", async (data, callback) => {
      try {
        const { rideId } = data;
       
        console.log(`👤 Driver requested user data for ride: ${rideId}`);
       
        const ride = await Ride.findOne({ RAID_ID: rideId }).populate('user');
        if (!ride) {
          if (typeof callback === "function") {
            callback({ success: false, message: "Ride not found" });
          }
          return;
        }
       
        // Get user's current location from tracking map
        let userCurrentLocation = null;
        if (userLocationTracking.has(ride.user.toString())) {
          const userLoc = userLocationTracking.get(ride.user.toString());
          userCurrentLocation = {
            latitude: userLoc.latitude,
            longitude: userLoc.longitude
          };
        }
       
        const userData = {
          success: true,
          rideId: ride.RAID_ID,
          userId: ride.user?._id || ride.user,
          userName: ride.name || "Customer",
          userMobile: rides[rideId]?.userMobile || ride.userMobile || ride.user?.phoneNumber || "N/A",
          userPhoto: ride.user?.profilePhoto || null,
          pickup: ride.pickup,
          drop: ride.drop,
          userCurrentLocation: userCurrentLocation,
          otp: ride.otp,
          fare: ride.fare,
          distance: ride.distance
        };
       
        console.log(`📤 Sending user data to driver for ride ${rideId}`);
       
        if (typeof callback === "function") {
          callback(userData);
        }
       
      } catch (error) {
        console.error("❌ Error getting user data for driver:", error);
        if (typeof callback === "function") {
          callback({ success: false, message: error.message });
        }
      }
    });

    // Handle OTP verification from driver
    socket.on("otpVerified", (data) => {
      try {
        const { rideId, userId } = data;
        console.log(`✅ OTP Verified for ride ${rideId}, notifying user ${userId}`);
        
        // Forward to the specific user
        if (userId) {
          io.to(userId.toString()).emit("otpVerified", data);
          console.log(`✅ OTP verification notification sent to user ${userId}`);
        } else {
          // If userId not provided, find it from the ride
          const ride = rides[rideId];
          if (ride && ride.userId) {
            io.to(ride.userId.toString()).emit("otpVerified", data);
            console.log(`✅ OTP verification notification sent to user ${ride.userId}`);
          }
        }
      } catch (error) {
        console.error("❌ Error handling OTP verification:", error);
      }
    });

    // Update the existing driverStartedRide handler to forward to user
    socket.on("driverStartedRide", async (data) => {
      try {
        const { rideId, driverId, userId } = data;
        console.log(`🚀 Driver started ride: ${rideId}`);
        
        // Update ride status in database
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride) {
          ride.status = "started";
          ride.rideStartTime = new Date();
          await ride.save();
          console.log(`✅ Ride ${rideId} status updated to 'started'`);
        }
        
        // Update in-memory ride status
        if (rides[rideId]) {
          rides[rideId].status = "started";
        }
        
        // Notify user that ride has started AND OTP is verified
        const userRoom = ride.user.toString();
        
        // Method 1: Send ride status update
        io.to(userRoom).emit("rideStatusUpdate", {
          rideId: rideId,
          status: "started",
          message: "Driver has started the ride",
          otpVerified: true,
          timestamp: new Date().toISOString()
        });
        
        // Method 2: Send specific OTP verified event
        io.to(userRoom).emit("otpVerified", {
          rideId: rideId,
          driverId: driverId,
          userId: userId,
          timestamp: new Date().toISOString(),
          otpVerified: true
        });
        
        // Method 3: Send driver started ride event
        io.to(userRoom).emit("driverStartedRide", {
          rideId: rideId,
          driverId: driverId,
          timestamp: new Date().toISOString(),
          otpVerified: true
        });
        
        console.log(`✅ All OTP verification events sent to user room: ${userRoom}`);
        
        // Also notify driver with verification details
        socket.emit("rideStarted", {
          rideId: rideId,
          message: "Ride started successfully"
        });
        
      } catch (error) {
        console.error("❌ Error processing driver started ride:", error);
      }
    });

    // Handle ride status updates from driver
    socket.on("rideStatusUpdate", (data) => {
      try {
        const { rideId, status, userId } = data;
        console.log(`📋 Ride status update: ${rideId} -> ${status}`);
        
        if (status === "started" && data.otpVerified) {
          // Find the user ID from the ride
          const ride = rides[rideId];
          if (ride && ride.userId) {
            io.to(ride.userId.toString()).emit("otpVerified", {
              rideId: rideId,
              status: status,
              otpVerified: true,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.error("❌ Error handling ride status update:", error);
      }
    });

    // REJECT RIDE
    socket.on("rejectRide", (data) => {
      try {
        const { rideId, driverId } = data;
       
        console.log(`\n❌ RIDE REJECTED: ${rideId}`);
        console.log(`🚗 Driver: ${driverId}`);
       
        if (rides[rideId]) {
          rides[rideId].status = "rejected";
          rides[rideId].rejectedAt = Date.now();
         
          // Update driver status back to online
          if (activeDriverSockets.has(driverId)) {
            const driverData = activeDriverSockets.get(driverId);
            driverData.status = "Live";
            driverData.isOnline = true;
            activeDriverSockets.set(driverId, driverData);
           
            socket.emit("driverStatusUpdate", {
              driverId,
              status: "Live"
            });
          }
         
          logRideStatus();
        }
      } catch (error) {
        console.error("❌ Error rejecting ride:", error);
      }
    });
   
    // COMPLETE RIDE
    socket.on("completeRide", async (data) => {
      try {
        const { rideId, driverId, distance, fare } = data;
       
        console.log(`\n🎉 RIDE COMPLETED: ${rideId}`);
        console.log(`🚗 Driver: ${driverId}`);
        console.log(`📏 Distance: ${distance} km`);
        console.log(`💰 Fare: ₹${fare}`);
       
        // Update ride in database
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride) {
          ride.status = "completed";
          ride.completedAt = new Date();
          ride.actualDistance = distance;
          ride.actualFare = fare;
          await ride.save();
          console.log(`✅ Ride ${rideId} marked as completed in database`);
        }
       
        if (rides[rideId]) {
          rides[rideId].status = "completed";
          rides[rideId].completedAt = Date.now();
          rides[rideId].distance = distance;
          rides[rideId].fare = fare;
         
          // Notify the user
          const userId = rides[rideId].userId;
          io.to(userId).emit("rideCompleted", {
            rideId,
            distance,
            charge: fare,
            travelTime: `${Math.round(distance * 10)} mins` // Approximate time
          });
         
          // Update driver status back to online
          if (activeDriverSockets.has(driverId)) {
            const driverData = activeDriverSockets.get(driverId);
            driverData.status = "Live";
            driverData.isOnline = true;
            activeDriverSockets.set(driverId, driverData);
           
            socket.emit("driverStatusUpdate", {
              driverId,
              status: "Live"
            });
          }
         
          // Remove ride after 5 seconds
          setTimeout(() => {
            delete rides[rideId];
            console.log(`🗑️ Removed completed ride: ${rideId}`);
          }, 5000);
         
          logRideStatus();
        }
      } catch (error) {
        console.error("❌ Error completing ride:", error);
      }
    });




    // In /Users/webasebrandings/Downloads/wsback-main/socket.js
// Add after line where you initialize socket.io

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  // Listen for order status updates from admin
  socket.on('adminOrderUpdate', (data) => {
    console.log('🔄 Admin order update:', data);
    
    // Emit to specific user
    if (data.userId) {
      io.to(data.userId).emit('orderStatusUpdate', {
        orderId: data.orderId,
        status: data.status,
        message: `Your order status has been updated to ${data.status}`
      });
    }
    
    // Also broadcast to all admin clients
    socket.broadcast.emit('orderUpdated', data);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});




    // Add to your driver registration
socket.on("driverHeartbeat", ({ driverId, latitude, longitude }) => {
  if (activeDriverSockets.has(driverId)) {
    const driverData = activeDriverSockets.get(driverId);
    driverData.lastUpdate = Date.now();
    driverData.isOnline = true;
    
    // Update location if provided
    if (latitude && longitude) {
      driverData.location = { latitude, longitude };
    }
    
    activeDriverSockets.set(driverId, driverData);
    console.log(`❤️ Heartbeat received from driver: ${driverId}`);
  }
});


    // HANDLE PRICE REQUESTS
    socket.on("getCurrentPrices", (callback) => {
      try {
        console.log('📡 User explicitly requested current prices');
        const currentPrices = ridePriceController.getCurrentPrices();
        console.log('💰 Sending prices in response:', currentPrices);
       
        if (typeof callback === 'function') {
          callback(currentPrices);
        }
        socket.emit('currentPrices', currentPrices);
      } catch (error) {
        console.error('❌ Error handling getCurrentPrices:', error);
        if (typeof callback === 'function') {
          callback({ bike: 0, taxi: 0, port: 0 });
        }
      }
    });

    // DISCONNECT
    socket.on("disconnect", () => {
      console.log(`\n❌ Client disconnected: ${socket.id}`);
      console.log(`📱 Remaining connected clients: ${io.engine.clientsCount - 1}`);
     
      if (socket.driverId) {
        console.log(`🛑 Driver ${socket.driverName} (${socket.driverId}) disconnected`);
       
        // Mark driver as offline but keep in memory for a while
        if (activeDriverSockets.has(socket.driverId)) {
          const driverData = activeDriverSockets.get(socket.driverId);
          driverData.isOnline = false;
          driverData.status = "Offline";
          activeDriverSockets.set(socket.driverId, driverData);
         
          saveDriverLocationToDB(
            socket.driverId,
            socket.driverName,
            driverData.location.latitude,
            driverData.location.longitude,
            driverData.vehicleType,
            "Offline"
          ).catch(console.error);
        }
       
        broadcastDriverLocationsToAllUsers();
        logDriverStatus();
      }
    });
  });
 




  // Clean up ONLY offline drivers every 60 seconds
  setInterval(() => {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    let cleanedCount = 0;
   
    Array.from(activeDriverSockets.entries()).forEach(([driverId, driver]) => {
      if (!driver.isOnline && driver.lastUpdate < fiveMinutesAgo) {
        activeDriverSockets.delete(driverId);
        cleanedCount++;
        console.log(`🧹 Removed offline driver (5+ minutes): ${driver.driverName} (${driverId})`);
      }
    });
   
    // Clean up stale user location tracking (older than 30 minutes)
    const thirtyMinutesAgo = now - 1800000;
    Array.from(userLocationTracking.entries()).forEach(([userId, data]) => {
      if (data.lastUpdate < thirtyMinutesAgo) {
        userLocationTracking.delete(userId);
        cleanedCount++;
        console.log(`🧹 Removed stale user location tracking for user: ${userId}`);
      }
    });
   
    if (cleanedCount > 0) {
      console.log(`\n🧹 Cleaned up ${cleanedCount} stale entries`);
      broadcastDriverLocationsToAllUsers();
      logDriverStatus();
    }
  }, 60000);
}

// GET IO INSTANCE
const getIO = () => {
  if (!io) throw new Error("❌ Socket.io not initialized!");
  return io;
};

module.exports = { init, getIO, broadcastPricesToAllUsers };









// const { Server } = require("socket.io");
// const DriverLocation = require("./models/DriverLocation");
// const Driver = require("./models/driver/driver");
// const Ride = require("./models/ride");
// const RaidId = require("./models/user/raidId");
// const UserLocation = require("./models/user/UserLocation");
// const ridePriceController = require("./controllers/ridePriceController");
// const mongoose = require('mongoose');

// const { sendNotificationToMultipleDrivers } = require("./services/firebaseService");

// let io;
// const rides = {};
// const activeDriverSockets = new Map();
// const processingRides = new Set();
// const userLocationTracking = new Map();



// // In your backend ride booking handler
// async function sendFCMNotifications(drivers, rideData) {
//   try {
//     console.log('📢 Sending FCM notifications to ALL drivers...');
    
//     // Get ALL active drivers with FCM tokens
//     const allDrivers = await Driver.find({ 
//       status: "Live",
//       fcmToken: { $exists: true, $ne: null, $ne: '' }
//     });
    
//     console.log(`📊 Total online drivers: ${allDrivers.length}`);
//     console.log(`📱 Drivers with FCM tokens: ${allDrivers.filter(d => d.fcmToken).length}`);

//     // Always send socket notification as primary method
//     console.log('🔔 Sending socket notification to all drivers...');
//     io.emit("newRideRequest", {
//       ...rideData,
//       rideId: rideData.rideId,
//       _id: savedRide?._id?.toString() || null,
//       timestamp: new Date().toISOString()
//     });

//     // FCM notification to drivers with tokens
//     const driversWithFCM = allDrivers.filter(driver => driver.fcmToken);
    
//     if (driversWithFCM.length > 0) {
//       console.log(`🎯 Sending FCM to ${driversWithFCM.length} drivers`);
      
//       const driverTokens = driversWithFCM.map(driver => driver.fcmToken);
      
//       const notificationData = {
//         type: "ride_request",
//         rideId: rideData.rideId,
//         pickup: JSON.stringify(rideData.pickup || {}),
//         drop: JSON.stringify(rideData.drop || {}),
//         fare: rideData.fare?.toString() || "0",
//         distance: rideData.distance || "0 km",
//         vehicleType: rideData.vehicleType || "taxi",
//         userName: rideData.userName || "Customer",
//         userMobile: rideData.userMobile || "N/A",
//         timestamp: new Date().toISOString(),
//         priority: "high",
//         click_action: "FLUTTER_NOTIFICATION_CLICK"
//       };

//       const fcmResult = await sendNotificationToMultipleDrivers(
//         driverTokens,
//         "🚖 New Ride Request!",
//         `Pickup: ${rideData.pickup?.address?.substring(0, 40) || 'Location'}... | Fare: ₹${rideData.fare}`,
//         notificationData
//       );

//       console.log('📊 FCM Notification Result:', fcmResult);

//       // ✅ CRITICAL FIX: Return proper FCM status
//       return {
//         success: fcmResult.successCount > 0,
//         driversNotified: fcmResult.successCount,
//         totalDrivers: driversWithFCM.length,
//         fcmSent: fcmResult.successCount > 0,
//         fcmMessage: fcmResult.successCount > 0 ? 
//           `FCM sent to ${fcmResult.successCount} drivers` : 
//           `FCM failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
//       };
//     } else {
//       console.log('⚠️ No drivers with FCM tokens found');
//       return {
//         success: false,
//         driversNotified: 0,
//         totalDrivers: 0,
//         fcmSent: false,
//         fcmMessage: "No drivers with FCM tokens available"
//       };
//     }

//   } catch (error) {
//     console.error('❌ Error in notification system:', error);
//     return {
//       success: false,
//       error: error.message,
//       fcmSent: false,
//       fcmMessage: `FCM error: ${error.message}`
//     };
//   }
// };




// // In socket.js
// socket.on("retryFCMNotification", async (data, callback) => {
//   try {
//     const { rideId, retryCount } = data;
    
//     console.log(`🔄 FCM retry attempt #${retryCount} for ride: ${rideId}`);
    
//     // Get ride details
//     const ride = await Ride.findOne({ RAID_ID: rideId });
//     if (!ride) {
//       if (callback) callback({ 
//         success: false, 
//         message: 'Ride not found' 
//       });
//       return;
//     }
    
//     // Get drivers with FCM tokens
//     const driversWithFCM = await Driver.find({ 
//       status: "Live",
//       fcmToken: { $exists: true, $ne: null, $ne: '' }
//     });
    
//     if (driversWithFCM.length === 0) {
//       if (callback) callback({ 
//         success: false, 
//         message: 'No drivers with FCM tokens available' 
//       });
//       return;
//     }
    
//     const driverTokens = driversWithFCM.map(driver => driver.fcmToken);
    
//     // Prepare notification data
//     const notificationData = {
//       type: "ride_request",
//       rideId: rideId,
//       pickup: JSON.stringify(ride.pickup),
//       drop: JSON.stringify(ride.drop),
//       fare: ride.fare.toString(),
//       distance: ride.distance,
//       vehicleType: ride.rideType,
//       userName: ride.name,
//       userMobile: ride.userMobile,
//       timestamp: new Date().toISOString(),
//       priority: "high",
//       click_action: "FLUTTER_NOTIFICATION_CLICK",
//       isRetry: true,
//       retryCount: retryCount
//     };
    
//     // Send notifications
//     const fcmResult = await sendNotificationToMultipleDrivers(
//       driverTokens,
//       "🚖 Ride Request (Retry)",
//       `Retry #${retryCount}: ${ride.pickup?.address?.substring(0, 30)}... | Fare: ₹${ride.fare}`,
//       notificationData
//     );
    
//     if (callback) callback({
//       success: fcmResult.successCount > 0,
//       driversNotified: fcmResult.successCount,
//       message: fcmResult.successCount > 0 ? 
//         `Retry successful: ${fcmResult.successCount} drivers notified` : 
//         `Retry failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
//     });
    
//   } catch (error) {
//     console.error('❌ Error in FCM retry:', error);
//     if (callback) callback({ 
//       success: false, 
//       message: error.message 
//     });
//   }
// });



// const broadcastPricesToAllUsers = () => {
//   try {
//     const currentPrices = ridePriceController.getCurrentPrices();
//     console.log('💰 BROADCASTING PRICES TO ALL USERS:', currentPrices);
   
//     if (io) {
//       io.emit('priceUpdate', currentPrices);
//       io.emit('currentPrices', currentPrices);
//       console.log('✅ Prices broadcasted to all connected users');
//     }
//   } catch (error) {
//     console.error('❌ Error broadcasting prices:', error);
//   }
// };

// // Helper function to log current driver status
// const logDriverStatus = () => {
//   console.log("\n📊 === CURRENT DRIVER STATUS ===");
//   if (activeDriverSockets.size === 0) {
//     console.log("❌ No drivers currently online");
//   } else {
//     console.log(`✅ ${activeDriverSockets.size} drivers currently online:`);
//     activeDriverSockets.forEach((driver, driverId) => {
//       const timeSinceUpdate = Math.floor((Date.now() - driver.lastUpdate) / 1000);
//       console.log(` 🚗 ${driver.driverName} (${driverId})`);
//       console.log(` Status: ${driver.status}`);
//       console.log(` Vehicle: ${driver.vehicleType}`);
//       console.log(` Location: ${driver.location.latitude.toFixed(6)}, ${driver.location.longitude.toFixed(6)}`);
//       console.log(` Last update: ${timeSinceUpdate}s ago`);
//       console.log(` Socket: ${driver.socketId}`);
//       console.log(` Online: ${driver.isOnline ? 'Yes' : 'No'}`);
//     });
//   }
//   console.log("================================\n");
// };

// // Helper function to log ride status
// const logRideStatus = () => {
//   console.log("\n🚕 === CURRENT RIDE STATUS ===");
//   const rideEntries = Object.entries(rides);
//   if (rideEntries.length === 0) {
//     console.log("❌ No active rides");
//   } else {
//     console.log(`✅ ${rideEntries.length} active rides:`);
//     rideEntries.forEach(([rideId, ride]) => {
//       console.log(` 📍 Ride ${rideId}:`);
//       console.log(` Status: ${ride.status}`);
//       console.log(` Driver: ${ride.driverId || 'Not assigned'}`);
//       console.log(` User ID: ${ride.userId}`);
//       console.log(` Customer ID: ${ride.customerId}`);
//       console.log(` User Name: ${ride.userName}`);
//       console.log(` User Mobile: ${ride.userMobile}`);
//       console.log(` Pickup: ${ride.pickup?.address || ride.pickup?.lat + ',' + ride.pickup?.lng}`);
//       console.log(` Drop: ${ride.drop?.address || ride.drop?.lat + ',' + ride.drop?.lng}`);
     
//       if (userLocationTracking.has(ride.userId)) {
//         const userLoc = userLocationTracking.get(ride.userId);
//         console.log(` 📍 USER CURRENT/LIVE LOCATION: ${userLoc.latitude}, ${userLoc.longitude}`);
//         console.log(` 📍 Last location update: ${new Date(userLoc.lastUpdate).toLocaleTimeString()}`);
//       } else {
//         console.log(` 📍 USER CURRENT/LIVE LOCATION: Not available`);
//       }
//     });
//   }
//   console.log("================================\n");
// };

// // Function to log user location updates
// const logUserLocationUpdate = (userId, location, rideId) => {
//   console.log(`\n📍 === USER LOCATION UPDATE ===`);
//   console.log(`👤 User ID: ${userId}`);
//   console.log(`🚕 Ride ID: ${rideId}`);
//   console.log(`🗺️ Current Location: ${location.latitude}, ${location.longitude}`);
//   console.log(`⏰ Update Time: ${new Date().toLocaleTimeString()}`);
//   console.log("================================\n");
// };

// // Function to save user location to database
// const saveUserLocationToDB = async (userId, latitude, longitude, rideId = null) => {
//   try {
//     const userLocation = new UserLocation({
//       userId,
//       latitude,
//       longitude,
//       rideId,
//       timestamp: new Date()
//     });
   
//     await userLocation.save();
//     console.log(`💾 Saved user location to DB: User ${userId}, Ride ${rideId}, Location: ${latitude}, ${longitude}`);
//     return true;
//   } catch (error) {
//     console.error("❌ Error saving user location to DB:", error);
//     return false;
//   }
// };

// // Test the RaidId model on server startup
// async function testRaidIdModel() {
//   try {
//     console.log('🧪 Testing RaidId model...');
//     const testDoc = await RaidId.findOne({ _id: 'raidId' });
//     console.log('🧪 RaidId document:', testDoc);
   
//     if (!testDoc) {
//       console.log('🧪 Creating initial RaidId document');
//       const newDoc = new RaidId({ _id: 'raidId', sequence: 100000 });
//       await newDoc.save();
//       console.log('🧪 Created initial RaidId document');
//     }
//   } catch (error) {
//     console.error('❌ Error testing RaidId model:', error);
//   }
// }

// // RAID_ID generation function
// async function generateSequentialRaidId() {
//   try {
//     console.log('🔢 Starting RAID_ID generation');
   
//     const raidIdDoc = await RaidId.findOneAndUpdate(
//       { _id: 'raidId' },
//       { $inc: { sequence: 1 } },
//       { new: true, upsert: true }
//     );
   
//     console.log('🔢 RAID_ID document:', raidIdDoc);
//     let sequenceNumber = raidIdDoc.sequence;
//     console.log('🔢 Sequence number:', sequenceNumber);
    
//     if (sequenceNumber > 999999) {
//       console.log('🔄 Resetting sequence to 100000');
//       await RaidId.findOneAndUpdate(
//         { _id: 'raidId' },
//         { sequence: 100000 }
//       );
//       sequenceNumber = 100000;
//     }
    
//     const formattedSequence = sequenceNumber.toString().padStart(6, '0');
//     const raidId = `RID${formattedSequence}`;
//     console.log(`🔢 Generated RAID_ID: ${raidId}`);
   
//     return raidId;
//   } catch (error) {
//     console.error('❌ Error generating sequential RAID_ID:', error);
   
//     const timestamp = Date.now().toString().slice(-6);
//     const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
//     const fallbackId = `RID${timestamp}${random}`;
//     console.log(`🔄 Using fallback ID: ${fallbackId}`);
   
//     return fallbackId;
//   }
// }

// // Helper function to save driver location to database
// async function saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType, status = "Live") {
//   try {
//     const locationDoc = new DriverLocation({
//       driverId,
//       driverName,
//       latitude,
//       longitude,
//       vehicleType,
//       status,
//       timestamp: new Date()
//     });
   
//     await locationDoc.save();
//     console.log(`💾 Saved location for driver ${driverId} (${driverName}) to database`);
//     return true;
//   } catch (error) {
//     console.error("❌ Error saving driver location to DB:", error);
//     return false;
//   }
// }

// // Helper function to broadcast driver locations to all users
// function broadcastDriverLocationsToAllUsers() {
//   const drivers = Array.from(activeDriverSockets.values())
//     .filter(driver => driver.isOnline)
//     .map(driver => ({
//       driverId: driver.driverId,
//       name: driver.driverName,
//       location: {
//         coordinates: [driver.location.longitude, driver.location.latitude]
//       },
//       vehicleType: driver.vehicleType,
//       status: driver.status,
//       lastUpdate: driver.lastUpdate
//     }));
 
//   io.emit("driverLocationsUpdate", { drivers });
// }

// const init = (server) => {
//   io = new Server(server, {
//     cors: {
//       origin: "*",
//       methods: ["GET", "POST"]
//     },
//   });
 
//   // Test the RaidId model on startup
//   testRaidIdModel();
 
//   // Log server status every 2 seconds
//   setInterval(() => {
//     console.log(`\n⏰ ${new Date().toLocaleString()} - Server Status Check`);
//     logDriverStatus();
//     logRideStatus();
//   }, 2000);
 
//   // Broadcast prices when server starts
//   setTimeout(() => {
//     console.log('🚀 Server started, broadcasting initial prices...');
//     broadcastPricesToAllUsers();
//   }, 3000);
 
//   io.on("connection", (socket) => {
//     console.log(`\n⚡ New client connected: ${socket.id}`);
//     console.log(`📱 Total connected clients: ${io.engine.clientsCount}`);
   
//     // IMMEDIATELY SEND PRICES TO NEWLY CONNECTED CLIENT
//     console.log('💰 Sending current prices to new client:', socket.id);
//     try {
//       const currentPrices = ridePriceController.getCurrentPrices();
//       console.log('💰 Current prices from controller:', currentPrices);
//       socket.emit('currentPrices', currentPrices);
//       socket.emit('priceUpdate', currentPrices);
//     } catch (error) {
//       console.error('❌ Error sending prices to new client:', error);
//     }

//     // DRIVER LOCATION UPDATE
//     socket.on("driverLocationUpdate", async (data) => {
//       try {
//         const { driverId, latitude, longitude, status } = data;
       
//         console.log(`📍 REAL-TIME: Driver ${driverId} location update received`);
       
//         // Update driver in activeDriverSockets
//         if (activeDriverSockets.has(driverId)) {
//           const driverData = activeDriverSockets.get(driverId);
//           driverData.location = { latitude, longitude };
//           driverData.lastUpdate = Date.now();
//           driverData.status = status || "Live";
//           driverData.isOnline = true;
//           activeDriverSockets.set(driverId, driverData);
//         }
       
//         // Broadcast to ALL connected users in REAL-TIME
//         io.emit("driverLiveLocationUpdate", {
//           driverId: driverId,
//           lat: latitude,
//           lng: longitude,
//           status: status || "Live",
//           vehicleType: "taxi",
//           timestamp: Date.now()
//         });
       
//         // Also update database
//         const driverData = activeDriverSockets.get(driverId);
//         await saveDriverLocationToDB(
//           driverId,
//           driverData?.driverName || "Unknown",
//           latitude,
//           longitude,
//           "taxi",
//           status || "Live"
//         );
       
//       } catch (error) {
//         console.error("❌ Error processing driver location update:", error);
//       }
//     });
   
//     // DRIVER LIVE LOCATION UPDATE
//     socket.on("driverLiveLocationUpdate", async ({ driverId, driverName, lat, lng }) => {
//       try {
//         if (activeDriverSockets.has(driverId)) {
//           const driverData = activeDriverSockets.get(driverId);
//           driverData.location = { latitude: lat, longitude: lng };
//           driverData.lastUpdate = Date.now();
//           driverData.isOnline = true;
//           activeDriverSockets.set(driverId, driverData);
         
//           // Save to database immediately
//           await saveDriverLocationToDB(driverId, driverName, lat, lng, driverData.vehicleType);
         
//           // Broadcast real-time update to ALL users
//           io.emit("driverLiveLocationUpdate", {
//             driverId: driverId,
//             lat: lat,
//             lng: lng,
//             status: driverData.status,
//             vehicleType: driverData.vehicleType,
//             timestamp: Date.now()
//           });
//         }
//       } catch (error) {
//         console.error("❌ Error updating driver location:", error);
//       }
//     });
   
//     // USER REGISTRATION
//     socket.on('registerUser', ({ userId, userMobile }) => {
//       if (!userId) {
//         console.error('❌ No userId provided for user registration');
//         return;
//       }
     
//       socket.userId = userId.toString();
//       socket.join(userId.toString());
     
//       console.log(`👤 USER REGISTERED SUCCESSFULLY: ${userId}`);
//     });
   
//     // DRIVER REGISTRATION
//     socket.on("registerDriver", async ({ driverId, driverName, latitude, longitude, vehicleType = "taxi" }) => {
//       try {
//         console.log(`\n📝 DRIVER REGISTRATION: ${driverName} (${driverId})`);
       
//         if (!driverId) {
//           console.log("❌ Registration failed: No driverId provided");
//           return;
//         }
       
//         if (!latitude || !longitude) {
//           console.log("❌ Registration failed: Invalid location");
//           return;
//         }
        
//         socket.driverId = driverId;
//         socket.driverName = driverName;
       
//         // Store driver connection info
//         activeDriverSockets.set(driverId, {
//           socketId: socket.id,
//           driverId,
//           driverName,
//           location: { latitude, longitude },
//           vehicleType,
//           lastUpdate: Date.now(),
//           status: "Live",
//           isOnline: true
//         });
       
//         // Join driver to rooms
//         socket.join("allDrivers");
//         socket.join(`driver_${driverId}`);
       
//         console.log(`✅ DRIVER REGISTERED SUCCESSFULLY: ${driverName} (${driverId})`);
       
//         // Save initial location to database
//         await saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType);
       
//         // Broadcast updated driver list to ALL connected users
//         broadcastDriverLocationsToAllUsers();
       
//         // Send confirmation to driver
//         socket.emit("driverRegistrationConfirmed", {
//           success: true,
//           message: "Driver registered successfully"
//         });
       
//       } catch (error) {
//         console.error("❌ Error registering driver:", error);
       
//         socket.emit("driverRegistrationConfirmed", {
//           success: false,
//           message: "Registration failed: " + error.message
//         });
//       }
//     });

//     // REQUEST NEARBY DRIVERS
//     socket.on("requestNearbyDrivers", ({ latitude, longitude, radius = 5000 }) => {
//       try {
//         console.log(`\n🔍 USER REQUESTED NEARBY DRIVERS: ${socket.id}`);
        
//         // Get all active drivers (only those who are online)
//         const drivers = Array.from(activeDriverSockets.values())
//           .filter(driver => driver.isOnline)
//           .map(driver => ({
//             driverId: driver.driverId,
//             name: driver.driverName,
//             location: {
//               coordinates: [driver.location.longitude, driver.location.latitude]
//             },
//             vehicleType: driver.vehicleType,
//             status: driver.status,
//             lastUpdate: driver.lastUpdate
//           }));

//         console.log(`📊 Online drivers: ${drivers.length}`);
        
//         // Send to the requesting client only
//         socket.emit("nearbyDriversResponse", { drivers });
//       } catch (error) {
//         console.error("❌ Error fetching nearby drivers:", error);
//         socket.emit("nearbyDriversResponse", { drivers: [] });
//       }
//     });

//     // BOOK RIDE
//     socket.on("bookRide", async (data, callback) => {
//       let rideId;
//       try {
//             console.log('🚨 ===== REAL USER RIDE BOOKING =====');
//     console.log('📦 User App Data:', {
//       userId: data.userId,
//       customerId: data.customerId, 
//       vehicleType: data.vehicleType,
//       _source: data._source || 'unknown'
//     });

//         const { userId, customerId, userName, userMobile, pickup, drop, vehicleType, estimatedPrice, distance, travelTime, wantReturn } = data;
//         console.log('📥 Received bookRide request');
        
//         // Calculate price on backend using admin prices
//         const distanceKm = parseFloat(distance);
//         console.log(`📏 Backend calculating price for ${distanceKm}km ${vehicleType}`);
       
//         const backendCalculatedPrice = await ridePriceController.calculateRidePrice(vehicleType, distanceKm);
       
//         console.log(`💰 Frontend sent price: ₹${estimatedPrice}, Backend calculated: ₹${backendCalculatedPrice}`);
       
//         // Use the backend calculated price (admin prices)
//         const finalPrice = backendCalculatedPrice;
       
//         // Generate sequential RAID_ID on backend
//         rideId = await generateSequentialRaidId();
//         console.log(`🆔 Generated RAID_ID: ${rideId}`);
//         console.log(`💰 USING BACKEND CALCULATED PRICE: ₹${finalPrice}`);
        
//         let otp;
//         if (customerId && customerId.length >= 4) {
//           otp = customerId.slice(-4);
//         } else {
//           otp = Math.floor(1000 + Math.random() * 9000).toString();
//         }
        
//         // Check if this ride is already being processed
//         if (processingRides.has(rideId)) {
//           console.log(`⏭️ Ride ${rideId} is already being processed, skipping`);
//           if (callback) {
//             callback({
//               success: false,
//               message: "Ride is already being processed"
//             });
//           }
//           return;
//         }
       
//         // Add to processing set
//         processingRides.add(rideId);
        
//         // Validate required fields
//         if (!userId || !customerId || !userName || !pickup || !drop) {
//           console.error("❌ Missing required fields");
//           processingRides.delete(rideId);
//           if (callback) {
//             callback({
//               success: false,
//               message: "Missing required fields"
//             });
//           }
//           return;
//         }

//         // Check if ride with this ID already exists in database
//         const existingRide = await Ride.findOne({ RAID_ID: rideId });
//         if (existingRide) {
//           console.log(`⏭️ Ride ${rideId} already exists in database, skipping`);
//           processingRides.delete(rideId);
//           if (callback) {
//             callback({
//               success: true,
//               rideId: rideId,
//               _id: existingRide._id.toString(),
//               otp: existingRide.otp,
//               message: "Ride already exists"
//             });
//           }
//           return;
//         }

//         // Create a new ride document in MongoDB - USE BACKEND CALCULATED PRICE
//         const rideData = {
//           user: userId,
//           customerId: customerId,
//           name: userName,
//           userMobile: userMobile || "N/A",
//           RAID_ID: rideId,
//           pickupLocation: pickup.address || "Selected Location",
//           dropoffLocation: drop.address || "Selected Location",
//           pickupCoordinates: {
//             latitude: pickup.lat,
//             longitude: pickup.lng
//           },
//           dropoffCoordinates: {
//             latitude: drop.lat,
//             longitude: drop.lng
//           },
//           fare: finalPrice, // USE BACKEND CALCULATED PRICE
//           rideType: vehicleType,
//           otp: otp,
//           distance: distance || "0 km",
//           travelTime: travelTime || "0 mins",
//           isReturnTrip: wantReturn || false,
//           status: "pending",
//           Raid_date: new Date(),
//           Raid_time: new Date().toLocaleTimeString('en-US', {
//             timeZone: 'Asia/Kolkata',
//             hour12: true
//           }),
//           pickup: {
//             addr: pickup.address || "Selected Location",
//             lat: pickup.lat,
//             lng: pickup.lng,
//           },
//           drop: {
//             addr: drop.address || "Selected Location",
//             lat: drop.lat,
//             lng: drop.lng,
//           },
//           price: finalPrice, // USE BACKEND CALCULATED PRICE
//           distanceKm: distanceKm || 0
//         };

//         // Create and save the ride
//         const newRide = new Ride(rideData);
//         const savedRide = await newRide.save();
//         console.log(`💾 Ride saved to MongoDB with ID: ${savedRide._id}`);
//         console.log(`💾 BACKEND PRICE SAVED: ₹${savedRide.fare}`);

//         // Store ride data in memory for socket operations
//         rides[rideId] = {
//           ...data,
//           rideId: rideId,
//           status: "pending",
//           timestamp: Date.now(),
//           _id: savedRide._id.toString(),
//           userLocation: { latitude: pickup.lat, longitude: pickup.lng },
//           fare: finalPrice
//         };

//         // Initialize user location tracking
//         userLocationTracking.set(userId, {
//           latitude: pickup.lat,
//           longitude: pickup.lng,
//           lastUpdate: Date.now(),
//           rideId: rideId
//         });

//         // Save initial user location to database
//         await saveUserLocationToDB(userId, pickup.lat, pickup.lng, rideId);


//             console.log('🚨 EMERGENCY: Sending real-time notifications');
  
//             // In socket.js bookRide handler - After FCM call
// const notificationResult = await sendRideRequestToAllDrivers({
//   ...data,
//   rideId: rideId,
//   fare: finalPrice
// }, savedRide);

// console.log('📱 REAL BOOKING FCM RESULT:', notificationResult);

// // ✅ CRITICAL: Include notificationResult in callback
// if (callback) {
//   callback({
//     success: true,
//     rideId: rideId,
//     _id: savedRide._id.toString(),
//     otp: otp,
//     message: "Ride booked successfully!",
//     notificationResult: notificationResult // ✅ THIS MUST BE INCLUDED
//   });
// }

//     console.log('📊 REAL-TIME NOTIFICATION RESULT:', notificationResult);

//     // Also send socket notification as backup
//     io.emit("newRideRequest", {
//       ...data,
//       rideId: rideId,
//       _id: savedRide._id.toString(),
//       emergency: true
//     });

//         if (callback) {
//           callback({
//             success: true,
//             rideId: rideId,
//             _id: savedRide._id.toString(),
//             otp: otp,
//             message: "Ride booked successfully!",
//     notificationResult: notificationResult // ✅ Include notification result in response
//           });
//         }

//         // Send notifications to nearby drivers via FCM
//         const nearbyDrivers = Array.from(activeDriverSockets.values())
//           .filter(driver => driver.isOnline && driver.status === "Live")
//           .map(driver => driver.driverId);


//       } catch (error) {
//         console.error("❌ Error booking ride:", error);
       
//         if (error.name === 'ValidationError') {
//           const errors = Object.values(error.errors).map(err => err.message);
//           console.error("❌ Validation errors:", errors);
         
//           if (callback) {
//             callback({
//               success: false,
//               message: `Validation failed: ${errors.join(', ')}`
//             });
//           }
//         } else if (error.code === 11000 && error.keyPattern && error.keyPattern.RAID_ID) {
//           console.log(`🔄 Duplicate RAID_ID detected: ${rideId}`);
         
//           try {
//             const existingRide = await Ride.findOne({ RAID_ID: rideId });
//             if (existingRide && callback) {
//               callback({
//                 success: true,
//                 rideId: rideId,
//                 _id: existingRide._id.toString(),
//                 otp: existingRide.otp,
//                 message: "Ride already exists (duplicate handled)"
//               });
//             }
//           } catch (findError) {
//             console.error("❌ Error finding existing ride:", findError);
//             if (callback) {
//               callback({
//                 success: false,
//                 message: "Failed to process ride booking (duplicate error)"
//               });
//             }
//           }
//         } else {
//           if (callback) {
//             callback({
//               success: false,
//               message: "Failed to process ride booking"
//             });
//           }
//         }
//       } finally {
//         // Always remove from processing set
//         if (rideId) {
//           processingRides.delete(rideId);
//         }
//       }
//     });

//     // JOIN ROOM
//     socket.on('joinRoom', async (data) => {
//       try {
//         const { userId } = data;
//         if (userId) {
//           socket.join(userId.toString());
//           console.log(`✅ User ${userId} joined their room via joinRoom event`);
//         }
//       } catch (error) {
//         console.error('Error in joinRoom:', error);
//       }
//     });

//     // ACCEPT RIDE
//     socket.on("acceptRide", async (data, callback) => {
//       const { rideId, driverId, driverName } = data;
//       console.log("🚨 ===== BACKEND ACCEPT RIDE START =====");
//       console.log("📥 Acceptance Data:", { rideId, driverId, driverName });
      
//       try {
//         // FIND RIDE IN DATABASE
//         console.log(`🔍 Looking for ride: ${rideId}`);
//         const ride = await Ride.findOne({ RAID_ID: rideId });
       
//         if (!ride) {
//           console.error(`❌ Ride ${rideId} not found in database`);
//           if (typeof callback === "function") {
//             callback({ success: false, message: "Ride not found" });
//           }
//           return;
//         }
        
//         console.log(`✅ Found ride: ${ride.RAID_ID}, Status: ${ride.status}`);

//         // CHECK IF RIDE IS ALREADY ACCEPTED
//         if (ride.status === "accepted") {
//           console.log(`🚫 Ride ${rideId} already accepted by: ${ride.driverId}`);
         
//           socket.broadcast.emit("rideAlreadyAccepted", {
//             rideId,
//             message: "This ride has already been accepted by another driver."
//           });
         
//           if (typeof callback === "function") {
//             callback({
//               success: false,
//               message: "This ride has already been accepted by another driver."
//             });
//           }
//           return;
//         }

//         // UPDATE RIDE STATUS
//         console.log(`🔄 Updating ride status to 'accepted'`);
//         ride.status = "accepted";
//         ride.driverId = driverId;
//         ride.driverName = driverName;

//         // GET DRIVER DETAILS
//         const driver = await Driver.findOne({ driverId });
       
//         if (driver) {
//           ride.driverMobile = driver.phone;
//           console.log(`📱 Driver mobile: ${driver.phone}`);
//         } else {
//           ride.driverMobile = "N/A";
//           console.log(`⚠️ Driver not found in Driver collection`);
//         }

//         // ENSURE OTP EXISTS
//         if (!ride.otp) {
//           const otp = Math.floor(1000 + Math.random() * 9000).toString();
//           ride.otp = otp;
//           console.log(`🔢 Generated new OTP: ${otp}`);
//         }

//         // SAVE TO DATABASE
//         await ride.save();
//         console.log(`💾 Ride saved successfully`);

//         // Update in-memory ride status if exists
//         if (rides[rideId]) {
//           rides[rideId].status = "accepted";
//           rides[rideId].driverId = driverId;
//           rides[rideId].driverName = driverName;
//         }

//         // SEND NOTIFICATION TO USER (if user has FCM token)
//         try {
//           const User = require('./models/User');
//           const user = await User.findById(ride.user);
          
//           if (user && user.fcmToken) {
//             // You can implement sendNotificationToUser here
//             console.log(`📢 Ride accepted notification would be sent to user: ${user._id}`);
//           }
//         } catch (notificationError) {
//           console.error("❌ Error sending ride accepted notification:", notificationError);
//         }

//         const driverData = {
//           success: true,
//           rideId: ride.RAID_ID,
//           driverId: driverId,
//           driverName: driverName,
//           driverMobile: ride.driverMobile,
//           driverLat: driver?.location?.coordinates?.[1] || 0,
//           driverLng: driver?.location?.coordinates?.[0] || 0,
//           otp: ride.otp,
//           pickup: ride.pickup,
//           drop: ride.drop,
//           status: ride.status,
//           vehicleType: driver?.vehicleType || "taxi",
//           userName: ride.name,
//           userMobile: rides[rideId]?.userMobile || ride.userMobile || "N/A",
//           timestamp: new Date().toISOString(),
//           fare: ride.fare || ride.price || 0,
//           distance: ride.distance || "0 km"
//         };

//         // SEND CONFIRMATION TO DRIVER
//         if (typeof callback === "function") {
//           console.log("📨 Sending callback to driver");
//           callback(driverData);
//         }

//         // NOTIFY USER WITH MULTIPLE CHANNELS
//         const userRoom = ride.user.toString();
//         console.log(`📡 Notifying user room: ${userRoom}`);
       
//         // Method 1: Standard room emission
//         io.to(userRoom).emit("rideAccepted", driverData);
//         console.log("✅ Notification sent via standard room channel");
        
//         // Method 2: Direct to all sockets in room
//         const userSockets = await io.in(userRoom).fetchSockets();
//         console.log(`🔍 Found ${userSockets.length} sockets in user room`);
//         userSockets.forEach((userSocket, index) => {
//           userSocket.emit("rideAccepted", driverData);
//         });

//         // Method 3: Global emit with user filter
//         io.emit("rideAcceptedGlobal", {
//           ...driverData,
//           targetUserId: userRoom,
//           timestamp: new Date().toISOString()
//         });

//         // Method 4: Backup delayed emission
//         setTimeout(() => {
//           io.to(userRoom).emit("rideAccepted", driverData);
//           console.log("✅ Backup notification sent after delay");
//         }, 1000);

//         // Send user data to the driver who accepted the ride
//         const userDataForDriver = {
//           success: true,
//           rideId: ride.RAID_ID,
//           userId: ride.user,
//           customerId: ride.customerId,
//           userName: ride.name,
//           userMobile: rides[rideId]?.userMobile || ride.userMobile || "N/A",
//           pickup: ride.pickup,
//           drop: ride.drop,
//           otp: ride.otp,
//           status: ride.status,
//           timestamp: new Date().toISOString()
//         };

//         // Send to the specific driver socket
//         const driverSocket = Array.from(io.sockets.sockets.values()).find(s => s.driverId === driverId);
//         if (driverSocket) {
//           driverSocket.emit("userDataForDriver", userDataForDriver);
//           console.log("✅ User data sent to driver:", driverId);
//         } else {
//           io.to(`driver_${driverId}`).emit("userDataForDriver", userDataForDriver);
//           console.log("✅ User data sent to driver room:", driverId);
//         }

//         // NOTIFY OTHER DRIVERS
//         socket.broadcast.emit("rideAlreadyAccepted", {
//           rideId,
//           message: "This ride has already been accepted by another driver."
//         });

//         console.log("📢 Other drivers notified");

//         // UPDATE DRIVER STATUS IN MEMORY
//         if (activeDriverSockets.has(driverId)) {
//           const driverInfo = activeDriverSockets.get(driverId);
//           driverInfo.status = "onRide";
//           driverInfo.isOnline = true;
//           activeDriverSockets.set(driverId, driverInfo);
//           console.log(`🔄 Updated driver ${driverId} status to 'onRide'`);
//         }

//         console.log(`🎉 RIDE ${rideId} ACCEPTED SUCCESSFULLY BY ${driverName}`);
//       } catch (error) {
//         console.error(`❌ ERROR ACCEPTING RIDE ${rideId}:`, error);
//         console.error("Stack:", error.stack);
       
//         if (typeof callback === "function") {
//           callback({
//             success: false,
//             message: "Server error: " + error.message
//           });
//         }
//       }
//     });

//     // USER LOCATION UPDATE
//     socket.on("userLocationUpdate", async (data) => {
//       try {
//         const { userId, rideId, latitude, longitude } = data;
       
//         console.log(`📍 USER LOCATION UPDATE: User ${userId} for ride ${rideId}`);
       
//         // Update user location in tracking map
//         userLocationTracking.set(userId, {
//           latitude,
//           longitude,
//           lastUpdate: Date.now(),
//           rideId: rideId
//         });
       
//         // Log the location update
//         logUserLocationUpdate(userId, { latitude, longitude }, rideId);
       
//         // Save to database
//         await saveUserLocationToDB(userId, latitude, longitude, rideId);
       
//         // Update in-memory ride data if exists
//         if (rides[rideId]) {
//           rides[rideId].userLocation = { latitude, longitude };
//           console.log(`✅ Updated user location in memory for ride ${rideId}`);
//         }
       
//         // Find driver ID
//         let driverId = null;
       
//         // Check in-memory rides first
//         if (rides[rideId] && rides[rideId].driverId) {
//           driverId = rides[rideId].driverId;
//           console.log(`✅ Found driver ID in memory: ${driverId} for ride ${rideId}`);
//         } else {
//           // If not in memory, check database
//           const ride = await Ride.findOne({ RAID_ID: rideId });
//           if (ride && ride.driverId) {
//             driverId = ride.driverId;
//             console.log(`✅ Found driver ID in database: ${driverId} for ride ${rideId}`);
           
//             // Update in-memory ride data
//             if (!rides[rideId]) {
//               rides[rideId] = {};
//             }
//             rides[rideId].driverId = driverId;
//           } else {
//             console.log(`❌ No driver assigned for ride ${rideId} in database either`);
//             return;
//           }
//         }
       
//         // Send user location to the specific driver
//         const driverRoom = `driver_${driverId}`;
//         const locationData = {
//           rideId: rideId,
//           userId: userId,
//           lat: latitude,
//           lng: longitude,
//           timestamp: Date.now()
//         };
       
//         console.log(`📡 Sending user location to driver ${driverId} in room ${driverRoom}`);
       
//         // Send to the specific driver room
//         io.to(driverRoom).emit("userLiveLocationUpdate", locationData);
       
//         // Also broadcast to all drivers for debugging
//         io.emit("userLiveLocationUpdate", locationData);
       
//       } catch (error) {
//         console.error("❌ Error processing user location update:", error);
//       }
//     });

//     // In socket.js - Add this function to update driver FCM token
//     const updateDriverFCMToken = async (driverId, fcmToken) => {
//       try {
//         console.log(`📱 Updating FCM token for driver: ${driverId}`);
        
//         const Driver = require('./models/driver/driver');
//         const result = await Driver.findOneAndUpdate(
//           { driverId: driverId },
//           { 
//             fcmToken: fcmToken,
//             fcmTokenUpdatedAt: new Date(),
//             platform: 'android' // or detect platform
//           },
//           { new: true, upsert: false }
//         );

//         if (result) {
//           console.log(`✅ FCM token updated for driver: ${driverId}`);
//           return true;
//         } else {
//           console.log(`❌ Driver not found: ${driverId}`);
//           return false;
//         }
//       } catch (error) {
//         console.error('❌ Error updating FCM token:', error);
//         return false;
//       }
//     };

//     // Add this socket event handler in the connection section
//     socket.on("updateFCMToken", async (data, callback) => {
//       try {
//         const { driverId, fcmToken, platform } = data;
        
//         if (!driverId || !fcmToken) {
//           if (callback) callback({ success: false, message: 'Missing driverId or fcmToken' });
//           return;
//         }

//         const updated = await updateDriverFCMToken(driverId, fcmToken);
        
//         if (callback) {
//           callback({ 
//             success: updated, 
//             message: updated ? 'FCM token updated' : 'Failed to update FCM token' 
//           });
//         }
//       } catch (error) {
//         console.error('❌ Error in updateFCMToken:', error);
//         if (callback) callback({ success: false, message: error.message });
//       }
//     });

//     // Add this socket event handler for requesting OTP
//     socket.on("requestRideOTP", async (data, callback) => {
//       try {
//         const { rideId } = data;
        
//         if (!rideId) {
//           if (callback) callback({ success: false, message: "No ride ID provided" });
//           return;
//         }
        
//         // Find the ride in the database
//         const ride = await Ride.findOne({ RAID_ID: rideId });
        
//         if (!ride) {
//           if (callback) callback({ success: false, message: "Ride not found" });
//           return;
//         }
        
//         // Send the OTP back to the driver
//         socket.emit("rideOTPUpdate", {
//           rideId: rideId,
//           otp: ride.otp
//         });
        
//         if (callback) callback({ success: true, otp: ride.otp });
//       } catch (error) {
//         console.error("❌ Error requesting ride OTP:", error);
//         if (callback) callback({ success: false, message: "Server error" });
//       }
//     });

//     // GET USER DATA FOR DRIVER
//     socket.on("getUserDataForDriver", async (data, callback) => {
//       try {
//         const { rideId } = data;
       
//         console.log(`👤 Driver requested user data for ride: ${rideId}`);
       
//         const ride = await Ride.findOne({ RAID_ID: rideId }).populate('user');
//         if (!ride) {
//           if (typeof callback === "function") {
//             callback({ success: false, message: "Ride not found" });
//           }
//           return;
//         }
       
//         // Get user's current location from tracking map
//         let userCurrentLocation = null;
//         if (userLocationTracking.has(ride.user.toString())) {
//           const userLoc = userLocationTracking.get(ride.user.toString());
//           userCurrentLocation = {
//             latitude: userLoc.latitude,
//             longitude: userLoc.longitude
//           };
//         }
       
//         const userData = {
//           success: true,
//           rideId: ride.RAID_ID,
//           userId: ride.user?._id || ride.user,
//           userName: ride.name || "Customer",
//           userMobile: rides[rideId]?.userMobile || ride.userMobile || ride.user?.phoneNumber || "N/A",
//           userPhoto: ride.user?.profilePhoto || null,
//           pickup: ride.pickup,
//           drop: ride.drop,
//           userCurrentLocation: userCurrentLocation,
//           otp: ride.otp,
//           fare: ride.fare,
//           distance: ride.distance
//         };
       
//         console.log(`📤 Sending user data to driver for ride ${rideId}`);
       
//         if (typeof callback === "function") {
//           callback(userData);
//         }
       
//       } catch (error) {
//         console.error("❌ Error getting user data for driver:", error);
//         if (typeof callback === "function") {
//           callback({ success: false, message: error.message });
//         }
//       }
//     });

//     // Handle OTP verification from driver
//     socket.on("otpVerified", (data) => {
//       try {
//         const { rideId, userId } = data;
//         console.log(`✅ OTP Verified for ride ${rideId}, notifying user ${userId}`);
        
//         // Forward to the specific user
//         if (userId) {
//           io.to(userId.toString()).emit("otpVerified", data);
//           console.log(`✅ OTP verification notification sent to user ${userId}`);
//         } else {
//           // If userId not provided, find it from the ride
//           const ride = rides[rideId];
//           if (ride && ride.userId) {
//             io.to(ride.userId.toString()).emit("otpVerified", data);
//             console.log(`✅ OTP verification notification sent to user ${ride.userId}`);
//           }
//         }
//       } catch (error) {
//         console.error("❌ Error handling OTP verification:", error);
//       }
//     });

//     // Update the existing driverStartedRide handler to forward to user
//     socket.on("driverStartedRide", async (data) => {
//       try {
//         const { rideId, driverId, userId } = data;
//         console.log(`🚀 Driver started ride: ${rideId}`);
        
//         // Update ride status in database
//         const ride = await Ride.findOne({ RAID_ID: rideId });
//         if (ride) {
//           ride.status = "started";
//           ride.rideStartTime = new Date();
//           await ride.save();
//           console.log(`✅ Ride ${rideId} status updated to 'started'`);
//         }
        
//         // Update in-memory ride status
//         if (rides[rideId]) {
//           rides[rideId].status = "started";
//         }
        
//         // Notify user that ride has started AND OTP is verified
//         const userRoom = ride.user.toString();
        
//         // Method 1: Send ride status update
//         io.to(userRoom).emit("rideStatusUpdate", {
//           rideId: rideId,
//           status: "started",
//           message: "Driver has started the ride",
//           otpVerified: true,
//           timestamp: new Date().toISOString()
//         });
        
//         // Method 2: Send specific OTP verified event
//         io.to(userRoom).emit("otpVerified", {
//           rideId: rideId,
//           driverId: driverId,
//           userId: userId,
//           timestamp: new Date().toISOString(),
//           otpVerified: true
//         });
        
//         // Method 3: Send driver started ride event
//         io.to(userRoom).emit("driverStartedRide", {
//           rideId: rideId,
//           driverId: driverId,
//           timestamp: new Date().toISOString(),
//           otpVerified: true
//         });
        
//         console.log(`✅ All OTP verification events sent to user room: ${userRoom}`);
        
//         // Also notify driver with verification details
//         socket.emit("rideStarted", {
//           rideId: rideId,
//           message: "Ride started successfully"
//         });
        
//       } catch (error) {
//         console.error("❌ Error processing driver started ride:", error);
//       }
//     });

//     // Handle ride status updates from driver
//     socket.on("rideStatusUpdate", (data) => {
//       try {
//         const { rideId, status, userId } = data;
//         console.log(`📋 Ride status update: ${rideId} -> ${status}`);
        
//         if (status === "started" && data.otpVerified) {
//           // Find the user ID from the ride
//           const ride = rides[rideId];
//           if (ride && ride.userId) {
//             io.to(ride.userId.toString()).emit("otpVerified", {
//               rideId: rideId,
//               status: status,
//               otpVerified: true,
//               timestamp: new Date().toISOString()
//             });
//           }
//         }
//       } catch (error) {
//         console.error("❌ Error handling ride status update:", error);
//       }
//     });

//     // REJECT RIDE
//     socket.on("rejectRide", (data) => {
//       try {
//         const { rideId, driverId } = data;
       
//         console.log(`\n❌ RIDE REJECTED: ${rideId}`);
//         console.log(`🚗 Driver: ${driverId}`);
       
//         if (rides[rideId]) {
//           rides[rideId].status = "rejected";
//           rides[rideId].rejectedAt = Date.now();
         
//           // Update driver status back to online
//           if (activeDriverSockets.has(driverId)) {
//             const driverData = activeDriverSockets.get(driverId);
//             driverData.status = "Live";
//             driverData.isOnline = true;
//             activeDriverSockets.set(driverId, driverData);
           
//             socket.emit("driverStatusUpdate", {
//               driverId,
//               status: "Live"
//             });
//           }
         
//           logRideStatus();
//         }
//       } catch (error) {
//         console.error("❌ Error rejecting ride:", error);
//       }
//     });
   
//     // COMPLETE RIDE
//     socket.on("completeRide", async (data) => {
//       try {
//         const { rideId, driverId, distance, fare } = data;
       
//         console.log(`\n🎉 RIDE COMPLETED: ${rideId}`);
//         console.log(`🚗 Driver: ${driverId}`);
//         console.log(`📏 Distance: ${distance} km`);
//         console.log(`💰 Fare: ₹${fare}`);
       
//         // Update ride in database
//         const ride = await Ride.findOne({ RAID_ID: rideId });
//         if (ride) {
//           ride.status = "completed";
//           ride.completedAt = new Date();
//           ride.actualDistance = distance;
//           ride.actualFare = fare;
//           await ride.save();
//           console.log(`✅ Ride ${rideId} marked as completed in database`);
//         }
       
//         if (rides[rideId]) {
//           rides[rideId].status = "completed";
//           rides[rideId].completedAt = Date.now();
//           rides[rideId].distance = distance;
//           rides[rideId].fare = fare;
         
//           // Notify the user
//           const userId = rides[rideId].userId;
//           io.to(userId).emit("rideCompleted", {
//             rideId,
//             distance,
//             charge: fare,
//             travelTime: `${Math.round(distance * 10)} mins` // Approximate time
//           });
         
//           // Update driver status back to online
//           if (activeDriverSockets.has(driverId)) {
//             const driverData = activeDriverSockets.get(driverId);
//             driverData.status = "Live";
//             driverData.isOnline = true;
//             activeDriverSockets.set(driverId, driverData);
           
//             socket.emit("driverStatusUpdate", {
//               driverId,
//               status: "Live"
//             });
//           }
         
//           // Remove ride after 5 seconds
//           setTimeout(() => {
//             delete rides[rideId];
//             console.log(`🗑️ Removed completed ride: ${rideId}`);
//           }, 5000);
         
//           logRideStatus();
//         }
//       } catch (error) {
//         console.error("❌ Error completing ride:", error);
//       }
//     });

//     // DRIVER HEARTBEAT
//     socket.on("driverHeartbeat", ({ driverId }) => {
//       if (activeDriverSockets.has(driverId)) {
//         const driverData = activeDriverSockets.get(driverId);
//         driverData.lastUpdate = Date.now();
//         driverData.isOnline = true;
//         activeDriverSockets.set(driverId, driverData);
       
//         console.log(`❤️ Heartbeat received from driver: ${driverId}`);
//       }
//     });
   
//     // HANDLE PRICE REQUESTS
//     socket.on("getCurrentPrices", (callback) => {
//       try {
//         console.log('📡 User explicitly requested current prices');
//         const currentPrices = ridePriceController.getCurrentPrices();
//         console.log('💰 Sending prices in response:', currentPrices);
       
//         if (typeof callback === 'function') {
//           callback(currentPrices);
//         }
//         socket.emit('currentPrices', currentPrices);
//       } catch (error) {
//         console.error('❌ Error handling getCurrentPrices:', error);
//         if (typeof callback === 'function') {
//           callback({ bike: 0, taxi: 0, port: 0 });
//         }
//       }
//     });

//     // DISCONNECT
//     socket.on("disconnect", () => {
//       console.log(`\n❌ Client disconnected: ${socket.id}`);
//       console.log(`📱 Remaining connected clients: ${io.engine.clientsCount - 1}`);
     
//       if (socket.driverId) {
//         console.log(`🛑 Driver ${socket.driverName} (${socket.driverId}) disconnected`);
       
//         // Mark driver as offline but keep in memory for a while
//         if (activeDriverSockets.has(socket.driverId)) {
//           const driverData = activeDriverSockets.get(socket.driverId);
//           driverData.isOnline = false;
//           driverData.status = "Offline";
//           activeDriverSockets.set(socket.driverId, driverData);
         
//           saveDriverLocationToDB(
//             socket.driverId,
//             socket.driverName,
//             driverData.location.latitude,
//             driverData.location.longitude,
//             driverData.vehicleType,
//             "Offline"
//           ).catch(console.error);
//         }
       
//         broadcastDriverLocationsToAllUsers();
//         logDriverStatus();
//       }
//     });
//   });
 
//   // Clean up ONLY offline drivers every 60 seconds
//   setInterval(() => {
//     const now = Date.now();
//     const fiveMinutesAgo = now - 300000;
//     let cleanedCount = 0;
   
//     Array.from(activeDriverSockets.entries()).forEach(([driverId, driver]) => {
//       if (!driver.isOnline && driver.lastUpdate < fiveMinutesAgo) {
//         activeDriverSockets.delete(driverId);
//         cleanedCount++;
//         console.log(`🧹 Removed offline driver (5+ minutes): ${driver.driverName} (${driverId})`);
//       }
//     });
   
//     // Clean up stale user location tracking (older than 30 minutes)
//     const thirtyMinutesAgo = now - 1800000;
//     Array.from(userLocationTracking.entries()).forEach(([userId, data]) => {
//       if (data.lastUpdate < thirtyMinutesAgo) {
//         userLocationTracking.delete(userId);
//         cleanedCount++;
//         console.log(`🧹 Removed stale user location tracking for user: ${userId}`);
//       }
//     });
   
//     if (cleanedCount > 0) {
//       console.log(`\n🧹 Cleaned up ${cleanedCount} stale entries`);
//       broadcastDriverLocationsToAllUsers();
//       logDriverStatus();
//     }
//   }, 60000);
// }

// // GET IO INSTANCE
// const getIO = () => {
//   if (!io) throw new Error("❌ Socket.io not initialized!");
//   return io;
// };

// module.exports = { init, getIO, broadcastPricesToAllUsers };

