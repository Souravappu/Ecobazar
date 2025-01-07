const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Address = require('../../models/Address');
const Product = require('../../models/Products');
const Category = require('../../models/Category');
const User = require('../../models/User');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Wallet = require('../../models/Wallet');
const Coupon = require('../../models/Coupon');
const { processRefund } = require('../../utils/refundHandler');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.KEY_ID,
    key_secret: process.env.KEY_SECRET
});

const orderController = {
    getCheckout: async (req, res) => {
        try {
            const userId = req.session.user;

            const [cart, addressRecord, categories, user] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Address.findOne({ userId }),
                Category.find({ isListed: true, isBlocked: false, isDeleted: false }),
                User.findById(userId).populate('wallet')  
            ]);

            if (!cart || cart.items.length === 0) {
                req.flash('error_msg', 'Your cart is empty');
                return res.redirect('/cart');
            }

            const addresses = addressRecord ? addressRecord.address : [];

            const wallet = await Wallet.findOne({ user: userId });
            const walletBalance = wallet ? wallet.balance : 0;

            res.render('user/checkout', {
                cart,
                addresses,
                categories,
                user,
                walletBalance,
                appliedCoupon: null
            });

        } catch (error) {
            console.error('Checkout error:', error);
            res.status(500).render('user/error', {
                message: 'Error loading checkout page',
                categories: []
            });
        }
    },

    createOrder: async (req, res) => {
        try {
            const userId = req.session.user;
            const { paymentMethod, useWallet, walletAmount, couponCode } = req.body;
            
            const [cart, addressRecord, wallet, user] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Address.findOne({ userId }),
                Wallet.findOne({ user: userId }),
                User.findById(userId).populate('appliedCoupons.coupon')
            ]);

            const appliedCouponData = user.appliedCoupons.find(ac => ac.status === 'applied');
            const coupon = appliedCouponData?.coupon;
            let couponDiscount = appliedCouponData?.discountAmount || 0;

            if (!cart || cart.items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart is empty'
                });
            }

            const defaultAddress = addressRecord?.address?.find(addr => addr.isDefault);
            if (!defaultAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'Please set a default shipping address'
                });
            }

            const subtotal = cart.total;
            const shippingCharge = 35;
            let finalWalletAmount = Number(walletAmount) || 0;
            let total = subtotal + shippingCharge - couponDiscount;

            // Validate COD restrictions
            if (paymentMethod === 'COD') {
                if (finalWalletAmount > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cash on Delivery is not available when using wallet payment'
                    });
                }
                if (couponDiscount > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cash on Delivery is not available when using coupons'
                    });
                }
                if (total > 500) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cash on Delivery is not available for orders above ₹500'
                    });
                }
            }
            
            await User.findByIdAndUpdate(userId, {
                $push: {
                    appliedCoupons: {
                        coupon: coupon,
                        discountAmount: couponDiscount,
                        status: 'applied'
                    }
                }
            });

            const order = new Order({
                user: userId,
                items: cart.items.map(item => ({
                    product: item.product._id,
                    quantity: item.quantity,
                    price: item.product.salePrice
                })),
                shippingAddress: {
                    name: defaultAddress.name,
                    phone: defaultAddress.phone,
                    streetAddress: defaultAddress.streetAddress,
                    city: defaultAddress.city,
                    postalCode: defaultAddress.postalCode,
                    apartment: defaultAddress.apartment,
                    landMark: defaultAddress.landMark,
                    addressType: defaultAddress.addressType
                },
                paymentMethod: finalWalletAmount > 0 ? 'WALLET_PLUS_ONLINE' : 'ONLINE',
                paymentStatus: 'Paid',
                walletAmount: finalWalletAmount,
                coupon: coupon?._id,
                couponDiscount,
                subtotal,
                shippingCharge,
                total
            });

            if (coupon) {
                coupon.usedCount += 1;
                await Promise.all([
                    coupon.save(),
                    User.findByIdAndUpdate(userId, {
                        $push: { couponUsed: coupon._id },
                        $set: {
                            'appliedCoupons.$[elem].status': 'used',
                            'appliedCoupons.$[elem].orderId': order._id
                        }
                    }, {
                        arrayFilters: [{ 
                            'elem.coupon': coupon._id,
                            'elem.status': 'applied'
                        }]
                    })
                ]);
            }

            if (finalWalletAmount > 0) {
                const walletTransaction = {
                    type: 'DEBIT',
                    amount: finalWalletAmount,
                    description: `Payment for order ${order.orderId}`,
                    orderId: order._id,
                    status: 'COMPLETED'
                };
                
                wallet.balance -= finalWalletAmount;
                wallet.transactions.push(walletTransaction);
                await wallet.save();
            }

            await order.save();

            const updatePromises = cart.items.map(item => 
                Product.findByIdAndUpdate(item.product._id, {
                    $inc: { quantity: -item.quantity }
                })
            );

            await Promise.all([...updatePromises, Cart.findOneAndDelete({ user: userId })]);

            res.json({
                success: true,
                message: 'Order placed successfully',
                orderId: order.orderId
            });

        } catch (error) {
            console.error('Create order error:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating order'
            });
        }
    },

    getOrderConfirmation: async (req, res) => {
        try {
            const orderId = req.params.orderId;
            
            let [order, categories] = await Promise.all([
                Order.findOne({orderId }).populate('items.product'),
                Category.find({ isListed: true })
            ]);
        

            if (!order) {
                 order=await Order.findOne({_id:orderId})
                if(!order){
                    return res.status(404).render('user/error', {
                        message: 'Order not found',
                        title: 'Error',
                        categories: []
                    });
                }
            }
            let userId=req.session.user
            let user=await User.findById(userId)
            res.render('user/order-confirmation', {
                order,
                user:user,
                title: 'Order Confirmed',
                categories,
            });
        } catch (error) {
            console.error('Error loading order confirmation:', error);
            res.status(500).render('user/error', {
                message: 'Error loading order confirmation',
                title: 'Error',
                categories: []
            });
        }
    },


    
    getUserOrders: async (req, res) => {
        try {
            const userId = req.session.user;
            const page = parseInt(req.query.page) || 1;
            const limit = 5; 
            const skip = (page - 1) * limit;

            const totalOrders = await Order.countDocuments({ user: userId });
            const totalPages = Math.ceil(totalOrders / limit);

            const [orders, categories] = await Promise.all([
                Order.find({ user: userId })
                    .populate('items.product')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit),
                Category.find({ isListed: true })
            ]);

            const userData = await User.findById(userId);
        
            if (!userData) {
                return res.redirect('/login');
            }

            const address = await Address.findOne({
                userId: userId,
                "address.isDefault": true
            });

            res.render('user/orders', {
                orders,
                user: userData,
                address: address,
                title: 'My Orders',
                categories,
                pagination: {
                    page,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                currentPage: 'orders'
            });
        } catch (error) {
            console.error('Error loading orders:', error);
            res.status(500).render('user/error', {
                message: 'Error loading orders',
                title: 'Error',
                categories: []
            });
        }
    },

    getOrderDetails: async (req, res) => {
        try {
            const orderId = req.params.id;
            
            if (orderId === 'failed') {
                return res.redirect('/order/failed');
            }

            const [order, categories] = await Promise.all([
                Order.findById(orderId).populate('items.product'),
                Category.find({ isListed: true })
            ]);

            if (!order) {
                return res.status(404).render('user/error', {
                    message: 'Order not found',
                    categories: []
                });
            }

            const user = await User.findById(req.session.user);

            res.render('user/order-details', {
                order,
                categories,
                user,
                title: 'Order Details'
            });
        } catch (error) {
            console.error('Error loading order details:', error);
            res.status(500).render('user/error', {
                message: 'Error loading order details',
                categories: []
            });
        }
    },

    cancelOrder: async (req, res) => {
        try {
            const { orderId } = req.params;
            const { reason } = req.body;
            const userId = req.session.user;

            const order = await Order.findOne({ _id: orderId, user: userId });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            if (['Delivered', 'Cancelled', 'Returned'].includes(order.orderStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'Order cannot be cancelled'
                });
            }

            order.orderStatus = 'Cancelled';
            order.cancelReason = reason;
            order.cancelledAt = new Date();

            const stockUpdatePromises = order.items.map(async item => {
                if (item.status !== 'Cancelled') {
                    item.status = 'Cancelled';
                    item.cancelReason = reason;
                    item.cancelledAt = new Date();

                    return Product.findByIdAndUpdate(item.product, {
                        $inc: { quantity: item.quantity }
                    });
                }
                return Promise.resolve();
            });

            if (order.paymentMethod !== 'COD') {
                await processRefund(order, null, reason);
            }

            await Promise.all([...stockUpdatePromises, order.save()]);

            res.json({
                success: true,
                message: 'Order cancelled successfully'
            });

        } catch (error) {
            console.error('Cancel order error:', error);
            res.status(500).json({
                success: false,
                message: 'Error cancelling order'
            });
        }
    },

    cancelOrderItem: async (req, res) => {
        try {
            const { orderId, itemId } = req.params;
            const { reason } = req.body;
            const userId = req.session.user;

            const order = await Order.findOne({ _id: orderId, user: userId });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            const item = order.items.id(itemId);
            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Order item not found'
                });
            }

            if (['Delivered', 'Cancelled', 'Returned'].includes(item.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Item cannot be cancelled'
                });
            }

            item.status = 'Cancelled';
            item.cancelReason = reason;
            item.cancelledAt = new Date();

            await Product.findByIdAndUpdate(item.product, {
                $inc: { quantity: item.quantity }
            });

            const allItemsCancelled = order.items.every(item => 
                item.status === 'Cancelled'
            );

            if (allItemsCancelled) {
                order.orderStatus = 'Cancelled';
                order.cancelReason = reason;
                order.cancelledAt = new Date();
            }

            if (order.paymentMethod !== 'COD') {
                await processRefund(order, [item], reason);
            }

            const activeItems = order.items.filter(item => item.status !== 'Cancelled');
            order.subtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            order.total = order.subtotal + order.shippingCharge;

            await order.save();

            res.json({
                success: true,
                message: 'Item cancelled successfully'
            });

        } catch (error) {
            console.error('Cancel item error:', error);
            res.status(500).json({
                success: false,
                message: 'Error cancelling item'
            });
        }
    },

    createRazorpayOrder: async (req, res) => {
        try {
            const userId = req.session.user;
            const { useWallet, walletAmount, coupon } = req.body;
            
            const [cart, wallet, user] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Wallet.findOne({ user: userId }),
                User.findById(userId).populate('appliedCoupons.coupon')
            ]);

            if (!cart || cart.items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart is empty'
                });
            }

            const total = cart.total + 35; // Add shipping charge
            let finalAmount = total;

            // Apply coupon discount if available
            if (coupon && coupon.discountAmount) {
                finalAmount -= Number(coupon.discountAmount);
            }

            // Apply wallet amount if using wallet
            if (useWallet && walletAmount > 0) {
                if (!wallet || wallet.balance < walletAmount) {
                    return res.status(400).json({
                        success: false,
                        message: 'Insufficient wallet balance'
                    });
                }
                finalAmount -= Number(walletAmount);
            }

            // Ensure minimum amount is 1 rupee (100 paise)
            const options = {
                amount: Math.max(Math.round(finalAmount * 100), 100),
                currency: "INR",
                receipt: `order_${Date.now()}`
            };

            const order = await razorpay.orders.create(options);

            res.json({
                success: true,
                orderId: order.id,
                amount: order.amount,
                finalAmount: finalAmount
            });

        } catch (error) {
            console.error('Create Razorpay order error:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating payment order'
            });
        }
    },

    verifyPayment: async (req, res) => {
        try {
            const { razorpay_payment_id, razorpay_order_id, razorpay_signature, useWallet, walletAmount, coupon } = req.body;
            const userId = req.session.user;

            const existingOrder = await Order.findOne({ razorpayOrderId: razorpay_order_id });
            if (existingOrder) {
                if (!razorpay_signature) {
                    existingOrder.paymentStatus = 'Failed';
                    existingOrder.orderStatus = 'Payment Failed';
                    await existingOrder.save();
                    
                    return res.json({
                        success: false,
                        orderId: existingOrder._id,
                        message: 'Payment verification failed'
                    });
                }

                const hmac = crypto.createHmac('sha256', process.env.KEY_SECRET);
                hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
                const generatedSignature = hmac.digest('hex');

                if (generatedSignature === razorpay_signature) {
                    existingOrder.paymentStatus = 'Paid';
                    existingOrder.orderStatus = 'Processing';
                    existingOrder.razorpayPaymentId = razorpay_payment_id;
                    await existingOrder.save();

                    return res.json({
                        success: true,
                        orderId: existingOrder.orderId,
                        message: 'Payment successful'
                    });
                } else {
                    existingOrder.paymentStatus = 'Failed';
                    existingOrder.orderStatus = 'Payment Failed';
                    await existingOrder.save();

                    return res.json({
                        success: false,
                        orderId: existingOrder.orderId,
                        message: 'Payment verification failed'
                    });
                }
            }

            const [cart, addressRecord] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Address.findOne({ userId })
            ]);

            if (!cart || !addressRecord) {
                throw new Error('Cart or address not found');
            }

            const defaultAddress = addressRecord.address.find(addr => addr.isDefault);
            if (!defaultAddress) {
                throw new Error('Default address not found');
            }

            const subtotal = cart.total;
            const shippingCharge = 35;
            let total = subtotal + shippingCharge;

            if (useWallet && walletAmount) {
                total -= Number(walletAmount);
            }

            if (coupon && coupon.discountAmount) {
                total -= Number(coupon.discountAmount);
            }

            const order = new Order({
                user: userId,
                items: cart.items.map(item => ({
                    product: item.product._id,
                    quantity: item.quantity,
                    price: item.product.salePrice,
                    status: 'Processing'
                })),
                shippingAddress: {
                    name: defaultAddress.name,
                    phone: defaultAddress.phone,
                    streetAddress: defaultAddress.streetAddress,
                    city: defaultAddress.city,
                    postalCode: defaultAddress.postalCode,
                    apartment: defaultAddress.apartment || '',
                    landMark: defaultAddress.landMark || '',
                    addressType: defaultAddress.addressType
                },
                paymentMethod: useWallet ? 'WALLET_PLUS_ONLINE' : 'ONLINE',
                paymentStatus: razorpay_signature ? 'Paid' : 'Failed',
                orderStatus: razorpay_signature ? 'Processing' : 'Payment Failed',
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                walletAmount: useWallet ? Number(walletAmount) : 0,
                subtotal: subtotal,
                shippingCharge: shippingCharge,
                total: total,
                coupon: coupon?.couponId,
                couponDiscount: coupon?.discountAmount || 0
            });

            if (razorpay_signature) {
                const hmac = crypto.createHmac('sha256', process.env.KEY_SECRET);
                hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
                const generatedSignature = hmac.digest('hex');

                if (generatedSignature !== razorpay_signature) {
                    order.paymentStatus = 'Failed';
                    order.orderStatus = 'Payment Failed';
                }
            }

            await order.save();

            if (useWallet && walletAmount > 0) {
                const wallet = await Wallet.findOne({ user: userId });
                if (wallet) {
                    wallet.balance -= Number(walletAmount);
                    wallet.transactions.push({
                        type: 'DEBIT',
                        amount: Number(walletAmount),
                        description: `Payment for order ${order.orderId}`,
                        orderId: order._id,
                        status: 'COMPLETED'
                    });
                    await wallet.save();
                }
            }

            if (coupon?.couponId) {
                await Promise.all([
                    Coupon.findByIdAndUpdate(coupon.couponId, { $inc: { usedCount: 1 } }),
                    User.findByIdAndUpdate(userId, {
                        $push: { 
                            couponUsed: coupon.couponId,
                            appliedCoupons: {
                                coupon: coupon.couponId,
                                discountAmount: coupon.discountAmount,
                                status: 'used',
                                orderId: order._id
                            }
                        }
                    })
                ]);
            }

            await Cart.findOneAndDelete({ user: userId });

            const updatePromises = cart.items.map(item => 
                Product.findByIdAndUpdate(item.product._id, {
                    $inc: { quantity: -item.quantity }
                })
            );
            await Promise.all(updatePromises);

            res.json({
                success: order.paymentStatus === 'Paid',
                orderId: order._id,
                message: order.paymentStatus === 'Paid' ? 'Payment successful' : 'Payment failed'
            });

        } catch (error) {
            console.error('Payment verification error:', error);
            res.status(500).json({
                success: false,
                message: 'Error processing payment'
            });
        }
    },

    requestOrderReturn: async (req, res) => {
        try {
            const { orderId } = req.params;
            const { reason } = req.body;
            const userId = req.session.user;

            const order = await Order.findOne({ _id: orderId, user: userId });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            if (order.orderStatus !== 'Delivered' || order.returnRequested) {
                return res.status(400).json({
                    success: false,
                    message: 'Order is not eligible for return'
                });
            }

            order.returnRequested = true;
            order.returnReason = reason;
            order.returnRequestedAt = new Date();
            order.returnStatus = 'Pending';

            order.items.forEach(item => {
                if (item.status === 'Delivered') {
                    item.returnRequested = true;
                    item.returnReason = reason;
                    item.returnRequestedAt = new Date();
                    item.returnStatus = 'Pending';
                }
            });

            await order.save();

            res.json({
                success: true,
                message: 'Return request submitted successfully'
            });

        } catch (error) {
            console.error('Request return error:', error);
            res.status(500).json({
                success: false,
                message: 'Error requesting return'
            });
        }
    },

    requestItemReturn: async (req, res) => {
        try {
            const { orderId, itemId } = req.params;
            const { reason } = req.body;
            const userId = req.session.user;

            const order = await Order.findOne({ _id: orderId, user: userId });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            const orderItem = order.items.id(itemId);
            if (!orderItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Order item not found'
                });
            }

            if (orderItem.status !== 'Delivered' || orderItem.returnRequested) {
                return res.status(400).json({
                    success: false,
                    message: 'Item is not eligible for return'
                });
            }

            orderItem.returnRequested = true;
            orderItem.returnReason = reason;
            orderItem.returnRequestedAt = new Date();
            orderItem.returnStatus = 'Pending';

            const allItemsReturning = order.items.every(item => 
                item.returnRequested || item.status === 'Returned'
            );

            if (allItemsReturning) {
                order.returnRequested = true;
                order.returnReason = 'All items requested for return';
                order.returnRequestedAt = new Date();
                order.returnStatus = 'Pending';
            }

            await order.save();

            res.json({
                success: true,
                message: 'Return request submitted successfully'
            });

        } catch (error) {
            console.error('Request item return error:', error);
            res.status(500).json({
                success: false,
                message: 'Error requesting item return'
            });
        }
    },

    getOrderFailed: async (req, res) => {
        try {
            const orderId = req.params.orderId;
            const categories = await Category.find({ isListed: true });
            const user = await User.findById(req.session.user);
            
            let order = null;
            if (orderId && orderId !== 'failed' && orderId !== 'undefined') {
                try {
                    order = await Order.findById(orderId).populate('items.product');
                } catch (error) {
                    console.error('Error finding order:', error);
                }
            }

            res.render('user/order-failed', {
                order,
                categories,
                user,
                title: 'Payment Failed'
            });
        } catch (error) {
            console.error('Error loading order failed page:', error);
            res.status(500).render('user/error', {
                message: 'Error loading order failed page',
                categories: []
            });
        }
    },

    retryPayment: async (req, res) => {
        try {
            const orderId = req.params.orderId;
            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            if (order.paymentStatus !== 'Failed' || order.orderStatus !== 'Payment Failed') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order status for retry'
                });
            }

            let finalAmount = order.total;
            if (order.walletAmount > 0) {
                finalAmount -= order.walletAmount;
            }

            const razorpayOrder = await razorpay.orders.create({
                amount: Math.round(finalAmount * 100),
                currency: 'INR',
                receipt: order._id.toString()
            });

            order.razorpayOrderId = razorpayOrder.id;
            await order.save();

            res.json({
                success: true,
                orderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                key_id: process.env.KEY_ID,
                prefill: {
                    name: order.shippingAddress.name,
                    contact: order.shippingAddress.phone
                }
            });

        } catch (error) {
            console.error('Retry payment error:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrying payment'
            });
        }
    },

    abortOrder: async (req, res) => {
        try {
            const orderId = req.params.orderId;
            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            if (order.paymentStatus !== 'Failed' || order.orderStatus !== 'Payment Failed') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order status for abort'
                });
            }

            const stockUpdatePromises = order.items.map(item =>
                Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { quantity: item.quantity } }
                )
            );

            if (order.walletAmount > 0) {
                const wallet = await Wallet.findOne({ user: order.user });
                if (wallet) {
                    const walletTransaction = {
                        type: 'CREDIT',
                        amount: order.walletAmount,
                        description: `Refund for aborted order ${order.orderId}`,
                        orderId: order._id,
                        status: 'COMPLETED'
                    };
                    
                    wallet.balance += order.walletAmount;
                    wallet.transactions.push(walletTransaction);
                    await wallet.save();
                }
            }

            if (order.coupon) {
                const user = await User.findById(order.user);
                if (user) {
                    user.couponUsed = user.couponUsed.filter(id => 
                        id.toString() !== order.coupon.toString()
                    );
                    await user.save();
                }
            }

            order.orderStatus = 'Cancelled';
            order.paymentStatus = 'Aborted';
            order.cancelReason = 'Payment failed and order aborted by user';
            order.cancelledAt = new Date();
            await order.save();

            await Promise.all(stockUpdatePromises);

            res.json({
                success: true,
                message: 'Order aborted successfully'
            });

        } catch (error) {
            console.error('Abort order error:', error);
            res.status(500).json({
                success: false,
                message: 'Error aborting order'
            });
        }
    },

    handlePaymentModalClose: async (req, res) => {
        try {
            const { razorpay_order_id, useWallet, walletAmount, coupon, error } = req.body;
            const userId = req.session.user;

            const [cart, addressRecord] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Address.findOne({ userId })
            ]);

            if (!cart || !addressRecord) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart or address not found'
                });
            }

            const defaultAddress = addressRecord.address.find(addr => addr.isDefault);
            if (!defaultAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'Default address not found'
                });
            }

            const subtotal = cart.total;
            const shippingCharge = 35;
            let total = subtotal + shippingCharge;

            if (useWallet && walletAmount) {
                total -= Number(walletAmount);
            }

            if (coupon && coupon.discountAmount) {
                total -= Number(coupon.discountAmount);
            }

            const order = new Order({
                user: userId,
                items: cart.items.map(item => ({
                    product: item.product._id,
                    quantity: item.quantity,
                    price: item.product.salePrice,
                    status: 'Pending'
                })),
                shippingAddress: {
                    name: defaultAddress.name,
                    phone: defaultAddress.phone,
                    streetAddress: defaultAddress.streetAddress,
                    city: defaultAddress.city,
                    postalCode: defaultAddress.postalCode,
                    apartment: defaultAddress.apartment || '',
                    landMark: defaultAddress.landMark || '',
                    addressType: defaultAddress.addressType
                },
                paymentMethod: useWallet ? 'WALLET_PLUS_ONLINE' : 'ONLINE',
                paymentStatus: 'Failed',
                orderStatus: 'Payment Failed',
                razorpayOrderId: razorpay_order_id,
                walletAmount: useWallet ? Number(walletAmount) : 0,
                subtotal: subtotal,
                shippingCharge: shippingCharge,
                total: total,
                coupon: coupon?.couponId,
                couponDiscount: coupon?.discountAmount || 0,
                cancelReason: error ? `Payment failed: ${error.description || error.reason || 'Unknown error'}` : 'Payment modal closed by user'
            });

            await order.save();

            await Cart.findOneAndDelete({ user: userId });

            res.json({
                success: true,
                orderId: order._id.toString()
            });

        } catch (error) {
            console.error('Error handling payment modal close:', error);
            res.status(500).json({
                success: false,
                message: 'Error handling payment modal close'
            });
        }
    },

    downloadInvoice: async (req, res) => {
        try {
            const orderId = req.params.orderId;
            const order = await Order.findById(orderId)
                .populate('user')
                .populate('items.product');

            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }

            const doc = new PDFDocument({
                margin: 50
            });
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
            
            doc.pipe(res);

            doc.fontSize(20).text('Ecobazar', { align: 'center' });
            doc.fontSize(14).text('Invoice', { align: 'center' });
            doc.moveDown();

            doc.moveTo(50, doc.y)
               .lineTo(550, doc.y)
               .stroke();
            doc.moveDown();

            const startY = doc.y;
            doc.fontSize(10);
            doc.text('Bill To:', 50, startY);
            doc.fontSize(12);
            doc.text(order.shippingAddress.name, 50, startY + 20);
            doc.fontSize(10);
            doc.text(order.shippingAddress.streetAddress, 50, startY + 35);
            if (order.shippingAddress.apartment) {
                doc.text(order.shippingAddress.apartment, 50, startY + 50);
            }
            doc.text(`${order.shippingAddress.city} - ${order.shippingAddress.postalCode}`, 50, startY + 65);
            doc.text(`Phone: ${order.shippingAddress.phone}`, 50, startY + 80);

            doc.fontSize(10);
            doc.text('Invoice Details:', 350, startY);
            doc.text(`Invoice No: ${order.orderId}`, 350, startY + 20);
            doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}`, 350, startY + 35);
            doc.text(`Payment Status: ${order.paymentStatus}`, 350, startY + 50);
            doc.text(`Payment Method: ${order.paymentMethod}`, 350, startY + 65);

            doc.moveDown(5);

            doc.moveTo(50, doc.y)
               .lineTo(550, doc.y)
               .stroke();
            doc.moveDown();

            const tableTop = doc.y;
            doc.fillColor('#f3f4f6')
               .rect(50, tableTop, 500, 20)
               .fill();
            doc.fillColor('#000');

            doc.fontSize(10);
            doc.text('Item', 60, tableTop + 5);
            doc.text('Quantity', 280, tableTop + 5);
            doc.text('Price', 380, tableTop + 5);
            doc.text('Total', 480, tableTop + 5);

            let tableRow = tableTop + 25;

            order.items.forEach((item, index) => {
                doc.text(item.product.name, 60, tableRow);
                doc.text(item.quantity.toString(), 280, tableRow);
                doc.text(`₹${item.price.toFixed(2)}`, 380, tableRow);
                doc.text(`₹${(item.quantity * item.price).toFixed(2)}`, 480, tableRow);
                tableRow += 20;

                if (index < order.items.length - 1) {
                    doc.moveTo(50, tableRow - 5)
                       .lineTo(550, tableRow - 5)
                       .strokeColor('#e5e7eb')
                       .stroke();
                }
            });

            doc.moveTo(50, tableRow + 5)
               .lineTo(550, tableRow + 5)
               .strokeColor('#000')
               .stroke();

            tableRow += 20;
            doc.fontSize(10);
            doc.text('Subtotal:', 380, tableRow);
            doc.text(`₹${order.subtotal.toFixed(2)}`, 480, tableRow);

            tableRow += 20;
            doc.text('Shipping:', 380, tableRow);
            doc.text(`₹${order.shippingCharge.toFixed(2)}`, 480, tableRow);

            if (order.couponDiscount) {
                tableRow += 20;
                doc.text('Discount:', 380, tableRow);
                doc.text(`-₹${order.couponDiscount.toFixed(2)}`, 480, tableRow);
            }

            if (order.walletAmount) {
                tableRow += 20;
                doc.text('Wallet Amount:', 380, tableRow);
                doc.text(`-₹${order.walletAmount.toFixed(2)}`, 480, tableRow);
            }

            tableRow += 25;
            doc.fillColor('#f3f4f6')
               .rect(350, tableRow - 5, 200, 25)
               .fill();
            doc.fillColor('#000');
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('Total:', 380, tableRow);
            doc.text(`₹${order.total.toFixed(2)}`, 480, tableRow);

            doc.fontSize(10).font('Helvetica');
            doc.text('Thank you for shopping with Ecobazar!', 50, doc.page.height - 100, {
                align: 'center'
            });

            doc.end();
        } catch (error) {
            console.error('Error generating invoice:', error);
            res.status(500).json({ message: 'Error generating invoice' });
        }
    }
};

module.exports = {
    getCheckout: orderController.getCheckout,
    placeOrder: orderController.createOrder,
    getOrderDetails: orderController.getOrderDetails,
    getOrders: orderController.getUserOrders,
    cancelOrder: orderController.cancelOrder,
    getOrderFailed: orderController.getOrderFailed,
    retryPayment: orderController.retryPayment,
    abortOrder: orderController.abortOrder,
    downloadInvoice: orderController.downloadInvoice,
    createOrder: orderController.createOrder,
    getOrderConfirmation: orderController.getOrderConfirmation,
    getUserOrders: orderController.getUserOrders,
    cancelOrderItem: orderController.cancelOrderItem,
    createRazorpayOrder: orderController.createRazorpayOrder,
    verifyPayment: orderController.verifyPayment,
    handlePaymentModalClose: orderController.handlePaymentModalClose,
    requestOrderReturn: orderController.requestOrderReturn,
    requestItemReturn: orderController.requestItemReturn
}; 