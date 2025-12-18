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

async function sendFCMNotifications(rideData) {
  try {
    console.log('📢 Sending FCM notifications...');
    
    console.log(`🔍 Looking for ${rideData.vehicleType} drivers...`);
    
    // Get matching drivers
    const driversWithFCM = await Driver.find({
      vehicleType: rideData.vehicleType,
      status: { $in: ["Live", "online", "available"] },
      fcmToken: { $exists: true, $ne: null, $ne: '' }
    });
    
    console.log(`🚗 ${rideData.vehicleType} Drivers FCM: ${driversWithFCM.length}`);
    
    // Send notifications to DRIVERS
    let driverNotificationResult = {
      successCount: 0,
      failureCount: 0,
      errors: []
    };
    
    if (driversWithFCM.length > 0) {
      const driverTokens = driversWithFCM
        .filter(d => d.fcmToken && d.fcmToken.length > 10)
        .map(d => d.fcmToken);
      
      console.log(`📱 Sending to ${driverTokens.length} valid tokens`);
      
      if (driverTokens.length > 0) {
        // ✅ FIX: Remove "sound" from data object
        driverNotificationResult = await sendNotificationToMultipleDrivers(
          driverTokens,
          `🚖 New ${rideData.vehicleType} Ride Request!`,
          `Pickup: ${rideData.pickup?.address?.substring(0, 40)}... | Fare: ₹${rideData.fare}`,
          {
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
            click_action: "FLUTTER_NOTIFICATION_CLICK"
          }
        );
      } else {
        console.log('⚠️ No valid FCM tokens found');
      }
    } else {
      console.log(`⚠️ No ${rideData.vehicleType} drivers found with FCM tokens`);
    }
    
    return {
      success: driverNotificationResult.successCount > 0,
      driversNotified: driverNotificationResult.successCount,
      totalDrivers: driversWithFCM.length,
      fcmSent: driverNotificationResult.successCount > 0,
      fcmMessage: driversWithFCM.length > 0 
        ? `${driverNotificationResult.successCount}/${driversWithFCM.length} ${rideData.vehicleType} drivers notified` 
        : `No ${rideData.vehicleType} drivers available with FCM tokens`,
      details: {
        vehicleType: rideData.vehicleType,
        driversCount: driversWithFCM.length,
        fcmResult: driverNotificationResult
      }
    };
    
  } catch (error) {
    console.error('❌ ERROR IN FCM NOTIFICATION SYSTEM:', error);
    return {
      success: false,
      error: error.message,
      fcmSent: false,
      fcmMessage: `FCM error: ${error.message}`
    };
  }
}

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

const logUserLocationUpdate = (userId, location, rideId) => {
  console.log(`\n📍 === USER LOCATION UPDATE ===`);
  console.log(`👤 User ID: ${userId}`);
  console.log(`🚕 Ride ID: ${rideId}`);
  console.log(`🗺️ Current Location: ${location.latitude}, ${location.longitude}`);
  console.log(`⏰ Update Time: ${new Date().toLocaleTimeString()}`);
  console.log("================================\n");
};

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

async function saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType, status = "Live") {
  try {
    const validStatuses = ["Live", "onRide", "offline"];
    const finalStatus = validStatuses.includes(status) ? status : "Live";
    
    const locationDoc = new DriverLocation({
      driverId,
      driverName,
      latitude,
      longitude,
      vehicleType,
      status: finalStatus,
      timestamp: new Date()
    });
   
    await locationDoc.save();
    console.log(`💾 Saved location for driver ${driverId} (${driverName}) to database with status: ${finalStatus}`);
    return true;
  } catch (error) {
    console.error("❌ Error saving driver location to DB:", error);
    return false;
  }
}

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




// /Users/webasebrandings/Downloads/u&d/exrabackend-main/socket.js:

const broadcastDriverLocationsContinuously = () => {
  setInterval(() => {
    // ✅ REMOVE vehicle type filtering - broadcast ALL drivers
    const drivers = Array.from(activeDriverSockets.values())
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
    
    if (drivers.length > 0) {
      io.emit("driverLocationsUpdate", { drivers });
      console.log(`📡 Broadcasting ${drivers.length} drivers to all users`);
    }
  }, 3000);
};



const init = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
  });
 
  testRaidIdModel();
 
  setInterval(() => {
    console.log(`\n⏰ ${new Date().toLocaleString()} - Server Status Check`);
    logDriverStatus();
    logRideStatus();
  }, 2000);
 
  setTimeout(() => {
    console.log('🚀 Server started, broadcasting initial prices...');
    broadcastPricesToAllUsers();
  }, 3000);
 
  // Start broadcasting driver locations continuously
  broadcastDriverLocationsContinuously();
 
  io.on("connection", (socket) => {
    console.log(`\n⚡ New client connected: ${socket.id}`);
    console.log(`📱 Total connected clients: ${io.engine.clientsCount}`);
   
    console.log('💰 Sending current prices to new client:', socket.id);
    try {
      const currentPrices = ridePriceController.getCurrentPrices();
      console.log('💰 Current prices from controller:', currentPrices);
      socket.emit('currentPrices', currentPrices);
      socket.emit('priceUpdate', currentPrices);
    } catch (error) {
      console.error('❌ Error sending prices to new client:', error);
    }


    

    socket.on("requestDriverLocations", ({ latitude, longitude, radius, vehicleType }) => {
  try {
    console.log(`🔍 User requested drivers near: ${latitude}, ${longitude}`);
    
    // ✅ REMOVED: Vehicle type filtering - show ALL nearby drivers
    const drivers = Array.from(activeDriverSockets.values())
      .filter(driver => {
        // Check if within radius only
        const driverLat = driver.location.latitude;
        const driverLng = driver.location.longitude;
        
        // Simple distance calculation
        const latDiff = Math.abs(driverLat - latitude) * 111;
        const lngDiff = Math.abs(driverLng - longitude) * 111 * Math.cos(latitude * Math.PI/180);
        const distance = Math.sqrt(latDiff*latDiff + lngDiff*lngDiff);
        
        return distance <= (radius / 1000);
      })
      .slice(0, 10) // Limit to 10 drivers as requested
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
    
    console.log(`✅ Sending ${drivers.length} drivers to user (ALL vehicle types)`);
    socket.emit("driverLocationsResponse", { drivers });
    
  } catch (error) {
    console.error("❌ Error processing driver location request:", error);
    socket.emit("driverLocationsResponse", { drivers: [] });
  }
});






socket.on("driverLocationUpdate", async (data) => {
  try {
    const { driverId, latitude, longitude, status } = data;
   
    console.log(`📍 REAL-TIME: Driver ${driverId} location update received`);
   
    if (activeDriverSockets.has(driverId)) {
      const driverData = activeDriverSockets.get(driverId);
      driverData.location = { latitude, longitude };
      driverData.lastUpdate = Date.now();
      driverData.status = status || "Live";
      driverData.isOnline = true;
      activeDriverSockets.set(driverId, driverData);
      
      // ✅ FIX: Use actual vehicle type instead of hardcoded "taxi"
      io.emit("driverLiveLocationUpdate", {
        driverId: driverId,
        lat: latitude,
        lng: longitude,
        status: status || "Live",
        vehicleType: driverData.vehicleType, // ✅ Use actual vehicle type
        timestamp: Date.now()
      });
    }
   
    const driverData = activeDriverSockets.get(driverId);
    await saveDriverLocationToDB(
      driverId,
      driverData?.driverName || "Unknown",
      latitude,
      longitude,
      driverData.vehicleType, // ✅ Use actual vehicle type
      status || "Live"
    );
   
  } catch (error) {
    console.error("❌ Error processing driver location update:", error);
  }
});

    socket.on("retryFCMNotification", async (data, callback) => {
      try {
        const { rideId, retryCount } = data;

        console.log(`🔄 FCM retry attempt #${retryCount} for ride: ${rideId}`);

        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (!ride) {
          return callback?.({
            success: false,
            message: "Ride not found",
          });
        }

        const driversWithFCM = await Driver.find({
          status: "Live",
          fcmToken: { $exists: true, $ne: null, $ne: "" },
        });

        if (driversWithFCM.length === 0) {
          return callback?.({
            success: false,
            message: "No drivers with FCM tokens",
          });
        }

        const tokens = driversWithFCM.map(d => d.fcmToken);

        const notificationData = {
          type: "ride_request",
          rideId,
          pickup: JSON.stringify(ride.pickup),
          drop: JSON.stringify(ride.drop),
          fare: String(ride.fare),
          distance: ride.distance,
          vehicleType: ride.rideType,
          userName: ride.name,
          userMobile: ride.userMobile,
          isRetry: true,
          retryCount,
          timestamp: new Date().toISOString(),
        };

        const result = await sendNotificationToMultipleDrivers(
          tokens,
          "🚖 Ride Request (Retry)",
          `Retry #${retryCount} | Fare ₹${ride.fare}`,
          notificationData
        );

        callback?.({
          success: result.successCount > 0,
          driversNotified: result.successCount,
          message:
            result.successCount > 0
              ? "Retry successful"
              : "Retry failed",
        });

      } catch (error) {
        console.error("❌ retryFCMNotification error:", error);
        callback?.({ success: false, message: error.message });
      }
    });

   socket.on("driverLiveLocationUpdate", async ({ driverId, driverName, lat, lng }) => {
  try {
    if (activeDriverSockets.has(driverId)) {
      const driverData = activeDriverSockets.get(driverId);
      driverData.location = { latitude: lat, longitude: lng };
      driverData.lastUpdate = Date.now();
      driverData.isOnline = true;
      activeDriverSockets.set(driverId, driverData);
     
      await saveDriverLocationToDB(driverId, driverName, lat, lng, driverData.vehicleType);
     
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
    socket.on('registerUser', ({ userId, userMobile }) => {
      if (!userId) {
        console.error('❌ No userId provided for user registration');
        return;
      }
     
      socket.userId = userId.toString();
      socket.join(userId.toString());
     
      console.log(`👤 USER REGISTERED SUCCESSFULLY: ${userId}`);
    });
   
 


    socket.on("registerDriver", async ({ driverId, driverName, latitude, longitude, vehicleType = "TAXI" }) => {
  try {
    const normalizedVehicleType = (vehicleType || 'TAXI').toUpperCase();
    
    console.log(`📝 DRIVER REGISTRATION: ${driverName} (${driverId}) as ${normalizedVehicleType}`);
    
    // ✅ CRITICAL FIX: Set driver as online immediately when registering
    activeDriverSockets.set(driverId, {
      driverId,
      driverName,
      location: { latitude, longitude },
      vehicleType: normalizedVehicleType,
      status: 'Live', // ✅ Changed from 'offline' to 'Live'
      socketId: socket.id,
      lastUpdate: Date.now(),
      isOnline: true // ✅ Changed from false to true
    });
    
    // ✅ Update database with Live status
    const driverUpdate = {
      driverId,
      name: driverName,
      vehicleType: normalizedVehicleType,
      status: 'Live', // ✅ Changed from 'offline' to 'Live'
      lastUpdate: new Date(),
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      }
    };
    
    await Driver.findOneAndUpdate(
      { driverId },
      driverUpdate,
      { upsert: true, new: true }
    );
    
    console.log(`✅ Driver ${driverId} registered as ${normalizedVehicleType} (status: Live)`);
    
    // ✅ BROADCAST this driver's location to ALL users immediately
    io.emit("driverLocationsUpdate", {
      drivers: [{
        driverId,
        name: driverName,
        location: {
          coordinates: [longitude, latitude]
        },
        vehicleType: normalizedVehicleType,
        status: 'Live',
        lastUpdate: Date.now()
      }]
    });
    
  } catch (error) {
    console.error("❌ Error registering driver:", error);
  }
});




socket.on("driverGoOnline", async ({ driverId, latitude, longitude, vehicleType }) => {
  try {
    console.log(`🟢 Driver ${driverId} going online`);
    
    if (activeDriverSockets.has(driverId)) {
      const driverData = activeDriverSockets.get(driverId);
      driverData.location = { latitude, longitude };
      driverData.status = 'Live';
      driverData.isOnline = true;
      activeDriverSockets.set(driverId, driverData);
      
      // ✅ BROADCAST location ONLY when driver goes online
      io.emit("driverLocationsUpdate", {
        drivers: [{
          driverId,
          name: driverData.driverName,
          location: {
            coordinates: [longitude, latitude]
          },
          vehicleType: driverData.vehicleType,
          status: 'Live',
          lastUpdate: Date.now()
        }]
      });
      
      // Update database
      await saveDriverLocationToDB(
        driverId,
        driverData.driverName,
        latitude,
        longitude,
        vehicleType,
        "Live"
      );
      
      console.log(`✅ Driver ${driverId} is now online and broadcasting location`);
    }
  } catch (error) {
    console.error("❌ Error processing driver online:", error);
  }
});


socket.on("driverOffline", async ({ driverId }) => {
  try {
    console.log(`🔴 Driver ${driverId} going offline`);
    
    if (activeDriverSockets.has(driverId)) {
      const driverData = activeDriverSockets.get(driverId);
      driverData.status = 'offline';
      driverData.isOnline = false;
      activeDriverSockets.set(driverId, driverData);
      
      // Update database
      await saveDriverLocationToDB(
        driverId,
        driverData.driverName,
        driverData.location.latitude,
        driverData.location.longitude,
        driverData.vehicleType,
        "offline"
      );
      
      console.log(`✅ Driver ${driverId} marked as offline`);
    }
  } catch (error) {
    console.error("❌ Error processing driver offline:", error);
  }
});





socket.on("requestNearbyDrivers", ({ latitude, longitude, radius = 5000, vehicleType }) => {
  try {
    console.log(`\n🔍 USER REQUESTED NEARBY DRIVERS: ${socket.id}`);
    console.log(`🚗 Vehicle filter: ${vehicleType || 'All vehicles'}`);
    
    const drivers = Array.from(activeDriverSockets.values())
      .filter(driver => {
        // Check if within radius only
        const driverLat = driver.location.latitude;
        const driverLng = driver.location.longitude;
        
        const latDiff = Math.abs(driverLat - latitude) * 111;
        const lngDiff = Math.abs(driverLng - longitude) * 111 * Math.cos(latitude * Math.PI/180);
        const distance = Math.sqrt(latDiff*latDiff + lngDiff*lngDiff);
        
        return distance <= (radius / 1000);
      })
      .slice(0, 10) // Limit to 10 drivers
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

    console.log(`📊 Available drivers: ${drivers.length} (ALL TYPES)`);
    socket.emit("nearbyDriversResponse", { drivers });
  } catch (error) {
    console.error("❌ Error fetching nearby drivers:", error);
    socket.emit("nearbyDriversResponse", { drivers: [] });
  }
});








    socket.on("bookRide", async (data, callback) => {
      let rideId;
      try {
        console.log('🚨 ===== REAL USER RIDE BOOKING =====');
        console.log('📦 User App Data:', {
          userId: data.userId,
          customerId: data.customerId, 
          vehicleType: data.vehicleType,
          _source: data._source || 'unknown'
        });

        const { userId, customerId, userName, userMobile, pickup, drop, vehicleType, estimatedPrice, distance, travelTime, wantReturn } = data;
        console.log('📥 Received bookRide request');
        
        // ✅ CRITICAL FIX: Normalize vehicle type to UPPERCASE
        const normalizedVehicleType = (vehicleType || 'TAXIwdwdwdwdwdwd').toUpperCase();
        console.log(`🚗 Vehicle Type: ${vehicleType} -> Normalized: ${normalizedVehicleType}`);
        
        const distanceKm = parseFloat(distance);
        console.log(`📏 Backend calculating price for ${distanceKm}km ${normalizedVehicleType}`);
       
        // ✅ FIX: Make sure calculateRidePrice returns a number
        let backendCalculatedPrice;
        try {
          backendCalculatedPrice = await ridePriceController.calculateRidePrice(normalizedVehicleType, distanceKm);
          if (isNaN(backendCalculatedPrice) || backendCalculatedPrice <= 0) {
            console.warn(`⚠️ Invalid price returned: ${backendCalculatedPrice}, using fallback`);
            // Calculate fallback price
            const pricePerKm = normalizedVehicleType === 'BIKE' ? 15 : 
                              normalizedVehicleType === 'TAXI' ? 40 : 75;
            backendCalculatedPrice = Math.round(distanceKm * pricePerKm);
          }
        } catch (priceError) {
          console.error('❌ Price calculation error:', priceError);
          // Fallback calculation
          const pricePerKm = normalizedVehicleType === 'BIKE' ? 15 : 
                            normalizedVehicleType === 'TAXI' ? 40 : 75;
          backendCalculatedPrice = Math.round(distanceKm * pricePerKm);
        }
       
        console.log(`💰 Frontend sent price: ₹${estimatedPrice}, Backend calculated: ₹${backendCalculatedPrice}`);
       
        const finalPrice = backendCalculatedPrice;
       
        rideId = await generateSequentialRaidId();
        console.log(`🆔 Generated RAID_ID: ${rideId}`);
        console.log(`💰 USING BACKEND CALCULATED PRICE: ₹${finalPrice}`);
        
        let otp;
        if (customerId && customerId.length >= 4) {
          otp = customerId.slice(-4);
        } else {
          otp = Math.floor(1000 + Math.random() * 9000).toString();
        }
        
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
       
        processingRides.add(rideId);
        
        if (!userId || !customerId || !userName || !pickup || !drop) {
          console.error("❌ Missing required fields");
          processingRides.delete(rideId);
          if (callback) {
            callback({
              success: false,
              message: "Missing required fields"
            });
          }
          return;
        }

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
          fare: finalPrice,
          rideType: normalizedVehicleType,
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
          price: finalPrice,
          distanceKm: distanceKm || 0
        };

        const newRide = new Ride(rideData);
        const savedRide = await newRide.save();
        console.log(`💾 Ride saved to MongoDB with ID: ${savedRide._id}`);
        console.log(`💾 BACKEND PRICE SAVED: ₹${savedRide.fare}`);

        rides[rideId] = {
          ...data,
          rideId: rideId,
          status: "pending",
          timestamp: Date.now(),
          _id: savedRide._id.toString(),
          userLocation: { latitude: pickup.lat, longitude: pickup.lng },
          fare: finalPrice,
          vehicleType: normalizedVehicleType
        };

        userLocationTracking.set(userId, {
          latitude: pickup.lat,
          longitude: pickup.lng,
          lastUpdate: Date.now(),
          rideId: rideId
        });

        await saveUserLocationToDB(userId, pickup.lat, pickup.lng, rideId);

        console.log('🚨 EMERGENCY: Sending real-time notifications');
        
        // ✅ FIX: Handle sendFCMNotifications safely
        let notificationResult = {
          success: false,
          driversNotified: 0,
          totalDrivers: 0,
          fcmSent: false,
          fcmMessage: "FCM notification not attempted"
        };
        
        try {
          notificationResult = await sendFCMNotifications({
            rideId: rideId,
            RAID_ID: rideId,
            _id: savedRide._id.toString(),
            pickup: pickup,
            drop: drop,
            fare: finalPrice,
            distance: distance || "0 km",
            vehicleType: normalizedVehicleType,
            userName: userName,
            userMobile: userMobile,
            user: userId
          });
          console.log('📊 REAL-TIME NOTIFICATION RESULT:', notificationResult);
        } catch (fcmError) {
          console.error('❌ FCM notification error:', fcmError);
          notificationResult = {
            success: false,
            error: fcmError.message,
            fcmSent: false,
            fcmMessage: `FCM error: ${fcmError.message}`
          };
        }

        io.emit("newRideRequest", {
          ...data,
          rideId: rideId,
          _id: savedRide._id.toString(),
          emergency: true
        });

        // ✅ FIX: Check if callback exists and notificationResult is defined
        if (callback) {
          const responseData = {
            success: true,
            rideId: rideId,
            _id: savedRide._id.toString(),
            otp: otp,
            fare: finalPrice,
            vehicleType: normalizedVehicleType,
            driversFound: notificationResult.totalDrivers || 0,
            message: "Ride booked successfully!",
            notificationResult: notificationResult || {},
            fcmSent: notificationResult ? notificationResult.fcmSent || false : false,
            fcmMessage: notificationResult ? notificationResult.fcmMessage || "FCM status unknown" : "FCM not attempted",
            driversNotified: notificationResult ? notificationResult.driversNotified || 0 : 0
          };
          
          console.log('📨 Sending callback response:', responseData);
          callback(responseData);
        }

      } catch (error) {
        console.error("❌ Error booking ride:", error);
        
        if (error.name === 'ValidationError') {
          const errors = Object.values(error.errors).map(err => err.message);
          console.error("❌ Validation errors:", errors);
          
          if (callback) {
            callback({
              success: false,
              message: `Validation failed: ${errors.join(', ')}`
            });
          }
        } else if (error.code === 11000 && error.keyPattern && error.keyPattern.RAID_ID) {
          console.log(`🔄 Duplicate RAID_ID detected: ${rideId}`);
          
          try {
            const existingRide = await Ride.findOne({ RAID_ID: rideId });
            if (existingRide && callback) {
              callback({
                success: true,
                rideId: rideId,
                _id: existingRide._id.toString(),
                otp: existingRide.otp,
                message: "Ride already exists (duplicate handled)"
              });
            }
          } catch (findError) {
            console.error("❌ Error finding existing ride:", findError);
            if (callback) {
              callback({
                success: false,
                message: "Failed to process ride booking (duplicate error)"
              });
            }
          }
        } else {
          console.error("❌ General error details:", error.message, error.stack);
          if (callback) {
            callback({
              success: false,
              message: `Failed to process ride booking: ${error.message}`
            });
          }
        }
      } finally {
        if (rideId) {
          processingRides.delete(rideId);
        }
      }
    });

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
      
      if (rides[rideId] && rides[rideId].driverId === driverId) {
        console.log(`⚠️ Driver ${driverId} has already accepted ride ${rideId}`);
        if (callback) {
          callback({
            success: false,
            message: "You have already accepted this ride"
          });
        }
        return;
      }
      
      const ride = await Ride.findOne({ 
        RAID_ID: rideId, 
        status: "pending" 
      });
      
      if (!ride) {
        console.log(`⚠️ Ride ${rideId} is no longer pending`);
        if (callback) {
          callback({
            success: false,
            message: "Ride is no longer available"
          });
        }
        return;
      }
        
        console.log(`✅ Found ride: ${ride.RAID_ID}, Status: ${ride.status}`);

        if (ride.status === "accepted") {
          console.log(`🚫 Ride ${rideId} already accepted by: ${ride.driverId}`);
         
          socket.broadcast.emit("rideAlreadyAccepted", {
            rideId,
            message: "This ride has already been accepted by another driver."
          });
         
          if (typeof callback === "function") {
            callback({
              success: false,
              message: "This ride has already been accepted by another driver."
            });
          }
          return;
        }

        try {
          console.log(`🔄 Updating ride status to 'accepted'`);
          ride.status = "accepted";
          ride.driverId = driverId;
          ride.driverName = driverName;

          const driver = await Driver.findOne({ driverId });
          
          if (driver) {
            ride.driverMobile = driver.phone;
            console.log(`📱 Driver mobile: ${driver.phone}`);
          } else {
            ride.driverMobile = "N/A";
            console.log(`⚠️ Driver not found in Driver collection`);
          }

          if (!ride.otp) {
            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            ride.otp = otp;
            console.log(`🔢 Generated new OTP: ${otp}`);
          }

          await ride.save();
          console.log(`💾 Ride saved successfully`);

          if (rides[rideId]) {
            rides[rideId].status = "accepted";
            rides[rideId].driverId = driverId;
            rides[rideId].driverName = driverName;
          }

          try {
            console.log(`📢 Sending ride accepted notification to user: ${ride.user}`);
            
            io.to(ride.user.toString()).emit("rideAcceptedNotification", {
              rideId: ride.RAID_ID,
              driverName: driverName,
              driverId: driverId,
              message: "Your ride has been accepted!"
            });
            
            console.log(`✅ Ride accepted notification sent to user: ${ride.user}`);
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

          if (typeof callback === "function") {
            console.log("📨 Sending callback to driver");
            callback(driverData);
          }

          const userRoom = ride.user.toString();
          console.log(`📡 Notifying user room: ${userRoom}`);
          
          io.to(userRoom).emit("rideAccepted", driverData);
          console.log("✅ Notification sent via standard room channel");
          
          const userSockets = await io.in(userRoom).fetchSockets();
          console.log(`🔍 Found ${userSockets.length} sockets in user room`);
          userSockets.forEach((userSocket, index) => {
            userSocket.emit("rideAccepted", driverData);
          });

          io.emit("rideAcceptedGlobal", {
            ...driverData,
            targetUserId: userRoom,
            timestamp: new Date().toISOString()
          });

          setTimeout(() => {
            io.to(userRoom).emit("rideAccepted", driverData);
            console.log("✅ Backup notification sent after delay");
          }, 1000);

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

          const driverSocket = Array.from(io.sockets.sockets.values()).find(s => s.driverId === driverId);
          if (driverSocket) {
            driverSocket.emit("userDataForDriver", userDataForDriver);
            console.log("✅ User data sent to driver:", driverId);
          } else {
            io.to(`driver_${driverId}`).emit("userDataForDriver", userDataForDriver);
            console.log("✅ User data sent to driver room:", driverId);
          }

          socket.broadcast.emit("rideAlreadyAccepted", {
            rideId,
            message: "This ride has already been accepted by another driver."
          });

          console.log("📢 Other drivers notified");

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

    socket.on("userLocationUpdate", async (data) => {
      try {
        const { userId, rideId, latitude, longitude } = data;
       
        console.log(`📍 USER LOCATION UPDATE: User ${userId} for ride ${rideId}`);
       
        userLocationTracking.set(userId, {
          latitude,
          longitude,
          lastUpdate: Date.now(),
          rideId: rideId
        });
       
        logUserLocationUpdate(userId, { latitude, longitude }, rideId);
       
        await saveUserLocationToDB(userId, latitude, longitude, rideId);
       
        if (rides[rideId]) {
          rides[rideId].userLocation = { latitude, longitude };
          console.log(`✅ Updated user location in memory for ride ${rideId}`);
        }
       
        let driverId = null;
       
        if (rides[rideId] && rides[rideId].driverId) {
          driverId = rides[rideId].driverId;
          console.log(`✅ Found driver ID in memory: ${driverId} for ride ${rideId}`);
        } else {
          const ride = await Ride.findOne({ RAID_ID: rideId });
          if (ride && ride.driverId) {
            driverId = ride.driverId;
            console.log(`✅ Found driver ID in database: ${driverId} for ride ${rideId}`);
           
            if (!rides[rideId]) {
              rides[rideId] = {};
            }
            rides[rideId].driverId = driverId;
          } else {
            console.log(`❌ No driver assigned for ride ${rideId} in database either`);
            return;
          }
        }
       
        const driverRoom = `driver_${driverId}`;
        const locationData = {
          rideId: rideId,
          userId: userId,
          lat: latitude,
          lng: longitude,
          timestamp: Date.now()
        };
       
        console.log(`📡 Sending user location to driver ${driverId} in room ${driverRoom}`);
       
        io.to(driverRoom).emit("userLiveLocationUpdate", locationData);
       
        io.emit("userLiveLocationUpdate", locationData);
       
      } catch (error) {
        console.error("❌ Error processing user location update:", error);
      }
    });

    const updateDriverFCMToken = async (driverId, fcmToken) => {
      try {
        console.log(`📱 Updating FCM token for driver: ${driverId}`);
        
        const Driver = require('./models/driver/driver');
        const result = await Driver.findOneAndUpdate(
          { driverId: driverId },
          { 
            fcmToken: fcmToken,
            fcmTokenUpdatedAt: new Date(),
            platform: 'android'
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

    socket.on("requestRideOTP", async (data, callback) => {
      try {
        const { rideId } = data;
        
        if (!rideId) {
          if (callback) callback({ success: false, message: "No ride ID provided" });
          return;
        }
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        
        if (!ride) {
          if (callback) callback({ success: false, message: "Ride not found" });
          return;
        }
        
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

    socket.on("otpVerified", async (data) => {
      try {
        const { rideId, driverId } = data;
        console.log(`✅ OTP Verified for ride ${rideId}, notifying user`);
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (!ride) {
          console.error(`❌ Ride ${rideId} not found for OTP verification`);
          return;
        }
        
        const userId = ride.user?.toString() || ride.userId;
        if (!userId) {
          console.error(`❌ No user ID found for ride ${rideId}`);
          return;
        }
        
        console.log(`📡 Notifying user ${userId} about OTP verification for ride ${rideId}`);
        
        const notificationData = {
          rideId,
          driverId,
          userId,
          status: "started",
          otpVerified: true,
          timestamp: new Date().toISOString(),
          message: "OTP verified successfully! Ride has started."
        };
        
        io.to(userId.toString()).emit("otpVerified", notificationData);
        io.to(userId.toString()).emit("rideOTPVerified", notificationData);
        io.to(userId.toString()).emit("rideStatusUpdate", {
          rideId,
          status: "started",
          otpVerified: true,
          message: "Driver has verified OTP and started the ride",
          timestamp: new Date().toISOString()
        });
        
        io.emit("otpVerifiedGlobal", {
          ...notificationData,
          targetUserId: userId
        });
        
        setTimeout(() => {
          io.to(userId.toString()).emit("otpVerified", notificationData);
          console.log(`✅ Backup OTP notification sent to user ${userId}`);
        }, 500);
        
        console.log(`✅ All OTP verification events sent to user ${userId}`);
        
      } catch (error) {
        console.error("❌ Error handling OTP verification:", error);
      }
    });

    socket.on("driverStartedRide", async (data) => {
      try {
        const { rideId, driverId } = data;
        console.log(`🚀 Driver started ride: ${rideId}`);
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride) {
          ride.status = "started";
          ride.rideStartTime = new Date();
          await ride.save();
          console.log(`✅ Ride ${rideId} status updated to 'started'`);
        }
        
        if (rides[rideId]) {
          rides[rideId].status = "started";
        }

        const userId = ride.user?.toString() || ride.userId;
        if (!userId) {
          console.error(`❌ No user ID found for ride ${rideId}`);
          return;
        }

        const userRoom = userId.toString();
        console.log(`📡 Notifying user ${userRoom} about ride start and OTP verification`);

        io.to(userRoom).emit("rideStatusUpdate", {
          rideId: rideId,
          status: "started",
          message: "Driver has started the ride",
          otpVerified: true,
          timestamp: new Date().toISOString()
        });

        io.to(userRoom).emit("otpVerified", {
          rideId: rideId,
          driverId: driverId,
          userId: userId,
          status: "started",
          otpVerified: true,
          timestamp: new Date().toISOString()
        });

        io.to(userRoom).emit("driverStartedRide", {
          rideId: rideId,
          driverId: driverId,
          status: "started",
          otpVerified: true,
          timestamp: new Date().toISOString()
        });

        io.emit("otpVerifiedGlobal", {
          rideId: rideId,
          targetUserId: userRoom,
          status: "started",
          otpVerified: true,
          timestamp: new Date().toISOString()
        });

        setTimeout(() => {
          io.to(userRoom).emit("otpVerified", {
            rideId: rideId,
            driverId: driverId,
            userId: userId,
            status: "started",
            otpVerified: true,
            timestamp: new Date().toISOString()
          });
          console.log(`✅ Backup OTP verification notification sent to user ${userRoom}`);
        }, 1000);

        console.log(`✅ All OTP verification notifications sent to user ${userRoom}`);

        socket.emit("rideStarted", {
          rideId: rideId,
          message: "Ride started successfully"
        });
        
      } catch (error) {
        console.error("❌ Error processing driver started ride:", error);
      }
    });

    socket.on("rideStatusUpdate", (data) => {
      try {
        const { rideId, status, userId } = data;
        console.log(`📋 Ride status update: ${rideId} -> ${status}`);
        
        if (status === "started" && data.otpVerified) {
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

    socket.on("rideCompleted", async (data) => {
      try {
        const { rideId, driverId, userId, distance, fare, actualPickup, actualDrop } = data;
        
        console.log(`🏁 Ride ${rideId} completed by driver ${driverId}`);
        console.log(`💰 Fare: ₹${fare}, Distance: ${distance}km`);
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride) {
          ride.status = 'completed';
          ride.completedAt = new Date();
          ride.actualDistance = distance;
          ride.actualFare = fare;
          ride.actualPickup = actualPickup;
          ride.actualDrop = actualDrop;
          await ride.save();
          
          console.log(`✅ Ride ${rideId} marked as completed in database`);
        }
        
        await Driver.findOneAndUpdate(
          { driverId: driverId },
          {
            status: 'Live',
            lastUpdate: new Date()
          }
        );
        
        const userRoom = userId?.toString() || ride?.user?.toString();
        if (userRoom) {
          console.log(`💰 Sending BILL ALERT to user ${userRoom}`);
          
          io.to(userRoom).emit("billAlert", {
            type: "bill",
            rideId: rideId,
            distance: `${distance} km`,
            fare: fare,
            driverName: ride?.driverName || "Driver",
            vehicleType: ride?.rideType || "bike",
            actualPickup: actualPickup,
            actualDrop: actualDrop,
            timestamp: new Date().toISOString(),
            message: "Ride completed! Here's your bill.",
            showBill: true,
            priority: "high"
          });
          
          io.to(userRoom).emit("rideCompleted", {
            rideId: rideId,
            distance: distance,
            charge: fare,
            driverName: ride?.driverName || "Driver",
            vehicleType: ride?.rideType || "bike",
            timestamp: new Date().toISOString()
          });
          
          io.to(userRoom).emit("rideCompletedAlert", {
            rideId: rideId,
            driverName: ride?.driverName || "Driver",
            fare: fare,
            distance: distance,
            message: "Your ride has been completed successfully!",
            alertTitle: "✅ Ride Completed",
            alertMessage: `Thank you for using our service! Your ride has been completed. Total fare: ₹${fare}`,
            showAlert: true,
            priority: "high"
          });
          
          console.log(`✅ Bill and completion alerts sent to user ${userRoom}`);
        }
        
        socket.emit("rideCompletedSuccess", {
          rideId: rideId,
          message: "Ride completed successfully",
          timestamp: new Date().toISOString()
        });
        
        const driverRoom = `driver_${driverId}`;
        io.to(driverRoom).emit("paymentStatus", {
          rideId: rideId,
          status: "pending",
          message: "Payment is pending. Please wait for confirmation.",
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error("❌ Error processing ride completion:", error);
      }
    });

    socket.on("rejectRide", (data) => {
      try {
        const { rideId, driverId } = data;
       
        console.log(`\n❌ RIDE REJECTED: ${rideId}`);
        console.log(`🚗 Driver: ${driverId}`);
       
        if (rides[rideId]) {
          rides[rideId].status = "rejected";
          rides[rideId].rejectedAt = Date.now();
         
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

    socket.on("driverHeartbeat", ({ driverId }) => {
      if (activeDriverSockets.has(driverId)) {
        const driverData = activeDriverSockets.get(driverId);
        driverData.lastUpdate = Date.now();
        driverData.isOnline = true;
        activeDriverSockets.set(driverId, driverData);
       
        console.log(`❤️ Heartbeat received from driver: ${driverId}`);
      }
    });
   
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

    socket.on("disconnect", () => {
      console.log(`\n❌ Client disconnected: ${socket.id}`);
      console.log(`📱 Remaining connected clients: ${io.engine.clientsCount - 1}`);
     
      if (socket.driverId) {
        console.log(`🛑 Driver ${socket.driverName} (${socket.driverId}) disconnected`);
       
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

const getIO = () => {
  if (!io) throw new Error("❌ Socket.io not initialized!");
  return io;
};

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1000; // Return in meters
}

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




// async function sendFCMNotifications(rideData) {
//   try {
//     console.log('📢 Sending FCM notifications...');
    
//     console.log(`🔍 Looking for ${rideData.vehicleType} drivers...`);
    
//     // Get matching drivers
//     const driversWithFCM = await Driver.find({
//       vehicleType: rideData.vehicleType,
//       status: { $in: ["Live", "online", "available"] },
//       fcmToken: { $exists: true, $ne: null, $ne: '' }
//     });
    
//     console.log(`🚗 ${rideData.vehicleType} Drivers FCM: ${driversWithFCM.length}`);
    
//     // Send notifications to DRIVERS
//     let driverNotificationResult = {
//       successCount: 0,
//       failureCount: 0,
//       errors: []
//     };
    
//     if (driversWithFCM.length > 0) {
//       const driverTokens = driversWithFCM
//         .filter(d => d.fcmToken && d.fcmToken.length > 10)
//         .map(d => d.fcmToken);
      
//       console.log(`📱 Sending to ${driverTokens.length} valid tokens`);
      
//       if (driverTokens.length > 0) {
//         // ✅ FIX: Remove "sound" from data object
//         driverNotificationResult = await sendNotificationToMultipleDrivers(
//           driverTokens,
//           `🚖 New ${rideData.vehicleType} Ride Request!`,
//           `Pickup: ${rideData.pickup?.address?.substring(0, 40)}... | Fare: ₹${rideData.fare}`,
//           {
//             type: "ride_request",
//             rideId: rideData.rideId,
//             pickup: JSON.stringify(rideData.pickup || {}),
//             drop: JSON.stringify(rideData.drop || {}),
//             fare: rideData.fare?.toString() || "0",
//             distance: rideData.distance?.toString() || "0",
//             vehicleType: rideData.vehicleType || "taxi",
//             userName: rideData.userName || "Customer",
//             userMobile: rideData.userMobile || "N/A",
//             otp: rideData.otp || "0000",
//             timestamp: new Date().toISOString(),
//             priority: "high",
//             click_action: "FLUTTER_NOTIFICATION_CLICK"
//             // ❌ REMOVE: "sound": "default" - this was causing the error
//           }
//         );
//       } else {
//         console.log('⚠️ No valid FCM tokens found');
//       }
//     } else {
//       console.log(`⚠️ No ${rideData.vehicleType} drivers found with FCM tokens`);
//     }
    
//     return {
//       success: driverNotificationResult.successCount > 0,
//       driversNotified: driverNotificationResult.successCount,
//       totalDrivers: driversWithFCM.length,
//       fcmSent: driverNotificationResult.successCount > 0,
//       fcmMessage: driversWithFCM.length > 0 
//         ? `${driverNotificationResult.successCount}/${driversWithFCM.length} ${rideData.vehicleType} drivers notified` 
//         : `No ${rideData.vehicleType} drivers available with FCM tokens`,
//       details: {
//         vehicleType: rideData.vehicleType,
//         driversCount: driversWithFCM.length,
//         fcmResult: driverNotificationResult
//       }
//     };
    
//   } catch (error) {
//     console.error('❌ ERROR IN FCM NOTIFICATION SYSTEM:', error);
//     return {
//       success: false,
//       error: error.message,
//       fcmSent: false,
//       fcmMessage: `FCM error: ${error.message}`
//     };
//   }
// }





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

// const logUserLocationUpdate = (userId, location, rideId) => {
//   console.log(`\n📍 === USER LOCATION UPDATE ===`);
//   console.log(`👤 User ID: ${userId}`);
//   console.log(`🚕 Ride ID: ${rideId}`);
//   console.log(`🗺️ Current Location: ${location.latitude}, ${location.longitude}`);
//   console.log(`⏰ Update Time: ${new Date().toLocaleTimeString()}`);
//   console.log("================================\n");
// };

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

// async function saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType, status = "Live") {
//   try {
//     const validStatuses = ["Live", "onRide", "offline"];
//     const finalStatus = validStatuses.includes(status) ? status : "Live";
    
//     const locationDoc = new DriverLocation({
//       driverId,
//       driverName,
//       latitude,
//       longitude,
//       vehicleType,
//       status: finalStatus,
//       timestamp: new Date()
//     });
   
//     await locationDoc.save();
//     console.log(`💾 Saved location for driver ${driverId} (${driverName}) to database with status: ${finalStatus}`);
//     return true;
//   } catch (error) {
//     console.error("❌ Error saving driver location to DB:", error);
//     return false;
//   }
// }

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
 
//   testRaidIdModel();
 
//   setInterval(() => {
//     console.log(`\n⏰ ${new Date().toLocaleString()} - Server Status Check`);
//     logDriverStatus();
//     logRideStatus();
//   }, 2000);
 
//   setTimeout(() => {
//     console.log('🚀 Server started, broadcasting initial prices...');
//     broadcastPricesToAllUsers();
//   }, 3000);
 
//   io.on("connection", (socket) => {
//     console.log(`\n⚡ New client connected: ${socket.id}`);
//     console.log(`📱 Total connected clients: ${io.engine.clientsCount}`);
   
//     console.log('💰 Sending current prices to new client:', socket.id);
//     try {
//       const currentPrices = ridePriceController.getCurrentPrices();
//       console.log('💰 Current prices from controller:', currentPrices);
//       socket.emit('currentPrices', currentPrices);
//       socket.emit('priceUpdate', currentPrices);
//     } catch (error) {
//       console.error('❌ Error sending prices to new client:', error);
//     }

//     socket.on("driverLocationUpdate", async (data) => {
//       try {
//         const { driverId, latitude, longitude, status } = data;
       
//         console.log(`📍 REAL-TIME: Driver ${driverId} location update received`);
       
//         if (activeDriverSockets.has(driverId)) {
//           const driverData = activeDriverSockets.get(driverId);
//           driverData.location = { latitude, longitude };
//           driverData.lastUpdate = Date.now();
//           driverData.status = status || "Live";
//           driverData.isOnline = true;
//           activeDriverSockets.set(driverId, driverData);
//         }
       
//         io.emit("driverLiveLocationUpdate", {
//           driverId: driverId,
//           lat: latitude,
//           lng: longitude,
//           status: status || "Live",
//           vehicleType: "taxi",
//           timestamp: Date.now()
//         });
       
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

//     socket.on("retryFCMNotification", async (data, callback) => {
//       try {
//         const { rideId, retryCount } = data;

//         console.log(`🔄 FCM retry attempt #${retryCount} for ride: ${rideId}`);

//         const ride = await Ride.findOne({ RAID_ID: rideId });
//         if (!ride) {
//           return callback?.({
//             success: false,
//             message: "Ride not found",
//           });
//         }

//         const driversWithFCM = await Driver.find({
//           status: "Live",
//           fcmToken: { $exists: true, $ne: null, $ne: "" },
//         });

//         if (driversWithFCM.length === 0) {
//           return callback?.({
//             success: false,
//             message: "No drivers with FCM tokens",
//           });
//         }

//         const tokens = driversWithFCM.map(d => d.fcmToken);

//         const notificationData = {
//           type: "ride_request",
//           rideId,
//           pickup: JSON.stringify(ride.pickup),
//           drop: JSON.stringify(ride.drop),
//           fare: String(ride.fare),
//           distance: ride.distance,
//           vehicleType: ride.rideType,
//           userName: ride.name,
//           userMobile: ride.userMobile,
//           isRetry: true,
//           retryCount,
//           timestamp: new Date().toISOString(),
//         };

//         const result = await sendNotificationToMultipleDrivers(
//           tokens,
//           "🚖 Ride Request (Retry)",
//           `Retry #${retryCount} | Fare ₹${ride.fare}`,
//           notificationData
//         );

//         callback?.({
//           success: result.successCount > 0,
//           driversNotified: result.successCount,
//           message:
//             result.successCount > 0
//               ? "Retry successful"
//               : "Retry failed",
//         });

//       } catch (error) {
//         console.error("❌ retryFCMNotification error:", error);
//         callback?.({ success: false, message: error.message });
//       }
//     });

//     socket.on("driverLiveLocationUpdate", async ({ driverId, driverName, lat, lng }) => {
//       try {
//         if (activeDriverSockets.has(driverId)) {
//           const driverData = activeDriverSockets.get(driverId);
//           driverData.location = { latitude: lat, longitude: lng };
//           driverData.lastUpdate = Date.now();
//           driverData.isOnline = true;
//           activeDriverSockets.set(driverId, driverData);
         
//           await saveDriverLocationToDB(driverId, driverName, lat, lng, driverData.vehicleType);
         
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
   
//     socket.on('registerUser', ({ userId, userMobile }) => {
//       if (!userId) {
//         console.error('❌ No userId provided for user registration');
//         return;
//       }
     
//       socket.userId = userId.toString();
//       socket.join(userId.toString());
     
//       console.log(`👤 USER REGISTERED SUCCESSFULLY: ${userId}`);
//     });
   

    

    
//     // In socket.js - Update the registerDriver event handler
// socket.on("registerDriver", async ({ driverId, driverName, latitude, longitude, vehicleType = "TAXI" }) => {
//   try {
//     // ✅ Ensure vehicle type is uppercase
//     const normalizedVehicleType = (vehicleType || 'TAXI').toUpperCase();
    
//     console.log(`📝 DRIVER REGISTRATION: ${driverName} (${driverId}) as ${normalizedVehicleType}`);
    
//     // Store driver in activeDriverSockets map
//     activeDriverSockets.set(driverId, {
//       driverId,
//       driverName,
//       location: { latitude, longitude },
//       vehicleType: normalizedVehicleType,
//       status: 'Live',
//       socketId: socket.id,
//       lastUpdate: Date.now(),
//       isOnline: true
//     });
    
//     // Update driver in database
//     const driverUpdate = {
//       driverId,
//       name: driverName,
//       vehicleType: normalizedVehicleType,
//       status: 'Live',
//       lastUpdate: new Date(),
//       location: {
//         type: 'Point',
//         coordinates: [longitude, latitude]
//       }
//     };
    
//     await Driver.findOneAndUpdate(
//       { driverId },
//       driverUpdate,
//       { upsert: true, new: true }
//     );
    
//     console.log(`✅ Driver ${driverId} registered/updated as ${normalizedVehicleType}`);
    
//     // ✅ CRITICAL FIX: Immediately broadcast driver location to ALL users
//     io.emit("driverLocationsUpdate", {
//       drivers: [{
//         driverId,
//         name: driverName,
//         location: {
//           coordinates: [longitude, latitude]
//         },
//         vehicleType: normalizedVehicleType,
//         status: 'Live',
//         lastUpdate: Date.now()
//       }]
//     });
    
//     // ✅ Also update nearby drivers for all users
//     broadcastDriverLocationsToAllUsers();
    
//   } catch (error) {
//     console.error("❌ Error registering driver:", error);
//   }
// });


//     socket.on("requestNearbyDrivers", ({ latitude, longitude, radius = 5000 }) => {
//       try {
//         console.log(`\n🔍 USER REQUESTED NEARBY DRIVERS: ${socket.id}`);
        
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
        
//         socket.emit("nearbyDriversResponse", { drivers });
//       } catch (error) {
//         console.error("❌ Error fetching nearby drivers:", error);
//         socket.emit("nearbyDriversResponse", { drivers: [] });
//       }
//     });


    

// socket.on("bookRide", async (data, callback) => {
//   let rideId;
//   try {
//     console.log('🚨 ===== REAL USER RIDE BOOKING =====');
//     console.log('📦 User App Data:', {
//       userId: data.userId,
//       customerId: data.customerId, 
//       vehicleType: data.vehicleType,
//       _source: data._source || 'unknown'
//     });

//     const { userId, customerId, userName, userMobile, pickup, drop, vehicleType, estimatedPrice, distance, travelTime, wantReturn } = data;
//     console.log('📥 Received bookRide request');
    
//     // ✅ CRITICAL FIX: Normalize vehicle type to UPPERCASE
//     const normalizedVehicleType = (vehicleType || 'TAXI').toUpperCase();
//     console.log(`🚗 Vehicle Type: ${vehicleType} -> Normalized: ${normalizedVehicleType}`);
    
//     const distanceKm = parseFloat(distance);
//     console.log(`📏 Backend calculating price for ${distanceKm}km ${normalizedVehicleType}`);
   
//     // ✅ FIX: Make sure calculateRidePrice returns a number
//     let backendCalculatedPrice;
//     try {
//       backendCalculatedPrice = await ridePriceController.calculateRidePrice(normalizedVehicleType, distanceKm);
//       if (isNaN(backendCalculatedPrice) || backendCalculatedPrice <= 0) {
//         console.warn(`⚠️ Invalid price returned: ${backendCalculatedPrice}, using fallback`);
//         // Calculate fallback price
//         const pricePerKm = normalizedVehicleType === 'BIKE' ? 15 : 
//                           normalizedVehicleType === 'TAXI' ? 40 : 75;
//         backendCalculatedPrice = Math.round(distanceKm * pricePerKm);
//       }
//     } catch (priceError) {
//       console.error('❌ Price calculation error:', priceError);
//       // Fallback calculation
//       const pricePerKm = normalizedVehicleType === 'BIKE' ? 15 : 
//                         normalizedVehicleType === 'TAXI' ? 40 : 75;
//       backendCalculatedPrice = Math.round(distanceKm * pricePerKm);
//     }
   
//     console.log(`💰 Frontend sent price: ₹${estimatedPrice}, Backend calculated: ₹${backendCalculatedPrice}`);
   
//     const finalPrice = backendCalculatedPrice;
   
//     rideId = await generateSequentialRaidId();
//     console.log(`🆔 Generated RAID_ID: ${rideId}`);
//     console.log(`💰 USING BACKEND CALCULATED PRICE: ₹${finalPrice}`);
    
//     let otp;
//     if (customerId && customerId.length >= 4) {
//       otp = customerId.slice(-4);
//     } else {
//       otp = Math.floor(1000 + Math.random() * 9000).toString();
//     }
    
//     if (processingRides.has(rideId)) {
//       console.log(`⏭️ Ride ${rideId} is already being processed, skipping`);
//       if (callback) {
//         callback({
//           success: false,
//           message: "Ride is already being processed"
//         });
//       }
//       return;
//     }
   
//     processingRides.add(rideId);
    
//     if (!userId || !customerId || !userName || !pickup || !drop) {
//       console.error("❌ Missing required fields");
//       processingRides.delete(rideId);
//       if (callback) {
//         callback({
//           success: false,
//           message: "Missing required fields"
//         });
//       }
//       return;
//     }

//     const existingRide = await Ride.findOne({ RAID_ID: rideId });
//     if (existingRide) {
//       console.log(`⏭️ Ride ${rideId} already exists in database, skipping`);
//       processingRides.delete(rideId);
//       if (callback) {
//         callback({
//           success: true,
//           rideId: rideId,
//           _id: existingRide._id.toString(),
//           otp: existingRide.otp,
//           message: "Ride already exists"
//         });
//       }
//       return;
//     }

//     const rideData = {
//       user: userId,
//       customerId: customerId,
//       name: userName,
//       userMobile: userMobile || "N/A",
//       RAID_ID: rideId,
//       pickupLocation: pickup.address || "Selected Location",
//       dropoffLocation: drop.address || "Selected Location",
//       pickupCoordinates: {
//         latitude: pickup.lat,
//         longitude: pickup.lng
//       },
//       dropoffCoordinates: {
//         latitude: drop.lat,
//         longitude: drop.lng
//       },
//       fare: finalPrice,
//       rideType: normalizedVehicleType,
//       otp: otp,
//       distance: distance || "0 km",
//       travelTime: travelTime || "0 mins",
//       isReturnTrip: wantReturn || false,
//       status: "pending",
//       Raid_date: new Date(),
//       Raid_time: new Date().toLocaleTimeString('en-US', {
//         timeZone: 'Asia/Kolkata',
//         hour12: true
//       }),
//       pickup: {
//         addr: pickup.address || "Selected Location",
//         lat: pickup.lat,
//         lng: pickup.lng,
//       },
//       drop: {
//         addr: drop.address || "Selected Location",
//         lat: drop.lat,
//         lng: drop.lng,
//       },
//       price: finalPrice,
//       distanceKm: distanceKm || 0
//     };

//     const newRide = new Ride(rideData);
//     const savedRide = await newRide.save();
//     console.log(`💾 Ride saved to MongoDB with ID: ${savedRide._id}`);
//     console.log(`💾 BACKEND PRICE SAVED: ₹${savedRide.fare}`);

//     rides[rideId] = {
//       ...data,
//       rideId: rideId,
//       status: "pending",
//       timestamp: Date.now(),
//       _id: savedRide._id.toString(),
//       userLocation: { latitude: pickup.lat, longitude: pickup.lng },
//       fare: finalPrice,
//       vehicleType: normalizedVehicleType
//     };

//     userLocationTracking.set(userId, {
//       latitude: pickup.lat,
//       longitude: pickup.lng,
//       lastUpdate: Date.now(),
//       rideId: rideId
//     });

//     await saveUserLocationToDB(userId, pickup.lat, pickup.lng, rideId);

//     console.log('🚨 EMERGENCY: Sending real-time notifications');
    
//     // ✅ FIX: Handle sendFCMNotifications safely
//     let notificationResult = {
//       success: false,
//       driversNotified: 0,
//       totalDrivers: 0,
//       fcmSent: false,
//       fcmMessage: "FCM notification not attempted"
//     };
    
//     try {
//       notificationResult = await sendFCMNotifications({
//         rideId: rideId,
//         RAID_ID: rideId,
//         _id: savedRide._id.toString(),
//         pickup: pickup,
//         drop: drop,
//         fare: finalPrice,
//         distance: distance || "0 km",
//         vehicleType: normalizedVehicleType,
//         userName: userName,
//         userMobile: userMobile,
//         user: userId
//       });
//       console.log('📊 REAL-TIME NOTIFICATION RESULT:', notificationResult);
//     } catch (fcmError) {
//       console.error('❌ FCM notification error:', fcmError);
//       notificationResult = {
//         success: false,
//         error: fcmError.message,
//         fcmSent: false,
//         fcmMessage: `FCM error: ${fcmError.message}`
//       };
//     }

//     io.emit("newRideRequest", {
//       ...data,
//       rideId: rideId,
//       _id: savedRide._id.toString(),
//       emergency: true
//     });

//     // ✅ FIX: Check if callback exists and notificationResult is defined
//     if (callback) {
//       const responseData = {
//         success: true,
//         rideId: rideId,
//         _id: savedRide._id.toString(),
//         otp: otp,
//         fare: finalPrice,
//         vehicleType: normalizedVehicleType,
//         driversFound: notificationResult.totalDrivers || 0,
//         message: "Ride booked successfully!",
//         notificationResult: notificationResult || {},
//         fcmSent: notificationResult ? notificationResult.fcmSent || false : false,
//         fcmMessage: notificationResult ? notificationResult.fcmMessage || "FCM status unknown" : "FCM not attempted",
//         driversNotified: notificationResult ? notificationResult.driversNotified || 0 : 0
//       };
      
//       console.log('📨 Sending callback response:', responseData);
//       callback(responseData);
//     }

//   } catch (error) {
//     console.error("❌ Error booking ride:", error);
    
//     if (error.name === 'ValidationError') {
//       const errors = Object.values(error.errors).map(err => err.message);
//       console.error("❌ Validation errors:", errors);
      
//       if (callback) {
//         callback({
//           success: false,
//           message: `Validation failed: ${errors.join(', ')}`
//         });
//       }
//     } else if (error.code === 11000 && error.keyPattern && error.keyPattern.RAID_ID) {
//       console.log(`🔄 Duplicate RAID_ID detected: ${rideId}`);
      
//       try {
//         const existingRide = await Ride.findOne({ RAID_ID: rideId });
//         if (existingRide && callback) {
//           callback({
//             success: true,
//             rideId: rideId,
//             _id: existingRide._id.toString(),
//             otp: existingRide.otp,
//             message: "Ride already exists (duplicate handled)"
//           });
//         }
//       } catch (findError) {
//         console.error("❌ Error finding existing ride:", findError);
//         if (callback) {
//           callback({
//             success: false,
//             message: "Failed to process ride booking (duplicate error)"
//           });
//         }
//       }
//     } else {
//       console.error("❌ General error details:", error.message, error.stack);
//       if (callback) {
//         callback({
//           success: false,
//           message: `Failed to process ride booking: ${error.message}`
//         });
//       }
//     }
//   } finally {
//     if (rideId) {
//       processingRides.delete(rideId);
//     }
//   }
// });




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

//     socket.on("acceptRide", async (data, callback) => {
//       const { rideId, driverId, driverName } = data;
      
//       if (rides[rideId] && rides[rideId].driverId === driverId) {
//         console.log(`⚠️ Driver ${driverId} has already accepted ride ${rideId}`);
//         if (callback) {
//           callback({
//             success: false,
//             message: "You have already accepted this ride"
//           });
//         }
//         return;
//       }
      
//       const ride = await Ride.findOne({ 
//         RAID_ID: rideId, 
//         status: "pending" 
//       });
      
//       if (!ride) {
//         console.log(`⚠️ Ride ${rideId} is no longer pending`);
//         if (callback) {
//           callback({
//             success: false,
//             message: "Ride is no longer available"
//           });
//         }
//         return;
//       }
        
//         console.log(`✅ Found ride: ${ride.RAID_ID}, Status: ${ride.status}`);

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

//         try {
//           console.log(`🔄 Updating ride status to 'accepted'`);
//           ride.status = "accepted";
//           ride.driverId = driverId;
//           ride.driverName = driverName;

//           const driver = await Driver.findOne({ driverId });
          
//           if (driver) {
//             ride.driverMobile = driver.phone;
//             console.log(`📱 Driver mobile: ${driver.phone}`);
//           } else {
//             ride.driverMobile = "N/A";
//             console.log(`⚠️ Driver not found in Driver collection`);
//           }

//           if (!ride.otp) {
//             const otp = Math.floor(1000 + Math.random() * 9000).toString();
//             ride.otp = otp;
//             console.log(`🔢 Generated new OTP: ${otp}`);
//           }

//           await ride.save();
//           console.log(`💾 Ride saved successfully`);

//           if (rides[rideId]) {
//             rides[rideId].status = "accepted";
//             rides[rideId].driverId = driverId;
//             rides[rideId].driverName = driverName;
//           }

//           try {
//             console.log(`📢 Sending ride accepted notification to user: ${ride.user}`);
            
//             io.to(ride.user.toString()).emit("rideAcceptedNotification", {
//               rideId: ride.RAID_ID,
//               driverName: driverName,
//               driverId: driverId,
//               message: "Your ride has been accepted!"
//             });
            
//             console.log(`✅ Ride accepted notification sent to user: ${ride.user}`);
//           } catch (notificationError) {
//             console.error("❌ Error sending ride accepted notification:", notificationError);
//           }

//           const driverData = {
//             success: true,
//             rideId: ride.RAID_ID,
//             driverId: driverId,
//             driverName: driverName,
//             driverMobile: ride.driverMobile,
//             driverLat: driver?.location?.coordinates?.[1] || 0,
//             driverLng: driver?.location?.coordinates?.[0] || 0,
//             otp: ride.otp,
//             pickup: ride.pickup,
//             drop: ride.drop,
//             status: ride.status,
//             vehicleType: driver?.vehicleType || "taxi",
//             userName: ride.name,
//             userMobile: rides[rideId]?.userMobile || ride.userMobile || "N/A",
//             timestamp: new Date().toISOString(),
//             fare: ride.fare || ride.price || 0,
//             distance: ride.distance || "0 km"
//           };

//           if (typeof callback === "function") {
//             console.log("📨 Sending callback to driver");
//             callback(driverData);
//           }

//           const userRoom = ride.user.toString();
//           console.log(`📡 Notifying user room: ${userRoom}`);
          
//           io.to(userRoom).emit("rideAccepted", driverData);
//           console.log("✅ Notification sent via standard room channel");
          
//           const userSockets = await io.in(userRoom).fetchSockets();
//           console.log(`🔍 Found ${userSockets.length} sockets in user room`);
//           userSockets.forEach((userSocket, index) => {
//             userSocket.emit("rideAccepted", driverData);
//           });

//           io.emit("rideAcceptedGlobal", {
//             ...driverData,
//             targetUserId: userRoom,
//             timestamp: new Date().toISOString()
//           });

//           setTimeout(() => {
//             io.to(userRoom).emit("rideAccepted", driverData);
//             console.log("✅ Backup notification sent after delay");
//           }, 1000);

//           const userDataForDriver = {
//             success: true,
//             rideId: ride.RAID_ID,
//             userId: ride.user,
//             customerId: ride.customerId,
//             userName: ride.name,
//             userMobile: rides[rideId]?.userMobile || ride.userMobile || "N/A",
//             pickup: ride.pickup,
//             drop: ride.drop,
//             otp: ride.otp,
//             status: ride.status,
//             timestamp: new Date().toISOString()
//           };

//           const driverSocket = Array.from(io.sockets.sockets.values()).find(s => s.driverId === driverId);
//           if (driverSocket) {
//             driverSocket.emit("userDataForDriver", userDataForDriver);
//             console.log("✅ User data sent to driver:", driverId);
//           } else {
//             io.to(`driver_${driverId}`).emit("userDataForDriver", userDataForDriver);
//             console.log("✅ User data sent to driver room:", driverId);
//           }

//           socket.broadcast.emit("rideAlreadyAccepted", {
//             rideId,
//             message: "This ride has already been accepted by another driver."
//           });

//           console.log("📢 Other drivers notified");

//           if (activeDriverSockets.has(driverId)) {
//             const driverInfo = activeDriverSockets.get(driverId);
//             driverInfo.status = "onRide";
//             driverInfo.isOnline = true;
//             activeDriverSockets.set(driverId, driverInfo);
//             console.log(`🔄 Updated driver ${driverId} status to 'onRide'`);
//           }

//           console.log(`🎉 RIDE ${rideId} ACCEPTED SUCCESSFULLY BY ${driverName}`);
//         } catch (error) {
//           console.error(`❌ ERROR ACCEPTING RIDE ${rideId}:`, error);
//           console.error("Stack:", error.stack);
          
//           if (typeof callback === "function") {
//             callback({
//               success: false,
//               message: "Server error: " + error.message
//             });
//           }
//         }
//       });

//     socket.on("userLocationUpdate", async (data) => {
//       try {
//         const { userId, rideId, latitude, longitude } = data;
       
//         console.log(`📍 USER LOCATION UPDATE: User ${userId} for ride ${rideId}`);
       
//         userLocationTracking.set(userId, {
//           latitude,
//           longitude,
//           lastUpdate: Date.now(),
//           rideId: rideId
//         });
       
//         logUserLocationUpdate(userId, { latitude, longitude }, rideId);
       
//         await saveUserLocationToDB(userId, latitude, longitude, rideId);
       
//         if (rides[rideId]) {
//           rides[rideId].userLocation = { latitude, longitude };
//           console.log(`✅ Updated user location in memory for ride ${rideId}`);
//         }
       
//         let driverId = null;
       
//         if (rides[rideId] && rides[rideId].driverId) {
//           driverId = rides[rideId].driverId;
//           console.log(`✅ Found driver ID in memory: ${driverId} for ride ${rideId}`);
//         } else {
//           const ride = await Ride.findOne({ RAID_ID: rideId });
//           if (ride && ride.driverId) {
//             driverId = ride.driverId;
//             console.log(`✅ Found driver ID in database: ${driverId} for ride ${rideId}`);
           
//             if (!rides[rideId]) {
//               rides[rideId] = {};
//             }
//             rides[rideId].driverId = driverId;
//           } else {
//             console.log(`❌ No driver assigned for ride ${rideId} in database either`);
//             return;
//           }
//         }
       
//         const driverRoom = `driver_${driverId}`;
//         const locationData = {
//           rideId: rideId,
//           userId: userId,
//           lat: latitude,
//           lng: longitude,
//           timestamp: Date.now()
//         };
       
//         console.log(`📡 Sending user location to driver ${driverId} in room ${driverRoom}`);
       
//         io.to(driverRoom).emit("userLiveLocationUpdate", locationData);
       
//         io.emit("userLiveLocationUpdate", locationData);
       
//       } catch (error) {
//         console.error("❌ Error processing user location update:", error);
//       }
//     });

//     const updateDriverFCMToken = async (driverId, fcmToken) => {
//       try {
//         console.log(`📱 Updating FCM token for driver: ${driverId}`);
        
//         const Driver = require('./models/driver/driver');
//         const result = await Driver.findOneAndUpdate(
//           { driverId: driverId },
//           { 
//             fcmToken: fcmToken,
//             fcmTokenUpdatedAt: new Date(),
//             platform: 'android'
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

//     socket.on("requestRideOTP", async (data, callback) => {
//       try {
//         const { rideId } = data;
        
//         if (!rideId) {
//           if (callback) callback({ success: false, message: "No ride ID provided" });
//           return;
//         }
        
//         const ride = await Ride.findOne({ RAID_ID: rideId });
        
//         if (!ride) {
//           if (callback) callback({ success: false, message: "Ride not found" });
//           return;
//         }
        
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

//     socket.on("otpVerified", async (data) => {
//       try {
//         const { rideId, driverId } = data;
//         console.log(`✅ OTP Verified for ride ${rideId}, notifying user`);
        
//         const ride = await Ride.findOne({ RAID_ID: rideId });
//         if (!ride) {
//           console.error(`❌ Ride ${rideId} not found for OTP verification`);
//           return;
//         }
        
//         const userId = ride.user?.toString() || ride.userId;
//         if (!userId) {
//           console.error(`❌ No user ID found for ride ${rideId}`);
//           return;
//         }
        
//         console.log(`📡 Notifying user ${userId} about OTP verification for ride ${rideId}`);
        
//         const notificationData = {
//           rideId,
//           driverId,
//           userId,
//           status: "started",
//           otpVerified: true,
//           timestamp: new Date().toISOString(),
//           message: "OTP verified successfully! Ride has started."
//         };
        
//         io.to(userId.toString()).emit("otpVerified", notificationData);
//         io.to(userId.toString()).emit("rideOTPVerified", notificationData);
//         io.to(userId.toString()).emit("rideStatusUpdate", {
//           rideId,
//           status: "started",
//           otpVerified: true,
//           message: "Driver has verified OTP and started the ride",
//           timestamp: new Date().toISOString()
//         });
        
//         io.emit("otpVerifiedGlobal", {
//           ...notificationData,
//           targetUserId: userId
//         });
        
//         setTimeout(() => {
//           io.to(userId.toString()).emit("otpVerified", notificationData);
//           console.log(`✅ Backup OTP notification sent to user ${userId}`);
//         }, 500);
        
//         console.log(`✅ All OTP verification events sent to user ${userId}`);
        
//       } catch (error) {
//         console.error("❌ Error handling OTP verification:", error);
//       }
//     });

//     socket.on("driverStartedRide", async (data) => {
//       try {
//         const { rideId, driverId } = data;
//         console.log(`🚀 Driver started ride: ${rideId}`);
        
//         const ride = await Ride.findOne({ RAID_ID: rideId });
//         if (ride) {
//           ride.status = "started";
//           ride.rideStartTime = new Date();
//           await ride.save();
//           console.log(`✅ Ride ${rideId} status updated to 'started'`);
//         }
        
//         if (rides[rideId]) {
//           rides[rideId].status = "started";
//         }

//         const userId = ride.user?.toString() || ride.userId;
//         if (!userId) {
//           console.error(`❌ No user ID found for ride ${rideId}`);
//           return;
//         }

//         const userRoom = userId.toString();
//         console.log(`📡 Notifying user ${userRoom} about ride start and OTP verification`);

//         io.to(userRoom).emit("rideStatusUpdate", {
//           rideId: rideId,
//           status: "started",
//           message: "Driver has started the ride",
//           otpVerified: true,
//           timestamp: new Date().toISOString()
//         });

//         io.to(userRoom).emit("otpVerified", {
//           rideId: rideId,
//           driverId: driverId,
//           userId: userId,
//           status: "started",
//           otpVerified: true,
//           timestamp: new Date().toISOString()
//         });

//         io.to(userRoom).emit("driverStartedRide", {
//           rideId: rideId,
//           driverId: driverId,
//           status: "started",
//           otpVerified: true,
//           timestamp: new Date().toISOString()
//         });

//         io.emit("otpVerifiedGlobal", {
//           rideId: rideId,
//           targetUserId: userRoom,
//           status: "started",
//           otpVerified: true,
//           timestamp: new Date().toISOString()
//         });

//         setTimeout(() => {
//           io.to(userRoom).emit("otpVerified", {
//             rideId: rideId,
//             driverId: driverId,
//             userId: userId,
//             status: "started",
//             otpVerified: true,
//             timestamp: new Date().toISOString()
//           });
//           console.log(`✅ Backup OTP verification notification sent to user ${userRoom}`);
//         }, 1000);

//         console.log(`✅ All OTP verification notifications sent to user ${userRoom}`);

//         socket.emit("rideStarted", {
//           rideId: rideId,
//           message: "Ride started successfully"
//         });
        
//       } catch (error) {
//         console.error("❌ Error processing driver started ride:", error);
//       }
//     });

//     socket.on("rideStatusUpdate", (data) => {
//       try {
//         const { rideId, status, userId } = data;
//         console.log(`📋 Ride status update: ${rideId} -> ${status}`);
        
//         if (status === "started" && data.otpVerified) {
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

//     socket.on("rideCompleted", async (data) => {
//       try {
//         const { rideId, driverId, userId, distance, fare, actualPickup, actualDrop } = data;
        
//         console.log(`🏁 Ride ${rideId} completed by driver ${driverId}`);
//         console.log(`💰 Fare: ₹${fare}, Distance: ${distance}km`);
        
//         const ride = await Ride.findOne({ RAID_ID: rideId });
//         if (ride) {
//           ride.status = 'completed';
//           ride.completedAt = new Date();
//           ride.actualDistance = distance;
//           ride.actualFare = fare;
//           ride.actualPickup = actualPickup;
//           ride.actualDrop = actualDrop;
//           await ride.save();
          
//           console.log(`✅ Ride ${rideId} marked as completed in database`);
//         }
        
//         await Driver.findOneAndUpdate(
//           { driverId: driverId },
//           {
//             status: 'Live',
//             lastUpdate: new Date()
//           }
//         );
        
//         const userRoom = userId?.toString() || ride?.user?.toString();
//         if (userRoom) {
//           console.log(`💰 Sending BILL ALERT to user ${userRoom}`);
          
//           io.to(userRoom).emit("billAlert", {
//             type: "bill",
//             rideId: rideId,
//             distance: `${distance} km`,
//             fare: fare,
//             driverName: ride?.driverName || "Driver",
//             vehicleType: ride?.rideType || "bike",
//             actualPickup: actualPickup,
//             actualDrop: actualDrop,
//             timestamp: new Date().toISOString(),
//             message: "Ride completed! Here's your bill.",
//             showBill: true,
//             priority: "high"
//           });
          
//           io.to(userRoom).emit("rideCompleted", {
//             rideId: rideId,
//             distance: distance,
//             charge: fare,
//             driverName: ride?.driverName || "Driver",
//             vehicleType: ride?.rideType || "bike",
//             timestamp: new Date().toISOString()
//           });
          
//           io.to(userRoom).emit("rideCompletedAlert", {
//             rideId: rideId,
//             driverName: ride?.driverName || "Driver",
//             fare: fare,
//             distance: distance,
//             message: "Your ride has been completed successfully!",
//             alertTitle: "✅ Ride Completed",
//             alertMessage: `Thank you for using our service! Your ride has been completed. Total fare: ₹${fare}`,
//             showAlert: true,
//             priority: "high"
//           });
          
//           console.log(`✅ Bill and completion alerts sent to user ${userRoom}`);
//         }
        
//         socket.emit("rideCompletedSuccess", {
//           rideId: rideId,
//           message: "Ride completed successfully",
//           timestamp: new Date().toISOString()
//         });
        
//         const driverRoom = `driver_${driverId}`;
//         io.to(driverRoom).emit("paymentStatus", {
//           rideId: rideId,
//           status: "pending",
//           message: "Payment is pending. Please wait for confirmation.",
//           timestamp: new Date().toISOString()
//         });
        
//       } catch (error) {
//         console.error("❌ Error processing ride completion:", error);
//       }
//     });

//     socket.on("rejectRide", (data) => {
//       try {
//         const { rideId, driverId } = data;
       
//         console.log(`\n❌ RIDE REJECTED: ${rideId}`);
//         console.log(`🚗 Driver: ${driverId}`);
       
//         if (rides[rideId]) {
//           rides[rideId].status = "rejected";
//           rides[rideId].rejectedAt = Date.now();
         
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

//     socket.on("driverHeartbeat", ({ driverId }) => {
//       if (activeDriverSockets.has(driverId)) {
//         const driverData = activeDriverSockets.get(driverId);
//         driverData.lastUpdate = Date.now();
//         driverData.isOnline = true;
//         activeDriverSockets.set(driverId, driverData);
       
//         console.log(`❤️ Heartbeat received from driver: ${driverId}`);
//       }
//     });
   
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

//     socket.on("disconnect", () => {
//       console.log(`\n❌ Client disconnected: ${socket.id}`);
//       console.log(`📱 Remaining connected clients: ${io.engine.clientsCount - 1}`);
     
//       if (socket.driverId) {
//         console.log(`🛑 Driver ${socket.driverName} (${socket.driverId}) disconnected`);
       
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

// const getIO = () => {
//   if (!io) throw new Error("❌ Socket.io not initialized!");
//   return io;
// };

// module.exports = { init, getIO, broadcastPricesToAllUsers };











































