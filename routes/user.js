const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const passport = require("passport");
const { saveRedirectUrl } = require("../middleware.js");
const userController = require("../controllers/users.js");

//signup routes combined
router.route("/signup")
    .get(userController.renderSignupForm)
    .post(wrapAsync(userController.signup));

// Password auth (JSON) - used by the auth modal
router.post("/api/auth/password-signup", wrapAsync(userController.signupPasswordJson));

    //login routes combined
    router.route("/login")
    .get(userController.renderLoginForm)
    .post(
    saveRedirectUrl,
        wrapAsync(userController.coerceEmailToUsername),
    passport.authenticate("local", {
        failureRedirect: "/login",
        failureFlash: true,
    }),
        wrapAsync(userController.login)
    );

    // Password auth (JSON) - used by the auth modal
    router.post("/api/auth/password-login", wrapAsync(userController.loginPasswordJson));


    // logout user route
    router.get("/logout", userController.logout);
module.exports = router;