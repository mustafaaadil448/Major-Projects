const express = require("express");
const router = express.Router({mergeParams: true});
const wrapAsync = require("../utils/wrapAsync.js"); //import the wrapAsync function to handle async errors
const ExpressError = require("../utils/ExpressError.js"); //import ExpressError class to handle errors
const Listing = require("../models/listing.js");//importing the listing model
const { validateReview,isLoggedIn,isReviewAuthor } = require("../middleware.js"); //importing the validateReview middleware
const Review = require("../models/reviews.js");
const reviewController = require("../controllers/reviews.js");

//reviews route
//get route
router.get("/", wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate({
        path: "reviews",
        populate: { path: "author" }
    });
    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }
    res.render("reviews/index.ejs", { listing });
}));
//post route
router.post("/",isLoggedIn,validateReview,wrapAsync(reviewController.createReview));
//Delete review Route
router.delete("/:reviewId",isLoggedIn,isReviewAuthor, wrapAsync(reviewController.destroyReview));

module.exports = router;