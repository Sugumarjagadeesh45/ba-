const jwt = require("jsonwebtoken");
const User = require("../models/user/Registration");
const Driver = require("../models/driver/driver");

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// Required authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false,
        message: "No authorization header provided" 
      });
    }
    
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: "No token provided" 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user exists in either User or Driver collection
    let user = await User.findById(decoded.id || decoded.sub);
    if (!user) {
      user = await Driver.findById(decoded.id || decoded.sub);
    }

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "User not found - token is invalid" 
      });
    }

    req.user = user;
    req.userId = user._id;
    next();
    
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: "Token has expired" 
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: "Invalid token" 
      });
    }
    
    return res.status(401).json({ 
      success: false,
      message: "Authentication failed" 
    });
  }
};

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    
    if (!authHeader) {
      return next();
    }
    
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user exists in either User or Driver collection
    let user = await User.findById(decoded.id || decoded.sub);
    if (!user) {
      user = await Driver.findById(decoded.id || decoded.sub);
    }

    if (user) {
      req.user = user;
      req.userId = user._id;
    }
    
    next();
  } catch (err) {
    // Continue without authentication if token is invalid
    next();
  }
};

module.exports = { authMiddleware, optionalAuth };


// // middleware/authMiddleware.js
// const jwt = require("jsonwebtoken");
// const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// const authMiddleware = (req, res, next) => {
//   try {
//     const authHeader = req.headers["authorization"];
//     if (!authHeader) {
//       return res.status(401).json({ msg: "No token, authorization denied" });
//     }
//     const token = authHeader.split(" ")[1];
//     if (!token) {
//       return res.status(401).json({ msg: "No token provided" });
//     }
//     const decoded = jwt.verify(token, JWT_SECRET);
//     req.user = decoded;
//     next();
//   } catch (err) {
//     return res.status(403).json({ msg: "Invalid or expired token" });
//   }
// };

// module.exports = authMiddleware;




