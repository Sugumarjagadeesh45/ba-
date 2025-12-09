// D:\app\dummbackend-main\dummbackend-main\controllers\driver\driverController.js
const Driver = require("../../models/driver/driver");
const Ride = require("../../models/ride");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendNotificationToDriver, sendNotificationToMultipleDrivers } = require("../../services/firebaseService");

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

/**
 * ✅ Admin create driver
 */
const createDriver = async (req, res) => {
  try {
    const { driverId, name, phone, password, vehicleType, latitude, longitude } = req.body;

    if (!driverId || !phone || !password || !latitude || !longitude) {
      return res.status(400).json({ msg: "DriverId, phone, password, latitude, longitude required" });
    }

    const existing = await Driver.findOne({ $or: [{ driverId }, { phone }] });
    if (existing) {
      return res.status(400).json({ msg: "DriverId or Phone already exists" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);



    // Create driver with validation
const createDriverWithValidation = async (req, res) => {
  try {
    const {
      name,
      phone,
      password,
      vehicleType,
      vehicleNumber,
      email,
      dob,
      licenseNumber,
      aadharNumber,
      bankAccountNumber,
      ifscCode,
      latitude,
      longitude
    } = req.body;

    // Validate required fields
    if (!name || !phone || !password || !vehicleType || !vehicleNumber || !licenseNumber || !aadharNumber) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Validate Indian license number format
    const licenseRegex = /^[A-Z]{2}[0-9]{2}\s?[0-9]{11}$/;
    if (!licenseRegex.test(licenseNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid license number format. Expected format: XX00 00000000000'
      });
    }

    // Validate Aadhaar number format
    const aadharRegex = /^[2-9]{1}[0-9]{11}$/;
    if (!aadharRegex.test(aadharNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Aadhaar number format. Expected 12 digits starting with 2-9'
      });
    }

    // Check if phone, license, or Aadhaar already exists
    const existingDriver = await Driver.findOne({
      $or: [
        { phone },
        { licenseNumber },
        { aadharNumber }
      ]
    });

    if (existingDriver) {
      let conflictField = '';
      if (existingDriver.phone === phone) conflictField = 'phone number';
      else if (existingDriver.licenseNumber === licenseNumber) conflictField = 'license number';
      else if (existingDriver.aadharNumber === aadharNumber) conflictField = 'Aadhaar number';

      return res.status(400).json({
        success: false,
        message: `Driver with this ${conflictField} already exists`
      });
    }

    // Generate driver ID
    const driverId = await Driver.generateDriverId(vehicleNumber);

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create driver document
    const driver = new Driver({
      driverId,
      name,
      phone,
      passwordHash,
      email: email || '',
      dob: dob ? new Date(dob) : null,
      vehicleType,
      vehicleNumber,
      licenseNumber,
      aadharNumber,
      bankAccountNumber: bankAccountNumber || '',
      ifscCode: ifscCode || '',
      location: {
        type: "Point",
        coordinates: [longitude || 0, latitude || 0],
      },
      status: "Offline",
      active: true,
      mustChangePassword: true
    });

    await driver.save();

    console.log(`✅ Driver created successfully: ${driverId}`);

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: {
        driverId: driver.driverId,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        status: driver.status
      }
    });

  } catch (err) {
    console.error('❌ Error creating driver:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create driver',
      error: err.message
    });
  }
};

// Upload driver documents
const uploadDriverDocuments = async (req, res) => {
  try {
    const { driverId } = req.params;
    const files = req.files;

    console.log('📁 Uploading documents for driver:', driverId);
    console.log('📄 Files received:', files);

    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const updates = {};

    // Handle license document
    if (files && files.licenseDocument) {
      const licenseFile = files.licenseDocument[0];
      updates.licenseDocument = `/uploads/drivers/${driverId}/license_${Date.now()}${path.extname(licenseFile.originalname)}`;
      
      // Ensure directory exists
      const licenseDir = path.dirname(path.join(__dirname, '../../', updates.licenseDocument));
      if (!fs.existsSync(licenseDir)) {
        fs.mkdirSync(licenseDir, { recursive: true });
      }
      
      // Move file
      fs.renameSync(licenseFile.path, path.join(__dirname, '../../', updates.licenseDocument));
      console.log('✅ License document uploaded:', updates.licenseDocument);
    }

    // Handle Aadhaar document
    if (files && files.aadharDocument) {
      const aadharFile = files.aadharDocument[0];
      updates.aadharDocument = `/uploads/drivers/${driverId}/aadhar_${Date.now()}${path.extname(aadharFile.originalname)}`;
      
      // Ensure directory exists
      const aadharDir = path.dirname(path.join(__dirname, '../../', updates.aadharDocument));
      if (!fs.existsSync(aadharDir)) {
        fs.mkdirSync(aadharDir, { recursive: true });
      }
      
      // Move file
      fs.renameSync(aadharFile.path, path.join(__dirname, '../../', updates.aadharDocument));
      console.log('✅ Aadhaar document uploaded:', updates.aadharDocument);
    }

    // Update driver with document paths
    await Driver.findOneAndUpdate(
      { driverId },
      updates,
      { new: true }
    );

    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      data: updates
    });

  } catch (err) {
    console.error('❌ Error uploading documents:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to upload documents',
      error: err.message
    });
  }
};


    const driver = new Driver({
      driverId,
      name,
      phone,
      passwordHash,
      vehicleType: vehicleType || "taxi",
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
    });

    await driver.save();
    res.status(201).json({ msg: "Driver created", driverId: driver.driverId });
  } catch (err) {
    console.error("❌ Error creating driver:", err);
    res.status(400).json({ error: err.message });
  }
};

const loginDriver = async (req, res) => {
  try {
    const { driverId, password, latitude, longitude, fcmToken } = req.body;
    console.log(`🔑 Login attempt for driver: ${driverId}`);

    const driver = await Driver.findOne({ driverId: driverId });
    if (!driver) {
      console.log(`❌ Driver not found: ${driverId}`);
      return res.status(404).json({ msg: "Driver not found" });
    }

    const match = await bcrypt.compare(password, driver.passwordHash);
    if (!match) {
      console.log(`❌ Invalid password for driver: ${driverId}`);
      return res.status(401).json({ msg: "Invalid password" });
    }

    // Update driver location, status, and FCM token
    if (latitude && longitude) {
      driver.location = {
        type: "Point",
        coordinates: [longitude, latitude],
      };
      driver.status = "Live";
      driver.lastUpdate = new Date();
    }

    // Update FCM token if provided
    if (fcmToken) {
      driver.fcmToken = fcmToken;
      console.log(`✅ Updated FCM token for driver: ${driverId}`);
    }

    await driver.save();
    console.log(`✅ Driver ${driverId} logged in at [${latitude}, ${longitude}]`);

    const token = jwt.sign(
      { sub: driver._id, driverId: driver.driverId },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      mustChangePassword: driver.mustChangePassword,
      driver: {
        driverId: driver.driverId,
        name: driver.name,
        status: driver.status,
        vehicleType: driver.vehicleType,
        location: driver.location,
        fcmToken: driver.fcmToken,
      },
    });
  } catch (err) {
    console.error("❌ Error in loginDriver:", err);
    res.status(500).json({ error: err.message });
  }
};


const updateFCMToken = async (req, res) => {
  try {
    const { driverId } = req.user; // From auth middleware
    const { fcmToken, platform } = req.body;

    console.log('🔄 FCM Token Update in Controller:', { 
      driverId, 
      tokenLength: fcmToken ? fcmToken.length : 0 
    });

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required"
      });
    }

    // Find and update driver
    const driver = await Driver.findOneAndUpdate(
      { driverId: driverId }, // CRITICAL: Match by driverId field
      { 
        fcmToken: fcmToken,
        platform: platform || 'android',
        lastUpdate: new Date(),
        notificationEnabled: true
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: "Driver not found" 
      });
    }

    console.log(`✅ FCM token updated successfully for: ${driverId}`);

    res.json({ 
      success: true, 
      message: "FCM token updated successfully",
      driverId: driver.driverId,
      name: driver.name,
      tokenUpdated: true
    });
    
  } catch (error) {
    console.error('❌ Error updating FCM token in controller:', error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update FCM token",
      error: error.message 
    });
  }
};

const sendTestNotification = async (req, res) => {
  try {
    const { driverId } = req.user;
    
    const driver = await Driver.findOne({ driverId: driverId });
    if (!driver || !driver.fcmToken) {
      return res.status(404).json({
        success: false,
        message: "Driver not found or no FCM token"
      });
    }

    const testData = {
      type: "test_notification",
      message: "This is a test notification from backend",
      timestamp: new Date().toISOString(),
      driverId: driverId
    };

    const result = await sendNotificationToMultipleDrivers(
      [driver.fcmToken],
      "🧪 Test Notification",
      "This is a test notification from your backend server",
      testData
    );

    res.json({
      success: true,
      message: `Test notification sent: ${result.successCount} success, ${result.failureCount} failed`,
      result: result,
      driverToken: `${driver.fcmToken.substring(0, 20)}...`
    });

  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: "Failed to send test notification"
    });
  }
};

/**
 * ✅ Change password
 */
const changePassword = async (req, res) => {
  try {
    const { driverId, oldPassword, newPassword } = req.body;

 const driver = await Driver.findOne({ driverId: driverId });
    if (!driver) return res.status(404).json({ msg: "Driver not found" });

    const match = await bcrypt.compare(oldPassword, driver.passwordHash);
    if (!match) return res.status(400).json({ msg: "Old password incorrect" });

    driver.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    driver.mustChangePassword = false;
    await driver.save();

    res.json({ msg: "Password changed successfully" });
  } catch (err) {
    console.error("❌ Error in changePassword:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get all drivers
 */
const getDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find().sort({ createdAt: -1 });
    res.json(drivers);
  } catch (err) {
    console.error("❌ Error in getDrivers:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Update driver
 */
const updateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const update = { ...req.body };

    if (update.password || update.passwordHash) {
      delete update.password;
      delete update.passwordHash;
    }

    if (update.latitude && update.longitude) {
      update.location = {
        type: "Point",
        coordinates: [update.longitude, update.latitude],
      };
      delete update.latitude;
      delete update.longitude;
    }

    const driver = await Driver.findOneAndUpdate({ driverId }, update, { new: true });
    if (!driver) return res.status(404).json({ msg: "Driver not found" });

    res.json(driver);
  } catch (err) {
    console.error("❌ Error in updateDriver:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Delete driver
 */
const deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const deleted = await Driver.findOneAndDelete({ driverId });
    if (!deleted) return res.status(404).json({ msg: "Driver not found" });

    res.json({ msg: "Driver deleted" });
  } catch (err) {
    console.error("❌ Error in deleteDriver:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Nearest drivers
 */
const getNearestDrivers = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 5000 } = req.query;

    const drivers = await Driver.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] },
          $maxDistance: parseInt(maxDistance),
        },
      },
    });

    res.json(drivers);
  } catch (err) {
    console.error("❌ Error in getNearestDrivers:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Update location (protected)
 */
const updateLocation = async (req, res) => {
  try {
    const { driverId } = req.user;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ msg: "Latitude & longitude required" });
    }

    const driver = await Driver.findOneAndUpdate(
      { driverId },
      {
        location: { type: "Point", coordinates: [longitude, latitude] },
        status: "Live",
        lastUpdate: new Date(),
      },
      { new: true }
    );

    if (!driver) return res.status(404).json({ msg: "Driver not found" });

    res.json({ msg: "Location updated", location: driver.location, status: driver.status });
  } catch (err) {
    console.error("❌ Error in updateLocation:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Logout driver
 */
const logoutDriver = async (req, res) => {
  try {
    const { driverId } = req.user;

    const driver = await Driver.findOneAndUpdate(
      { driverId },
      { status: "Offline", logoutTime: new Date().toISOString() },
      { new: true }
    );

    res.json({ msg: "Driver logged out", driver });
  } catch (err) {
    console.error("❌ Error in logoutDriver:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get ride by ID
 */
const getRideById = async (req, res) => {
  try {
    const { rideId } = req.params;
    console.log(`🔍 Fetching ride with RAID_ID: ${rideId}`);

    const ride = await Ride.findOne({ RAID_ID: rideId })
      .populate("user", "name customerId phone")
      .populate("driver", "driverId name phone vehicleType");

    if (!ride) {
      console.log(`❌ Ride not found with RAID_ID: ${rideId}`);
      return res.status(404).json({ msg: "Ride not found" });
    }

    res.json({
      _id: ride._id,
      RAID_ID: ride.RAID_ID,
      customerId: ride.customerId,
      name: ride.name,
      pickupLocation: ride.pickupLocation,
      dropoffLocation: ride.dropoffLocation,
      pickupCoordinates: ride.pickupCoordinates,
      dropoffCoordinates: ride.dropoffCoordinates,
      fare: ride.fare,
      distance: ride.distance,
      status: ride.status,
      user: ride.user,
      driver: ride.driver,
    });
  } catch (err) {
    console.error("❌ Error in getRideById:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Update ride status
 */
const updateRideStatus = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { status } = req.body;
    const { driverId } = req.user;

    console.log(`🚗 Driver ${driverId} attempting to ${status} ride ${rideId}`);

    if (!["Accepted", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({ msg: "Invalid status" });
    }

    const ride = await Ride.findOne({ RAID_ID: rideId }).populate("user");
    if (!ride) return res.status(404).json({ msg: "Ride not found" });

    if (status === "Accepted") {
      if (ride.status !== "pending") {
        return res.status(400).json({ msg: "Ride already taken or completed" });
      }
      ride.driver = driverId;
    }

    if (status === "Cancelled") {
      ride.driver = null;
    }

    ride.status = status.toLowerCase();
    await ride.save();

    const io = req.app.get("io");
    if (io && ride.user) {
      io.to(ride.user._id.toString()).emit("rideStatusUpdate", {
        rideId: ride.RAID_ID,
        status: ride.status,
        driverId,
      });
    }

    res.json({
      msg: "Ride updated",
      ride: {
        _id: ride._id,
        RAID_ID: ride.RAID_ID,
        status: ride.status,
        user: ride.user,
        driver: ride.driver,
      },
    });
  } catch (err) {
    console.error("❌ Error in updateRideStatus:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createDriver,
  loginDriver,
  changePassword,
  updateRideStatus,
  updateLocation,
  getDrivers,
  updateDriver,
  deleteDriver,
  getNearestDrivers,
  logoutDriver,
  getRideById,
  updateFCMToken,
  sendTestNotification,
};