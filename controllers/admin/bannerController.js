const Banner = require('../../models/Banner');
const Category = require('../../models/Category');
const fs = require('fs').promises;
const path = require('path');

const listBanners = async (req, res) => {
    try {
        const banners = await Banner.find().sort({ createdAt: -1 });
        const categories = await Category.find({ isListed: true });
        
        res.render('admin/banners', {
            banners,
            categories,
            messages: {
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error listing banners:', error);
        req.flash('error_msg', 'Error loading banners');
        res.redirect('/admin/home');
    }
};

const getAddBanner = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        const hasDefaultBanner = await Banner.exists({ isDefault: true });
        
        res.render('admin/add-banner', {
            categories,
            hasDefaultBanner,
            messages: {
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading add banner form:', error);
        req.flash('error_msg', 'Error loading form');
        res.redirect('/admin/banners');
    }
};

const addBanner = async (req, res) => {
    try {
        const { title, description, link, isDefault } = req.body;
        
        const bannerData = {
            title,
            description,
            link,
            isDefault: isDefault === 'true'
        };

        if (req.file) {
            bannerData.image = `/uploads/banners/${req.file.filename}`;
        }

        const banner = new Banner(bannerData);
        await banner.save();

        req.flash('success_msg', 'Banner added successfully');
        res.redirect('/admin/banners');
    } catch (error) {
        console.error('Error adding banner:', error);
        req.flash('error_msg', 'Error adding banner');
        res.redirect('/admin/add-banner');
    }
};

const getEditBanner = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        const categories = await Category.find({ isListed: true });
        const hasOtherDefaultBanner = await Banner.exists({ 
            isDefault: true, 
            _id: { $ne: req.params.id } 
        });
        
        if (!banner) {
            req.flash('error_msg', 'Banner not found');
            return res.redirect('/admin/banners');
        }

        res.render('admin/edit-banner', {
            banner,
            categories,
            hasOtherDefaultBanner,
            messages: {
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading edit banner form:', error);
        req.flash('error_msg', 'Error loading form');
        res.redirect('/admin/banners');
    }
};

const updateBanner = async (req, res) => {
    try {
        const { title, description, link, isDefault } = req.body;
        const bannerId = req.params.id;

        const updateData = {
            title,
            description,
            link,
            isDefault: isDefault === 'true',
            updatedAt: Date.now()
        };

        if (req.file) {
            const oldBanner = await Banner.findById(bannerId);
            if (oldBanner && oldBanner.image) {
                const oldImagePath = path.join(__dirname, '../../public', oldBanner.image);
                try {
                    await fs.unlink(oldImagePath);
                } catch (err) {
                    console.error('Error deleting old banner image:', err);
                }
            }
            updateData.image = `/uploads/banners/${req.file.filename}`;
        }

        await Banner.findByIdAndUpdate(bannerId, updateData);

        req.flash('success_msg', 'Banner updated successfully');
        res.redirect('/admin/banners');
    } catch (error) {
        console.error('Error updating banner:', error);
        req.flash('error_msg', 'Error updating banner');
        res.redirect(`/admin/edit-banner/${req.params.id}`);
    }
};

const toggleBannerStatus = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            return res.status(404).json({
                success: false,
                message: 'Banner not found'
            });
        }

        banner.isActive = !banner.isActive;
        await banner.save();

        res.json({
            success: true,
            message: `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: banner.isActive
        });
    } catch (error) {
        console.error('Error toggling banner status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating banner status'
        });
    }
};

const setDefaultBanner = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            return res.status(404).json({
                success: false,
                message: 'Banner not found'
            });
        }

        banner.isDefault = !banner.isDefault;
        await banner.save();

        res.json({
            success: true,
            message: `Banner set as ${banner.isDefault ? 'default' : 'non-default'} successfully`,
            isDefault: banner.isDefault
        });
    } catch (error) {
        console.error('Error setting default banner:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating banner default status'
        });
    }
};

const deleteBanner = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            req.flash('error_msg', 'Banner not found');
            return res.redirect('/admin/banners');
        }

        if (banner.image) {
            const imagePath = path.join(__dirname, '../../public', banner.image);
            try {
                await fs.unlink(imagePath);
            } catch (err) {
                console.error('Error deleting banner image:', err);
            }
        }

        await Banner.findByIdAndDelete(req.params.id);

        req.flash('success_msg', 'Banner deleted successfully');
        res.redirect('/admin/banners');
    } catch (error) {
        console.error('Error deleting banner:', error);
        req.flash('error_msg', 'Error deleting banner');
        res.redirect('/admin/banners');
    }
};

module.exports = {
    listBanners,
    getAddBanner,
    addBanner,
    getEditBanner,
    updateBanner,
    toggleBannerStatus,
    setDefaultBanner,
    deleteBanner
}; 