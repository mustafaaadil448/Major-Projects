const crypto = require("crypto");
const mongoose = require("mongoose");

const Booking = require("../models/booking.js");
const ExpressError = require("../utils/ExpressError.js");
const { getRazorpayClient } = require("../utils/razorpay.js");

function assertBookingAccess(req, booking) {
    const isAdmin = req.user?.role === "admin";
    const isOwner = booking.user?.toString?.() === req.user?._id?.toString?.();
    if (!isOwner && !isAdmin) {
        throw new ExpressError(403, "Not allowed");
    }
}

module.exports.createOrder = async (req, res) => {
    const { bookingId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(400, "Invalid bookingId");
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
        throw new ExpressError(404, "Booking not found");
    }

    assertBookingAccess(req, booking);

    if (booking.paymentStatus === "paid") {
        throw new ExpressError(409, "Booking already paid");
    }

    const finalAmount = Number(booking.finalAmount || 0);
    const amount = Math.round(finalAmount * 100); // paise

    if (!Number.isFinite(amount) || amount < 100) {
        throw new ExpressError(400, "Invalid amount");
    }

    if (process.env.NODE_ENV !== "production") {
        console.log("[RZP] key:", process.env.RAZORPAY_KEY_ID);
        console.log("[RZP] bookingId:", bookingId, "amountPaise:", amount);
    }

    let razorpay;
    try {
        razorpay = getRazorpayClient();
    } catch (e) {
        throw new ExpressError(500, e?.message || "Razorpay is not configured");
    }

    try {
        const order = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: String(bookingId),
            payment_capture: 1,
        });

        if (process.env.NODE_ENV !== "production") {
            console.log("[RZP] order response:", { id: order.id, amount: order.amount, currency: order.currency });
        }

        booking.razorpayOrderId = order.id;
        await booking.save({ validateBeforeSave: false });

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            key: process.env.RAZORPAY_KEY_ID,
        });
    } catch (e) {
        if (process.env.NODE_ENV !== "production") {
            console.log("[RZP] create order error:", e?.message || e);
        }
        throw new ExpressError(502, `Failed to create Razorpay order: ${e?.message || "Razorpay error"}`);
    }
};

module.exports.verifyPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(400, "Invalid bookingId");
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
        throw new ExpressError(404, "Booking not found");
    }

    assertBookingAccess(req, booking);

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
        throw new ExpressError(500, "Razorpay secret missing");
    }

    const generated_signature = crypto
        .createHmac("sha256", secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

    if (process.env.NODE_ENV !== "production") {
        console.log("[RZP] verify:", {
            bookingId,
            razorpay_order_id,
            razorpay_payment_id,
            match: generated_signature === razorpay_signature,
        });
    }

    if (generated_signature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: "Signature mismatch" });
    }

    booking.paymentId = razorpay_payment_id;
    booking.razorpayOrderId = razorpay_order_id;
    booking.paymentStatus = "paid";
    booking.bookingStatus = "confirmed";
    await booking.save({ validateBeforeSave: false });

    return res.json({ success: true });
};
