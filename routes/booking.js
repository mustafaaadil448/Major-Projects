const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const ExpressError = require("../utils/ExpressError.js");
const { bookingSchema } = require("../schema.js");
const { verifyToken } = require("../middleware.js");
const bookingsController = require("../controllers/bookings.js");

function validateBooking(req, res, next) {
    const { error } = bookingSchema.validate(req.body);
    if (error) {
        const errMsg = error.details.map((el) => el.message).join(",");
        return next(new ExpressError(400, errMsg));
    }
    return next();
}

// Booking history (User: own bookings, Admin: all bookings)
router.get("/bookings", verifyToken, wrapAsync(bookingsController.indexMyBookings));

// Cancel booking (upcoming only)
router.post("/bookings/:bookingId/cancel", verifyToken, wrapAsync(bookingsController.cancelBooking));

// Invoice (paid bookings only)
router.get("/bookings/:bookingId/invoice", verifyToken, wrapAsync(bookingsController.renderInvoice));

// Premium booking wizard
router.get("/booking/:listingId", verifyToken, wrapAsync(bookingsController.renderBookingPage));

// Create pending booking + Razorpay order
router.post(
    "/booking/:listingId/create",
    verifyToken,
    validateBooking,
    wrapAsync(bookingsController.createPendingBookingAndOrder)
);

// Payment page
router.get("/payment/:bookingId", verifyToken, wrapAsync(bookingsController.renderPaymentPage));

// Payment verification
router.post("/payment/verify", verifyToken, wrapAsync(bookingsController.verifyPayment));

// Mark failure from frontend
router.post("/payment/failure", verifyToken, wrapAsync(bookingsController.markPaymentFailed));

router.get("/booking-success", verifyToken, wrapAsync(bookingsController.renderBookingSuccess));
router.get("/booking-failed", verifyToken, wrapAsync(bookingsController.renderBookingFailed));

module.exports = router;
