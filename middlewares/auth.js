const User = require('../models/User')

const userAuth = async (req, res, next) => {
    try {
        if (req.session.user) {
            const user = await User.findById(req.session.user);
            if (!user || user.isBlocked || user.isDeleted) {
                req.session.destroy();
                return res.status(403).render('user/login', {
                    message: user?.isBlocked ? 
                        "Your account has been blocked. Please contact support." : 
                        "Account not found or deactivated.",
                    categories: []
                });
            }
            res.redirect('/');
        } else {
            next();
        }
    } catch (error) {
        console.error("Auth middleware error:", error);
        next(error);
    }
}

const checkUserSession = async (req, res, next) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }
        
        const user = await User.findById(req.session.user);
        if (!user || user.isBlocked || user.isDeleted) {
            req.session.destroy((err) => {
                if (err) console.error("Session destruction error:", err);
                return res.status(403).render('user/login', {
                    message: user?.isBlocked ? 
                        "Your account has been blocked. Please contact support." : 
                        "Account not found or deactivated.",
                    categories: []
                });
            });
        } else {
            next();
        }
    } catch (error) {
        console.error("Session check error:", error);
        next(error);
    }
}

const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        res.redirect('/admin');
    } else {
        next();
    }
}

const adminAuthentication = (req, res, next) => {
    if (req.session.admin) {
        next();
    } else {
        res.redirect('/admin/login');
    }
}

module.exports = {
    userAuth,
    checkUserSession,
    adminAuth,
    adminAuthentication,
}