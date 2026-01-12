const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js"); //import the wrapAsync function to handle async errors
const Listing = require("../models/listing.js");//importing the listing model
const { isLoggedIn,isOwner,validateListing ,validateReview} = require("../middleware.js");
const listingController = require("../controllers/listing.js");
const multer = require("multer");
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });
//Router.route
router.route("/")
    .get(wrapAsync(listingController.index))
    .post(
        isLoggedIn,
        upload.single("listing[image]"),
        validateListing,
        wrapAsync(listingController.createListing)
);
//New Route
router.get("/new", isLoggedIn, listingController.renderNewForm);

//show update and delete routes
router.route("/:id")
    .get(wrapAsync(listingController.showListing))
    .put(
        isLoggedIn,
        isOwner,
        validateListing, 
        wrapAsync(listingController.updateListing))
    .delete(isLoggedIn,isOwner, wrapAsync(listingController.destroyListing));

//Edit Route
router.get("/:id/edit", isLoggedIn,isOwner, wrapAsync(listingController.renderEditForm));

module.exports = router;