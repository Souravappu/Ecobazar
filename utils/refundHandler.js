const Wallet = require('../models/Wallet');
const Coupon = require('../models/Coupon');
const User = require('../models/User');

const calculateRefundAmount = (order, items = null, reason = '') => {
    // Determine order stage and type
    const isFullRefund = !items;
    const isEarlyStage = order.orderStatus === 'Pending' || order.orderStatus === 'Processing';
    const isShippingStage = order.orderStatus === 'Shipped';
    const isDeliveredStage = order.orderStatus === 'Delivered';
    const isReturn = reason.toLowerCase().includes('return') || order.returnRequested;
    
    // Helper function to check if this is the last active item
    const checkIsLastActiveItem = (items, order) => {
        const remainingItems = order.items.filter(orderItem => 
            orderItem.status !== 'Cancelled' && 
            orderItem.status !== 'Returned' &&
            !items.find(i => i._id.toString() === orderItem._id.toString())
        );
        return remainingItems.length === 0;
    };

    // Helper function to calculate proportional amount
    const calculateProportion = (itemAmount, totalAmount, targetAmount) => {
        if (targetAmount && totalAmount > 0) {
            return Math.round((itemAmount / totalAmount) * targetAmount);
        }
        return 0;
    };

    let refundDetails;
    
    if (isFullRefund) {
        // For full order refund
        refundDetails = {
            itemAmount: order.subtotal,
            couponAmount: order.couponDiscount || 0,
            walletAmount: order.walletAmount || 0,
            shippingAmount: isEarlyStage ? (order.shippingCharge || 0) : 0
        };
    } else {
        // For partial refund
        const itemsToRefund = items.map(item => {
            const orderItem = order.items.find(i => i._id.toString() === item._id.toString());
            return {
                price: orderItem.price,
                quantity: orderItem.quantity
            };
        });

        const itemSubtotal = itemsToRefund.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const isLastItem = checkIsLastActiveItem(items, order);

        refundDetails = {
            itemAmount: itemSubtotal,
            couponAmount: calculateProportion(itemSubtotal, order.subtotal, order.couponDiscount),
            walletAmount: calculateProportion(itemSubtotal, order.subtotal, order.walletAmount),
            shippingAmount: (isLastItem && isEarlyStage) ? (order.shippingCharge || 0) : 0
        };
    }

    // Calculate net refund amount (after coupon deduction)
    const netAmount = refundDetails.itemAmount - refundDetails.couponAmount;

    // Calculate wallet and online portions
    const walletPortion = order.walletAmount ? 
        calculateProportion(netAmount, order.subtotal - order.couponDiscount, order.walletAmount) : 0;
    const onlinePortion = netAmount - walletPortion;

    return {
        itemsAmount: refundDetails.itemAmount,
        shippingAmount: refundDetails.shippingAmount,
        walletRefund: walletPortion,
        onlineRefund: onlinePortion,
        couponRefund: refundDetails.couponAmount,
        totalRefund: netAmount + refundDetails.shippingAmount,
        isEarlyStage,
        isShippingStage,
        isDeliveredStage,
        isReturn,
        paymentStatus: order.paymentStatus,
        isLastItem: isFullRefund || checkIsLastActiveItem(items, order)
    };
};

async function processRefund(order, items = null, reason) {
    try {
        // Calculate refund details using the updated calculation function
        const refundDetails = calculateRefundAmount(order, items, reason);
        const {
            totalRefund,
            walletRefund,
            couponRefund,
            isReturn,
            isLastItem
        } = refundDetails;

        // Find user's wallet
        const wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
            throw new Error('User wallet not found');
        }

        // Handle different payment methods
        switch (order.paymentMethod) {
            case 'COD':
                // For COD, only refund wallet amount and coupon amount if used
                if (order.walletAmount > 0 || couponRefund > 0) {
                    const totalWalletRefund = walletRefund + couponRefund;
                    if (totalWalletRefund > 0) {
                        await processWalletRefund(wallet, totalWalletRefund, order._id, reason);
                    }
                }
                break;

            case 'ONLINE':
                // For online payments, refund entire amount to wallet
                if (totalRefund > 0) {
                    await processWalletRefund(wallet, totalRefund, order._id, reason);
                }
                break;

            case 'WALLET':
                // Refund back to wallet including coupon amount
                if (totalRefund > 0) {
                    await processWalletRefund(wallet, totalRefund, order._id, reason);
                }
                break;

            case 'WALLET_PLUS_COD':
                // Refund wallet amount and coupon proportionally
                if (walletRefund > 0 || couponRefund > 0) {
                    const totalWalletRefund = walletRefund + couponRefund;
                    if (totalWalletRefund > 0) {
                        await processWalletRefund(wallet, totalWalletRefund, order._id, reason);
                    }
                }
                break;

            case 'WALLET_PLUS_ONLINE':
                // Refund entire amount to wallet
                if (totalRefund > 0) {
                    await processWalletRefund(wallet, totalRefund, order._id, reason);
                }
                break;

            default:
                throw new Error('Invalid payment method');
        }

        // If this is a full refund or last item, update coupon usage
        if ((isLastItem || !items) && order.coupon) {
            await Promise.all([
                // Decrement coupon usage count
                Coupon.findByIdAndUpdate(order.coupon, {
                    $inc: { usedCount: -1 }
                }),
                // Remove coupon from user's used coupons
                User.findByIdAndUpdate(order.user, {
                    $pull: {
                        couponUsed: order.coupon,
                        appliedCoupons: {
                            coupon: order.coupon,
                            orderId: order._id
                        }
                    }
                })
            ]);
        }

        return true;
    } catch (error) {
        console.error('Refund processing error:', error);
        throw error;
    }
}

async function processWalletRefund(wallet, amount, orderId, reason) {
    // Create refund transaction
    const refundTransaction = {
        type: 'CREDIT',
        amount: amount,
        description: `Refund: ${reason}`,
        orderId: orderId,
        status: 'COMPLETED'
    };

    // Add transaction and update balance
    wallet.transactions.push(refundTransaction);
    wallet.balance += amount;

    // Save wallet
    await wallet.save();
}

module.exports = {
    calculateRefundAmount,
    processRefund
}; 