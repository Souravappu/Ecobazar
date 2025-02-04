const Wallet = require('../../models/Wallet');
const Category = require('../../models/Category');
const User = require('../../models/User');
const mongoose = require('mongoose');

const walletController = {
    getWallet: async (req, res) => {
        try {
            const userId = req.session.user;
            const page = parseInt(req.query.page) || 1;
            const limit = 5;
            const skip = (page - 1) * limit;

            const [categories, user] = await Promise.all([
                Category.find({ isListed: true }),
                User.findById(userId)
            ]);

            // Find wallet or create new one if it doesn't exist
            let wallet = await Wallet.findOne({ user: userId });
            if (!wallet) {
                wallet = new Wallet({
                    user: userId,
                    balance: 0,
                    transactions: []
                });
                await wallet.save();
            }

            // Use aggregation for efficient pagination
            const [paginatedResult] = await Wallet.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(userId) } },
                {
                    $project: {
                        balance: 1,
                        isActive: 1,
                        totalTransactions: { $size: "$transactions" },
                        transactions: {
                            $slice: [
                                { $reverseArray: "$transactions" }, // Sort by newest first
                                skip,
                                limit
                            ]
                        }
                    }
                }
            ]);

            const totalTransactions = paginatedResult?.totalTransactions || 0;
            const totalPages = Math.ceil(totalTransactions / limit);

            res.render('user/wallet', {
                wallet: {
                    ...wallet.toObject(),
                    transactions: paginatedResult?.transactions || []
                },
                categories,
                user,
                currentPage: 'wallet',
                title: 'My Wallet',
                pagination: {
                    page,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    pages: Array.from({ length: totalPages }, (_, i) => i + 1)
                },
                totalTransactions
            });

        } catch (error) {
            console.error('Get wallet error:', error);
            res.status(500).render('error', {
                message: 'Error loading wallet',
                categories: [],
                error: process.env.NODE_ENV === 'development' ? error : null
            });
        }
    },

    addMoney: async (req, res) => {
        try {
            const { amount } = req.body;
            const userId = req.session.user;

            // Validate amount
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid amount'
                });
            }

            // Maximum amount validation
            const MAX_WALLET_AMOUNT = 50000; // ₹50,000 limit
            const wallet = await Wallet.findOne({ user: userId });
            
            if (!wallet) {
                return res.status(404).json({
                    success: false,
                    message: 'Wallet not found'
                });
            }

            if (!wallet.isActive) {
                return res.status(400).json({
                    success: false,
                    message: 'Wallet is inactive'
                });
            }

            if (wallet.balance + parsedAmount > MAX_WALLET_AMOUNT) {
                return res.status(400).json({
                    success: false,
                    message: `Maximum wallet balance limit is ₹${MAX_WALLET_AMOUNT}`
                });
            }

            // Add transaction
            const transaction = {
                type: 'CREDIT',
                amount: parsedAmount,
                description: 'Added money to wallet',
                status: 'COMPLETED',
                date: new Date()
            };

            wallet.transactions.push(transaction);
            wallet.balance += parsedAmount;

            await wallet.save();

            res.json({
                success: true,
                message: 'Money added successfully',
                balance: wallet.balance,
                transaction
            });

        } catch (error) {
            console.error('Add money error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error adding money to wallet'
            });
        }
    },

    deductMoney: async (userId, amount, description, orderId) => {
        try {
            const wallet = await Wallet.findOne({ user: userId });
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            if (!wallet.isActive) {
                throw new Error('Wallet is inactive');
            }

            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                throw new Error('Invalid amount');
            }

            if (wallet.balance < parsedAmount) {
                throw new Error('Insufficient wallet balance');
            }

            // Add transaction
            const transaction = {
                type: 'DEBIT',
                amount: parsedAmount,
                description,
                orderId,
                status: 'COMPLETED',
                date: new Date()
            };

            wallet.transactions.push(transaction);
            wallet.balance -= parsedAmount;

            await wallet.save();
            return { success: true, transaction };

        } catch (error) {
            console.error('Deduct money error:', error);
            throw error;
        }
    },

    // Function to check if wallet can be used
    canUseWallet: async (userId, amount) => {
        try {
            const wallet = await Wallet.findOne({ user: userId });
            if (!wallet || !wallet.isActive) {
                return false;
            }

            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                return false;
            }

            // Check if amount is within valid range
            const MIN_USAGE_AMOUNT = 1;
            const MAX_USAGE_AMOUNT = 10000; // ₹10,000 per transaction
            if (parsedAmount < MIN_USAGE_AMOUNT || parsedAmount > MAX_USAGE_AMOUNT) {
                return false;
            }

            return wallet.balance >= parsedAmount;
        } catch (error) {
            console.error('Check wallet usage error:', error);
            return false;
        }
    }
};

module.exports = walletController; 