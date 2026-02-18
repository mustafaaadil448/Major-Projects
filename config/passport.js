const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const crypto = require("crypto");

const User = require("../models/user");

function sanitizeUsernamePart(v) {
    return String(v || "")
        .toLowerCase()
        .replace(/[^a-z0-9_\.]/g, "")
        .replace(/\.+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 24);
}

async function ensureUniqueUsername(base) {
    const baseClean = sanitizeUsernamePart(base) || "user";
    let candidate = baseClean;

    for (let i = 0; i < 5; i++) {
        const exists = await User.findOne({ username: candidate }).select("_id");
        if (!exists) return candidate;
        const suffix = crypto.randomBytes(2).toString("hex");
        candidate = `${baseClean}_${suffix}`.slice(0, 30);
    }

    return `user_${crypto.randomBytes(4).toString("hex")}`.slice(0, 30);
}

function getGoogleCallbackUrl() {
    return process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback";
}

function getFacebookCallbackUrl() {
    return process.env.FACEBOOK_CALLBACK_URL || "/auth/facebook/callback";
}

function configureSocialPassport() {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (googleClientId && googleClientSecret) {
        passport.use(
            new GoogleStrategy(
                {
                    clientID: googleClientId,
                    clientSecret: googleClientSecret,
                    callbackURL: getGoogleCallbackUrl(),
                },
                async (_accessToken, _refreshToken, profile, done) => {
                    try {
                        const emails = Array.isArray(profile?.emails) ? profile.emails : [];
                        const rawEmail = emails[0]?.value ? String(emails[0].value).trim().toLowerCase() : "";
                        const facebookId = profile?.id ? String(profile.id).trim() : "";
                        // Some Meta apps/configs do not return email even when requested.
                        // Use a stable placeholder to satisfy our schema validation.
                        const email = rawEmail || (facebookId ? `fb_${facebookId}@facebook.local` : "");
                        if (!email) return done(null, false);

                        let user = await User.findOne({ email });
                        if (!user) {
                            const base = email.split("@")[0];
                            const username = await ensureUniqueUsername(base);
                            // Create a user without a local password. This will still work with sessions/JWT.
                            user = await User.create({ email, username, role: "user" });
                        }

                        if (user.isBlocked) return done(null, false);
                        return done(null, user);
                    } catch (e) {
                        return done(e);
                    }
                }
            )
        );
    } else {
        // Do not throw in production; routes will handle "not configured" gracefully.
        // eslint-disable-next-line no-console
        console.warn("[auth] Google OAuth not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing)");
    }

    const fbAppId = process.env.FACEBOOK_APP_ID;
    const fbAppSecret = process.env.FACEBOOK_APP_SECRET;

    if (fbAppId && fbAppSecret) {
        passport.use(
            new FacebookStrategy(
                {
                    clientID: fbAppId,
                    clientSecret: fbAppSecret,
                    callbackURL: getFacebookCallbackUrl(),
                    profileFields: ["id", "displayName", "emails"],
                    enableProof: true,
                },
                async (_accessToken, _refreshToken, profile, done) => {
                    try {
                        const emails = Array.isArray(profile?.emails) ? profile.emails : [];
                        const email = emails[0]?.value ? String(emails[0].value).trim().toLowerCase() : "";
                        if (!email) return done(null, false);

                        let user = await User.findOne({ email });
                        if (!user) {
                            const base = rawEmail ? rawEmail.split("@")[0] : `fb_${facebookId || "user"}`;
                            const username = await ensureUniqueUsername(base);
                            user = await User.create({ email, username, role: "user" });
                        }

                        if (user.isBlocked) return done(null, false);
                        return done(null, user);
                    } catch (e) {
                        return done(e);
                    }
                }
            )
        );
    } else {
        // eslint-disable-next-line no-console
        console.warn("[auth] Facebook OAuth not configured (FACEBOOK_APP_ID/FACEBOOK_APP_SECRET missing)");
    }
}

module.exports = {
    configureSocialPassport,
    getGoogleCallbackUrl,
    getFacebookCallbackUrl,
};
