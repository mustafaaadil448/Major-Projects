const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const ExpressError = require("../utils/ExpressError.js");
const crypto = require("crypto");
const { getRazorpayClient } = require("../utils/razorpay.js");

function daysBetween(checkInDate, checkOutDate) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);

    // Normalize to midnight to avoid DST/timezone surprises
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return Math.round((end - start) / msPerDay);
}

function normalizeToMidnight(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function computeAmounts({ nights, pricePerNight }) {
    const totalAmount = nights * pricePerNight;
    const taxAmount = Math.round(totalAmount * 0.05);
    const finalAmount = totalAmount + taxAmount;
    return { totalAmount, taxAmount, finalAmount };
}

function getMissingBookingFields(booking) {
    if (!booking) return ["booking"];
    const missing = [];

    if (!booking.guestName) missing.push("guestName");
    if (booking.age == null) missing.push("age");
    if (!booking.mobile) missing.push("mobile");
    if (!booking.email) missing.push("email");

    if (booking.nights == null) missing.push("nights");
    if (booking.pricePerNight == null) missing.push("pricePerNight");
    if (booking.totalAmount == null) missing.push("totalAmount");
    if (booking.taxAmount == null) missing.push("taxAmount");
    if (booking.finalAmount == null) missing.push("finalAmount");

    return missing;
}

module.exports.indexMyBookings = async (req, res) => {
    const isAdmin = req.user?.role === "admin";
    const query = isAdmin ? {} : { user: req.user._id };

    let q = Booking.find(query)
        .sort({ createdAt: -1 })
        .populate({ path: "listing", select: "title location country image price" });

    if (isAdmin) {
        q = q.populate({ path: "user", select: "username email role" });
    }

    const bookings = await q.lean();

    res.render("bookings/index.ejs", { bookings, isAdmin });
};

module.exports.cancelBooking = async (req, res) => {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(400, "Invalid booking id");
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ExpressError(404, "Booking not found");

    const isOwner = booking.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) throw new ExpressError(403, "Not allowed");

    const today = normalizeToMidnight(new Date());
    const checkIn = normalizeToMidnight(booking.checkInDate);
    if (checkIn < today) {
        req.flash("error", "You can only cancel upcoming bookings.");
        return res.redirect("/bookings");
    }

    if (booking.bookingStatus === "cancelled") {
        req.flash("success", "Booking already cancelled.");
        return res.redirect("/bookings");
    }

    booking.bookingStatus = "cancelled";
    await booking.save({ validateBeforeSave: false });
    req.flash("success", "Booking cancelled.");
    return res.redirect("/bookings");
};

module.exports.renderInvoice = async (req, res) => {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(400, "Invalid booking id");
    }

    const booking = await Booking.findById(bookingId)
        .populate({ path: "listing", select: "title" })
        .lean();
    if (!booking) throw new ExpressError(404, "Booking not found");

    const isOwner = booking.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) throw new ExpressError(403, "Not allowed");

    if (booking.paymentStatus !== "paid") {
        throw new ExpressError(403, "Invoice is available only for paid bookings");
    }

    res.render("bookings/invoice.ejs", { booking });
};

module.exports.renderBookingPage = async (req, res) => {
    const { listingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
        throw new ExpressError(400, "Invalid listing id");
    }

    const listing = await Listing.findById(listingId)
        .select("title price location country image")
        .lean();
    if (!listing) {
        throw new ExpressError(404, "Listing not found");
    }

    // Provide already-booked ranges (confirmed + paid)
    const booked = await Booking.find({
        listing: listing._id,
        bookingStatus: "confirmed",
        paymentStatus: "paid",
    })
        .select("checkInDate checkOutDate")
        .lean();

    res.render("bookings/new.ejs", {
        listing,
        bookedRanges: booked,
        currentUser: req.user,
    });
};

module.exports.createPendingBookingAndOrder = async (req, res) => {
    const { listingId } = req.params;
    // Re-validate and normalize payload (prevents empty/undefined values reaching Mongoose).
    const { bookingSchema } = require("../schema.js");
    const { error, value } = bookingSchema.validate(req.body, {
        abortEarly: false,
        convert: true,
        stripUnknown: true,
    });
    if (error) {
        const errMsg = error.details.map((el) => el.message).join(", ");
        throw new ExpressError(400, errMsg);
    }

    const { guestName, age, mobile, email, checkInDate, checkOutDate } = value.booking;

    if (!mongoose.Types.ObjectId.isValid(listingId)) {
        throw new ExpressError(400, "Invalid listing id");
    }

    const listing = await Listing.findById(listingId).select("price title");
    if (!listing) {
        throw new ExpressError(404, "Listing not found");
    }

    const today = normalizeToMidnight(new Date());
    const newCheckIn = normalizeToMidnight(checkInDate);
    const newCheckOut = normalizeToMidnight(checkOutDate);

    if (newCheckIn < today) {
        throw new ExpressError(400, "Check-in date cannot be in the past");
    }

    const nights = daysBetween(newCheckIn, newCheckOut);
    if (!Number.isFinite(nights) || nights <= 0) {
        throw new ExpressError(400, "Check-out date must be after check-in date");
    }

    // Block if confirmed+paid overlaps OR a very recent pending payment overlaps (15 min hold)
    const holdSince = new Date(Date.now() - 15 * 60 * 1000);
    const conflict = await Booking.findOne({
        listing: listing._id,
        checkInDate: { $lt: newCheckOut },
        checkOutDate: { $gt: newCheckIn },
        $or: [
            { bookingStatus: "confirmed", paymentStatus: "paid" },
            { bookingStatus: "pending", paymentStatus: "pending", createdAt: { $gte: holdSince } },
        ],
    }).select("_id");

    if (conflict) {
        req.flash("error", "Selected dates are not available for this listing.");
        return res.redirect(`/booking/${listing._id}`);
    }

    const pricePerNight = Number(listing.price || 0);
    const { totalAmount, taxAmount, finalAmount } = computeAmounts({ nights, pricePerNight });

    const booking = await Booking.create({
        user: req.user._id,
        listing: listing._id,
        guestName,
        age,
        mobile,
        email,
        checkInDate: newCheckIn,
        checkOutDate: newCheckOut,
        nights,
        pricePerNight,
        totalAmount,
        taxAmount,
        finalAmount,
        paymentStatus: "pending",
        bookingStatus: "pending",
    });

    return res.redirect(`/payment/${booking._id.toString()}`);
};

module.exports.renderPaymentPage = async (req, res) => {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(400, "Invalid booking id");
    }
    const booking = await Booking.findById(bookingId)
        .populate({ path: "listing", select: "title" })
        .lean();
    if (!booking) {
        throw new ExpressError(404, "Booking not found");
    }
    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
        throw new ExpressError(403, "Not allowed");
    }
    if (booking.paymentStatus === "paid") {
        return res.redirect(`/booking-success?bookingId=${booking._id.toString()}`);
    }

    const missing = getMissingBookingFields(booking);
    if (missing.length) {
        req.flash("error", "Booking details are incomplete. Please re-enter your guest/stay details and try again.");
        const listingId = booking.listing?._id || booking.listing;
        return res.redirect(listingId ? `/booking/${listingId}` : "/bookings");
    }

    res.render("bookings/payment.ejs", {
        booking,
    });
};

module.exports.verifyPayment = async (req, res) => {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(400, "Invalid booking id");
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
        throw new ExpressError(404, "Booking not found");
    }
    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
        throw new ExpressError(403, "Not allowed");
    }

    const missing = getMissingBookingFields(booking);
    if (missing.length) {
        req.flash("error", "Booking details are incomplete. Please re-create the booking and try payment again.");
        return res.redirect(booking.listing ? `/booking/${booking.listing.toString()}` : "/bookings");
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
        throw new ExpressError(500, "Razorpay secret missing");
    }

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

    if (expected !== razorpay_signature) {
        booking.paymentStatus = "failed";
        booking.bookingStatus = "cancelled";
        await booking.save({ validateBeforeSave: false });
        return res.redirect(`/booking-failed?bookingId=${booking._id.toString()}`);
    }

    booking.paymentId = razorpay_payment_id;
    booking.paymentStatus = "paid";
    booking.bookingStatus = "confirmed";
    booking.razorpayOrderId = razorpay_order_id;
    await booking.save({ validateBeforeSave: false });

    return res.redirect(`/booking-success?bookingId=${booking._id.toString()}`);
};

module.exports.markPaymentFailed = async (req, res) => {
    const { bookingId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ ok: false });
    }
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ ok: false });
    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
        return res.status(403).json({ ok: false });
    }
    booking.paymentStatus = "failed";
    booking.bookingStatus = "cancelled";
    await booking.save({ validateBeforeSave: false });
    return res.json({ ok: true });
};

module.exports.renderBookingSuccess = async (req, res) => {
    const { bookingId } = req.query;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(400, "Invalid booking id");
    }
    const booking = await Booking.findById(bookingId)
        .populate({ path: "listing", select: "title" })
        .lean();
    if (!booking) throw new ExpressError(404, "Booking not found");
    res.render("bookings/success.ejs", { booking });
};

module.exports.renderBookingFailed = async (req, res) => {
    const { bookingId } = req.query;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(400, "Invalid booking id");
    }
    const booking = await Booking.findById(bookingId)
        .populate({ path: "listing", select: "title" })
        .lean();
    if (!booking) throw new ExpressError(404, "Booking not found");
    res.render("bookings/failed.ejs", { booking });
};
