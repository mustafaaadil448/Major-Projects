const express = require("express");
const passport = require("passport");

const { signToken } = require("../utils/jwt");
const { configureSocialPassport } = require("../config/passport");

const router = express.Router();

// Ensure strategies are registered once this router is used.
configureSocialPassport();

function isHttpsRequest(req) {
    if (req.secure) return true;
    const proto = req.headers["x-forwarded-proto"];
    return typeof proto === "string" && proto.split(",")[0].trim() === "https";
}

function setAuthCookie(req, res, token) {
    res.cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttpsRequest(req),
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}

function safeHomeRedirect(res, opts) {
    const openAuth = opts && opts.openAuth;
    return res.redirect(openAuth ? "/?auth=login" : "/");
}

function isGoogleConfigured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isFacebookConfigured() {
    return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

router.get("/auth/google", (req, res, next) => {
    if (!isGoogleConfigured()) return safeHomeRedirect(res, { openAuth: true });
    return passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })(req, res, next);
});

router.get(
    "/auth/google/callback",
    (req, res, next) => {
        if (!isGoogleConfigured()) return safeHomeRedirect(res, { openAuth: true });
        return passport.authenticate("google", { failureRedirect: "/?auth=login" })(req, res, next);
    },
    (req, res) => {
        try {
            if (!req.user) return safeHomeRedirect(res, { openAuth: true });
            const token = signToken(req.user);
            setAuthCookie(req, res, token);
            return safeHomeRedirect(res);
        } catch (e) {
            return safeHomeRedirect(res, { openAuth: true });
        }
    }
);

router.get("/auth/facebook", (req, res, next) => {
    if (!isFacebookConfigured()) return safeHomeRedirect(res, { openAuth: true });
    return passport.authenticate("facebook", { scope: ["public_profile", "email"] })(req, res, next);
});

router.get(
    "/auth/facebook/callback",
    (req, res, next) => {
        if (!isFacebookConfigured()) return safeHomeRedirect(res, { openAuth: true });
        return passport.authenticate("facebook", { failureRedirect: "/?auth=login" })(req, res, next);
    },
    (req, res) => {
        try {
            if (!req.user) return safeHomeRedirect(res, { openAuth: true });
            const token = signToken(req.user);
            setAuthCookie(req, res, token);
            return safeHomeRedirect(res);
        } catch (e) {
            return safeHomeRedirect(res, { openAuth: true });
        }
    }
);

// Apple placeholder: route exists so the button can be wired now,
// but real Apple Sign-In will be added later.
router.get("/auth/apple", (_req, res) => {
    return safeHomeRedirect(res, { openAuth: true });
});

module.exports = router;
