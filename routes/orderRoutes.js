// /Users/webasebrandings/Downloads/wsback-main/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

console.log('✅ Order routes file loaded');

// Simple test endpoints
router.get('/test-connection', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Order routes are working!',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-model', async (req, res) => {
  try {
    const Order = require('../models/Order');
    const orderCount = await Order.countDocuments();
    res.json({ 
      success: true, 
      message: 'Order model is working',
      orderCount
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Order model test failed'
    });
  }
});

// Get orders by customer ID (numeric)
router.get('/customer-id/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    console.log('📦 Order Routes: Fetching orders for customer ID:', customerId);

    const Order = require('../models/Order');
    const orders = await Order.find({ customerId }).sort({ createdAt: -1 });

    console.log(`✅ Order Routes: Found ${orders.length} orders for customer ${customerId}`);

    res.json({
      success: true,
      data: orders,
      message: `Found ${orders.length} orders`
    });

  } catch (error) {
    console.error('❌ Order Routes Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders'
    });
  }
});

// Get orders by user ID (MongoDB ObjectId or customerId)
router.get('/customer/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('📦 Order Routes: Fetching orders for user:', userId);

    const Order = require('../models/Order');
    let query = {};
    
    if (mongoose.Types.ObjectId.isValid(userId)) {
      query = { user: userId };
      console.log('🔍 Order Routes: Searching by MongoDB ObjectId');
    } else {
      query = { customerId: userId };
      console.log('🔍 Order Routes: Searching by customerId');
    }
    
    const orders = await Order.find(query).sort({ createdAt: -1 });

    console.log(`✅ Order Routes: Found ${orders.length} orders for ${userId}`);

    res.json({
      success: true,
      data: orders,
      message: `Found ${orders.length} orders`
    });

  } catch (error) {
    console.error('❌ Order Routes Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders'
    });
  }
});

// ✅ FIXED: Order creation endpoint that accepts customerId without userId
router.post('/create', async (req, res) => {
  console.log('🛒 ORDER CREATION ENDPOINT HIT ==================');
  
  try {
    const Order = require('../models/Order');
    const Registration = require('../models/user/Registration');
    
    const { 
      customerId, // Primary identifier
      userId,     // Optional - only for backward compatibility
      products, 
      deliveryAddress, 
      paymentMethod = 'card',
      useWallet = false 
    } = req.body;

    console.log('📦 Order creation request received:', { 
      customerId, 
      hasUserId: !!userId,
      productCount: products?.length || 0 
    });

    // ✅ IMPORTANT FIX: Accept EITHER customerId OR userId
    if (!customerId && !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either Customer ID or User ID is required' 
      });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid products array is required' 
      });
    }

    // ✅ Find user by customerId (primary) OR userId (fallback)
    let user;
    if (customerId) {
      user = await Registration.findOne({ customerId });
      console.log(`🔍 Searching user by customerId: ${customerId}`);
      
      if (!user && userId) {
        // Fallback to userId if customerId not found
        user = await Registration.findById(userId);
        console.log(`🔍 Falling back to userId: ${userId}`);
      }
    } else if (userId) {
      // If only userId provided
      user = await Registration.findById(userId);
      console.log(`🔍 Searching user by userId: ${userId}`);
    }
    
    if (!user) {
      console.error('❌ User not found with identifiers:', { customerId, userId });
      return res.status(404).json({ 
        success: false, 
        error: 'User not found. Please check your account details.' 
      });
    }

    console.log(`✅ User found: ${user.name} (CustomerID: ${user.customerId}, MongoDB ID: ${user._id})`);

    // ✅ Validate and calculate order totals
    let subtotal = 0;
    const validatedProducts = products.map((item, index) => {
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 1;
      subtotal += price * quantity;
      
      return {
        productId: item._id || `prod_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        name: item.name || 'Unknown Product',
        price: price,
        quantity: quantity,
        images: Array.isArray(item.images) ? item.images : [],
        category: item.category || 'General',
        description: item.description || ''
      };
    });

    const tax = subtotal * 0.08;
    const shipping = subtotal > 499 ? 0 : 5.99;
    const totalAmount = subtotal + tax + shipping;

    // ✅ Generate unique order ID
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const orderId = `ORD${timestamp}${randomSuffix}`;

    // ✅ Create order with proper structure
    const orderData = {
      orderId: orderId,
      user: user._id, // MongoDB ObjectId from found user
      customerId: user.customerId, // Numeric customer ID from found user
      customerName: user.name || 'Customer',
      customerPhone: user.phoneNumber || '',
      customerEmail: user.email || '',
      customerAddress: user.address || '',
      products: validatedProducts,
      totalAmount: totalAmount,
      subtotal: subtotal,
      tax: tax,
      shipping: shipping,
      deliveryAddress: deliveryAddress || {
        name: user.name || 'Customer',
        phone: user.phoneNumber || '',
        addressLine1: user.address || '',
        city: 'Unknown City',
        state: 'Unknown State', 
        pincode: '000000',
        country: 'India'
      },
      paymentMethod: useWallet ? 'wallet' : paymentMethod,
      status: 'order_confirmed',
      orderDate: new Date()
    };

    console.log('💾 Saving order to database...');

    // ✅ Save order with error handling
    const order = new Order(orderData);
    const savedOrder = await order.save();

    console.log('✅ ORDER CREATED SUCCESSFULLY!', {
      orderId: savedOrder.orderId,
      customerId: savedOrder.customerId,
      totalAmount: savedOrder.totalAmount
    });
    
    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: {
        orderId: savedOrder.orderId,
        totalAmount: savedOrder.totalAmount,
        status: savedOrder.status,
        orderDate: savedOrder.orderDate,
        customerId: savedOrder.customerId
      }
    });

  } catch (error) {
    console.error('❌ Order creation failed:', error);
    
    // ✅ Specific error handling
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error: ' + error.message
      });
    }
    
    if (error.code === 11000) {
      // Duplicate order ID, retry with new ID
      console.log('⚠️ Duplicate order ID, retrying...');
      // Remove orderId from req.body to force new generation
      delete req.body.orderId;
      return router.post('/create')(req, res); // Retry
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while creating order',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;


// // /Users/webasebrandings/Downloads/wsback-main/routes/orderRoutes.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');

// console.log('✅ Order routes file loaded');

// // Simple test endpoints
// router.get('/test-connection', (req, res) => {
//   res.json({ 
//     success: true, 
//     message: 'Order routes are working!',
//     timestamp: new Date().toISOString()
//   });
// });

// router.get('/test-model', async (req, res) => {
//   try {
//     const Order = require('../models/Order');
//     const orderCount = await Order.countDocuments();
//     res.json({ 
//       success: true, 
//       message: 'Order model is working',
//       orderCount
//     });
//   } catch (error) {
//     res.status(500).json({ 
//       success: false, 
//       error: 'Order model test failed'
//     });
//   }
// });

// // Get orders by customer ID (numeric)
// router.get('/customer-id/:customerId', async (req, res) => {
//   try {
//     const { customerId } = req.params;
//     console.log('📦 Order Routes: Fetching orders for customer ID:', customerId);

//     const Order = require('../models/Order');
//     const orders = await Order.find({ customerId }).sort({ createdAt: -1 });

//     console.log(`✅ Order Routes: Found ${orders.length} orders for customer ${customerId}`);

//     res.json({
//       success: true,
//       data: orders,
//       message: `Found ${orders.length} orders`
//     });

//   } catch (error) {
//     console.error('❌ Order Routes Error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to fetch orders'
//     });
//   }
// });

// // Get orders by user ID (MongoDB ObjectId or customerId)
// router.get('/customer/:userId', async (req, res) => {
//   try {
//     const { userId } = req.params;
//     console.log('📦 Order Routes: Fetching orders for user:', userId);

//     const Order = require('../models/Order');
//     let query = {};
    
//     if (mongoose.Types.ObjectId.isValid(userId)) {
//       query = { user: userId };
//       console.log('🔍 Order Routes: Searching by MongoDB ObjectId');
//     } else {
//       query = { customerId: userId };
//       console.log('🔍 Order Routes: Searching by customerId');
//     }
    
//     const orders = await Order.find(query).sort({ createdAt: -1 });

//     console.log(`✅ Order Routes: Found ${orders.length} orders for ${userId}`);

//     res.json({
//       success: true,
//       data: orders,
//       message: `Found ${orders.length} orders`
//     });

//   } catch (error) {
//     console.error('❌ Order Routes Error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to fetch orders'
//     });
//   }
// });

// // Order creation endpoint
// router.post('/create', async (req, res) => {
//   console.log('🛒 ORDER ROUTES: Order creation endpoint hit');
  
//   try {
//     const Order = require('../models/Order');
//     const Registration = require('../models/user/Registration');
    
//     const { 
//       userId, 
//       products, 
//       deliveryAddress, 
//       paymentMethod,
//       useWallet = false 
//     } = req.body;

//     console.log('📦 Order creation for user:', userId);

//     // Validation
//     if (!userId) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'User ID is required' 
//       });
//     }

//     if (!products || products.length === 0) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Products are required' 
//       });
//     }

//     // Get user
//     const user = await Registration.findById(userId);
//     if (!user) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'User not found' 
//       });
//     }

//     // Calculate totals
//     const subtotal = products.reduce((total, item) => total + (item.price * item.quantity), 0);
//     const tax = subtotal * 0.08;
//     const shipping = subtotal > 499 ? 0 : 5.99;
//     const totalAmount = subtotal + tax + shipping;

//     // Create order
//     const timestamp = Date.now();
//     const orderData = {
//       orderId: `ORD${timestamp}`,
//       user: userId,
//       customerId: user.customerId,
//       customerName: user.name,
//       customerPhone: user.phoneNumber,
//       customerEmail: user.email || '',
//       customerAddress: user.address,
//       products: products.map(item => ({
//         productId: item._id,
//         name: item.name,
//         price: item.price,
//         quantity: item.quantity,
//         images: item.images || [],
//         category: item.category || 'General'
//       })),
//       totalAmount,
//       subtotal,
//       tax,
//       shipping,
//       deliveryAddress: deliveryAddress || {
//         name: user.name,
//         phone: user.phoneNumber,
//         addressLine1: user.address,
//         city: 'City',
//         state: 'State', 
//         pincode: '000000',
//         country: 'India'
//       },
//       paymentMethod: useWallet ? 'wallet' : paymentMethod,
//       status: 'order_confirmed'
//     };

//     console.log('💾 Saving order via routes...');
//     const order = new Order(orderData);
//     await order.save();

//     console.log('✅ ORDER CREATED SUCCESSFULLY via routes!');
    
//     res.status(201).json({
//       success: true,
//       message: 'Order placed successfully',
//       data: {
//         orderId: order.orderId,
//         totalAmount: order.totalAmount,
//         status: order.status,
//         orderDate: order.orderDate
//       }
//     });

//   } catch (error) {
//     console.error('❌ Order creation failed via routes:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to create order',
//       details: error.message 
//     });
//   }
// });

// module.exports = router;


