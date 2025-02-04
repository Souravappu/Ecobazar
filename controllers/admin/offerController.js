const Offer = require('../../models/Offer');
const Category = require('../../models/Category');
const Product = require('../../models/Products');

// List all offers
exports.listOffers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of offers per page
        const skip = (page - 1) * limit;

        // Get total count of offers for pagination
        const totalOffers = await Offer.countDocuments();
        const totalPages = Math.ceil(totalOffers / limit);

        const offers = await Offer.find()
            .populate('categories', 'name')
            .populate('products', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('admin/offers', {
            offers,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
            nextPage: page + 1,
            previousPage: page - 1,
            lastPage: totalPages,
            title: 'Offers Management'
        });
    } catch (error) {
        console.error('Error fetching offers:', error);
        req.flash('error', 'Failed to fetch offers');
        res.redirect('/admin/home');
    }
};

// Render add offer form
exports.getAddOffer = async (req, res) => {
    try {
        const categories = await Category.find({ isBlocked: false, isDeleted: false });
        const products = await Product.find({ isBlocked: false, isDeleted: false });

        res.render('admin/add-offer', {
            categories,
            products,
            title: 'Add New Offer'
        });
    } catch (error) {
        console.error('Error loading add offer form:', error);
        req.flash('error', 'Failed to load add offer form');
        res.redirect('/admin/offers');
    }
};

// Add these helper functions after the existing imports
const calculateDiscountedPrice = (regularPrice, discountType, discountValue) => {
    if (discountType === 'percentage') {
        const discountAmount = (regularPrice * discountValue) / 100;
        return Math.max(regularPrice - discountAmount, regularPrice * 0.25);
    } else {
        return Math.max(regularPrice - discountValue, regularPrice * 0.25);
    }
};

const isBetterOffer = (existingOffer, newOffer, productPrice) => {
    if (!existingOffer) return true;

    const existingDiscountedPrice = calculateDiscountedPrice(
        productPrice,
        existingOffer.discountType,
        existingOffer.discountValue
    );

    const newDiscountedPrice = calculateDiscountedPrice(
        productPrice,
        newOffer.discountType,
        newOffer.discountValue
    );

    return newDiscountedPrice < existingDiscountedPrice;
};

const applyOfferToProduct = async (product, offer) => {
    try {
        // Check if there's an existing offer
        if (product.appliedOffer) {
            const existingOffer = await Offer.findById(product.appliedOffer);
            if (existingOffer && !isBetterOffer(existingOffer, offer, product.regularPrice)) {
                return false; // Don't apply if existing offer is better
            }
        }

        let newSalePrice;
        let discountAmount;

        if (offer.discountType === 'percentage') {
            discountAmount = (product.regularPrice * offer.discountValue) / 100;
            newSalePrice = product.regularPrice - discountAmount;
        } else {
            // For fixed amount discount
            if (offer.discountValue > (product.regularPrice * 0.75)) {
                // Don't allow discount more than 75% of regular price
                discountAmount = product.regularPrice * 0.75;
            } else {
                discountAmount = offer.discountValue;
            }
            newSalePrice = product.regularPrice - discountAmount;
        }

        // Ensure minimum price (25% of regular price)
        const minimumPrice = product.regularPrice * 0.25;
        if (newSalePrice < minimumPrice) {
            newSalePrice = minimumPrice;
            discountAmount = product.regularPrice - minimumPrice;
        }

        // Update product with new offer details
        await Product.findByIdAndUpdate(product._id, {
            salePrice: newSalePrice,
            appliedOffer: offer._id,
            appliedOfferType: offer.type,
            discountType: offer.discountType,
            discountValue: offer.discountValue,
            discountAmount: discountAmount
        });

        return true;
    } catch (error) {
        console.error('Error applying offer to product:', error);
        return false;
    }
};

// Create new offer
exports.addOffer = async (req, res) => {
    try {
        console.log('Request body:', req.body); // Debug log

        const {
            name,
            description,
            offerType,
            discountType,
            discountValue,
            startDate,
            endDate,
            categories,
            products
        } = req.body;

        // Validate required fields
        if (!name || !description || !offerType || !discountType || !discountValue || !startDate || !endDate) {
            console.log('Missing required fields:', { name, description, offerType, discountType, discountValue, startDate, endDate });
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            console.log('Invalid dates:', { startDate, endDate, start, end });
            return res.status(400).json({
                success: false,
                message: 'Invalid date format'
            });
        }

        if (start > end) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Validate discount value
        const discountValueNum = parseFloat(discountValue);
        if (isNaN(discountValueNum)) {
            console.log('Invalid discount value:', discountValue);
            return res.status(400).json({
                success: false,
                message: 'Invalid discount value'
            });
        }

        if (discountType === 'percentage' && (discountValueNum < 0 || discountValueNum > 90)) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount must be between 0 and 90'
            });
        }

        if (discountType === 'fixed' && discountValueNum < 0) {
            return res.status(400).json({
                success: false,
                message: 'Fixed discount cannot be negative'
            });
        }

        // Check for overlapping offers
        let overlappingOffer;
        if (offerType === 'category' && categories) {
            const categoryIds = Array.isArray(categories) ? categories : [categories];
            overlappingOffer = await Offer.findOne({
                categories: { $in: categoryIds },
                isActive: true,
                $or: [
                    {
                        startDate: { $lte: end },
                        endDate: { $gte: start }
                    }
                ]
            }).populate('categories', 'name');

            if (overlappingOffer) {
                const overlappingCategories = overlappingOffer.categories
                    .filter(cat => categoryIds.includes(cat._id.toString()))
                    .map(cat => cat.name)
                    .join(', ');

                return res.status(400).json({
                    success: false,
                    message: `An active offer already exists for the following categories during this period: ${overlappingCategories}. The existing offer "${overlappingOffer.name}" is valid from ${new Date(overlappingOffer.startDate).toLocaleDateString()} to ${new Date(overlappingOffer.endDate).toLocaleDateString()}.`
                });
            }
        } else if (offerType === 'product' && products) {
            const productIds = Array.isArray(products) ? products : [products];
            overlappingOffer = await Offer.findOne({
                products: { $in: productIds },
                isActive: true,
                $or: [
                    {
                        startDate: { $lte: end },
                        endDate: { $gte: start }
                    }
                ]
            }).populate('products', 'name');

            if (overlappingOffer) {
                const overlappingProducts = overlappingOffer.products
                    .filter(prod => productIds.includes(prod._id.toString()))
                    .map(prod => prod.name)
                    .join(', ');

                return res.status(400).json({
                    success: false,
                    message: `An active offer already exists for the following products during this period: ${overlappingProducts}. The existing offer "${overlappingOffer.name}" is valid from ${new Date(overlappingOffer.startDate).toLocaleDateString()} to ${new Date(overlappingOffer.endDate).toLocaleDateString()}.`
                });
            }
        }

        // Create offer data based on type
        const offerData = {
            name: name.trim(),
            description: description.trim(),
            discountType,
            discountValue: discountValueNum,
            startDate: start,
            endDate: end,
            type: offerType,
            categories: [],
            products: [],
            isActive: true
        };

        // Add items based on offer type
        if (offerType === 'category') {
            if (!categories || (Array.isArray(categories) && categories.length === 0)) {
                console.log('No categories selected for category offer');
                return res.status(400).json({
                    success: false,
                    message: 'Please select at least one category'
                });
            }
            offerData.categories = Array.isArray(categories) ? categories : [categories];
            offerData.itemId = offerData.categories[0]; // Set the first category as itemId
        } else if (offerType === 'product') {
            if (!products || (Array.isArray(products) && products.length === 0)) {
                console.log('No products selected for product offer');
                return res.status(400).json({
                    success: false,
                    message: 'Please select at least one product'
                });
            }
            offerData.products = Array.isArray(products) ? products : [products];
            offerData.itemId = offerData.products[0]; // Set the first product as itemId
        } else {
            console.log('Invalid offer type:', offerType);
            return res.status(400).json({
                success: false,
                message: 'Invalid offer type'
            });
        }

        console.log('Offer data to save:', offerData); // Debug log

        // Create and save the offer
        const offer = new Offer(offerData);
        
        // Validate the offer before saving
        await offer.validate();
        
        const savedOffer = await offer.save();
        console.log('Saved offer:', savedOffer); // Debug log

        if (!savedOffer) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create offer'
            });
        }

        // Populate the saved offer for confirmation
        const populatedOffer = await Offer.findById(savedOffer._id)
            .populate('categories', 'name')
            .populate('products', 'name');
        
        console.log('Populated offer:', populatedOffer); // Debug log

        // Apply offer to products based on type
        let productsToUpdate = [];
        if (offer.type === 'category') {
            productsToUpdate = await Product.find({
                category: { $in: offer.categories },
                isDeleted: false,
                isBlocked: false
            });
        } else if (offer.type === 'product') {
            productsToUpdate = await Product.find({
                _id: { $in: offer.products },
                isDeleted: false,
                isBlocked: false
            });
        }

        let updatedCount = 0;
        for (const product of productsToUpdate) {
            const updated = await applyOfferToProduct(product, savedOffer);
            if (updated) updatedCount++;
        }

        return res.status(200).json({
            success: true,
            message: `Offer created successfully. Applied to ${updatedCount} products.`,
            offer: savedOffer
        });
    } catch (error) {
        console.error('Error creating offer:', error);
        
        // Handle duplicate offer error
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors || { message: error.message }).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }
        
        // Handle other errors
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create offer'
        });
    }
};

// Render edit offer form
exports.getEditOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id)
            .populate('categories', 'name')
            .populate('products', 'name');
            
        if (!offer) {
            req.flash('error', 'Offer not found');
            return res.redirect('/admin/offers');
        }

        const categories = await Category.find({ isBlocked: false, isDeleted: false });
        const products = await Product.find({ isBlocked: false, isDeleted: false });

        res.render('admin/edit-offer', {
            offer,
            categories,
            products,
            title: 'Edit Offer'
        });
    } catch (error) {
        console.error('Error loading edit offer form:', error);
        req.flash('error', 'Failed to load edit offer form');
        res.redirect('/admin/offers');
    }
};

// Update offer
exports.updateOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        const {
            name,
            description,
            discountType,
            discountValue,
            startDate,
            endDate,
            categories,
            products,
            offerType
        } = req.body;

        // Find existing offer
        const existingOffer = await Offer.findById(offerId);
        if (!existingOffer) {
            req.flash('error', 'Offer not found');
            return res.redirect('/admin/offers');
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            req.flash('error', 'Invalid date format');
            return res.redirect(`/admin/edit-offer/${offerId}`);
        }

        if (start > end) {
            req.flash('error', 'End date must be after start date');
            return res.redirect(`/admin/edit-offer/${offerId}`);
        }

        // Validate discount value
        const discountValueNum = parseFloat(discountValue);
        if (isNaN(discountValueNum)) {
            req.flash('error', 'Invalid discount value');
            return res.redirect(`/admin/edit-offer/${offerId}`);
        }

        if (discountType === 'percentage' && (discountValueNum < 0 || discountValueNum > 90)) {
            req.flash('error', 'Percentage discount must be between 0 and 90');
            return res.redirect(`/admin/edit-offer/${offerId}`);
        }

        if (discountType === 'fixed' && discountValueNum < 0) {
            req.flash('error', 'Fixed discount cannot be negative');
            return res.redirect(`/admin/edit-offer/${offerId}`);
        }

        // Check for overlapping offers (excluding current offer)
        let overlappingOffer;
        if (offerType === 'category' && categories) {
            const categoryIds = Array.isArray(categories) ? categories : [categories];
            overlappingOffer = await Offer.findOne({
                _id: { $ne: offerId },
                categories: { $in: categoryIds },
                isActive: true,
                $or: [
                    {
                        startDate: { $lte: end },
                        endDate: { $gte: start }
                    }
                ]
            }).populate('categories', 'name');

            if (overlappingOffer) {
                const overlappingCategories = overlappingOffer.categories
                    .filter(cat => categoryIds.includes(cat._id.toString()))
                    .map(cat => cat.name)
                    .join(', ');

                req.flash('error', `An active offer already exists for the following categories during this period: ${overlappingCategories}`);
                return res.redirect(`/admin/edit-offer/${offerId}`);
            }
        } else if (offerType === 'product' && products) {
            const productIds = Array.isArray(products) ? products : [products];
            overlappingOffer = await Offer.findOne({
                _id: { $ne: offerId },
                products: { $in: productIds },
                isActive: true,
                $or: [
                    {
                        startDate: { $lte: end },
                        endDate: { $gte: start }
                    }
                ]
            }).populate('products', 'name');

            if (overlappingOffer) {
                const overlappingProducts = overlappingOffer.products
                    .filter(prod => productIds.includes(prod._id.toString()))
                    .map(prod => prod.name)
                    .join(', ');

                req.flash('error', `An active offer already exists for the following products during this period: ${overlappingProducts}`);
                return res.redirect(`/admin/edit-offer/${offerId}`);
            }
        }

        // Remove offer from previously associated products
        let oldProductsToUpdate = [];
        if (existingOffer.type === 'category') {
            oldProductsToUpdate = await Product.find({
                category: { $in: existingOffer.categories },
                appliedOffer: offerId
            });
        } else {
            oldProductsToUpdate = await Product.find({
                _id: { $in: existingOffer.products },
                appliedOffer: offerId
            });
        }

        // Reset products that had this offer applied and recalculate prices
        for (const product of oldProductsToUpdate) {
            // Find other applicable offers for this product
            let bestOffer = null;
            const productOffers = await Offer.find({
                _id: { $ne: offerId },
                isActive: true,
                $or: [
                    { type: 'product', products: product._id },
                    { type: 'category', categories: product.category }
                ]
            });

            // Find the best offer
            for (const offer of productOffers) {
                if (!bestOffer || isBetterOffer(bestOffer, offer, product.regularPrice)) {
                    bestOffer = offer;
                }
            }

            if (bestOffer) {
                // Apply the next best offer
                await applyOfferToProduct(product, bestOffer);
            } else {
                // If no other offers, reset to regular price
                await Product.findByIdAndUpdate(product._id, {
                    salePrice: product.regularPrice,
                    appliedOffer: null,
                    appliedOfferType: null,
                    discountType: null,
                    discountValue: 0,
                    discountAmount: 0
                });
            }
        }

        // Update offer data
        const updatedOfferData = {
            name: name.trim(),
            description: description.trim(),
            discountType,
            discountValue: discountValueNum,
            startDate: start,
            endDate: end,
            type: offerType,
            categories: offerType === 'category' ? (Array.isArray(categories) ? categories : [categories]) : [],
            products: offerType === 'product' ? (Array.isArray(products) ? products : [products]) : [],
            isActive: existingOffer.isActive
        };

        // Update the offer
        const updatedOffer = await Offer.findByIdAndUpdate(
            offerId,
            updatedOfferData,
            { new: true }
        );

        // Apply updated offer to new products if offer is active
        if (updatedOffer.isActive) {
            let newProductsToUpdate = [];
            if (updatedOffer.type === 'category') {
                newProductsToUpdate = await Product.find({
                    category: { $in: updatedOffer.categories },
                    isDeleted: false,
                    isBlocked: false
                });
            } else {
                newProductsToUpdate = await Product.find({
                    _id: { $in: updatedOffer.products },
                    isDeleted: false,
                    isBlocked: false
                });
            }

            let updatedCount = 0;
            for (const product of newProductsToUpdate) {
                const updated = await applyOfferToProduct(product, updatedOffer);
                if (updated) updatedCount++;
            }
        }

        req.flash('success', 'Offer updated successfully');
        return res.redirect('/admin/offers');

    } catch (error) {
        console.error('Error updating offer:', error);
        req.flash('error', error.message || 'Failed to update offer');
        return res.redirect(`/admin/edit-offer/${req.params.id}`);
    }
};

// Toggle offer status
exports.toggleOfferStatus = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        offer.isActive = !offer.isActive;
        await offer.save();

        // If deactivating offer, remove it from products
        if (!offer.isActive) {
            let productsToUpdate = [];
            if (offer.type === 'category') {
                productsToUpdate = await Product.find({
                    category: { $in: offer.categories },
                    appliedOffer: offer._id
                });
            } else {
                productsToUpdate = await Product.find({
                    _id: { $in: offer.products },
                    appliedOffer: offer._id
                });
            }

            for (const product of productsToUpdate) {
                await Product.findByIdAndUpdate(product._id, {
                    salePrice: product.regularPrice,
                    appliedOffer: null,
                    appliedOfferType: null,
                    discountType: null,
                    discountValue: 0,
                    discountAmount: 0
                });
            }
        }

        res.json({
            success: true,
            message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: offer.isActive
        });
    } catch (error) {
        console.error('Error toggling offer status:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle offer status' });
    }
};

// Delete offer
exports.deleteOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        const offer = await Offer.findById(offerId);
        
        if (!offer) {
            return res.status(404).json({ 
                success: false, 
                message: 'Offer not found' 
            });
        }

        // Find affected products
        let productsToUpdate = [];
        if (offer.type === 'category') {
            productsToUpdate = await Product.find({
                category: { $in: offer.categories },
                appliedOffer: offerId
            }).populate('category');
        } else {
            productsToUpdate = await Product.find({
                _id: { $in: offer.products },
                appliedOffer: offerId
            }).populate('category');
        }

        // Process each affected product
        for (const product of productsToUpdate) {
            // Find all active offers that could apply to this product
            const applicableOffers = await Offer.find({
                _id: { $ne: offerId },
                isActive: true,
                $or: [
                    { type: 'product', products: product._id },
                    { type: 'category', categories: product.category._id }
                ]
            }).sort({ discountValue: -1 }); // Sort by discount value to get highest discount first

            let bestOffer = null;
            let bestDiscountedPrice = product.regularPrice;

            // Calculate the best offer
            for (const currentOffer of applicableOffers) {
                let currentDiscountedPrice;
                
                if (currentOffer.discountType === 'percentage') {
                    const discountAmount = (product.regularPrice * currentOffer.discountValue) / 100;
                    currentDiscountedPrice = product.regularPrice - discountAmount;
                } else {
                    // For fixed amount
                    if (currentOffer.discountValue > (product.regularPrice * 0.75)) {
                        // Don't allow discount more than 75% of regular price
                        currentDiscountedPrice = product.regularPrice * 0.25;
                    } else {
                        currentDiscountedPrice = product.regularPrice - currentOffer.discountValue;
                    }
                }

                // Ensure minimum price (25% of regular price)
                const minimumPrice = product.regularPrice * 0.25;
                if (currentDiscountedPrice < minimumPrice) {
                    currentDiscountedPrice = minimumPrice;
                }

                // If this offer gives better discount, make it the best offer
                if (currentDiscountedPrice < bestDiscountedPrice) {
                    bestDiscountedPrice = currentDiscountedPrice;
                    bestOffer = currentOffer;
                }
            }

            if (bestOffer) {
                // Calculate final discount amount for best offer
                let discountAmount;
                if (bestOffer.discountType === 'percentage') {
                    discountAmount = (product.regularPrice * bestOffer.discountValue) / 100;
                } else {
                    discountAmount = Math.min(bestOffer.discountValue, product.regularPrice * 0.75);
                }

                // Ensure minimum price
                const minimumPrice = product.regularPrice * 0.25;
                const newSalePrice = Math.max(product.regularPrice - discountAmount, minimumPrice);

                // Apply the best offer
                await Product.findByIdAndUpdate(product._id, {
                    salePrice: newSalePrice,
                    appliedOffer: bestOffer._id,
                    appliedOfferType: bestOffer.type,
                    discountType: bestOffer.discountType,
                    discountValue: bestOffer.discountValue,
                    discountAmount: product.regularPrice - newSalePrice
                });
            } else {
                // If no other offers found, reset to regular price
                await Product.findByIdAndUpdate(product._id, {
                    salePrice: product.regularPrice,
                    appliedOffer: null,
                    appliedOfferType: null,
                    discountType: null,
                    discountValue: 0,
                    discountAmount: 0
                });
            }
        }

        // Delete the offer
        await Offer.findByIdAndDelete(offerId);

        res.json({ 
            success: true, 
            message: 'Offer deleted successfully',
            offerId: offerId,
            affectedProducts: productsToUpdate.length
        });
    } catch (error) {
        console.error('Error deleting offer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred while deleting the offer',
            error: error.message
        });
    }
}; 