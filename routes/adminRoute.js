const express = require("express");
const adminRouter = express.Router();
const upload = require("../config/multer");
const adminController = require("../controllers/admin/adminController");
const Controller = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const orderController = require("../controllers/admin/orderController");
const couponController = require("../controllers/admin/couponController");
const { adminAuth, adminAuthentication } = require('../middlewares/auth');

// Admin login 
adminRouter.get("/login", adminAuth, adminController.getLogin);
adminRouter.post("/login", adminController.checkLogin);
adminRouter.get("/logout", adminController.logout);

// Admin dashboard
adminRouter.get("/home", adminAuthentication, adminController.getHome);
adminRouter.get("/", adminAuthentication, adminController.getHome);

// customer 
adminRouter.get("/customers", adminAuthentication, adminController.customerInfo);
adminRouter.get("/blockCustomer", adminAuthentication, adminController.blockCustomer);
adminRouter.get("/unblockCustomer", adminAuthentication, adminController.unblockCustomer);
adminRouter.get("/deleteCustomer", adminAuthentication, adminController.deleteCustomer);
adminRouter.get('/viewCustomer/:id', adminAuthentication, adminController.viewCustomer);

// Category 
adminRouter.get("/category", adminAuthentication, Controller.getCategory);
adminRouter.get("/add-category", adminAuthentication, Controller.getAddCategory);
adminRouter.post(
  "/add-category", adminAuthentication,
  upload.single("categoryImage"),
  Controller.addCategory
);
adminRouter.get("/edit-category/:id", adminAuthentication, Controller.getEditCategory);
adminRouter.post(
  "/edit-category/:id", adminAuthentication,
  upload.single("categoryImage"),
  Controller.editCategory
);
adminRouter.get("/delete-category/:id", adminAuthentication, Controller.deleteCategory);
adminRouter.get("/viewCategory/:id", adminAuthentication, Controller.viewCategory);
adminRouter.get("/block-category/:id", adminAuthentication, Controller.blockCategory);
adminRouter.get("/unblock-category/:id", adminAuthentication, Controller.unblockCategory);

//products management

adminRouter.get("/products", adminAuthentication, productController.getProduct);
adminRouter.get("/add-product", adminAuthentication, productController.getAddProduct);
adminRouter.post(
  "/add-product", adminAuthentication,
  upload.array("productImage", 5),
  productController.addProduct
);
adminRouter.get("/editProduct/:id", adminAuthentication, productController.getEditProduct);
adminRouter.post(
  "/edit-product/:id", adminAuthentication,
  upload.array("productImage", 5),
  productController.editProduct
);
adminRouter.get("/viewProduct/:id", adminAuthentication, productController.viewProduct);
adminRouter.get("/deleteProduct/:id", adminAuthentication, productController.deleteProduct);
adminRouter.get("/blockProduct/:id", adminAuthentication, productController.blockProduct);
adminRouter.get("/unblockProduct/:id", adminAuthentication, productController.unblockProduct);


adminRouter.get("/orders", adminAuthentication, orderController.getOrders);
adminRouter.get("/order/:id", adminAuthentication, orderController.getOrderDetails);
adminRouter.post("/order/:orderId/cancel", adminAuthentication, orderController.cancelOrder);
adminRouter.post("/order/:orderId/item/:itemId/cancel", adminAuthentication, orderController.cancelOrderItem);
adminRouter.post("/order/:orderId/status", adminAuthentication, orderController.updateOrderStatus);

adminRouter.post("/order/:orderId/approve-return", adminAuthentication, orderController.approveReturn);
adminRouter.post("/order/:orderId/item/:itemId/approve-return", adminAuthentication, orderController.approveItemReturn);
adminRouter.post("/order/:orderId/reject-return", adminAuthentication, orderController.rejectReturn);
adminRouter.post("/order/:orderId/item/:itemId/reject-return", adminAuthentication, orderController.rejectItemReturn);

adminRouter.get("/coupons", adminAuthentication, couponController.listCoupons);
adminRouter.get("/add-coupon", adminAuthentication, couponController.getAddCoupon);
adminRouter.post("/add-coupon", adminAuthentication, couponController.addCoupon);
adminRouter.get("/edit-coupon/:id", adminAuthentication, couponController.getEditCoupon);
adminRouter.post("/edit-coupon/:id", adminAuthentication, couponController.editCoupon);
adminRouter.post("/toggle-coupon/:id", adminAuthentication, couponController.toggleCouponStatus);
adminRouter.delete("/delete-coupon/:id", adminAuthentication, couponController.deleteCoupon);
adminRouter.get("/sales-report", adminAuthentication, adminController.getSalesReport);

module.exports = adminRouter;

