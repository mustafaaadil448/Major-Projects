const express = require("express");
const router = express.Router();

const wrapAsync = require("../utils/wrapAsync.js");
const { verifyToken } = require("../middleware.js");
const paymentController = require("../controllers/payment.js");

router.post("/create-order", verifyToken, wrapAsync(paymentController.createOrder));
router.post("/verify", verifyToken, wrapAsync(paymentController.verifyPayment));

module.exports = router;
