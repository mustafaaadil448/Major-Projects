const Listing = require("../models/listing");
const ExpressError = require("../utils/ExpressError.js");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Show all listings
module.exports.index = async (req, res) => {
    const q = (req.query.q || "").toString().trim();
    const activeFilter = (req.query.filter || "").toString().trim().toLowerCase();

    const filterKeywords = {
        rooms: "room|rooms|bed|beds|bedroom|suite",
        iconic: "city|cities|downtown|metro|urban",
        mountains: "mountain|mountains|hill|hills|valley|peak|peaks",
        castles: "castle|castles|fort|forts|palace|palaces",
        pools: "pool|pools|swimming",
        camping: "camp|camping|tent|tents",
        farms: "farm|farms|ranch",
        arctic: "arctic|snow|ice|winter",
        domes: "dome|domes|igloo|geodesic",
        boats: "boat|boats|houseboat|yacht",
    };

    const filter = { isActive: { $ne: false } };

    const andParts = [];
    if (q) {
        const rx = new RegExp(escapeRegex(q), "i");
        andParts.push({ $or: [{ title: rx }, { location: rx }, { country: rx }, { description: rx }] });
    }

    if (activeFilter && activeFilter !== "trending" && filterKeywords[activeFilter]) {
        const rx = new RegExp(filterKeywords[activeFilter], "i");
        andParts.push({ $or: [{ title: rx }, { location: rx }, { country: rx }, { description: rx }] });
    }

    if (andParts.length === 1) {
        Object.assign(filter, andParts[0]);
    } else if (andParts.length > 1) {
        filter.$and = andParts;
    }

    const sort = activeFilter === "trending" ? { viewCount: -1 } : undefined;

    const allListings = await Listing.find(filter).sort(sort).select("title price image").lean();
    res.render("listings/index.ejs", { allListings, q, activeFilter });
};

// Render New Form
module.exports.renderNewForm = (req, res) => {
    res.render("listings/new.ejs");
};

// Show single listing
module.exports.showListing = async (req, res) => {
    let { id } = req.params;
    // Track views for admin analytics
    await Listing.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }).catch(() => {});

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

    if (!process.env.MAP_TOKEN) {
        throw new ExpressError(500, "MAP_TOKEN missing. Set MAP_TOKEN in .env to create listings.");
    }

    const locationQuery = req.body?.listing?.location;
    if (!locationQuery) {
        throw new ExpressError(400, "Listing location is required.");
    }

    let response;
    try {
        response = await geocodingClient
            .forwardGeocode({
                query: locationQuery,
                limit: 1,
            })
            .send();
    } catch (e) {
        throw new ExpressError(502, `Mapbox geocoding failed: ${e.message}`);
    }

    const firstFeature = response?.body?.features?.[0];
    if (!firstFeature?.geometry) {
        throw new ExpressError(400, "Could not find coordinates for the provided location.");
    }

    let url = req.file?.path;      // ✅ safer: cloudinary gives file.path
    let filename = req.file?.filename;

    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;  // ✅ always link owner
    newListing.image = { url, filename };
    newListing.geometry = firstFeature.geometry;
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
    let originalImageUrl = listing.image.url.replace("/upload", "/upload/h_300,w_250");
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
