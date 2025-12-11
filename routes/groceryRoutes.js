// /Users/webasebrandings/Downloads/u&d/exrabackend-main/routes/groceryRoutes.js
const express = require('express');
const router = express.Router();
const {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  deleteSelectedProducts,
  getCategories,
  updateStock
} = require('../controllers/groceryController');

// ✅ FIXED: Import multer properly
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Error handling middleware
const handleMulterErrors = (error, req, res, next) => {
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  next();
};

// ✅ PUBLIC ROUTES
router.get('/', getProducts); // GET /api/groceries
router.get('/categories', getCategories); // GET /api/groceries/categories

// ✅ PROTECTED ROUTES WITH FILE UPLOAD
router.post('/', upload.array('images', 5), handleMulterErrors, addProduct);
router.put('/:id', upload.array('images', 5), handleMulterErrors, updateProduct);
router.delete('/:id', deleteProduct);
router.post('/delete-selected', deleteSelectedProducts);
router.patch('/update-stock', updateStock);

module.exports = router;


// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const {
//   getProducts,
//   addProduct,
//   updateProduct,
//   deleteProduct,
//   deleteSelectedProducts,
//   getCategories,
//   updateStock
// } = require('../controllers/groceryController');

// const router = express.Router();

// // Multer configuration for file uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');
//   },
//   filename: (req, file, cb) => {
//     // Use original name with timestamp to avoid conflicts
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, uniqueSuffix + path.extname(file.originalname));
//   }
// });

// const upload = multer({ 
//   storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5MB limit
//     files: 5 // Maximum 5 files
//   },
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = /jpeg|jpg|png|gif|webp/;
//     const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//     const mimetype = allowedTypes.test(file.mimetype);

//     if (mimetype && extname) {
//       return cb(null, true);
//     } else {
//       cb(new Error('Only image files are allowed (JPEG, JPG, PNG, GIF, WEBP)'));
//     }
//   }
// });

// // Error handling middleware for Multer
// const handleMulterErrors = (error, req, res, next) => {
//   if (error instanceof multer.MulterError) {
//     if (error.code === 'LIMIT_FILE_COUNT') {
//       return res.status(400).json({
//         success: false,
//         error: 'Too many files. Maximum 5 images allowed.'
//       });
//     }
//     if (error.code === 'LIMIT_FILE_SIZE') {
//       return res.status(400).json({
//         success: false,
//         error: 'File too large. Maximum size is 5MB per image.'
//       });
//     }
//     if (error.code === 'LIMIT_UNEXPECTED_FILE') {
//       return res.status(400).json({
//         success: false,
//         error: 'Unexpected field. Please check file field names.'
//       });
//     }
//   }
  
//   if (error) {
//     return res.status(400).json({
//       success: false,
//       error: error.message
//     });
//   }
  
//   next();
// };



// // Add to /Users/webasebrandings/Downloads/u&d/exrabackend-main/routes/driverRoutes.js

// // ✅ GET DRIVER BY ID - FIXED ENDPOINT
// router.get('/get-by-id/:driverId', authMiddleware, async (req, res) => {
//   try {
//     const { driverId } = req.params;
//     console.log(`🔍 Fetching driver by ID: ${driverId}`);
    
//     const driver = await Driver.findOne({ driverId: driverId })
//       .select('-passwordHash -__v')
//       .lean();
    
//     if (!driver) {
//       console.log(`❌ Driver not found: ${driverId}`);
//       return res.status(404).json({
//         success: false,
//         message: "Driver not found"
//       });
//     }
    
//     console.log(`✅ Driver found: ${driver.name} (${driver.vehicleType})`);
    
//     res.json({
//       success: true,
//       driverId: driver.driverId,
//       name: driver.name,
//       phone: driver.phone,
//       email: driver.email || '',
//       vehicleType: driver.vehicleType,
//       vehicleNumber: driver.vehicleNumber || '',
//       wallet: driver.wallet || 0,
//       status: driver.status || 'Offline',
//       licenseNumber: driver.licenseNumber || '',
//       aadharNumber: driver.aadharNumber || '',
//       location: driver.location || { type: 'Point', coordinates: [0, 0] },
//       fcmToken: driver.fcmToken || '',
//       platform: driver.platform || 'android',
//       totalRides: driver.totalRides || 0,
//       rating: driver.rating || 0,
//       earnings: driver.earnings || 0,
//       createdAt: driver.createdAt,
//       lastUpdate: driver.lastUpdate
//     });
    
//   } catch (error) {
//     console.error("❌ Error fetching driver:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch driver data",
//       error: error.message
//     });
//   }
// });



// // Public routes
// router.get('/', getProducts);
// router.get('/categories', getCategories);

// // Protected routes with Multer error handling
// router.post('/', upload.array('images', 5), handleMulterErrors, addProduct);
// router.put('/:id', upload.array('images', 5), handleMulterErrors, updateProduct);
// router.delete('/:id', deleteProduct);
// router.post('/delete-selected', deleteSelectedProducts);
// router.patch('/update-stock', updateStock);

// module.exports = router;
