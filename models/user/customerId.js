// models/user/customerId.js
const mongoose = require('mongoose');

// Check if model already exists before creating it
let Counter;
try {
  Counter = mongoose.model('Counter');
} catch (error) {
  // Model doesn't exist, create it
  const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    sequence: { type: Number, default: 0 }
  });
  
  Counter = mongoose.model('Counter', counterSchema);
}

module.exports = Counter;




// const mongoose = require('mongoose');

// const counterSchema = new mongoose.Schema({
//   _id: { type: String, required: true },
//   sequence: { type: Number, required: true }
// });

// module.exports = mongoose.model('Counter', counterSchema);