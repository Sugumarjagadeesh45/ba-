
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const multer = require('multer');
const path = require('path');

// Multer Setup for Profile Picture Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// PUBLIC ROUTES (No Auth Required)
router.post('/register', userController.registerUser);
router.get('/test', (req, res) => res.json({ message: 'User routes are working!' }));

// PROTECTED ROUTES (Require Auth)


// Ride Routes
router.post('/book-ride', userController.bookRide);
router.get('/ride-history', userController.getRideHistory);
router.post('/ride', userController.createRide);
router.put('/ride/status', userController.updateRideStatus);




// In /Users/webasebrandings/Downloads/cmp_back-main/routes/userRoutes.js

// PROTECTED ROUTES (Require Auth)
router.use(userController.authMiddleware);

// ✅ ADD THESE ENDPOINTS:
router.get('/me', userController.getCurrentUser); // For /api/users/me
router.get('/me/profile', userController.getCurrentUserProfile); // For /api/users/me/profile
router.get('/wallet', userController.getWallet); // For /api/users/wallet

// Existing routes...
router.get('/profile', userController.getProfile);
router.put('/profile', upload.single('profilePicture'), userController.updateProfile);
// ... rest of your routes


// In /Users/webasebrandings/Downloads/cmp_back-main/routes/userRoutes.js

// ✅ ADD THIS DEBUG ENDPOINT
router.get('/debug-endpoints', (req, res) => {
  res.json({
    message: 'User routes are working!',
    availableEndpoints: [
      'GET /api/users/profile',
      'PUT /api/users/profile',
      'GET /api/users/me',
      'POST /api/users/book-ride',
      'GET /api/users/ride-history',
      'GET /api/users/wallet'
    ],
    timestamp: new Date().toISOString()
  });
});


router.post('/live-location', userController.saveLiveLocation);



// In your backend routes (e.g., userRoutes.js)
router.post('/update-fcm-token', async (req, res) => {
  try {
    const { userId, fcmToken, platform } = req.body;
    
    await User.findByIdAndUpdate(userId, {
      fcmToken,
      fcmTokenUpdatedAt: new Date(),
      platform
    });
    
    res.json({ success: true, message: 'FCM token updated' });
  } catch (error) {
    console.error('❌ Error updating user FCM token:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});



router.get('/me', userController.getProfile);


// Wallet Routes

router.post('/wallet/add', userController.addToWallet);
router.post('/wallet/deduct', userController.deductFromWallet);

// Location Routes
router.post('/location', userController.saveUserLocation);
router.get('/location/last', userController.getLastUserLocation);
router.get('/location/all', userController.getAllUserLocations);
router.get('/last-location', userController.getLastUserLocation);
router.get('/all-locations', userController.getAllUserLocations);
router.post('/save-location', userController.saveUserLocation);




// User Management (for admin or internal tools)
router.get('/registered', userController.getAllRegisteredUsers);
router.get('/registered/:id', userController.getRegisteredUserById);
router.get('/', userController.getUsers);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;