const Wallet = require('../models/Wallet');

const calculateRefundAmount = (order, items = null) => {
    const isFullRefund = !items;
    
    let refundAmount = 0;
    let shippingRefund = 0;
    
    if (isFullRefund) {
        refundAmount = order.subtotal;
        if (order.orderStatus === 'Pending' || order.orderStatus === 'Processing') {
            shippingRefund = order.shippingCharge;
        }
    } else {
        refundAmount = items.reduce((sum, item) => {
            const orderItem = order.items.find(i => i._id.toString() === item._id.toString());
            return sum + (orderItem.price * orderItem.quantity);
        }, 0);
        
        const totalItemsBeingRefunded = items.length;
        const totalOrderItems = order.items.length;
        if (totalItemsBeingRefunded === totalOrderItems) {
            if (order.orderStatus === 'Pending' || order.orderStatus === 'Processing') {
                shippingRefund = order.shippingCharge;
            }
        }
    }

    let couponAdjustment = 0;
    if (order.couponDiscount) {
        if (isFullRefund) {
            couponAdjustment = order.couponDiscount;
        } else {
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

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
        wallet = new Wallet({ user: userId, balance: 0 });
    }

    const isFullRefund = !items;
    const description = isFullRefund ? 
        `Refund for order #${order.orderId}` : 
        `Partial refund for order #${order.orderId}`;

    const transaction = {
        type: 'CREDIT',
        amount: refundDetails.totalRefund,
        description: `${description} - ${reason}`,
        orderId: order._id,
        status: 'COMPLETED'
    };

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