const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');
const Wallet = require('../models/Wallet');
require('dotenv').config();
const bcrypt = require('bcrypt');

// Helper function for initializing user collections
const initializeUserCollections = async (userId) => {
    try {
        const [newCart, newWishlist, newWallet] = await Promise.all([
            new Cart({ 
                user: userId, 
                items: [], 
                total: 0 
            }).save(),
            new Wishlist({ 
                user: userId, 
                items: [] 
            }).save(),
            new Wallet({
                user: userId,
                balance: 0,
                transactions: []
            }).save()
        ]);
        return true;
    } catch (error) {
        console.error('Error initializing user collections:', error);
        throw error;
    }
};

// Initialize Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:"https://ecobazar.shop/auth/google/callback"|| '/auth/google/callback'
}, 
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
            if (!user.googleId) {
                return done(null, false, { 
                    message: 'Email already registered. Please login with password.' 
                });
            }

            if (user.isBlocked) {
                return done(null, false, { 
                    message: 'Your account has been blocked' 
                });
            }

            if (user.isDeleted) {
                return done(null, false, { 
                    message: 'Account not found or deactivated' 
                });
            }

            user.lastLogin = new Date();
            await user.save();

            return done(null, user);
        }

        // Create new user
        const hashedPassword = await bcrypt.hash("User@123", 10);
        const newUser = new User({
            googleId: profile.id,
            fname: profile.name.givenName,
            lname: profile.name.familyName,
            email: profile.emails[0].value,
            password: hashedPassword,
            lastLogin: new Date()
        });

        const savedUser = await newUser.save();
        
        // Initialize cart and wishlist for new user
        await initializeUserCollections(savedUser._id);

        return done(null, savedUser);
        
    } catch (err) {
        console.error('Google auth error:', err);
        return done(err, null);
    }
}));

// Serialize user for the session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;