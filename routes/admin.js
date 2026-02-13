const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, isAdmin } = require("../middleware.js");
const adminController = require("../controllers/admin.js");

// Admin dashboard
router.get("/admin", isLoggedIn, isAdmin, adminController.dashboard);

// JSON APIs for real-time dashboard updates
router.get("/admin/api/kpis", isLoggedIn, isAdmin, wrapAsync(adminController.kpisApi));
router.get("/admin/api/analytics", isLoggedIn, isAdmin, wrapAsync(adminController.analyticsApi));

// Admin listings management (protected)
router.get("/admin/listings", isLoggedIn, isAdmin, wrapAsync(adminController.listings));
router.post("/admin/listings/:listingId/toggle", isLoggedIn, isAdmin, wrapAsync(adminController.toggleListingActive));

// Premium sections
router.get("/admin/bookings", isLoggedIn, isAdmin, wrapAsync(adminController.bookings));
router.get("/admin/users", isLoggedIn, isAdmin, wrapAsync(adminController.users));
router.get("/admin/reviews", isLoggedIn, isAdmin, wrapAsync(adminController.reviews));
router.delete("/admin/reviews/:reviewId", isLoggedIn, isAdmin, wrapAsync(adminController.deleteReview));
router.get("/admin/payments", isLoggedIn, isAdmin, wrapAsync(adminController.payments));
router.get("/admin/payments.csv", isLoggedIn, isAdmin, wrapAsync(adminController.paymentsCsv));
router.get("/admin/analytics", isLoggedIn, isAdmin, wrapAsync(adminController.analyticsPage));
router.get("/admin/settings", isLoggedIn, isAdmin, wrapAsync(adminController.settings));

// Admin booking management
router.patch(
	"/admin/bookings/:bookingId/status",
	isLoggedIn,
	isAdmin,
	wrapAsync(adminController.updateBookingStatus)
);

router.post(
	"/admin/bookings/:bookingId/refund",
	isLoggedIn,
	isAdmin,
	wrapAsync(adminController.refundBooking)
);

router.post(
	"/admin/bookings/:bookingId/force-cancel",
	isLoggedIn,
	isAdmin,
	wrapAsync(adminController.forceCancelBooking)
);

router.get(
	"/admin/users/:userId",
	isLoggedIn,
	isAdmin,
	wrapAsync(adminController.userProfile)
);

router.post(
	"/admin/users/:userId/role",
	isLoggedIn,
	isAdmin,
	wrapAsync(adminController.updateUserRole)
);

router.post(
	"/admin/users/:userId/block",
	isLoggedIn,
	isAdmin,
	wrapAsync(adminController.toggleUserBlock)
);

router.post(
	"/admin/users/:userId/delete",
	isLoggedIn,
	isAdmin,
	wrapAsync(adminController.deleteUser)
);

module.exports = router;
