const Product = require('../../models/Products');
const Category = require('../../models/Category');
const fs = require('fs').promises;
const path = require('path');

const getProduct = async (req, res, next) => {
    try {
        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        let category = req.query.category || '';
        let status = req.query.status || '';
        let sort = req.query.sort || 'newest';

        const limit = 5;

        let query = {
            isDeleted: false,
        };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } }
            ];
        }

        if (category) {
            query.category = category;
        }

        if (status) {
            if (status === 'inStock') {
                query.quantity = { $gt: 0 };
            } else if (status === 'outOfStock') {
                query.quantity = 0;
            }
        }

        let sortOption = {};
        switch (sort) {
            case 'newest':
                sortOption = { createdAt: -1 };
                break;
            case 'oldest':
                sortOption = { createdAt: 1 };
                break;
            case 'priceHigh':
                sortOption = { regularPrice: -1 };
                break;
            case 'priceLow':
                sortOption = { regularPrice: 1 };
                break;
            default:
                sortOption = { createdAt: -1 };
        }

        const productData = await Product.find(query)
            .populate('category', 'name')
            .sort(sortOption)
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await Product.countDocuments(query);

        const success_msg = req.flash('success_msg');
        const error_msg = req.flash('error_msg');
        const categories = await Category.find({});
        return res.render('admin/products', {
            data: productData,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            searchTerm: search,
            categories,
            selectedCategory: category,
            selectedStatus: status,
            selectedSort: sort,
            pagination: {
                page: page,
                limit: limit,
                total: count
            },
            messages: {
                success_msg,
                error_msg
            }
        });
    } catch (error) {
        console.log(error.message)
        req.flash('error_msg', 'Failed to load products');
        res.redirect('/admin/dashboard');
    }
}

const getAddProduct = async (req, res, next) => {
    try {
        const oldValue = req.session.oldValue || {};
        const categories = await Category.find({});
        const error_msg = req.flash('error_msg');
        const success_msg = req.flash('success_msg');
        req.session.oldValue = null;
        return res.render('admin/add-product', { 
            categories, 
            oldValue,
            error_msg,
            success_msg
        });
    } catch (error) {
        console.log(error.message);
        req.flash('error_msg', 'Failed to load add product page');
        res.redirect('/admin/home');
    }
}


const addProduct = async (req, res, next) => {
    try {
        const { 
            name, 
            description, 
            price, 
            category, 
            quantity, 
            discount,
            unit,
            unitQuantity 
        } = req.body;

        if (!name || !description || !category || !quantity || !price || !unit || !unitQuantity) {
            const oldValue = { 
                name, 
                description, 
                category, 
                quantity, 
                discount, 
                price,
                unit,
                unitQuantity 
            };
            req.session.oldValue = oldValue;
            req.flash('error_msg', 'Please provide all required fields');
            return res.redirect('/admin/add-product');
        }

        if (unit === 'kg' && (unitQuantity < 0.01 || unitQuantity > 25)) {
            req.flash('error_msg', 'Weight per unit must be between 0.01 and 25 kg');
            return res.redirect('/admin/add-product');
        }

        if (unit === 'nos' && (unitQuantity < 1 || unitQuantity > 100)) {
            req.flash('error_msg', 'Pieces per unit must be between 1 and 100');
            return res.redirect('/admin/add-product');
        }

        if (price < 1) {
            const oldValue = { name, description, category, quantity, discount, price };
            req.session.oldValue = oldValue;
            req.flash('error_msg', 'Price must be greater than 0');
            return res.redirect('/admin/add-product');
        }

        if (quantity <= 0) {
            const oldValue = { name, description, category, quantity, discount, price };
            req.session.oldValue = oldValue;
            req.flash('error_msg', 'Quantity must be greater than 0');
            return res.redirect('/admin/add-product');
        }

        if (discount > 91) {
            const oldValue = { name, description, category, quantity, discount, price };
            req.session.oldValue = oldValue;
            req.flash('error_msg', 'Discount must be less than 90%');
            return res.redirect('/admin/add-product');
        }

        const existingProduct = await Product.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });
        if (existingProduct) {
            const oldValue = { name, description, category, quantity, discount, price };
            req.session.oldValue = oldValue;
            req.flash('error_msg', 'Product Already Exists (case-insensitive check)');
            return res.redirect('/admin/add-product');
        }

        const categoryDoc = await Category.findOne({ name: category });
        if (!categoryDoc) {
            const oldValue = { name, description, category, quantity, discount, price };
            req.session.oldValue = oldValue;
            req.flash('error_msg', 'Invalid category');
            return res.redirect('/admin/add-product');
        }

        let imagePaths = [];
        if (req.files && req.files.length > 0) {
            if (req.files.length > 5) {
                req.flash('error_msg', 'Maximum 5 images allowed');
                return res.redirect('/admin/add-product');
            }
            imagePaths = req.files.map(file => `/products/${file.filename}`);
        } else {
            req.flash('error_msg', 'At least one product image is required');
            return res.redirect('/admin/add-product');
        }

        const newProduct = new Product({
            name,
            description,
            regularPrice: price,
            salePrice: Math.floor((price - (price * (discount / 100)))),
            productOffer: discount || 0,
            category: categoryDoc._id,
            quantity: parseInt(quantity),
            unit,
            unitQuantity: parseFloat(unitQuantity),
            status: parseInt(quantity) > 0 ? "Available" : "Out Of Stock",
            images: imagePaths
        });

        await newProduct.save();
        req.flash('success_msg', `${name} Product Added Successfully`);
        res.redirect('/admin/products');

    } catch (error) {
        console.error('Error adding product:', error);
        req.flash('error_msg', 'An error occurred while adding the product');
        res.redirect('/admin/add-product');
    }
};


const getEditProduct = async (req, res, next) => {
    try {
        const id = req.params.id;
        const product = await Product.findById({ _id: id });
        const category = await Category.findById({ _id: product.category });
        const categories = await Category.find({});
        const error_msg = req.flash('error_msg');
        const success_msg = req.flash('success_msg');

        if (!product) {
            req.flash('error_msg', 'Product is Not found');
            return res.redirect('/admin/products')
        }

        const discount = product.regularPrice > 0 ? 
            Math.round(((product.regularPrice - product.salePrice) / product.regularPrice) * 100) : 0;

        const productWithDiscount = {
            ...product.toObject(),
            discount
        };

        return res.render('admin/edit-product', { 
            product: productWithDiscount, 
            category, 
            categories,
            error_msg,
            success_msg
        });
    } catch (error) {
        console.log(error.message)
        next(error)
    }
}


const editProduct = async (req, res, next) => {
    try {
        const id = req.params.id;
        const {
            name,
            description,
            stock: quantity,
            price,
            discount,
            category,
            existingImages
        } = req.body;

        if (!name || !description || !category || !quantity || !price) {
            req.flash('error_msg', 'Please provide all required fields');
            return res.redirect(`/admin/editProduct/${id}`);
        }

        const categoryDoc = await Category.findOne({ name: category });
        if (!categoryDoc) {
            req.flash('error_msg', 'Invalid category');
            return res.redirect(`/admin/editProduct/${id}`);
        }

        // Check for existing product with same name (case-insensitive) excluding current product
        const existingProduct = await Product.findOne({
            _id: { $ne: id },
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (existingProduct) {
            req.flash('error_msg', `Cannot update product name to "${name}". Another product "${existingProduct.name}" is using this name. Product names must be unique regardless of letter case.`);
            return res.redirect(`/admin/editProduct/${id}`);
        }

        const product = await Product.findById(id);
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }

        let finalImagePaths = [];

        const existingImagesArray = existingImages ? (Array.isArray(existingImages) ? existingImages : [existingImages]) : [];
        finalImagePaths = [...existingImagesArray];

        if (req.files && req.files.length > 0) {
            
            if (finalImagePaths.length + req.files.length > 5) {
                req.flash('error_msg', 'Maximum 5 images allowed');
                return res.redirect(`/admin/editProduct/${id}`);
            }

            const newImagePaths = req.files.map(file => `/products/${file.filename}`);
            finalImagePaths = [...finalImagePaths, ...newImagePaths];
        }

        if (finalImagePaths.length === 0) {
            req.flash('error_msg', 'Product must have at least one image');
            return res.redirect(`/admin/editProduct/${id}`);
        }

        const updatedProduct = {
            name,
            description,
            regularPrice: price,
            salePrice: Math.floor((price - (price * (discount / 100)))),
            productOffer: discount || 0,
            category: categoryDoc._id,
            quantity: parseInt(quantity),
            status: parseInt(quantity) > 0 ? "Available" : "Out Of Stock",
            images: finalImagePaths
        };

        await Product.findByIdAndUpdate(id, updatedProduct);
        req.flash('success_msg', 'Product updated successfully');
        return res.redirect('/admin/products');

    } catch (error) {
        console.error('Error in editProduct:', error);
        req.flash('error_msg', 'Failed to update product');
        return res.redirect('/admin/products');
    }
};



const viewProduct = async (req, res, next) => {
    try {
        let id = req.params.id;
        const product = await Product.findById({ _id: id }).populate('category');
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }
        return res.render('admin/viewProduct', { 
            product, 
            categories: [product.category] 
        });
    } catch (error) {
        console.log(error.message);
        next(error);
    }
}


const deleteProduct = async (req, res, next) => {
    try {
        let id = req.params.id;
        const findProduct = await Product.findById({ _id: id });
        
        if (!findProduct) {
            req.flash('error_msg', 'Product is Not found Try again...');
            return res.redirect('/admin/products');
        }

        await Product.findByIdAndUpdate(id, { 
            isDeleted: true,
            status: 'Discontinued' 
        });

        req.flash('success_msg', `${findProduct.name} has been deleted successfully`);
        return res.redirect('/admin/products');
    } catch (error) {
        req.flash('error_msg', 'Failed to delete product');
        return res.redirect('/admin/products');
    }
}

const blockProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
    
        const findProduct = await Product.findById(id);
        
        if (!findProduct) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/product');
        }

        if (findProduct.isBlocked) {
            req.flash('warning_msg', `${findProduct.name} is already blocked`);
            return res.redirect('/admin/product');
        }

        await Product.findByIdAndUpdate(id, { isBlocked: true }, { new: true });
        
        req.flash('success_msg', `${findProduct.name} has been blocked successfully`);
        return res.redirect('/admin/products');
    } catch (error) {
        req.flash('error_msg', 'Failed to block product');
        return res.redirect('/admin/products');
    }
};

const unblockProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const findProduct = await Product.findById(id);
        
        if (!findProduct) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/product');
        }

        if (!findProduct.isBlocked) {
            req.flash('warning_msg', `${findProduct.name} is already active`);
            return res.redirect('/admin/product');
        }

        await Product.findByIdAndUpdate(id, { isBlocked: false }, { new: true });
        
        req.flash('success_msg', `${findProduct.name} has been unblocked successfully`);
        return res.redirect('/admin/products');
    } catch (error) {
        req.flash('error_msg', 'Failed to unblock product');
        return res.redirect('/admin/products');
    }
};


module.exports = {
    getProduct,
    getAddProduct,
    addProduct,
    getEditProduct,
    editProduct,
    viewProduct,
    deleteProduct,
    blockProduct,
    unblockProduct,
};