const User = require("../../models/User");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { session } = require("passport");
const Category = require("../../models/Category");
const Product = require("../../models/Products");
const Cart = require('../../models/Cart');
const Wishlist = require('../../models/Wishlist');
require("dotenv").config();

const OTP_EXPIRY_TIME = 30; // 30 seconds to match frontend timer
const OTP_RESEND_DELAY = 30; // 30 seconds to match frontend cooldown

// 404 Error Page Controller
const pageNotFound = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true });
    res.status(404).render("user/error", {
      message: "Page not found",
      categories,
      user: null
    });
  } catch (error) {
    console.error("Error rendering 404 page:", error);
    res.status(500).render("user/error", {
      message: "An unexpected error occurred",
      categories: [],
      user: null
    });
  }
};

//Home Page Controller
const getHome = async (req, res) => {
  try {
    const categories = await Category.find({ 
      isListed: true,
      isBlocked: false,
      isDeleted: false 
    });

    const products = await Product.find({
      isDeleted: false,
      isBlocked: false,
    }).populate({
      path: 'category',
      match: { 
        isBlocked: false, 
        isDeleted: false 
      }
    }).sort({createdAt:-1});

    const filteredProducts = products.filter(product => product.category !== null);

    const hotDeals = products
      .filter(product => {
        return product.regularPrice > product.salePrice && product.quantity > 0;
      })
      .map(product => ({
        ...product.toObject(),
        discountPercentage: Math.round((product.regularPrice - product.salePrice) / product.regularPrice * 100)
      }))
      .sort((a, b) => b.discountPercentage - a.discountPercentage)
      .slice(0, 4); 



    const user = req.session.user;
    if (user) {
      const userData = await User.findOne({ _id: user });
  
      res.render("user/homeWithoutuser", {
        user: userData || null,
        categories,
        products: filteredProducts.slice(0, 10),
        hotDeals 
      });
    } else {
      console.log("no user");
      return res.render("user/homeWithoutUser", {
        user: null,
        categories,
        products: filteredProducts.slice(0, 10),
        hotDeals 
      });
    }
  } catch (error) {
    console.error("Error loading home page:", error);
    res.status(500).send("Server error");
  }
};

// Signup Page Controller
const getSignup = async (req, res) => {
  try {
    const categories = await Category.find({});

    res.render("user/signup", { categories });
  } catch (error) {
    console.error("Error loading signup page:", error);
    res.status(500).send("Server error");
  }
};

// Utility: Generate OTP
const generateOtp = () => {
  return {
    code: Math.floor(1000 + Math.random() * 9000).toString(),
    timestamp: Date.now(),
  };
};

// Utility: Send Verification Email
const sendVerificationEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #2C5F2D; text-align: center;">WELCOME TO ECOBAZAR</h1>
                    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px;">
                        <h3 style="text-align: center;">Your OTP is: <span style="color: #2C5F2D; font-size: 24px;">${otp}</span></h3>
                        <p style="color: #ff4444; text-align: center; font-weight: bold;">Don't share this OTP with anyone!</p>
                    </div>
                </div>
            `,
    };

    const mailInfo = await transporter.sendMail(mailOptions);
    return mailInfo.accepted.length > 0;
  } catch (error) {
    console.error("Email sending error:", error);
    return false;
  }
};

// User Registration Controller
const insertUser = async (req, res) => {
  try {
    const { fname, lname, email, phone, password } = req.body;

    // Input Validation
    if (!fname || !lname || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Generate OTP with timestamp
    const otpData = generateOtp();
    console.log(
      "Generated OTP for registration:",
      otpData.code,
      "at:",
      new Date(otpData.timestamp)
    );

    const emailSent = await sendVerificationEmail(email, otpData.code);
    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email",
      });
    }

    req.session.userOtp = otpData;
    req.session.userData = {
      fname,
      lname,
      email,
      phone,
      password,
    };

    return res.render("user/verify-otp", { email });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during registration. Please try again later.",
    });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.userOtp) {
      return res.status(400).json({
        success: false,
        message: "OTP session expired. Please request a new OTP.",
      });
    }

    const timeDiff = (Date.now() - req.session.userOtp.timestamp) / 1000;
    console.log("Time elapsed since OTP generation:", timeDiff, "seconds");

    if (timeDiff > OTP_EXPIRY_TIME) {
      console.log("OTP expired. Time elapsed:", timeDiff, "seconds");
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (otp !== req.session.userOtp.code) {
      console.log(
        "Invalid OTP provided. Expected:",
        req.session.userOtp.code,
        "Received:",
        otp
      );
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    const userData = req.session.userData;
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create new user
    const newUser = new User({
      fname: userData.fname,
      lname: userData.lname,
      email: userData.email,
      phone: userData.phone,
      password: hashedPassword,
    });

    const savedUser = await newUser.save();

    // Initialize cart and wishlist
    await initializeUserCollections(savedUser._id);

    // Clean up session
    delete req.session.userOtp;
    delete req.session.userData;

    return res.status(200).json({
      success: true,
      redirectUrl: "/login",
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during verification. Please try again.",
    });
  }
};

const resendOtp = async (req, res) => {
  try {
    console.log("Resend OTP request received");

    if (!req.session.userData) {
      console.log("No user data found in session");
      return res.status(400).json({
        success: false,
        message:
          "Your session has expired. Please start the registration process again.",
      });
    }

    // Check if enough time has passed since last OTP
    if (req.session.userOtp) {
      const timeSinceLastOtp =
        (Date.now() - req.session.userOtp.timestamp) / 1000;
      console.log("Time since last OTP:", timeSinceLastOtp, "seconds");

      if (timeSinceLastOtp < OTP_RESEND_DELAY) {
        const timeRemaining = Math.ceil(OTP_RESEND_DELAY - timeSinceLastOtp);
        console.log(
          "Resend attempted too soon. Time remaining:",
          timeRemaining,
          "seconds"
        );
        return res.status(400).json({
          success: false,
          message: `Please wait ${timeRemaining} seconds before requesting a new OTP.`,
        });
      }
    }

    const email = req.session.userData.email;
    console.log("Resending OTP to email:", email);

    const otpData = generateOtp();
    console.log("New OTP generated:", otpData.code);

    const emailSent = await sendVerificationEmail(email, otpData.code);
    if (!emailSent) {
      console.log("Failed to send OTP email");
      return res.status(500).json({
        success: false,
        message: "Unable to send OTP email. Please try again later.",
      });
    }

    req.session.userOtp = otpData;
    console.log("New OTP saved in session");

    return res.status(200).json({
      success: true,
      message: "A new OTP has been sent to your email.",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};

const getLogin = async (req, res) => {
  try {
    if (req.session.user) {
      return res.redirect("/");
    }
    res.render("user/login", {
      error: req.query.error,
      message: req.query.message,
      categories: [],
    });
  } catch (error) {
    console.error("Login page error:", error);
    res.status(500).render("user/error", { message: "Server error" });
  }
};

const checkUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message:
          "This account has been deleted by admin. Please contact support.",
      });
    }

    // Check if user is blocked - be specific here
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    // Check if it's a Google account
    if (user.googleId && !user.password) {
      return res.status(400).json({
        success: false,
        message: "Please use Google Sign-In for this account",
      });
    }

    // Verify password 
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Set session
    req.session.user = user._id;

    return res.status(200).json({
      success: true,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during login. Please try again.",
    });
  }
};

const getLogout = async (req, res) => {
  try {

    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error:", err);
        return res.status(500).json({
          success: false,
          message: "Logout failed",
        });
      }

      // Clear session cookie
      res.clearCookie("connect.sid");

      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    });
  } catch (error) {
    console.error("Logout Error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during logout",
    });
  }
};

const getForgotPassPage = async (req, res) => {
  const categories = await Category.find({});
  console.log(categories);
  res.render("user/forgot-password", {
    error: null,
    success: null,
    categories,
  });
};

const forgotEmailValid = async (req, res) => {
  try {
    const { email } = req.body;
    const categories = await Category.find({});

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("user/forgot-password", {
        error: "No account found with this email address.",
        success: null,
        categories,
      });
    }

    // Generate OTP
    const otpData = generateOtp();
    console.log(`Generated OTP for email ${email}: ${otpData.code}`);
    // Store OTP and timestamp in session
    req.session.forgotPasswordOtp = {
      code: otpData.code,
      timestamp: otpData.timestamp,
      email: email,
    };

    // Send OTP email
    const emailSent = await sendVerificationEmail(email, otpData.code);
    if (!emailSent) {
      return res.render("user/forgot-password", {
        error: "Failed to send OTP. Please try again.",
        success: null,
        categories,
      });
    }

    // Render OTP verification page
    res.render("user/forgotPass-otp", {
      error: null,
      success: "OTP has been sent to your email.",
      categories,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.render("user/forgot-password", {
      error: "An unexpected error occurred. Please try again.",
      success: null,
      categories: [],
    });
  }
};

const verifyPassOtp = (req, res) => {
    try {
        const { otp } = req.body;
        const otpData = req.session.forgotPasswordOtp;
        console.log(otpData)
        if (!otpData) {
            return res.status(400).json({
                success: false,
                message: "OTP session expired. Please request a new OTP.",
                expired: true
            });
        }

        const timeDiff = (Date.now() - otpData.timestamp) / 1000;
        if (timeDiff > OTP_EXPIRY_TIME) {
            delete req.session.forgotPasswordOtp;
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new one.",
                expired: true
            });
        }

        if (otp !== otpData.code) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP. Please try again."
            });
        }

        req.session.resetPasswordEmail = otpData.email;
        return res.status(200).json({
            success: true,
            redirectUrl: '/forgot-password-change'  // Updated redirect URL
        });

    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during verification."
        });
    }
};

const resendPassOtp = async (req, res) => {
  try {
    const otpData = req.session.forgotPasswordOtp;
    if (!otpData || !otpData.email) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please restart the password reset process.",
      });
    }

    // Check if enough time has passed since last OTP (30 seconds)
    const timeSinceLastOtp = (Date.now() - otpData.timestamp) / 1000;
    if (timeSinceLastOtp < 30) {
      return res.status(400).json({
        success: false,
        message: `Please wait ${Math.ceil(
          30 - timeSinceLastOtp
        )} seconds before requesting a new OTP.`,
      });
    }

    // Generate new OTP
    const newOtpData = generateOtp();

    // Send new OTP
    const emailSent = await sendVerificationEmail(
      otpData.email,
      newOtpData.code
    );
    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP. Please try again.",
      });
    }

    // Update session with new OTP data
    req.session.forgotPasswordOtp = {
      code: newOtpData.code,
      timestamp: newOtpData.timestamp,
      email: otpData.email,
    };

    return res.status(200).json({
      success: true,
      message: "New OTP has been sent to your email.",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred. Please try again.",
    });
  }
};

const getChangePassword = async (req, res) => {
    try {
        const userId = req.session.user;
        let user 
        console.log(req.session.resetPasswordEmail)
        if(!userId){
          user = User.findOne({email:req.session.resetPasswordEmail});
        }else{
          user = await User.findById(userId);
        }
        // Fetch user data
       
        if (!user) {
            return res.redirect('/login');
        }

        // Fetch categories
        const categories = await Category.find({ 
            isListed: true,
            isBlocked: false,
            isDeleted: false 
        });

        res.render('user/change-password', { 
            message: null,
            categories,
            user  
        });
    } catch (error) {
        console.error('Error loading change password page:', error);
        res.status(500).render('user/error', { 
            message: 'An error occurred',
            categories: [],
            user: null
        });
    }
};

const getNewPassword = async (req, res) => {
    try {
        const userId = req.session.user;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Fetch user data and categories
        const [user, categories] = await Promise.all([
            User.findById(userId),
            Category.find({ 
                isListed: true,
                isBlocked: false,
                isDeleted: false 
            })
        ]);

        // Check if user exists
        if (!user) {
            return res.render('user/change-password', {
                message: 'User not found',
                categories,
                user: null
            });
        }

        // Special handling for Google users with temporary password
        const isGoogleUser = user.googleId && !user.password;
        const tempPassword = 'User@123';

        // Verify current password
        let isPasswordValid;
        if (isGoogleUser) {
            isPasswordValid = currentPassword === tempPassword;
        } else {
            isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        }

        if (!isPasswordValid) {
            return res.render('user/change-password', {
                message: isGoogleUser ? 
                    'Incorrect temporary password. Please use: User@123' : 
                    'Current password is incorrect',
                categories,
                user
            });
        }

        // Password validation
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordPattern.test(newPassword)) {
            return res.render('user/change-password', {
                message: 'Password must contain at least 8 characters, including uppercase, lowercase, number and special character',
                categories,
                user
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render('user/change-password', {
                message: 'New passwords do not match',
                categories,
                user
            });
        }

        // Hash and update password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update user document
        const updateData = {
            password: hashedPassword,
            hasChangedTemporaryPassword: true
        };

        // If user was a Google user, remove googleId after password change
        if (isGoogleUser) {
            updateData.googleId = null;  // Remove Google ID
        }

        await User.findByIdAndUpdate(userId, updateData);

        // Redirect with success message
        req.flash('success_msg', 'Password updated successfully');
        res.redirect('/profile');

    } catch (error) {
        console.error('Password update error:', error);
        res.render('user/change-password', {
            message: 'An error occurred while updating password',
            categories: [],
            user: null
        });
    }
};

// Add a new function to get product details
const getProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    // Fetch product with category information
    const product = await Product.findOne({
      _id: productId,
      isDeleted: false,
      isBlocked: false,
    }).populate({
      path: "category",
      match: { 
        isBlocked: false, 
        isDeleted: false 
      }
    });

    // If product not found or category is blocked/deleted
    if (!product || !product.category) {
      return res.status(404).render("user/error", {
        message: "Product not found or unavailable",
        categories: [],
      });
    }

    // Fetch active categories for the header
    const categories = await Category.find({ 
      isListed: true,
      isBlocked: false,
      isDeleted: false 
    });

    const user = req.session.user;
    const userData = user ? await User.findOne({ _id: user }) : null;

    // Fetch related products from the same category
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId },
      isDeleted: false,
      isBlocked: false,
    })
      .populate({
        path: "category",
        match: { 
          isBlocked: false, 
          isDeleted: false 
        }
      })
      .limit(4);

    // Filter out products whose category was null after population
    const filteredRelatedProducts = relatedProducts.filter(prod => prod.category !== null);

    // Format image paths
    const formattedProduct = {
      ...product.toObject(),
      images: product.images.map((image) => {
        return image.startsWith("/uploads") ? image : `/uploads/products/${image.split("/").pop()}`;
      }),
    };

    const formattedRelatedProducts = filteredRelatedProducts.map((prod) => ({
      ...prod.toObject(),
      images: prod.images.map((image) => {
        return image.startsWith("/uploads") ? image : `/uploads/products/${image.split("/").pop()}`;
      }),
    }));

    res.render("user/product-details", {
      product: formattedProduct,
      categories,
      user: userData,
      relatedProducts: formattedRelatedProducts,
    });
  } catch (error) {
    console.error("Error getting product details:", error);
    res.status(500).render("user/error", {
      message: "Error loading product details",
      categories: [],
    });
  }
};

// Add a function to get products by category
const getProductsByCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const sort = req.query.sort || "default";
    const priceRange = parseInt(req.query.price) || 100000;

    // Find the current category and check if it's active
    const currentCategory = await Category.findOne({
      _id: categoryId,
      isBlocked: false,
      isDeleted: false
    });

    if (!currentCategory) {
      return res.status(404).render("user/error", {
        message: "Category not found or unavailable",
        categories: [],
      });
    }

    // Build query
    let query = {
      category: categoryId,
      isDeleted: false,
      isBlocked: false,
      salePrice: { $lte: priceRange },
    };

    // Build sort options
    let sortOptions = {};
    switch (sort) {
      case "price-asc":
        sortOptions.salePrice = 1;
        break;
      case "price-desc":
        sortOptions.salePrice = -1;
        break;
      case "newest":
        sortOptions.createdAt = -1;
        break;
      default:
        sortOptions.createdAt = -1;
    }

    // Get total count for pagination
    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get products
    const products = await Product.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category");

    const categories = await Category.find({});

    const user = req.session.user;
    const userData = user ? await User.findOne({ _id: user }) : null;

    // Render the product listing page
    res.render("user/product-listing", {
      title: currentCategory.name,
      products,
      categories,
      currentCategory,
      currentPage: page,
      totalPages,
      sort,
      priceRange,
      user: userData,
    });
  } catch (error) {
    console.error("Error getting category products:", error);
    res.status(500).render("user/error", {
      message: "Error loading category products",
      categories: [],
    });
  }
};

// Add a search products function
const searchProducts = async (req, res) => {
  try {
    const searchQuery = req.query.q;
    const categories = await Category.find({});

    const products = await Product.find({
      isDeleted: false,
      isBlocked: false,
      $or: [
        { name: { $regex: searchQuery, $options: "i" } },
        { description: { $regex: searchQuery, $options: "i" } },
      ],
    }).populate("category");

    const user = req.session.user;
    const userData = user ? await User.findOne({ _id: user }) : null;

    res.render("user/search-results", {
      products,
      categories,
      user: userData,
      searchQuery,
    });
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).render("user/error", {
      message: "Error searching products",
    });
  }
};

const getShopProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const sort = req.query.sort || "default";
    const priceRange = req.query.price ? parseInt(req.query.price) : null;

    let query = {
      isDeleted: false,
      isBlocked: false,
      quantity: { $exists: true },
    };

    if (priceRange && req.query.price !== "any") {
      query.salePrice = { $lte: priceRange };
    }

    // Build sort options
    let sortOptions = {};
    switch (sort) {
      case "price-asc":
        sortOptions.salePrice = 1;
        break;
      case "price-desc":
        sortOptions.salePrice = -1;
        break;
      case "newest":
        sortOptions.createdAt = -1;
        break;
      default:
        sortOptions.createdAt = -1;
    }

    const productsWithCategories = await Product.find(query)
      .populate({
        path: 'category',
        match: { 
          isBlocked: false, 
          isDeleted: false 
        }
      });

    const filteredProducts = productsWithCategories.filter(product => product.category !== null);
    const total = filteredProducts.length;
    const totalPages = Math.ceil(total / limit);

    // Get paginated products
    const products = await Product.find(query)
      .sort(sortOptions)
      .populate({
        path: 'category',
        match: { 
          isBlocked: false, 
          isDeleted: false 
        }
      });

    const paginatedProducts = products
      .filter(product => product.category !== null)
      .slice((page - 1) * limit, page * limit);

    const categories = await Category.find({ 
      isListed: true,
      isBlocked: false,
      isDeleted: false 
    });

    const userData = req.session.user ? 
      await User.findById(req.session.user) : 
      null;

    res.render("user/product-listing", {
      title: "Shop",
      products: paginatedProducts,
      categories,
      currentCategory: null,
      currentPage: page,
      totalPages,
      sort,
      priceRange: priceRange || "any",
      user: userData,
    });
  } catch (error) {
    console.error("Error getting shop products:", error);
    res.status(500).render("user/error", {
      message: "Error loading products",
      categories: [],
    });
  }
};

const getCategoryProducts = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const sort = req.query.sort || "default";
    const priceRange = req.query.price ? parseInt(req.query.price) : null;

    const currentCategory = await Category.findById(categoryId);
    if (!currentCategory) {
      return res.status(404).render("user/error", {
        message: "Category not found",
        categories: [],
      });
    }

    // Build base query to show all products in category
    let query = {
      category: categoryId,
      isDeleted: false,
      isBlocked: false,
      quantity: { $exists: true },
    };

    // Only apply price filter if explicitly set in query params
    if (priceRange && req.query.price !== "any") {
      query.salePrice = { $lte: priceRange };
    }

    let sortOptions = {};
    switch (sort) {
      case "price-asc":
        sortOptions.salePrice = 1;
        break;
      case "price-desc":
        sortOptions.salePrice = -1;
        break;
      case "newest":
        sortOptions.createdAt = -1;
        break;
      default:
        sortOptions.createdAt = -1;
    }

    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    const products = await Product.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category");

    const categories = await Category.find({ isListed: true });

    res.render("user/product-listing", {
      title: currentCategory.name,
      products,
      categories,
      currentCategory,
      currentPage: page,
      totalPages,
      sort,
      priceRange: priceRange || "any",
      user: req.session.user,
    });
  } catch (error) {
    console.error("Error getting category products:", error);
    res.status(500).render("user/error", {
      message: "Error loading category products",
      categories: [],
    });
  }
};

// Add this helper function
const initializeUserCollections = async (userId) => {
    try {
        // create empty cart
        const newCart = new Cart({
            user: userId,
            items: [],
            total: 0
        });

        // create empty wishlist
        const newWishlist = new Wishlist({
            user: userId,
            items: []
        });

        // Save both collections
        await Promise.all([
            newCart.save(),
            newWishlist.save()
        ]);

        return true;
    } catch (error) {
        console.error('Error initializing user collections:', error);
        throw error;
    }
};

// Add these new controller methods

const getForgotPasswordChange = async (req, res) => {
    try {
        if (!req.session.resetPasswordEmail) {
            return res.redirect('/forgot-password');
        }

        const categories = await Category.find({});
        res.render('user/forgot-password-change', {
            message: null,
            categories
        });
    } catch (error) {
        console.error('Error loading password change page:', error);
        res.status(500).render('user/error', {
            message: 'Error loading page',
            categories: []
        });
    }
};

const postForgotPasswordChange = async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;
        const email = req.session.resetPasswordEmail;

        if (!email) {
            return res.redirect('/forgot-password');
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.render('user/forgot-password-change', {
                message: 'User not found',
                categories: []
            });
        }

        // Password validation
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordPattern.test(newPassword)) {
            return res.render('user/forgot-password-change', {
                message: 'Password must meet the requirements',
                categories: []
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render('user/forgot-password-change', {
                message: 'Passwords do not match',
                categories: []
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user's password
        await User.findByIdAndUpdate(user._id, {
            password: hashedPassword,
            hasChangedTemporaryPassword: true
        });

        // Clear session
        delete req.session.resetPasswordEmail;
        delete req.session.forgotPasswordOtp;

        // Redirect to login with success message
        res.redirect('/login?message=Password reset successful. Please login with your new password');

    } catch (error) {
        console.error('Password reset error:', error);
        res.render('user/forgot-password-change', {
            message: 'An error occurred while resetting password',
            categories: []
        });
    }
};

module.exports = {
  getHome,
  pageNotFound,
  getSignup,
  insertUser,
  verifyOtp,
  resendOtp,
  getLogin,
  checkUser,
  getLogout,
  getForgotPassPage,
  forgotEmailValid,
  verifyPassOtp,
  getChangePassword,
  resendPassOtp,
  getNewPassword,
  getProduct,
  getProductsByCategory,
  searchProducts,
  getShopProducts,
  getCategoryProducts,
  getForgotPasswordChange,
  postForgotPasswordChange
};
