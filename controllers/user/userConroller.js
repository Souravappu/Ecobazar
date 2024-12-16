const User = require("../../models/User");
const Category = require("../../models/Category");
const Address= require("../../models/Address")
const bcrypt = require('bcrypt');

const getUserProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        
        if (!userId) {
            return res.redirect('/login');
        }
        
        const userData = await User.findById(userId);
        
        if (!userData) {
            return res.redirect('/login');
        }
        const address = await Address.findOne({
            userId: userId,
            "address.isDefault": true
          });
          

        const categories = await Category.find({ isListed: true ,isBlocked:false,isDeleted:false});
console.log("address",address);

        res.render('user/profile', {
            user: userData,
            categories,
            address,
            error_msg: req.flash('error_msg') || '',
            success_msg: req.flash('success_msg') || ''
        });

    } catch (error) {
        console.error('Error retrieving profile data', error);
        res.redirect('user/error');
    }
}

const editProfile = async (req, res) => {
    try {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const userId = req.session.user; // Use session user ID instead of params
        const { fname, lname, email, phone } = req.body;

        const user = await User.findById(userId);

        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/profile');
        }

        // Check if no changes were made
        if (fname === user.fname && 
            lname === user.lname && 
            email === user.email && 
            phone === user.phone) {
            req.flash('error_msg', 'No changes detected. Please update a value to continue.');
            return res.redirect('/profile');
        }

        // Validation checks
        if (!fname) {
            req.flash('error_msg', 'First Name is required');
            return res.redirect('/profile');
        }

        if (!emailRegex.test(email)) {
            req.flash('error_msg', 'Enter a valid email address');
            return res.redirect('/profile');
        }

        if (phone.length !== 10) {
            req.flash('error_msg', 'Enter a valid 10-digit phone number');
            return res.redirect('/profile');
        }

        // Update user data
        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { fname, lname, email, phone }, 
            { new: true }
        );

        req.flash('success_msg', 'Profile updated successfully');
        return res.redirect('/profile');

    } catch (error) {
        console.error('Profile edit error:', error);
        req.flash('error_msg', 'An error occurred. Please try again.');
        return res.redirect('/profile');
    }
}

const changePassword = async (req, res) => {
    try {
        const userId = req.session.user;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validate user session
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to continue'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Password validation
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        
        if (!passwordPattern.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least 8 characters, including uppercase, lowercase, number and special character'
            });
        }

        // Check if passwords match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'New passwords do not match'
            });
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await User.findByIdAndUpdate(userId, {
            password: hashedPassword
        });

        res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while changing password'
        });
    }
};

module.exports = {
    getUserProfile,
    editProfile,
    changePassword,
}

