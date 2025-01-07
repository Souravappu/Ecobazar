const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    image: {
        type: String,
        required: false
    },
    link: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save middleware to ensure only one default banner
bannerSchema.pre('save', async function(next) {
    this.updatedAt = Date.now();
    
    // If this banner is being set as default
    if (this.isDefault) {
        // Remove default flag from all other banners
        await this.constructor.updateMany(
            { _id: { $ne: this._id } },
            { $set: { isDefault: false } }
        );
    }
    next();
});

module.exports = mongoose.model('Banner', bannerSchema); 