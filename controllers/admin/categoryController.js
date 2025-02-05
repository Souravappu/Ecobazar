const Category = require('../../models/Category');
const fs = require('fs');
const path = require('path');

const getCategory = async (req, res, next) => {
    try {
        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        const limit = 4;

        const categoryData = await Category.find({
            isDeleted: false,
            $or: [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ]
        })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await Category.countDocuments({
            isDeleted: false,
            $or: [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ]
        });

        return res.render('admin/category', {
            currentPage: page,
            categories: categoryData,
            totalPages: Math.ceil(count / limit),
            searchTerm: search,
            errorMessage: req.flash('errorMessage'),
            successMessage: req.flash('successMessage')
        });
    } catch (error) {
        console.error(error.message);
        next(error);
    }
};

const getAddCategory = (req, res) => {
    try {
        return res.render('admin/add-category', { errorMessage: null, successMessage: null });
    } catch (error) {
        console.error(error);
    }
};

const addCategory = async (req, res, next) => {
    try {
        const { categoryName, categoryDescription, offer, isActive } = req.body;
        const formData = {
            categoryName,
            categoryDescription,
            offer,
            isActive,
            categoryImage: req.file ? `/uploads/categories/${req.file.filename}` : (req.body.categoryImage || null)
        };

        if (!categoryName || !categoryDescription || (!req.file && !req.body.categoryImage)) {
            return res.render('admin/add-category', {
                errorMessage: 'All fields including image are required.',
                successMessage: null,
                formData
            });
        }

        const offerValue = offer ? parseInt(offer) : 0;
        if (offerValue > 90) {
            return res.render('admin/add-category', {
                errorMessage: 'Offer must be less than 90%.',
                successMessage: null,
                formData
            });
        }

        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${categoryName}$`, 'i') }
        });
        if (existingCategory) {
            return res.render('admin/add-category', {
                errorMessage: 'This category already exists.',
                successMessage: null,
                formData
            });
        }

        const createdCategory = new Category({
            name: categoryName,
            description: categoryDescription,
            image: formData.categoryImage,
            categoryOffer: offerValue,
            isListed: isActive === 'on'
        });

        await createdCategory.save();

        return res.render('admin/add-category', {
            errorMessage: null,
            successMessage: `${categoryName} category has been added successfully.`,
            formData: {}
        });

    } catch (error) {
        console.error('Error adding category:', error);
        return res.render('admin/add-category', {
            errorMessage: 'Error adding category: ' + error.message,
            successMessage: null,
            formData: req.body
        });
    }
};

const getEditCategory = async (req, res, next) => {
    try {
        const id = req.params.id;
        const category = await Category.findById(id);

        if (!category) {
            return res.render('admin/category', {
                errorMessage: 'Category not found. Try again.',
                successMessage: null,
                categories: [],
                currentPage: 1,
                totalPages: 1,
                searchTerm: ''
            });
        }

        return res.render('admin/edit-category', {
            category,
            categoryId: category._id, 
            errorMessage: null,
            successMessage: null
        });
    } catch (error) {
        console.error(error.message);
        next(error);
    }
};

const editCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, description, isActive } = req.body;
        const category = await Category.findById(id);
        
        if (!category) {
            return res.render('admin/edit-category', {
                errorMessage: 'Category not found',
                successMessage: null,
                category: null,
                formData: req.body
            });
        }

        const formData = {
            name,
            description,
            isActive,
            categoryImage: req.file ? `/uploads/categories/${req.file.filename}` : category.image
        };
        
        // Validation
        const errors = [];
        if (!name || name.trim().length < 3 || name.trim().length > 50) {
            errors.push('Category name must be between 3 and 50 characters');
        }
        if (!/^[a-zA-Z0-9\s-]+$/.test(name)) {
            errors.push('Category name can only contain letters, numbers, spaces and hyphens');
        }
        if (!description || description.trim().length < 10 || description.trim().length > 500) {
            errors.push('Description must be between 10 and 500 characters');
        }

        if (errors.length > 0) {
            return res.render('admin/edit-category', {
                errorMessage: errors.join('. '),
                successMessage: null,
                category: { ...category.toObject(), ...formData },
                formData
            });
        }

        // Check for existing category with same name (case-insensitive) excluding current category
        const existingCategory = await Category.findOne({
            _id: { $ne: id },
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
        });

        if (existingCategory) {
            return res.render('admin/edit-category', {
                errorMessage: `Cannot update category name to "${name}". Another category "${existingCategory.name}" is using this name. Category names must be unique regardless of letter case.`,
                successMessage: null,
                category: { ...category.toObject(), ...formData },
                formData
            });
        }

        // Image validation
        if (req.file) {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            const maxSize = 5 * 1024 * 1024; // 5MB

            if (!allowedTypes.includes(req.file.mimetype)) {
                return res.render('admin/edit-category', {
                    errorMessage: 'Invalid file type. Only JPG, PNG and WebP images are allowed',
                    successMessage: null,
                    category: { ...category.toObject(), ...formData },
                    formData
                });
            }

            if (req.file.size > maxSize) {
                return res.render('admin/edit-category', {
                    errorMessage: 'Image size should be less than 5MB',
                    successMessage: null,
                    category: { ...category.toObject(), ...formData },
                    formData
                });
            }
        }

        const updatedCategory = {
            name: name.trim(),
            description: description.trim(),
            isListed: isActive === 'on'
        };

        if (req.file) {
            updatedCategory.image = `/uploads/categories/${req.file.filename}`;

            if (category.image) {
                const oldImagePath = path.join(__dirname, '../../public', category.image);
                try {
                    await fs.promises.unlink(oldImagePath);
                } catch (err) {
                    console.log('Error deleting old image:', err);
                }
            }
        }

        const updatedCategoryDoc = await Category.findByIdAndUpdate(
            id, 
            updatedCategory, 
            { 
                new: true,
                runValidators: true
            }
        );

        if (!updatedCategoryDoc) {
            return res.render('admin/edit-category', {
                errorMessage: 'Category not found',
                successMessage: null,
                category: { ...category.toObject(), ...formData },
                formData
            });
        }

        return res.render('admin/edit-category', {
            category: updatedCategoryDoc,
            errorMessage: null,
            successMessage: 'Category updated successfully',
            formData: null
        });

    } catch (error) {
        console.error("Error in editCategory:", error);
        return res.render('admin/edit-category', {
            errorMessage: 'Error updating category: ' + error.message,
            successMessage: null,
            category: category ? { ...category.toObject(), ...formData } : null,
            formData
        });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            {
                isDeleted: true,
                deletedAt: new Date(),
                isListed: false 
            },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: `${category.name} has been deleted successfully`
        });
    } catch (error) {
        console.error('Error deleting category:', error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting category'
        });
    }
};

const viewCategory = async (req, res, next) => {
    try {
        const id = req.params.id;
        
        const category = await Category.findById(id);

        if (!category) {
            req.flash('errorMessage', 'Category not found.');
            return res.redirect('/admin/category');
        }

        return res.render('admin/view-category', { 
            category, 
            pageTitle: `View Category: ${category.name}`,
            errorMessage: req.flash('errorMessage'),
            successMessage: req.flash('successMessage')
        });
    } catch (error) {
        console.error('Error in viewCategory:', error.message);
        
        next(error);
    }
};

const blockCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const category = await Category.findByIdAndUpdate(
            id,
            { 
                isBlocked: true,
                isListed: false  // When blocked, it should not be listed
            },
            { new: true }
        );

        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Category not found' 
            });
        }

        req.flash('successMessage', `${category.name} has been blocked successfully`);
        return res.redirect('/admin/category');
    } catch (error) {
        console.error('Error blocking category:', error);
        req.flash('errorMessage', 'Error blocking category');
        return res.redirect('/admin/category');
    }
};

const unblockCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const category = await Category.findByIdAndUpdate(
            id,
            { 
                isBlocked: false,
                isListed: true  // When unblocked, it should be listed
            },
            { new: true }
        );

        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Category not found' 
            });
        }

        req.flash('successMessage', `${category.name} has been unblocked successfully`);
        return res.redirect('/admin/category');
    } catch (error) {
        console.error('Error unblocking category:', error);
        req.flash('errorMessage', 'Error unblocking category');
        return res.redirect('/admin/category');
    }
};

module.exports = {
    getCategory,
    getAddCategory,
    addCategory,
    getEditCategory,
    editCategory,
    deleteCategory,
    viewCategory,
    blockCategory,
    unblockCategory
};

