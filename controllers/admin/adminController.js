const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../../models/User');
const Order = require('../../models/Order');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const moment = require('moment');
const Product = require('../../models/Products');
const Category = require('../../models/Category');

const adminController = {
    getLogin: (req, res) => {
        if (req.session.admin) {
            return res.redirect('/admin/home');
        }
        res.render('admin/admin-login', { message: null }); 
    },

    checkLogin: async (req, res) => {
        try {
            console.log("Login request received");

            const { email, password } = req.body;

            const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
            const trimmedEmail = email ? email.trim() : '';
            const trimmedPassword = password ? password.trim() : '';

            if (!trimmedEmail) {
                return res.render('admin/admin-login', { 
                    message: 'Email is required' 
                });
            }

            if (!emailRegex.test(trimmedEmail)) {
                return res.render('admin/admin-login', { 
                    message: 'Please enter a valid email address' 
                });
            }

            if (!trimmedPassword) {
                return res.render('admin/admin-login', { 
                    message: 'Password is required' 
                });
            }

            if (trimmedPassword.length < 8) {
                return res.render('admin/admin-login', { 
                    message: 'Password must be at least 8 characters long' 
                });
            }

            const admin = await User.findOne({ 
                email: trimmedEmail
            });

            if( !admin.isAdmin){
                return res.render('admin/admin-login', { 
                    message: 'This account does not have administrative access.' 
                });
            }
            if (!admin) {
                return res.render('admin/admin-login', { 
                    message: 'Invalid email or password' 
                });
            }

            if (admin.isBlocked) {
                return res.render('admin/admin-login', { 
                    message: 'Your account has been blocked. Please contact support.' 
                });
            }

            const passwordMatch = await bcrypt.compare(trimmedPassword, admin.password);

            if (!passwordMatch) {
                return res.render('admin/admin-login', { 
                    message: 'Invalid email or password' 
                });
            }

            req.session.admin = admin._id;
            console.log("Login successful, redirecting to admin page");
            return res.redirect("/admin");

        } catch (error) {
            console.error("Login Error:", error);
            return res.render('admin/admin-login', { 
                message: 'An error occurred. Please try again later.' 
            });
        }
    },

    getHome: async (req, res) => {
        try {
            if(!req.session.admin) {
                return res.redirect('/admin/login');
            }

            const period = req.query.period || 'yearly';
            let dateFilter = {};
            const now = new Date();
            
            switch(period) {
                case 'daily':
                    dateFilter = {
                        createdAt: {
                            $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                            $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
                        }
                    };
                    break;
                case 'weekly':
                    const startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() - now.getDay());
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(startOfWeek.getDate() + 7);
                    dateFilter = {
                        createdAt: {
                            $gte: startOfWeek,
                            $lt: endOfWeek
                        }
                    };
                    break;
                case 'monthly':
                    dateFilter = {
                        createdAt: {
                            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
                            $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
                        }
                    };
                    break;
                case 'yearly':
                default:
                    dateFilter = {
                        createdAt: {
                            $gte: new Date(now.getFullYear(), 0, 1),
                            $lt: new Date(now.getFullYear() + 1, 0, 1)
                        }
                    };
            }

            // Fetch basic statistics
            const [
                totalUsers,
                activeUsers,
                totalOrders,
                totalRevenue,
                totalProducts,
                totalCategories
            ] = await Promise.all([
                User.countDocuments({ isAdmin: false }),
                User.countDocuments({ isAdmin: false, isBlocked: false, isDeleted: false }),
                Order.countDocuments(dateFilter),
                Order.aggregate([
                    { $match: { ...dateFilter, orderStatus: { $ne: 'Cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$total' } } }
                ]),
                Product.countDocuments({ isDeleted: false }),
                Category.countDocuments({ isDeleted: false })
            ]);

            // Best selling products
            const bestSellingProducts = await Order.aggregate([
                { $match: { ...dateFilter, orderStatus: { $ne: 'Cancelled' } } },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.product',
                        totalQuantity: { $sum: '$items.quantity' },
                        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                    }
                },
                { $sort: { totalQuantity: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'products',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' }
            ]);

            // Best selling categories
            const bestSellingCategories = await Order.aggregate([
                { $match: { ...dateFilter, orderStatus: { $ne: 'Cancelled' } } },
                { $unwind: '$items' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.product',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $group: {
                        _id: '$product.category',
                        totalQuantity: { $sum: '$items.quantity' },
                        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                    }
                },
                { $sort: { totalQuantity: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'categories',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'category'
                    }
                },
                { $unwind: '$category' }
            ]);

            // Monthly revenue data for chart
            const monthlyRevenue = await Order.aggregate([
                { $match: { orderStatus: { $ne: 'Cancelled' } } },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        total: { $sum: '$total' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]);

            // Top users by order value
            const topUsers = await Order.aggregate([
                { $match: { ...dateFilter, orderStatus: { $ne: 'Cancelled' } } },
                {
                    $group: {
                        _id: '$user',
                        totalOrders: { $sum: 1 },
                        totalSpent: { $sum: '$total' }
                    }
                },
                { $sort: { totalSpent: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: '$user' }
            ]);

            // Order status distribution
            const orderStatusDistribution = await Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$orderStatus',
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Recent orders
            const recentOrders = await Order.find(dateFilter)
                .populate('user', 'fname lname')
                .sort({ createdAt: -1 })
                .limit(5);

            // Recent users
            const recentUsers = await User.find({ isAdmin: false })
                .sort({ createdAt: -1 })
                .limit(5);

            res.render('admin/home', {
                stats: {
                    totalUsers,
                    activeUsers,
                    totalOrders,
                    totalRevenue: totalRevenue[0]?.total || 0,
                    totalProducts,
                    totalCategories
                },
                bestSellingProducts,
                bestSellingCategories,
                monthlyRevenue,
                topUsers,
                orderStatusDistribution,
                recentOrders,
                recentUsers,
                period
            });
            
        } catch (error) {
            console.error('Error in admin dashboard:', error);
            res.status(500).render('admin/error', {
                message: 'Error loading dashboard'
            });
        }
    },

    logout: async (req, res) => {
        try {
            req.session.destroy(err => {
                if (err) {
                    console.log('Error destroying session', err);
                    return res.redirect('/error'); 
                }
                return res.redirect('/admin/login');
            });
        } catch (error) {
            console.log('Unexpected error during logout', error); 
            return res.redirect('/error'); 
        }
    },

    customerInfo: async (req, res, next) => {
        try {
            let search = req.query.search || '';
            let page = parseInt(req.query.page) || 1;
            let currentStatus = req.query.status || '';
            const limit = 5;

          
            let query = { 
                isAdmin: { $ne: true }
            };

            if (currentStatus === 'blocked') {
                query.isBlocked = true;
                query.isDeleted = false;
            } else if (currentStatus === 'active') {
                query.isBlocked = false;
                query.isDeleted = false;
            } else if (currentStatus === 'deleted') {
                query.isDeleted = true;
            }

            if (search) {
                query.$or = [
                    { fname: { $regex: search, $options: "i" } },
                    { lname: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                    { phone: { $regex: search, $options: "i" } }
                ];
            }

            const count = await User.countDocuments(query);
            const totalPages = Math.ceil(count / limit);

            const users = await User.find(query)
                .select('fname lname email phone isBlocked isDeleted status createdAt lastLogin')
                .sort({ createdAt: -1 })
                .limit(limit)
                .skip((page - 1) * limit);

            const stats = {
                total: await User.countDocuments({ isAdmin: { $ne: true } }),
                active: await User.countDocuments({ 
                    isAdmin: { $ne: true }, 
                    isBlocked: false, 
                    isDeleted: false 
                }),
                blocked: await User.countDocuments({ 
                    isAdmin: { $ne: true }, 
                    isBlocked: true, 
                    isDeleted: false 
                }),
                deleted: await User.countDocuments({ 
                    isAdmin: { $ne: true }, 
                    isDeleted: true 
                })
            };

            return res.render('admin/customers', {
                data: users,
                pagination: {
                    page,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    limit: limit,
                    total: count
                },
                filters: {
                    status: currentStatus,
                    search
                },
                stats,
                error: req.query.error,
                success: req.query.success
            });

        } catch (error) {
            console.error("Error in customerInfo:", error);
            next(error);
        }
    },

    blockCustomer: async (req, res) => {
        try {
            let id = req.query.id;
            await User.updateOne(
                { _id: id }, 
                { 
                    $set: { 
                        isBlocked: true,
                        status: 'blocked'
                    } 
                }
            );
            res.redirect('/admin/customers?success=Customer blocked successfully');
        } catch (error) {
            console.error("Error blocking customer:", error);
            res.redirect('/admin/customers?error=Error blocking customer');
        }
    },

    unblockCustomer: async (req, res) => {
        try {
            let id = req.query.id;
            await User.updateOne(
                { _id: id }, 
                { 
                    $set: { 
                        isBlocked: false,
                        status: 'active'
                    } 
                }
            );
            res.redirect('/admin/customers?success=Customer unblocked successfully');
        } catch (error) {
            console.error("Error unblocking customer:", error);
            res.redirect('/admin/customers?error=Error unblocking customer');
        }
    },

    deleteCustomer: async (req, res) => {
        try {
            const id = req.query.id;
            
            const user = await User.findById(id);
            
            if (!user) {
                return res.redirect('/admin/customers?error=Customer not found');
            }

            if (user.isDeleted) {
                return res.redirect('/admin/customers?error=Customer is already deleted');
            }

            const updatedUser = await User.findByIdAndUpdate(
                id,
                {
                    $set: {
                        isDeleted: true,
                        status: 'inactive',
                        
                        cart: [],
                        wishlist: [],
                        lastLogin: null,
                        updatedAt: new Date()
                    }
                },
                { new: true }
            );

            if (!updatedUser) {
                return res.redirect('/admin/customers?error=Error deleting customer');
            }

            if (req.session.user === id) {
                req.session.destroy();
            }

            return res.redirect('/admin/customers?success=Customer has been successfully deleted');

        } catch (error) {
            console.error("Error deleting customer:", error);
            return res.redirect('/admin/customers?error=Error processing delete request');
        }
    },

    viewCustomer: async (req, res) => {
        try {
            const customerId = req.params.id;
            const customer = await User.findById(customerId);

            if (!customer) {
                return res.redirect('/admin/customers?error=Customer not found');
            }

            res.render('admin/view-customer', {
                customer,
                title: 'View Customer'
            });
        } catch (error) {
            console.error('Error viewing customer:', error);
            res.redirect('/admin/customers?error=Error viewing customer details');
        }
    },

    // Sales report 
    generateExcelReport: async function(res, orders, summary) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        // Add title and date range/period information
        worksheet.mergeCells('A1:J1');
        worksheet.getCell('A1').value = 'Delivered Orders Report';
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        worksheet.getCell('A1').font = { bold: true, size: 16 };

        worksheet.mergeCells('A2:J2');
        const dateRangeText = orders.length > 0 ? 
            `Report Period: ${moment(orders[0].createdAt).format('DD/MM/YYYY')} to ${moment(orders[orders.length - 1].createdAt).format('DD/MM/YYYY')}` :
            'No orders in selected period';
        worksheet.getCell('A2').value = dateRangeText;
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        
        // Add empty row
        worksheet.addRow([]);

        // Define columns
        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 15 },
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Customer Name', key: 'customerName', width: 20 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Payment Method', key: 'paymentMethod', width: 15 },
            { header: 'Items', key: 'items', width: 40 },
            { header: 'Subtotal', key: 'subtotal', width: 15 },
            { header: 'Wallet Used', key: 'walletAmount', width: 15 },
            { header: 'Coupon Code', key: 'couponCode', width: 15 },
            { header: 'Coupon Discount', key: 'couponDiscount', width: 15 },
            { header: 'Shipping Charge', key: 'shippingCharge', width: 15 },
            { header: 'Total', key: 'total', width: 15 }
        ];

        // Style the header row
        worksheet.getRow(4).font = { bold: true };
        worksheet.getRow(4).alignment = { horizontal: 'center' };

        // Add order data
        orders.forEach(order => {
            worksheet.addRow({
                orderId: order.orderId,
                date: moment(order.createdAt).format('DD/MM/YYYY'),
                customerName: order.user ? `${order.user.fname} ${order.user.lname}` : 'Deleted User',
                phone: order.shippingAddress ? order.shippingAddress.phone : 'N/A',
                paymentMethod: order.paymentMethod,
                items: order.items.map(item => 
                    `${item.product.name} (Qty: ${item.quantity}) - ₹${item.price}`
                ).join(', '),
                subtotal: order.subtotal,
                walletAmount: order.walletAmount || 0,
                couponCode: order.coupon ? order.coupon.code : 'No Coupon',
                couponDiscount: order.couponDiscount || 0,
                shippingCharge: order.shippingCharge || 0,
                total: order.total
            });
        });

        // Add empty row before summary
        worksheet.addRow([]);
        worksheet.addRow([]);

        // Add summary section
        const summaryStartRow = worksheet.rowCount + 1;
        worksheet.mergeCells(`A${summaryStartRow}:C${summaryStartRow}`);
        worksheet.getCell(`A${summaryStartRow}`).value = 'Summary';
        worksheet.getCell(`A${summaryStartRow}`).font = { bold: true };

        // Add summary details
        worksheet.addRow(['Total Orders', summary.totalOrders]);
        worksheet.addRow(['Total Revenue', `₹${summary.totalRevenue.toFixed(2)}`]);
        worksheet.addRow(['Total Wallet Amount Used', `₹${summary.totalWalletUsed.toFixed(2)}`]);
        worksheet.addRow(['Total Coupon Discount', `₹${summary.totalCouponDiscount.toFixed(2)}`]);
        worksheet.addRow(['Total Shipping Charges', `₹${summary.totalShippingCharges.toFixed(2)}`]);
        worksheet.addRow(['Average Order Value', `₹${summary.averageOrderValue.toFixed(2)}`]);

        // Style numbers in the data to be right-aligned
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 4) { // Skip header rows
                ['G', 'H', 'J', 'K', 'L'].forEach(col => {
                    if (row.getCell(col).value) {
                        row.getCell(col).alignment = { horizontal: 'right' };
                        row.getCell(col).numFmt = '₹#,##0.00';
                    }
                });
            }
        });

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=sales-report.xlsx'
        );

        await workbook.xlsx.write(res);
    },

    generatePDFReport: async function(res, orders, summary) {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

        doc.pipe(res);

        // Add title
        doc.fontSize(20).text('Delivered Orders Report', { align: 'center' });
        doc.moveDown();

        // Add date range
        if (orders.length > 0) {
            doc.fontSize(12).text(
                `Report Period: ${moment(orders[0].createdAt).format('DD/MM/YYYY')} to ${moment(orders[orders.length - 1].createdAt).format('DD/MM/YYYY')}`,
                { align: 'center' }
            );
        }
        doc.moveDown();

        // Add summary section
        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(12);
        doc.text(`Total Orders: ${summary.totalOrders}`);
        doc.text(`Total Revenue: ₹${summary.totalRevenue.toFixed(2)}`);
        doc.text(`Total Wallet Amount Used: ₹${summary.totalWalletUsed.toFixed(2)}`);
        doc.text(`Total Coupon Discount: ₹${summary.totalCouponDiscount.toFixed(2)}`);
        doc.text(`Total Shipping Charges: ₹${summary.totalShippingCharges.toFixed(2)}`);
        doc.text(`Average Order Value: ₹${summary.averageOrderValue.toFixed(2)}`);
        doc.moveDown();

        // Create the orders table
        const table = {
            headers: [
                'Order ID',
                'Date',
                'Customer',
                'Payment Method',
                'Items',
                'Subtotal',
                'Wallet',
                'Discount',
                'Total'
            ],
            rows: orders.map(order => [
                order.orderId,
                moment(order.createdAt).format('DD/MM/YYYY'),
                order.user ? `${order.user.fname} ${order.user.lname}` : 'Deleted User',
                order.paymentMethod,
                order.items.map(item => 
                    `${item.product.name}(${item.quantity})`
                ).join(', '),
                `₹${order.subtotal.toFixed(2)}`,
                `₹${(order.walletAmount || 0).toFixed(2)}`,
                `₹${(order.couponDiscount || 0).toFixed(2)}`,
                `₹${order.total.toFixed(2)}`
            ])
        };

        // Set table layout
        const tableLayout = {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
            prepareRow: () => doc.font('Helvetica').fontSize(8)
        };

        // Draw the table
        await doc.table(table, {
            ...tableLayout,
            width: 750,
            padding: 5,
            columnSpacing: 10,
            columnsSize: [60, 60, 80, 60, 200, 70, 70, 70, 70]
        });

        doc.end();
    },

    downloadReport: async function(req, res) {
        try {
            const { format } = req.query;
            const orders = req.orders;
            const summary = req.summary;

            if (format === 'excel') {
                await this.generateExcelReport(res, orders, summary);
            } else if (format === 'pdf') {
                await this.generatePDFReport(res, orders, summary);
            } else {
                throw new Error('Invalid format specified');
            }
        } catch (error) {
            console.error('Error generating report:', error);
            res.status(500).send('Error generating report');
        }
    },

    getSalesReport: async function(req, res) {
        try {
            const {
                startDate,
                endDate,
                period,
                downloadFormat
            } = req.query;

            // Set default query to only show delivered orders
            let query = {
                orderStatus: 'Delivered'
            };

            if (startDate && endDate) {
                const start = moment(startDate).startOf('day').toDate();
                const end = moment(endDate).endOf('day').toDate();
                query.createdAt = {
                    $gte: start,
                    $lte: end
                };
            } else if (period) {
                const now = new Date();
                switch (period) {
                    case 'daily':
                        query.createdAt = {
                            $gte: moment().startOf('day').toDate(),
                            $lte: moment().endOf('day').toDate()
                        };
                        break;
                    case 'weekly':
                        query.createdAt = {
                            $gte: moment().startOf('week').toDate(),
                            $lte: moment().endOf('week').toDate()
                        };
                        break;
                    case 'monthly':
                        query.createdAt = {
                            $gte: moment().startOf('month').toDate(),
                            $lte: moment().endOf('month').toDate()
                        };
                        break;
                    case 'yearly':
                        query.createdAt = {
                            $gte: moment().startOf('year').toDate(),
                            $lte: moment().endOf('year').toDate()
                        };
                        break;
                }
            }

            // Get all filtered orders for summary calculation
            const filteredOrders = await Order.find(query)
                .populate('user', 'fname lname email')
                .populate('items.product', 'name price')
                .populate('coupon', 'code')
                .sort({ createdAt: -1 });

            // Calculate summary based on filtered orders
            const summary = {
                totalOrders: filteredOrders.length,
                totalRevenue: filteredOrders.reduce((sum, order) => sum + order.total, 0),
                totalWalletUsed: filteredOrders.reduce((sum, order) => sum + (order.walletAmount || 0), 0),
                totalCouponDiscount: filteredOrders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0),
                totalShippingCharges: filteredOrders.reduce((sum, order) => sum + (order.shippingCharge || 0), 0),
                averageOrderValue: filteredOrders.length ? 
                    filteredOrders.reduce((sum, order) => sum + order.total, 0) / filteredOrders.length : 0
            };

            // Handle download formats
            if (downloadFormat) {
                if (downloadFormat === 'excel') {
                    const generateExcel = adminController.generateExcelReport.bind(adminController);
                    await generateExcel(res, filteredOrders, summary);
                    return;
                } else if (downloadFormat === 'pdf') {
                    const generatePDF = adminController.generatePDFReport.bind(adminController);
                    await generatePDF(res, filteredOrders, summary);
                    return;
                }
            }

            // For display, apply pagination
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const skip = (page - 1) * limit;

            const paginatedOrders = await Order.find(query)
                .populate('user', 'fname lname email')
                .populate('items.product', 'name price')
                .populate('coupon', 'code')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const totalOrders = await Order.countDocuments(query);
            const totalPages = Math.ceil(totalOrders / limit);

            res.render('admin/sales-report', {
                orders: paginatedOrders,
                summary,
                filters: {
                    startDate,
                    endDate,
                    period
                },
                pagination: {
                    page,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    limit
                }
            });

        } catch (error) {
            console.error('Error generating sales report:', error);
            res.status(500).render('error', {
                message: 'Error generating sales report'
            });
        }
    }
};

Object.keys(adminController).forEach(key => {
    if (typeof adminController[key] === 'function') {
        adminController[key] = adminController[key].bind(adminController);
    }
});

module.exports = adminController;
  
