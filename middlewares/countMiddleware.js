const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');

const getCounts = async (req, res, next) => {
    try {
        const userId = req.session?.user;

        // Initialize default values
        res.locals.cartCount = 0;
        res.locals.cartTotal = 0;
        res.locals.wishlistCount = 0;

        if (userId) {
            const [cart, wishlist] = await Promise.all([
                Cart.findOne({ user: userId }),
                Wishlist.findOne({ user: userId })
            ]);

            if (cart && cart.items) {
                res.locals.cartCount = cart.items.length;
                res.locals.cartTotal = cart.total || 0;
            }

            if (wishlist && wishlist.items) {
                res.locals.wishlistCount = wishlist.items.length;
            }
        }

        next();
    } catch (error) {
        console.error('Error getting counts:', error);
        next();
    }
};

module.exports = getCounts; 