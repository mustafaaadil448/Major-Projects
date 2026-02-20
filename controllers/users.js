const User = require("../models/user.js");
const { signToken } = require("../utils/jwt.js");

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

function resolveRequestedRole({ role, adminKey }) {
    if (role !== "admin") return "user";
    return "admin";
}

function wantsJson(req) {
    const accept = String(req.get("accept") || "").toLowerCase();
    return accept.includes("application/json") || req.xhr;
}

function jsonOk(res, extra) {
    return res.json({ success: true, ...(extra || {}) });
}

function jsonFail(res, statusCode, message) {
    return res.status(statusCode || 400).json({ success: false, message: message || "Request failed" });
}

function looksLikeEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

module.exports.renderSignupForm = (req, res) => {
    res.render("users/signup.ejs")
};

module.exports.coerceEmailToUsername = async (req, res, next) => {
    try {
        const raw = (req.body?.username || "").toString().trim();
        // If user typed an email in the username field, map to actual username for passport-local-mongoose.
        const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
        if (!looksLikeEmail) return next();

        const email = raw.toLowerCase();
        const user = await User.findOne({ email });
        if (user && user.username) {
            req.body.username = user.username;
        }
        return next();
    } catch (e) {
        return next(e);
    }
};

module.exports.signup = async(req,res,next) => {
    try {
    let {username, email, password, confirmPassword, role} = req.body;

    username = (username || "").toString().trim();
    email = (email || "").toString().trim().toLowerCase();
    password = (password || "").toString();
    confirmPassword = (confirmPassword || "").toString();

    if (!username) {
        req.flash("error", "Username is required.");
        return res.redirect("/signup");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        req.flash("error", "Please enter a valid email address.");
        return res.redirect("/signup");
    }
    if (!password) {
        req.flash("error", "Password is required.");
        return res.redirect("/signup");
    }
    if (password !== confirmPassword) {
        req.flash("error", "Passwords do not match.");
        return res.redirect("/signup");
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
        req.flash("error", "Email already registered. Please log in.");
        return res.redirect("/login");
    }

    const resolvedRole = resolveRequestedRole({ role });
    const newUser = new User({email, username, role: resolvedRole});
    const registerUser = await User.register(newUser, password);
    console.log(registerUser);
    req.login(registerUser, (err) => {
        if(err) {
            return next(err);
        }

        // JWT includes: { id, role }
        const token = signToken(registerUser);
        setAuthCookie(req, res, token);

        req.flash("success", "Welcome to StayEase Pvt.Ltd.! ");
        res.redirect("/");
    });
    
    } catch (e) {
        req.flash("error", e.message);
        res.redirect("/signup");
    }
};

module.exports.signupPasswordJson = async (req, res) => {
    try {
        const username = (req.body?.username || "").toString().trim();
        const email = (req.body?.email || "").toString().trim().toLowerCase();
        const password = (req.body?.password || "").toString();
        const confirmPassword = (req.body?.confirmPassword || "").toString();
        const role = (req.body?.role || "user").toString();

        if (!username) return jsonFail(res, 400, "Username is required.");
        if (!email || !looksLikeEmail(email)) return jsonFail(res, 400, "Please enter a valid email address.");
        if (!password) return jsonFail(res, 400, "Password is required.");
        if (password !== confirmPassword) return jsonFail(res, 400, "Passwords do not match.");

        const existingEmail = await User.findOne({ email });
        if (existingEmail) return jsonFail(res, 409, "Email already registered. Please log in.");

        const resolvedRole = resolveRequestedRole({ role });
        const newUser = new User({ email, username, role: resolvedRole });
        const registerUser = await User.register(newUser, password);

        const token = signToken(registerUser);
        setAuthCookie(req, res, token);

        return jsonOk(res, { userId: registerUser._id.toString(), role: registerUser.role });
    } catch (e) {
        return jsonFail(res, 400, e?.message || "Unable to sign up.");
    }
};

module.exports.renderLoginForm = (req, res) => {
    res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
    // Passport has already authenticated and populated req.user
    const token = signToken(req.user);
    setAuthCookie(req, res, token);

    req.flash("success","Welcome back to StayEase Pvt.Ltd.! ");
    let redirectUrl = res.locals.redirectUrl || "/";
    res.redirect(redirectUrl);
    };

module.exports.loginPasswordJson = async (req, res) => {
    try {
        const identifierRaw = (req.body?.identifier || req.body?.email || req.body?.username || "").toString().trim();
        const password = (req.body?.password || "").toString();
        if (!identifierRaw) return jsonFail(res, 400, "Username or email is required.");
        if (!password) return jsonFail(res, 400, "Password is required.");

        let username = identifierRaw;
        if (looksLikeEmail(identifierRaw)) {
            const user = await User.findOne({ email: identifierRaw.toLowerCase() });
            if (!user) return jsonFail(res, 401, "Invalid username/email or password.");
            username = user.username;
        }

        const authenticate = User.authenticate();
        const { user, error } = await new Promise((resolve) => {
            authenticate(username, password, (err, userObj, info) => {
                if (err) return resolve({ user: null, error: err });
                if (!userObj) return resolve({ user: null, error: new Error(info?.message || "Invalid credentials") });
                return resolve({ user: userObj, error: null });
            });
        });

        if (!user) return jsonFail(res, 401, "Invalid username/email or password.");
        if (user.isBlocked) return jsonFail(res, 403, "Your account has been blocked.");

        const token = signToken(user);
        setAuthCookie(req, res, token);
        return jsonOk(res, { userId: user._id.toString(), role: user.role });
    } catch (e) {
        return jsonFail(res, 500, "Unable to log in.");
    }
};

module.exports.logout = (req,res,next) => {
    req.logout((err) => {
        if(err){
            return next(err);
        }
        res.clearCookie("token");
        req.flash("success", "You are logged out!");
        res.redirect("/");
    });
    };