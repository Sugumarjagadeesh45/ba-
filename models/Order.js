const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Registration', 
    required: true 
  },
  customerId: { 
    type: String, 
    required: true ,
     index: true 
  },
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    default: ''
  },
  customerAddress: {
    type: String,
    required: true
  },
  products: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    images: [String],
    category: String
  }],
  totalAmount: { 
    type: Number, 
    required: true 
  },
  subtotal: Number,
  shipping: { 
    type: Number, 
    default: 0 
  },
  tax: { 
    type: Number, 
    default: 0 
  },
  deliveryAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: { 
      type: String, 
      default: 'India' 
    }
  },
  status: {
    type: String,
    enum: [
      'pending',
      'order_confirmed', 
      'processing',
      'preparing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned',
      'refunded'
    ],
    default: 'order_confirmed'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'wallet', 'card', 'upi'],
    required: true
  },
  orderDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// In your Order.js model, add this pre-save hook
orderSchema.pre('save', async function(next) {
  console.log('🔄 Pre-save hook triggered for order');
  
  if (this.isNew && !this.customerId) {
    try {
      // Populate customerId from user reference
      const Registration = require('./user/Registration');
      const user = await Registration.findById(this.user);
      if (user && user.customerId) {
        this.customerId = user.customerId;
        console.log(`✅ Auto-populated customerId: ${this.customerId}`);
      } else {
        console.log('⚠️ User or customerId not found for order');
      }
    } catch (error) {
      console.error('❌ Error populating customerId:', error);
    }
  }
  next();
});



module.exports = mongoose.model('Order', orderSchema);



// // /Users/webasebrandings/Downloads/wsback-main/models/Order.js
// const mongoose = require('mongoose');

// const orderSchema = new mongoose.Schema({
//   orderId: { 
//     type: String, 
//     required: true, 
//     unique: true 
//   },
//   user: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: 'Registration', 
//     required: true 
//   },
//   customerId: { 
//     type: String, 
//     required: true 
//   },
//   customerName: {
//     type: String,
//     required: true
//   },
//   customerPhone: {
//     type: String,
//     required: true
//   },
//   customerEmail: {
//     type: String,
//     default: ''
//   },
//   customerAddress: {
//     type: String,
//     required: true
//   },
//   products: [{
//     productId: String,
//     name: String,
//     price: Number,
//     quantity: Number,
//     images: [String],
//     category: String
//   }],
//   totalAmount: { 
//     type: Number, 
//     required: true 
//   },
//   subtotal: Number,
//   shipping: { 
//     type: Number, 
//     default: 0 
//   },
//   tax: { 
//     type: Number, 
//     default: 0 
//   },
//   deliveryAddress: {
//     name: String,
//     phone: String,
//     addressLine1: String,
//     addressLine2: String,
//     city: String,
//     state: String,
//     pincode: String,
//     country: { 
//       type: String, 
//       default: 'India' 
//     }
//   },
//   status: {
//     type: String,
//     enum: [
//       'order_confirmed',
//       'processing', 
//       'packed',
//       'shipped',
//       'out_for_delivery',
//       'delivered',
//       'cancelled'
//     ],
//     default: 'order_confirmed' // Ensure default value
//   },
//   paymentMethod: {
//     type: String,
//     enum: ['cash', 'wallet', 'card', 'upi'],
//     required: true
//   },
//   orderDate: {
//     type: Date,
//     default: Date.now
//   }
// }, {
//   timestamps: true
// });

// // /Users/webasebrandings/Downloads/wsback-main/models/Order.js

// // FIXED: Better pre-save hook with debugging
// orderSchema.pre('save', async function(next) {
//   console.log('🔄 Pre-save hook triggered for order');
//   console.log('📋 Current orderId:', this.orderId);
//   console.log('📋 Is new document:', this.isNew);
  
//   if (this.isNew && !this.orderId) {
//     try {
//       console.log('🔍 Generating orderId in pre-save hook...');
      
//       const Counter = require('./user/customerId');
//       let counter = await Counter.findOne({ _id: 'orderId' });
      
//       if (!counter) {
//         console.log('📝 Creating new orderId counter in pre-save...');
//         counter = new Counter({
//           _id: 'orderId',
//           sequence: 100000
//         });
//         await counter.save();
//       }
      
//       counter.sequence += 1;
//       await counter.save();
      
//       this.orderId = `ORD${counter.sequence}`;
//       console.log(`✅ Pre-save generated orderId: ${this.orderId}`);
      
//     } catch (counterError) {
//       console.error('❌ Pre-save counter error:', counterError);
//       this.orderId = `ORD${Date.now()}`;
//       console.log(`🔄 Pre-save using timestamp orderId: ${this.orderId}`);
//     }
//   } else {
//     console.log('ℹ️  Pre-save: orderId already exists or document not new');
//   }
//   next();
// });

// // ✅ FIX THE TYPO: Change "orderOrder" to "orderSchema"
// module.exports = mongoose.model('Order', orderSchema);


