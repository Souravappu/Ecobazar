const Cart = require('../../models/Cart');
const Product = require('../../models/Products');
const Category = require('../../models/Category');
const User =require('../../models/User')

const checkQuantityLimits = async (productId, requestedQuantity, userId) => {
    const [product, cart] = await Promise.all([
        Product.findById(productId),
        Cart.findOne({ user: userId })
    ]);

    if (!product) {
        throw new Error('Product not found');
    }

    // Get current quantity in cart (if any)
    const currentCartItem = cart?.items.find(item => 
        item.product.toString() === productId.toString()
    );
    const currentQty = currentCartItem ? currentCartItem.quantity : 0;
    const newTotalQty = currentQty + requestedQuantity;

    // Check stock availability
    if (newTotalQty > product.quantity) {
        throw new Error('Not enough stock available');
    }

    // Check maximum limit (5)
    if (newTotalQty > 5) {
        throw new Error('Maximum quantity limit (5) exceeded');
    }

    return { product, currentQty, newTotalQty };
};

const checkAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            authenticated: false,
            message: 'Please login to add items to cart'
        });
    }
    next();
};

const cartController = {
    
    addToCart: [checkAuth, async (req, res) => {
        try {
            const { productId, quantity = 1 } = req.body;
            const userId = req.session.user;

            const { product, currentQty, newTotalQty } = await checkQuantityLimits(
                productId, 
                parseInt(quantity), 
                userId
            );

            let cart = await Cart.findOne({ user: userId });
            if (!cart) {
                cart = new Cart({ user: userId, items: [] });
            }

            const existingItem = cart.items.find(item => 
                item.product.toString() === productId.toString()
            );

            if (existingItem) {
                existingItem.quantity = newTotalQty;
            } else {
                cart.items.push({
                    product: productId,
                    quantity: parseInt(quantity)
                });
            }

            cart.total = cart.items.reduce((total, item) => {
                return total + (item.quantity * product.salePrice);
            }, 0);

            await cart.save();

            res.json({
                success: true,
                message: 'Product added to cart',
                cart: {
                    count: cart.items.length,
                    total: cart.total.toFixed(2)
                }
            });

        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message || 'Error adding product to cart'
            });
        }
    }],

    // Remove from cart
    removeFromCart: async (req, res) => {
        try {
            const { productId } = req.params;
            const userId = req.session.user;

            const cart = await Cart.findOne({ user: userId });
            if (!cart) {
                return res.status(404).json({
                    success: false,
                    message: 'Cart not found'
                });
            }

            cart.items = cart.items.filter(item => 
                item.product.toString() !== productId
            );

            await cart.populate('items.product');
            cart.total = cart.items.reduce((sum, item) => 
                sum + (item.product.salePrice * item.quantity), 0
            );

            await cart.save();
            res.locals.cartCount = cart.items.length;
            res.locals.cartTotal = cart.total.toFixed(2);

            res.status(200).json({
                success: true,
                message: 'Product removed from cart',
                cart: {
                    count: cart.items.length,
                    total: cart.total.toFixed(2)
                }
            });
        } catch (error) {
            console.error('Remove from cart error:', error);
            res.status(500).json({
                success: false,
                message: 'Error removing from cart'
            });
        }
    },

    // UpdateCartQuantity
    updateCartQuantity: async (req, res) => {
        try {
            const { productId, quantity } = req.body;
            const userId = req.session.user;

            if (quantity < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Quantity must be at least 1'
                });
            }

            const cart = await Cart.findOne({ user: userId });
            if (!cart) {
                return res.status(404).json({
                    success: false,
                    message: 'Cart not found'
                });
            }

            const cartItem = cart.items.find(item => 
                item.product.toString() === productId
            );

            if (!cartItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found in cart'
                });
            }

            const product = await Product.findById(productId);
            if (quantity > product.quantity) {
                return res.status(400).json({
                    success: false,
                    message: 'Requested quantity not available'
                });
            }

            cartItem.quantity = quantity;

            await cart.populate('items.product');
            cart.total = cart.items.reduce((sum, item) => 
                sum + (item.product.salePrice * item.quantity), 0
            );

            await cart.save();

            res.status(200).json({
                success: true,
                message: 'Cart updated',
                cart
            });
        } catch (error) {
            console.error('Update cart error:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating cart'
            });
        }
    },

    // Get Cart
    getCart: async (req, res) => {
        try {
            const userId = req.session.user;
            
            const [cart, categories] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Category.find({ isListed: true, isBlocked: false, isDeleted: false })
            ]);

            let user= await User.findById(userId)
            res.render('user/cart', {
                cart,
                categories,
                user:user,
                title: 'Shopping Cart'
            });
        } catch (error) {
            console.error('Get cart error:', error);
            res.status(500).render('error', {
                message: 'Error loading cart',
                categories: []
            });
        }
    },

    // check Quantity
    checkQuantity: async (req, res) => {
        try {
            const userId = req.session.user;
            const productId = req.params.productId;

            const cart = await Cart.findOne({ user: userId });
            let existingQuantity = 0;

            if (cart) {
                const cartItem = cart.items.find(item => 
                    item.product.toString() === productId
                );
                if (cartItem) {
                    existingQuantity = cartItem.quantity;
                }
            }

            res.json({
                success: true,
                existingQuantity
            });
        } catch (error) {
            console.error('Error checking cart quantity:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking cart quantity'
            });
        }
    }
};

module.exports = cartController; 