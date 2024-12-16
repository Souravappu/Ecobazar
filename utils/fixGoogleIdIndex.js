const mongoose = require('mongoose');
const User = require('../models/User');

async function fixGoogleIdIndex() {
    try {
        // Drop the existing index
        await User.collection.dropIndex('googleId_1');
        console.log('Successfully dropped the old index');

        // Create the new sparse index
        await User.collection.createIndex(
            { googleId: 1 }, 
            { unique: true, sparse: true }
        );
        console.log('Successfully created new sparse index');

    } catch (error) {
        if (error.code === 27) {
            console.log('Index does not exist, creating new sparse index');
            try {
                await User.collection.createIndex(
                    { googleId: 1 }, 
                    { unique: true, sparse: true }
                );
                console.log('Successfully created new sparse index');
            } catch (err) {
                console.error('Error creating new index:', err);
            }
        } else {
            console.error('Error fixing index:', error);
        }
    }
}

module.exports = fixGoogleIdIndex; 