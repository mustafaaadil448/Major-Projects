const mongoose = require("mongoose");
const Listing = require("../models/listing.js");
const Review = require("../models/reviews.js");
const User = require("../models/user.js");
const Booking = require("../models/booking.js");
const ExpressError = require("../utils/ExpressError.js");
const { getRazorpayClient } = require("../utils/razorpay.js");
const analytics = require("../utils/adminAnalytics.js");

function parseRange(range) {
    const x = (range || "12m").toLowerCase();
    if (["7d", "30d", "12m"].includes(x)) return x;
    return "12m";
}

function safeInt(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toCSV(rows) {
    const esc = (s) => {
        const str = String(s ?? "");
        if (/[\n\r,\"]/g.test(str)) return `"${str.replace(/\"/g, '""')}"`;
        return str;
    };
    return rows.map((r) => r.map(esc).join(",")).join("\n");
}

module.exports.dashboard = async (req, res) => {
    const range = parseRange(req.query.range);

    const [kpis, revenue, bookingTrends, topListings, userGrowth, insights, activity] = await Promise.all([
        analytics.getKpis(),
        analytics.getRevenueSeries(range),
        analytics.getBookingTrends(range),
        analytics.getTopListings(range),
        analytics.getUserGrowthSeries(range),
        analytics.getInsights(),
        analytics.getRecentActivity(),
    ]);

    const paymentStatus = await analytics.getPaymentStatusCounts({ from: revenue.from, to: revenue.to });

    // Sparkline series (last 12 points) for KPI cards
    const spark = revenue.data.slice(-12);

    res.render("admin/dashboard.ejs", {
        layout: "layouts/admin",
        active: "dashboard",
        pageTitle: "Dashboard",
        pageSubtitle: "Premium analytics overview",
        range,
        kpis,
        charts: {
            revenue,
            bookingTrends,
            topListings,
            userGrowth,
            paymentStatus,
        },
        insights,
        activity,
        spark,
        kpisApiUrl: "/admin/api/kpis",
        analyticsApiUrl: "/admin/api/analytics",
    });
};

module.exports.kpisApi = async (req, res) => {
    const kpis = await analytics.getKpis();

    const pendingSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pendingOver24h = await Booking.countDocuments({ paymentStatus: "pending", createdAt: { $lt: pendingSince } });

    res.json({ ok: true, kpis, alerts: { pendingOver24h } });
};

module.exports.analyticsApi = async (req, res) => {
    const range = parseRange(req.query.range);
    const [revenue, bookingTrends, topListings, userGrowth] = await Promise.all([
        analytics.getRevenueSeries(range),
        analytics.getBookingTrends(range),
        analytics.getTopListings(range),
        analytics.getUserGrowthSeries(range),
    ]);
    const paymentStatus = await analytics.getPaymentStatusCounts({ from: revenue.from, to: revenue.to });
    res.json({ ok: true, range, revenue, bookingTrends, topListings, userGrowth, paymentStatus });
};

module.exports.analyticsPage = async (req, res) => {
    const range = parseRange(req.query.range);
    const [kpis, revenue, bookingTrends, topListings, userGrowth] = await Promise.all([
        analytics.getKpis(),
        analytics.getRevenueSeries(range),
        analytics.getBookingTrends(range),
        analytics.getTopListings(range),
        analytics.getUserGrowthSeries(range),
    ]);
    const paymentStatus = await analytics.getPaymentStatusCounts({ from: revenue.from, to: revenue.to });
    res.render("admin/analytics.ejs", {
        layout: "layouts/admin",
        active: "analytics",
        pageTitle: "Analytics",
        pageSubtitle: "Revenue, bookings, users & payments",
        range,
        kpis,
        charts: { revenue, bookingTrends, topListings, userGrowth, paymentStatus },
        analyticsApiUrl: "/admin/api/analytics",
    });
};

module.exports.settings = async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.render("admin/settings.ejs", {
        layout: "layouts/admin",
        active: "settings",
        pageTitle: "Settings",
        pageSubtitle: "Preferences & admin tools",
    });
};

module.exports.bookings = async (req, res) => {
    const q = (req.query.q || "").trim();
    const bookingStatus = (req.query.status || "").trim();
    const paymentStatus = (req.query.payment || "").trim();
    const minAmount = safeInt(req.query.minAmount, null);
    const maxAmount = safeInt(req.query.maxAmount, null);
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const sort = (req.query.sort || "-createdAt").trim();

    const filter = {};
    if (bookingStatus) filter.bookingStatus = bookingStatus;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lte = to;
    }
    if (minAmount != null || maxAmount != null) {
        filter.finalAmount = {};
        if (minAmount != null) filter.finalAmount.$gte = minAmount;
        if (maxAmount != null) filter.finalAmount.$lte = maxAmount;
    }

    // Search by booking id / paymentId / orderId
    if (q) {
        filter.$or = [
            { razorpayOrderId: { $regex: q, $options: "i" } },
            { paymentId: { $regex: q, $options: "i" } },
        ];
        if (mongoose.Types.ObjectId.isValid(q)) {
            filter.$or.push({ _id: analytics.toObjectId(q) });
        }
    }

    const bookings = await Booking.find(filter)
        .sort(sort)
        .limit(200)
        .populate({ path: "user", select: "username email role isBlocked" })
        .populate({ path: "listing", select: "title location country" })
        .lean();

    res.render("admin/bookings.ejs", {
        layout: "layouts/admin",
        active: "bookings",
        pageTitle: "Bookings",
        pageSubtitle: "Search, filter, manage and refund",
        bookings,
        query: { q, bookingStatus, paymentStatus, minAmount: req.query.minAmount || "", maxAmount: req.query.maxAmount || "", from: req.query.from || "", to: req.query.to || "", sort },
    });
};

module.exports.users = async (req, res) => {
    const q = (req.query.q || "").trim();
    const role = (req.query.role || "").trim();

    const match = {};
    if (role) match.role = role;
    if (q) {
        match.$or = [
            { username: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
        ];
    }

    const users = await User.aggregate([
        ...(Object.keys(match).length ? [{ $match: match }] : []),
        { $addFields: { createdAt: { $toDate: "$_id" } } },
        {
            $lookup: {
                from: "bookings",
                localField: "_id",
                foreignField: "user",
                as: "bookings",
            },
        },
        {
            $addFields: {
                bookingsCount: { $size: "$bookings" },
                totalSpending: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$bookings",
                                    as: "b",
                                    cond: { $eq: ["$$b.paymentStatus", "paid"] },
                                },
                            },
                            as: "b",
                            in: "$$b.finalAmount",
                        },
                    },
                },
            },
        },
        { $project: { bookings: 0 } },
        { $sort: { _id: -1 } },
        { $limit: 200 },
    ]);

    res.render("admin/users.ejs", {
        layout: "layouts/admin",
        active: "users",
        pageTitle: "Users",
        pageSubtitle: "Roles, spend, blocks",
        users,
        query: { q, role },
    });
};

module.exports.reviews = async (req, res) => {
    const q = (req.query.q || "").trim();
    const minRating = req.query.minRating ? Number(req.query.minRating) : null;

    const matchReview = {};
    if (q) matchReview["review.comment"] = { $regex: q, $options: "i" };
    if (Number.isFinite(minRating)) matchReview["review.rating"] = { $gte: minRating };

    // Reviews are stored without listing ref; derive via listings.reviews array
    const latest = await Listing.aggregate([
        { $unwind: "$reviews" },
        {
            $lookup: {
                from: "reviews",
                localField: "reviews",
                foreignField: "_id",
                as: "review",
            },
        },
        { $unwind: "$review" },
        ...(Object.keys(matchReview).length ? [{ $match: matchReview }] : []),
        { $sort: { "review.createdAt": -1 } },
        { $limit: 200 },
        {
            $lookup: {
                from: "users",
                localField: "review.author",
                foreignField: "_id",
                as: "author",
            },
        },
        { $unwind: { path: "$author", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                listingId: "$_id",
                listingTitle: "$title",
                rating: "$review.rating",
                comment: "$review.comment",
                createdAt: "$review.createdAt",
                author: { username: "$author.username", email: "$author.email" },
            },
        },
    ]);

    res.render("admin/reviews.ejs", {
        layout: "layouts/admin",
        active: "reviews",
        pageTitle: "Reviews",
        pageSubtitle: "Quality & feedback monitoring",
        reviews: latest,
        query: { q, minRating: req.query.minRating || "" },
    });
};

module.exports.deleteReview = async (req, res) => {
    const { reviewId } = req.params;
    if (!reviewId) throw new ExpressError(400, "Missing review id");

    await Listing.updateMany({ reviews: reviewId }, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review deleted.");
    res.redirect(req.get("Referrer") || "/admin/reviews");
};

module.exports.payments = async (req, res) => {
    const q = (req.query.q || "").trim();
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const status = (req.query.status || req.query.payment || "").trim();

    const filter = {};
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lte = to;
    }
    if (status) filter.paymentStatus = status;

    if (q) {
        filter.$or = [
            { razorpayOrderId: { $regex: q, $options: "i" } },
            { paymentId: { $regex: q, $options: "i" } },
        ];
    }

    const [summaryAgg, rows] = await Promise.all([
        Booking.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    processed: {
                        $sum: {
                            $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$finalAmount", 0],
                        },
                    },
                    refunded: {
                        $sum: {
                            $cond: [{ $eq: ["$paymentStatus", "refunded"] }, "$finalAmount", 0],
                        },
                    },
                    failedCount: {
                        $sum: {
                            $cond: [{ $eq: ["$paymentStatus", "failed"] }, 1, 0],
                        },
                    },
                },
            },
        ]),
        Booking.find(filter)
            .sort({ createdAt: -1 })
            .limit(200)
            .populate({ path: "user", select: "username email" })
            .populate({ path: "listing", select: "title" })
            .lean(),
    ]);

    const summary = summaryAgg?.[0] || { processed: 0, refunded: 0, failedCount: 0 };

    const now = new Date();
    const from30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const paymentStatusCounts = await analytics.getPaymentStatusCounts({ from: from30, to: now });

    res.render("admin/payments.ejs", {
        layout: "layouts/admin",
        active: "payments",
        pageTitle: "Payments",
        pageSubtitle: "Processed, refunded, failed transactions",
        summary,
        rows,
        paymentStatusCounts,
        query: { q, from: req.query.from || "", to: req.query.to || "", status },
    });
};

module.exports.paymentsCsv = async (req, res) => {
    const filter = {};
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lte = to;
    }
    if (req.query.status) filter.paymentStatus = req.query.status;

    const rows = await Booking.find(filter)
        .sort({ createdAt: -1 })
        .limit(2000)
        .populate({ path: "user", select: "username email" })
        .populate({ path: "listing", select: "title" })
        .lean();

    const csvRows = [
        ["bookingId", "createdAt", "listing", "user", "email", "finalAmount", "paymentStatus", "orderId", "paymentId", "refundId"],
        ...rows.map((b) => [
            b._id,
            b.createdAt,
            b.listing?.title || "",
            b.user?.username || "",
            b.user?.email || "",
            b.finalAmount || 0,
            b.paymentStatus || "",
            b.razorpayOrderId || "",
            b.paymentId || "",
            b.refundId || "",
        ]),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="payments_${Date.now()}.csv"`);
    return res.send(toCSV(csvRows));
};

module.exports.updateBookingStatus = async (req, res) => {
    const { bookingId } = req.params;
    const { status } = req.body;
    if (!bookingId) throw new ExpressError(400, "Missing booking id");
    if (!status || !["confirmed", "cancelled"].includes(status)) {
        throw new ExpressError(400, "Invalid booking status");
    }

    await Booking.findByIdAndUpdate(bookingId, { bookingStatus: status });
    req.flash("success", "Booking status updated.");
    res.redirect(req.get("Referrer") || "/admin/bookings");
};

module.exports.refundBooking = async (req, res) => {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ExpressError(404, "Booking not found");

    if (booking.paymentStatus !== "paid" || !booking.paymentId) {
        throw new ExpressError(400, "Refund requires a paid booking with paymentId");
    }

    const razorpay = getRazorpayClient();
    const amount = Math.round(Number(booking.finalAmount || 0) * 100);
    const refund = await razorpay.payments.refund(booking.paymentId, { amount });

    booking.paymentStatus = "refunded";
    booking.bookingStatus = "cancelled";
    booking.refundId = refund?.id;
    await booking.save({ validateBeforeSave: false });

    req.flash("success", "Refund initiated.");
    res.redirect("/admin/payments");
};

module.exports.forceCancelBooking = async (req, res) => {
    const { bookingId } = req.params;
    if (!bookingId) throw new ExpressError(400, "Missing booking id");
    await Booking.findByIdAndUpdate(bookingId, { bookingStatus: "cancelled" });
    req.flash("success", "Booking force-cancelled.");
    res.redirect("back");
};

module.exports.userProfile = async (req, res) => {
    const { userId } = req.params;
    if (!userId) throw new ExpressError(400, "Missing user id");

    const user = await User.findById(userId).select("username email role").lean();
    if (!user) throw new ExpressError(404, "User not found");

    const bookings = await Booking.find({ user: user._id })
        .sort({ createdAt: -1 })
        .populate({ path: "listing", select: "title" })
        .lean();

    res.render("admin/user.ejs", { user, bookings });
};

module.exports.updateUserRole = async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;
    if (!role || !["user", "admin"].includes(role)) throw new ExpressError(400, "Invalid role");
    await User.findByIdAndUpdate(userId, { role });
    req.flash("success", "User role updated.");
    res.redirect("/admin/users");
};

module.exports.toggleUserBlock = async (req, res) => {
    const { userId } = req.params;
    const u = await User.findById(userId);
    if (!u) throw new ExpressError(404, "User not found");
    u.isBlocked = !u.isBlocked;
    await u.save();
    req.flash("success", u.isBlocked ? "User blocked." : "User unblocked.");
    res.redirect("/admin/users");
};

module.exports.deleteUser = async (req, res) => {
    const { userId } = req.params;
    await User.findByIdAndDelete(userId);
    req.flash("success", "User deleted.");
    res.redirect("/admin/users");
};

module.exports.listings = async (req, res) => {
    const rows = await Listing.aggregate([
        { $sort: { _id: -1 } },
        { $limit: 200 },
        {
            $lookup: {
                from: "bookings",
                localField: "_id",
                foreignField: "listing",
                as: "bookings",
            },
        },
        {
            $addFields: {
                bookingCount: {
                    $size: {
                        $filter: {
                            input: "$bookings",
                            as: "b",
                            cond: { $eq: ["$$b.paymentStatus", "paid"] },
                        },
                    },
                },
                revenue: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$bookings",
                                    as: "b",
                                    cond: { $eq: ["$$b.paymentStatus", "paid"] },
                                },
                            },
                            as: "b",
                            in: "$$b.finalAmount",
                        },
                    },
                },
            },
        },
        { $project: { bookings: 0 } },
    ]);

    res.render("admin/listings.ejs", {
        layout: "layouts/admin",
        active: "listings",
        pageTitle: "Listings",
        pageSubtitle: "Performance & status",
        listings: rows,
    });
};

module.exports.toggleListingActive = async (req, res) => {
    const { listingId } = req.params;
    const listing = await Listing.findById(listingId);
    if (!listing) throw new ExpressError(404, "Listing not found");
    listing.isActive = listing.isActive === false ? true : false;
    await listing.save();
    req.flash("success", listing.isActive ? "Listing activated." : "Listing deactivated.");
    res.redirect("/admin/listings");
};
