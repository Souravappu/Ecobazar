const mongoose = require('mongoose');
const User = require('../models/User');

async function fixIndexes() {
    try {
        await User.collection.dropIndexes();
        console.log('Dropped existing indexes');

        await User.collection.createIndex(
            { email: 1 },
            { unique: true }
        );
        console.log('Created email index');

        await User.collection.createIndex(
            { googleId: 1 },
            { 
                unique: true,
                partialFilterExpression: { googleId: { $exists: true } }
            }
        );
        console.log('Created googleId index');

        console.log('Index migration completed successfully');
    } catch (error) {
        console.error('Error fixing indexes:', error);
        throw error;
    }
}

module.exports = fixIndexes; 