// controllers/adminController.js
const Registration = require('../models/user/Registration');
const Driver = require('../models/driver/driver');
const Ride = require('../models/ride');
const Order = require('../models/Order');
const Product = require('../models/Product');






// Admin update order status
exports.adminUpdateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    console.log(`🔄 Admin updating order ${orderId} to status: ${status}`);

    const validStatuses = [
      'pending', 'order_confirmed', 'processing', 'preparing', 
      'packed', 'shipped', 'out_for_delivery', 'delivered', 
      'cancelled', 'returned', 'refunded'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status' 
      });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    // Update status and save
    order.status = status;
    await order.save();

    console.log(`✅ Order ${orderId} status updated to ${status} by admin`);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        orderId: order.orderId,
        status: order.status,
        customerId: order.customerId,
        customerName: order.customerName
      }
    });

  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update order status' 
    });
  }
};


// Get dashboard data
exports.getDashboardData = async (req, res) => {
  try {
    console.log('📊 Fetching dashboard data...');
    
    // Get counts
    const totalUsers = await Registration.countDocuments();
    const totalDrivers = await Driver.countDocuments();
    const totalRides = await Ride.countDocuments();
    const totalOrders = await Order.countDocuments();

    const dashboardData = {
      stats: {
        totalUsers,
        usersChange: "+12.5%",
        drivers: totalDrivers,
        driversChange: "+8.2%",
        totalRides,
        ridesChange: "+15.3%",
        productSales: totalOrders,
        salesChange: "+22.1%"
      },
      weeklyPerformance: [
        { name: 'Mon', rides: 45, orders: 32 },
        { name: 'Tue', rides: 52, orders: 38 },
        { name: 'Wed', rides: 48, orders: 41 },
        { name: 'Thu', rides: 60, orders: 45 },
        { name: 'Fri', rides: 75, orders: 52 },
        { name: 'Sat', rides: 82, orders: 61 },
        { name: 'Sun', rides: 68, orders: 48 }
      ],
      recentActivities: [
        {
          type: 'ride',
          title: 'New ride booked',
          description: 'John Doe booked a ride',
          timeAgo: '2 minutes ago',
          icon: 'ride'
        },
        {
          type: 'order',
          title: 'New order placed',
          description: 'Order #ORD100001 placed',
          timeAgo: '5 minutes ago',
          icon: 'grocery'
        }
      ]
    };

    res.json({ success: true, data: dashboardData });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const users = await Registration.find().select('-passwordHash');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all drivers
exports.getDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find().select('-passwordHash');
    res.json({ success: true, data: drivers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create driver
exports.createDriverWithValidation = async (req, res) => {
  try {
    const driverData = req.body;
    // Add your driver creation logic here
    res.json({ success: true, message: 'Driver created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Upload driver documents (placeholder)
exports.uploadDriverDocuments = async (req, res) => {
  try {
    res.json({ success: true, message: 'Documents uploaded' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Toggle driver status
exports.toggleDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    driver.status = driver.status === 'Live' ? 'Offline' : 'Live';
    await driver.save();

    res.json({ 
      success: true, 
      message: `Driver status updated to ${driver.status}`,
      data: driver 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all rides
exports.getRides = async (req, res) => {
  try {
    const rides = await Ride.find()
      .populate('user', 'name phoneNumber')
      .populate('driver', 'name driverId');
    res.json({ success: true, data: rides });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Assign ride
exports.assignRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { driverId } = req.body;
    
    // Add your ride assignment logic here
    res.json({ success: true, message: 'Ride assigned' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Adjust user points
exports.adjustUserPoints = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    
    const user = await Registration.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.wallet = (user.wallet || 0) + amount;
    await user.save();

    res.json({ success: true, message: 'Points adjusted', wallet: user.wallet });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Adjust grocery stock
exports.adjustGroceryStock = async (req, res) => {
  try {
    const { itemId, change } = req.body;
    
    const product = await Product.findById(itemId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    product.stock += change;
    if (product.stock < 0) product.stock = 0;
    await product.save();

    res.json({ success: true, message: 'Stock updated', product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};



// const Registration = require('../models/user/Registration');
// const Driver = require('../models/driver/driver');
// const Ride = require('../models/ride');
// const Order = require('../models/Order');
// const Product = require('../models/Product');

// // Get dashboard data
// exports.getDashboardData = async (req, res) => {
//   try {
//     console.log('📊 Fetching real dashboard data...');
    
//     // Get all statistics in parallel
//     const [
//       userStats,
//       driverStats,
//       rideStats,
//       orderStats,
//       recentActivities
//     ] = await Promise.all([
//       getUserStats(),
//       getDriverStats(),
//       getRideStats(),
//       getOrderStats(),
//       getRecentActivities()
//     ]);

//     const dashboardData = {
//       stats: {
//         totalUsers: userStats.totalUsers,
//         usersChange: userStats.usersChange,
//         drivers: driverStats.totalDrivers,
//         driversChange: driverStats.driversChange,
//         totalRides: rideStats.totalRides,
//         ridesChange: rideStats.ridesChange,
//         productSales: orderStats.totalSales,
//         salesChange: orderStats.salesChange
//       },
//       weeklyPerformance: getWeeklyPerformance(),
//       yearlyTrends: getYearlyTrends(),
//       serviceDistribution: getServiceDistribution(),
//       recentActivities: recentActivities,
//       salesDistribution: getSalesDistribution()
//     };

//     console.log('✅ Dashboard data fetched successfully');
//     res.json({
//       success: true,
//       data: dashboardData
//     });
//   } catch (error) {
//     console.error('❌ Error fetching dashboard data:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch dashboard data',
//       details: error.message
//     });
//   }
// };

// // Helper functions
// async function getUserStats() {
//   try {
//     const totalUsers = await Registration.countDocuments();
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const newUsersToday = await Registration.countDocuments({
//       createdAt: { $gte: today }
//     });
    
//     return {
//       totalUsers,
//       usersChange: calculatePercentageChange(newUsersToday, totalUsers)
//     };
//   } catch (error) {
//     console.error('Error getting user stats:', error);
//     return { totalUsers: 0, usersChange: '+0%' };
//   }
// }

// async function getDriverStats() {
//   try {
//     const totalDrivers = await Driver.countDocuments();
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const newDriversToday = await Driver.countDocuments({
//       createdAt: { $gte: today }
//     });
    
//     return {
//       totalDrivers,
//       driversChange: calculatePercentageChange(newDriversToday, totalDrivers)
//     };
//   } catch (error) {
//     console.error('Error getting driver stats:', error);
//     return { totalDrivers: 0, driversChange: '+0%' };
//   }
// }

// async function getRideStats() {
//   try {
//     const totalRides = await Ride.countDocuments();
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const ridesToday = await Ride.countDocuments({
//       createdAt: { $gte: today }
//     });
    
//     // Calculate total revenue
//     const revenueResult = await Ride.aggregate([
//       { $match: { status: 'completed' } },
//       { $group: { _id: null, totalRevenue: { $sum: '$fare' } } }
//     ]);
    
//     const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    
//     return {
//       totalRides,
//       ridesChange: calculatePercentageChange(ridesToday, totalRides),
//       totalRevenue
//     };
//   } catch (error) {
//     console.error('Error getting ride stats:', error);
//     return { totalRides: 0, ridesChange: '+0%', totalRevenue: 0 };
//   }
// }

// async function getOrderStats() {
//   try {
//     const totalOrders = await Order.countDocuments();
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const ordersToday = await Order.countDocuments({
//       createdAt: { $gte: today }
//     });
    
//     // Calculate total sales
//     const salesResult = await Order.aggregate([
//       { $match: { status: 'delivered' } },
//       { $group: { _id: null, totalSales: { $sum: '$totalAmount' } } }
//     ]);
    
//     const totalSales = salesResult.length > 0 ? salesResult[0].totalSales : 0;
    
//     return {
//       totalOrders,
//       ordersToday,
//       totalSales,
//       salesChange: calculatePercentageChange(ordersToday, totalOrders)
//     };
//   } catch (error) {
//     console.error('Error getting order stats:', error);
//     return { totalOrders: 0, ordersToday: 0, totalSales: 0, salesChange: '+0%' };
//   }
// }

// function calculatePercentageChange(newValue, totalValue) {
//   if (totalValue === 0) return '+0%';
//   const percentage = (newValue / totalValue) * 100;
//   return `+${percentage.toFixed(1)}%`;
// }

// function getWeeklyPerformance() {
//   // Sample data - replace with actual aggregation
//   return [
//     { name: 'Mon', rides: 45, orders: 32 },
//     { name: 'Tue', rides: 52, orders: 38 },
//     { name: 'Wed', rides: 48, orders: 41 },
//     { name: 'Thu', rides: 60, orders: 45 },
//     { name: 'Fri', rides: 75, orders: 52 },
//     { name: 'Sat', rides: 82, orders: 61 },
//     { name: 'Sun', rides: 68, orders: 48 }
//   ];
// }

// function getYearlyTrends() {
//   // Sample data - replace with actual aggregation
//   return [
//     { month: 'Jan', rides: 1200, orders: 850 },
//     { month: 'Feb', rides: 1350, orders: 920 },
//     { month: 'Mar', rides: 1420, orders: 980 },
//     { month: 'Apr', rides: 1280, orders: 870 },
//     { month: 'May', rides: 1560, orders: 1100 },
//     { month: 'Jun', rides: 1680, orders: 1250 },
//     { month: 'Jul', rides: 1750, orders: 1320 },
//     { month: 'Aug', rides: 1820, orders: 1400 },
//     { month: 'Sep', rides: 1650, orders: 1280 },
//     { month: 'Oct', rides: 1580, orders: 1200 },
//     { month: 'Nov', rides: 1720, orders: 1350 },
//     { month: 'Dec', rides: 1950, orders: 1520 }
//   ];
// }

// function getServiceDistribution() {
//   return [
//     { name: 'Taxi', value: 45, color: '#6366f1' },
//     { name: 'Bike', value: 25, color: '#8b5cf6' },
//     { name: 'Sedan', value: 15, color: '#ec4899' },
//     { name: 'SUV', value: 10, color: '#14b8a6' },
//     { name: 'Mini', value: 5, color: '#f59e0b' }
//   ];
// }

// function getSalesDistribution() {
//   return { riders: 65, grocery: 35 };
// }

// async function getRecentActivities() {
//   try {
//     const recentRides = await Ride.find()
//       .populate('user', 'name')
//       .sort({ createdAt: -1 })
//       .limit(3);

//     const recentOrders = await Order.find()
//       .populate('user', 'name')
//       .sort({ createdAt: -1 })
//       .limit(2);

//     const activities = [];

//     // Add ride activities
//     recentRides.forEach(ride => {
//       activities.push({
//         type: 'ride',
//         title: 'New ride booked',
//         description: `${ride.name} booked a ride from ${ride.pickupLocation} to ${ride.dropoffLocation}`,
//         timestamp: ride.createdAt,
//         icon: 'ride',
//         timeAgo: getTimeAgo(ride.createdAt)
//       });
//     });

//     // Add order activities
//     recentOrders.forEach(order => {
//       activities.push({
//         type: 'order',
//         title: 'New order placed',
//         description: `Order #${order.orderId} placed for groceries`,
//         timestamp: order.createdAt,
//         icon: 'grocery',
//         timeAgo: getTimeAgo(order.createdAt)
//       });
//     });

//     // Sort by timestamp and return
//     return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

//   } catch (error) {
//     console.error('Error fetching recent activities:', error);
//     return [
//       {
//         type: 'ride',
//         title: 'New ride booked',
//         description: 'John Doe booked a ride from Downtown to Airport',
//         timeAgo: '2 minutes ago',
//         icon: 'ride'
//       },
//       {
//         type: 'order',
//         title: 'New order placed',
//         description: 'Order #ORD100001 placed for groceries',
//         timeAgo: '5 minutes ago',
//         icon: 'grocery'
//       },
//       {
//         type: 'user',
//         title: 'New user registered',
//         description: 'Michael Johnson joined EAZYGO',
//         timeAgo: '10 minutes ago',
//         icon: 'user'
//       },
//       {
//         type: 'driver',
//         title: 'New driver registered',
//         description: 'Robert Williams joined as a driver',
//         timeAgo: '15 minutes ago',
//         icon: 'driver'
//       }
//     ];
//   }
// }

// function getTimeAgo(timestamp) {
//   const now = new Date();
//   const timeDiff = now - new Date(timestamp);
//   const minutes = Math.floor(timeDiff / (1000 * 60));
//   const hours = Math.floor(timeDiff / (1000 * 60 * 60));
//   const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

//   if (minutes < 1) return 'Just now';
//   if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
//   if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
//   return `${days} day${days > 1 ? 's' : ''} ago`;
// }

// // Get all users
// exports.getUsers = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     const users = await Registration.find()
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .select('-passwordHash');

//     const total = await Registration.countDocuments();

//     res.json({
//       success: true,
//       data: users,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(total / limit),
//         totalUsers: total,
//         usersPerPage: limit
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching users:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch users'
//     });
//   }
// };

// // Get all drivers
// exports.getDrivers = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     const drivers = await Driver.find()
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .select('-passwordHash');

//     const total = await Driver.countDocuments();

//     res.json({
//       success: true,
//       data: drivers,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(total / limit),
//         totalDrivers: total,
//         driversPerPage: limit
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching drivers:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch drivers'
//     });
//   }
// };

// // Create driver with validation
// exports.createDriverWithValidation = async (req, res) => {
//   try {
//     const {
//       name,
//       phone,
//       password,
//       vehicleType,
//       vehicleNumber,
//       email,
//       dob,
//       licenseNumber,
//       aadharNumber,
//       bankAccountNumber,
//       ifscCode,
//       latitude,
//       longitude
//     } = req.body;

//     // Validate required fields
//     if (!name || !phone || !password || !vehicleType || !vehicleNumber || !licenseNumber || !aadharNumber) {
//       return res.status(400).json({
//         success: false,
//         message: 'All required fields must be provided'
//       });
//     }

//     // Validate Indian license number format
//     const licenseRegex = /^[A-Z]{2}[0-9]{2}\s?[0-9]{11}$/;
//     if (!licenseRegex.test(licenseNumber)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid license number format. Expected format: XX00 00000000000'
//       });
//     }

//     // Validate Aadhaar number format
//     const aadharRegex = /^[2-9]{1}[0-9]{11}$/;
//     if (!aadharRegex.test(aadharNumber)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid Aadhaar number format. Expected 12 digits starting with 2-9'
//       });
//     }

//     // Check if phone, license, or Aadhaar already exists
//     const existingDriver = await Driver.findOne({
//       $or: [
//         { phone },
//         { licenseNumber },
//         { aadharNumber }
//       ]
//     });

//     if (existingDriver) {
//       let conflictField = '';
//       if (existingDriver.phone === phone) conflictField = 'phone number';
//       else if (existingDriver.licenseNumber === licenseNumber) conflictField = 'license number';
//       else if (existingDriver.aadharNumber === aadharNumber) conflictField = 'Aadhaar number';

//       return res.status(400).json({
//         success: false,
//         message: `Driver with this ${conflictField} already exists`
//       });
//     }

//     // Generate driver ID from vehicle number
//     const vehicleNum = vehicleNumber.replace(/\D/g, '').slice(-4);
//     const driverId = `dri${vehicleNum}`;

//     // Hash password
//     const bcrypt = require('bcryptjs');
//     const passwordHash = await bcrypt.hash(password, 12);

//     // Create driver document
//     const driver = new Driver({
//       driverId,
//       name,
//       phone,
//       passwordHash,
//       email: email || '',
//       dob: dob ? new Date(dob) : null,
//       vehicleType,
//       vehicleNumber,
//       licenseNumber,
//       aadharNumber,
//       bankAccountNumber: bankAccountNumber || '',
//       ifscCode: ifscCode || '',
//       location: {
//         type: "Point",
//         coordinates: [longitude || 0, latitude || 0],
//       },
//       status: "Offline",
//       active: true,
//       mustChangePassword: true
//     });

//     await driver.save();

//     console.log(`✅ Driver created successfully: ${driverId}`);

//     res.status(201).json({
//       success: true,
//       message: 'Driver created successfully',
//       data: {
//         driverId: driver.driverId,
//         name: driver.name,
//         phone: driver.phone,
//         vehicleType: driver.vehicleType,
//         vehicleNumber: driver.vehicleNumber,
//         status: driver.status
//       }
//     });

//   } catch (err) {
//     console.error('❌ Error creating driver:', err);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to create driver',
//       error: err.message
//     });
//   }
// };

// // Toggle driver status
// exports.toggleDriverStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
    
//     const driver = await Driver.findById(id);
//     if (!driver) {
//       return res.status(404).json({
//         success: false,
//         error: 'Driver not found'
//       });
//     }

//     driver.status = driver.status === 'Live' ? 'Offline' : 'Live';
//     await driver.save();

//     res.json({
//       success: true,
//       message: `Driver status updated to ${driver.status}`,
//       data: driver
//     });
//   } catch (error) {
//     console.error('Error toggling driver status:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to update driver status'
//     });
//   }
// };

// // Get all rides
// exports.getRides = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     const rides = await Ride.find()
//       .populate('user', 'name phoneNumber customerId')
//       .populate('driver', 'name driverId vehicleType')
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit);

//     const total = await Ride.countDocuments();

//     res.json({
//       success: true,
//       data: rides,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(total / limit),
//         totalRides: total,
//         ridesPerPage: limit
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching rides:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch rides'
//     });
//   }
// };

// // Assign ride to driver
// exports.assignRide = async (req, res) => {
//   try {
//     const { rideId } = req.params;
//     const { driverId } = req.body;

//     const ride = await Ride.findOne({ RAID_ID: rideId });
//     if (!ride) {
//       return res.status(404).json({
//         success: false,
//         error: 'Ride not found'
//       });
//     }

//     const driver = await Driver.findOne({ driverId });
//     if (!driver) {
//       return res.status(404).json({
//         success: false,
//         error: 'Driver not found'
//       });
//     }

//     ride.driver = driver._id;
//     ride.status = 'accepted';
//     await ride.save();

//     res.json({
//       success: true,
//       message: 'Ride assigned successfully',
//       data: ride
//     });
//   } catch (error) {
//     console.error('Error assigning ride:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to assign ride'
//     });
//   }
// };  
// // Adjust user points
// exports.adjustUserPoints = async (req, res) => {
//   try {
//     const { amount } = req.body;
//     const user = await User.findById(req.params.id);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     user.wallet.points += amount;
//     if (user.wallet.points < 0) user.wallet.points = 0;
//     await user.save();

//     res.json({ message: 'Points updated', wallet: user.wallet });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Adjust grocery stock
// exports.adjustGroceryStock = async (req, res) => {
//   try {
//     const { itemId, change } = req.body;
//     const item = await GroceryItem.findById(itemId);
//     if (!item) return res.status(404).json({ message: 'Grocery item not found' });

//     item.stock += change;
//     if (item.stock < 0) item.stock = 0;
//     await item.save();

//     res.json({ message: 'Stock updated', grocery: item });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };
