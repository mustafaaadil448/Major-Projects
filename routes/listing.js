const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const wrapAsync = require("../utils/wrapAsync.js"); //import the wrapAsync function to handle async errors
const Listing = require("../models/listing.js");//importing the listing model
const { isLoggedIn, isAdmin, isOwner, validateListing ,validateReview} = require("../middleware.js");
const listingController = require("../controllers/listing.js");
const multer = require("multer");
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });

const validateObjectIdParam = (req, res, next) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return next("route");
    }
    next();
};
//Router.route
router.route("/")
    .get(wrapAsync(listingController.index))
    .post(
    isLoggedIn,
    isAdmin,
        upload.single("listing[image]"),
        validateListing,
        wrapAsync(listingController.createListing)
);
//New Route
router.get("/new", isLoggedIn, isAdmin, listingController.renderNewForm);

//show update and delete routes
router.route("/:id")
    .get(validateObjectIdParam, wrapAsync(listingController.showListing))
    .put(
        validateObjectIdParam,
        isLoggedIn,
        isOwner,
        upload.single("listing[image]"),
        validateListing, 
        wrapAsync(listingController.updateListing))
    .delete(validateObjectIdParam, isLoggedIn, isOwner, wrapAsync(listingController.destroyListing));

//Edit Route
router.get("/:id/edit", validateObjectIdParam, isLoggedIn, isOwner, wrapAsync(listingController.renderEditForm));

module.exports = router;