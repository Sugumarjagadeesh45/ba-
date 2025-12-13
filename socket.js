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






// const sendRideRequestToAllDrivers = async (rideData, savedRide) => {
//   try {
//     console.log('📢 Sending ride request to drivers...');
//     console.log(`🚗 REQUIRED Vehicle type: ${rideData.vehicleType}`);
//     console.log(`📍 Pickup: ${rideData.pickup?.address || 'No address'}`);
//     console.log(`🎯 Drop: ${rideData.drop?.address || 'No address'}`);

//     // ✅ FIX: Get drivers with EXACT vehicle type match
//     const Driver = require('./models/driver/driver');
//     const allDrivers = await Driver.find({
//       status: "Live",
//       vehicleType: rideData.vehicleType, // ✅ EXACT MATCH
//       fcmToken: { $exists: true, $ne: null, $ne: '' }
//     });

//     console.log(`📊 ${rideData.vehicleType} drivers available: ${allDrivers.length}`);

//     // Also check activeDriverSockets for real-time filtering
//     const onlineDriversWithType = Array.from(activeDriverSockets.entries())
//       .filter(([id, driver]) =>
//         driver.isOnline &&
//         driver.vehicleType === rideData.vehicleType
//       )
//       .map(([id, driver]) => driver);

//     console.log(`📱 Online ${rideData.vehicleType} drivers: ${onlineDriversWithType.length}`);

//     if (allDrivers.length === 0 && onlineDriversWithType.length === 0) {
//       console.log(`⚠️ No ${rideData.vehicleType} drivers available`);
//       return {
//         success: false,
//         message: `No ${rideData.vehicleType} drivers available`,
//         sentCount: 0,
//         totalDrivers: 0,
//         fcmSent: false,
//         vehicleType: rideData.vehicleType
//       };
//     }

//     // Send socket notification to filtered drivers only
//     io.emit("newRideRequest", {
//       ...rideData,
//       rideId: rideData.rideId,
//       _id: savedRide?._id?.toString() || null,
//       vehicleType: rideData.vehicleType,
//       timestamp: new Date().toISOString()
//     });

//     // FCM notification to drivers with tokens
//     const driversWithFCM = allDrivers.filter(driver => driver.fcmToken);

//     if (driversWithFCM.length > 0) {
//       console.log(`🎯 Sending FCM to ${driversWithFCM.length} ${rideData.vehicleType} drivers`);

//       const notificationData = {
//         type: "ride_request",
//         rideId: rideData.rideId,
//         pickup: JSON.stringify(rideData.pickup || {}),
//         drop: JSON.stringify(rideData.drop || {}),
//         fare: rideData.fare?.toString() || "0",
//         distance: rideData.distance?.toString() || "0",
//         vehicleType: rideData.vehicleType, // ✅ INCLUDE VEHICLE TYPE
//         userName: rideData.userName || "Customer",
//         userMobile: rideData.userMobile || "N/A",
//         otp: rideData.otp || "0000",
//         timestamp: new Date().toISOString(),
//         priority: "high",
//         click_action: "FLUTTER_NOTIFICATION_CLICK",
//         sound: "default"
//       };

//       const fcmResult = await sendNotificationToMultipleDrivers(
//         driversWithFCM.map(d => d.fcmToken),
//         `🚖 New ${rideData.vehicleType.toUpperCase()} Ride Request!`,
//         `Pickup: ${rideData.pickup?.address?.substring(0, 40) || 'Location'}... | Fare: ₹${rideData.fare}`,
//         notificationData
//       );

//       return {
//         success: fcmResult.successCount > 0,
//         driversNotified: fcmResult.successCount,
//         totalDrivers: driversWithFCM.length,
//         fcmSent: fcmResult.successCount > 0,
//         vehicleType: rideData.vehicleType,
//         fcmMessage: fcmResult.successCount > 0 ?
//           `FCM sent to ${fcmResult.successCount} ${rideData.vehicleType} drivers` :
//           `FCM failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
//       };
//     }
    
//     return {
//       success: false,
//       driversNotified: 0,
//       totalDrivers: 0,
//       fcmSent: false,
//       vehicleType: rideData.vehicleType,
//       fcmMessage: `No drivers with valid FCM tokens for ${rideData.vehicleType}`
//     };
    
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

//     // FIXED: Moved retryFCMNotification inside connection block
//     socket.on("retryFCMNotification", async (data, callback) => {
//       try {
//         const { rideId, retryCount } = data;
        
//         console.log(`🔄 FCM retry attempt #${retryCount} for ride: ${rideId}`);
        
//         // Get ride details
//         const ride = await Ride.findOne({ RAID_ID: rideId });
//         if (!ride) {
//           if (callback) callback({ 
//             success: false, 
//             message: 'Ride not found' 
//           });
//           return;
//         }
        
//         // Get drivers with FCM tokens
//         const driversWithFCM = await Driver.find({ 
//           status: "Live",
//           fcmToken: { $exists: true, $ne: null, $ne: '' }
//         });
        
//         if (driversWithFCM.length === 0) {
//           if (callback) callback({ 
//             success: false, 
//             message: 'No drivers with FCM tokens available' 
//           });
//           return;
//         }
        
//         const driverTokens = driversWithFCM.map(driver => driver.fcmToken);
        
//         // Prepare notification data
//         const notificationData = {
//           type: "ride_request",
//           rideId: rideId,
//           pickup: JSON.stringify(ride.pickup),
//           drop: JSON.stringify(ride.drop),
//           fare: ride.fare.toString(),
//           distance: ride.distance,
//           vehicleType: ride.rideType,
//           userName: ride.name,
//           userMobile: ride.userMobile,
//           timestamp: new Date().toISOString(),
//           priority: "high",
//           click_action: "FLUTTER_NOTIFICATION_CLICK",
//           isRetry: true,
//           retryCount: retryCount,
//           sound: "default",
//           android: {
//             channelId: "high_priority_channel",
//             priority: "high",
//             visibility: "public",
//             sound: "default",
//             vibrate: true,
//             lights: true
//           },
//           ios: {
//             sound: "default",
//             badge: 1,
//             critical: true
//           }
//         };
        
//         // Send notifications
//         const fcmResult = await sendNotificationToMultipleDrivers(
//           driverTokens,
//           "🚖 Ride Request (Retry)",
//           `Retry #${retryCount}: ${ride.pickup?.address?.substring(0, 30)}... | Fare: ₹${ride.fare}`,
//           notificationData
//         );
        
//         if (callback) callback({
//           success: fcmResult.successCount > 0,
//           driversNotified: fcmResult.successCount,
//           message: fcmResult.successCount > 0 ? 
//             `Retry successful: ${fcmResult.successCount} drivers notified` : 
//             `Retry failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
//         });
        
//       } catch (error) {
//         console.error('❌ Error in FCM retry:', error);
//         if (callback) callback({ 
//           success: false, 
//           message: error.message 
//         });
//       }
//     });


    

//     // In socket.js - Add this handler
// socket.on("driverLocationUpdate", async (data) => {
//   try {
//     const { driverId, rideId, latitude, longitude } = data;
    
//     console.log(`📍 Driver ${driverId} location update for ride ${rideId}`);
    
//     // Update driver location in database
//     await Driver.findOneAndUpdate(
//       { driverId },
//       {
//         location: {
//           type: "Point",
//           coordinates: [longitude, latitude]
//         },
//         lastUpdate: new Date()
//       }
//     );
    
//     // Find the ride to get user ID
//     const ride = await Ride.findOne({ RAID_ID: rideId });
//     if (ride && ride.user) {
//       // Send driver location to user
//       io.to(ride.user.toString()).emit("driverLiveLocation", {
//         rideId: rideId,
//         driverId: driverId,
//         latitude: latitude,
//         longitude: longitude,
//         timestamp: new Date().toISOString()
//       });
//     }
//   } catch (error) {
//     console.error("❌ Error processing driver location:", error);
//   }
// });



   
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
   

    

//     socket.on("registerDriver", async ({ driverId, driverName, latitude, longitude }) => {
//   try {
//     console.log(`\n📝 DRIVER REGISTRATION: ${driverName} (${driverId})`);
    
//     // ✅ ALWAYS fetch from database
//     const Driver = require('./models/driver/driver');
//     const driver = await Driver.findOne({ driverId });
    
//     if (!driver) {
//       console.error(`❌ Driver ${driverId} not found in database`);
//       return;
//     }
    
//     if (!driver.vehicleType) {
//       console.error(`❌ Driver ${driverId} has no vehicleType in database`);
//       return;
//     }
    
//     const validTypes = ["port", "taxi", "bike", "sedan", "mini", "suv", "auto"];
//     const validatedVehicleType = validTypes.includes(driver.vehicleType) 
//       ? driver.vehicleType 
//       : "taxi";
    
//     // Store with correct vehicle type
//     activeDriverSockets.set(driverId, {
//       socketId: socket.id,
//       driverId,
//       driverName,
//       location: { latitude, longitude },
//       vehicleType: validatedVehicleType, // ✅ From database
//       lastUpdate: Date.now(),
//       status: "Live",
//       isOnline: true
//     });
    
//     console.log(`✅ DRIVER REGISTERED: ${driverName} - Vehicle: ${validatedVehicleType}`);
    
//   } catch (error) {
//     console.error("❌ Error registering driver:", error);
//   }
// });





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

  

//     // In socket.js - Find the bookRide handler and FIX THIS LINE:

// socket.on("bookRide", async (data, callback) => {
//   let rideId;
//   try {
//     console.log('\n🚨 ===== 🚖 NEW RIDE BOOKING REQUEST ===== 🚖');
//     console.log('📦 USER APP DATA RECEIVED:');
//     console.log(' 👤 User ID:', data.userId);
//     console.log(' 📞 Customer ID:', data.customerId);
//     console.log(' 🚗 Vehicle Type:', data.vehicleType);
//     console.log(' 📍 Pickup:', data.pickup?.address);
//     console.log(' 🎯 Drop:', data.drop?.address);
//     console.log(' 💰 Estimated Fare:', data.estimatedPrice);
//     console.log(' 📏 Distance:', data.distance);
//     console.log(' ⏱️ Travel Time:', data.travelTime);
//     console.log(' 🔑 FCM Required:', data._fcmRequired);

//     const { userId, customerId, userName, userMobile, pickup, drop, vehicleType, estimatedPrice, distance, travelTime, wantReturn } = data;

//     // ✅ FIX: Check if pickup and drop exist
//     if (!pickup || !drop) {
//       console.log("❌ Missing pickup or drop location");
//       if (callback) {
//         callback({
//           success: false,
//           message: "Pickup and drop locations are required"
//         });
//       }
//       return;
//     }

//     // Calculate price on backend using admin prices
//     const distanceKm = parseFloat(distance);
//     const backendCalculatedPrice = await ridePriceController.calculateRidePrice(vehicleType, distanceKm);

//     // Generate sequential RAID_ID on backend
//     rideId = await generateSequentialRaidId();

//     let otp;
//     if (customerId && customerId.length >= 4) {
//       otp = customerId.slice(-4);
//     } else {
//       otp = Math.floor(1000 + Math.random() * 9000).toString();
//     }

//     console.log('💰 PRICE CALCULATION:');
//     console.log(' 📊 Distance (km):', distanceKm);
//     console.log(' 🚗 Vehicle Type:', vehicleType);
//     console.log(' 💵 Calculated Fare:', backendCalculatedPrice);
//     console.log(' 🔢 Generated OTP:', otp);
//     console.log(' 🆔 Generated RAID_ID:', rideId);

//     // Check if this ride is already being processed
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

//     // Add to processing set
//     processingRides.add(rideId);

//     // Validate required fields
//     if (!userId || !customerId || !userName || !pickup || !drop) {
//       console.log("❌ MISSING REQUIRED FIELDS");
//       processingRides.delete(rideId);
//       if (callback) {
//         callback({
//           success: false,
//           message: "Missing required fields"
//         });
//       }
//       return;
//     }

//     // Check if ride with this ID already exists in database
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

//     // ✅ FIX: Extract coordinates safely
//     const pickupLat = pickup?.lat || pickup?.latitude || 0;
//     const pickupLng = pickup?.lng || pickup?.longitude || 0;
//     const dropLat = drop?.lat || drop?.latitude || 0;
//     const dropLng = drop?.lng || drop?.longitude || 0;

//     // Create a new ride document in MongoDB
//     const rideData = {
//       user: userId,
//       customerId: customerId,
//       name: userName,
//       userMobile: userMobile ||data.driverMobile || ride.userPhone || ride.userMobile || rideData.userPhone || rideData.userMobile ||"N/A" ,
//       RAID_ID: rideId,
//       pickupLocation: pickup.address || "Selected Location",
//       dropoffLocation: drop.address || "Selected Location",
//       pickupCoordinates: {
//         latitude: pickupLat,
//         longitude: pickupLng
//       },
//       dropoffCoordinates: {
//         latitude: dropLat,
//         longitude: dropLng
//       },
//       fare: backendCalculatedPrice,
//       rideType: vehicleType,
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
//         lat: pickupLat,
//         lng: pickupLng,
//       },
//       drop: {
//         addr: drop.address || "Selected Location",
//         lat: dropLat,
//         lng: dropLng,
//       },
//       price: backendCalculatedPrice,
//       distanceKm: distanceKm || 0
//     };

//     console.log('💾 SAVING RIDE TO DATABASE...');
//     console.log('📝 Ride data to save:', rideData);

//     // Create and save the ride
//     const newRide = new Ride(rideData);
//     const savedRide = await newRide.save();
//     console.log(`✅ RIDE SAVED TO MONGODB: ${savedRide._id}`);

//     // Store ride data in memory for socket operations
//     rides[rideId] = {
//       ...data,
//       rideId: rideId,
//       status: "pending",
//       timestamp: Date.now(),
//       _id: savedRide._id.toString(),
//       userLocation: { latitude: pickupLat, longitude: pickupLng },
//       fare: backendCalculatedPrice
//     };

//     // Initialize user location tracking
//     userLocationTracking.set(userId, {
//       latitude: pickupLat,
//       longitude: pickupLng,
//       lastUpdate: Date.now(),
//       rideId: rideId
//     });

//     // Save initial user location to database
//     await saveUserLocationToDB(userId, pickupLat, pickupLng, rideId);

//     console.log('\n📢 ===== SENDING NOTIFICATIONS TO DRIVERS =====');
//     console.log(`🎯 Target: ALL online drivers with FCM tokens`);

//     // ✅ FIX: Prepare notification data properly
//     const notificationResult = await sendRideRequestToAllDrivers({
//       rideId: rideId,
//       pickup: {
//         lat: pickupLat,
//         lng: pickupLng,
//         address: pickup.address || "Selected Location"
//       },
//       drop: {
//         lat: dropLat,
//         lng: dropLng,
//         address: drop.address || "Selected Location"
//       },
//       fare: backendCalculatedPrice,
//       distance: distance,
//       vehicleType: data.vehicleType,
//       userName: userName,
//       userMobile: userMobile,
//       otp: otp
//     }, savedRide);

//     console.log('📱 FCM NOTIFICATION RESULT:');
//     console.log(' ✅ Success Count:', notificationResult.successCount || 0);
//     console.log(' ❌ Failure Count:', notificationResult.failureCount || 0);
//     console.log(' 📊 Total Drivers:', notificationResult.totalDrivers || 0);
//     console.log(' 🔔 FCM Sent:', notificationResult.fcmSent ? 'YES' : 'NO');
//     console.log(' 💬 Message:', notificationResult.fcmMessage);

//     // Also send socket notification as backup
//     console.log('🔔 SENDING SOCKET NOTIFICATION AS BACKUP...');
//     io.emit("newRideRequest", {
//       rideId: rideId,
//       pickup: {
//         lat: pickupLat,
//         lng: pickupLng,
//         address: pickup.address || "Selected Location"
//       },
//       drop: {
//         lat: dropLat,
//         lng: dropLng,
//         address: drop.address || "Selected Location"
//       },
//       fare: backendCalculatedPrice,
//       distance: distance,
//       vehicleType: vehicleType,
//       userName: userName,
//       userMobile: userMobile,
//       otp: otp,
//       timestamp: new Date().toISOString()
//     });

//     console.log('\n✅ ===== RIDE BOOKING COMPLETED SUCCESSFULLY =====');
//     console.log(`🆔 RAID_ID: ${rideId}`);
//     console.log(`👤 Customer: ${userName}`);
//     console.log(`📞 Mobile: ${userMobile}`);
//     console.log(`📍 From: ${pickup.address}`);
//     console.log(`🎯 To: ${drop.address}`);
//     console.log(`💰 Fare: ₹${backendCalculatedPrice}`);
//     console.log(`📏 Distance: ${distance}`);
//     console.log(`🚗 Vehicle: ${vehicleType}`);
//     console.log(`🔢 OTP: ${otp}`);
//     console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
//     console.log('================================================\n');

//     if (callback) {
//       callback({
//         success: true,
//         rideId: rideId,
//         _id: savedRide._id.toString(),
//         otp: otp,
//         message: "Ride booked successfully!",
//         notificationResult: notificationResult,
//         fcmSent: notificationResult.fcmSent,
//         driversNotified: notificationResult.driversNotified || 0
//       });
//     }

//   } catch (error) {
//     console.error("❌ ERROR IN RIDE BOOKING PROCESS:", error);
//     console.error("❌ Stack Trace:", error.stack);

//     if (callback) {
//       callback({
//         success: false,
//         message: "Failed to process ride booking",
//         error: error.message
//       });
//     }
//   } finally {
//     // Always remove from processing set
//     if (rideId) {
//       processingRides.delete(rideId);
//     }
//   }
// });



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

    


// // Replace the current socket.on("acceptRide") handler with this:

// socket.on("acceptRide", async (data, callback) => {
//   console.log("🚨 ===== BACKEND ACCEPT RIDE START =====");
//   console.log("📥 Acceptance Data:", { rideId: data.rideId, driverId: data.driverId });

//   try {
//     // FIND RIDE IN DATABASE
//     console.log(`🔍 Looking for ride: ${data.rideId}`);
//     const ride = await Ride.findOne({ RAID_ID: data.rideId });

//     if (!ride) {
//       console.error(`❌ Ride ${data.rideId} not found in database`);
//       if (typeof callback === "function") {
//         callback({ success: false, message: "Ride not found" });
//       }
//       return;
//     }

//     console.log(`✅ Found ride: ${ride.RAID_ID}, Status: ${ride.status}`);

//     // Check ride status
//     if (ride.status !== 'pending') {
//       console.log(`❌ Ride ${data.rideId} is already ${ride.status}`);
      
//       if (typeof callback === "function") {
//         callback({ 
//           success: false, 
//           message: `Ride already ${ride.status}`,
//           currentStatus: ride.status
//         });
//       }
//       return;
//     }

//     // ✅ CRITICAL FIX: Get driver's ACTUAL current location from activeDriverSockets
//     let driverCurrentLocation = null;
//     if (activeDriverSockets.has(data.driverId)) {
//       const driverData = activeDriverSockets.get(data.driverId);
//       driverCurrentLocation = {
//         latitude: driverData.location.latitude,
//         longitude: driverData.location.longitude
//       };
//       console.log(`📍 Driver ${data.driverId} ACTUAL location:`, driverCurrentLocation);
//     } else {
//       // Fallback: Get driver from database
//       const driver = await Driver.findOne({ driverId: data.driverId });
//       if (driver && driver.location && driver.location.coordinates) {
//         driverCurrentLocation = {
//           latitude: driver.location.coordinates[1],
//           longitude: driver.location.coordinates[0]
//         };
//         console.log(`📍 Driver ${data.driverId} DB location:`, driverCurrentLocation);
//       }
//     }

//     if (!driverCurrentLocation) {
//       console.error(`❌ Could not get driver ${data.driverId} location`);
//       if (typeof callback === "function") {
//         callback({ success: false, message: "Could not get driver location" });
//       }
//       return;
//     }

//     // ✅ UPDATE RIDE
//     const updatedRide = await Ride.findOneAndUpdate(
//       { RAID_ID: data.rideId, status: 'pending' },
//       {
//         driverId: data.driverId,
//         driverName: data.driverName || "Driver",
//         status: 'accepted',
//         acceptedAt: new Date(),
//         driverLocationAtAcceptance: driverCurrentLocation // Store driver's actual location
//       },
//       { new: true, runValidators: true }
//     );

//     if (!updatedRide) {
//       console.log(`⚠️ Could not update ride ${data.rideId}`);
//       if (typeof callback === "function") {
//         callback({ 
//           success: false, 
//           message: "Ride was just accepted by another driver"
//         });
//       }
//       return;
//     }

//     // ✅ UPDATE DRIVER STATUS
//     await Driver.findOneAndUpdate(
//       { driverId: data.driverId },
//       {
//         status: 'onRide',
//         lastRideId: data.rideId,
//         lastUpdate: new Date()
//       }
//     );

//     console.log(`✅ Ride ${data.rideId} accepted by ${data.driverId}`);

//     // ✅ PREPARE RESPONSE WITH DRIVER'S ACTUAL LOCATION (NOT PICKUP)
//     const rideData = {
//       success: true,
//       rideId: ride.RAID_ID,
//       driverId: data.driverId,
//       driverName: data.driverName || "Driver",
//       driverMobile: data.driverMobile || "N/A",
//       driverCurrentLocation: driverCurrentLocation, // ✅ ACTUAL LOCATION
//       driverLat: driverCurrentLocation.latitude, // ✅ For backward compatibility
//       driverLng: driverCurrentLocation.longitude, // ✅ For backward compatibility
//       locationType: 'driver_current_location', // ✅ Mark as driver's actual location
//       pickup: {
//         addr: ride.pickupLocation || ride.pickup?.addr || "Pickup location",
//         lat: ride.pickupCoordinates?.latitude || ride.pickup?.lat || 0,
//         lng: ride.pickupCoordinates?.longitude || ride.pickup?.lng || 0
//       },
//       drop: {
//         addr: ride.dropoffLocation || ride.drop?.addr || "Drop location",
//         lat: ride.dropoffCoordinates?.latitude || ride.drop?.lat || 0,
//         lng: ride.dropoffCoordinates?.longitude || ride.drop?.lng || 0
//       },
//       fare: ride.fare || ride.price || 0,
//       distance: ride.distance || "0 km",
//       vehicleType: ride.rideType || ride.vehicleType || "taxi",
//       userName: ride.name || "Customer",
//       userMobile: ride.userMobile || "NA", // ✅ Show "NA" during ride
//       otp: ride.otp,
//       status: 'accepted',
//       timestamp: new Date().toISOString()
//     };

//     console.log("📤 Sending ride acceptance response:", {
//       driverLocation: rideData.driverCurrentLocation,
//       locationType: rideData.locationType
//     });

//     // ✅ SEND TO DRIVER
//     if (typeof callback === "function") {
//       callback(rideData);
//     }

//     // ✅ NOTIFY USER WITH CORRECT DRIVER LOCATION
//     const userRoom = ride.user ? ride.user.toString() : ride.userId?.toString();
//     if (userRoom) {
//       console.log(`📡 Notifying user room: ${userRoom}`);
      
//       // Emit to user with driver's ACTUAL location
//       io.to(userRoom).emit("rideAccepted", {
//         ...rideData,
//         message: "Driver accepted your ride!",
//         driverDetails: {
//           name: data.driverName || "Driver",
//           currentLocation: driverCurrentLocation, // ✅ ACTUAL LOCATION
//           vehicleType: ride.rideType || "taxi"
//         }
//       });
//     }

//     // ✅ BROADCAST TO ALL OTHER DRIVERS THAT RIDE IS TAKEN
//     io.emit("rideAlreadyTaken", {
//       rideId: data.rideId,
//       takenBy: data.driverName || "Driver",
//       driverId: data.driverId,
//       timestamp: new Date().toISOString(),
//       message: "This ride has been accepted by another driver."
//     });

//     console.log("✅ Ride acceptance process completed with ACTUAL driver location");

//   } catch (error) {
//     console.error(`❌ ERROR ACCEPTING RIDE ${data.rideId}:`, error);
//     if (typeof callback === "function") {
//       callback({
//         success: false,
//         message: "Server error: " + error.message
//       });
//     }
//   }
// });



// socket.on("driverLiveLocation", async (data) => {
//   try {
//     const { rideId, driverId, latitude, longitude } = data;
    
//     console.log(`📍 Driver ${driverId} live location for ride ${rideId}:`, { latitude, longitude });
    
//     // Update driver location in database
//     await Driver.findOneAndUpdate(
//       { driverId },
//       {
//         location: {
//           type: "Point",
//           coordinates: [longitude, latitude]
//         },
//         lastUpdate: new Date()
//       }
//     );
    
//     // Find the ride to get user ID
//     const ride = await Ride.findOne({ RAID_ID: rideId });
//     if (ride && ride.user) {
//       // Send driver location to user
//       io.to(ride.user.toString()).emit("driverLocationUpdate", {
//         rideId: rideId,
//         driverId: driverId,
//         latitude: latitude,
//         longitude: longitude,
//         timestamp: new Date().toISOString()
//       });
      
//       console.log(`📍 Sent driver ${driverId} location to user ${ride.user}`);
//     }
//   } catch (error) {
//     console.error("❌ Error processing driver live location:", error);
//   }
// });



// // Add this in socket.js connection section
// socket.onAny((eventName, data) => {
//   if (eventName.includes('ride') || eventName.includes('accept') || eventName.includes('driver')) {
//     console.log(`🔍 [SOCKET EVENT] ${eventName}:`, JSON.stringify(data, null, 2));
//   }
// });

// // Specific debug for rideAccepted events
// socket.on("rideAccepted", (data) => {
//   console.log('🎯 [DIRECT rideAccepted EVENT]:', JSON.stringify(data, null, 2));
// });

// socket.on("rideAcceptedBroadcast", (data) => {
//   console.log('📡 [BROADCAST rideAccepted EVENT]:', JSON.stringify(data, null, 2));
// });


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



//     // In socket.js - Update the otpVerified handler
// socket.on("otpVerified", async (data) => {
//   try {
//     const { rideId, driverId, userId } = data;
//     console.log(`✅ OTP Verified for ride ${rideId}`);
    
//     // Update ride status
//     const ride = await Ride.findOne({ RAID_ID: rideId });
//     if (ride) {
//       ride.status = 'started';
//       ride.rideStartTime = new Date();
//       await ride.save();
      
//       // ✅ Send OTP verified alert to user with specific event
//       const userRoom = ride.user?.toString() || userId?.toString();
//       if (userRoom) {
//         io.to(userRoom).emit("otpVerifiedAlert", {
//           rideId: rideId,
//           driverId: driverId,
//           status: 'started',
//           timestamp: new Date().toISOString(),
//           message: "OTP verified! Ride has started.",
//           showAlert: true,
//           alertTitle: "✅ OTP Verified Successfully!",
//           alertMessage: "Your ride is now starting. Driver is on the way to your destination."
//         });
        
//         console.log(`✅ OTP verified alert sent to user ${userRoom}`);
//       }
//     }
//   } catch (error) {
//     console.error("❌ Error handling OTP verification:", error);
//   }
// });





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


//     // Update the rideCompleted handler in socket.js
// socket.on("rideCompleted", async (data) => {
//   try {
//     const { rideId, driverId, userId, distance, fare, actualPickup, actualDrop } = data;
    
//     console.log(`🏁 Ride ${rideId} completed by driver ${driverId}`);
//     console.log(`💰 Fare: ₹${fare}, Distance: ${distance}km`);
    
//     // Update ride in database
//     const ride = await Ride.findOne({ RAID_ID: rideId });
//     if (ride) {
//       ride.status = 'completed';
//       ride.completedAt = new Date();
//       ride.actualDistance = distance;
//       ride.actualFare = fare;
//       ride.actualPickup = actualPickup;
//       ride.actualDrop = actualDrop;
//       await ride.save();
      
//       console.log(`✅ Ride ${rideId} marked as completed in database`);
//     }
    
//     // Update driver status
//     await Driver.findOneAndUpdate(
//       { driverId: driverId },
//       {
//         status: 'Live',
//         lastUpdate: new Date()
//       }
//     );
    
//     // ✅ CRITICAL: Send BILL ALERT to user (not just rideCompleted)
//     const userRoom = userId?.toString() || ride?.user?.toString();
//     if (userRoom) {
//       console.log(`💰 Sending BILL ALERT to user ${userRoom}`);
      
//       // Send bill alert with complete details
//       io.to(userRoom).emit("billAlert", {
//         type: "bill",
//         rideId: rideId,
//         distance: `${distance} km`,
//         fare: fare,
//         driverName: ride?.driverName || "Driver",
//         vehicleType: ride?.rideType || "bike",
//         actualPickup: actualPickup,
//         actualDrop: actualDrop,
//         timestamp: new Date().toISOString(),
//         message: "Ride completed! Here's your bill.",
//         showBill: true,
//         priority: "high"
//       });
      
//       // Also send rideCompleted for backward compatibility
//       io.to(userRoom).emit("rideCompleted", {
//         rideId: rideId,
//         distance: distance,
//         charge: fare,
//         driverName: ride?.driverName || "Driver",
//         vehicleType: ride?.rideType || "bike",
//         timestamp: new Date().toISOString()
//       });
      
//       console.log(`✅ Bill and completion alerts sent to user ${userRoom}`);
//     }
    
//     // Notify driver
//     socket.emit("rideCompletedSuccess", {
//       rideId: rideId,
//       message: "Ride completed successfully",
//       timestamp: new Date().toISOString()
//     });
    
//   } catch (error) {
//     console.error("❌ Error processing ride completion:", error);
//   }
// });


// io.on('connection', (socket) => {
//   console.log('🔌 New client connected:', socket.id);
  
//   // Listen for order status updates from admin
//   socket.on('adminOrderUpdate', (data) => {
//     console.log('🔄 Admin order update:', data);
    
//     // Emit to specific user
//     if (data.userId) {
//       io.to(data.userId).emit('orderStatusUpdate', {
//         orderId: data.orderId,
//         status: data.status,
//         message: `Your order status has been updated to ${data.status}`
//       });
//     }
    
//     // Also broadcast to all admin clients
//     socket.broadcast.emit('orderUpdated', data);
//   });
  
//   socket.on('disconnect', () => {
//     console.log('🔌 Client disconnected:', socket.id);
//   });
// });




//     // Add to your driver registration
// socket.on("driverHeartbeat", ({ driverId, latitude, longitude }) => {
//   if (activeDriverSockets.has(driverId)) {
//     const driverData = activeDriverSockets.get(driverId);
//     driverData.lastUpdate = Date.now();
//     driverData.isOnline = true;
    
//     // Update location if provided
//     if (latitude && longitude) {
//       driverData.location = { latitude, longitude };
//     }
    
//     activeDriverSockets.set(driverId, driverData);
//     console.log(`❤️ Heartbeat received from driver: ${driverId}`);
//   }
// });


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


    



//         // DISCONNECT
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
    
//     // ✅ ADD THESE HERE - INSIDE the connection handler
//     socket.on("rideAcceptedByAnotherDriver", (data) => {
//       try {
//         const { rideId, driverId, driverName } = data;
        
//         console.log(`🚫 BROADCAST: Ride ${rideId} taken by ${driverName}`);
        
//         // Broadcast to ALL drivers except the one who accepted
//         socket.broadcast.emit("rideAlreadyTaken", {
//           rideId: rideId,
//           takenBy: driverName,
//           timestamp: new Date().toISOString(),
//           message: "This ride has been accepted by another driver."
//         });
        
//       } catch (error) {
//         console.error("❌ Error broadcasting ride taken:", error);
//       }
//     });
    
//     socket.on("rideAlreadyAccepted", (data) => {
//       // This event is already defined, make sure it broadcasts
//       io.emit("rideTakenByOther", {
//         rideId: data.rideId,
//         message: "Ride accepted by another driver",
//         timestamp: new Date().toISOString()
//       });
//     });
    
//   }); // ✅ This is the END of io.on("connection", (socket) => { ... })





 



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
    console.log('📢 Sending ride request to drivers...');
    console.log(`🚗 REQUIRED Vehicle type: ${rideData.vehicleType}`);
    
    // Get drivers who can accept this vehicle type
    const Driver = require('./models/driver/driver');
    const allDrivers = await Driver.find({
      status: { $in: ["Live", "online", "available"] },
      fcmToken: { $exists: true, $ne: null, $ne: '' }
    });

    console.log(`📊 Total online drivers: ${allDrivers.length}`);

    // Filter drivers who can accept this vehicle type
    const compatibleDrivers = allDrivers.filter(driver => {
      return canDriverAcceptRide(driver.vehicleType, rideData.vehicleType);
    });

    console.log(`✅ Compatible ${rideData.vehicleType} drivers: ${compatibleDrivers.length}`);

    if (compatibleDrivers.length === 0) {
      console.log(`⚠️ No compatible drivers available for ${rideData.vehicleType}`);
      return {
        success: false,
        message: `No ${rideData.vehicleType} drivers available`,
        sentCount: 0,
        totalDrivers: 0,
        fcmSent: false,
        vehicleType: rideData.vehicleType
      };
    }

    // Send socket notification to compatible drivers only
    io.emit("newRideRequest", {
      ...rideData,
      rideId: rideData.rideId,
      _id: savedRide?._id?.toString() || null,
      vehicleType: rideData.vehicleType,
      timestamp: new Date().toISOString(),
      compatibleDriversCount: compatibleDrivers.length
    });

    // FCM notification to drivers with tokens
    const driversWithFCM = compatibleDrivers.filter(driver => driver.fcmToken);

    if (driversWithFCM.length > 0) {
      console.log(`🎯 Sending FCM to ${driversWithFCM.length} compatible drivers`);
      
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
        totalDrivers: compatibleDrivers.length,
        fcmSent: fcmResult.successCount > 0,
        vehicleType: rideData.vehicleType,
        fcmMessage: fcmResult.successCount > 0 ?
          `FCM sent to ${fcmResult.successCount} compatible drivers` :
          `FCM failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
      };
    }
    
    return {
      success: false,
      driversNotified: 0,
      totalDrivers: 0,
      fcmSent: false,
      vehicleType: rideData.vehicleType,
      fcmMessage: `No compatible drivers with valid FCM tokens for ${rideData.vehicleType}`
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

// ✅ ADD THIS HELPER FUNCTION
const canDriverAcceptRide = (driverVehicleType, rideVehicleType) => {
  if (!driverVehicleType || !rideVehicleType) return false;
  
  const driverType = driverVehicleType.toLowerCase();
  const rideType = rideVehicleType.toLowerCase();
  
  // Define compatibility matrix
  const compatibility = {
    'taxi': ['taxi', 'sedan', 'mini', 'suv'],
    'sedan': ['sedan', 'taxi'],
    'mini': ['mini', 'taxi'],
    'suv': ['suv', 'taxi'],
    'port': ['port'],
    'bike': ['bike']
  };
  
  return compatibility[driverType]?.includes(rideType) || false;
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


    // Update the acceptRide function in the backend
socket.on("acceptRide", async (data, callback) => {
  console.log("🚨 ===== BACKEND ACCEPT RIDE START =====");
  console.log("📥 Acceptance Data:", { rideId: data.rideId, driverId: data.driverId });

  try {
    console.log(`🔍 Looking for ride: ${data.rideId}`);
    
    const ride = await Ride.findOne({ RAID_ID: data.rideId })
      .populate('user', 'phoneNumber mobile name');

    if (!ride) {
      console.error(`❌ Ride ${data.rideId} not found in database`);
      if (typeof callback === "function") {
        callback({ success: false, message: "Ride not found" });
      }
      return;
    }

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

    // Get user's ACTUAL mobile number
    let userMobile = "Contact Admin";
    if (ride.userMobile && ride.userMobile !== "Contact Admin") {
      userMobile = ride.userMobile;
    } else if (ride.userPhone && ride.userPhone !== "Contact Admin") {
      userMobile = ride.userPhone;
    } else if (ride.user && ride.user.phoneNumber) {
      userMobile = ride.user.phoneNumber;
    } else if (ride.user && ride.user.mobile) {
      userMobile = ride.user.mobile;
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

    // Prepare ride data for response
    const rideData = {
      success: true,
      rideId: ride.RAID_ID,
      driverId: data.driverId,
      driverName: data.driverName || "Driver",
      driverMobile: driverMobile,
      userMobile: userMobile,
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
      userPhone: userMobile,
      otp: ride.otp,
      status: 'accepted',
      timestamp: new Date().toISOString()
    };

    // ✅ SEND TO DRIVER
    if (typeof callback === "function") {
      callback(rideData);
    }

// In acceptRide function in backend socket.js

// In socket.js - acceptRide function

// ✅ BROADCAST TO USER WHO BOOKED THE RIDE
const userRoom = ride.user?.toString() || ride.userId?.toString();
if (userRoom) {
  console.log(`📡 Emitting rideAccepted to user room: ${userRoom}`);
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
// Use io.except to exclude the user who booked the ride
io.except(userRoom).emit("rideAlreadyTaken", {
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

    socket.on("rideAccepted", (data) => {
      console.log('🎯 [DIRECT rideAccepted EVENT]:', JSON.stringify(data, null, 2));
    });

    socket.on("rideAcceptedBroadcast", (data) => {
      console.log('📡 [BROADCAST rideAccepted EVENT]:', JSON.stringify(data, null, 2));
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

    // ✅ FIXED: Get user data with mobile number
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
       
        // ✅ Get mobile from multiple possible sources
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
          userMobile: userMobile, // ✅ Actual mobile number
          userPhone: userMobile, // ✅ Also include as userPhone
          userPhoto: ride.user?.profilePhoto || null,
          pickup: ride.pickup,
          drop: ride.drop,
          userCurrentLocation: userCurrentLocation,
          otp: ride.otp,
          fare: ride.fare,
          distance: ride.distance
        };
       
        console.log(`📤 Sending user data to driver for ride ${rideId}`);
        console.log(`📱 User Mobile: ${userMobile}`); // ✅ Log mobile
       
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

    

    // Update the otpVerified handler
socket.on("otpVerified", async (data) => {
  try {
    const { rideId, driverId, userId } = data;
    console.log(`✅ OTP Verified for ride ${rideId}`);
    
    const ride = await Ride.findOne({ RAID_ID: rideId });
    if (ride) {
      ride.status = 'started';
      ride.rideStartTime = new Date();
      await ride.save();
      

      // In acceptRide function in backend socket.js
const userRoom = ride.user?.toString() || ride.userId?.toString();
if (userRoom) {
  console.log(`📡 Emitting rideAccepted to user room: ${userRoom}`);
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


    }
  } catch (error) {
    console.error("❌ Error handling OTP verification:", error);
  }
});




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
   

    socket.on("completeRide", async (data) => {
  try {
    const { rideId, driverId, userId, distance, fare, actualPickup, actualDrop } = data;
    
    console.log(`🏁 Ride ${rideId} completed by driver ${driverId}`);
    console.log(`💰 Fare: ₹${fare}, Distance: ${distance}km`);
    
    // Calculate actual fare based on distance and admin rate
    const Ride = require('./models/ride');
    const ride = await Ride.findOne({ RAID_ID: rideId });
    
    if (ride) {
      // Get admin rate for this vehicle type
      const ridePriceController = require('./controllers/ridePriceController');
      const rate = await ridePriceController.getCurrentPrice(ride.rideType);
      const actualFare = parseFloat(distance) * rate;
      
      ride.status = 'completed';
      ride.completedAt = new Date();
      ride.actualDistance = distance;
      ride.actualFare = actualFare;
      ride.actualPickup = actualPickup;
      ride.actualDrop = actualDrop;
      await ride.save();
      
      console.log(`✅ Ride ${rideId} marked as completed in database with fare ₹${actualFare}`);
    }


       
        if (rides[rideId]) {
          rides[rideId].status = "completed";
          rides[rideId].completedAt = Date.now();
          rides[rideId].distance = distance;
          rides[rideId].fare = fare;
         
          const userId = rides[rideId].userId;
          io.to(userId).emit("rideCompleted", {
            rideId,
            distance,
            charge: fare,
            travelTime: `${Math.round(distance * 10)} mins`
          });
         
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
          
          console.log(`✅ Bill and completion alerts sent to user ${userRoom}`);
        }
        
        socket.emit("rideCompletedSuccess", {
          rideId: rideId,
          message: "Ride completed successfully",
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error("❌ Error processing ride completion:", error);
      }
    });

    io.on('connection', (socket) => {
      console.log('🔌 New client connected:', socket.id);
      
      socket.on('adminOrderUpdate', (data) => {
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
      
      socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
      });
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

