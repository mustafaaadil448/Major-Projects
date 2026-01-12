const Listing = require("../models/listing.js");
const Review = require("../models/reviews.js");

module.exports.createReview = async(req, res) => {
    let listing = await Listing.findById(req.params.id);
    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/");
    }
    let newReview = new Review(req.body.review);
    newReview.author = req.user._id;
    console.log(newReview);
    await newReview.save();
    await Listing.findByIdAndUpdate(listing._id, { $push: { reviews: newReview._id } });
    req.flash("success", "New Review Created!");
    res.redirect(`/${listing._id}`);
};

module.exports.destroyReview = async(req, res) => {
    let { id, reviewId } = req.params;
    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review Deleted!");
    res.redirect(`/${id}`);
};