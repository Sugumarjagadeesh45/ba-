// /Users/webasebrandings/Downloads/cmp_back-main/models/Banner.js
const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  bannerImage: {
    type: String,
    required: true
  },
  targetType: {
    type: String,
    enum: ['product', 'category', 'custom'],
    required: true
  },
  targetId: {
    type: String,
    required: function() {
      return this.targetType !== 'custom';
    }
  },
  customUrl: {
    type: String,
    required: function() {
      return this.targetType === 'custom';
    }
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  displayOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for active banners
bannerSchema.index({ isActive: 1, displayOrder: 1 });

module.exports = mongoose.model('Banner', bannerSchema);