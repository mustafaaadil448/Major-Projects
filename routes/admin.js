const express = require("express");
const router = express.Router();
const { isLoggedIn, isAdmin } = require("../middleware.js");
const adminController = require("../controllers/admin.js");

// Admin dashboard
router.get("/admin", isLoggedIn, isAdmin, adminController.dashboard);

module.exports = router;
