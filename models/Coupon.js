const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: [true, 'Coupon code is required'],
        unique: true,
        uppercase: true,
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Description is required']
    },
    discountType: {
        type: String,
        required: true,
        enum: ['percentage', 'fixed']
    },
    discountAmount: {
        type: Number,
        required: true,
        min: 0
    },
    minimumPurchase: {
        type: Number,
        required: true,
        min: 0
    },
    maximumDiscount: {
        type: Number,
        required: true,
        min: 0
    },
    startDate: {
        type: Date,
        required: true
    },
    expiryDate: {
        type: Date,
        required: true
    },
    usageLimit: {
        type: Number,
        required: true,
        min: 1
    },
    usedCount: {
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

couponSchema.pre('save', function(next) {
    if (this.startDate >= this.expiryDate) {
        next(new Error('Start date must be before expiry date'));
    }
    next();
});

module.exports = mongoose.model('Coupon', couponSchema); 