const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authMiddleware } = require('../middleware/authMiddleware');

console.log('💰 Wallet Controller Methods:', Object.keys(walletController).filter(key => typeof walletController[key] === 'function'));

// All wallet routes require authentication
router.use(authMiddleware);

// Get wallet balance
router.get('/balance', (req, res) => {
  walletController.getWalletBalance(req, res);
});

// Add money to wallet
router.post('/add-money', (req, res) => {
  walletController.addMoneyToWallet(req, res);
});

// Get transaction history
router.get('/transactions', (req, res) => {
  walletController.getTransactionHistory(req, res);
});

// Create wallet (if doesn't exist)
router.post('/create', (req, res) => {
  walletController.createWallet(req, res);
});

// Make payment from wallet
router.post('/payment', (req, res) => {
  walletController.makePayment(req, res);
});

// Withdraw from wallet
router.post('/withdraw', (req, res) => {
  walletController.withdrawFromWallet(req, res);
});

module.exports = router;
// const express = require("express");
// const { getWallet, requestWithdraw } = require("../controllers/driver/WalletController");
// const authMiddleware = require("../middleware/authMiddleware");

// const router = express.Router();

// router.get("/", authMiddleware, getWallet);
// router.post("/withdraw", authMiddleware, requestWithdraw);

// module.exports = router;
