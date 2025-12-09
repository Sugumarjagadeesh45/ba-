// /Users/webasebrandings/Downloads/wsback-main/controllers/orderController.js
const Order = require('../models/Order');
const Registration = require('../models/user/Registration');


// In /Users/webasebrandings/Downloads/wsback-main/controllers/orderController.js

exports.createOrder = async (req, res) => {
  console.log('🛒 ORDER CREATION STARTED ==================');
  
  try {
    const { 
      userId, 
      products, 
      deliveryAddress, 
      paymentMethod,
      useWallet = false 
    } = req.body;

    // Enhanced validation
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required' 
      });
    }

    // Get user details with proper customerId
    const user = await Registration.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // ✅ CRITICAL: Ensure customerId exists
    if (!user.customerId) {
      console.log('⚠️ User has no customerId, generating one...');
      // Generate customerId if missing
      const Counter = require('../models/user/customerId');
      const counter = await Counter.findOneAndUpdate(
        { _id: 'customerId' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      user.customerId = (100000 + counter.sequence).toString();
      await user.save();
      console.log(`✅ Generated customerId: ${user.customerId}`);
    }

    console.log(`✅ User found: ${user.name} (CustomerID: ${user.customerId})`);

    // ... rest of your order creation code
  } catch (error) {
    console.error('❌ ORDER CREATION FAILED:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create order',
      details: error.message 
    });
  }
};




// Get orders for customer - UPDATED METHOD
exports.getCustomerOrders = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('📦 Fetching orders for user:', userId);

    // Validate user ID
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid user ID is required' 
      });
    }

    // Get user to verify existence and get customerId
    const Registration = require('../models/user/Registration');
    const user = await Registration.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    console.log(`🔍 User found: ${user.name} (CustomerID: ${user.customerId})`);

    // Find orders by user ID OR customerId for backward compatibility
    const orders = await Order.find({ 
      $or: [
        { user: userId },
        { customerId: user.customerId }
      ]
    })
    .sort({ createdAt: -1 })
    .lean(); // Use lean() for better performance

    console.log(`✅ Found ${orders.length} orders for user ${userId}`);

    // Format orders with proper data
    const formattedOrders = orders.map(order => {
      // Ensure products array exists and has proper structure
      const safeProducts = (order.products || []).map(product => ({
        _id: product._id || product.productId,
        name: product.name || 'Unknown Product',
        price: product.price || 0,
        quantity: product.quantity || 1,
        images: product.images || [],
        category: product.category || 'General',
        description: product.description || ''
      }));

      // Ensure delivery address exists
      const safeDeliveryAddress = order.deliveryAddress || {
        name: order.customerName || user.name,
        phone: order.customerPhone || user.phoneNumber,
        addressLine1: order.customerAddress || user.address,
        city: 'Unknown City',
        state: 'Unknown State',
        pincode: '000000',
        country: 'India'
      };

      return {
        _id: order._id,
        orderId: order.orderId,
        status: order.status || 'order_confirmed',
        totalAmount: order.totalAmount || 0,
        subtotal: order.subtotal || 0,
        shipping: order.shipping || 0,
        tax: order.tax || 0,
        products: safeProducts,
        deliveryAddress: safeDeliveryAddress,
        paymentMethod: order.paymentMethod || 'cash',
        orderDate: order.orderDate || order.createdAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    });

    res.json({
      success: true,
      data: formattedOrders,
      message: `Found ${formattedOrders.length} orders`
    });

  } catch (error) {
    console.error('❌ Error fetching customer orders:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
};




// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    console.log(`🔄 Updating order ${orderId} to status: ${status}`);

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    order.status = status;
    await order.save();

    console.log(`✅ Order ${orderId} status updated to ${status}`);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        orderId: order.orderId,
        status: order.status
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

// Get all orders for admin
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('user', 'name phoneNumber email address customerId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalOrders = await Order.countDocuments(query);


    // In getAllOrders method, update the cleanOrders mapping
const cleanOrders = orders.map(order => ({
  orderId: order.orderId,
  customerId: order.customerId, // ✅ Add this line
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  customerEmail: order.customerEmail,
  customerAddress: order.customerAddress,
  products: order.products.map(product => ({
    name: product.name,
    price: product.price,
    quantity: product.quantity,
    total: product.price * product.quantity,
    category: product.category
  })),
  totalAmount: order.totalAmount,
  status: order.status,
  paymentMethod: order.paymentMethod,
  orderDate: order.orderDate,
  deliveryAddress: order.deliveryAddress
}));


    res.json({
      success: true,
      data: cleanOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNextPage: page < Math.ceil(totalOrders / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('❌ Error fetching all orders:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders' 
    });
  }
};




// Get orders by customer ID (using customerId field)
exports.getOrdersByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;

    console.log('📦 Fetching orders for customer ID:', customerId);

    if (!customerId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer ID is required' 
      });
    }

    // Find orders by customerId
    const orders = await Order.find({ customerId })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${orders.length} orders for customer ${customerId}`);

    // Format orders with proper data
    const formattedOrders = orders.map(order => {
      // Ensure products array exists and has proper structure
      const safeProducts = (order.products || []).map(product => ({
        _id: product._id || product.productId,
        name: product.name || 'Unknown Product',
        price: product.price || 0,
        quantity: product.quantity || 1,
        images: product.images || [],
        category: product.category || 'General',
        description: product.description || ''
      }));

      // Ensure delivery address exists
      const safeDeliveryAddress = order.deliveryAddress || {
        name: order.customerName || 'Customer',
        phone: order.customerPhone || '',
        addressLine1: order.customerAddress || '',
        city: 'Unknown City',
        state: 'Unknown State',
        pincode: '000000',
        country: 'India'
      };

      return {
        _id: order._id,
        orderId: order.orderId,
        status: order.status || 'order_confirmed',
        totalAmount: order.totalAmount || 0,
        subtotal: order.subtotal || 0,
        shipping: order.shipping || 0,
        tax: order.tax || 0,
        products: safeProducts,
        deliveryAddress: safeDeliveryAddress,
        paymentMethod: order.paymentMethod || 'cash',
        orderDate: order.orderDate || order.createdAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    });

    res.json({
      success: true,
      data: formattedOrders,
      message: `Found ${formattedOrders.length} orders`
    });

  } catch (error) {
    console.error('❌ Error fetching orders by customer ID:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
};




// Get order statistics
exports.getOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
    const pendingOrders = await Order.countDocuments({ 
      status: { $in: ['order_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'] } 
    });
    
    // Calculate total revenue
    const revenueResult = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get customer count
    const customerCount = await Registration.countDocuments();

    res.json({
      success: true,
      data: {
        totalOrders,
        deliveredOrders,
        pendingOrders,
        totalRevenue,
        avgOrderValue,
        customerCount
      }
    });

  } catch (error) {
    console.error('❌ Error fetching order stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch order statistics' 
    });
  }
};



// const Order = require('../models/Order');
// const Registration = require('../models/user/Registration');



// // /Users/webasebrandings/Downloads/wsback-main/controllers/orderController.js

// exports.createOrder = async (req, res) => {
//   console.log('🛒 ORDER CREATION STARTED ==================');
//   console.log('📦 Request body received:', JSON.stringify(req.body, null, 2));
  
//   try {
//     const { 
//       userId, 
//       products, 
//       deliveryAddress, 
//       paymentMethod,
//       useWallet = false 
//     } = req.body;

//     // Enhanced validation with logging
//     if (!userId) {
//       console.log('❌ VALIDATION FAILED: User ID missing');
//       return res.status(400).json({ 
//         success: false, 
//         error: 'User ID is required' 
//       });
//     }

//     if (!products || products.length === 0) {
//       console.log('❌ VALIDATION FAILED: Products array empty');
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Products are required' 
//       });
//     }

//     console.log(`✅ Validation passed - User: ${userId}, Products: ${products.length}`);

//     // Get user details
//     const user = await Registration.findById(userId);
//     if (!user) {
//       console.log(`❌ USER NOT FOUND: ${userId}`);
//       return res.status(404).json({ 
//         success: false, 
//         error: 'User not found' 
//       });
//     }

//     console.log(`✅ User found: ${user.name} (${user.customerId})`);

//     // Calculate totals
//     const subtotal = products.reduce((total, item) => total + (item.price * item.quantity), 0);
//     const tax = subtotal * 0.08;
//     const shipping = subtotal > 499 ? 0 : 5.99;
//     const totalAmount = subtotal + tax + shipping;

//     console.log('💰 Totals calculated:', { subtotal, tax, shipping, totalAmount });

//     // Create order data
//    const orderData = {
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

//     console.log('📝 Final order data:', JSON.stringify(orderData, null, 2));

//     // ✅ FIX: MANUALLY GENERATE orderId BEFORE CREATING ORDER
//     console.log('🔧 Manually generating orderId...');
    
//     try {
//       const Counter = require('../models/user/customerId');
//       let counter = await Counter.findOne({ _id: 'orderId' });
      
//       if (!counter) {
//         console.log('📝 Creating new orderId counter...');
//         counter = new Counter({
//           _id: 'orderId',
//           sequence: 100000
//         });
//         await counter.save();
//       }
      
//       counter.sequence += 1;
//       await counter.save();
      
//       orderData.orderId = `ORD${counter.sequence}`;
//       console.log(`✅ Manually generated orderId: ${orderData.orderId}`);
      
//     } catch (counterError) {
//       console.error('❌ Counter error, using timestamp ID:', counterError);
//       orderData.orderId = `ORD${Date.now()}`;
//       console.log(`🔄 Using timestamp orderId: ${orderData.orderId}`);
//     }

//     console.log('💾 Saving order to database with orderId:', orderData.orderId);

//     // Create order with manually set orderId
//     const order = new Order(orderData);
//     await order.save();

//     console.log('✅ ORDER CREATED SUCCESSFULLY!');
//     console.log(`🎉 Order ID: ${order.orderId}`);
//     console.log(`👤 Customer: ${user.name}`);
//     console.log(`💰 Total: ₹${totalAmount}`);
//     console.log(`📦 Products: ${products.length} items`);
//     console.log('==========================================');

//     res.status(201).json({
//       success: true,
//       message: 'Order placed successfully',
//       data: {
//         orderId: order.orderId,
//         totalAmount: order.totalAmount,
//         status: order.status,
//         orderDate: order.orderDate,
//         products: order.products
//       }
//     });

//   } catch (error) {
//     console.error('❌ ORDER CREATION FAILED:', error);
//     console.error('🔍 Error details:', {
//       name: error.name,
//       message: error.message,
//       stack: error.stack
//     });
    
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to create order',
//       details: error.message 
//     });
//   }
// };




// // Get orders for customer
// exports.getCustomerOrders = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     console.log('📦 Fetching orders for user:', userId);

//     const orders = await Order.find({ user: userId })
//       .sort({ createdAt: -1 });

//     const ordersWithCleanData = orders.map(order => ({
//       _id: order._id,
//       orderId: order.orderId,
//       status: order.status,
//       totalAmount: order.totalAmount,
//       products: order.products,
//       deliveryAddress: order.deliveryAddress,
//       paymentMethod: order.paymentMethod,
//       orderDate: order.orderDate,
//       createdAt: order.createdAt
//     }));

//     console.log(`✅ Found ${orders.length} orders for user ${userId}`);

//     res.json({
//       success: true,
//       data: ordersWithCleanData
//     });

//   } catch (error) {
//     console.error('❌ Error fetching customer orders:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to fetch orders' 
//     });
//   }
// };

// // Update order status
// exports.updateOrderStatus = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { status } = req.body;

//     console.log(`🔄 Updating order ${orderId} to status: ${status}`);

//     const order = await Order.findOne({ orderId });
//     if (!order) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'Order not found' 
//       });
//     }

//     order.status = status;
//     await order.save();

//     console.log(`✅ Order ${orderId} status updated to ${status}`);

//     res.json({
//       success: true,
//       message: 'Order status updated successfully',
//       data: {
//         orderId: order.orderId,
//         status: order.status
//       }
//     });

//   } catch (error) {
//     console.error('❌ Error updating order status:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to update order status' 
//     });
//   }
// };

// // Get all orders for admin
// exports.getAllOrders = async (req, res) => {
//   try {
//     const { page = 1, limit = 10, status } = req.query;
//     const skip = (page - 1) * limit;

//     let query = {};
//     if (status && status !== 'all') {
//       query.status = status;
//     }

//     const orders = await Order.find(query)
//       .populate('user', 'name phoneNumber email address customerId')
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(parseInt(limit));

//     const totalOrders = await Order.countDocuments(query);

//     // Clean data for admin panel
//     const cleanOrders = orders.map(order => ({
//       orderId: order.orderId,
//       customerName: order.customerName,
//       customerPhone: order.customerPhone,
//       customerEmail: order.customerEmail,
//       customerAddress: order.customerAddress,
//       products: order.products.map(product => ({
//         name: product.name,
//         price: product.price,
//         quantity: product.quantity,
//         total: product.price * product.quantity,
//         category: product.category
//       })),
//       totalAmount: order.totalAmount,
//       status: order.status,
//       paymentMethod: order.paymentMethod,
//       orderDate: order.orderDate,
//       deliveryAddress: order.deliveryAddress
//     }));

//     res.json({
//       success: true,
//       data: cleanOrders,
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(totalOrders / limit),
//         totalOrders,
//         hasNextPage: page < Math.ceil(totalOrders / limit),
//         hasPrevPage: page > 1
//       }
//     });

//   } catch (error) {
//     console.error('❌ Error fetching all orders:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to fetch orders' 
//     });
//   }
// };

// // Get order statistics
// exports.getOrderStats = async (req, res) => {
//   try {
//     const totalOrders = await Order.countDocuments();
//     const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
//     const pendingOrders = await Order.countDocuments({ 
//       status: { $in: ['order_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'] } 
//     });
    
//     // Calculate total revenue
//     const revenueResult = await Order.aggregate([
//       { $match: { status: 'delivered' } },
//       { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
//     ]);
    
//     const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
//     const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

//     // Get customer count
//     const customerCount = await Registration.countDocuments();

//     res.json({
//       success: true,
//       data: {
//         totalOrders,
//         deliveredOrders,
//         pendingOrders,
//         totalRevenue,
//         avgOrderValue,
//         customerCount
//       }
//     });

//   } catch (error) {
//     console.error('❌ Error fetching order stats:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to fetch order statistics' 
//     });
//   }
// };