const express = require('express');
const router = express.Router();
const rideController = require('../controllers/rideController');
const { authMiddleware, optionalAuth } = require('../middleware/authMiddleware');

// Debug controller methods on startup
console.log('🚗 Ride Controller Methods:', Object.keys(rideController).filter(key => typeof rideController[key] === 'function'));

// Price calculation (public)
router.post('/calculate-price', (req, res) => {
  rideController.calculateRidePrice(req, res);
});

// Create ride (optional auth for guest users)
router.post('/', optionalAuth, (req, res) => {
  rideController.createRide(req, res);
});

// Get all rides (protected)
router.get('/', authMiddleware, (req, res) => {
  rideController.getRides(req, res);
});

// Get ride by ID (optional auth)
router.get('/:rideId', optionalAuth, (req, res) => {
  rideController.getRideById(req, res);
});

// Update ride (protected)
router.put('/:rideId', authMiddleware, (req, res) => {
  rideController.updateRide(req, res);
});

// Delete ride (protected)
router.delete('/:rideId', authMiddleware, (req, res) => {
  rideController.deleteRide(req, res);
});

// Ride actions (protected)
router.put('/:rideId/accept', authMiddleware, (req, res) => {
  rideController.acceptRide(req, res);
});

router.put('/:rideId/arrived', authMiddleware, (req, res) => {
  rideController.markArrived(req, res);
});

router.put('/:rideId/start', authMiddleware, (req, res) => {
  rideController.startRide(req, res);
});

router.put('/:rideId/complete', authMiddleware, (req, res) => {
  rideController.completeRide(req, res);
});

// Get rides by driver (protected)
router.get('/driver/:driverId', authMiddleware, (req, res) => {
  rideController.getRidesByDriver(req, res);
});


// In your backend routes (e.g., rideRoutes.js)
router.post('/complete-ride', async (req, res) => {
  try {
    const { rideId, driverId, distance, charge } = req.body;
    
    console.log('🎉 API: Ride completion request:', { rideId, driverId });
    
    // Find ride
    const ride = await Ride.findOne({ RAID_ID: rideId });
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }
    
    // Update ride
    ride.status = 'completed';
    ride.completedAt = new Date();
    ride.finalFare = charge;
    ride.actualDistance = distance;
    await ride.save();
    
    // Get IO instance
    const io = require('../socket').getIO();
    const userId = ride.user?.toString();
    
    if (userId && io) {
      // Prepare data
      const completionData = {
        success: true,
        rideId,
        driverId,
        driverName: ride.driverName,
        vehicleType: ride.rideType,
        distance: `${distance} km`,
        charge,
        travelTime: calculateTravelTime(ride.Raid_date, new Date()),
        timestamp: new Date().toISOString(),
        message: "Ride completed successfully!",
        pickupAddress: ride.pickup?.addr,
        dropoffAddress: ride.drop?.addr,
        userName: ride.name,
        userMobile: ride.userMobile
      };
      
      // Broadcast to user
      io.to(userId).emit('rideCompleted', completionData);
      io.to(userId).emit('rideCompletionConfirmed', completionData);
      
      console.log(`✅ Broadcasted completion to user ${userId}`);
    }
    
    res.json({ success: true, message: 'Ride completed successfully' });
    
  } catch (error) {
    console.error('❌ API Error completing ride:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});





// Update ride status (protected)
router.patch('/:rideId/status', authMiddleware, (req, res) => {
  rideController.updateRideStatus(req, res);
});

module.exports = router;

