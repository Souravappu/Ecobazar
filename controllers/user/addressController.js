const Users = require('../../models/User');
const Category = require('../../models/Category');
const Address = require('../../models/Address');
const createError = require('http-errors');

const getAddress = async (req, res) => {
    try {
        const userId = req.session?.user;

        if (!userId) {
            req.flash('error_msg', 'Please log in to view addresses');
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 4; 
        const skip = (page - 1) * limit;

        const addressRecord = await Address.findOne({ userId });

        const [categories, UserData] = await Promise.all([
            Category.find({ isListed: true }),
            Users.findById(userId)
        ]);

        const addresses = addressRecord?.address || [];
        const totalAddresses = addresses.length;
        const totalPages = Math.ceil(totalAddresses / limit);

        const paginatedAddresses = addresses.slice(skip, skip + limit);

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

        // Validation function
        const validateInput = (input) => {
            return input ? input.trim() : '';
        };

        const validatedInputs = {
            name: validateInput(name),
            street: validateInput(street),
            city: validateInput(city),
            postalCode: validateInput(postalCode),
            phone: validateInput(phone),
            apartment: validateInput(apartment),
            landMark: validateInput(landMark)
        };

        const errors = {};

        // Name validation
        if (!validatedInputs.name) {
            errors.name = 'Full Name is required';
        } else if (validatedInputs.name.length < 3) {
            errors.name = 'Name must be at least 3 characters';
        } else if (!/^[A-Za-z\s]{3,50}$/.test(validatedInputs.name)) {
            errors.name = 'Name should contain only letters';
        }

        // Street validation
        if (!validatedInputs.street) {
            errors.street = 'Street Address is required';
        } else if (validatedInputs.street.length < 5) {
            errors.street = 'Street address must be at least 5 characters';
        }

        // City validation
        if (!validatedInputs.city) {
            errors.city = 'City is required';
        } else if (!/^[A-Za-z\s]{3,30}$/.test(validatedInputs.city)) {
            errors.city = 'City should contain only letters';
        }

        // Postal code validation
        if (!validatedInputs.postalCode) {
            errors.postalCode = 'Postal Code is required';
        } else if (!/^[0-9]{6}$/.test(validatedInputs.postalCode)) {
            errors.postalCode = 'Please enter a valid 6-digit Postal Code';
        }

        // Phone validation
        if (!validatedInputs.phone) {
            errors.phone = 'Phone Number is required';
        } else if (!/^[0-9]{10}$/.test(validatedInputs.phone)) {
            errors.phone = 'Please enter a valid 10-digit Phone Number';
        }

        if (Object.keys(errors).length > 0) {
            req.session.oldValue = validatedInputs;
            req.flash('error_msg', Object.values(errors).join(' | '));
            return res.redirect('/profile/add-address');
        }

        const newAddress = {
            name: validatedInputs.name,
            streetAddress: validatedInputs.street,
            addressType: addressType || 'Home',
            city: validatedInputs.city,
            apartment: validatedInputs.apartment,
            landMark: validatedInputs.landMark,
            postalCode: validatedInputs.postalCode,
            phone: validatedInputs.phone
        };

        let addressRecord = await Address.findOne({ userId });

        if (!addressRecord) {
            addressRecord = new Address({
                userId,
                address: [{ ...newAddress, isDefault: true }]
            });
        } else {
            const hasDefaultAddress = addressRecord.address.some(addr => addr.isDefault);
            newAddress.isDefault = !hasDefaultAddress;
            addressRecord.address.push(newAddress);
        }

        await addressRecord.save();
        req.flash('success_msg', 'Address added successfully');
        return res.redirect('/address');

    } catch (error) {
        console.error('Add Address Error:', error);
        req.flash('error_msg', `Server error: ${error.message || 'An unexpected error occurred'}`);
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

        // Validation function
        const validateInput = (input) => {
            return input ? input.trim() : '';
        };

        const validatedInputs = {
            name: validateInput(name),
            street: validateInput(street),
            city: validateInput(city),
            postalCode: validateInput(postalCode),
            phone: validateInput(phone),
            apartment: validateInput(apartment),
            landMark: validateInput(landMark)
        };

        const errors = {};

        // Name validation
        if (!validatedInputs.name) {
            errors.name = 'Full Name is required';
        } else if (validatedInputs.name.length < 3) {
            errors.name = 'Name must be at least 3 characters';
        } else if (!/^[A-Za-z\s]{3,50}$/.test(validatedInputs.name)) {
            errors.name = 'Name should contain only letters';
        }

        // Street validation
        if (!validatedInputs.street) {
            errors.street = 'Street Address is required';
        } else if (validatedInputs.street.length < 5) {
            errors.street = 'Street address must be at least 5 characters';
        }

        // City validation
        if (!validatedInputs.city) {
            errors.city = 'City is required';
        } else if (!/^[A-Za-z\s]{3,30}$/.test(validatedInputs.city)) {
            errors.city = 'City should contain only letters';
        }

        // Postal code validation
        if (!validatedInputs.postalCode) {
            errors.postalCode = 'Postal Code is required';
        } else if (!/^[0-9]{6}$/.test(validatedInputs.postalCode)) {
            errors.postalCode = 'Please enter a valid 6-digit Postal Code';
        }

        // Phone validation
        if (!validatedInputs.phone) {
            errors.phone = 'Phone Number is required';
        } else if (!/^[0-9]{10}$/.test(validatedInputs.phone)) {
            errors.phone = 'Please enter a valid 10-digit Phone Number';
        }

        if (Object.keys(errors).length > 0) {
            req.session.oldValue = validatedInputs;
            req.flash('error_msg', Object.values(errors).join(' | '));
            return res.redirect(`/profile/edit-address/${addressId}`);
        }

        const addressRecord = await Address.findOne({ userId });
        if (!addressRecord) {
            return res.status(404).json({ message: 'Address not found' });
        }

        const address = addressRecord.address.id(addressId);
        if (!address) {
            return res.status(404).json({ message: 'Specific address not found' });
        }

        address.set({
            name: validatedInputs.name,
            streetAddress: validatedInputs.street,
            addressType,
            city: validatedInputs.city,
            apartment: validatedInputs.apartment,
            landMark: validatedInputs.landMark,
            postalCode: validatedInputs.postalCode,
            phone: validatedInputs.phone
        });

        await addressRecord.save();
        req.flash('success_msg', 'Address updated successfully');
        res.redirect('/address');

    } catch (error) {
        console.error('Address edit error:', error);
        req.flash('error_msg', 'Server Error in edit Address');
        res.redirect(`/profile/edit-address/${req.params.id}`);
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

        addressRecord.address.pull({ _id: addressId });

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

const addCheckoutAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const { name, phone, street, city, postalCode, apartment, landMark, addressType } = req.body;

        const errors = {};
        
        if (!name || name.trim().length === 0) {
            errors.name = "Name is required";
        } else if (!/^[A-Za-z\s]{3,50}$/.test(name.trim())) {
            errors.name = "Name should be 3-50 characters and contain only letters";
        }

        if (!phone || phone.trim().length === 0) {
            errors.phone = "Phone number is required";
        } else if (!/^[0-9]{10}$/.test(phone.trim())) {
            errors.phone = "Please enter a valid 10-digit phone number";
        }

        if (!street || street.trim().length === 0) {
            errors.street = "Street address is required";
        } else if (street.trim().length < 5) {
            errors.street = "Street address should be at least 5 characters";
        }

        if (!city || city.trim().length === 0) {
            errors.city = "City is required";
        } else if (!/^[A-Za-z\s]{3,30}$/.test(city.trim())) {
            errors.city = "City should be 3-30 characters and contain only letters";
        }

        if (!postalCode || postalCode.trim().length === 0) {
            errors.postalCode = "Postal code is required";
        } else if (!/^[0-9]{6}$/.test(postalCode.trim())) {
            errors.postalCode = "Please enter a valid 6-digit postal code";
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                success: false,
                errors,
                message: 'Please fix the validation errors'
            });
        }

        let addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            addressDoc = new Address({ userId, address: [] });
        }

        const newAddress = {
            name: name.trim(),
            phone: phone.trim(),
            streetAddress: street.trim(),
            city: city.trim(),
            postalCode: postalCode.trim(),
            apartment: apartment ? apartment.trim() : '',
            landMark: landMark ? landMark.trim() : '',
            addressType,
            isDefault: addressDoc.address.length === 0
        };

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
            message: 'Internal server error while adding address'
        });
    }
};

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

const editCheckoutAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;
        const { name, phone, street, city, postalCode, apartment, landMark, addressType } = req.body;

        const errors = {};
        
        if (!name || name.trim().length === 0) {
            errors.name = "Name is required";
        } else if (!/^[A-Za-z\s]{3,50}$/.test(name.trim())) {
            errors.name = "Name should be 3-50 characters and contain only letters";
        }

        if (!phone || phone.trim().length === 0) {
            errors.phone = "Phone number is required";
        } else if (!/^[0-9]{10}$/.test(phone.trim())) {
            errors.phone = "Please enter a valid 10-digit phone number";
        }

        if (!street || street.trim().length === 0) {
            errors.street = "Street address is required";
        } else if (street.trim().length < 5) {
            errors.street = "Street address should be at least 5 characters";
        }

        if (!city || city.trim().length === 0) {
            errors.city = "City is required";
        } else if (!/^[A-Za-z\s]{3,30}$/.test(city.trim())) {
            errors.city = "City should be 3-30 characters and contain only letters";
        }

        if (!postalCode || postalCode.trim().length === 0) {
            errors.postalCode = "Postal code is required";
        } else if (!/^[0-9]{6}$/.test(postalCode.trim())) {
            errors.postalCode = "Please enter a valid 6-digit postal code";
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                success: false,
                errors,
                message: 'Please fix the validation errors'
            });
        }

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

        address.name = name.trim();
        address.phone = phone.trim();
        address.streetAddress = street.trim();
        address.city = city.trim();
        address.postalCode = postalCode.trim();
        address.apartment = apartment ? apartment.trim() : '';
        address.landMark = landMark ? landMark.trim() : '';
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
            message: 'Internal server error while updating address'
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
