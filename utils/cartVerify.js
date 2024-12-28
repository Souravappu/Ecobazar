const Cart = require('../models/Cart');
 const verifyCartStock = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const cart = await Cart.findOne({ user: userId }).populate('items.product');

        if (!cart || cart.items.length === 0) {
            req.flash('error_msg', 'Your cart is empty');
            return res.redirect('/cart');
        }

        const stockIssues = cart.items.filter(item => 
            !item.product.quantity || 
            item.product.quantity < item.quantity
        );

        if (stockIssues.length > 0) {
            req.flash('error_msg', 'Some items in your cart have stock issues. Please review your cart.');
            return res.redirect('/cart');
        }

        next();
    } catch (error) {
        console.error('Stock verification error:', error);
        res.status(500).render('error', {
            message: 'Error verifying stock',
            categories: []
        });
    }
};

module.exports ={verifyCartStock}