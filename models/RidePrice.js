const mongoose = require('mongoose');

const ridePriceSchema = new mongoose.Schema({
  vehicleType: {
    type: String,
    enum: ['bike', 'taxi', 'port'],
    required: true,
    unique: true
  },
  pricePerKm: {
    type: Number,
    required: true,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Static method to get all prices
ridePriceSchema.statics.getAllPrices = async function() {
  const prices = await this.find({ isActive: true });
  const priceMap = {};
  prices.forEach(price => {
    priceMap[price.vehicleType] = price.pricePerKm;
  });
  return priceMap;
};

// Static method to update prices
ridePriceSchema.statics.updatePrices = async function(newPrices) {
  const updates = [];
  
  for (const [vehicleType, pricePerKm] of Object.entries(newPrices)) {
    const update = this.findOneAndUpdate(
      { vehicleType },
      { 
        pricePerKm,
        lastUpdated: new Date()
      },
      { 
        upsert: true, 
        new: true 
      }
    );
    updates.push(update);
  }
  
  await Promise.all(updates);
  return this.getAllPrices();
};

module.exports = mongoose.models.RidePrice || mongoose.model('RidePrice', ridePriceSchema);

