const { sendNotificationToMultipleDrivers, sendNotificationToDriver, testFirebaseConnection } = require('./firebaseService');
const Driver = require('../models/driver/driver');

console.log('📱 Notification Service loaded');




// In /services/notificationService.js - Update driver query

class NotificationService {
  
 


  // Update the sendRideRequestToAllDrivers function
static async sendRideRequestToAllDrivers(rideData, savedRide) {
  try {
    console.log('\n🔔 ===== FCM NOTIFICATION PROCESS START =====');
    console.log('🚖 Ride Details for Notification:');
    console.log('   🆔 Ride ID:', rideData.rideId);
    console.log('   🚗 Vehicle Type:', rideData.vehicleType);
    console.log('   👤 Customer:', rideData.userName);
    console.log('   📞 Mobile:', rideData.userMobile);
    console.log('   📍 Pickup:', rideData.pickup?.address);

    console.log('\n🔍 FINDING ONLINE DRIVERS WITH MATCHING VEHICLE TYPE...');

    // ✅ CRITICAL FIX: Filter by vehicle type AND online status
    const allDrivers = await Driver.find({
      $and: [
        {
          $or: [
            { status: "Live" },
            { status: "online" }, 
            { status: "available" },
            { isOnline: true }
          ]
        },
        {
          vehicleType: rideData.vehicleType // ✅ FILTER BY VEHICLE TYPE
        }
      ],
      fcmToken: { 
        $exists: true, 
        $ne: null, 
        $ne: '',
        $type: 'string'
      }
    });

    console.log(`📊 DATABASE QUERY RESULTS:`);
    console.log(`   ✅ Total ${rideData.vehicleType} drivers found: ${allDrivers.length}`);
    console.log(`   📱 Drivers with FCM tokens: ${allDrivers.filter(d => d.fcmToken).length}`);

    if (allDrivers.length === 0) {
      console.log(`❌ NO ${rideData.vehicleType.toUpperCase()} DRIVERS WITH FCM TOKENS FOUND`);
      return {
        success: false,
        message: `No ${rideData.vehicleType} drivers available`,
        sentCount: 0,
        totalDrivers: 0,
        fcmSent: false
      };
    }

    // Log each driver found
    console.log('\n👥 DRIVERS FOUND FOR NOTIFICATION (FILTERED BY VEHICLE TYPE):');
    allDrivers.forEach((driver, index) => {
      console.log(`   ${index + 1}. ${driver.name} (${driver.driverId})`);
      console.log(`      🚗 Vehicle: ${driver.vehicleType} (Matches: ${driver.vehicleType === rideData.vehicleType ? '✅' : '❌'})`);
      console.log(`      📱 Token: ${driver.fcmToken ? driver.fcmToken.substring(0, 20) + '...' : 'NO TOKEN'}`);
      console.log(`      📍 Status: ${driver.status}`);
    });

    // Always send socket notification as primary method
    console.log('\n🔔 SENDING SOCKET NOTIFICATION TO MATCHING DRIVERS...');
    io.emit("newRideRequest", {
      ...rideData,
      rideId: rideData.rideId,
      _id: savedRide?._id?.toString() || null,
      timestamp: new Date().toISOString()
    });
    console.log('✅ SOCKET NOTIFICATION SENT TO ALL CONNECTED DRIVERS WITH MATCHING VEHICLE TYPE');

    // FCM notification to drivers with tokens
    const driversWithFCM = allDrivers.filter(driver => driver.fcmToken);
    
    console.log(`\n🎯 FCM NOTIFICATION TARGETS:`);
    console.log(`   📱 ${rideData.vehicleType} drivers with valid FCM tokens: ${driversWithFCM.length}`);
    
    if (driversWithFCM.length > 0) {
      console.log(`🚀 SENDING FCM TO ${driversWithFCM.length} ${rideData.vehicleType.toUpperCase()} DRIVERS...`);
      
      // Prepare FCM notification data
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

      console.log('\n📦 FCM NOTIFICATION PAYLOAD:');
      console.log('   📢 Title: "🚖 New Ride Request!"');
      console.log(`   📝 Body: "${rideData.vehicleType} - Pickup: ${rideData.pickup?.address?.substring(0, 40)}... | Fare: ₹${rideData.fare}"`);
      console.log('   🔧 Data:', JSON.stringify(notificationData, null, 2));

      const driverTokens = driversWithFCM.map(d => d.fcmToken);
      
      console.log(`\n📤 SENDING FCM NOTIFICATIONS...`);
      console.log(`   🔑 Tokens being sent: ${driverTokens.length}`);
      
      const fcmResult = await sendNotificationToMultipleDrivers(
        driverTokens,
        `🚖 New ${rideData.vehicleType.toUpperCase()} Ride Request!`,
        `Pickup: ${rideData.pickup?.address?.substring(0, 40)}... | Fare: ₹${rideData.fare}`,
        notificationData
      );

      console.log('\n📊 FCM NOTIFICATION RESULTS:');
      console.log(`   ✅ Successful: ${fcmResult.successCount}`);
      console.log(`   ❌ Failed: ${fcmResult.failureCount}`);
      console.log(`   📊 Total: ${fcmResult.totalTokens}`);
      
      if (fcmResult.errors && fcmResult.errors.length > 0) {
        console.log('   🔍 Errors:');
        fcmResult.errors.forEach((error, index) => {
          console.log(`      ${index + 1}. ${error}`);
        });
      }

      return {
        success: fcmResult.successCount > 0,
        driversNotified: fcmResult.successCount,
        totalDrivers: driversWithFCM.length,
        fcmSent: fcmResult.successCount > 0,
        successCount: fcmResult.successCount,
        failureCount: fcmResult.failureCount,
        vehicleType: rideData.vehicleType,
        fcmMessage: fcmResult.successCount > 0 ? 
          `FCM sent to ${fcmResult.successCount} ${rideData.vehicleType} drivers` : 
          `FCM failed: ${fcmResult.errors?.join(', ') || 'Unknown error'}`
      };
    } else {
      console.log('❌ NO DRIVERS WITH VALID FCM TOKENS');
      return {
        success: false,
        driversNotified: 0,
        totalDrivers: 0,
        fcmSent: false,
        vehicleType: rideData.vehicleType,
        fcmMessage: `No ${rideData.vehicleType} drivers with valid FCM tokens available`
      };
    }

  } catch (error) {
    console.error('❌ ERROR IN FCM NOTIFICATION SYSTEM:', error);
    console.error('❌ Stack Trace:', error.stack);
    return {
      success: false,
      error: error.message,
      fcmSent: false,
      fcmMessage: `FCM error: ${error.message}`
    };
  }
}



}


module.exports = NotificationService;



// const { sendNotificationToMultipleDrivers, sendNotificationToDriver } = require('./firebaseService');
// const Driver = require('../models/driver/driver');

// console.log('📱 Notification Service loaded');

// class NotificationService {
//   /**
//    * Send ride request notification to all available drivers
//    */
//   static async sendRideRequestToAllDrivers(rideData) {
//     try {
//       console.log('🚨 SENDING RIDE REQUEST NOTIFICATIONS TO ALL DRIVERS');
//       console.log('📊 Ride Data:', {
//         rideId: rideData.rideId,
//         pickup: rideData.pickup?.address || 'Selected Location',
//         fare: rideData.fare,
//         vehicleType: rideData.vehicleType
//       });

//       // Get ALL active drivers with valid FCM tokens
//       const allDrivers = await Driver.find({ 
//         status: "Live",
//         fcmToken: { $exists: true, $ne: null, $ne: '' }
//       }).select('fcmToken driverId name vehicleType');

//       console.log(`📱 Found ${allDrivers.length} drivers with FCM tokens`);

//       const driverTokens = allDrivers.map(driver => driver.fcmToken).filter(token => token);
      
//       if (driverTokens.length === 0) {
//         console.log('⚠️ No drivers with valid FCM tokens found');
//         return {
//           success: false,
//           message: 'No drivers with FCM tokens available',
//           sentCount: 0,
//           totalDrivers: 0
//         };
//       }

//       // In notificationService.js, sendRideRequestToAllDrivers function
// const notificationData = {
//   type: 'ride_request',
//   rideId: rideData.rideId,
//   pickup: JSON.stringify(rideData.pickup || {}),
//   drop: JSON.stringify(rideData.drop || {}),
//   fare: rideData.fare?.toString() || '0',
//   distance: rideData.distance || '0 km',
//   vehicleType: rideData.vehicleType || 'taxi',
//   userName: rideData.userName || 'Customer',  // Changed from customerName
//   userMobile: rideData.userMobile || 'N/A',    // Added missing field
//   timestamp: new Date().toISOString(),
//   priority: 'high',
//   click_action: 'FLUTTER_NOTIFICATION_CLICK'
// };


// // In notificationService.js
// console.log('🚨 SENDING REAL RIDE NOTIFICATION:');
// console.log('Payload:', notificationData);
// console.log('Driver Tokens:', driverTokens);

// const result = await sendNotificationToMultipleDrivers(...);
// console.log('📊 NOTIFICATION RESULT:', result);


//       const result = await sendNotificationToMultipleDrivers(
//         driverTokens,
//         '🚖 New Ride Request!',
//         `Pickup: ${rideData.pickup?.address?.substring(0, 40) || 'Selected Location'}...`,
//         notificationData
//       );

//       console.log(`📊 Notification Send Results:`, result);

//       // Log which drivers received notifications
//       if (result.successCount > 0) {
//         console.log(`✅ Notifications sent successfully to ${result.successCount} drivers`);
//       }
//       if (result.failureCount > 0) {
//         console.log(`❌ Failed to send to ${result.failureCount} drivers`);
//       }

//       return {
//         success: result.successCount > 0,
//         sentCount: result.successCount,
//         failedCount: result.failureCount,
//         totalDrivers: driverTokens.length,
//         errors: result.errors
//       };

//     } catch (error) {
//       console.error('❌ Error in sendRideRequestToAllDrivers:', error);
//       return {
//         success: false,
//         message: error.message,
//         sentCount: 0,
//         totalDrivers: 0
//       };
//     }
//   }

//   /**
//    * Send notification to specific driver
//    */
//   static async sendToDriver(driverId, title, body, data = {}) {
//     try {
//       const driver = await Driver.findOne({ driverId });
//       if (!driver || !driver.fcmToken) {
//         console.log(`❌ Driver ${driverId} not found or no FCM token`);
//         return { success: false, error: 'Driver not found or no FCM token' };
//       }

//       const result = await sendNotificationToDriver(driver.fcmToken, title, body, data);
      
//       return { 
//         success: result, 
//         driverId,
//         driverName: driver.name 
//       };
//     } catch (error) {
//       console.error(`❌ Error sending notification to driver ${driverId}:`, error);
//       return { success: false, error: error.message };
//     }
//   }

//   /**
//    * Send ride accepted notification to user
//    */
//   static async sendRideAcceptedToUser(userFCMToken, rideData) {
//     try {
//       if (!userFCMToken) {
//         return { success: false, error: 'No user FCM token provided' };
//       }

//       const result = await sendNotificationToDriver(
//         userFCMToken,
//         '✅ Ride Accepted!',
//         `Driver ${rideData.driverName} is on the way to pick you up`,
//         {
//           type: 'ride_accepted',
//           rideId: rideData.rideId,
//           driverId: rideData.driverId,
//           driverName: rideData.driverName,
//           vehicleType: rideData.vehicleType,
//           eta: rideData.eta || '5 mins',
//           timestamp: new Date().toISOString()
//         }
//       );

//       return { success: result };
//     } catch (error) {
//       console.error('❌ Error sending ride accepted notification:', error);
//       return { success: false, error: error.message };
//     }
//   }

//   /**
//    * Test notification endpoint
//    */
//   static async sendTestNotification(driverId) {
//     return await this.sendToDriver(
//       driverId,
//       '🧪 Test Notification',
//       'This is a test notification from the backend server',
//       {
//         type: 'test',
//         timestamp: new Date().toISOString(),
//         test: 'true'
//       }
//     );
//   }

//   /**
//    * Send driver arrival notification
//    */
//   static async sendDriverArrived(driverId, rideData) {
//     return await this.sendToDriver(
//       driverId,
//       '📍 Driver Arrived',
//       `Driver has arrived at pickup location`,
//       {
//         type: 'driver_arrived',
//         rideId: rideData.rideId,
//         timestamp: new Date().toISOString()
//       }
//     );
//   }

//   /**
//    * Send ride completed notification
//    */
//   static async sendRideCompleted(driverId, rideData) {
//     return await this.sendToDriver(
//       driverId,
//       '🎉 Ride Completed',
//       `Ride completed successfully. Fare: ₹${rideData.fare}`,
//       {
//         type: 'ride_completed',
//         rideId: rideData.rideId,
//         fare: rideData.fare?.toString() || '0',
//         timestamp: new Date().toISOString()
//       }
//     );
//   }
// }

// module.exports = NotificationService;