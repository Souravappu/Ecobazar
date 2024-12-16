const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "An unexpected error occurred";

    console.error("Error:", err);

    // Return error response
    res.status(statusCode).json({
        success: false,
        message: message
    });
};


module.exports = errorHandler