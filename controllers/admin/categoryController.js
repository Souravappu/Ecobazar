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

        if (!categoryName || !categoryDescription || !req.file) {
            return res.render('admin/add-category', {
                errorMessage: 'All fields including image are required.',
                successMessage: null,
                formData: req.body
            });
        }

        const offerValue = offer ? parseInt(offer) : 0;
        if (offerValue > 90) {
            return res.render('admin/add-category', {
                errorMessage: 'Offer must be less than 90%.',
                successMessage: null,
                formData: req.body
            });
        }

        const existingCategory = await Category.findOne({ name: categoryName });
        if (existingCategory) {
            return res.render('admin/add-category', {
                errorMessage: 'This category already exists.',
                successMessage: null,
                formData: req.body
            });
        }

        const createdCategory = new Category({
            name: categoryName,
            description: categoryDescription,
            image: `/uploads/categories/${req.file.filename}`,
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
        const { name, description, offer, isActive } = req.body;
        
        if (!name || !description) {
            return res.render('admin/edit-category', {
                errorMessage: 'Name and description are required',
                category: req.body,
            });
        }

        const updatedCategory = {
            name: name.trim(),
            description: description.trim(),
            categoryOffer: offer ? parseInt(offer) : 0,
            isListed: isActive === 'on'
        };

        if (req.file) {
            updatedCategory.image = `/uploads/categories/${req.file.filename}`;

            const oldCategory = await Category.findById(id);
            if (oldCategory.image) {
                const oldImagePath = path.join(__dirname, '../../public', oldCategory.image);
                try {
                    await fs.promises.unlink(oldImagePath);
                } catch (err) {
                    console.log('Error deleting old image:', err);
                }
            }
        }

        const category = await Category.findByIdAndUpdate(
            id, 
            updatedCategory, 
            { 
                new: true,
                runValidators: true
            }
        );

        if (!category) {
            return res.redirect("/admin/category?error=Category not found");
        }

        return res.redirect("/admin/category?success=Category updated successfully");

    } catch (error) {
        console.error("Error in editCategory:", error);
        return res.render('admin/edit-category', {
            errorMessage: 'Error updating category: ' + error.message,
            category: req.body,
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
            { isBlocked: true },
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
            { isBlocked: false },
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

