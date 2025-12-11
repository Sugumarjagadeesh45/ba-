const Product = require('../models/Product');
const path = require('path');
const fs = require('fs');

const getBackendUrl = () => {
  return process.env.BACKEND_URL || 'http://localhost:5001';
};




const getProducts = async (req, res) => {
  try {
    const { category, search } = req.query;
    
    let query = { isActive: true };
    
    if (category && category !== 'All') {
      query.category = category;
    }
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    const products = await Product.find(query).sort({ createdAt: -1 });
    
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
    
    const productsWithFullUrls = products.map(product => {
      const productData = product.toObject();
      
      // Fix image URLs
      if (productData.images && Array.isArray(productData.images)) {
        productData.images = productData.images.map(img => {
          if (!img) return '';
          if (img.startsWith('http')) return img;
          
          // Handle relative paths properly
          let cleanPath = img;
          if (cleanPath.startsWith('uploads/')) {
            cleanPath = '/' + cleanPath;
          }
          if (!cleanPath.startsWith('/uploads/')) {
            cleanPath = '/uploads/' + cleanPath.replace(/^\/+/, '');
          }
          
          return `${backendUrl}${cleanPath}`;
        }).filter(img => img !== '');
      } else {
        productData.images = [];
      }
      
      return productData;
    });
    
    res.json({
      success: true,
      data: productsWithFullUrls
    });
  } catch (err) {
    console.error('❌ Error fetching products:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error while fetching products' 
    });
  }
};

const addProduct = async (req, res) => {
  try {
    const { name, description, price, originalPrice, discount, category, stock } = req.body;
    const files = req.files;

    // Validate required fields
    if (!name || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        error: 'Name, description, price, and category are required'
      });
    }

    // Handle image paths
    const images = files ? files.map(file => `/uploads/${file.filename}`) : [];

    // Calculate discount
    const calculatedDiscount = discount || (originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0);

    // Generate productId
    let nextProductId = 1;
    try {
      const lastProduct = await Product.findOne({ 
        productId: { $exists: true, $ne: null } 
      }).sort({ productId: -1 }).limit(1);
      
      if (lastProduct && lastProduct.productId) {
        nextProductId = parseInt(lastProduct.productId) + 1;
      }
    } catch (error) {
      nextProductId = parseInt(Date.now().toString().slice(-6));
    }

    // Create product
    const productData = {
      productId: nextProductId,
      name,
      description,
      price: parseFloat(price),
      originalPrice: parseFloat(originalPrice || price),
      discount: parseFloat(calculatedDiscount),
      category,
      stock: stock ? parseInt(stock) : 0,
      images,
      status: 'available',
      isActive: true
    };

    const product = new Product(productData);
    const savedProduct = await product.save();

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      data: savedProduct
    });

  } catch (err) {
    console.error('❌ Error adding product:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: err.message
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Server error while adding product',
      details: err.message
    });
  }
};

const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, originalPrice, discount, category, stock } = req.body;
  const files = req.files;
  
  try {
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const updateData = { 
      name, 
      description, 
      price: parseFloat(price), 
      originalPrice: parseFloat(originalPrice || price), 
      discount: parseFloat(discount || 0), 
      category,
      stock: parseInt(stock) || 0
    };

    // Handle new images
    if (files && files.length > 0) {
      const newImages = files.map(file => `/uploads/${file.filename}`);
      updateData.images = newImages;
    }

    const product = await Product.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (err) {
    console.error('❌ Error updating product:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error while updating product',
      details: err.message
    });
  }
};

const deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findByIdAndDelete(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully',
      data: { _id: product._id, name: product.name }
    });
  } catch (err) {
    console.error('❌ Error deleting product:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error while deleting product',
      details: err.message
    });
  }
};

const deleteSelectedProducts = async (req, res) => {
  const { ids } = req.body;
  try {
    await Product.deleteMany({ _id: { $in: ids } });
    res.json({ 
      success: true,
      message: 'Selected products deleted successfully'
    });
  } catch (err) {
    console.error('❌ Error deleting selected products:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error while deleting products',
      details: err.message
    });
  }
};

const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category', { isActive: true });
    res.json({
      success: true,
      data: categories
    });
  } catch (err) {
    console.error('❌ Error fetching categories:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error while fetching categories',
      details: err.message
    });
  }
};

const updateStock = async (req, res) => {
  const { productId, quantity } = req.body;
  
  try {
    const product = await Product.findOne({ productId: parseInt(productId) });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock'
      });
    }

    product.stock -= quantity;
    await product.save();

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: product
    });
  } catch (err) {
    console.error('❌ Error updating stock:', err);
    res.status(500).json({
      success: false,
      error: 'Server error while updating stock',
      details: err.message
    });
  }
};

module.exports = { 
  getProducts, 
  addProduct, 
  updateProduct, 
  deleteProduct, 
  deleteSelectedProducts,
  getCategories,
  updateStock
};
















// const Product = require('../models/Product');
// const path = require('path');
// const fs = require('fs');

// const getBackendUrl = () => {
//   return process.env.BACKEND_URL || 'http://localhost:5001';
// };

// const getProducts = async (req, res) => {
//   const { category, search } = req.query;
//   try {
//     let query = { isActive: true };
    
//     if (category && category !== 'All') {
//       query.category = category;
//     }
    
//     if (search) {
//       query.name = { $regex: search, $options: 'i' };
//     }
    
//     const products = await Product.find(query).sort({ productId: -1 });
    
//     // FIXED: Safe mapping with proper array checks
//     const productsWithFullUrls = products.map(product => {
//       const productData = product.toObject();
      
//       // Log productId for debugging
//       if (!productData.productId) {
//         console.warn(`⚠️ Product ${product._id} missing productId`);
//       } else {
//         console.log(`✅ Product ${productData.name} has productId: ${productData.productId}`);
//       }
      
//       // FIXED: Safe image URL handling with array validation
//       if (productData.images && Array.isArray(productData.images)) {
//         productData.images = productData.images.map(img => {
//           if (!img) return '';
          
//           // If already a full URL, return as is
//           if (img.startsWith('http')) {
//             return img;
//           }
          
//           // Handle relative paths
//           const cleanImgPath = img.startsWith('/') ? img.slice(1) : img;
//           return `${getBackendUrl()}/${cleanImgPath}`;
//         }).filter(img => img !== '');
//       } else {
//         // If images is not an array, set to empty array
//         productData.images = [];
//       }
      
//       return productData;
//     });
    
//     console.log(`✅ Fetched ${productsWithFullUrls.length} products`);
    
//     res.json({
//       success: true,
//       data: productsWithFullUrls
//     });
//   } catch (err) {
//     console.error('❌ Error fetching products:', err);
//     res.status(500).json({ 
//       success: false,
//       error: 'Server error while fetching products' 
//     });
//   }
// };

// const addProduct = async (req, res) => {
//   try {
//     const { name, description, price, originalPrice, discount, category, stock } = req.body;
//     const files = req.files;

//     console.log('📦 Adding product request received:');
//     console.log('  Body:', { name, description, price, category, stock });
//     console.log('  Files received:', files ? files.length : 0);

//     // Validate required fields
//     if (!name || !description || !price || !category || !stock) {
//       return res.status(400).json({
//         success: false,
//         error: 'All fields are required'
//       });
//     }

//     // Validate image count
//     if (files && files.length > 5) {
//       return res.status(400).json({
//         success: false,
//         error: 'Too many images. Maximum 5 images allowed.'
//       });
//     }

//     // Handle file uploads - ensure proper path format
//     const images = files ? files.map(file => `uploads/${file.filename}`) : [];

//     console.log('🖼️ Images paths to save:', images);

//     // Calculate discount if not provided
//     const calculatedDiscount = discount || (originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0);

//     // Generate productId
//     let nextProductId = 1;
//     try {
//       const lastProduct = await Product.findOne({ 
//         productId: { $exists: true, $ne: null } 
//       }).sort({ productId: -1 }).limit(1);
      
//       console.log('🔍 Last product found:', lastProduct ? `ID: ${lastProduct.productId}` : 'None');
      
//       if (lastProduct && lastProduct.productId) {
//         nextProductId = parseInt(lastProduct.productId) + 1;
//       }
      
//       console.log(`✅ Next productId will be: ${nextProductId}`);
//     } catch (error) {
//       console.error('❌ Error finding last product:', error);
//       nextProductId = parseInt(Date.now().toString().slice(-6));
//       console.log(`🔄 Using fallback productId: ${nextProductId}`);
//     }

//     // Create product with explicit productId
//     const productData = {
//       productId: nextProductId,
//       name,
//       description,
//       price: parseFloat(price),
//       originalPrice: parseFloat(originalPrice || price),
//       discount: parseFloat(calculatedDiscount),
//       category,
//       stock: parseInt(stock),
//       images
//     };

//     console.log('📝 Creating product with data:', productData);

//     const product = new Product(productData);
//     const savedProduct = await product.save();

//     console.log('✅ Product added successfully:', {
//       productId: savedProduct.productId,
//       name: savedProduct.name,
//       imagesCount: savedProduct.images.length
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Product added successfully',
//       data: savedProduct
//     });

//   } catch (err) {
//     console.error('❌ Error adding product:', err);
    
//     if (err.name === 'ValidationError') {
//       const errors = Object.values(err.errors).map(error => error.message);
//       return res.status(400).json({
//         success: false,
//         error: 'Validation failed',
//         details: errors
//       });
//     }
    
//     // Handle duplicate productId error
//     if (err.code === 11000 && err.keyPattern && err.keyPattern.productId) {
//       console.log('🔄 Duplicate productId detected, generating new ID...');
//       return res.status(400).json({
//         success: false,
//         error: 'Duplicate product ID. Please try again.'
//       });
//     }
    
//     res.status(500).json({ 
//       success: false,
//       error: 'Server error while adding product',
//       details: err.message
//     });
//   }
// };

// const updateProduct = async (req, res) => {
//   const { id } = req.params;
//   const { name, description, price, originalPrice, discount, category, stock } = req.body;
//   const files = req.files;
  
//   console.log('🔄 Updating product:', id);
//   console.log('📁 Files for update:', files ? files.length : 0);
//   console.log('📝 Update data:', { name, description, price, category, stock });
  
//   try {
//     // Validate image count
//     if (files && files.length > 5) {
//       return res.status(400).json({
//         success: false,
//         error: 'Too many images. Maximum 5 images allowed.'
//       });
//     }

//     // Get the existing product to check for existing images
//     const existingProduct = await Product.findById(id);
//     if (!existingProduct) {
//       return res.status(404).json({
//         success: false,
//         error: 'Product not found'
//       });
//     }

//     const updateData = { 
//       name, 
//       description, 
//       price: parseFloat(price), 
//       originalPrice: parseFloat(originalPrice || price), 
//       discount: parseFloat(discount || 0), 
//       category,
//       stock: parseInt(stock)
//     };

//     // Handle new image uploads - only if files are provided
//     if (files && files.length > 0) {
//       const newImages = files.map(file => `uploads/${file.filename}`);
      
//       // If we want to replace all images:
//       updateData.images = newImages;
      
//       // If we want to add to existing images:
//       // updateData.images = [...(existingProduct.images || []), ...newImages];
      
//       console.log('🖼️ New images added:', newImages);
//     } else {
//       console.log('ℹ️  No new images provided, keeping existing images');
//       // Don't modify images field if no new files are uploaded
//     }

//     const product = await Product.findByIdAndUpdate(
//       id, 
//       updateData, 
//       { new: true, runValidators: true }
//     );
    
//     console.log('✅ Product updated successfully:', {
//       productId: product.productId,
//       name: product.name,
//       imagesCount: product.images.length
//     });

//     res.json({
//       success: true,
//       message: 'Product updated successfully',
//       data: product
//     });
//   } catch (err) {
//     console.error('❌ Error updating product:', err);
    
//     res.status(500).json({ 
//       success: false,
//       error: 'Server error while updating product',
//       details: err.message
//     });
//   }
// };

// const deleteProduct = async (req, res) => {
//   const { id } = req.params;
//   try {
//     const product = await Product.findByIdAndDelete(id);
    
//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         error: 'Product not found'
//       });
//     }

//     res.json({
//       success: true,
//       message: 'Product deleted successfully',
//       data: { _id: product._id, name: product.name }
//     });
//   } catch (err) {
//     console.error('❌ Error deleting product:', err);
//     res.status(500).json({ 
//       success: false,
//       error: 'Server error while deleting product',
//       details: err.message
//     });
//   }
// };

// const deleteSelectedProducts = async (req, res) => {
//   const { ids } = req.body;
//   try {
//     await Product.deleteMany({ _id: { $in: ids } });
//     res.json({ 
//       success: true,
//       message: 'Selected products deleted successfully'
//     });
//   } catch (err) {
//     console.error('❌ Error deleting selected products:', err);
//     res.status(500).json({ 
//       success: false,
//       error: 'Server error while deleting products',
//       details: err.message
//     });
//   }
// };

// const getCategories = async (req, res) => {
//   try {
//     const categories = await Product.distinct('category', { isActive: true });
//     res.json({
//       success: true,
//       data: categories
//     });
//   } catch (err) {
//     console.error('❌ Error fetching categories:', err);
//     res.status(500).json({ 
//       success: false,
//       error: 'Server error while fetching categories',
//       details: err.message
//     });
//   }
// };

// const updateStock = async (req, res) => {
//   const { productId, quantity } = req.body;
  
//   try {
//     const product = await Product.findOne({ productId: parseInt(productId) });
    
//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         error: 'Product not found'
//       });
//     }

//     if (product.stock < quantity) {
//       return res.status(400).json({
//         success: false,
//         error: 'Insufficient stock'
//       });
//     }

//     product.stock -= quantity;
//     await product.save();

//     res.json({
//       success: true,
//       message: 'Stock updated successfully',
//       data: product
//     });
//   } catch (err) {
//     console.error('❌ Error updating stock:', err);
//     res.status(500).json({
//       success: false,
//       error: 'Server error while updating stock',
//       details: err.message
//     });
//   }
// };

// module.exports = { 
//   getProducts, 
//   addProduct, 
//   updateProduct, 
//   deleteProduct, 
//   deleteSelectedProducts,
//   getCategories,
//   updateStock
// };