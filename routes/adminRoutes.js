// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const AdminUser = require('../models/adminUser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');


const walletController = require('../controllers/driver/WalletController');



router.put('/driver/:driverId/wallet', walletController.updateDriverWallet);
router.get('/driver/:driverId/wallet', walletController.getDriverWallet);


// ================================
// MULTER CONFIGURATION
// ================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/documents/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// ================================
// TEMPORARY DEBUG ROUTES
// ================================

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Admin routes are working!', timestamp: new Date() });
});

// Register route
router.post('/register', async (req, res) => {
  try {
    const { username, password, role = 'admin' } = req.body;
    
    console.log('📝 Register attempt:', { username, role });
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const existingAdmin = await AdminUser.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin user already exists' });
    }

    const admin = new AdminUser({
      username,
      role
    });

    await admin.setPassword(password);
    await admin.save();

    console.log('✅ Admin registered successfully:', username);
    
    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      username,
      role
    });
  } catch (err) {
    console.error('❌ Admin registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Setup first admin
router.post('/setup-first-admin', async (req, res) => {
  try {
    const admin = new AdminUser({
      username: 'admin@eazygo.com',
      role: 'superadmin'
    });
    
    await admin.setPassword('admin123');
    await admin.save();
    
    console.log('✅ Default admin created:', admin.username);
    res.json({ 
      success: true, 
      message: 'Default admin created successfully',
      credentials: {
        username: 'admin@eazygo.com',
        password: 'admin123'
      }
    });
  } catch (err) {
    console.error('❌ Setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', { email, password });
    
    const admin = await AdminUser.findOne({ username: email });
    console.log('👤 Found admin:', admin ? 'Yes' : 'No');
    
    if (!admin) {
      console.log('❌ Admin not found with username:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await admin.validatePassword(password);
    console.log('🔑 Password valid:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('❌ Invalid password for admin:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    console.log('✅ Login successful for:', admin.username);
    
    res.json({
      token,
      role: admin.role,
      message: 'Login successful'
    });
  } catch (err) {
    console.error('❌ Admin login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ================================
// ADMIN CONTROLLER ROUTES
// ================================

// Dashboard
router.get('/dashboard-data', adminController.getDashboardData);

// Driver management (COMMENT OUT file upload for now)
router.post('/drivers/create', adminController.createDriverWithValidation);
// router.post('/drivers/:driverId/documents', upload.fields([
//   { name: 'licenseDocument', maxCount: 1 },
//   { name: 'aadharDocument', maxCount: 1 }
// ]), adminController.uploadDriverDocuments);

// Simple version without file upload
router.post('/drivers/:driverId/documents', adminController.uploadDriverDocuments);

// User management
router.get('/users', adminController.getUsers);

// Driver management
router.get('/drivers', adminController.getDrivers);
router.put('/driver/:id/toggle', adminController.toggleDriverStatus);

// Rides
router.get('/rides', adminController.getRides);
router.post('/ride/:rideId/assign', adminController.assignRide);

// Points & Stock
router.post('/user/:id/adjust-points', adminController.adjustUserPoints);
router.post('/grocery/adjust-stock', adminController.adjustGroceryStock);

module.exports = router;



