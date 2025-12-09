const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Registration = require('../models/user/Registration');
const Counter = require('../models/user/customerId');
const Driver = require('../models/driver/driver'); // ADD THIS LINE

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '30d',
  });
};

// ==================== ADD THESE NEW ENDPOINTS ====================

// ✅ Driver OTP request - Check if driver exists
router.post('/request-driver-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    console.log('📞 Driver OTP request for:', phoneNumber);

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    // Clean phone number (remove +91 if present)
    const cleanPhone = phoneNumber.replace('+91', '').replace(/\D/g, '');
    
    // Check if driver exists
    const driver = await Driver.findOne({ 
      $or: [
        { phone: cleanPhone },
        { phoneNumber: cleanPhone }
      ]
    });

    if (!driver) {
      console.log(`❌ Driver not found for phone: ${cleanPhone}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found. Please register first or contact admin.',
        contactEmail: 'eazygo2026@gmail.com'
      });
    }

    console.log(`✅ Driver found: ${driver.driverId} - ${driver.name}`);
    
    res.json({
      success: true,
      driverId: driver.driverId,
      name: driver.name,
      phone: driver.phone,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      message: 'Driver verified. Proceed with Firebase OTP.'
    });

  } catch (error) {
    console.error('❌ Driver OTP request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during driver verification',
      error: error.message 
    });
  }
});

// ✅ Get driver info after Firebase auth
router.post('/get-driver-info', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    console.log('🔍 Getting driver info for:', phoneNumber);

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    // Clean phone number
    const cleanPhone = phoneNumber.replace('+91', '').replace(/\D/g, '');
    
    const driver = await Driver.findOne({ 
      $or: [
        { phone: cleanPhone },
        { phoneNumber: cleanPhone }
      ]
    }).select('-passwordHash'); // Exclude password

    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: driver._id,
        driverId: driver.driverId,
        role: 'driver' 
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    console.log(`✅ Driver info retrieved: ${driver.driverId}`);

    res.json({
      success: true,
      token: token,
      driver: {
        driverId: driver.driverId,
        name: driver.name,
        phone: driver.phone,
        email: driver.email || '',
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        wallet: driver.wallet || 0,
        status: driver.status || 'Offline',
        location: driver.location || { type: 'Point', coordinates: [0, 0] },
        fcmToken: driver.fcmToken || '',
        profilePicture: driver.profilePicture || '',
        licenseNumber: driver.licenseNumber || '',
        aadharNumber: driver.aadharNumber || '',
        dob: driver.dob || null,
        active: driver.active || true
      },
      message: 'Driver authenticated successfully'
    });

  } catch (error) {
    console.error('❌ Get driver info error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get driver info',
      error: error.message 
    });
  }
});

// ==================== EXISTING ROUTES ====================

router.get('/test', (req, res) => {
  console.log('✅ /api/auth/test route hit!');
  res.json({ 
    message: 'Auth routes are working!',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'POST /api/auth/verify-phone',
      'POST /api/auth/register',
      'POST /api/auth/request-driver-otp',
      'POST /api/auth/get-driver-info'
    ]
  });
});

// Phone verification route
router.post('/verify-phone', async (req, res) => {
  try {
    console.log('✅ /api/auth/verify-phone route hit!');
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    console.log('📞 Phone verification request for:', phoneNumber);
    
    const user = await Registration.findOne({ phoneNumber });
    
    if (user) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '30d',
      });
      
      return res.json({ 
        success: true, 
        token,
        user: { 
          name: user.name, 
          phoneNumber: user.phoneNumber, 
          customerId: user.customerId, 
          profilePicture: user.profilePicture 
        }
      });
    }
    
    return res.json({ success: true, newUser: true });
    
  } catch (err) {
    console.error('❌ Error in verify-phone:', err);
    res.status(500).json({ error: err.message });
  }
});

const getNextCustomerId = async () => {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'customerId' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return (100000 + counter.sequence).toString();
};

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { name, phoneNumber, address } = req.body;

    if (!name || !phoneNumber || !address) {
      return res.status(400).json({ error: 'Name, phone number, and address are required' });
    }

    const existingUser = await Registration.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const customerId = await getNextCustomerId();

    const newUser = new Registration({
      name,
      phoneNumber,
      address,
      customerId
    });

    await newUser.save();

    const token = generateToken(newUser._id);

    res.status(201).json({
      success: true,
      token,
      user: { 
        name: newUser.name, 
        phoneNumber: newUser.phoneNumber, 
        address: newUser.address, 
        customerId: newUser.customerId 
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;