const Coupon = require('../../models/Coupon');
const User = require('../../models/User');

const couponController = {
    getAvailableCoupons: async (req, res) => {
        try {
            const userId = req.session.user;
            const user = await User.findById(userId);
            
            const usedCouponIds = user.couponUsed || [];
            const appliedCouponIds = user.appliedCoupons
                .filter(ac => ac.status === 'applied')
                .map(ac => ac.coupon);
            
            const excludedCouponIds = [...usedCouponIds, ...appliedCouponIds];
            
            const coupons = await Coupon.find({
                isActive: true,
                _id: { $nin: excludedCouponIds },
                startDate: { $lte: new Date() },
                expiryDate: { $gt: new Date() },
                $expr: { $lt: ['$usedCount', '$usageLimit'] }  
            });
            
            if (!coupons || coupons.length === 0) {
                return res.json({
                    success: false,
                    message: 'No coupons available'
                });
            }

            const availableCoupons = coupons.filter(coupon => 
                coupon.usedCount < coupon.usageLimit
            );

            if (availableCoupons.length === 0) {
                return res.json({
                    success: false,
                    message: 'No coupons available'
                });
            }

            res.json({
                success: true,
                coupons: availableCoupons.map(coupon => ({
                    code: coupon.code,
                    description: coupon.description,
                    discountType: coupon.discountType,
                    discountAmount: coupon.discountAmount,
                    minimumPurchase: coupon.minimumPurchase,
                    maximumDiscount: coupon.maximumDiscount
                }))
            });
        } catch (error) {
            console.error('Error fetching coupons:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching available coupons'
            });
        }
    },

    applyCoupon: async (req, res) => {
        try {
            const { code, cartTotal, subtotal } = req.body; // cartTotal includes shipping, subtotal is without shipping
            const userId = req.session.user;
            
            const user = await User.findById(userId);
            const existingAppliedCoupon = user.appliedCoupons.find(ac => ac.status === 'applied');
            
            if (existingAppliedCoupon) {
                return res.json({
                    success: false,
                    message: 'Please remove the currently applied coupon first'
                });
            }
            
            const coupon = await Coupon.findOne({ 
                code: code.toUpperCase(),
                isActive: true,
                startDate: { $lte: new Date() },
                expiryDate: { $gt: new Date() }
            });
            
            if (!coupon) {
                return res.json({
                    success: false,
                    message: 'Invalid or expired coupon'
                });
            }
            
            if (user.couponUsed.includes(coupon._id)) {
                return res.json({
                    success: false,
                    message: 'You have already used this coupon'
                });
            }
            
            // Check minimum purchase against subtotal (excluding shipping)
            if (subtotal < coupon.minimumPurchase) {
                return res.json({
                    success: false,
                    message: `Minimum purchase of ₹${coupon.minimumPurchase} required (excluding shipping)`
                });
            }
            
            if (coupon.usedCount >= coupon.usageLimit) {
                return res.json({
                    success: false,
                    message: 'Coupon usage limit reached'
                });
            }

            // Calculate discount based on coupon type using subtotal
            let calculatedDiscount;
            if (coupon.discountType === 'percentage') {
                // For percentage discount
                const discountAmount = (subtotal * coupon.discountAmount) / 100;
                calculatedDiscount = Math.min(discountAmount, coupon.maximumDiscount);
            } else {
                // For fixed amount discount
                calculatedDiscount = Math.min(coupon.discountAmount, subtotal);
            }

            // Ensure discount doesn't exceed subtotal
            calculatedDiscount = Math.min(calculatedDiscount, subtotal);

            
            res.json({
                success: true,
                message: 'Coupon applied successfully',
                coupon: {
                    _id: coupon._id,
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountAmount: coupon.discountAmount,
                    maximumDiscount: coupon.maximumDiscount,
                    calculatedDiscount
                }
            });
        } catch (error) {
            console.error('Error applying coupon:', error);
            res.status(500).json({
                success: false,
                message: 'Error applying coupon'
            });
        }
    },

    removeCoupon: async (req, res) => {
        try {
            const userId = req.session.user;
            const { couponId } = req.body;

            await User.findByIdAndUpdate(userId, {
                $set: {
                    'appliedCoupons.$[elem].status': 'cancelled'
                }
            }, {
                arrayFilters: [{ 
                    'elem.coupon': couponId,
                    'elem.status': 'applied'
                }]
            });

            res.json({
                success: true,
                message: 'Coupon removed successfully'
            });
        } catch (error) {
            console.error('Error removing coupon:', error);
            res.status(500).json({
                success: false,
                message: 'Error removing coupon'
            });
        }
    }
};

function calculateDiscountAmount(coupon, cartTotal) {
    if (coupon.discountType === 'percentage') {
        return Math.min(
            (cartTotal * coupon.discountAmount / 100),
            coupon.maximumDiscount
        );
    }
    return coupon.discountAmount;
}

module.exports = couponController; 