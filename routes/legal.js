const express = require("express");
const router = express.Router();

router.get("/data-deletion", (req, res) => {
    return res.render("pages/data-deletion");
});

module.exports = router;
