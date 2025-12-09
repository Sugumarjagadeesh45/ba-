// /Users/webasebrandings/Downloads/cmp_back-main/controllers/Banner.js
const Banner = require('../models/Banner');
const Product = require('../models/Product');
const path = require('path');
const fs = require('fs');

// In /Users/webasebrandings/Downloads/cmp_back-main/controllers/Banner.js

// Create new banner
exports.createBanner = async (req, res) => {
  try {
    const { targetType, targetId, customUrl, title, description, isActive, endDate, displayOrder } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Banner image is required'
      });
    }

    // Validate target type
    if (!['product', 'category', 'custom'].includes(targetType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid target type'
      });
    }

    // Validate product/category exists if targetType is product/category
    if (targetType === 'product' && targetId) {
      const Product = require('../models/Product');
      const product = await Product.findById(targetId);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }
    }

    // Validate custom URL if targetType is custom
    if (targetType === 'custom' && !customUrl) {
      return res.status(400).json({
        success: false,
        error: 'Custom URL is required for custom target type'
      });
    }

    const bannerData = {
      bannerImage: `/uploads/${req.file.filename}`,
      targetType,
      title: title || '',
      description: description || '',
      isActive: isActive !== undefined ? isActive : true,
      displayOrder: displayOrder || 0
    };

    // Only add targetId or customUrl if they're provided
    if (targetType === 'custom') {
      if (customUrl) bannerData.customUrl = customUrl;
    } else {
      if (targetId) bannerData.targetId = targetId;
    }

    if (endDate) {
      bannerData.endDate = new Date(endDate);
    }

    const banner = new Banner(bannerData);
    await banner.save();

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: banner
    });

  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create banner'
    });
  }
};

// Get all banners
exports.getAllBanners = async (req, res) => {
  try {
    const { activeOnly } = req.query;
    
    let query = {};
    if (activeOnly === 'true') {
      query.isActive = true;
      query.$or = [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gte: new Date() } }
      ];
    }

    const banners = await Banner.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    // Populate product/category details if needed
    const populatedBanners = await Promise.all(
      banners.map(async (banner) => {
        if (banner.targetType === 'product' && banner.targetId) {
          try {
            const product = await Product.findById(banner.targetId).select('name images price').lean();
            if (product) {
              banner.targetProduct = product;
            }
          } catch (error) {
            console.error('Error populating product:', error);
          }
        }
        return banner;
      })
    );

    res.json({
      success: true,
      data: populatedBanners
    });

  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch banners'
    });
  }
};

// Get single banner
exports.getBannerById = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      });
    }

    res.json({
      success: true,
      data: banner
    });

  } catch (error) {
    console.error('Error fetching banner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch banner'
    });
  }
};

// Update banner
exports.updateBanner = async (req, res) => {
  try {
    const { targetType, targetId, customUrl, title, description, isActive, endDate, displayOrder } = req.body;
    
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      });
    }

    // Update fields
    if (targetType) banner.targetType = targetType;
    if (targetId) banner.targetId = targetId;
    if (customUrl) banner.customUrl = customUrl;
    if (title !== undefined) banner.title = title;
    if (description !== undefined) banner.description = description;
    if (isActive !== undefined) banner.isActive = isActive;
    if (endDate !== undefined) banner.endDate = endDate;
    if (displayOrder !== undefined) banner.displayOrder = displayOrder;

    // Handle new image upload
    if (req.file) {
      // Delete old image if exists
      if (banner.bannerImage) {
        const oldImagePath = path.join(__dirname, '..', banner.bannerImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      banner.bannerImage = `/uploads/${req.file.filename}`;
    }

    await banner.save();

    res.json({
      success: true,
      message: 'Banner updated successfully',
      data: banner
    });

  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update banner'
    });
  }
};

// Add these methods to /Users/webasebrandings/Downloads/cmp_back-main/controllers/Banner.js

// Get products for dropdown
exports.getProductsForDropdown = async (req, res) => {
  try {
    const Product = require('../models/Product');
    const products = await Product.find({ isActive: true })
      .select('_id name images price')
      .sort({ name: 1 })
      .lean();
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching products for dropdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
};

// Get categories for dropdown
exports.getCategoriesForDropdown = async (req, res) => {
  try {
    const Product = require('../models/Product');
    const categories = await Product.distinct('category', { isActive: true });
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories for dropdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
};

// Delete banner
exports.deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      });
    }

    // Delete associated image
    if (banner.bannerImage) {
      const imagePath = path.join(__dirname, '..', banner.bannerImage);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await Banner.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete banner'
    });
  }
};

// Toggle banner status
exports.toggleBannerStatus = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    res.json({
      success: true,
      message: `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`,
      data: banner
    });

  } catch (error) {
    console.error('Error toggling banner status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle banner status'
    });
  }
};



// // /Users/webasebrandings/Downloads/cmp_back-main/controllers/Banner.js
// const Banner = require('../models/Banner');
// const Product = require('../models/Product');
// const path = require('path');
// const fs = require('fs');

// // In /Users/webasebrandings/Downloads/cmp_back-main/controllers/Banner.js

// // Create new banner
// exports.createBanner = async (req, res) => {
//   try {
//     const { targetType, targetId, customUrl, title, description, isActive, endDate, displayOrder } = req.body;
    
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         error: 'Banner image is required'
//       });
//     }

//     // Validate target type
//     if (!['product', 'category', 'custom'].includes(targetType)) {
//       return res.status(400).json({
//         success: false,
//         error: 'Invalid target type'
//       });
//     }

//     // Validate product/category exists if targetType is product/category
//     if (targetType === 'product' && targetId) {
//       const Product = require('../models/Product');
//       const product = await Product.findById(targetId);
//       if (!product) {
//         return res.status(404).json({
//           success: false,
//           error: 'Product not found'
//         });
//       }
//     }

//     // Validate custom URL if targetType is custom
//     if (targetType === 'custom' && !customUrl) {
//       return res.status(400).json({
//         success: false,
//         error: 'Custom URL is required for custom target type'
//       });
//     }

//     const bannerData = {
//       bannerImage: `/uploads/${req.file.filename}`,
//       targetType,
//       title: title || '',
//       description: description || '',
//       isActive: isActive !== undefined ? isActive : true,
//       displayOrder: displayOrder || 0
//     };

//     // Only add targetId or customUrl if they're provided
//     if (targetType === 'custom') {
//       if (customUrl) bannerData.customUrl = customUrl;
//     } else {
//       if (targetId) bannerData.targetId = targetId;
//     }

//     if (endDate) {
//       bannerData.endDate = new Date(endDate);
//     }

//     const banner = new Banner(bannerData);
//     await banner.save();

//     res.status(201).json({
//       success: true,
//       message: 'Banner created successfully',
//       data: banner
//     });

//   } catch (error) {
//     console.error('Error creating banner:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to create banner'
//     });
//   }
// };
// // Get all banners
// exports.getAllBanners = async (req, res) => {
//   try {
//     const { activeOnly } = req.query;
    
//     let query = {};
//     if (activeOnly === 'true') {
//       query.isActive = true;
//       query.$or = [
//         { endDate: { $exists: false } },
//         { endDate: null },
//         { endDate: { $gte: new Date() } }
//       ];
//     }

//     const banners = await Banner.find(query)
//       .sort({ displayOrder: 1, createdAt: -1 })
//       .lean();

//     // Populate product/category details if needed
//     const populatedBanners = await Promise.all(
//       banners.map(async (banner) => {
//         if (banner.targetType === 'product' && banner.targetId) {
//           try {
//             const product = await Product.findById(banner.targetId).select('name images price').lean();
//             if (product) {
//               banner.targetProduct = product;
//             }
//           } catch (error) {
//             console.error('Error populating product:', error);
//           }
//         }
//         return banner;
//       })
//     );

//     res.json({
//       success: true,
//       data: populatedBanners
//     });

//   } catch (error) {
//     console.error('Error fetching banners:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch banners'
//     });
//   }
// };

// // Get single banner
// exports.getBannerById = async (req, res) => {
//   try {
//     const banner = await Banner.findById(req.params.id);
    
//     if (!banner) {
//       return res.status(404).json({
//         success: false,
//         error: 'Banner not found'
//       });
//     }

//     res.json({
//       success: true,
//       data: banner
//     });

//   } catch (error) {
//     console.error('Error fetching banner:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch banner'
//     });
//   }
// };

// // Update banner
// exports.updateBanner = async (req, res) => {
//   try {
//     const { targetType, targetId, customUrl, title, description, isActive, endDate, displayOrder } = req.body;
    
//     const banner = await Banner.findById(req.params.id);
//     if (!banner) {
//       return res.status(404).json({
//         success: false,
//         error: 'Banner not found'
//       });
//     }

//     // Update fields
//     if (targetType) banner.targetType = targetType;
//     if (targetId) banner.targetId = targetId;
//     if (customUrl) banner.customUrl = customUrl;
//     if (title !== undefined) banner.title = title;
//     if (description !== undefined) banner.description = description;
//     if (isActive !== undefined) banner.isActive = isActive;
//     if (endDate !== undefined) banner.endDate = endDate;
//     if (displayOrder !== undefined) banner.displayOrder = displayOrder;

//     // Handle new image upload
//     if (req.file) {
//       // Delete old image if exists
//       if (banner.bannerImage) {
//         const oldImagePath = path.join(__dirname, '..', banner.bannerImage);
//         if (fs.existsSync(oldImagePath)) {
//           fs.unlinkSync(oldImagePath);
//         }
//       }
//       banner.bannerImage = `/uploads/${req.file.filename}`;
//     }

//     await banner.save();

//     res.json({
//       success: true,
//       message: 'Banner updated successfully',
//       data: banner
//     });

//   } catch (error) {
//     console.error('Error updating banner:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to update banner'
//     });
//   }
// };



// // Add these methods to /Users/webasebrandings/Downloads/cmp_back-main/controllers/Banner.js

// // Get products for dropdown
// exports.getProductsForDropdown = async (req, res) => {
//   try {
//     const Product = require('../models/Product');
//     const products = await Product.find({ isActive: true })
//       .select('_id name images price')
//       .sort({ name: 1 })
//       .lean();
    
//     res.json({
//       success: true,
//       data: products
//     });
//   } catch (error) {
//     console.error('Error fetching products for dropdown:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch products'
//     });
//   }
// };

// // Get categories for dropdown
// exports.getCategoriesForDropdown = async (req, res) => {
//   try {
//     const Product = require('../models/Product');
//     const categories = await Product.distinct('category', { isActive: true });
    
//     res.json({
//       success: true,
//       data: categories
//     });
//   } catch (error) {
//     console.error('Error fetching categories for dropdown:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch categories'
//     });
//   }
// };



// // Delete banner
// exports.deleteBanner = async (req, res) => {
//   try {
//     const banner = await Banner.findById(req.params.id);
    
//     if (!banner) {
//       return res.status(404).json({
//         success: false,
//         error: 'Banner not found'
//       });
//     }

//     // Delete associated image
//     if (banner.bannerImage) {
//       const imagePath = path.join(__dirname, '..', banner.bannerImage);
//       if (fs.existsSync(imagePath)) {
//         fs.unlinkSync(imagePath);
//       }
//     }

//     await Banner.findByIdAndDelete(req.params.id);

//     res.json({
//       success: true,
//       message: 'Banner deleted successfully'
//     });

//   } catch (error) {
//     console.error('Error deleting banner:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to delete banner'
//     });
//   }
// };

// // Toggle banner status
// exports.toggleBannerStatus = async (req, res) => {
//   try {
//     const banner = await Banner.findById(req.params.id);
    
//     if (!banner) {
//       return res.status(404).json({
//         success: false,
//         error: 'Banner not found'
//       });
//     }

//     banner.isActive = !banner.isActive;
//     await banner.save();

//     res.json({
//       success: true,
//       message: `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`,
//       data: banner
//     });

//   } catch (error) {
//     console.error('Error toggling banner status:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to toggle banner status'
//     });
//   }
// };