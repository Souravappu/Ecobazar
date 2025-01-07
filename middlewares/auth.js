const User = require('../models/User')

const userAuth = async (req, res, next) => {
    try {
        if (req.session.user) {
            const user = await User.findById(req.session.user);
            if (!user || user.isBlocked || user.isDeleted) {
                req.session.destroy();
                return res.status(403).render('user/login', {
                    error: user?.isBlocked ? 
                        "Your account has been temporarily suspended. Please contact support for assistance." : 
                        "Invalid email or password",
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
                    error: user?.isBlocked ? 
                        "Your account has been temporarily suspended. Please contact support for assistance." : 
                        "Invalid email or password",
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

const checkAdminSession = (req, res, next) => {
    if (req.session.admin) {
        next();
    } else {
        res.redirect('/admin/login');
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
    checkAdminSession,
}