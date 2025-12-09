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

// Update ride status (protected)
router.patch('/:rideId/status', authMiddleware, (req, res) => {
  rideController.updateRideStatus(req, res);
});

module.exports = router;

