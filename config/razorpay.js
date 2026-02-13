const Razorpay = require("razorpay");
const dotenv = require("dotenv");

// Ensure env is loaded even if this module is imported standalone (scripts/tests)
dotenv.config();

const key_id = process.env.RAZORPAY_KEY_ID;
const key_secret = process.env.RAZORPAY_KEY_SECRET;

if (!key_id || !key_secret) {
    throw new Error("Razorpay keys missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
}

const razorpay = new Razorpay({ key_id, key_secret });

module.exports = razorpay;
