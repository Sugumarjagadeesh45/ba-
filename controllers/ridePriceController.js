// In your ridePriceController.js - Remove default initialization
const RidePrice = require('../models/RidePrice');

// Global variable to store current prices - START WITH ZEROS
let currentPrices = {
  bike: 0,
  taxi: 0,
  port: 0
};

// Function to log current prices to console
const logCurrentPrices = () => {
  console.log('\n🚗 ===== CURRENT RIDE PRICES =====');
  console.log(`🏍️  BIKE: Today's price per km: ₹${currentPrices.bike}`);
  console.log(`🚕 TAXI: Today's price per km: ₹${currentPrices.taxi}`);
  console.log(`🚛 PORT: Today's price per km: ₹${currentPrices.port}`);
  console.log('=================================\n');
};

// Initialize prices on server start - ONLY FROM DATABASE
const initializePrices = async () => {
  try {
    console.log('🚗 Initializing ride price system...');
    const prices = await RidePrice.getAllPrices();
    if (Object.keys(prices).length > 0) {
      currentPrices = prices;
      console.log('✅ Prices loaded from database');
    } else {
      console.log('⏳ No prices found in database - Waiting for admin to set prices');
      currentPrices = { bike: 0, taxi: 0, port: 0 };
    }
    logCurrentPrices();
  } catch (error) {
    console.error('❌ Error initializing prices:', error);
    currentPrices = { bike: 0, taxi: 0, port: 0 };
    logCurrentPrices();
  }
};

// Get all ride prices
exports.getRidePrices = async (req, res) => {
  try {
    console.log('📋 Fetching all ride prices');
    const prices = await RidePrice.getAllPrices();
    
    // Update current prices
    if (Object.keys(prices).length > 0) {
      currentPrices = prices;
    } else {
      currentPrices = { bike: 0, taxi: 0, port: 0 };
    }
    
    logCurrentPrices();
    
    res.json({
      success: true,
      prices: prices,
      message: 'Ride prices fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching ride prices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ride prices',
      error: error.message
    });
  }
};



// In ridePriceController.js - Update the updateRidePrices function
exports.updateRidePrices = async (req, res) => {
  try {
    const { prices } = req.body;
    
    console.log('\n💾 ADMIN UPDATING RIDE PRICES:', prices);

    // Validate input
    if (!prices || typeof prices !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid prices data'
      });
    }

    // Validate each price
    for (const [vehicleType, price] of Object.entries(prices)) {
      if (!['bike', 'taxi', 'port'].includes(vehicleType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid vehicle type: ${vehicleType}`
        });
      }
      
      if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid price for ${vehicleType}: must be a positive number`
        });
      }
      
      // Additional validation for reasonable prices
      if (price > 1000) {
        return res.status(400).json({
          success: false,
          message: `Price for ${vehicleType} seems too high. Please set a reasonable price.`
        });
      }
    }

    // Update prices in database
    const updatedPrices = await RidePrice.updatePrices(prices);
    currentPrices = updatedPrices;
    
    // Real-time price update logging
    console.log('\n✅ ===== RIDE PRICES UPDATED SUCCESSFULLY =====');
    console.log(`🏍️  BIKE: Today's price per km: ₹${currentPrices.bike}`);
    console.log(`🚕 TAXI: Today's price per km: ₹${currentPrices.taxi}`);
    console.log(`🚛 PORT: Today's price per km: ₹${currentPrices.port}`);
    console.log('=============================================\n');
    
    // Broadcast to all connected clients via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('priceUpdate', currentPrices);
      io.emit('currentPrices', currentPrices);
      console.log('📡 Price update broadcasted to all connected clients');
      
      // Also call the broadcast function from socket.js
      try {
        const socketModule = require('../socket');
        const socketIO = socketModule.getIO();
        socketIO.emit('priceUpdate', currentPrices);
        socketIO.emit('currentPrices', currentPrices);
      } catch (socketError) {
        console.error('❌ Error broadcasting via socket module:', socketError);
      }
    }

    res.json({
      success: true,
      prices: updatedPrices,
      message: 'Ride prices updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating ride prices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ride prices',
      error: error.message
    });
  }
};


// // In your ridePriceController.js - Update the calculateRidePrice function
// exports.calculateRidePrice = async (vehicleType, distance) => {
//   try {
//     console.log(`💰 BACKEND CALCULATING PRICE: ${distance}km for ${vehicleType}`);
    
//     // Get the price from database
//     const priceDoc = await RidePrice.findOne({ 
//       vehicleType, 
//       isActive: true 
//     });
    
//     console.log(`📊 Database price document for ${vehicleType}:`, priceDoc);
    
//     // ✅ NO DEFAULT FALLBACK - Only use database prices
//     if (!priceDoc) {
//       console.log(`⏳ No price found for ${vehicleType} in database, cannot calculate price`);
//       return 0;
//     }
    
//     const pricePerKm = priceDoc.pricePerKm;
//     const totalPrice = distance * pricePerKm;
//     const roundedPrice = Math.round(totalPrice * 100) / 100;
    
//     console.log(`💰 BACKEND PRICE CALCULATION: ${distance}km ${vehicleType} × ₹${pricePerKm}/km = ₹${roundedPrice}`);
    
//     return roundedPrice;
//   } catch (error) {
//     console.error('❌ Error calculating ride price in backend:', error);
//     return 0;
//   }
// };
// In controllers/ridePriceController.js
exports.calculateRidePrice = async (vehicleType, distanceKm) => {
  try {
    console.log(`💰 Calculating price for ${distanceKm}km ${vehicleType}`);
    
    // Get current prices
    const prices = await RidePrice.findOne({});
    
    if (!prices) {
      console.log('❌ No ride prices found in database');
      return distanceKm * 10; // Default fallback
    }
    
    let pricePerKm = 0;
    
    // Make sure we're using UPPERCASE
    const type = vehicleType.toUpperCase();
    
    switch(type) {
      case 'BIKE':
        pricePerKm = prices.bike || 15;
        break;
      case 'TAXI':
        pricePerKm = prices.taxi || 40;
        break;
      case 'PORT':
        pricePerKm = prices.port || 75;
        break;
      default:
        pricePerKm = 10;
    }
    
    console.log(`📊 Price per km for ${type}: ₹${pricePerKm}`);
    
    const total = distanceKm * pricePerKm;
    console.log(`✅ Calculated total: ${distanceKm}km × ₹${pricePerKm} = ₹${total}`);
    
    return Math.round(total);
  } catch (error) {
    console.error('❌ Error calculating ride price:', error);
    return distanceKm * 10; // Fallback
  }
};





exports.getCurrentPrices = () => {
  return currentPrices;
};

// Export the initialize function
exports.initializePrices = initializePrices;

// Initialize prices when module loads
initializePrices();

// // In your ridePriceController.js - Remove default initialization
// const RidePrice = require('../../models/admin/RidePrice');

// // Global variable to store current prices - START WITH ZEROS
// let currentPrices = {
//   bike: 0,
//   taxi: 0,
//   port: 0
// };

// // Function to log current prices to console
// const logCurrentPrices = () => {
//   console.log('\n🚗 ===== CURRENT RIDE PRICES =====');
//   console.log(`🏍️  BIKE: Today's price per km: ₹${currentPrices.bike}`);
//   console.log(`🚕 TAXI: Today's price per km: ₹${currentPrices.taxi}`);
//   console.log(`🚛 PORT: Today's price per km: ₹${currentPrices.port}`);
//   console.log('=================================\n');
// };

// // Initialize prices on server start - ONLY FROM DATABASE
// const initializeDefaultPrices = async () => {
//   try {
//     const prices = await RidePrice.getAllPrices();
//     if (Object.keys(prices).length > 0) {
//       currentPrices = prices;
//       console.log('✅ Prices loaded from database');
//     } else {
//       console.log('⏳ No prices found in database - Waiting for admin to set prices');
//       currentPrices = { bike: 0, taxi: 0, port: 0 };
//     }
//     logCurrentPrices();
//   } catch (error) {
//     console.error('❌ Error initializing prices:', error);
//     currentPrices = { bike: 0, taxi: 0, port: 0 };
//     logCurrentPrices();
//   }
// };

// // Get all ride prices
// exports.getRidePrices = async (req, res) => {
//   try {
//     console.log('📋 Fetching all ride prices');
//     const prices = await RidePrice.getAllPrices();
    
//     // Update current prices
//     if (Object.keys(prices).length > 0) {
//       currentPrices = prices;
//     } else {
//       currentPrices = { bike: 0, taxi: 0, port: 0 };
//     }
    
//     logCurrentPrices();
    
//     res.json({
//       success: true,
//       prices: prices,
//       message: 'Ride prices fetched successfully'
//     });
//   } catch (error) {
//     console.error('❌ Error fetching ride prices:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch ride prices',
//       error: error.message
//     });
//   }
// };

// // Update ride prices - ONLY USE WHAT ADMIN SETS
// exports.updateRidePrices = async (req, res) => {
//   try {
//     const { prices } = req.body;
    
//     console.log('\n💾 ADMIN UPDATING RIDE PRICES:', prices);

//     // Validate input
//     if (!prices || typeof prices !== 'object') {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid prices data'
//       });
//     }

//     // Validate each price
//     for (const [vehicleType, price] of Object.entries(prices)) {
//       if (!['bike', 'taxi', 'port'].includes(vehicleType)) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid vehicle type: ${vehicleType}`
//         });
//       }
      
//       if (typeof price !== 'number' || price < 0) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid price for ${vehicleType}: must be a positive number`
//         });
//       }
//     }

//     // Update prices in database
//     const updatedPrices = await RidePrice.updatePrices(prices);
//     currentPrices = updatedPrices;
    
//     // Real-time price update logging
//     console.log('\n✅ ===== RIDE PRICES UPDATED SUCCESSFULLY =====');
//     console.log(`🏍️  BIKE: Today's price per km: ₹${currentPrices.bike}`);
//     console.log(`🚕 TAXI: Today's price per km: ₹${currentPrices.taxi}`);
//     console.log(`🚛 PORT: Today's price per km: ₹${currentPrices.port}`);
//     console.log('=============================================\n');
    
//     // Broadcast to all connected clients via Socket.IO
//     const io = req.app.get('io');
//     if (io) {
//       io.emit('priceUpdate', currentPrices);
//       io.emit('currentPrices', currentPrices);
//       console.log('📡 Price update broadcasted to all connected clients');
//     }

//     res.json({
//       success: true,
//       prices: updatedPrices,
//       message: 'Ride prices updated successfully'
//     });
//   } catch (error) {
//     console.error('❌ Error updating ride prices:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to update ride prices',
//       error: error.message
//     });
//   }
// };

// // Calculate ride price - ONLY USE DATABASE PRICES
// exports.calculateRidePrice = async (vehicleType, distance) => {
//   try {
//     console.log(`💰 CALCULATING PRICE: ${distance}km for ${vehicleType}`);
    
//     const priceDoc = await RidePrice.findOne({ 
//       vehicleType, 
//       isActive: true 
//     });
    
//     // ✅ NO DEFAULT FALLBACK - Wait for admin prices
//     if (!priceDoc) {
//       console.log(`⏳ No price found for ${vehicleType}, waiting for admin to set prices`);
//       return 0;
//     }
    
//     const pricePerKm = priceDoc.pricePerKm;
//     const totalPrice = distance * pricePerKm;
    
//     console.log(`💰 PRICE CALCULATION: ${distance}km ${vehicleType} × ₹${pricePerKm}/km = ₹${totalPrice}`);
    
//     return Math.round(totalPrice * 100) / 100;
//   } catch (error) {
//     console.error('❌ Error calculating ride price:', error);
//     return 0; // Return 0 instead of defaults
//   }
// };
// exports.getCurrentPrices = () => {
//   return currentPrices;
// };


// // Export the initialize function
// exports.initializePrices = initializePrices;