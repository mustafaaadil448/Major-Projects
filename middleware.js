const Listing = require("./models/listing");
const Review = require("./models/reviews.js");

const ExpressError = require("./utils/ExpressError.js"); //import ExpressError class to handle errors
const { listingSchema, reviewSchema } = require("./schema.js"); //importing the listing schema for validation
// const Review = require("./models/reviews.js"); //importing the review model for reviews
module.exports.isLoggedIn = (req, res, next) => {
    
    // if user is not authenicated, redirect to login page
    if(!req.isAuthenticated()) {
        req.session.redirectUrl = req.originalUrl;
        req.flash("error","you must be logged in to create listing!");
        return res.redirect("/login");
    }
    next();
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
    if (!listing.owner._id.equals(res.locals.currentUser._id)) {
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
    if (!review.author.equals(res.locals.currentUser._id)) {
        req.flash("error", "You are not the author of this review!");
        return res.redirect(`/${id}`);
    }
    next();
};
