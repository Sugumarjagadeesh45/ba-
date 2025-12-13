const { Server } = require("socket.io");
const DriverLocation = require("./models/DriverLocation"); // Fixed path
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
    console.log('📢 Sending ride request to drivers...');
    console.log(`🚗 REQUIRED Vehicle type: ${rideData.vehicleType}`);
    console.log(`📍 Pickup: ${rideData.pickup?.address || 'No address'}`);
    console.log(`🎯 Drop: ${rideData.drop?.address || 'No address'}`);

    // Get drivers with EXACT vehicle type match
    const Driver = require('./models/driver/driver');
    const allDrivers = await Driver.find({
      status: "Live",
      vehicleType: rideData.vehicleType,
      fcmToken: { $exists: true, $ne: null, $ne: '' }
    });

    console.log(`📊 ${rideData.vehicleType} drivers available: ${allDrivers.length}`);

    // Also check activeDriverSockets for real-time filtering
    const onlineDriversWithType = Array.from(activeDriverSockets.entries())
      .filter(([id, driver]) =>
        driver.isOnline &&
        driver.vehicleType === rideData.vehicleType
      )
      .map(([id, driver]) => driver);

    console.log(`📱 Online ${rideData.vehicleType} drivers: ${onlineDriversWithType.length}`);

    if (allDrivers.length === 0 && onlineDriversWithType.length === 0) {
      console.log(`⚠️ No ${rideData.vehicleType} drivers available`);
      return {
        success: false,
        message: `No ${rideData.vehicleType} drivers available`,
        sentCount: 0,
        totalDrivers: 0,
        fcmSent: false,
        vehicleType: rideData.vehicleType
      };
    }

    // Send socket notification to filtered drivers only
    io.emit("newRideRequest", {
      ...rideData,
      rideId: rideData.rideId,
      _id: savedRide?._id?.toString() || null,
      vehicleType: rideData.vehicleType,
      timestamp: new Date().toISOString()
    });

    // FCM notification to drivers with tokens
    const driversWithFCM = allDrivers.filter(driver => driver.fcmToken);

    if (driversWithFCM.length > 0) {
      console.log(`🎯 Sending FCM to ${driversWithFCM.length} ${rideData.vehicleType} drivers`);

      const notificationData = {
        type: "ride_request",
        rideId: rideData.rideId,
        pickup: JSON.stringify(rideData.pickup || {}),
        drop: JSON.stringify(rideData.drop || {}),
        fare: rideData.fare?.toString() || "0",
        distance: rideData.distance?.toString() || "0",
        vehicleType: rideData.vehicleType,
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
        `🚖 New ${rideData.vehicleType.toUpperCase()} Ride Request!`,
        `Pickup: ${rideData.pickup?.address?.substring(0, 40) || 'Location'}... | Fare: ₹${rideData.fare}`,
        notificationData
      );

      return {
        success: fcmResult.successCount > 0,
        driversNotified: fcmResult.successCount,
        totalDrivers: driversWithFCM.length,
        fcmSent: fcmResult.successCount > 0,
        vehicleType: rideData.vehicleType,
        fcmMessage: fcmResult.successCount > 0 ?
          `FCM sent to ${fcmResult.successCount} ${rideData.vehicleType} drivers` :
          `FCM failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
      };
    }
    
    return {
      success: false,
      driversNotified: 0,
      totalDrivers: 0,
      fcmSent: false,
      vehicleType: rideData.vehicleType,
      fcmMessage: `No drivers with valid FCM tokens for ${rideData.vehicleType}`
    };
    
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

    socket.on("retryFCMNotification", async (data, callback) => {
      try {
        const { rideId, retryCount } = data;
        
        console.log(`🔄 FCM retry attempt #${retryCount} for ride: ${rideId}`);
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (!ride) {
          if (callback) callback({ 
            success: false, 
            message: 'Ride not found' 
          });
          return;
        }
        
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

    socket.on("driverLocationUpdate", async (data) => {
      try {
        const { driverId, rideId, latitude, longitude } = data;
        
        console.log(`📍 Driver ${driverId} location update for ride ${rideId}`);
        
        await Driver.findOneAndUpdate(
          { driverId },
          {
            location: {
              type: "Point",
              coordinates: [longitude, latitude]
            },
            lastUpdate: new Date()
          }
        );
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride && ride.user) {
          io.to(ride.user.toString()).emit("driverLiveLocation", {
            rideId: rideId,
            driverId: driverId,
            latitude: latitude,
            longitude: longitude,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error("❌ Error processing driver location:", error);
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

    socket.on("registerDriver", async ({ driverId, driverName, latitude, longitude }) => {
      try {
        console.log(`\n📝 DRIVER REGISTRATION: ${driverName} (${driverId})`);
        
        const Driver = require('./models/driver/driver');
        const driver = await Driver.findOne({ driverId });
        
        if (!driver) {
          console.error(`❌ Driver ${driverId} not found in database`);
          return;
        }
        
        if (!driver.vehicleType) {
          console.error(`❌ Driver ${driverId} has no vehicleType in database`);
          return;
        }
        
        const validTypes = ["port", "taxi", "bike", "sedan", "mini", "suv", "auto"];
        const validatedVehicleType = validTypes.includes(driver.vehicleType) 
          ? driver.vehicleType 
          : "taxi";
        
        activeDriverSockets.set(driverId, {
          socketId: socket.id,
          driverId,
          driverName,
          location: { latitude, longitude },
          vehicleType: validatedVehicleType,
          lastUpdate: Date.now(),
          status: "Live",
          isOnline: true
        });
        
        console.log(`✅ DRIVER REGISTERED: ${driverName} - Vehicle: ${validatedVehicleType}`);
        
      } catch (error) {
        console.error("❌ Error registering driver:", error);
      }
    });

    socket.on("requestNearbyDrivers", ({ latitude, longitude, radius = 5000 }) => {
      try {
        console.log(`\n🔍 USER REQUESTED NEARBY DRIVERS: ${socket.id}`);
        
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
        
        socket.emit("nearbyDriversResponse", { drivers });
      } catch (error) {
        console.error("❌ Error fetching nearby drivers:", error);
        socket.emit("nearbyDriversResponse", { drivers: [] });
      }
    });

    socket.on("bookRide", async (data, callback) => {
      let rideId;
      try {
        console.log('\n🚨 ===== 🚖 NEW RIDE BOOKING REQUEST ===== 🚖');
        console.log('📦 USER APP DATA RECEIVED:');
        console.log(' 👤 User ID:', data.userId);
        console.log(' 📞 Customer ID:', data.customerId);
        console.log(' 🚗 Vehicle Type:', data.vehicleType);
        console.log(' 📍 Pickup:', data.pickup?.address);
        console.log(' 🎯 Drop:', data.drop?.address);
        console.log(' 💰 Estimated Fare:', data.estimatedPrice);
        console.log(' 📏 Distance:', data.distance);
        console.log(' ⏱️ Travel Time:', data.travelTime);
        console.log(' 🔑 FCM Required:', data._fcmRequired);

        const { userId, customerId, userName, userMobile, pickup, drop, vehicleType, estimatedPrice, distance, travelTime, wantReturn } = data;

        if (!pickup || !drop) {
          console.log("❌ Missing pickup or drop location");
          if (callback) {
            callback({
              success: false,
              message: "Pickup and drop locations are required"
            });
          }
          return;
        }

        const distanceKm = parseFloat(distance);
        const backendCalculatedPrice = await ridePriceController.calculateRidePrice(vehicleType, distanceKm);

        rideId = await generateSequentialRaidId();

        let otp;
        if (customerId && customerId.length >= 4) {
          otp = customerId.slice(-4);
        } else {
          otp = Math.floor(1000 + Math.random() * 9000).toString();
        }

        console.log('💰 PRICE CALCULATION:');
        console.log(' 📊 Distance (km):', distanceKm);
        console.log(' 🚗 Vehicle Type:', vehicleType);
        console.log(' 💵 Calculated Fare:', backendCalculatedPrice);
        console.log(' 🔢 Generated OTP:', otp);
        console.log(' 🆔 Generated RAID_ID:', rideId);

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

        const pickupLat = pickup?.lat || pickup?.latitude || 0;
        const pickupLng = pickup?.lng || pickup?.longitude || 0;
        const dropLat = drop?.lat || drop?.latitude || 0;
        const dropLng = drop?.lng || drop?.longitude || 0;

        // In bookRide handler, after getting user data:
        const Registration = require('./models/user/Registration');
        const user = await Registration.findById(userId);
        const userPhoneNumber = user?.phoneNumber || userMobile || "Contact Admin";

        console.log(`📱 User's actual phone from Registration: ${userPhoneNumber}`);

        const rideData = {
          user: userId,
          customerId: customerId,
          name: userName,
          userMobile: userPhoneNumber, // ✅ Store actual user mobile number
          userPhone: userPhoneNumber, // ✅ Also store in userPhone field

          RAID_ID: rideId,
          pickupLocation: pickup.address || "Selected Location",
          dropoffLocation: drop.address || "Selected Location",
          pickupCoordinates: {
            latitude: pickupLat,
            longitude: pickupLng
          },
          dropoffCoordinates: {
            latitude: dropLat,
            longitude: dropLng
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
            lat: pickupLat,
            lng: pickupLng,
          },
          drop: {
            addr: drop.address || "Selected Location",
            lat: dropLat,
            lng: dropLng,
          },
          price: backendCalculatedPrice,
          distanceKm: distanceKm || 0
        };

        console.log('💾 SAVING RIDE TO DATABASE...');
        console.log('📝 Ride data to save:', rideData);

        const newRide = new Ride(rideData);
        const savedRide = await newRide.save();
        console.log(`✅ RIDE SAVED TO MONGODB: ${savedRide._id}`);

        rides[rideId] = {
          ...data,
          rideId: rideId,
          status: "pending",
          timestamp: Date.now(),
          _id: savedRide._id.toString(),
          userLocation: { latitude: pickupLat, longitude: pickupLng },
          fare: backendCalculatedPrice,
          userMobile: userPhoneNumber // ✅ Store mobile in memory too
        };

        userLocationTracking.set(userId, {
          latitude: pickupLat,
          longitude: pickupLng,
          lastUpdate: Date.now(),
          rideId: rideId
        });

        await saveUserLocationToDB(userId, pickupLat, pickupLng, rideId);

        console.log('\n📢 ===== SENDING NOTIFICATIONS TO DRIVERS =====');
        console.log(`🎯 Target: ALL online drivers with FCM tokens`);

        const notificationResult = await sendRideRequestToAllDrivers({
          rideId: rideId,
          pickup: {
            lat: pickupLat,
            lng: pickupLng,
            address: pickup.address || "Selected Location"
          },
          drop: {
            lat: dropLat,
            lng: dropLng,
            address: drop.address || "Selected Location"
          },
          fare: backendCalculatedPrice,
          distance: distance,
          vehicleType: data.vehicleType,
          userName: userName,
          userMobile: userPhoneNumber, // ✅ Send actual mobile to drivers
          otp: otp
        }, savedRide);

        console.log('📱 FCM NOTIFICATION RESULT:');
        console.log(' ✅ Success Count:', notificationResult.successCount || 0);
        console.log(' ❌ Failure Count:', notificationResult.failureCount || 0);
        console.log(' 📊 Total Drivers:', notificationResult.totalDrivers || 0);
        console.log(' 🔔 FCM Sent:', notificationResult.fcmSent ? 'YES' : 'NO');
        console.log(' 💬 Message:', notificationResult.fcmMessage);

        console.log('🔔 SENDING SOCKET NOTIFICATION AS BACKUP...');
        io.emit("newRideRequest", {
          rideId: rideId,
          pickup: {
            lat: pickupLat,
            lng: pickupLng,
            address: pickup.address || "Selected Location"
          },
          drop: {
            lat: dropLat,
            lng: dropLng,
            address: drop.address || "Selected Location"
          },
          fare: backendCalculatedPrice,
          distance: distance,
          vehicleType: vehicleType,
          userName: userName,
          userMobile: userPhoneNumber, // ✅ Send actual mobile
          otp: otp,
          timestamp: new Date().toISOString()
        });

        console.log('\n✅ ===== RIDE BOOKING COMPLETED SUCCESSFULLY =====');
        console.log(`🆔 RAID_ID: ${rideId}`);
        console.log(`👤 Customer: ${userName}`);
        console.log(`📞 Mobile: ${userPhoneNumber}`); // ✅ Log actual mobile
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
            driversNotified: notificationResult.driversNotified || 0,
            userMobile: userPhoneNumber // ✅ Return mobile to user app
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

    // ACCEPT RIDE
    socket.on("acceptRide", async (data, callback) => {
      console.log("🚨 ===== BACKEND ACCEPT RIDE START =====");
      console.log("📥 Acceptance Data:", { rideId: data.rideId, driverId: data.driverId });

      try {
        console.log(`🔍 Looking for ride: ${data.rideId}`);
        
        // ✅ FIX: Populate user data to get mobile number
        const ride = await Ride.findOne({ RAID_ID: data.rideId })
          .populate('user', 'phoneNumber mobile name'); // Populate user details

        if (!ride) {
          console.error(`❌ Ride ${data.rideId} not found in database`);
          if (typeof callback === "function") {
            callback({ success: false, message: "Ride not found" });
          }
          return;
        }

        console.log(`✅ Found ride: ${ride.RAID_ID}, Status: ${ride.status}`);
        console.log(`📱 Ride userMobile from DB: ${ride.userMobile}`);
        console.log(`👤 User object from DB:`, ride.user);

        // Check ride status
        if (ride.status !== 'pending') {
          console.log(`❌ Ride ${data.rideId} is already ${ride.status}`);
          
          if (typeof callback === "function") {
            callback({ 
              success: false, 
              message: `Ride already ${ride.status}`,
              currentStatus: ride.status
            });
          }
          return;
        }

        // Get driver location...
        let driverCurrentLocation = null;
        if (activeDriverSockets.has(data.driverId)) {
          const driverData = activeDriverSockets.get(data.driverId);
          driverCurrentLocation = {
            latitude: driverData.location.latitude,
            longitude: driverData.location.longitude
          };
          console.log(`📍 Driver ${data.driverId} ACTUAL location:`, driverCurrentLocation);
        } else {
          const driver = await Driver.findOne({ driverId: data.driverId });
          if (driver && driver.location && driver.location.coordinates) {
            driverCurrentLocation = {
              latitude: driver.location.coordinates[1],
              longitude: driver.location.coordinates[0]
            };
            console.log(`📍 Driver ${data.driverId} DB location:`, driverCurrentLocation);
          }
        }

        if (!driverCurrentLocation) {
          console.error(`❌ Could not get driver ${data.driverId} location`);
          if (typeof callback === "function") {
            callback({ success: false, message: "Could not get driver location" });
          }
          return;
        }

        // Get driver's mobile
        const driver = await Driver.findOne({ driverId: data.driverId });
        const driverMobile = driver?.phone || driver?.phoneNumber || "N/A";

        // ✅ FIX: Get user's ACTUAL mobile number from multiple sources
        let userMobile = "Contact Admin";
        
        if (ride.userMobile && ride.userMobile !== "Contact Admin" && ride.userMobile !== "N/A") {
          userMobile = ride.userMobile;
          console.log(`✅ Using userMobile from ride: ${userMobile}`);
        } else if (ride.userPhone && ride.userPhone !== "Contact Admin" && ride.userPhone !== "N/A") {
          userMobile = ride.userPhone;
          console.log(`✅ Using userPhone from ride: ${userMobile}`);
        } else if (ride.user && ride.user.phoneNumber) {
          userMobile = ride.user.phoneNumber;
          console.log(`✅ Using phoneNumber from populated user: ${userMobile}`);
        } else if (ride.user && ride.user.mobile) {
          userMobile = ride.user.mobile;
          console.log(`✅ Using mobile from populated user: ${userMobile}`);
        } else {
          console.log(`⚠️ No valid mobile found, using: ${userMobile}`);
        }

        // Update ride
        const updatedRide = await Ride.findOneAndUpdate(
          { RAID_ID: data.rideId, status: 'pending' },
          {
            driverId: data.driverId,
            driverName: data.driverName || "Driver",
            driverMobile: driverMobile,
            status: 'accepted',
            acceptedAt: new Date(),
            driverLocationAtAcceptance: driverCurrentLocation
          },
          { new: true, runValidators: true }
        );

        if (!updatedRide) {
          console.log(`⚠️ Could not update ride ${data.rideId}`);
          if (typeof callback === "function") {
            callback({ 
              success: false, 
              message: "Ride was just accepted by another driver"
            });
          }
          return;
        }

        await Driver.findOneAndUpdate(
          { driverId: data.driverId },
          {
            status: 'onRide',
            lastRideId: data.rideId,
            lastUpdate: new Date()
          }
        );

        console.log(`✅ Ride ${data.rideId} accepted by ${data.driverId}`);
        console.log(`📱 FINAL userMobile being sent: ${userMobile}`);

        // ✅ FIXED: Include ACTUAL userMobile in response
        const rideData = {
          success: true,
          rideId: ride.RAID_ID,
          driverId: data.driverId,
          driverName: data.driverName || "Driver",
          driverMobile: driverMobile,
          userMobile: userMobile, // ✅ ACTUAL user mobile number
          driverCurrentLocation: driverCurrentLocation,
          driverLat: driverCurrentLocation.latitude,
          driverLng: driverCurrentLocation.longitude,
          locationType: 'driver_current_location',
          pickup: {
            addr: ride.pickupLocation || ride.pickup?.addr || "Pickup location",
            lat: ride.pickupCoordinates?.latitude || ride.pickup?.lat || 0,
            lng: ride.pickupCoordinates?.longitude || ride.pickup?.lng || 0
          },
          drop: {
            addr: ride.dropoffLocation || ride.drop?.addr || "Drop location",
            lat: ride.dropoffCoordinates?.latitude || ride.drop?.lat || 0,
            lng: ride.dropoffCoordinates?.longitude || ride.drop?.lng || 0
          },
          fare: ride.fare || ride.price || 0,
          distance: ride.distance || "0 km",
          vehicleType: ride.rideType || ride.vehicleType || "taxi",
          userName: ride.name || "Customer",
          userPhone: userMobile, // ✅ Also include as userPhone
          otp: ride.otp,
          status: 'accepted',
          timestamp: new Date().toISOString()
        };

        console.log("📤 Sending ride acceptance response with mobile:", userMobile);

        // ✅ SEND TO DRIVER
        if (typeof callback === "function") {
          callback(rideData);
        }

        // ✅ NOTIFY USER WITH CORRECT DRIVER LOCATION
        const userRoom = ride.user ? ride.user.toString() : ride.userId?.toString();
        if (userRoom) {
          console.log(`📡 Notifying user room: ${userRoom}`);
          
          io.to(userRoom).emit("rideAccepted", {
            ...rideData,
            message: "Driver accepted your ride!",
            driverDetails: {
              name: data.driverName || "Driver",
              currentLocation: driverCurrentLocation,
              vehicleType: ride.rideType || "taxi",
              mobile: driverMobile
            }
          });
        }

        // ✅ BROADCAST TO ALL OTHER DRIVERS THAT RIDE IS TAKEN
        io.emit("rideAlreadyTaken", {
          rideId: data.rideId,
          takenBy: data.driverName || "Driver",
          driverId: data.driverId,
          timestamp: new Date().toISOString(),
          message: "This ride has been accepted by another driver."
        });

        console.log("✅ Ride acceptance process completed with ACTUAL user mobile");

      } catch (error) {
        console.error(`❌ ERROR ACCEPTING RIDE ${data.rideId}:`, error);
        if (typeof callback === "function") {
          callback({
            success: false,
            message: "Server error: " + error.message
          });
        }
      }
    });

    // OTP VERIFICATION
    socket.on("otpVerified", async (data) => {
      try {
        const { rideId, driverId, userId } = data;
        console.log(`✅ OTP Verified for ride ${rideId}`);
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride) {
          ride.status = 'started';
          ride.rideStartTime = new Date();
          await ride.save();
          
          const userRoom = ride.user?.toString() || userId?.toString();
          if (userRoom) {
            io.to(userRoom).emit("otpVerifiedAlert", {
              rideId: rideId,
              driverId: driverId,
              status: 'started',
              timestamp: new Date().toISOString(),
              message: "OTP verified! Ride has started.",
              showAlert: true,
              alertTitle: "✅ OTP Verified Successfully!",
              alertMessage: "Your ride is now starting. Driver is on the way to your destination."
            });
            
            console.log(`✅ OTP verified alert sent to user ${userRoom}`);
          }
        }
      } catch (error) {
        console.error("❌ Error handling OTP verification:", error);
      }
    });

    // RIDE START
    socket.on("driverStartedRide", async (data) => {
      try {
        const { rideId, driverId, userId } = data;
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
        
        const userRoom = ride.user.toString();
        
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
          timestamp: new Date().toISOString(),
          otpVerified: true
        });
        
        io.to(userRoom).emit("driverStartedRide", {
          rideId: rideId,
          driverId: driverId,
          timestamp: new Date().toISOString(),
          otpVerified: true
        });
        
        console.log(`✅ All OTP verification events sent to user room: ${userRoom}`);
        
        socket.emit("rideStarted", {
          rideId: rideId,
          message: "Ride started successfully"
        });
        
      } catch (error) {
        console.error("❌ Error processing driver started ride:", error);
      }
    });

    // RIDE COMPLETION
    socket.on("completeRide", async (data) => {
      try {
        const { rideId, driverId, distance, fare, actualPickup, actualDrop } = data;
        
        console.log(`\n🎉 RIDE COMPLETED: ${rideId}`);
        console.log(`🚗 Driver: ${driverId}`);
        console.log(`📏 Distance: ${distance} km`);
        console.log(`💰 Fare: ₹${fare}`);
        
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
        
        const userRoom = ride.user?.toString();
        if (userRoom) {
          console.log(`💰 Sending BILL ALERT to user ${userRoom}`);
          
          // Send bill alert to user
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
          
          // Send ride completion notification to user
          io.to(userRoom).emit("rideCompleted", {
            rideId: rideId,
            distance: distance,
            charge: fare,
            driverName: ride?.driverName || "Driver",
            vehicleType: ride?.rideType || "bike",
            timestamp: new Date().toISOString()
          });
          
          // Send completion alert to user
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
        
        // Notify driver that ride is completed
        socket.emit("rideCompletedSuccess", {
          rideId: rideId,
          message: "Ride completed successfully",
          timestamp: new Date().toISOString()
        });
        
        // Update rides in memory
        if (rides[rideId]) {
          rides[rideId].status = "completed";
          rides[rideId].completedAt = Date.now();
          rides[rideId].distance = distance;
          rides[rideId].fare = fare;
          
          setTimeout(() => {
            delete rides[rideId];
            console.log(`🗑️ Removed completed ride: ${rideId}`);
          }, 5000);
        }
        
      } catch (error) {
        console.error("❌ Error completing ride:", error);
      }
    });

    socket.on("driverLiveLocation", async (data) => {
      try {
        const { rideId, driverId, latitude, longitude } = data;
        
        console.log(`📍 Driver ${driverId} live location for ride ${rideId}:`, { latitude, longitude });
        
        await Driver.findOneAndUpdate(
          { driverId },
          {
            location: {
              type: "Point",
              coordinates: [longitude, latitude]
            },
            lastUpdate: new Date()
          }
        );
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride && ride.user) {
          io.to(ride.user.toString()).emit("driverLocationUpdate", {
            rideId: rideId,
            driverId: driverId,
            latitude: latitude,
            longitude: longitude,
            timestamp: new Date().toISOString()
          });
          
          console.log(`📍 Sent driver ${driverId} location to user ${ride.user}`);
        }
      } catch (error) {
        console.error("❌ Error processing driver live location:", error);
      }
    });

    socket.onAny((eventName, data) => {
      if (eventName.includes('ride') || eventName.includes('accept') || eventName.includes('driver')) {
        console.log(`🔍 [SOCKET EVENT] ${eventName}:`, JSON.stringify(data, null, 2));
      }
    });

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
        
        const ride = await Ride.findOne({ RAID_ID: rideId }).populate('user', 'phoneNumber mobile');
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
        
        const userMobile = ride.userMobile || 
                          ride.userPhone || 
                          (ride.user && ride.user.phoneNumber) || 
                          (ride.user && ride.user.mobile) || 
                          "Contact Admin";
        
        const userData = {
          success: true,
          rideId: ride.RAID_ID,
          userId: ride.user?._id || ride.user,
          userName: ride.name || "Customer",
          userMobile: userMobile,
          userPhone: userMobile,
          userPhoto: ride.user?.profilePhoto || null,
          pickup: ride.pickup,
          drop: ride.drop,
          userCurrentLocation: userCurrentLocation,
          otp: ride.otp,
          fare: ride.fare,
          distance: ride.distance
        };
        
        console.log(`📤 Sending user data to driver for ride ${rideId}`);
        console.log(`📱 User Mobile: ${userMobile}`);
        
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
          
          // Notify user that ride was rejected
          const ride = rides[rideId];
          if (ride && ride.userId) {
            io.to(ride.userId.toString()).emit("rideRejected", {
              rideId: rideId,
              message: "This ride has been rejected by the driver.",
              alertTitle: "❌ Ride Rejected",
              alertMessage: "The driver has rejected your ride request. A new driver will be assigned.",
              showAlert: true,
              priority: "high"
            });
          }
          
          logRideStatus();
        }
      } catch (error) {
        console.error("❌ Error rejecting ride:", error);
      }
    });
    
    socket.on("driverHeartbeat", ({ driverId, latitude, longitude }) => {
      if (activeDriverSockets.has(driverId)) {
        const driverData = activeDriverSockets.get(driverId);
        driverData.lastUpdate = Date.now();
        driverData.isOnline = true;
        
        if (latitude && longitude) {
          driverData.location = { latitude, longitude };
        }
        
        activeDriverSockets.set(driverId, driverData);
        console.log(`❤️ Heartbeat received from driver: ${driverId}`);
      }
    });
    
    socket.on("disconnect", (reason) => {
      console.log(`\n❌ Client disconnected: ${socket.id}, Reason: ${reason}`);
      console.log(`📱 Remaining connected clients: ${io.engine.clientsCount}`);
      
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

    socket.on("rideAcceptedByAnotherDriver", (data) => {
      try {
        const { rideId, driverId, driverName } = data;
        
        console.log(`🚫 BROADCAST: Ride ${rideId} taken by ${driverName}`);
        
        socket.broadcast.emit("rideAlreadyTaken", {
          rideId: rideId,
          takenBy: driverName,
          timestamp: new Date().toISOString(),
          message: "This ride has been accepted by another driver."
        });
        
      } catch (error) {
        console.error("❌ Error broadcasting ride taken:", error);
      }
    });
    
    socket.on("rideAlreadyAccepted", (data) => {
      io.emit("rideTakenByOther", {
        rideId: data.rideId,
        message: "Ride accepted by another driver",
        timestamp: new Date().toISOString()
      });
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

module.exports = { init, getIO, broadcastPricesToAllUsers };