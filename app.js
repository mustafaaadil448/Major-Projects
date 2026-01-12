if(process.env.NODE_ENV !== "production"){
require("dotenv").config();// for using environment variables from .env file
}
const express = require("express");//importing express
const app = express();//importing express
const mongoose = require("mongoose");// importing mongoose
const path = require("path");//path module
const compression = require("compression");
const methodOverride = require("method-override");// importinf method-override
const ejsMate = require("ejs-mate");//importing ejs-mate it help to create layouts and partials of ejs template
const ExpressError = require("./utils/ExpressError.js"); //import ExpressError class to handle errors
const session = require("express-session"); // importing express-session for session mangement
const MongoStore = require("connect-mongo");//importing connect-mongo to store session in mongoDB
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const router = express.Router({ mergeParams: true });
//
const dbUrl = process.env.ATLASDB_URL; //database url

app.set("view engine", "ejs");//set the view engine tp ejs
app.set("views", path.join(__dirname, "views")); //set the views directory
app.use(compression());
app.use(express.urlencoded({ extended: true})); //for parsing data to url formate
app.use(methodOverride("_method"));// for using put and delete methods
app.engine("ejs", ejsMate); //usign ejs-Mate as the template engine
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
store.on("error", ()=> {
    console.log("Error in MONGO SESSION STORE", err);
});
store.on("error", () => {
    console.log("Error in MONGO SESSION STORE", err);
});

const sessionOptions = {
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
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

//middleware for flash messages
app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currentUser = req.user;
    next();
});

//importing the router

// const homeRouter = require("./routes/home.js");
// app.use("/", homeRouter);
const listingRouter = require("./routes/listing.js");
app.use("/", listingRouter);

//importing the review router
const reviewRouter = require("./routes/review.js");
app.use("/:id/reviews", reviewRouter);

//importing the user routers
// importing
const userRouter = require("./routes/user.js");
app.use("/", userRouter);


main().then(() => {
    console.log("Connected to DB");
}).catch((err) => {
    console.log(err);
});
async function main() {
    await mongoose.connect(dbUrl);// connect to the database
}

//Error handling middleware
app.use((err, req, res, next) => {
    let { statusCode=500, message="Something went wrong!" } = err;
    res.status(statusCode).render("error.ejs", { message });
    // res.status(statusCode).send(message);
    // res.send("Something went wrong! please try agian");
});
app.listen(8080, () =>{
    console.log("Server is listening on port 8080");
})
