const Users = require('../../models/User');
const Category = require('../../models/Category');
const Address = require('../../models/Address');
const createError = require('http-errors');

const getAddress = async (req, res) => {
    try {
        const userId = req.session?.user;

        // Validate user session
        if (!userId) {
            req.flash('error_msg', 'Please log in to view addresses');
            return res.redirect('/login');
        }

        // Pagination setup
        const page = parseInt(req.query.page) || 1;
        const limit = 4; 
        const skip = (page - 1) * limit;

        const addressRecord = await Address.findOne({ userId });

        const [categories, UserData] = await Promise.all([
            Category.find({ isListed: true }),
            Users.findById(userId)
        ]);

        // Prepare addresses with pagination
        const addresses = addressRecord?.address || [];
        const totalAddresses = addresses.length;
        const totalPages = Math.ceil(totalAddresses / limit);

        // Slice addresses for current page
        const paginatedAddresses = addresses.slice(skip, skip + limit);

        // Determine default address
        let defaultAddress = addresses.find(addr => addr.isDefault);
        
        if (!defaultAddress && addresses.length > 0) {
            defaultAddress = addresses[0];
            
            if (addressRecord) {
                addressRecord.address[0].isDefault = true;
                await addressRecord.save();
            }
        }

        const oldValue = req.session.oldValue || {};
        delete req.session.oldValue;

        // Render address page with pagination
        res.render('user/address', {
            user: UserData,
            categories,
            addresses: paginatedAddresses,
            oldValue,
            defaultAddress,
            currentPage: 'address',
            error: req.flash('error_msg') || '',
            success_msg: req.flash('success_msg') || '',
            pagination: {
                page,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching address:', error);
        
        try {
            res.status(500).render('error', {
                message: 'An error occurred while fetching addresses.',
                error: error.toString()
            });
        } catch (renderError) {
            res.status(500).json({
                message: 'An error occurred while fetching addresses.',
                error: error.toString()
            });
        }
    }
};
 
const getAddAddress = async (req, res) => {
    try {
        const oldValue = req.session.oldValue || {};
        const userId = req.session.user;

        const user = await Users.findById(userId);
        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/');
        }

        const categories = await Category.find({});
        req.session.oldValue = null;

        res.render('user/add-address', {
            user,
            categories,
            oldValue,
            error: req.flash('error'),
            success_msg: req.flash('success')
        });
    } catch (error) {
        console.error('Error in getAddAddress:', error);
        req.flash('error', 'An error occurred. Please try again later.');
        res.redirect('/error');
    }
};

const addAddress = async (req, res, next) => {
    try {
        const { addressType, city, street, apartment, postalCode, phone, landMark, name } = req.body;
        const userId = req.session?.user;

        if (!userId) {
            req.flash('error_msg', 'Please log in to add an address');
            return res.redirect('/login');
        }

        const oldValues = { 
            name, 
            street, 
            apartment, 
            city, 
            postalCode, 
            phone, 
            landMark 
        };

        // Validation checks
        const validationErrors = [];

        if (!name || name.trim() === '') {
            validationErrors.push('Full Name is required');
        }

        if (!street || street.trim() === '') {
            validationErrors.push('Street Address is required');
        }

        if (!city || city.trim() === '') {
            validationErrors.push('City is required');
        }

        if (!postalCode || postalCode.trim().length < 5) {
            validationErrors.push('Please enter a valid Postal Code');
        }

        if (!phone || !/^\d{10}$/.test(phone.trim())) {
            validationErrors.push('Please enter a valid 10-digit Phone Number');
        }

        // validation errors
        if (validationErrors.length > 0) {
            req.session.oldValue = oldValues;
            req.flash('error_msg', validationErrors.join(' | '));
            return res.redirect('/profile/add-address');
        }

        // New address 
        const newAddress = {
            name: name.trim(),
            streetAddress: street.trim(),
            addressType: addressType || 'Home',
            city: city.trim(),
            apartment: apartment ? apartment.trim() : '',
            landMark: landMark ? landMark.trim() : '',
            postalCode: postalCode.trim(),
            phone: phone.trim()
        };

        // create address document
        let addressRecord = await Address.findOne({ userId })

         if (!addressRecord) {
            addressRecord = new Address({
                userId,
                address: [{ ...newAddress, isDefault: true }]
            });
        }else {
            const hasDefaultAddress = addressRecord.address.some(addr => addr.isDefault);

            newAddress.isDefault = !hasDefaultAddress;
            
            addressRecord.address.push(newAddress);
        }
        await addressRecord.save();

        req.flash('success_msg', 'Address added successfully');
        return res.redirect('/address');

    } catch (error) {
        console.error('Add Address Error:', error);
        
        const errorMessage = error.message || 'An unexpected error occurred';
        req.flash('error_msg', `Server error: ${errorMessage}`);
        return res.redirect('/profile/add-address');
    }
};

const getEditAddress = async (req, res, next) => {
    try {
      const userId = req.session.user;
      const addressId = req.params.id;
  
      if (!userId) {
        return next(new Error('User not authenticated'));
      }
  
      const [user, categories, addressRecord] = await Promise.all([
        Users.findById(userId).lean(), 
        Category.find({}).lean(),
        Address.findOne({ userId }).lean()
      ]);
  
      if (!addressRecord) {
        return next(createError(404, 'Address record not found'));
      }
  
      const address = addressRecord.address.find(
        addr => addr._id.toString() === addressId
      );
  
      if (!address) {
        return next(createError(404, 'Specific address not found'));
      }
  
      const oldValue = req.session.oldValue || {};
      req.session.oldValue = null;
  
      return res.render('user/edit-address', {
        user,
        categories,
        address,
        address_id: address._id.toString(),
        oldValue,
        error: req.session.error || '',
        success_msg: req.session.success_msg || ''
      });
    } catch (error) {
      console.error('Edit Address Error:', error);
      next(createError(500, 'Server Error in Edit Address'));
    }
};

const editAddress = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;
        const { addressType, city, street, apartment, postalCode, phone, landMark, name } = req.body;

        // Validate required fields
        const requiredFields = { name, street, apartment, city, postalCode, phone };
        const missingFields = Object.entries(requiredFields)
            .filter(([, value]) => !value)
            .map(([key]) => key);

        if (missingFields.length > 0) {
            req.session.oldValue = { ...requiredFields, landMark };
            req.flash('error_msg', `Missing required fields: ${missingFields.join(', ')}`);
            return res.redirect('/profile/add-address');
        }

        // Validate postal code and phone number
        if (postalCode.length !== 6) {
            req.session.oldValue = { ...requiredFields, landMark };
            req.flash('error_msg', 'Invalid Postal Code. Must be 6 digits.');
            return res.redirect('/profile/add-address');
        }

        if (phone.length !== 10) {
            req.session.oldValue = { ...requiredFields, landMark };
            req.flash('error_msg', 'Invalid Phone Number. Must be 10 digits.');
            return res.redirect('/profile/add-address');
        }

        const addressRecord = await Address.findOne({ userId });
        if (!addressRecord) {
            return res.status(404).json({ message: 'Address not found' });
        }

        const address = addressRecord.address.id(addressId);
        if (!address) {
            return res.status(404).json({ message: 'Specific address not found' });
        }

        // Update address details
        address.set({
            streetAddress: street,
            addressType,
            city,
            name,
            landMark,
            apartment,
            postalCode,
            phone
        });

        await addressRecord.save();

        req.flash('success_msg', 'Address updated successfully');
        res.redirect('/address');
    } catch (error) {
        console.error('Address edit error:', error);
        next(new Error('Server Error in edit Address'));
    }
};

const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;

        const addressRecord = await Address.findOne({ userId });

        if (!addressRecord) {
            return res.status(404).json({ 
                success: false, 
                message: 'Address record not found' 
            });
        }

        const addressToDelete = addressRecord.address.id(addressId);

        if (!addressToDelete) {
            return res.status(404).json({ 
                success: false, 
                message: 'Address not found' 
            });
        }

        const wasDefaultAddress = addressToDelete.isDefault;

        // Remove the address
        addressRecord.address.pull({ _id: addressId });

        // If deleted address was default and other addresses exist, set the first address as default
        if (wasDefaultAddress && addressRecord.address.length > 0) {
            addressRecord.address[0].isDefault = true;
        }

        await addressRecord.save();

        return res.status(200).json({
            success: true,
            message: 'Address deleted successfully'
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error', 
            error: error.message 
        });
    }
};

const setDefaultAddress = async (req, res) => {
    try {
        const userId = req.session?.user;
        const addressId = req.params.id;

        const addressRecord = await Address.findOne({ userId });

        if (!addressRecord) {
            return res.status(404).json({ 
                success: false, 
                message: 'Address record not found' 
            });
        }

        const currentDefaultAddress = addressRecord.address.find(addr => addr.isDefault);

        if (currentDefaultAddress) {
            currentDefaultAddress.isDefault = false;
        }

        const addressToSetDefault = addressRecord.address.id(addressId);

        if (!addressToSetDefault) {
            return res.status(404).json({ 
                success: false, 
                message: 'Address not found' 
            });
        }

        addressToSetDefault.isDefault = true;

        await addressRecord.save();

        return res.status(200).json({
            success: true,
            message: 'Default address updated successfully'
        });

    } catch (error) {
        console.error('Error setting default address:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error while setting default address',
            error: error.message 
        });
    }
};

// Get checkout addAddress page
const getCheckoutAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressRecord = await Address.findOne({ userId });
        const addresses = addressRecord ? addressRecord.address : [];

        res.render('user/checkout-add-address', {
            addresses,
            user: req.session.user,
            title: 'Manage Addresses',
            error: null,
            errors: {},
            oldValue: {}
        });
    } catch (error) {
        console.error('Error loading checkout add address page:', error);
        res.status(500).render('user/error', {
            message: 'Error loading address form',
            title: 'Error'
        });
    }
};

// Add address during checkout
const addCheckoutAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const { name, phone, street, city, postalCode, apartment, landMark, addressType } = req.body;

        // Validation
        const errors = {};
        if (!name || name.length < 3) errors.name = "Name should be at least 3 characters";
        if (!phone || !/^[0-9]{10}$/.test(phone)) errors.phone = "Invalid phone number";
        if (!street || street.length < 5) errors.street = "Street address is required";
        if (!city || city.length < 3) errors.city = "City is required";
        if (!postalCode || !/^[0-9]{6}$/.test(postalCode)) errors.postalCode = "Invalid postal code";

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                success: false,
                errors,
                message: 'Validation failed'
            });
        }

        let addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            addressDoc = new Address({ 
                userId, 
                address: [] 
            });
        }

        // Create new address
        const newAddress = {
            name,
            phone,
            streetAddress: street,
            city,
            postalCode,
            apartment,
            landMark,
            addressType,
            isDefault: addressDoc.address.length === 0 // Make first address default
        };

        // Add to addresses array
        addressDoc.address.push(newAddress);
        await addressDoc.save();

        res.json({
            success: true,
            message: 'Address added successfully'
        });

    } catch (error) {
        console.error('Error adding checkout address:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding address'
        });
    }
};

// Get checkout edit address page
const getCheckoutEditAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;

        const [user, addressDoc] = await Promise.all([
            Users.findById(userId),
            Address.findOne({ userId })
        ]);

        if (!addressDoc) {
            return res.status(404).render('user/error', {
                message: 'Address not found',
                title: 'Error'
            });
        }

        const address = addressDoc.address.id(addressId);
        if (!address) {
            return res.status(404).render('user/error', {
                message: 'Address not found',
                title: 'Error'
            });
        }

        res.render('user/checkout-edit-address', {
            user,
            address,
            title: 'Edit Address',
            error: null,
            errors: {},
            oldValue: {}
        });

    } catch (error) {
        console.error('Error loading checkout edit address page:', error);
        res.status(500).render('user/error', {
            message: 'Error loading address form',
            title: 'Error'
        });
    }
};

// Edit address during checkout
const editCheckoutAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;
        const { name, phone, street, city, postalCode, apartment, landMark, addressType } = req.body;

        // Validation
        const errors = {};
        if (!name || name.length < 3) errors.name = "Name should be at least 3 characters";
        if (!phone || !/^[0-9]{10}$/.test(phone)) errors.phone = "Invalid phone number";
        if (!street || street.length < 5) errors.street = "Street address is required";
        if (!city || city.length < 3) errors.city = "City is required";
        if (!postalCode || !/^[0-9]{6}$/.test(postalCode)) errors.postalCode = "Invalid postal code";

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                success: false,
                errors,
                message: 'Validation failed'
            });
        }

        // Find address document
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        const address = addressDoc.address.id(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Update address fields
        address.name = name;
        address.phone = phone;
        address.streetAddress = street;
        address.city = city;
        address.postalCode = postalCode;
        address.apartment = apartment;
        address.landMark = landMark;
        address.addressType = addressType;

        await addressDoc.save();

        res.json({
            success: true,
            message: 'Address updated successfully'
        });

    } catch (error) {
        console.error('Error updating checkout address:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating address'
        });
    }
};

const getCheckoutAddresses = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressRecord = await Address.findOne({ userId });
        const addresses = addressRecord ? addressRecord.address : [];

        res.render('user/checkout-view-addresses', {
            addresses,
            title: 'Manage Addresses'
        });
    } catch (error) {
        console.error('Error loading checkout addresses:', error);
        res.status(500).render('user/error', {
            message: 'Error loading addresses',
            title: 'Error'
        });
    }
};

module.exports = {
    getAddress,
    getAddAddress,
    addAddress,
    getEditAddress,
    editAddress,
    deleteAddress,
    setDefaultAddress,
    getCheckoutAddAddress,
    addCheckoutAddress,
    getCheckoutEditAddress,
    editCheckoutAddress,
    getCheckoutAddresses
};
