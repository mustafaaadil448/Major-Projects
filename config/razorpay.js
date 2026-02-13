const dotenv = require("dotenv");

// Ensure env is loaded even if this module is imported standalone (scripts/tests)
dotenv.config();

module.exports = require("../utils/razorpay.js");
