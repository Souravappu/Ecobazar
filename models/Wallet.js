const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['CREDIT', 'DEBIT'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: [0, 'Amount cannot be negative']
    },
    description: {
        type: String,
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
        default: 'COMPLETED'
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const walletSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0,
        min: [0, 'Wallet balance cannot be negative'],
        validate: {
            validator: function(v) {
                return v >= 0;
            },
            message: 'Insufficient wallet balance'
        }
    },
    transactions: [transactionSchema],
    minimumBalance: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Add middleware to validate balance before saving
walletSchema.pre('save', function(next) {
    if (this.balance < 0) {
        next(new Error('Wallet balance cannot be negative'));
    }
    next();
});

module.exports = mongoose.model('Wallet', walletSchema); 