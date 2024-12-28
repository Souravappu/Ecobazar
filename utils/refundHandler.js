const Wallet = require('../models/Wallet');

const calculateRefundAmount = (order, items = null) => {
    // If items is null, it means full order refund
    const isFullRefund = !items;
    
    // Calculate refund amount based on items or full order
    let refundAmount = 0;
    let shippingRefund = 0;
    
    if (isFullRefund) {
        refundAmount = order.subtotal;
        // Refund shipping charge only for full cancellation/return before shipping
        if (order.orderStatus === 'Pending' || order.orderStatus === 'Processing') {
            shippingRefund = order.shippingCharge;
        }
    } else {
        // Calculate refund for specific items
        refundAmount = items.reduce((sum, item) => {
            const orderItem = order.items.find(i => i._id.toString() === item._id.toString());
            return sum + (orderItem.price * orderItem.quantity);
        }, 0);
        
        // Refund shipping charge proportionally if all items are being refunded
        const totalItemsBeingRefunded = items.length;
        const totalOrderItems = order.items.length;
        if (totalItemsBeingRefunded === totalOrderItems) {
            if (order.orderStatus === 'Pending' || order.orderStatus === 'Processing') {
                shippingRefund = order.shippingCharge;
            }
        }
    }

    // Handle coupon adjustments
    let couponAdjustment = 0;
    if (order.couponDiscount) {
        if (isFullRefund) {
            couponAdjustment = order.couponDiscount;
        } else {
            // Calculate proportional coupon discount for partial refund
            const refundRatio = refundAmount / order.subtotal;
            couponAdjustment = Math.round(order.couponDiscount * refundRatio);
        }
    }

    return {
        itemsAmount: refundAmount,
        shippingAmount: shippingRefund,
        couponAdjustment,
        totalRefund: refundAmount + shippingRefund - couponAdjustment
    };
};

const processRefund = async (order, items = null, reason) => {
    const refundDetails = calculateRefundAmount(order, items);
    const userId = order.user;

    // Find or create user wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
        wallet = new Wallet({ user: userId, balance: 0 });
    }

    const isFullRefund = !items;
    const description = isFullRefund ? 
        `Refund for order #${order.orderId}` : 
        `Partial refund for order #${order.orderId}`;

    // Create wallet transaction
    const transaction = {
        type: 'CREDIT',
        amount: refundDetails.totalRefund,
        description: `${description} - ${reason}`,
        orderId: order._id,
        status: 'COMPLETED'
    };

    // Update wallet balance and add transaction
    wallet.balance += refundDetails.totalRefund;
    wallet.transactions.push(transaction);
    await wallet.save();

    return {
        success: true,
        refundDetails,
        walletTransaction: transaction
    };
};

module.exports = {
    calculateRefundAmount,
    processRefund
}; 