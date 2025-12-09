const http = require("http");
const mongoose = require("mongoose");
const app = require("./app");
const socket = require("./socket");

console.log('🚀 Starting Taxi App Backend...');

// Environment check
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

// Initialize Firebase (but don't let it break the app)
try {
  const { initializeFirebase } = require("./config/firebaseConfig");
  initializeFirebase();
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  console.log('⚠️ Continuing without Firebase - FCM notifications will not work');
}

// Use centralized DB connection
const connectDB = require("./config/db");

// Server initialization
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();
    
    // Initialize ride prices after DB connection
    try {
      const ridePriceController = require("./controllers/ridePriceController");
      await ridePriceController.initializePrices();
      console.log("💰 Ride prices initialized and ready");
    } catch (priceError) {
      console.error('❌ Error initializing prices:', priceError.message);
    }
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Initialize socket.io
    socket.init(server);
    
    // Set io instance in app for controllers to access
    app.set("io", socket.getIO());
    
    // Start server
    const PORT = process.env.PORT || 5001;
    
    server.listen(PORT, () => {
      console.log(`\n🎉 Server is live and running!`);
      console.log(`🌍 Local URL: http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
      console.log(`🔗 MongoDB: Connected`);
    });
    
    // FIXED: Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      console.log(`\n⚠️ Received ${signal}. Shutting down gracefully...`);
      
      server.close(async () => {
        console.log('✅ HTTP server closed');
        
        try {
          // Close MongoDB connection WITHOUT callback
          if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
            console.log('✅ MongoDB connection closed');
          }
          process.exit(0);
        } catch (error) {
          console.error('❌ Error closing MongoDB connection:', error);
          process.exit(1);
        }
      });
      
      // Force close after 5 seconds if graceful shutdown fails
      setTimeout(() => {
        console.log('⚠️ Forcing shutdown after timeout');
        process.exit(1);
      }, 5000);
    };
    
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};






// Error handlers
process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception thrown:', err);
  process.exit(1);
});

// Start the application
startServer();

