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
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
            default: 'Pending'
        },
        cancelReason: {
            type: String
        },
        cancelledAt: {
            type: Date
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
        enum: ['COD', 'Online'],
        default: 'COD'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed'],
        default: 'Pending'
    },
    orderStatus: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
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
    }
}, {
    timestamps: true
});

// Generate unique order ID before saving
orderSchema.pre('save', async function(next) {
    if (!this.orderId) {
        const count = await this.constructor.countDocuments();
        this.orderId = 'OD00' + String(count + 1)+(Math.floor(Math.random() * 10000)).toString();
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order; 