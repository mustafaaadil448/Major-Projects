const Listing = require("../models/listing");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding'); // ✅ spelling fixed
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken }); // ✅ now matches

// Show all listings
module.exports.index = async (req, res) => {
    const allListings = await Listing.find()
        .select("title price image")
        .lean();
    res.render("listings/index.ejs", { allListings });
};

// Render New Form
module.exports.renderNewForm = (req, res) => {
    res.render("listings/new.ejs");
};

// Show single listing
module.exports.showListing = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id)
        .populate({
            path: "reviews",
            select: "comment rating author createdAt",
            populate: { path: "author", select: "username" },
        })
        .populate({ path: "owner", select: "username" })
        .lean();

    if (!listing) {
        req.flash("error", "Listing you requested for does not exist");
        return res.redirect("/");
    }

    res.render("listings/show.ejs", { listing });
};

// Create new listing
module.exports.createListing = async (req, res, next) => {
    if (!req.user) {
        req.flash("error", "You must be logged in to create a listing");
        return res.redirect("/login");
    }
    let response = await geocodingClient.forwardGeocode({
        query: req.body.listing.location,
        limit: 1
    })
        .send();

    let url = req.file?.path;      // ✅ safer: cloudinary gives file.path
    let filename = req.file?.filename;

    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;  // ✅ always link owner
    newListing.image = { url, filename };
    newListing.geometry = response.body.features[0].geometry; // ✅ correct path to geometry
    let saveListing = await newListing.save();
    console.log(saveListing);
    req.flash("success", "New Listing Created!");
    res.redirect(`/${newListing._id}`);
};

// Render Edit Form
module.exports.renderEditForm = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing you requested for does not exist");
        return res.redirect("/");
    }
    let originalImageUrl = listing.image.url;
    originalImageUrl.replace("/upload", "/upload/h_300,w_250");
    res.render("listings/edit.ejs", { listing, originalImageUrl });
};

// Update Listing
module.exports.updateListing = async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });
    if (typeof req.file !== "undefined") {
        let url = req.file?.path;      // ✅ safer: cloudinary gives file.path
        let filename = req.file?.filename;
        listing.image = { url, filename };
        await listing.save();
    }
    req.flash("success", "Listing Updated!");
    res.redirect(`/${id}`);
};

// Delete Listing
module.exports.destroyListing = async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    req.flash("success", "Listing Deleted!");
    res.redirect("/");
};
