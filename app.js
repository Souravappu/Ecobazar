const express = require("express");
const session = require("express-session");
const path = require("path");
const connectDB = require("./config/db");
const flash = require("connect-flash");
const nocache = require("nocache");
const passport = require("./config/passport");
const userRouter = require("./routes/userRoute");
const adminRouter = require("./routes/adminRoute");
const errorHandler = require("./config/errorHandler");
const fixGoogleIdIndex = require("./utils/fixGoogleIdIndex");
const fixIndexes = require("./utils/fixIndexes");
const getCounts = require('./middlewares/countMiddleware');

require("dotenv").config();
require('./models/Category');  
require('./models/Products');
require('./models/Cart');   
require('./models/Wishlist'); 
require('./models/User');  

const app = express();

const PORT = process.env.PORT || 4000;
connectDB();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Error Handling Middleware
app.use(errorHandler);
app.use(flash());

app.use(nocache());

app.use(passport.initialize());
app.use(passport.session());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

app.use(getCounts);

app.use("/", userRouter);
app.use("/admin", adminRouter);
connectDB();

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).render('user/error', {
        message: err.message || 'Something went wrong!',
        categories: [],
        user: null
    });
});

// 404 handler 
app.use((req, res) => {
    res.status(404).render('user/error', {
        message: 'Page not found',
        categories: [],
        user: null
    });
});

app.listen(PORT, (err) => {
  if (err) {
    console.error("Server Starting Error:", err);
  } else {
    console.log(`Server is running at http://localhost:${PORT}`);
  }
});
