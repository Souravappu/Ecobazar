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

    
    const currentCartItem = cart?.items.find(item => 
        item.product.toString() === productId.toString()
    );
    const currentQty = currentCartItem ? currentCartItem.quantity : 0;
    const newTotalQty = currentQty + requestedQuantity;

   
    if (newTotalQty > product.quantity) {
        throw new Error('Not enough stock available');
    }

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

    getCart: async (req, res) => {
        try {
            const userId = req.session.user;
            
            const [cart, categories] = await Promise.all([
                Cart.findOne({ user: userId }).populate('items.product'),
                Category.find({ isListed: true, isBlocked: false, isDeleted: false })
            ]);

            if (cart && cart.items.length > 0) {
                cart.items.forEach(item => {
                    item.stockStatus = {
                        inStock: item.product.quantity > 0,
                        hasEnoughStock: item.product.quantity >= item.quantity,
                        availableStock: item.product.quantity,
                        maxAllowed: Math.min(5, item.product.quantity)
                    };

                    if (!item.stockStatus.hasEnoughStock && item.stockStatus.inStock) {
                        item.quantity = item.product.quantity;
                    }
                });

                cart.total = cart.items.reduce((sum, item) => {
                    if (item.stockStatus.inStock) {
                        return sum + (item.product.salePrice * item.quantity);
                    }
                    return sum;
                }, 0);

                await cart.save();
            }

            let user = await User.findById(userId);
            res.render('user/cart', {
                cart,
                categories,
                user: user,
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