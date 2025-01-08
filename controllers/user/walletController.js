const Wallet = require('../../models/Wallet');
const Category = require('../../models/Category');
const User = require('../../models/User');

const walletController = {
    getWallet: async (req, res) => {
        try {
            const userId = req.session.user;
            const page = parseInt(req.query.page) || 1;
            const limit = 5; 

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

            const totalTransactions = wallet.transactions.length;
            const totalPages = Math.ceil(totalTransactions / limit);

            const paginatedTransactions = wallet.transactions
                .sort((a, b) => b.date - a.date)
                .slice((page - 1) * limit, page * limit);

            res.render('user/wallet', {
                wallet: {
                    ...wallet.toObject(),
                    transactions: paginatedTransactions
                },
                categories,
                user,
                currentPage: 'wallet',
                title: 'My Wallet',
                pagination: {
                    page,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
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

            const wallet = await Wallet.findOne({ user: userId });
            if (!wallet) {
                return res.status(404).json({
                    success: false,
                    message: 'Wallet not found'
                });
            }

            wallet.transactions.push({
                type: 'CREDIT',
                amount: amount,
                description: 'Added money to wallet'
            });

            wallet.balance += parseFloat(amount);
            await wallet.save();

            res.json({
                success: true,
                message: 'Money added successfully',
                balance: wallet.balance
            });

        } catch (error) {
            console.error('Add money error:', error);
            res.status(500).json({
                success: false,
                message: 'Error adding money to wallet'
            });
        }
    }
};

module.exports = walletController; 