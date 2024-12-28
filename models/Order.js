const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
            default: 'Pending'
        },
        cancelReason: {
            type: String
        },
        cancelledAt: {
            type: Date
        },
        returnRequested: {
            type: Boolean,
            default: false
        },
        returnReason: {
            type: String
        },
        returnRequestedAt: {
            type: Date
        },
        returnStatus: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected', 'None'],
            default: 'None'
        }
    }],
    shippingAddress: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        streetAddress: { type: String, required: true },
        city: { type: String, required: true },
        postalCode: { type: String, required: true },
        apartment: String,
        landMark: String,
        addressType: {
            type: String,
            enum: ['Home', 'Office', 'Other'],
            default: 'Home'
        }
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'ONLINE', 'WALLET', 'WALLET_PLUS_COD', 'WALLET_PLUS_ONLINE'],
        default: 'COD'
    },
    razorpayOrderId: {
        type: String
    },
    razorpayPaymentId: {
        type: String
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Aborted'],
        default: 'Pending'
    },
    orderStatus: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Failed', 'Returned', 'Payment Failed'],
        default: 'Pending'
    },
    cancelReason: {
        type: String
    },
    cancelledAt: {
        type: Date
    },
    subtotal: {
        type: Number,
        required: true
    },
    shippingCharge: {
        type: Number,
        default: 35
    },
    total: {
        type: Number,
        required: true
    },
    orderId: {
        type: String,
        unique: true
    },
    returnRequested: {
        type: Boolean,
        default: false
    },
    returnReason: {
        type: String
    },
    returnRequestedAt: {
        type: Date
    },
    returnStatus: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'None'],
        default: 'None'
    },
    partiallyReturned: {
        type: Boolean,
        default: false
    },
    walletAmount: {
        type: Number,
        default: 0
    },
    coupon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon'
    },
    couponDiscount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

orderSchema.pre('save', async function(next) {
    if (!this.orderId) {
        const count = await this.constructor.countDocuments();
        this.orderId = 'OD00' + String(count + 1)+(Math.floor(Math.random() * 10000)).toString();
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order; 