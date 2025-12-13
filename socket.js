const { Server } = require("socket.io");
const DriverLocation = require("./models/DriverLocation");
const Driver = require("./models/driver/driver");
const Ride = require("./models/ride");
const RaidId = require("./models/user/raidId");
const UserLocation = require("./models/user/UserLocation");
const RidePrice = require("./models/RidePrice");
const { sendNotificationToMultipleDrivers } = require("./services/firebaseService");

let io;
let isInitialized = false;
const rides = {};
const activeDriverSockets = new Map();
const processingRides = new Set();
const userLocationTracking = new Map();

let currentRidePrices = {
  bike: 10,
  taxi: 30,
  port: 60,
  sedan: 40,
  mini: 35,
  suv: 50,
  auto: 25
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
      console.log(`  🚗 ${driver.driverName} (${driverId})`);
      console.log(`     Status: ${driver.status}`);
      console.log(`     Vehicle: ${driver.vehicleType}`);
      console.log(`     Location: ${driver.location.latitude.toFixed(6)}, ${driver.location.longitude.toFixed(6)}`);
      console.log(`     Last update: ${timeSinceUpdate}s ago`);
      console.log(`     Socket: ${driver.socketId}`);
      console.log(`     Online: ${driver.isOnline ? 'Yes' : 'No'}`);
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
      console.log(`  📍 Ride ${rideId}:`);
      console.log(`     Status: ${ride.status}`);
      console.log(`     Driver: ${ride.driverId || 'Not assigned'}`);
      console.log(`     User ID: ${ride.userId}`);
      console.log(`     Customer ID: ${ride.customerId}`);
      console.log(`     User Name: ${ride.userName}`);
      console.log(`     User Mobile: ${ride.userMobile}`);
      console.log(`     Pickup: ${ride.pickup?.address || ride.pickup?.lat + ',' + ride.pickup?.lng}`);
      console.log(`     Drop: ${ride.drop?.address || ride.drop?.lat + ',' + ride.drop?.lng}`);
      
      if (userLocationTracking.has(ride.userId)) {
        const userLoc = userLocationTracking.get(ride.userId);
        console.log(`     📍 USER CURRENT/LIVE LOCATION: ${userLoc.latitude}, ${userLoc.longitude}`);
        console.log(`     📍 Last location update: ${new Date(userLoc.lastUpdate).toLocaleTimeString()}`);
      } else {
        console.log(`     📍 USER CURRENT/LIVE LOCATION: Not available`);
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
  console.log(`🗺️  Current Location: ${location.latitude}, ${location.longitude}`);
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

// Helper function to calculate ride price
async function calculateRidePrice(vehicleType, distance) {
  try {
    console.log(`💰 CALCULATING PRICE: ${distance}km for ${vehicleType}`);
    
    const priceDoc = await RidePrice.findOne({ 
      vehicleType, 
      isActive: true 
    });
    
    let pricePerKm;
    
    if (!priceDoc) {
      console.warn(`⚠️ No price found for vehicle type: ${vehicleType}, using default`);
      pricePerKm = currentRidePrices[vehicleType] || 30;
    } else {
      pricePerKm = priceDoc.pricePerKm;
      console.log(`✅ Found price in DB: ₹${pricePerKm}/km for ${vehicleType}`);
    }
    
    const totalPrice = distance * pricePerKm;
    
    console.log(`💰 PRICE CALCULATION: ${distance}km ${vehicleType} × ₹${pricePerKm}/km = ₹${totalPrice}`);
    
    return Math.round(totalPrice * 100) / 100; // Round to 2 decimal places
  } catch (err) {
    console.error('❌ Error calculating price:', err);
    return distance * (currentRidePrices[vehicleType] || 30);
  }
}

// Function to fetch current prices from MongoDB
async function fetchCurrentPricesFromDB() {
  try {
    const prices = await RidePrice.find({ isActive: true });
    
    const priceMap = {};
    prices.forEach(price => {
      priceMap[price.vehicleType] = price.pricePerKm;
    });
    
    currentRidePrices = {
      bike: priceMap.bike || 10,
      taxi: priceMap.taxi || 30,
      port: priceMap.port || 60,
      sedan: priceMap.sedan || 40,
      mini: priceMap.mini || 35,
      suv: priceMap.suv || 50,
      auto: priceMap.auto || 25
    };
    
    console.log('📊 Current prices from DB:', currentRidePrices);
    return currentRidePrices;
  } catch (error) {
    console.error('❌ Error fetching prices from DB:', error);
    return currentRidePrices;
  }
}

// Function to send ride request to all drivers
const sendRideRequestToAllDrivers = async (rideData, savedRide) => {
  try {
    console.log('📢 Sending ride request to drivers...');
    console.log(`🚗 REQUIRED Vehicle type: ${rideData.vehicleType}`);
    console.log(`📍 Pickup: ${rideData.pickup?.address || 'No address'}`);
    console.log(`🎯 Drop: ${rideData.drop?.address || 'No address'}`);

    // Get drivers with EXACT vehicle type match
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

// Update the price update handler
const handlePriceUpdate = async (data) => {
  try {
    for (const [vehicleType, price] of Object.entries(data)) {
      await RidePrice.findOneAndUpdate(
        { vehicleType },
        { pricePerKm: price, isActive: true },
        { upsert: true, new: true }
      );
    }
    
    currentRidePrices = data;
    
    io.emit('priceUpdate', currentRidePrices);
    io.emit('currentPrices', currentRidePrices);
    
    console.log('📡 Price update broadcasted to all users:', currentRidePrices);
  } catch (error) {
    console.error('❌ Error updating prices:', error);
  }
};

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

// Function to broadcast prices to all users
const broadcastPricesToAllUsers = () => {
  try {
    console.log('💰 BROADCASTING PRICES TO ALL USERS:', currentRidePrices);
   
    if (io) {
      io.emit('priceUpdate', currentRidePrices);
      io.emit('currentPrices', currentRidePrices);
      console.log('✅ Prices broadcasted to all connected users');
    }
  } catch (error) {
    console.error('❌ Error broadcasting prices:', error);
  }
};

const init = (server) => {
  if (isInitialized) {
    console.log("⚠️ Socket.IO already initialized, skipping...");
    return;
  }

  io = new Server(server, {
    cors: { 
      origin: "*", 
      methods: ["GET", "POST"] 
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  isInitialized = true;
  
  // Test the RaidId model on startup
  testRaidIdModel();
  
  // Fetch initial prices on server start
  fetchCurrentPricesFromDB();
  
  // Broadcast initial prices
  setTimeout(() => {
    console.log('🚀 Server started, broadcasting initial prices...');
    broadcastPricesToAllUsers();
  }, 3000);
  
  // Log server status every 10 seconds
  setInterval(() => {
    console.log(`\n⏰ ${new Date().toLocaleString()} - Server Status Check`);
    logDriverStatus();
    logRideStatus();
  }, 10000);
  
  io.on("connection", (socket) => {
    console.log(`\n⚡ New client connected: ${socket.id}`);
    console.log(`📱 Total connected clients: ${io.engine.clientsCount}`);
    
    socket.connectedAt = Date.now();

    // Send current prices on connection
    socket.emit('currentPrices', currentRidePrices);
    
    // Event listener for price requests
    socket.on('getCurrentPrices', async (callback) => {
      try {
        console.log('📡 User requested current prices');
        const prices = await fetchCurrentPricesFromDB();
        
        if (typeof callback === 'function') {
          callback(prices);
        }
        socket.emit('currentPrices', prices);
      } catch (error) {
        console.error('❌ Error fetching current prices:', error);
        if (typeof callback === 'function') {
          callback(currentRidePrices);
        }
        socket.emit('currentPrices', currentRidePrices);
      }
    });

    // Handle price updates
    socket.on('updatePrices', async (data) => {
      await handlePriceUpdate(data);
    });

    // DRIVER LOCATION UPDATE
    socket.on("driverLocationUpdate", async (data) => {
      try {
        const { driverId, rideId, latitude, longitude } = data;
        
        console.log(`📍 REAL-TIME: Driver ${driverId} location update received for ride ${rideId}`);
        console.log(`🗺️  Coordinates: ${latitude}, ${longitude}`);
        
        // Update driver location in database
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
        
        // Send location to user
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride && ride.user) {
          io.to(ride.user.toString()).emit("driverLiveLocation", {
            rideId: rideId,
            driverId: driverId,
            latitude: latitude,
            longitude: longitude,
            timestamp: new Date().toISOString()
          });
          
          console.log(`📍 Sent driver ${driverId} location to user ${ride.user}`);
        }
        
      } catch (error) {
        console.error("❌ Error processing driver location update:", error);
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
          
          console.log(`\n📍 DRIVER LOCATION UPDATE: ${driverName} (${driverId})`);
          console.log(`🗺️  New location: ${lat}, ${lng}`);
          
          await saveDriverLocationToDB(driverId, driverName, lat, lng, driverData.vehicleType);
          
          io.emit("driverLiveLocationUpdate", {
            driverId: driverId,
            lat: lat,
            lng: lng,
            status: driverData.status,
            vehicleType: driverData.vehicleType,
            timestamp: Date.now()
          });
          
          console.log(`📡 Real-time update broadcasted for driver ${driverId}`);
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
      
      console.log(`👤 USER REGISTERED SUCCESSFULLY:`);
      console.log(`   User ID: ${userId}`);
      console.log(`   Mobile: ${userMobile || 'Not provided'}`);
      console.log(`   Socket ID: ${socket.id}`);
      console.log(`   Room: ${userId.toString()}`);
    });
    
    // DRIVER REGISTRATION
    socket.on("registerDriver", async ({ driverId, driverName, latitude, longitude, vehicleType = "taxi" }) => {
      try {
        console.log(`\n📝 DRIVER REGISTRATION ATTEMPT RECEIVED:`);
        console.log(`   Driver ID: ${driverId}`);
        console.log(`   Driver Name: ${driverName}`);
        console.log(`   Location: ${latitude}, ${longitude}`);
        console.log(`   Vehicle: ${vehicleType}`);
        console.log(`   Socket ID: ${socket.id}`);
        
        if (!driverId) {
          console.log("❌ Registration failed: No driverId provided");
          return;
        }
        
        if (!latitude || !longitude) {
          console.log("❌ Registration failed: Invalid location");
          return;
        }

        if (socket.driverId === driverId) {
          console.log(`⚠️ Driver ${driverId} already registered on this socket, skipping...`);
          return;
        }

        socket.driverId = driverId;
        socket.driverName = driverName;
        
        if (activeDriverSockets.has(driverId)) {
          const existingDriver = activeDriverSockets.get(driverId);
          console.log(`⚠️ Driver ${driverId} already active, updating socket...`);
          
          existingDriver.socketId = socket.id;
          existingDriver.lastUpdate = Date.now();
          existingDriver.isOnline = true;
          activeDriverSockets.set(driverId, existingDriver);
        } else {
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
        }
        
        socket.join("allDrivers");
        socket.join(`driver_${driverId}`);
        
        console.log(`✅ DRIVER REGISTERED/UPDATED SUCCESSFULLY: ${driverName} (${driverId})`);
        console.log(`📍 Location: ${latitude}, ${longitude}`);
        console.log(`🚗 Vehicle: ${vehicleType}`);
        console.log(`🔌 Socket ID: ${socket.id}`);
        
        await saveDriverLocationToDB(driverId, driverName, latitude, longitude, vehicleType);
        
        broadcastDriverLocationsToAllUsers();
        
        socket.emit("driverRegistrationConfirmed", {
          success: true,
          message: "Driver registered successfully"
        });
        
        logDriverStatus();
        
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
        console.log(`📍 User location: ${latitude}, ${longitude}`);
        console.log(`📏 Search radius: ${radius}m`);

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

        console.log(`📊 Active drivers in memory: ${activeDriverSockets.size}`);
        console.log(`📊 Online drivers: ${drivers.length}`);
        
        drivers.forEach((driver, index) => {
          console.log(`🚗 Driver ${index + 1}: ${driver.name} (${driver.driverId})`);
          console.log(`   Location: ${driver.location.coordinates[1]}, ${driver.location.coordinates[0]}`);
          console.log(`   Status: ${driver.status}`);
        });

        console.log(`📤 Sending ${drivers.length} online drivers to user`);

        socket.emit("nearbyDriversResponse", { drivers });
      } catch (error) {
        console.error("❌ Error fetching nearby drivers:", error);
        socket.emit("nearbyDriversResponse", { drivers: [] });
      }
    });

    // BOOK RIDE
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

        const distanceInKm = parseFloat(distance) || 0;
        const calculatedPrice = await calculateRidePrice(vehicleType, distanceInKm);

        rideId = await generateSequentialRaidId();

        let otp;
        if (customerId && customerId.length >= 4) {
          otp = customerId.slice(-4);
        } else {
          otp = Math.floor(1000 + Math.random() * 9000).toString();
        }

        console.log('💰 PRICE CALCULATION:');
        console.log(' 📊 Distance (km):', distanceInKm);
        console.log(' 🚗 Vehicle Type:', vehicleType);
        console.log(' 💵 Calculated Fare:', calculatedPrice);
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

        const rideData = {
          user: userId,
          customerId: customerId,
          name: userName,
          userMobile: userMobile || "N/A",
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
          fare: calculatedPrice,
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
          price: calculatedPrice,
          distanceKm: distanceInKm
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
          fare: calculatedPrice,
          userMobile: userMobile || "N/A"
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
          fare: calculatedPrice,
          distance: distance,
          vehicleType: vehicleType,
          userName: userName,
          userMobile: userMobile || "N/A",
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
          fare: calculatedPrice,
          distance: distance,
          vehicleType: vehicleType,
          userName: userName,
          userMobile: userMobile || "N/A",
          otp: otp,
          timestamp: new Date().toISOString()
        });

        console.log('\n✅ ===== RIDE BOOKING COMPLETED SUCCESSFULLY =====');
        console.log(`🆔 RAID_ID: ${rideId}`);
        console.log(`👤 Customer: ${userName}`);
        console.log(`📞 Mobile: ${userMobile || 'N/A'}`);
        console.log(`📍 From: ${pickup.address}`);
        console.log(`🎯 To: ${drop.address}`);
        console.log(`💰 Fare: ₹${calculatedPrice}`);
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
            userMobile: userMobile || "N/A"
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

    // ACCEPT RIDE
    socket.on("acceptRide", async (data, callback) => {
      const { rideId, driverId, driverName } = data;

      console.log("🚨 ===== BACKEND ACCEPT RIDE START =====");
      console.log("📥 Acceptance Data:", { rideId, driverId, driverName });
      console.log("🚨 ===== BACKEND ACCEPT RIDE END =====");

      try {
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
        console.log(`📱 Fetched user mobile from DB: ${ride.userMobile || 'N/A'}`);

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

        console.log(`🔄 Updating ride status to 'accepted'`);
        ride.status = "accepted";
        ride.driverId = driverId;
        ride.driverName = driverName;

        const driver = await Driver.findOne({ driverId });
        console.log(`👨‍💼 Driver details:`, driver ? "Found" : "Not found");
        
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
        } else {
          console.log(`🔢 Using existing OTP: ${ride.otp}`);
        }

        await ride.save();
        console.log(`💾 Ride saved successfully`);

        if (rides[rideId]) {
          rides[rideId].status = "accepted";
          rides[rideId].driverId = driverId;
          rides[rideId].driverName = driverName;
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
          timestamp: new Date().toISOString()
        };

        console.log("📤 Prepared driver data:", JSON.stringify(driverData, null, 2));

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
          console.log(`✅ Notification sent to user socket ${index + 1}: ${userSocket.id}`);
        });

        io.emit("rideAcceptedGlobal", {
          ...driverData,
          targetUserId: userRoom,
          timestamp: new Date().toISOString()
        });
        console.log("✅ Global notification sent with user filter");

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

        console.log("📤 Prepared user data for driver:", JSON.stringify(userDataForDriver, null, 2));

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

    // OTP VERIFIED
    socket.on("otpVerified", async (data) => {
      try {
        const { rideId, driverId, userId } = data;
        console.log(`✅ OTP Verified for ride ${rideId} by driver ${driverId}`);
        
        const ride = await Ride.findOne({ RAID_ID: rideId });
        if (ride) {
          ride.status = 'started';
          ride.rideStartTime = new Date();
          ride.otpVerifiedAt = new Date();
          await ride.save();
          
          console.log(`✅ Ride ${rideId} status updated to 'started'`);
          
          const userRoom = ride.user?.toString() || userId?.toString();
          if (userRoom) {
            // Send OTP verified alert to user
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
            
            // Send ride status update
            io.to(userRoom).emit("rideStatusUpdate", {
              rideId: rideId,
              status: "started",
              message: "Driver has started the ride",
              otpVerified: true,
              timestamp: new Date().toISOString()
            });
            
            // Send OTP verified confirmation
            io.to(userRoom).emit("otpVerified", {
              rideId: rideId,
              driverId: driverId,
              userId: userId,
              timestamp: new Date().toISOString(),
              otpVerified: true
            });
            
            console.log(`✅ All OTP verification events sent to user room: ${userRoom}`);
          }
        }
      } catch (error) {
        console.error("❌ Error handling OTP verification:", error);
      }
    });

    // DRIVER STARTED RIDE
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
        
        // Send all necessary events to user
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
        
        // Confirm to driver
        socket.emit("rideStarted", {
          rideId: rideId,
          message: "Ride started successfully"
        });
        
      } catch (error) {
        console.error("❌ Error processing driver started ride:", error);
      }
    });

    // RIDE STATUS UPDATE
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

    // RIDE COMPLETED
    socket.on("completeRide", async (data) => {
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
        
        // Update driver status
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
          
          // Send ride completed notification
          io.to(userRoom).emit("rideCompleted", {
            rideId: rideId,
            distance: distance,
            charge: fare,
            driverName: ride?.driverName || "Driver",
            vehicleType: ride?.rideType || "bike",
            timestamp: new Date().toISOString()
          });
          
          console.log(`✅ Bill and completion alerts sent to user ${userRoom}`);
        }
        
        // Confirm to driver
        socket.emit("rideCompletedSuccess", {
          rideId: rideId,
          message: "Ride completed successfully",
          timestamp: new Date().toISOString()
        });
        
        // Update driver status in memory
        if (activeDriverSockets.has(driverId)) {
          const driverData = activeDriverSockets.get(driverId);
          driverData.status = "Live";
          driverData.isOnline = true;
          activeDriverSockets.set(driverId, driverData);
          
          console.log(`🔄 Updated driver ${driverId} status to 'Live'`);
        }
        
        // Clean up ride from memory after delay
        setTimeout(() => {
          delete rides[rideId];
          console.log(`🗑️ Removed completed ride from memory: ${rideId}`);
        }, 5000);
        
      } catch (error) {
        console.error("❌ Error processing ride completion:", error);
      }
    });

    // USER LOCATION UPDATE
    socket.on("userLocationUpdate", async (data) => {
      try {
        const { userId, rideId, latitude, longitude } = data;
        
        console.log(`📍 USER LOCATION UPDATE: User ${userId} for ride ${rideId}`);
        console.log(`🗺️  User coordinates: ${latitude}, ${longitude}`);
        
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
        
        console.log(`📡 Sending user location to driver ${driverId} in room ${driverRoom}:`, locationData);
        
        io.to(driverRoom).emit("userLiveLocationUpdate", locationData);
        io.emit("userLiveLocationUpdate", locationData);
        
        console.log(`📡 Sent user location to driver ${driverId} and all drivers`);
        
      } catch (error) {
        console.error("❌ Error processing user location update:", error);
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
        if (userCurrentLocation) {
          console.log(`📍 User's current location: ${userCurrentLocation.latitude}, ${userCurrentLocation.longitude}`);
        } else {
          console.log(`📍 User's current location: Not available`);
        }
        
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

    // REJECT RIDE
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

    // DRIVER HEARTBEAT
    socket.on("driverHeartbeat", ({ driverId }) => {
      if (activeDriverSockets.has(driverId)) {
        const driverData = activeDriverSockets.get(driverId);
        driverData.lastUpdate = Date.now();
        driverData.isOnline = true;
        activeDriverSockets.set(driverId, driverData);
        
        console.log(`❤️  Heartbeat received from driver: ${driverId}`);
      }
    });
    
    // RIDE TAKEN BY OTHER DRIVER
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
    
    // ADMIN ORDER UPDATE
    socket.on("adminOrderUpdate", (data) => {
      console.log('🔄 Admin order update:', data);
      
      if (data.userId) {
        io.to(data.userId).emit('orderStatusUpdate', {
          orderId: data.orderId,
          status: data.status,
          message: `Your order status has been updated to ${data.status}`
        });
      }
      
      socket.broadcast.emit('orderUpdated', data);
    });
    
    // UPDATE FCM TOKEN
    socket.on("updateFCMToken", async (data, callback) => {
      try {
        const { driverId, fcmToken, platform } = data;
        
        if (!driverId || !fcmToken) {
          if (callback) callback({ success: false, message: 'Missing driverId or fcmToken' });
          return;
        }

        const result = await Driver.findOneAndUpdate(
          { driverId: driverId },
          { 
            fcmToken: fcmToken,
            fcmTokenUpdatedAt: new Date(),
            platform: platform || 'android'
          },
          { new: true, upsert: false }
        );

        const updated = !!result;
        
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
    
    // REQUEST RIDE OTP
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
    
    // FCM RETRY NOTIFICATION
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
    
    // DISCONNECT
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
  });
  
  // Clean up offline drivers every 60 seconds
  setInterval(() => {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    let cleanedCount = 0;
    
    Array.from(activeDriverSockets.entries()).forEach(([driverId, driver]) => {
      if (!driver.isOnline && driver.lastUpdate < fiveMinutesAgo) {
        activeDriverSockets.delete(driverId);
        cleanedCount++;
        console.log(`🧹 Removed offline driver: ${driverId}`);
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
};

const getIO = () => {
  if (!io) throw new Error("❌ Socket.io not initialized!");
  return io;
};

module.exports = { init, getIO, broadcastPricesToAllUsers };