const Order = require('../../models/Order');
const Product = require('../../models/Products');

const orderController = {
    getOrders: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const skip = (page - 1) * limit;

            // filtering 
            const status = req.query.status;
            const search = req.query.search;
            const dateRange = req.query.dateRange;
            const sortBy = req.query.sortBy || 'createdAt';
            const sortOrder = req.query.sortOrder || 'desc';

            // Build query
            let query = {};

            // Status filter
            if (status && status !== 'all') {
                query.orderStatus = status;
            }

            // Search filter
            if (search) {
                query.$or = [
                    { orderId: { $regex: search, $options: 'i' } },
                    { 'shippingAddress.name': { $regex: search, $options: 'i' } },
                    { 'shippingAddress.phone': { $regex: search, $options: 'i' } }
                ];
            }

            // Date range filter
            if (dateRange) {
                const [startStr, endStr] = dateRange.split(' - ').map(date => date.trim());
                const start = new Date(startStr);
                const end = new Date(endStr);
                
                // Only add date range to query if dates are valid
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    end.setHours(23, 59, 59, 999); // Include the entire end day
                    query.createdAt = {
                        $gte: start,
                        $lte: end
                    };
                }
            }

            // Get total count for pagination
            const totalOrders = await Order.countDocuments(query);
            const totalPages = Math.ceil(totalOrders / limit);

            // Get orders with pagination and sorting
            const orders = await Order.find(query)
                .populate({
                    path: 'user',
                    select: 'fname lname email',
                    match: { isDeleted: { $ne: true } }
                })
                .populate('items.product')
                .sort({ [sortBy]: sortOrder })
                .skip(skip)
                .limit(limit);

            res.render('admin/orders', {
                orders,
                pagination: {
                    page,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    limit: limit,
                    total: totalOrders
                },
                filters: {
                    status,
                    search,
                    dateRange,
                    sortBy,
                    sortOrder
                }
            });

        } catch (error) {
            console.error('Error fetching orders:', error);
            // Render a generic error page instead of admin-specific error
            res.status(500).render('error', {
                message: 'Error loading orders',
                error: process.env.NODE_ENV === 'development' ? error : {}
            });
        }
    },

    getOrderDetails: async (req, res) => {
        try {
            const orderId = req.params.id;
            const order = await Order.findById(orderId)
                .populate('user', 'fname lname email')
                .populate('items.product');

            if (!order) {
                return res.status(404).render('error', {
                    message: 'Order not found'
                });
            }

            res.render('admin/order-details', {
                order,
                title: `Order #${order.orderId}`
            });

        } catch (error) {
            console.error('Error fetching order details:', error);
            res.status(500).render('error', {
                message: 'Error loading order details'
            });
        }
    },

    cancelOrder: async (req, res) => {
        try {
            const { orderId } = req.params;
            const { reason } = req.body;

            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

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
                        $inc: { quantity: item.quantity },
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

            const order = await Order.findById(orderId);

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
    },

    updateOrderStatus: async (req, res) => {
        try {
            const { orderId } = req.params;
            const { status } = req.body;

            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Validate status transition
            const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status'
                });
            }

            // Update order status
            order.orderStatus = status;
            
            // Update all non-cancelled items to the new status
            order.items.forEach(item => {
                if (item.status !== 'Cancelled') {
                    item.status = status;
                }
            });

            await order.save();

            res.json({
                success: true,
                message: 'Order status updated successfully'
            });

        } catch (error) {
            console.error('Update status error:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating order status'
            });
        }
    }
};

module.exports = orderController; 