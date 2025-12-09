const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  sequence: {
    type: Number,
    default: 1000000000 // Start from 10-digit number: 1000000000
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Counter', counterSchema);