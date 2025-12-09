const User = require("../models/user/Registration");
const Transaction = require("../models/driver/transaction");

console.log('💰 Wallet Controller loaded');

// Get wallet balance
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Initialize wallet if not exists
    if (!user.wallet) {
      user.wallet = {
        balance: 0,
        currency: "INR",
        transactions: []
      };
      await user.save();
    }

    res.json({
      success: true,
      balance: user.wallet.balance || 0,
      currency: user.wallet.currency || "INR",
      userId: userId
    });
  } catch (error) {
    console.error('❌ Error getting wallet balance:', error);
    res.status(500).json({
      success: false,
      message: "Failed to get wallet balance",
      error: error.message
    });
  }
};

// Add money to wallet
const addMoneyToWallet = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { amount, paymentMethod, transactionId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Initialize wallet if not exists
    if (!user.wallet) {
      user.wallet = {
        balance: 0,
        currency: "INR",
        transactions: []
      };
    }

    // Add to balance
    const previousBalance = user.wallet.balance;
    user.wallet.balance += parseFloat(amount);

    // Create transaction record
    const transaction = new Transaction({
      userId: userId,
      type: 'credit',
      amount: amount,
      previousBalance: previousBalance,
      newBalance: user.wallet.balance,
      paymentMethod: paymentMethod || 'online',
      transactionId: transactionId || `TXN_${Date.now()}`,
      status: 'completed',
      description: 'Wallet top-up',
      metadata: {
        source: 'user_topup',
        timestamp: new Date()
      }
    });

    await transaction.save();

    // Add transaction to user's wallet
    user.wallet.transactions.push(transaction._id);
    await user.save();

    res.json({
      success: true,
      message: "Money added to wallet successfully",
      previousBalance: previousBalance,
      newBalance: user.wallet.balance,
      addedAmount: amount,
      transaction: {
        id: transaction._id,
        amount: amount,
        type: 'credit',
        transactionId: transaction.transactionId
      }
    });

  } catch (error) {
    console.error('❌ Error adding money to wallet:', error);
    res.status(500).json({
      success: false,
      message: "Failed to add money to wallet",
      error: error.message
    });
  }
};

// Get transaction history
const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { page = 1, limit = 10 } = req.query;
    
    const transactions = await Transaction.find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments({ userId: userId });

    res.json({
      success: true,
      transactions: transactions,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total: total,
        limit: limit
      }
    });
  } catch (error) {
    console.error('❌ Error getting transaction history:', error);
    res.status(500).json({
      success: false,
      message: "Failed to get transaction history",
      error: error.message
    });
  }
};

// Create wallet
const createWallet = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Initialize wallet if not exists
    if (!user.wallet) {
      user.wallet = {
        balance: 0,
        currency: "INR",
        transactions: [],
        createdAt: new Date(),
        isActive: true
      };
      
      await user.save();
      
      res.json({
        success: true,
        message: "Wallet created successfully",
        wallet: user.wallet
      });
    } else {
      res.json({
        success: true,
        message: "Wallet already exists",
        wallet: user.wallet
      });
    }
  } catch (error) {
    console.error('❌ Error creating wallet:', error);
    res.status(500).json({
      success: false,
      message: "Failed to create wallet",
      error: error.message
    });
  }
};

// Make payment from wallet
const makePayment = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { amount, description, rideId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required"
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.wallet) {
      return res.status(404).json({
        success: false,
        message: "User or wallet not found"
      });
    }

    // Check sufficient balance
    if (user.wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in wallet"
      });
    }

    // Deduct from balance
    const previousBalance = user.wallet.balance;
    user.wallet.balance -= parseFloat(amount);

    // Create transaction record
    const transaction = new Transaction({
      userId: userId,
      type: 'debit',
      amount: amount,
      previousBalance: previousBalance,
      newBalance: user.wallet.balance,
      paymentMethod: 'wallet',
      transactionId: `TXN_${Date.now()}`,
      status: 'completed',
      description: description || 'Payment for ride',
      rideId: rideId || null,
      metadata: {
        source: 'ride_payment',
        rideId: rideId,
        timestamp: new Date()
      }
    });

    await transaction.save();

    // Add transaction to user's wallet
    user.wallet.transactions.push(transaction._id);
    await user.save();

    res.json({
      success: true,
      message: "Payment successful",
      previousBalance: previousBalance,
      newBalance: user.wallet.balance,
      deductedAmount: amount,
      transaction: {
        id: transaction._id,
        amount: amount,
        type: 'debit',
        transactionId: transaction.transactionId
      }
    });

  } catch (error) {
    console.error('❌ Error making payment:', error);
    res.status(500).json({
      success: false,
      message: "Failed to process payment",
      error: error.message
    });
  }
};

// Withdraw from wallet
const withdrawFromWallet = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { amount, bankDetails } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required"
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.wallet) {
      return res.status(404).json({
        success: false,
        message: "User or wallet not found"
      });
    }

    // Check sufficient balance
    if (user.wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in wallet"
      });
    }

    // Deduct from balance
    const previousBalance = user.wallet.balance;
    user.wallet.balance -= parseFloat(amount);

    // Create withdrawal transaction
    const transaction = new Transaction({
      userId: userId,
      type: 'withdrawal',
      amount: amount,
      previousBalance: previousBalance,
      newBalance: user.wallet.balance,
      paymentMethod: 'bank_transfer',
      transactionId: `WD_${Date.now()}`,
      status: 'pending', // Withdrawals need approval
      description: 'Wallet withdrawal',
      metadata: {
        source: 'withdrawal',
        bankDetails: bankDetails,
        timestamp: new Date()
      }
    });

    await transaction.save();
    user.wallet.transactions.push(transaction._id);
    await user.save();

    res.json({
      success: true,
      message: "Withdrawal request submitted successfully",
      previousBalance: previousBalance,
      newBalance: user.wallet.balance,
      withdrawalAmount: amount,
      transaction: {
        id: transaction._id,
        amount: amount,
        type: 'withdrawal',
        status: 'pending',
        transactionId: transaction.transactionId
      }
    });

  } catch (error) {
    console.error('❌ Error processing withdrawal:', error);
    res.status(500).json({
      success: false,
      message: "Failed to process withdrawal",
      error: error.message
    });
  }
};

module.exports = {
  getWalletBalance,
  addMoneyToWallet,
  getTransactionHistory,
  createWallet,
  makePayment,
  withdrawFromWallet
};