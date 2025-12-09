const express = require("express");
const router = express.Router();
const ridePriceController = require("../controllers/ridePriceController");
const RidePrice = require("../models/RidePrice");

// Get all ride prices - FIXED PATH
router.get("/", ridePriceController.getRidePrices);

// Update ride prices - FIXED PATH  
router.post("/", ridePriceController.updateRidePrices);

// Price calculation verification
router.get("/verify-calculation", async (req, res) => {
  try {
    const { vehicleType, distance } = req.query;
    
    console.log(`🔍 Verifying price calculation for ${distance}km ${vehicleType}`);
    
    if (!vehicleType || !distance) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle type and distance are required'
      });
    }

    const distanceKm = parseFloat(distance);
    const price = await ridePriceController.calculateRidePrice(vehicleType, distanceKm);
    
    // Get the price per km from database for verification
    const priceDoc = await RidePrice.findOne({ vehicleType, isActive: true });
    
    res.json({
      success: true,
      calculation: {
        vehicleType,
        distance: distanceKm,
        pricePerKm: priceDoc ? priceDoc.pricePerKm : 0,
        totalPrice: price,
        formula: `${distanceKm}km × ₹${priceDoc ? priceDoc.pricePerKm : 0}/km = ₹${price}`
      },
      message: 'Price calculation verified'
    });
  } catch (error) {
    console.error('❌ Error verifying price calculation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify price calculation',
      error: error.message
    });
  }
});

// Initialize default prices (for development)
router.post("/initialize", async (req, res) => {
  try {
    await ridePriceController.initializeDefaultPrices();
    res.json({
      success: true,
      message: 'Default prices initialized successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to initialize default prices',
      error: error.message
    });
  }
});

module.exports = router;



// const express = require("express");
// const router = express.Router();
// const ridePriceController = require("../controllers/ridePriceController");
// const RidePrice = require("../models/RidePrice");

// // Get all ride prices
// router.get("/ride-prices", ridePriceController.getRidePrices);

// // Update ride prices
// router.post("/ride-prices", ridePriceController.updateRidePrices);


// // In ridePriceRoutes.js - Add a verification endpoint
// router.get("/ride-prices/verify-calculation", async (req, res) => {
//   try {
//     const { vehicleType, distance } = req.query;
    
//     console.log(`🔍 Verifying price calculation for ${distance}km ${vehicleType}`);
    
//     if (!vehicleType || !distance) {
//       return res.status(400).json({
//         success: false,
//         message: 'Vehicle type and distance are required'
//       });
//     }

//     const distanceKm = parseFloat(distance);
//     const price = await ridePriceController.calculateRidePrice(vehicleType, distanceKm);
    
//     // Get the price per km from database for verification
//     const priceDoc = await RidePrice.findOne({ vehicleType, isActive: true });
    
//     res.json({
//       success: true,
//       calculation: {
//         vehicleType,
//         distance: distanceKm,
//         pricePerKm: priceDoc ? priceDoc.pricePerKm : 0,
//         totalPrice: price,
//         formula: `${distanceKm}km × ₹${priceDoc ? priceDoc.pricePerKm : 0}/km = ₹${price}`
//       },
//       message: 'Price calculation verified'
//     });
//   } catch (error) {
//     console.error('❌ Error verifying price calculation:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to verify price calculation',
//       error: error.message
//     });
//   }
// });



// // Initialize default prices (for development)
// router.post("/ride-prices/initialize", async (req, res) => {
//   try {
//     await ridePriceController.initializeDefaultPrices();
//     res.json({
//       success: true,
//       message: 'Default prices initialized successfully'
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Failed to initialize default prices',
//       error: error.message
//     });
//   }
// });

// module.exports = router;