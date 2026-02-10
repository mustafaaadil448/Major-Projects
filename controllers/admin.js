const Listing = require("../models/listing.js");
const Review = require("../models/reviews.js");
const User = require("../models/user.js");

module.exports.dashboard = async (req, res) => {
  const [totalListings, totalReviews, totalUsers] = await Promise.all([
    Listing.countDocuments({}),
    Review.countDocuments({}),
    User.countDocuments({}),
  ]);

  const recentListings = await Listing.find({})
    .sort({ _id: -1 })
    .limit(5)
    .populate("owner");

  const recentUsers = await User.find({})
    .sort({ _id: -1 })
    .limit(5);

  res.render("admin/dashboard.ejs", {
    stats: { totalListings, totalReviews, totalUsers },
    recentListings,
    recentUsers,
  });
};
