const Listing = require("./models/listing.js");
const Review = require("./models/reviews.js");
const User = require("./models/user.js");
const { verifyTokenString } = require("./utils/jwt.js");

const ExpressError = require("./utils/ExpressError.js"); //import ExpressError class to handle errors
const { listingSchema, reviewSchema } = require("./schema.js"); //importing the listing schema for validation
// const Review = require("./models/reviews.js"); //importing the review model for reviews
module.exports.isLoggedIn = (req, res, next) => {
    
    // if user is not authenicated, redirect to login page
    // Passport session auth
    if (req.isAuthenticated && req.isAuthenticated()) {
        if (req.user?.isBlocked) {
            req.logout?.(() => {});
            req.flash("error", "Your account has been blocked.");
            return res.redirect("/login");
        }
        return next();
    }

    // JWT cookie/header auth (for RBAC endpoints)
    const token = extractToken(req);
    if (!token) {
        req.session.redirectUrl = req.originalUrl;
        req.flash("error", "You must be logged in.");
        return res.redirect("/login");
    }

    (async () => {
        try {
            const payload = verifyTokenString(token);
            req.auth = payload;
            if (!req.user) {
                req.user = await User.findById(payload.id);
            }
            if (req.user?.isBlocked) {
                req.flash("error", "Your account has been blocked.");
                return res.redirect("/login");
            }
            return next();
        } catch (e) {
            req.flash("error", "Invalid or expired session. Please log in again.");
            return res.redirect("/login");
        }
    })();
};

// Admin guard: must be logged in and have role 'admin'
module.exports.isAdmin = (req, res, next) => {
    const role = req.user?.role || req.auth?.role;
    if (role !== "admin") {
        req.flash("error", "You do not have permission to access admin panel.");
        return res.redirect("/");
    }
    return next();
};

// JWT-only guard (API style). Keeps passport session compatible.
module.exports.verifyToken = async (req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        if (req.user?.isBlocked) {
            if (req.accepts("html")) {
                req.flash("error", "Your account has been blocked.");
                return res.redirect("/login");
            }
            return res.status(403).json({ error: "Blocked user" });
        }
        req.auth = { id: req.user._id.toString(), role: req.user.role };
        return next();
    }

    const token = extractToken(req);
    if (!token) {
        if (req.accepts("html")) {
            req.flash("error", "You must be logged in.");
            return res.redirect("/login");
        }
        return res.status(401).json({ error: "Missing token" });
    }

    try {
        const payload = verifyTokenString(token);
        req.auth = payload;
        if (!req.user) {
            req.user = await User.findById(payload.id);
        }
        if (!req.user) {
            return res.status(401).json({ error: "Invalid token user" });
        }
        if (req.user?.isBlocked) {
            if (req.accepts("html")) {
                req.flash("error", "Your account has been blocked.");
                return res.redirect("/login");
            }
            return res.status(403).json({ error: "Blocked user" });
        }
        return next();
    } catch (e) {
        if (req.accepts("html")) {
            req.flash("error", "Invalid or expired token. Please log in again.");
            return res.redirect("/login");
        }
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};

module.exports.isUser = (req, res, next) => {
    const role = req.user?.role || req.auth?.role;
    if (role !== "user") {
        req.flash("error", "User access only.");
        return res.redirect("/");
    }
    return next();
};


module.exports.saveRedirectUrl = (req, res, next) => {
    if(req.session.redirectUrl) {
        res.locals.redirectUrl = req.session.redirectUrl;
    }
    next();
};

module.exports.isOwner = async (req, res, next) => {
    let { id } = req.params;
    let listing = await Listing.findById(id);
    if (res.locals.currentUser?.role === "admin") {
        return next();
    }
    if (!listing || !listing.owner || !res.locals.currentUser || !listing.owner._id.equals(res.locals.currentUser._id)) {
        req.flash("error", "You are not the owner of this listing!");
        return res.redirect(`/${id}`);
    }
    next();
};
    //middleware for validating listing data
module.exports.validateListing = (req, res, next) => {
    let { error } = listingSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map(el => el.message).join(","); //hopscoth fasa tha undefine problem 
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};
//middleware for validating review data
module.exports.validateReview = (req, res, next) => {
    let {error} = reviewSchema.validate(req.body);
        if(error) {
            let errMsg = error.details.map(el => el.message).join(","); //hopscoth fasa tha undefine problem 
            throw new ExpressError(400, errMsg);
        }else{
            next();
        }
    };

    //middleware to check if the user is the owner of the review
    module.exports.isReviewAuthor = async (req, res, next) => {
    let { id, reviewId } = req.params;
    let review = await Review.findById(reviewId);
    if (res.locals.currentUser?.role === "admin") {
        return next();
    }
    if (!review.author.equals(res.locals.currentUser._id)) {
        req.flash("error", "You are not the author of this review!");
        return res.redirect(`/${id}`);
    }
    next();
};

function extractToken(req) {
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
        return authHeader.slice(7).trim();
    }
    return req.cookies?.token;
}
