const express = require('express');
const userRouter = express.Router();
const authController = require('../controllers/user/authController');
const userController = require('../controllers/user/userConroller');
const addressController = require('../controllers/user/addressController');
const passport = require('passport');
const product = require('../models/Products');
const { userAuth, checkUserSession } = require('../middlewares/auth')
const cartController = require('../controllers/user/cartController');
const wishlistController = require('../controllers/user/wishlistController');
const orderController = require('../controllers/user/orderController');
const { verifyCartStock } = require('../utils/cartVerify');
const walletController = require('../controllers/user/walletController');
const couponController = require('../controllers/user/couponController');

userRouter.get('/login', userAuth, authController.getLogin);
userRouter.post('/login', userAuth, authController.checkUser);
userRouter.get('/signup', userAuth, authController.getSignup);
userRouter.post('/signup', userAuth, authController.insertUser);
userRouter.post('/logout', authController.getLogout);

userRouter.get('/', authController.getHome);
userRouter.get('/homeWithoutUser', checkUserSession, authController.getHome);
userRouter.get('/product/:id', authController.getProduct);
userRouter.get('/category/:categoryId', authController.getProductsByCategory);
userRouter.get('/search', authController.searchProducts);
userRouter.get('/search/suggestions', authController.getSearchSuggestions);

userRouter.get('/forgot-password',authController.getForgotPassPage);
userRouter.post('/forgot-email-valid',authController.forgotEmailValid);
userRouter.post('/forgot-pass-verifyOtp', authController.verifyPassOtp);
userRouter.post('/resend-forgot-otp', authController.resendPassOtp);
userRouter.get('/forgot-password-change', authController.getForgotPasswordChange);
userRouter.post('/forgot-password-change', authController.postForgotPasswordChange);

userRouter.post('/verify-otp', authController.verifyOtp);
userRouter.post('/resend-otp', authController.resendOtp);

userRouter.get('/shop', authController.getShopProducts);

// Account
userRouter.get('/profile',checkUserSession, userController.getUserProfile);
userRouter.post('/profile/editProfile/:id',checkUserSession, userController.editProfile)

userRouter.get('/change-password',checkUserSession, authController.getChangePassword);
userRouter.post('/change-password',checkUserSession,  authController.getNewPassword);

userRouter.get('/address',checkUserSession,  addressController.getAddress);

userRouter.get('/profile/add-address',checkUserSession,  addressController.getAddAddress);
userRouter.post('/profile/add-address', addressController.addAddress);

userRouter.delete('/profile/delete-address/:id',checkUserSession,  addressController.deleteAddress);
userRouter.get('/profile/edit-address/:id',checkUserSession,  addressController.getEditAddress);
userRouter.post('/profile/edit-address/:id',checkUserSession, addressController.editAddress);



userRouter.put('/profile/set-default-address/:id',checkUserSession, addressController.setDefaultAddress);



userRouter.get('/auth/google',
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account' 
    })
);

userRouter.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login',
        failureFlash: true
    }),
    (req, res) => {
        if (!req.user || req.user.isBlocked || req.user.isDeleted) {
            req.session.destroy();
            return res.status(403).render('user/login', {
                message: req.user?.isBlocked ? 
                    "Your account has been blocked" : 
                    "Account not found or deactivated.",
                categories: []
            });
        }
        req.session.user = req.user._id
        res.redirect('/');
    }
);

userRouter.get('/cart', checkUserSession, cartController.getCart);
userRouter.post('/cart/add', checkUserSession, cartController.addToCart);
userRouter.delete('/cart/remove/:productId', checkUserSession, cartController.removeFromCart);
userRouter.put('/cart/update', checkUserSession, cartController.updateCartQuantity);
userRouter.get('/cart/check-quantity/:productId', checkUserSession, cartController.checkQuantity);


userRouter.get('/wishlist', checkUserSession, wishlistController.getWishlist);
userRouter.post('/wishlist/add', checkUserSession, wishlistController.addToWishlist);
userRouter.delete('/wishlist/remove/:productId', checkUserSession, wishlistController.removeFromWishlist);

userRouter.get('/wishlist/items',checkUserSession, wishlistController.getWishlistItems);
userRouter.get('/check-auth', wishlistController.checkAuth);


userRouter.get('/checkout', checkUserSession, verifyCartStock, orderController.getCheckout);
userRouter.post('/order/create', checkUserSession, orderController.createOrder);

userRouter.get('/checkout/add-address', checkUserSession, addressController.getCheckoutAddAddress);
userRouter.post('/checkout/add-address', checkUserSession, addressController.addCheckoutAddress);
userRouter.get('/checkout/edit-address/:id', checkUserSession, addressController.getCheckoutEditAddress);
userRouter.post('/checkout/edit-address/:id', checkUserSession, addressController.editCheckoutAddress);

userRouter.get('/checkout/view-addresses', checkUserSession, addressController.getCheckoutAddresses);


userRouter.get('/order/confirmation/:orderId', checkUserSession, orderController.getOrderConfirmation);
userRouter.get('/orders', checkUserSession, orderController.getUserOrders);

userRouter.get('/order/:id', checkUserSession, async (req, res, next) => {
    if (req.params.id === 'failed') {
        return orderController.getOrderFailed(req, res);
    }
    return orderController.getOrderDetails(req, res);
});
userRouter.get('/order/:orderId/invoice', checkUserSession, orderController.downloadInvoice);


userRouter.post('/order/:orderId/cancel', checkUserSession, orderController.cancelOrder);
userRouter.post('/order/:orderId/item/:itemId/cancel', checkUserSession, orderController.cancelOrderItem);

userRouter.post('/order/create-razorpay-order', checkUserSession, orderController.createRazorpayOrder);
userRouter.post('/order/verify-payment', checkUserSession, orderController.verifyPayment);
userRouter.post('/order/handle-payment-modal-close', checkUserSession, orderController.handlePaymentModalClose);


userRouter.post('/order/:orderId/return', checkUserSession, orderController.requestOrderReturn);
userRouter.post('/order/:orderId/item/:itemId/return', checkUserSession, orderController.requestItemReturn);

userRouter.get('/wallet', checkUserSession, walletController.getWallet);
userRouter.post('/wallet/add', checkUserSession, walletController.addMoney);

userRouter.get('/coupons/available', checkUserSession, couponController.getAvailableCoupons);
userRouter.post('/coupons/apply', checkUserSession, couponController.applyCoupon);
userRouter.post('/coupons/remove', checkUserSession, couponController.removeCoupon);

userRouter.post('/order/retry-payment/:orderId', checkUserSession, orderController.retryPayment);
userRouter.post('/order/:orderId/abort', checkUserSession, orderController.abortOrder);

userRouter.get('/order/failed/:orderId?', checkUserSession, orderController.getOrderFailed);
userRouter.post('/order/payment-modal-closed', checkUserSession, orderController.handlePaymentModalClose);

userRouter.get('/about', authController.getAbout);
userRouter.get('/contact', authController.getContact);

module.exports = userRouter; 
