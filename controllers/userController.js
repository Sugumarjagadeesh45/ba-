
const Registration = require('../models/user/Registration');
const Location = require('../models/user/UserLocation');
const Ride = require('../models/ride');
const RaidId = require('../models/user/raidId');
const jwt = require('jsonwebtoken');

const path = require('path');

// Update user profile
// D:\newapp\fullbackend-main\fullbackend-main_\controllers\userController.js

exports.updateProfile = async (req, res) => {
  try {
    const { name, email, address, altMobile, gender, dob } = req.body;
    const userId = req.user.id;
    
    console.log('📝 Updating profile for user:', userId);
    console.log('📝 Update data:', req.body);
    if (req.file) {
      console.log('📝 Profile picture file:', req.file);
      console.log('📝 Profile picture path:', req.file.path);
    }
    
    let user = await Registration.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update fields
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (address !== undefined) user.address = address;
    if (altMobile !== undefined) user.altMobile = altMobile;
    if (gender !== undefined) user.gender = gender;
    if (dob !== undefined) user.dob = dob;
    
    // If there's a profile picture, update it with proper path
    if (req.file) {
      // Store just the filename, not the full path
      user.profilePicture = `/uploads/${req.file.filename}`;
      console.log('📷 Updated profile picture path:', user.profilePicture);
    }
    
    await user.save();
    console.log('✅ User updated successfully');
    
    // Format the response properly
    const formattedUser = {
      _id: user._id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      customerId: user.customerId,
      email: user.email || '',
      address: user.address,
      profilePicture: user.profilePicture || '',
      gender: user.gender || '',
      dob: user.dob || '',
      altMobile: user.altMobile || '',
      wallet: user.wallet || 0
    };
    
    res.json({ success: true, user: formattedUser });
  } catch (err) {
    console.error('❌ Error updating profile:', err);
    res.status(500).json({ error: err.message });
  }
};


// Middleware for token authentication
exports.authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    console.log('❌ No authorization header provided');
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = header.split(' ')[1];
  if (!token) {
    console.log('❌ No token found in authorization header');
    return res.status(401).json({ error: 'Token malformed' });
  }
  
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    console.log('✅ Token verified successfully for user ID:', data.id);
    req.user = data;
    next();
  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

exports.saveUserLocation = async (req, res) => {
  try {
    const { latitude, longitude, rideId } = req.body;
    if (!latitude || !longitude) {
      console.log('❌ Missing latitude or longitude in request');
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }
    
    console.log("🌐 Frontend received location code:", { 
      latitude, 
      longitude, 
      userId: req.user.id,
      rideId 
    });
    
    const newLocation = new Location({ 
      latitude, 
      longitude, 
      userId: req.user.id,
      rideId: rideId || null
    });
    
    const savedLocation = await newLocation.save();
    console.log("✅ Location saved to MongoDB:", savedLocation);
    
    res.json({
      message: 'Location saved successfully',
      location: savedLocation
    });
  } catch (err) {
    console.error("❌ Error saving location:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Get last saved location
exports.getLastUserLocation = async (req, res) => {
  try {
    console.log("🔍 Backend: Fetching last location for user:", req.user.id);
    const lastLocation = await Location.findOne({ userId: req.user.id }).sort({ timestamp: -1 });
    if (!lastLocation) {
      console.log('❌ No location found for user:', req.user.id);
      return res.status(404).json({ message: 'No location found' });
    }
    console.log("✅ Backend to send location code:", lastLocation);
    res.json(lastLocation);
  } catch (err) {
    console.error("❌ Error fetching location:", err.message);
    res.status(500).json({ error: err.message });
  }
};




// Get all saved locations
exports.getAllUserLocations = async (req, res) => {
  try {
    const allLocations = await Location.find({ userId: req.user.id }).sort({ timestamp: -1 });
    res.json(allLocations);
  } catch (err) {
    console.error("❌ Error fetching locations:", err.message);
    res.status(500).json({ error: err.message });
  }
};


// Fix wallet endpoint
exports.getWallet = async (req, res) => {
  try {
    const user = await Registration.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Return in the format expected by frontend
    res.json({
      success: true,
      balance: user.wallet || 0,
      wallet: user.wallet || 0
    });
  } catch (err) {
    console.error("❌ Error fetching wallet:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch wallet balance',
      details: err.message
    });
  }
};

// Fix current user profile - ensure consistent response format
exports.getCurrentUserProfile = async (req, res) => {
  try {
    const user = await Registration.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Build proper image URL if profile picture exists
    let profilePictureUrl = '';
    if (user.profilePicture) {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
      profilePictureUrl = user.profilePicture.startsWith('http') 
        ? user.profilePicture 
        : `${backendUrl}${user.profilePicture}`;
    }
    
    // Return in the format expected by frontend
    const userData = {
      _id: user._id,
      name: user.name || '',
      phoneNumber: user.phoneNumber || '',
      customerId: user.customerId || '',
      email: user.email || '',
      address: user.address || '',
      profilePicture: profilePictureUrl,
      gender: user.gender || '',
      dob: user.dob || '',
      altMobile: user.altMobile || '',
      wallet: user.wallet || 0
    };
    
    console.log('✅ Sending user profile data:', {
      name: userData.name,
      customerId: userData.customerId,
      hasProfilePicture: !!userData.profilePicture
    });
    
    res.json({
      success: true,
      user: userData,
      data: userData // Some frontends expect this format too
    });
    
  } catch (err) {
    console.error("❌ Error fetching current user profile:", err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};


exports.getProfile = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await Registration.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Build proper image URL
    let profilePictureUrl = '';
    if (user.profilePicture) {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
      profilePictureUrl = user.profilePicture.startsWith('http') 
        ? user.profilePicture 
        : `${backendUrl}${user.profilePicture}`;
    }
    
    const userData = {
      _id: user._id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      customerId: user.customerId,
      email: user.email || '',
      address: user.address,
      profilePicture: profilePictureUrl,
      gender: user.gender || '',
      dob: user.dob || '',
      altMobile: user.altMobile || '',
      wallet: user.wallet || 0
    };
    
    res.json({
      success: true,
      user: userData
    });
  } catch (err) {
    console.error("❌ Error fetching profile:", err.message);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token' 
      });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const users = await Registration.find();
    res.json(users);
  } catch (err) {
    console.error("❌ Error fetching users:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Create new user
exports.createUser = async (req, res) => {
  try {
    const user = new Registration(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    console.error("❌ Error creating user:", err.message);
    res.status(400).json({ error: err.message });
  }
};

// Register new user
exports.registerUser = async (req, res) => {
  try {
    const { name, phoneNumber, address, email, gender, dob, altMobile } = req.body;

    // Check if phoneNumber or email already exists
    const existingPhone = await Registration.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const registration = new Registration({
      name,
      phoneNumber,
      address
    });

    await registration.save();
    res.status(201).json({ message: 'Registration successful', data: registration });
  } catch (err) {
    console.error("❌ Error registering user:", err.message);
    res.status(400).json({ error: err.message });
  }
};


exports.getAllRegisteredUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log('📋 Fetching registered users with pagination...');
    console.log(`📄 Page: ${page}, Limit: ${limit}, Skip: ${skip}`);

    // Get total count for pagination
    const total = await Registration.countDocuments();
    
    // Get users with pagination, sorted by latest first
    const registeredUsers = await Registration.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-password'); // Exclude password field

    console.log(`✅ Found ${registeredUsers.length} registered users out of ${total} total`);

    res.json({
      success: true,
      data: registeredUsers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        usersPerPage: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (err) {
    console.error("❌ Error fetching registered users:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch registered users',
      details: err.message
    });
  }
};

// Get specific registered user by ID
exports.getRegisteredUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await Registration.findById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error("❌ Error fetching user:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user' 
    });
  }
};

// Book a ride
exports.bookRide = async (req, res) => {
  try {
    console.log('🔍 Booking request received:', req.body);
    
    const {
      pickupLocation,
      dropoffLocation,
      pickupCoordinates,
      dropoffCoordinates,
      fare,
      rideType,
      otp,
      distance,
      travelTime,
      isReturnTrip
    } = req.body;
    
    if (!pickupLocation || !dropoffLocation || !pickupCoordinates || 
        !dropoffCoordinates || !fare || !rideType || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Missing required booking information'
      });
    }
    
    const counter = await RaidId.findOneAndUpdate(
      { _id: 'raidId' },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
    const RAID_ID = counter.sequence.toString().padStart(6, '0');
    
    const user = await Registration.findById(req.user.id);
    if (!user || !user.customerId) {
      return res.status(404).json({ success: false, error: 'User or customerId not found' });
    }
    
    // Log required details
    console.log(`
      🚕 NEW RIDE BOOKING: ${RAID_ID}
      👤 Customer ID: ${user.customerId}
      👤 Customer Name: ${user.name}
      📍 Pickup Location: ${pickupLocation}
      📍 Dropoff Location: ${dropoffLocation}
      📏 Traveling Length: ${distance}
    `);
    
    const newRide = new Ride({
      user: req.user.id,
      customerId: user.customerId,
      name: user.name,
      RAID_ID,
      pickupLocation,
      dropoffLocation,
      pickupCoordinates,
      dropoffCoordinates,
      fare,
      rideType,
      otp,
      distance,
      travelTime,
      isReturnTrip,
      status: 'pending'
    });
    

    const initialLiveLocation = new LiveLocation({
    userId: req.user.id,
    rideId: savedRide._id,
    latitude: savedRide.pickupCoordinates.latitude,
    longitude: savedRide.pickupCoordinates.longitude
  });
  await initialLiveLocation.save();
  console.log('✅ Initial live location saved:', initialLiveLocation);


    const savedRide = await newRide.save();
    console.log('✅ Ride booked successfully:', savedRide);
    
    const io = req.app.get('io');
    if (io) {
      const rideData = {
        rideId: savedRide._id.toString(),
        RAID_ID: savedRide.RAID_ID,
        customerId: savedRide.customerId,
        name: savedRide.name,
        pickup: {
          address: savedRide.pickupLocation,
          lat: savedRide.pickupCoordinates.latitude,
          lng: savedRide.pickupCoordinates.longitude
        },
        drop: {
          address: savedRide.dropoffLocation,
          lat: savedRide.dropoffCoordinates.latitude,
          lng: savedRide.dropoffCoordinates.longitude
        },
        fare: savedRide.fare,
        rideType: savedRide.rideType,
        distance: savedRide.distance,
        otp: savedRide.otp, // Include OTP in the emitted data
        success: true,
        timestamp: new Date()
      };
      
      console.log('📡 Emitting new ride request to all drivers:', rideData);
      io.to("allDrivers").emit("newRideRequest", rideData);
      io.emit("rideCreated", rideData); // Emit to the user
    } else {
      console.log('⚠️ Socket.io instance not available');
    }
    
    res.status(201).json({
      success: true,
      message: 'Ride booked successfully',
      ride: savedRide
    });
    
  } catch (err) {
    console.error("❌ Error booking ride:", err);
    res.status(500).json({
      success: false,
      error: 'Server error while booking ride'
    });
  }
};




// Get ride history (new implementation)
exports.getRideHistory = async (req, res) => {
  try {
    const rides = await Ride.find({ user: req.user.id }).sort({ Raid_date: -1 });
    res.json(rides);
  } catch (err) {
    console.error("❌ Error fetching ride history:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Create ride (new implementation, alias for bookRide if needed)
exports.createRide = async (req, res) => {
  // Reuse bookRide logic for now
  await exports.bookRide(req, res);
};

// Update ride status (new implementation)
exports.updateRideStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const ride = await Ride.findOne({ user: req.user.id, status: { $ne: 'completed' } });
    if (!ride) {
      return res.status(404).json({ error: 'No active ride found' });
    }

    ride.status = status;
    await ride.save();
    res.json({ message: 'Ride status updated', ride });
  } catch (err) {
    console.error("❌ Error updating ride status:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Add to wallet (new implementation)
exports.addToWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const user = await Registration.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.wallet += amount;
    await user.save();
    res.json({ message: 'Amount added to wallet', wallet: user.wallet });
  } catch (err) {
    console.error("❌ Error adding to wallet:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Deduct from wallet (new implementation)
exports.deductFromWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const user = await Registration.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.wallet < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    user.wallet -= amount;
    await user.save();
    res.json({ message: 'Amount deducted from wallet', wallet: user.wallet });
  } catch (err) {
    console.error("❌ Error deducting from wallet:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Update user (new implementation)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    console.log('📝 Updating user:', id);
    console.log('📝 Update data:', updates);

    // Remove fields that shouldn't be updated
    const allowedUpdates = ['name', 'email', 'address', 'altMobile', 'gender', 'dob', 'wallet'];
    const filteredUpdates = {};
    
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    });

    const user = await Registration.findByIdAndUpdate(
      id, 
      filteredUpdates, 
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    console.log('✅ User updated successfully:', user.name);
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (err) {
    console.error("❌ Error updating user:", err.message);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(error => error.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user',
      details: err.message
    });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🗑️ Deleting user:', id);

    const user = await Registration.findByIdAndDelete(id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    console.log('✅ User deleted successfully:', user.name);
    
    res.json({
      success: true,
      message: 'User deleted successfully',
      data: { _id: user._id, name: user.name }
    });
  } catch (err) {
    console.error("❌ Error deleting user:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete user',
      details: err.message
    });
  }
};





// Add these methods to your existing userController.js

// Address Management
exports.saveAddress = async (req, res) => {
  try {
    const {
      name,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      latitude,
      longitude,
      isDefault
    } = req.body;

    const userId = req.user.id;

    console.log('📍 Saving address for user:', userId);

    // Validate required fields
    if (!name || !phone || !addressLine1 || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        error: 'All address fields are required'
      });
    }

    // Validate phone number
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\D/g, ''))) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid Indian phone number'
      });
    }

    // Validate pincode
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid 6-digit pincode'
      });
    }

    const UserAddress = require('../models/user/UserAddress');
    
    // If setting as default, unset other defaults
    if (isDefault) {
      await UserAddress.updateMany(
        { userId: userId },
        { $set: { isDefault: false } }
      );
    }

    const address = new UserAddress({
      userId,
      name,
      phone,
      addressLine1,
      addressLine2: addressLine2 || '',
      city,
      state,
      pincode,
      country: country || 'India',
      latitude: latitude || null,
      longitude: longitude || null,
      isDefault: isDefault || false
    });

    await address.save();

    console.log('✅ Address saved successfully for user:', userId);

    res.status(201).json({
      success: true,
      message: 'Address saved successfully',
      data: address
    });

  } catch (err) {
    console.error('❌ Error saving address:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to save address',
      details: err.message
    });
  }
};


// In /Users/webasebrandings/Downloads/cmp_back-main/controllers/userController.js

// Add these methods for address management
exports.getAddresses = async (req, res) => {
  try {
    const user = await Registration.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // If user has addresses in the database, return them
    // Otherwise, return empty array
    res.json({
      success: true,
      data: user.addresses || []
    });
  } catch (err) {
    console.error("❌ Error fetching addresses:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch addresses',
      details: err.message
    });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const { name, phone, addressLine1, addressLine2, city, state, pincode, country, isDefault } = req.body;
    
    const user = await Registration.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Initialize addresses array if it doesn't exist
    if (!user.addresses) {
      user.addresses = [];
    }

    // If this is set as default, unset all other addresses
    if (isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    // Add new address
    const newAddress = {
      id: Date.now().toString(),
      name,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      isDefault: isDefault || user.addresses.length === 0
    };

    user.addresses.push(newAddress);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: newAddress
    });
  } catch (err) {
    console.error("❌ Error adding address:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add address',
      details: err.message
    });
  }
};




// In /Users/webasebrandings/Downloads/cmp_back-main/controllers/userController.js

// Add this method for /api/users/me endpoint
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await Registration.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Build proper image URL if profile picture exists
    let profilePictureUrl = '';
    if (user.profilePicture) {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
      profilePictureUrl = user.profilePicture.startsWith('http') 
        ? user.profilePicture 
        : `${backendUrl}${user.profilePicture}`;
    }
    
    const userData = {
      _id: user._id,
      name: user.name || '',
      phoneNumber: user.phoneNumber || '',
      customerId: user.customerId || '',
      email: user.email || '',
      address: user.address || '',
      profilePicture: profilePictureUrl,
      gender: user.gender || '',
      dob: user.dob || '',
      altMobile: user.altMobile || '',
      wallet: user.wallet || 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
    
    console.log('✅ Sending current user data for /api/users/me');
    
    res.json({
      success: true,
      user: userData,
      data: userData
    });
    
  } catch (err) {
    console.error("❌ Error in /api/users/me:", err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};




exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const user = await Registration.findById(req.user.id);
    if (!user || !user.addresses) {
      return res.status(404).json({ success: false, error: 'User or addresses not found' });
    }

    const addressIndex = user.addresses.findIndex(addr => addr.id === id);
    if (addressIndex === -1) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    // Update address
    user.addresses[addressIndex] = { ...user.addresses[addressIndex], ...updateData };
    await user.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: user.addresses[addressIndex]
    });
  } catch (err) {
    console.error("❌ Error updating address:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update address',
      details: err.message
    });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await Registration.findById(req.user.id);
    if (!user || !user.addresses) {
      return res.status(404).json({ success: false, error: 'User or addresses not found' });
    }

    const addressIndex = user.addresses.findIndex(addr => addr.id === id);
    if (addressIndex === -1) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    // Check if this is the only address
    if (user.addresses.length === 1) {
      return res.status(400).json({ success: false, error: 'Cannot delete the only address' });
    }

    // If deleting the default address, set another as default
    const isDefault = user.addresses[addressIndex].isDefault;
    user.addresses.splice(addressIndex, 1);
    
    if (isDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (err) {
    console.error("❌ Error deleting address:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete address',
      details: err.message
    });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await Registration.findById(req.user.id);
    if (!user || !user.addresses) {
      return res.status(404).json({ success: false, error: 'User or addresses not found' });
    }

    const addressIndex = user.addresses.findIndex(addr => addr.id === id);
    if (addressIndex === -1) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    // Set all addresses as non-default
    user.addresses.forEach(addr => {
      addr.isDefault = false;
    });

    // Set selected address as default
    user.addresses[addressIndex].isDefault = true;
    await user.save();

    res.json({
      success: true,
      message: 'Default address set successfully',
      data: user.addresses[addressIndex]
    });
  } catch (err) {
    console.error("❌ Error setting default address:", err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to set default address',
      details: err.message
    });
  }
};





exports.saveLiveLocation = async (req, res) => {
  try {
    const { latitude, longitude, rideId } = req.body;
    if (!latitude || !longitude || !rideId) {
      console.log('❌ Missing latitude, longitude, or rideId in request');
      return res.status(400).json({ error: 'Latitude, longitude, and rideId are required' });
    }

    console.log(`🌐 Saving live location for ride ${rideId}:`, { latitude, longitude, userId: req.user.id });

    // Check if the ride exists and is active
    const ride = await Ride.findOne({ _id: rideId, user: req.user.id, status: { $ne: 'completed' } });
    if (!ride) {
      console.log('❌ No active ride found for user:', req.user.id);
      return res.status(404).json({ error: 'No active ride found' });
    }

    const newLiveLocation = new LiveLocation({ 
      userId: req.user.id, 
      rideId, 
      latitude, 
      longitude 
    });

    const savedLocation = await newLiveLocation.save();
    console.log("✅ Live location saved to MongoDB:", savedLocation);

    // Emit live location update to the driver via socket
    const io = req.app.get('io');
    if (io && ride.driverId) {
      io.to(`driver_${ride.driverId}`).emit('userLiveLocationUpdate', {
        rideId,
        userId: req.user.id,
        userLat: latitude,
        userLng: longitude,
        timestamp: savedLocation.timestamp
      });
      console.log(`📡 Sent live location to driver ${ride.driverId}`);
    }

    res.json({
      message: 'Live location saved successfully',
      location: savedLocation
    });
  } catch (err) {
    console.error("❌ Error saving live location:", err.message);
    res.status(500).json({ error: err.message });
  }
};



