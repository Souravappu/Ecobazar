const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Address = require('../../models/Address');
const Product = require('../../models/Products');
const Category = require('../../models/Category');
const User = require('../../models/User');
const orderController = {
    // Get checkout page
    getCheckout: async (req, res) => {
        try {
            const userId = req.session.user;

            // Get cart, addresses, categories
            const [cart, addressRecord, categories] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Address.findOne({ userId }),
                Category.find({ isListed: true, isBlocked: false, isDeleted: false })
            ]);

            if (!cart || cart.items.length === 0) {
                req.flash('error_msg', 'Your cart is empty');
                return res.redirect('/cart');
            }

            // Get addresses array or empty array if no addresses
            const addresses = addressRecord ? addressRecord.address : [];
            let user=await User.findById(req.session.user)
            res.render('user/checkout', {
                cart,
                addresses,
                categories,
                user: user
            });

        } catch (error) {
            console.error('Checkout error:', error);
            res.status(500).render('user/error', {
                message: 'Error loading checkout page',
                categories: []
            });
        }
    },

    // Create new order
    createOrder: async (req, res) => {
        try {
            const userId = req.session.user;
            const { paymentMethod } = req.body;

            // Get cart and address
            const [cart, addressRecord] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Address.findOne({ userId })
            ]);

            if (!cart || cart.items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart is empty'
                });
            }

            // Find default address
            const defaultAddress = addressRecord?.address?.find(addr => addr.isDefault);
            if (!defaultAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'Please set a default shipping address'
                });
            }

            // Create order items with current prices
            const orderItems = cart.items.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.product.salePrice
            }));

            // Calculate totals
            const subtotal = cart.total;
            const shippingCharge = 35;
            const total = subtotal + shippingCharge;

            // Create new order with default address
            const order = new Order({
                user: userId,
                items: orderItems,
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
                paymentMethod,
                subtotal,
                shippingCharge,
                total
            });

            await order.save();

            // Update product quantities
            const updatePromises = cart.items.map(item => 
                Product.findByIdAndUpdate(item.product._id, {
                    $inc: { quantity: -item.quantity }
                })
            );
            await Promise.all(updatePromises);

            // Clear cart
            await Cart.findOneAndDelete({ user: userId });

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

    // Add these methods to your orderController
    getOrderConfirmation: async (req, res) => {
        try {
            const orderId = req.params.orderId;
            const [order, categories] = await Promise.all([
                Order.findOne({ orderId }).populate('items.product'),
                Category.find({ isListed: true })
            ]);

            if (!order) {
                return res.status(404).render('user/error', {
                    message: 'Order not found',
                    title: 'Error',
                    categories: []
                });
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

            // Get total count of orders for pagination
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
                }
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
            const [order, categories] = await Promise.all([
                Order.findById(orderId)
                    .populate('items.product')
                    .populate('user', 'fname lname email'),
                Category.find({ isListed: true })
            ]);

            if (!order) {
                return res.status(404).render('user/error', {
                    message: 'Order not found',
                    title: 'Error',
                    categories
                });
            }

            // Check if the order belongs to the logged-in user
            if (order.user._id.toString() !== req.session.user) {
                return res.status(403).render('user/error', {
                    message: 'Unauthorized access',
                    title: 'Error',
                    categories
                });
            }
            let user=await User.findById(req.session.user)
            res.render('user/order-details', {
                order,
                title: `Order #${order.orderId}`,
                categories,
                user:user
            });
        } catch (error) {
            console.error('Error loading order details:', error);
            res.status(500).render('user/error', {
                message: 'Error loading order details',
                title: 'Error',
                categories: []
            });
        }
    },

    // Add these methods to orderController
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

            // Check if order can be cancelled
            if (['Delivered', 'Cancelled'].includes(order.orderStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'Order cannot be cancelled'
                });
            }

            // Update order status and add cancellation details
            order.orderStatus = 'Cancelled';
            order.cancelReason = reason;
            order.cancelledAt = new Date();

            // Update all non-cancelled items with the same reason
            order.items.forEach(item => {
                if (item.status !== 'Cancelled') {
                    item.status = 'Cancelled';
                    item.cancelReason = reason;
                    item.cancelledAt = new Date();
                }
            });

            // Restore product quantities only for newly cancelled items
            const updatePromises = order.items
                .filter(item => item.status !== 'Cancelled')
                .map(item => 
                    Product.findByIdAndUpdate(item.product, {
                        $inc: { quantity: item.quantity }
                    })
                );

            await Promise.all([order.save(), ...updatePromises]);

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

            const orderItem = order.items.id(itemId);
            if (!orderItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Order item not found'
                });
            }

            // Check if item can be cancelled
            if (['Delivered', 'Cancelled'].includes(orderItem.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Item cannot be cancelled'
                });
            }

            // Update item status
            orderItem.status = 'Cancelled';
            orderItem.cancelReason = reason;
            orderItem.cancelledAt = new Date();

            // Restore product quantity
            await Product.findByIdAndUpdate(orderItem.product, {
                $inc: { quantity: orderItem.quantity }
            });

            // Check if this is the last active item
            const activeItems = order.items.filter(item => item.status !== 'Cancelled');
            if (activeItems.length === 0) {
                // If this is the last item, cancel the entire order with the same reason
                order.orderStatus = 'Cancelled';
                order.cancelReason = reason;
                order.cancelledAt = new Date();
            }

            // Recalculate order totals
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
    }
};

module.exports = orderController; 