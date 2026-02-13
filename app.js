if(process.env.NODE_ENV !== "production"){
require("dotenv").config();// for using environment variables from .env file
}
const express = require("express");//importing express
const app = express();//importing express
const mongoose = require("mongoose");// importing mongoose
const path = require("path");//path module
const compression = require("compression");
const cookieParser = require("cookie-parser");
const methodOverride = require("method-override");// importinf method-override
const ejsMate = require("ejs-mate");//importing ejs-mate it help to create layouts and partials of ejs template
const ExpressError = require("./utils/ExpressError.js"); //import ExpressError class to handle errors
const session = require("express-session"); // importing express-session for session mangement
const MongoStore = require("connect-mongo");//importing connect-mongo to store session in mongoDB
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const { verifyTokenString } = require("./utils/jwt.js");
const router = express.Router({ mergeParams: true });
//
const dbUrl = process.env.ATLASDB_URL; //database url

// Needed for correct req.secure / x-forwarded-proto handling behind proxies
app.set("trust proxy", 1);

app.set("view engine", "ejs");//set the view engine tp ejs
app.set("views", path.join(__dirname, "views")); //set the views directory

// Ensure template changes reflect during development
if (process.env.NODE_ENV !== "production") {
    app.disable("view cache");
}

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true})); //for parsing data to url formate
app.use(methodOverride("_method"));// for using put and delete methods
app.engine("ejs", ejsMate); //usign ejs-Mate as the template engine
app.use(cookieParser());
app.use(
    express.static(path.join(__dirname, "/public"), {
        maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    })
);
// Linux (Render) is case-sensitive: map /css/* to existing public/CSS/*
app.use("/css", express.static(path.join(__dirname, "public", "CSS")));

//session store
const store = MongoStore.create({
    mongoUrl: dbUrl,
    crypto: {
        secret: process.env.SECRET,
    },
    touchAfter: 24 * 3600, // time period in seconds
});
// Log session store errors correctly (avoid duplicate handlers)
store.on("error", (err) => {
    console.log("Error in MONGO SESSION STORE", err);
});

const sessionOptions = {
    secret: process.env.SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};

//using session middleware
app.use(session(sessionOptions)); 
app.use(flash());

//passport configuration
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// If no passport session user exists, try to hydrate from JWT cookie.
app.use(async (req, res, next) => {
    if (req.user) return next();
    const token = req.cookies?.token;
    if (!token) return next();
    try {
        const payload = verifyTokenString(token);
        req.auth = payload;
        req.user = await User.findById(payload.id);
    } catch (e) {
        // ignore invalid/expired token for normal page loads
    }
    return next();
});

//middleware for flash messages
app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currentUser = req.user;
    res.locals.searchQuery = (req.query?.q || "").toString();
    next();
});

//importing the router

// const homeRouter = require("./routes/home.js");
// app.use("/", homeRouter);

// Admin routes (mount early so dynamic routes like /:id/reviews don't shadow /admin/*)
const adminRouter = require("./routes/admin.js");
app.use("/", adminRouter);

// Payment APIs (Razorpay)
const paymentRouter = require("./routes/payment.js");
app.use("/api/payment", paymentRouter);

const listingRouter = require("./routes/listing.js");
app.use("/", listingRouter);

//importing the review router
const reviewRouter = require("./routes/review.js");
app.use("/:id/reviews", reviewRouter);

//importing the user routers
// importing
const userRouter = require("./routes/user.js");
app.use("/", userRouter);

// Booking routes
const bookingRouter = require("./routes/booking.js");
app.use("/", bookingRouter);


main().then(() => {
    console.log("Connected to DB");
}).catch((err) => {
    console.log(err);
});
async function main() {
    await mongoose.connect(dbUrl);// connect to the database
    // Optional: promote a specific user to admin via env ADMIN_USERNAME
    if (process.env.ADMIN_USERNAME) {
        try {
            await User.updateOne({ username: process.env.ADMIN_USERNAME }, { role: "admin" });
        } catch (e) {
            console.log("ADMIN bootstrap failed:", e.message);
        }
    }
}

//Error handling middleware
app.use((err, req, res, next) => {
    let { statusCode=500, message="Something went wrong!" } = err;

    const accept = (req.get("accept") || "").toLowerCase();
    const wantsJson = req.originalUrl?.startsWith?.("/api/") || accept.includes("application/json") || req.xhr;
    if (wantsJson) {
        return res.status(statusCode).json({ success: false, message });
    }

    res.status(statusCode).render("error.ejs", { message });
    // res.status(statusCode).send(message);
    // res.send("Something went wrong! please try agian");
});
app.listen(8080, () =>{
    console.log("Server is listening on port 8080");
})
