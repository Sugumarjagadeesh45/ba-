const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');
const Driver = require('../models/driver/driver');
const { authMiddleware } = require('../middleware/authMiddleware');

console.log('📱 Notification Routes loaded');

/**
 * @route POST /api/notifications/test-broadcast
 * @description Send test notification to all drivers (Admin only)
 */
router.post('/test-broadcast', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;

    const result = await NotificationService.sendRideRequestToAllDrivers({
      rideId: 'TEST_' + Date.now(),
      pickup: { address: 'Test Location, Test City' },
      drop: { address: 'Test Destination, Test City' },
      fare: 100,
      distance: '5 km',
      vehicleType: 'taxi',
      userName: 'Test Customer'
    });

    res.json({
      success: true,
      message: 'Test broadcast notification sent',
      result: result
    });

  } catch (error) {
    console.error('❌ Error in test broadcast:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test broadcast',
      error: error.message
    });
  }
});

/**
 * @route POST /api/notifications/send-to-driver
 * @description Send notification to specific driver
 */
router.post('/send-to-driver', authMiddleware, async (req, res) => {
  try {
    const { driverId, title, body, data } = req.body;

    if (!driverId || !title) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID and title are required'
      });
    }

    const result = await NotificationService.sendToDriver(driverId, title, body, data);

    res.json({
      success: result.success,
      message: result.success ? 'Notification sent successfully' : result.error,
      driverId: driverId,
      result: result
    });

  } catch (error) {
    console.error('❌ Error sending notification to driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
});

/**
 * @route GET /api/notifications/drivers-status
 * @description Get FCM token status for all drivers
 */
router.get('/drivers-status', authMiddleware, async (req, res) => {
  try {
    const drivers = await Driver.find({})
      .select('driverId name fcmToken platform notificationEnabled lastUpdate online')
      .sort({ lastUpdate: -1 });

    const status = drivers.map(driver => ({
      driverId: driver.driverId,
      name: driver.name,
      hasFCMToken: !!driver.fcmToken,
      platform: driver.platform,
      notificationEnabled: driver.notificationEnabled,
      online: driver.online,
      lastUpdate: driver.lastUpdate,
      tokenPreview: driver.fcmToken ? `***${driver.fcmToken.slice(-8)}` : 'Not set'
    }));

    res.json({
      success: true,
      totalDrivers: drivers.length,
      driversWithTokens: status.filter(d => d.hasFCMToken).length,
      driversOnline: status.filter(d => d.online).length,
      drivers: status
    });

  } catch (error) {
    console.error('❌ Error getting drivers status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get drivers status',
      error: error.message
    });
  }
});

module.exports = router;