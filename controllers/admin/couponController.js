const Coupon = require('../../models/Coupon');

const listCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const search = req.query.search || '';
        const status = req.query.status;

        let query = {};
        
        if (search) {
            query.$or = [
                { code: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (status === 'active') {
            query.isActive = true;
            query.expiryDate = { $gt: new Date() };
        } else if (status === 'inactive') {
            query.$or = [
                { isActive: false },
                { expiryDate: { $lte: new Date() } }
            ];
        }

        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit);

        const coupons = await Coupon.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const transformedCoupons = coupons.map(coupon => {
            const couponObj = coupon.toObject();
            if (new Date(couponObj.expiryDate) <= new Date()) {
                couponObj.isActive = false;
            }
            return couponObj;
        });

        res.render('admin/coupons', {
            coupons: transformedCoupons,
            currentPage: page,
            totalPages,
            search,
            status,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error in listCoupons:', error);
        req.flash('error', 'Failed to fetch coupons');
        res.redirect('/admin/dashboard');
    }
};

const getAddCoupon = (req, res) => {
    res.render('admin/add-coupon', {
        errors: {},
        formData: {},
        messages: req.flash()
    });
};

const addCoupon = async (req, res) => {
    try {
        const {
            code,
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maximumDiscount,
            startDate,
            expiryDate,
            usageLimit
        } = req.body;

        const errors = {};
        
        if (!code || code.trim().length < 3) {
            errors.code = 'Coupon code must be at least 3 characters long';
        }

        if (await Coupon.findOne({ code: code.toUpperCase() })) {
            errors.code = 'Coupon code already exists';
        }

        if (!description || description.trim().length < 10) {
            errors.description = 'Description must be at least 10 characters long';
        }

        if (!['percentage', 'fixed'].includes(discountType)) {
            errors.discountType = 'Invalid discount type';
        }

        if (discountType === 'percentage' && (discountAmount < 1 || discountAmount > 99)) {
            errors.discountAmount = 'Percentage discount must be between 1 and 99';
        }

        if (discountType === 'fixed' && discountAmount < 1) {
            errors.discountAmount = 'Fixed discount must be greater than 0';
        }

        if (minimumPurchase < discountAmount) {
            errors.minimumPurchase = 'Minimum purchase must be greater than discount amount';
        }

        if (maximumDiscount < discountAmount) {
            errors.maximumDiscount = 'Maximum discount must be greater than discount amount';
        }

        if (new Date(startDate) >= new Date(expiryDate)) {
            errors.dates = 'Start date must be before expiry date';
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/add-coupon', {
                errors,
                formData: req.body,
                messages: req.flash()
            });
        }

        const coupon = new Coupon({
            code: code.toUpperCase(),
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maximumDiscount,
            startDate,
            expiryDate,
            usageLimit
        });

        await coupon.save();
        req.flash('success', 'Coupon created successfully');
        res.redirect('/admin/coupons');

    } catch (error) {
        console.error('Error in addCoupon:', error);
        req.flash('error', 'Failed to create coupon');
        res.redirect('/admin/add-coupon');
    }
};

const getEditCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            req.flash('error', 'Coupon not found');
            return res.redirect('/admin/coupons');
        }

        res.render('admin/edit-coupon', {
            coupon,
            errors: {},
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error in getEditCoupon:', error);
        req.flash('error', 'Failed to fetch coupon');
        res.redirect('/admin/coupons');
    }
};

const editCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const {
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maximumDiscount,
            startDate,
            expiryDate,
            usageLimit
        } = req.body;

     
        const errors = {};
        
        if (!description || description.trim().length < 10) {
            errors.description = 'Description must be at least 10 characters long';
        }

        if (!['percentage', 'fixed'].includes(discountType)) {
            errors.discountType = 'Invalid discount type';
        }

        if (discountType === 'percentage' && (discountAmount < 1 || discountAmount > 99)) {
            errors.discountAmount = 'Percentage discount must be between 1 and 99';
        }

        if (discountType === 'fixed' && discountAmount < 1) {
            errors.discountAmount = 'Fixed discount must be greater than 0';
        }

        if (minimumPurchase < discountAmount) {
            errors.minimumPurchase = 'Minimum purchase must be greater than discount amount';
        }

        if (maximumDiscount < discountAmount) {
            errors.maximumDiscount = 'Maximum discount must be greater than discount amount';
        }

        if (new Date(startDate) >= new Date(expiryDate)) {
            errors.dates = 'Start date must be before expiry date';
        }

        if (Object.keys(errors).length > 0) {
            const coupon = await Coupon.findById(couponId);
            return res.render('admin/edit-coupon', {
                coupon,
                errors,
                messages: req.flash()
            });
        }

        await Coupon.findByIdAndUpdate(couponId, {
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maximumDiscount,
            startDate,
            expiryDate,
            usageLimit
        });

        req.flash('success', 'Coupon updated successfully');
        res.redirect('/admin/coupons');

    } catch (error) {
        console.error('Error in editCoupon:', error);
        req.flash('error', 'Failed to update coupon');
        res.redirect(`/admin/edit-coupon/${req.params.id}`);
    }
};

const toggleCouponStatus = async (req, res) => {
    try {
        console.log('Toggle request received for coupon:', req.params.id);
        
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            console.log('Coupon not found');
            return res.status(404).json({ 
                success: false, 
                message: 'Coupon not found' 
            });
        }

        // Check if trying to activate an expired coupon
        if (!coupon.isActive && new Date(coupon.expiryDate) <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot activate expired coupon'
            });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();
        
        console.log('Coupon status updated:', coupon.isActive);

        res.json({
            success: true,
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: coupon.isActive
        });
    } catch (error) {
        console.error('Error in toggleCouponStatus:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to toggle coupon status' 
        });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        console.log('Delete request received for coupon:', req.params.id);
        
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) {
            console.log('Coupon not found');
            return res.status(404).json({ 
                success: false, 
                message: 'Coupon not found' 
            });
        }

        console.log('Coupon deleted successfully');
        res.json({ 
            success: true, 
            message: 'Coupon deleted successfully' 
        });
    } catch (error) {
        console.error('Error in deleteCoupon:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete coupon' 
        });
    }
};

module.exports = {
    listCoupons,
    getAddCoupon,
    addCoupon,
    getEditCoupon,
    editCoupon,
    toggleCouponStatus,
    deleteCoupon
}; 