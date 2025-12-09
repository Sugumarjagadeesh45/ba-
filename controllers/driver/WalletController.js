const Wallet = require("../../models/user/wallet");
const Transaction = require("../../models/driver/transaction");

const getWallet = async (req, res) => {
  try {
    const driverId = req.user.id;
    let wallet = await Wallet.findOne({ driver: driverId }).populate("transactions");

    if (!wallet) {
      wallet = new Wallet({ driver: driverId, balance: 0 });
      await wallet.save();
    }

    res.json({ balance: wallet.balance, transactions: wallet.transactions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



// /controllers/admin/walletController.js
const Driver = require('../../models/driver/driver');

const updateDriverWallet = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { amount } = req.body;
    
    console.log(`💰 Wallet update request: ${driverId}, amount: ${amount}`);
    
    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    
    const addAmount = Number(amount);
    
    // Find and update driver
    const driver = await Driver.findOneAndUpdate(
      { driverId },
      { 
        $inc: { wallet: addAmount },
        $set: { lastUpdate: new Date() }
      },
      { new: true }
    );
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Wallet updated successfully',
      data: {
        driverId: driver.driverId,
        name: driver.name,
        addedAmount: addAmount,
        wallet: driver.wallet,
        previousWallet: driver.wallet - addAmount
      }
    });
    
  } catch (error) {
    console.error('❌ Wallet controller error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wallet',
      error: error.message
    });
  }
};

// Get driver wallet balance
const getDriverWallet = async (req, res) => {
  try {
    const { driverId } = req.params;
    
    const driver = await Driver.findOne({ driverId })
      .select('driverId name phone wallet');
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        driverId: driver.driverId,
        name: driver.name,
        wallet: driver.wallet || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Get wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet balance',
      error: error.message
    });
  }
};

module.exports = {
  updateDriverWallet,
  getDriverWallet
};




const requestWithdraw = async (req, res) => { 
  try {
    const driverId = req.user.id;
    const { amount, method } = req.body;

    const wallet = await Wallet.findOne({ driver: driverId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    if (wallet.balance < amount) return res.status(400).json({ message: "Insufficient balance" });

    wallet.balance -= amount;
    await wallet.save();

    const tx = new Transaction({ driver: driverId, amount, type: "debit", method });
    await tx.save();

    wallet.transactions.push(tx._id);
    await wallet.save();

    res.json({ success: true, message: "Withdrawal requested", transaction: tx });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getWallet, requestWithdraw };
