const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {

        await mongoose.connect(process.env.MONGODB_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error; 
    }
};

module.exports = connectDB;