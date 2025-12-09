const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  deleteSelectedProducts,
  getCategories,
  updateStock
} = require('../controllers/groceryController');

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Use original name with timestamp to avoid conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, JPG, PNG, GIF, WEBP)'));
    }
  }
});

// Error handling middleware for Multer
const handleMulterErrors = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum 5 images allowed.'
      });
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 5MB per image.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Unexpected field. Please check file field names.'
      });
    }
  }
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  
  next();
};

// Public routes
router.get('/', getProducts);
router.get('/categories', getCategories);

// Protected routes with Multer error handling
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
//     cb(null, Date.now() + path.extname(file.originalname));
//   }
// });

// // In /Users/webasebrandings/Downloads/cmp_back-main/routes/groceryRoutes.js

// // Update the multer configuration
// const upload = multer({ 
//   storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = /jpeg|jpg|png|gif|webp/;
//     const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//     const mimetype = allowedTypes.test(file.mimetype);

//     if (mimetype && extname) {
//       return cb(null, true);
//     } else {
//       cb(new Error('Only image files are allowed'));
//     }
//   }
// });

// // Update the PUT route to handle the update properly
// router.put('/:id', upload.array('images', 5), updateProduct);

// // Public routes
// router.get('/', getProducts);
// router.get('/categories', getCategories);

// // Protected routes (add auth middleware if needed)
// router.post('/', upload.array('images', 5), addProduct);
// router.put('/:id', upload.array('images', 5), updateProduct);
// router.delete('/:id', deleteProduct);
// router.post('/delete-selected', deleteSelectedProducts);
// router.patch('/update-stock', updateStock);

// module.exports = router;