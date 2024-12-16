const mongoose = require('mongoose');

const addressSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    address: [{
        name: {
            type: String,
            required: true
        },
        streetAddress: {
            type: String,
            required: true,
            trim: true
        },
        addressType: {
            type: String, 
            required: true,
            enum: ["Home", "Office", "Other"],  
            default: "Home"
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        apartment: {
            type: String,
            trim: true  
        },
        landMark: {
            type: String,
            trim: true
        },
        postalCode: {
            type: String,  
            trim: true
        },
        phone: {
            type: String,
            required: true
        },
        isDefault: {
            type: Boolean,
            default: false
        }
    }]
}, { timestamps: true });

const Address = mongoose.model('Address', addressSchema);
module.exports = Address;