const Wishlist = require('../../models/Wishlist');
const Product = require('../../models/Products');
const Category = require('../../models/Category');
const User = require('../../models/User');
const Address = require('../../models/Address');
const wishlistController = {
    
    addToWishlist: async (req, res) => {
        try {
            const { productId } = req.body;
            const userId = req.session.user;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Please login to add items to wishlist'
                });
            }

            let wishlist = await Wishlist.findOne({ user: userId });
            if (!wishlist) {
                wishlist = new Wishlist({ user: userId, items: [] });
            }

            const existingItem = wishlist.items.find(item => 
                item.product.toString() === productId
            );

            if (!existingItem) {
                wishlist.items.push({ product: productId });
                await wishlist.save();
            }

            res.locals.wishlistCount = wishlist.items.length;

            res.status(200).json({
                success: true,
                message: 'Product added to wishlist',
                wishlist
            });
        } catch (error) {
            console.error('Add to wishlist error:', error);
            res.status(500).json({
                success: false,
                message: 'Error adding to wishlist'
            });
        }
    },

    removeFromWishlist: async (req, res) => {
        try {
            const { productId } = req.params;
            const userId = req.session.user;
            const currentPage = parseInt(req.query.page) || 1;

            const wishlist = await Wishlist.findOne({ user: userId });
            if (!wishlist) {
                return res.status(404).json({
                    success: false,
                    message: 'Wishlist not found'
                });
            }

            // Remove the item
            wishlist.items = wishlist.items.filter(item => 
                item.product.toString() !== productId
            );

            await wishlist.save();

            // Calculate pagination info after deletion
            const limit = 6;
            const totalItems = wishlist.items.length;
            const totalPages = Math.ceil(totalItems / limit);

            // Determine if we need to redirect to a different page
            let redirectPage = currentPage;
            if (currentPage > totalPages && totalPages > 0) {
                redirectPage = totalPages;
            } else if (totalPages === 0) {
                redirectPage = 1;
            }

            res.locals.wishlistCount = wishlist.items.length;

            res.status(200).json({
                success: true,
                message: 'Product removed from wishlist',
                wishlistCount: wishlist.items.length,
                pagination: {
                    currentPage,
                    totalPages,
                    redirectPage,
                    shouldRedirect: redirectPage !== currentPage
                }
            });
        } catch (error) {
            console.error('Remove from wishlist error:', error);
            res.status(500).json({
                success: false,
                message: 'Error removing from wishlist'
            });
        }
    },

    getWishlist: async (req, res) => {
        try {
            const userId = req.session.user;
            const page = parseInt(req.query.page) || 1;
            const limit = 6;
            const skip = (page - 1) * limit;
            
            // First check if wishlist exists
            let wishlist = await Wishlist.findOne({ user: userId })
                .populate({
                    path: 'items.product',
                    model: 'Product',
                    match: { isDeleted: false, isBlocked: false }
                });

            // Initialize empty wishlist if not exists
            if (!wishlist) {
                wishlist = new Wishlist({ user: userId, items: [] });
            }

            // Filter out items where product is null (deleted or blocked products)
            const activeItems = wishlist.items.filter(item => item.product);
            const totalItems = activeItems.length;
            const totalPages = Math.ceil(totalItems / limit);

            // Get paginated items only if there are items
            let paginatedWishlist = wishlist;
            if (totalItems > 0) {
                paginatedWishlist = await Wishlist.findOne({ user: userId })
                    .populate({
                        path: 'items.product',
                        model: 'Product',
                        match: { isDeleted: false, isBlocked: false }
                    })
                    .slice('items', [skip, limit]);
            }

            const categories = await Category.find({ 
                isListed: true, 
                isBlocked: false, 
                isDeleted: false 
            });

            const userData = await User.findById(userId);
            if (!userData) {
                return res.redirect('/login');
            }

            const address = await Address.findOne({
                userId: userId,
                "address.isDefault": true
            });
            
            res.render('user/wishlist', {
                user: userData,
                wishlist: paginatedWishlist,
                address: address,
                categories,
                title: 'My Wishlist',
                pagination: totalItems > 0 ? {
                    page,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    totalItems,
                    limit,
                    startIndex: skip + 1,
                    endIndex: Math.min(skip + limit, totalItems)
                } : null,
                currentPage: 'wishlist'
            });
        } catch (error) {
            console.error('Error fetching wishlist:', error);
            res.render('user/error', {
                message: 'Error loading wishlist. Please try again later.',
                categories: [],
                user: null
            });
        }
    },

 
    getWishlistItems: async (req, res) => {
        try {
            const userId = req.session.user;
            
            if (!userId) {
                return res.status(200).json({
                    success: true,
                    items: []
                });
            }

            const wishlist = await Wishlist.findOne({ user: userId });
            
            res.json({
                success: true,
                items: wishlist ? wishlist.items : []
            });
        } catch (error) {
            console.error('Error fetching wishlist items:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching wishlist items'
            });
        }
    },

    checkAuth: async (req, res) => {
        res.json({
            authenticated: !!req.session.user
        });
    }
};

module.exports = wishlistController; 