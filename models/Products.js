const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    salePrice: {
        type: Number,
        required: true,
        min: 0
    },
    regularPrice: {
        type: Number,
        required: true,
        min: 0
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    images: [{
        type: String,
        required: true
    }],
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    unit: {
        type: String,
        required: true,
        enum: ['kg', 'nos']
    },
    unitQuantity: {
        type: Number,
        required: true,
        min: 0.01
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    appliedOffer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Offer',
        default: null
    },
    appliedOfferType: {
        type: String,
        enum: ['category', 'product', null],
        default: null
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed', null],
        default: null
    },
    discountValue: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Middleware to ensure sale price doesn't go below 25% of regular price
productSchema.pre('save', function(next) {
    const minimumPrice = this.regularPrice * 0.25;
    if (this.salePrice < minimumPrice) {
        this.salePrice = minimumPrice;
    }
    next();
});

module.exports = mongoose.model('Product', productSchema);