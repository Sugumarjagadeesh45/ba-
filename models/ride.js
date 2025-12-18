const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
  customerId: { type: String, required: true },
  name: { type: String, required: true },
  RAID_ID: { 
    type: String, 
    required: [true, 'RAID_ID is required'],
    unique: true,
    validate: {
      validator: function(v) {
        return v !== null && v !== undefined && v.trim() !== '';
      },
      message: 'RAID_ID cannot be null or empty'
    }
  },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
  pickupLocation: { type: String, required: true },
  dropoffLocation: { type: String, required: true },
  pickupCoordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  dropoffCoordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  fare: { type: Number, required: true },
  rideType: { type: String, enum: ['TAXI', 'BIKE', 'PORT', 'AUTO', 'taxi', 'bike', 'port', 'auto'], required: true },
  otp: { type: String, required: true },
  distance: { type: String, required: true },
  travelTime: { type: String, required: true },
  isReturnTrip: { type: Boolean, default: false },

  // 🚕 Updated ride status enum
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'arrived', 'ongoing', 'completed', 'cancelled'], 
    default: 'pending' 
  },

  // Rating and feedback
  userRating: { type: Number, min: 1, max: 5 },
  userFeedback: { type: String },
  driverRating: { type: Number, min: 1, max: 5 },
  driverFeedback: { type: String },

  Raid_date: { type: Date, default: Date.now },
  Raid_time: { 
    type: String, 
    default: () => new Date().toLocaleTimeString('en-US', { 
      timeZone: 'Asia/Kolkata', 
      hour12: true 
    }) 
  },

  // Added fields from friend's implementation
  pickup: {
    addr: String,
    lat: Number,
    lng: Number,
  },
  drop: {
    addr: String,
    lat: Number,
    lng: Number,
  },

  price: Number,
  distanceKm: Number

}, {
  timestamps: true
});

// Static method to get ride statistics
rideSchema.statics.getRideStats = async function() {
  const totalRides = await this.countDocuments();
  const completedRides = await this.countDocuments({ status: 'completed' });
  const pendingRides = await this.countDocuments({ status: 'pending' });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ridesToday = await this.countDocuments({
    createdAt: { $gte: today }
  });
  
  // Calculate total revenue
  const revenueResult = await this.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, totalRevenue: { $sum: '$fare' } } }
  ]);
  
  const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
  
  return {
    totalRides,
    completedRides,
    pendingRides,
    ridesToday,
    totalRevenue
  };
};

// Static method to get weekly performance data
rideSchema.statics.getWeeklyPerformance = async function(year = null) {
  const currentYear = year || new Date().getFullYear();
  
  const weeklyData = await this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(`${currentYear}-01-01`),
          $lt: new Date(`${currentYear + 1}-01-01`)
        }
      }
    },
    {
      $group: {
        _id: { $week: "$createdAt" },
        rides: { $sum: 1 },
        revenue: { $sum: "$fare" }
      }
    },
    {
      $sort: { "_id": 1 }
    }
  ]);
  
  return weeklyData;
};

// Static method to get yearly trends
rideSchema.statics.getYearlyTrends = async function(year = null) {
  const currentYear = year || new Date().getFullYear();
  
  const monthlyData = await this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(`${currentYear}-01-01`),
          $lt: new Date(`${currentYear + 1}-01-01`)
        }
      }
    },
    {
      $group: {
        _id: { $month: "$createdAt" },
        rides: { $sum: 1 },
        revenue: { $sum: "$fare" }
      }
    },
    {
      $sort: { "_id": 1 }
    }
  ]);
  
  return monthlyData;
};

// Static method to get service distribution
rideSchema.statics.getServiceDistribution = async function() {
  const distribution = await this.aggregate([
    {
      $group: {
        _id: "$rideType",
        count: { $sum: 1 },
        revenue: { $sum: "$fare" }
      }
    }
  ]);
  
  return distribution;
};

module.exports = mongoose.models.Ride || mongoose.model('Ride', rideSchema);



// const mongoose = require('mongoose');

// const rideSchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
//   customerId: { type: String, required: true },
//   name: { type: String, required: true },
//   RAID_ID: { 
//     type: String, 
//     required: [true, 'RAID_ID is required'],
//     unique: true,
//     validate: {
//       validator: function(v) {
//         return v !== null && v !== undefined && v.trim() !== '';
//       },
//       message: 'RAID_ID cannot be null or empty'
//     }
//   },
//   pickupLocation: { type: String, required: true },
//   dropoffLocation: { type: String, required: true },
//   pickupCoordinates: {
//     latitude: { type: Number, required: true },
//     longitude: { type: Number, required: true }
//   },
//   dropoffCoordinates: {
//     latitude: { type: Number, required: true },
//     longitude: { type: Number, required: true }
//   },
//   fare: { type: Number, required: true },
//   rideType: { type: String, enum: ['bike', 'taxi', 'port', 'mini', 'sedan', 'suv'], required: true },
//   otp: { type: String, required: true },
//   distance: { type: String, required: true },
//   travelTime: { type: String, required: true },
//   isReturnTrip: { type: Boolean, default: false },

//   // 🚕 Updated ride status enum
//   status: { 
//     type: String, 
//     enum: ['pending', 'accepted', 'arrived', 'ongoing', 'completed', 'cancelled'], 
//     default: 'pending' 
//   },

//   Raid_date: { type: Date, default: Date.now },
//   Raid_time: { 
//     type: String, 
//     default: () => new Date().toLocaleTimeString('en-US', { 
//       timeZone: 'Asia/Kolkata', 
//       hour12: true 
//     }) 
//   },

//   // Added fields from friend's implementation
//   pickup: {
//     addr: String,
//     lat: Number,
//     lng: Number,
//   },
//   drop: {
//     addr: String,
//     lat: Number,
//     lng: Number,
//   },

//   price: Number,
//   distanceKm: Number

// }, {
//   timestamps: true
// });

// module.exports = mongoose.models.Ride || mongoose.model('Ride', rideSchema);
