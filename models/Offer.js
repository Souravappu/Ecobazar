const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Offer name is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true
    },
    type: {
        type: String,
        enum: ['category', 'product'],
        required: true
    },
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'type',
        required: true
    },
    discountType: {
        type: String,
        required: [true, 'Discount type is required'],
        enum: ['percentage', 'fixed']
    },
    discountValue: {
        type: Number,
        required: [true, 'Discount value is required'],
        min: [0, 'Discount value cannot be negative'],
        validate: {
            validator: function(value) {
                if (this.discountType === 'percentage') {
                    return value <= 90;
                }
                return true;
            },
            message: 'Percentage discount cannot exceed 90%'
        }
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required']
    },
    endDate: {
        type: Date,
        required: [true, 'End date is required']
    },
    categories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
    products: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Middleware to update timestamps
offerSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Middleware to validate dates
offerSchema.pre('validate', function(next) {
    if (this.startDate && this.endDate && this.startDate > this.endDate) {
        this.invalidate('endDate', 'End date must be after start date');
    }
    next();
});

// Middleware to ensure either categories or products are selected, but not both
// and to set type and itemId based on the selection
offerSchema.pre('validate', function(next) {
    const hasCategories = this.categories && this.categories.length > 0;
    const hasProducts = this.products && this.products.length > 0;
    
    if (!hasCategories && !hasProducts) {
        this.invalidate('categories', 'Either categories or products must be selected');
        this.invalidate('products', 'Either categories or products must be selected');
    }
    
    if (hasCategories && hasProducts) {
        this.invalidate('categories', 'Cannot select both categories and products');
        this.invalidate('products', 'Cannot select both categories and products');
    }

    // Set type and itemId based on selection
    if (hasCategories) {
        this.type = 'category';
        this.itemId = this.categories[0];
    } else if (hasProducts) {
        this.type = 'product';
        this.itemId = this.products[0];
    }
    
    next();
});

module.exports = mongoose.model('Offer', offerSchema); 