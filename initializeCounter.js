// /Users/webasebrandings/Downloads/wsback-main/initializeCounter.js
const mongoose = require('mongoose');
require('dotenv').config();

async function initializeCounter() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const Counter = require('./models/user/customerId');
    
    // Check if orderId counter exists
    let counter = await Counter.findOne({ _id: 'orderId' });
    
    if (!counter) {
      console.log('📝 Creating orderId counter...');
      counter = new Counter({
        _id: 'orderId',
        sequence: 100000
      });
      await counter.save();
      console.log('✅ Counter created successfully');
    } else {
      console.log('✅ Counter already exists:', counter);
    }
    
    await mongoose.connection.close();
    console.log('✅ Done!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

initializeCounter();