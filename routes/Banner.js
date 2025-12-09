// /Users/webasebrandings/Downloads/cmp_back-main/routes/Banner.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bannerController = require('../controllers/Banner');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads');
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'banner-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});


// Add these routes to /Users/webasebrandings/Downloads/cmp_back-main/routes/Banner.js

// Get all banners for admin
router.get('/admin/all', bannerController.getAllBanners);

// Get products for dropdown
router.get('/products', bannerController.getProductsForDropdown);

// Get categories for dropdown
router.get('/categories', bannerController.getCategoriesForDropdown);


// Banner routes
router.post('/', upload.single('bannerImage'), bannerController.createBanner);
router.get('/', bannerController.getAllBanners);
router.get('/:id', bannerController.getBannerById);
router.put('/:id', upload.single('bannerImage'), bannerController.updateBanner);
router.delete('/:id', bannerController.deleteBanner);
router.patch('/:id/toggle-status', bannerController.toggleBannerStatus);

module.exports = router;