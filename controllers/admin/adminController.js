const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../../models/User');


const getLogin = (req, res) => {
    if (req.session.admin) {
      return res.redirect('/admin/home');
    }
    res.render('admin/admin-login', { message: null }); 
  };
  

const checkLogin = async (req, res) => {
  try {
    console.log("Login request received");

    const { email, password } = req.body;
    if (!email || !password) {
      console.log("Email and password are required");
      return res.redirect("/admin/login");
    }

    const admin = await User.findOne({ email, isAdmin: true });
    console.log("Retrieved Admin:", admin);

    if (!admin) {
      console.log("Admin user not found");
      return res.redirect("/admin/login");
    }

    if (admin.isBlocked) {
      console.log("Admin account is blocked");
      return res.redirect("/admin/login");
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    console.log("Password Match Result:", passwordMatch);

    if (!passwordMatch) {
      console.log("Incorrect password");
      return res.redirect("/admin/login");
    }

    req.session.admin = admin._id; // Use admin ID for consistency
    console.log("Login successful, redirecting to admin page");
    return res.redirect("/admin");
  } catch (error) {
    console.error("Login Error:", error);
    return res.redirect("/page-error");
  }
};



const getHome = async (req, res,) => {
  try {
    if(req.session.admin) {
      return res.render('admin/home'); 
    } else {
      return res.redirect('/admin/login'); 
    }
    
  } catch (error) {
    console.log(error);
    return res.redirect('/page-error');
  }
};


const logout = async (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.log('Error destroying session', err);
        return res.redirect('/error'); 
      }
      return res.redirect('/admin/login');
    });
  } catch (error) {
    console.log('Unexpected error during logout', error); 
    return res.redirect('/error'); 
  }
};


// Customer Controllerr

const customerInfo = async (req, res, next) => {
    try {
        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        let currentStatus = req.query.status || '';
        const limit = 10;

        // Build base query
        let query = { 
            isAdmin: { $ne: true }
        };

        // Add status filter
        if (currentStatus === 'blocked') {
            query.isBlocked = true;
            query.isDeleted = false;
        } else if (currentStatus === 'active') {
            query.isBlocked = false;
            query.isDeleted = false;
        } else if (currentStatus === 'deleted') {
            query.isDeleted = true;
        }

        // Add search filter
        if (search) {
            query.$or = [
                { fname: { $regex: search, $options: "i" } },
                { lname: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }

        // Get total count for pagination
        const count = await User.countDocuments(query);

        // Get users with pagination
        const users = await User.find(query)
            .select('fname lname email phone isBlocked isDeleted status createdAt lastLogin')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit);

        // Get statistics
        const stats = {
            total: await User.countDocuments({ isAdmin: { $ne: true } }),
            active: await User.countDocuments({ 
                isAdmin: { $ne: true }, 
                isBlocked: false, 
                isDeleted: false 
            }),
            blocked: await User.countDocuments({ 
                isAdmin: { $ne: true }, 
                isBlocked: true, 
                isDeleted: false 
            }),
            deleted: await User.countDocuments({ 
                isAdmin: { $ne: true }, 
                isDeleted: true 
            })
        };

        return res.render('admin/customers', {
            data: users,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            searchTerm: search,
            currentStatus,
            stats,
            error: req.query.error,
            success: req.query.success
        });

    } catch (error) {
        console.error("Error in customerInfo:", error);
        next(error);
    }
};

const blockCustomer = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne(
            { _id: id }, 
            { 
                $set: { 
                    isBlocked: true,
                    status: 'blocked'
                } 
            }
        );
        res.redirect('/admin/customers?success=Customer blocked successfully');
    } catch (error) {
        console.error("Error blocking customer:", error);
        res.redirect('/admin/customers?error=Error blocking customer');
    }
};

const unblockCustomer = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne(
            { _id: id }, 
            { 
                $set: { 
                    isBlocked: false,
                    status: 'active'
                } 
            }
        );
        res.redirect('/admin/customers?success=Customer unblocked successfully');
    } catch (error) {
        console.error("Error unblocking customer:", error);
        res.redirect('/admin/customers?error=Error unblocking customer');
    }
};

const deleteCustomer = async (req, res) => {
    try {
        const id = req.query.id;
        
        const user = await User.findById(id);
        
        if (!user) {
            return res.redirect('/admin/customers?error=Customer not found');
        }

        if (user.isDeleted) {
            return res.redirect('/admin/customers?error=Customer is already deleted');
        }

        // Perform soft delete
        const updatedUser = await User.findByIdAndUpdate(
            id,
            {
                $set: {
                    isDeleted: true,
                    status: 'inactive',
                    // Clear sensitive data
                    cart: [],
                    wishlist: [],
                    // Keep order history for records
                    lastLogin: null,
                    updatedAt: new Date()
                }
            },
            { new: true }
        );

        if (!updatedUser) {
            return res.redirect('/admin/customers?error=Error deleting customer');
        }

        if (req.session.user === id) {
            req.session.destroy();
        }

        return res.redirect('/admin/customers?success=Customer has been successfully deleted');

    } catch (error) {
        console.error("Error deleting customer:", error);
        return res.redirect('/admin/customers?error=Error processing delete request');
    }
};

const viewCustomer = async (req, res) => {
    try {
        const customerId = req.params.id;
        const customer = await User.findById(customerId);

        if (!customer) {
            return res.redirect('/admin/customers?error=Customer not found');
        }

        res.render('admin/view-customer', {
            customer,
            title: 'View Customer'
        });
    } catch (error) {
        console.error('Error viewing customer:', error);
        res.redirect('/admin/customers?error=Error viewing customer details');
    }
};

module.exports = {
    getLogin,
    checkLogin,
    getHome,
    logout,
    customerInfo,
    blockCustomer,
    unblockCustomer,
    deleteCustomer,
    viewCustomer,
    
  };
  
