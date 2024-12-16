const mongoose = require("mongoose");
const bcrypt = require('bcrypt');

const userSchema = mongoose.Schema({
    fname: {
        type: String,
        required: [true, 'First name is required'],
        trim: true
    },
    lname: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        trim: true
    },
    password: {
        type: String,
        required: function() {
            return !this.googleId; // Only required if not using Google auth
        }
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'blocked'],
        default: 'active'
    },
    googleId: {
        type: String,
        sparse: true
    },
    hasChangedTemporaryPassword: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cart"
    }],
    wallet: {
        balance: {
            type: Number,
            default: 0
        },
        transactions: [{
            type: {
                type: String,
                enum: ['credit', 'debit']
            },
            amount: Number,
            description: String,
            date: {
                type: Date,
                default: Date.now
            }
        }]
    },
    wishlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Wishlist"
    }],
    orderHistory: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order"
    }],
    couponUsed: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon"
    }],
    addresses: [{
        type: {
            type: String,
            enum: ['home', 'work', 'other'],
            default: 'home'
        },
        address: String,
        city: String,
        state: String,
        pincode: String,
        isDefault: {
            type: Boolean,
            default: false
        }
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.fname} ${this.lname}`;
});

// Index for Google ID
userSchema.index(
    { googleId: 1 },
    { partialFilterExpression: { googleId: { $exists: true } } }
);

// Index for email
userSchema.index({ email: 1 }, { unique: true });

// Pre-save middleware
userSchema.pre('save', function(next) {
    if (this.isModified('isBlocked') && this.isBlocked) {
        this.status = 'blocked';
    }
    next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
