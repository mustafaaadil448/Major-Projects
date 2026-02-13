const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");

function toObjectId(id) {
    return typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;
}

function floorDate(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function getRangeWindow(rangeKey) {
    const now = new Date();
    if (rangeKey === "7d") return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now, bucket: "day" };
    if (rangeKey === "30d") return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now, bucket: "day" };
    return { from: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), to: now, bucket: "month" }; // 12m
}

function formatSeriesBuckets({ from, to, bucket }) {
    const labels = [];
    const start = floorDate(from);
    const end = floorDate(to);

    if (bucket === "day") {
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            labels.push(d.toISOString().slice(0, 10));
        }
        return labels;
    }

    // month
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endMonth) {
        labels.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return labels;
}

function percentChange(current, previous) {
    if (!previous) return current ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

async function getKpis() {
    const now = new Date();
    const last30From = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30From = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
        totalUsers,
        totalListings,
        totalBookings,
        revenueAgg,
        pendingPayments,
        paidLast30Agg,
        paidPrev30Agg,
        totalLast30Agg,
    ] = await Promise.all([
        User.countDocuments({}),
        Listing.countDocuments({}),
        Booking.countDocuments({}),
        Booking.aggregate([
            { $match: { paymentStatus: "paid" } },
            { $group: { _id: null, revenue: { $sum: "$finalAmount" } } },
        ]),
        Booking.countDocuments({ paymentStatus: "pending" }),
        Booking.aggregate([
            { $match: { paymentStatus: "paid", createdAt: { $gte: last30From } } },
            { $group: { _id: null, count: { $sum: 1 } } },
        ]),
        Booking.aggregate([
            { $match: { paymentStatus: "paid", createdAt: { $gte: prev30From, $lt: last30From } } },
            { $group: { _id: null, count: { $sum: 1 } } },
        ]),
        Booking.aggregate([
            { $match: { createdAt: { $gte: last30From } } },
            { $group: { _id: null, count: { $sum: 1 } } },
        ]),
    ]);

    const totalRevenue = revenueAgg?.[0]?.revenue || 0;
    const paidLast30 = paidLast30Agg?.[0]?.count || 0;
    const paidPrev30 = paidPrev30Agg?.[0]?.count || 0;
    const totalLast30 = totalLast30Agg?.[0]?.count || 0;

    const conversionRate = totalLast30 ? Math.round((paidLast30 / totalLast30) * 100) : 0;

    return {
        totalRevenue,
        totalBookings,
        totalListings,
        totalUsers,
        conversionRate,
        pendingPayments,
        trends: {
            paidBookingsPct: percentChange(paidLast30, paidPrev30),
        },
    };
}

async function getPaymentStatusCounts({ from, to }) {
    const rows = await Booking.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$paymentStatus", count: { $sum: 1 } } },
    ]);
    const map = Object.fromEntries(rows.map((r) => [r._id || "unknown", r.count]));
    return {
        paid: map.paid || 0,
        pending: map.pending || 0,
        failed: map.failed || 0,
        refunded: map.refunded || 0,
    };
}

async function getRevenueSeries(rangeKey) {
    const { from, to, bucket } = getRangeWindow(rangeKey);
    const labels = formatSeriesBuckets({ from, to, bucket });

    const groupId =
        bucket === "day"
            ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
            : { $dateToString: { format: "%Y-%m", date: "$createdAt" } };

    const rows = await Booking.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: groupId, revenue: { $sum: "$finalAmount" } } },
        { $sort: { _id: 1 } },
    ]);

    const map = Object.fromEntries(rows.map((r) => [r._id, r.revenue]));
    const data = labels.map((k) => map[k] || 0);

    return { from, to, bucket, labels, data };
}

async function getUserGrowthSeries(rangeKey) {
    const { from, to, bucket } = getRangeWindow(rangeKey);
    const labels = formatSeriesBuckets({ from, to, bucket });

    // User schema doesn't have timestamps; derive created date from ObjectId.
    const createdAtExpr = { $toDate: "$_id" };
    const groupId =
        bucket === "day"
            ? { $dateToString: { format: "%Y-%m-%d", date: createdAtExpr } }
            : { $dateToString: { format: "%Y-%m", date: createdAtExpr } };

    const rows = await User.aggregate([
        { $addFields: { _createdAt: createdAtExpr } },
        { $match: { _createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: groupId, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]);

    const map = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    const data = labels.map((k) => map[k] || 0);

    return { labels, data };
}

async function getBookingTrends(rangeKey) {
    const { from, to, bucket } = getRangeWindow(rangeKey);
    const labels = formatSeriesBuckets({ from, to, bucket });

    const groupId =
        bucket === "day"
            ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
            : { $dateToString: { format: "%Y-%m", date: "$createdAt" } };

    const rows = await Booking.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
            $group: {
                _id: groupId,
                confirmed: {
                    $sum: {
                        $cond: [{ $eq: ["$bookingStatus", "confirmed"] }, 1, 0],
                    },
                },
                cancelled: {
                    $sum: {
                        $cond: [{ $eq: ["$bookingStatus", "cancelled"] }, 1, 0],
                    },
                },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    const map = Object.fromEntries(rows.map((r) => [r._id, r]));
    const confirmed = labels.map((k) => map[k]?.confirmed || 0);
    const cancelled = labels.map((k) => map[k]?.cancelled || 0);

    return { labels, confirmed, cancelled };
}

async function getTopListings(rangeKey) {
    const { from, to } = getRangeWindow(rangeKey);
    const rows = await Booking.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$listing", bookings: { $sum: 1 }, revenue: { $sum: "$finalAmount" } } },
        { $sort: { bookings: -1 } },
        { $limit: 8 },
        {
            $lookup: {
                from: "listings",
                localField: "_id",
                foreignField: "_id",
                as: "listing",
            },
        },
        { $unwind: { path: "$listing", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                listingId: "$_id",
                title: "$listing.title",
                bookings: 1,
                revenue: 1,
            },
        },
    ]);

    return rows;
}

async function getInsights() {
    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prev7 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [thisWeek, prevWeek] = await Promise.all([
        Booking.countDocuments({ createdAt: { $gte: last7 } }),
        Booking.countDocuments({ createdAt: { $gte: prev7, $lt: last7 } }),
    ]);

    const bookingsDelta = percentChange(thisWeek, prevWeek);

    const pendingSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pendingOver24h = await Booking.countDocuments({ paymentStatus: "pending", createdAt: { $lt: pendingSince } });

    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const activeListings = await Listing.find({}, { _id: 1 }).lean();
    const bookedListings = await Booking.distinct("listing", {
        paymentStatus: "paid",
        createdAt: { $gte: last30 },
    });

    const bookedSet = new Set(bookedListings.map((x) => x.toString()));
    const noBookingsLast30 = activeListings.filter((l) => !bookedSet.has(l._id.toString())).length;

    const insights = [];
    insights.push({
        kind: "trend",
        text: `Bookings ${bookingsDelta >= 0 ? "increased" : "decreased"} by ${Math.abs(bookingsDelta)}% this week`,
    });
    insights.push({
        kind: "warning",
        text: `${noBookingsLast30} listings have no bookings in last 30 days`,
    });
    insights.push({
        kind: "alert",
        text: `${pendingOver24h} payments pending for more than 24 hours`,
    });

    return insights;
}

async function getRecentActivity() {
    const bookings = await Booking.find({})
        .sort({ updatedAt: -1 })
        .limit(12)
        .populate({ path: "listing", select: "title" })
        .populate({ path: "user", select: "username" })
        .lean();

    return bookings.map((b) => {
        let icon = "fa-receipt";
        let text = "Booking updated";

        if (b.paymentStatus === "paid" && b.bookingStatus === "confirmed") {
            icon = "fa-circle-check";
            text = `${b.user?.username || "User"} booking confirmed for ${b.listing?.title || "listing"}`;
        } else if (b.paymentStatus === "pending") {
            icon = "fa-hourglass-half";
            text = `${b.user?.username || "User"} started checkout for ${b.listing?.title || "listing"}`;
        } else if (b.paymentStatus === "failed") {
            icon = "fa-circle-xmark";
            text = `Payment failed for ${b.listing?.title || "listing"}`;
        } else if (b.paymentStatus === "refunded") {
            icon = "fa-rotate-left";
            text = `Refund processed for ${b.listing?.title || "listing"}`;
        } else if (b.bookingStatus === "cancelled") {
            icon = "fa-ban";
            text = `Booking cancelled for ${b.listing?.title || "listing"}`;
        }

        return {
            icon,
            text,
            at: b.updatedAt || b.createdAt,
        };
    });
}

module.exports = {
    getKpis,
    getRevenueSeries,
    getBookingTrends,
    getTopListings,
    getUserGrowthSeries,
    getPaymentStatusCounts,
    getInsights,
    getRecentActivity,
    toObjectId,
};
