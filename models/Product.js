const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: {
    type: Number,
    required: true,
    unique: true
  },
  name: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  price: { 
    type: Number, 
    required: true 
  },
  originalPrice: { 
    type: Number, 
    required: true 
  },
  discount: { 
    type: Number, 
    default: 0 
  },
  category: { 
    type: String, 
    required: true 
  },
  images: {
    type: [String],
    default: [],
    validate: {
      validator: function(array) {
        return array.every(img => typeof img === 'string');
      },
      message: 'Images must be an array of strings'
    }
  },
  stock: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['available', 'out_of_stock', 'discontinued'], 
    default: 'available' 
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for image URLs
productSchema.virtual('imageUrls').get(function() {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
  return this.images.map(img => {
    if (!img) return '';
    if (img.startsWith('http')) return img;
    
    // Remove leading slash if present and ensure proper path
    const cleanPath = img.startsWith('/') ? img.slice(1) : img;
    return `${backendUrl}/${cleanPath}`;
  });
});

// Ensure virtuals are included in JSON output
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// Static method to get product statistics
productSchema.statics.getProductStats = async function() {
  const totalProducts = await this.countDocuments({ isActive: true });
  const availableProducts = await this.countDocuments({ 
    status: 'available', 
    isActive: true 
  });
  const outOfStockProducts = await this.countDocuments({ 
    status: 'out_of_stock', 
    isActive: true 
  });
  
  // Calculate total stock value
  const stockValue = await this.aggregate([
    { $match: { status: 'available', isActive: true } },
    { $group: { _id: null, totalValue: { $sum: { $multiply: ['$price', '$stock'] } } } }
  ]);
  
  return {
    totalProducts,
    availableProducts,
    outOfStockProducts,
    totalStockValue: stockValue.length > 0 ? stockValue[0].totalValue : 0
  };
};

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);