const express = require("express");
const adminRouter = express.Router();
const upload = require("../config/multer");
const adminController = require("../controllers/admin/adminController");
const Controller = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const {  adminAuth, adminAuthentication } = require('../middlewares/auth')
const orderController = require("../controllers/admin/orderController");

// Admin login route
adminRouter.get("/login", adminAuth,adminController.getLogin);
adminRouter.post("/login", adminController.checkLogin);
adminRouter.get("/", adminController.getHome);
adminRouter.get("/logout", adminController.logout);

// customer route
adminRouter.get("/customers", adminController.customerInfo);
adminRouter.get("/blockCustomer", adminController.blockCustomer);
adminRouter.get("/unblockCustomer", adminController.unblockCustomer);
adminRouter.get("/deleteCustomer", adminController.deleteCustomer);
adminRouter.get('/viewCustomer/:id', adminController.viewCustomer);

// Category Route
adminRouter.get("/category", Controller.getCategory);
adminRouter.get("/add-category", Controller.getAddCategory);
adminRouter.post(
  "/add-category",
  upload.single("categoryImage"),
  Controller.addCategory
);
adminRouter.get("/edit-category/:id", Controller.getEditCategory);
adminRouter.post(
  "/edit-category/:id",
  upload.single("categoryImage"),
  Controller.editCategory
);
adminRouter.get("/delete-category/:id", Controller.deleteCategory);
adminRouter.get("/viewCategory/:id", Controller.viewCategory);
adminRouter.get("/block-category/:id", Controller.blockCategory);
adminRouter.get("/unblock-category/:id", Controller.unblockCategory);

//products management

adminRouter.get("/products", productController.getProduct);
adminRouter.get("/add-product", productController.getAddProduct);
adminRouter.post(
  "/add-product",
  upload.array("productImage", 5),
  productController.addProduct
);
adminRouter.get("/editProduct/:id", productController.getEditProduct);
adminRouter.post(
  "/edit-product/:id",
  upload.array("productImage", 5),
  productController.editProduct
);
adminRouter.get("/viewProduct/:id", productController.viewProduct);
adminRouter.get("/deleteProduct/:id", productController.deleteProduct);
adminRouter.get("/blockProduct/:id", productController.blockProduct);
adminRouter.get("/unblockProduct/:id", productController.unblockProduct);

// Add these order management routes
adminRouter.get("/orders", adminAuthentication, orderController.getOrders);
adminRouter.get("/order/:id", adminAuthentication, orderController.getOrderDetails);
adminRouter.post("/order/:orderId/cancel", adminAuthentication, orderController.cancelOrder);
adminRouter.post("/order/:orderId/item/:itemId/cancel", adminAuthentication, orderController.cancelOrderItem);
adminRouter.post("/order/:orderId/status", adminAuthentication, orderController.updateOrderStatus);

module.exports = adminRouter;
