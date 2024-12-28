const Order = require('../../models/Order');
const Product = require('../../models/Products');
const Wallet = require('../../models/Wallet');
const { processRefund } = require('../../utils/refundHandler');

const orderController = {
    getOrders: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const skip = (page - 1) * limit;


            const status = req.query.status;
            const search = req.query.search;
            const dateRange = req.query.dateRange;
            const sortBy = req.query.sortBy || 'createdAt';
            const sortOrder = req.query.sortOrder || 'desc';

            let query = {};

            if (status && status !== 'all') {
                query.orderStatus = status;
            }

            if (search) {
                query.$or = [
                    { orderId: { $regex: search, $options: 'i' } },
                    { 'shippingAddress.name': { $regex: search, $options: 'i' } },
                    { 'shippingAddress.phone': { $regex: search, $options: 'i' } }
                ];
            }

            if (dateRange) {
                const [startStr, endStr] = dateRange.split(' - ').map(date => date.trim());
                const start = new Date(startStr);
                const end = new Date(endStr);
                
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    end.setHours(23, 59, 59, 999); 
                    query.createdAt = {
                        $gte: start,
                        $lte: end
                    };
                }
            }

            // return status 
            if (req.query.returnStatus) {
                query.returnRequested = true;
                if (req.query.returnStatus !== 'all') {
                    query.returnStatus = req.query.returnStatus;
                }
            }

          
            const totalOrders = await Order.countDocuments(query);
            const totalPages = Math.ceil(totalOrders / limit);

            
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

            const pendingReturns = await Order.countDocuments({
                returnRequested: true,
                returnStatus: 'Pending'
            });

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
                    sortOrder,
                    returnStatus: req.query.returnStatus
                },
                pendingReturns,
                totalPages,
                currentPage: page,
                searchTerm: search
            });

        } catch (error) {
            console.error('Error fetching orders:', error);
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

            const order = await Order.findById(orderId);

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

            const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status'
                });
            }

            order.orderStatus = status;
            
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
    },

    approveReturn: async (req, res) => {
        try {
            const { orderId } = req.params;
            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            order.returnStatus = 'Approved';
            
            const stockUpdatePromises = order.items.map(async item => {
                if (item.returnRequested && item.returnStatus === 'Pending') {
                    item.returnStatus = 'Approved';
                    item.status = 'Returned';

                    return Product.findByIdAndUpdate(item.product, {
                        $inc: { quantity: item.quantity }
                    });
                }
                return Promise.resolve();
            });

            await processRefund(order, null, 'Return approved');

            await Promise.all(stockUpdatePromises);

            const allItemsReturned = order.items.every(item => 
                item.status === 'Returned'
            );

            const someItemsReturned = order.items.some(item => 
                item.status === 'Returned'
            );

            if (allItemsReturned) {
                order.orderStatus = 'Returned';
            } else if (someItemsReturned) {
                order.orderStatus = 'Delivered';
                order.partiallyReturned = true;
            }
                    
            await order.save();

            res.json({
                success: true,
                message: 'Return request approved successfully'
            });

        } catch (error) {
            console.error('Approve return error:', error);
            res.status(500).json({
                success: false,
                message: 'Error approving return'
            });
        }
    },

    approveItemReturn: async (req, res) => {
        try {
            const { orderId, itemId } = req.params;
            const order = await Order.findById(orderId);

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

            item.returnStatus = 'Approved';
            item.status = 'Returned';

            await Product.findByIdAndUpdate(item.product, {
                $inc: { quantity: item.quantity }
            });

            await processRefund(order, [item], 'Item return approved');

            const totalItems = order.items.length;
            const returnedItems = order.items.filter(item => item.status === 'Returned').length;
            const pendingReturns = order.items.filter(item => 
                item.returnRequested && item.returnStatus === 'Pending'
            ).length;

            if (returnedItems === totalItems) {
                order.orderStatus = 'Returned';
                order.returnStatus = 'Approved';
            } else if (returnedItems > 0) {
                order.orderStatus = 'Delivered';
                order.partiallyReturned = true;
                
                if (pendingReturns === 0) {
                    order.returnStatus = 'Approved';
                }
            }

            const activeItems = order.items.filter(item => item.status !== 'Returned');
            if (activeItems.length > 0) {
                order.subtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                order.total = order.subtotal + order.shippingCharge;
            }

            await order.save();

            res.json({
                success: true,
                message: 'Item return approved successfully'
            });

        } catch (error) {
            console.error('Approve item return error:', error);
            res.status(500).json({
                success: false,
                message: 'Error approving item return'
            });
        }
    },

    rejectReturn: async (req, res) => {
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

            order.returnStatus = 'Rejected';
            order.returnReason = reason;

            order.items.forEach(item => {
                if (item.returnRequested && item.returnStatus === 'Pending') {
                    item.returnStatus = 'Rejected';
                    item.returnReason = reason;
                }
            });

            await order.save();

            res.json({
                success: true,
                message: 'Return request rejected successfully'
            });

        } catch (error) {
            console.error('Reject return error:', error);
            res.status(500).json({
                success: false,
                message: 'Error rejecting return'
            });
        }
    },

    rejectItemReturn: async (req, res) => {
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

            const item = order.items.id(itemId);
            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Order item not found'
                });
            }

            item.returnStatus = 'Rejected';
            item.returnReason = reason;

            const allReturnsRejected = order.items.every(item => 
                !item.returnRequested || item.returnStatus === 'Rejected'
            );

            if (allReturnsRejected) {
                order.returnStatus = 'Rejected';
                order.returnReason = 'All return requests rejected';
            }

            await order.save();

            res.json({
                success: true,
                message: 'Item return rejected successfully'
            });

        } catch (error) {
            console.error('Reject item return error:', error);
            res.status(500).json({
                success: false,
                message: 'Error rejecting item return'
            });
        }
    }
};

module.exports = orderController; 