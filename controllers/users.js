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

module.exports.renderSignupForm = (req, res) => {
    res.render("users/signup.ejs")
};
module.exports.signup = async(req,res,next) => {
    try {
    let {username, email, password, role} = req.body;
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

        req.flash("success", "Welcome to StayEase Pvt. Ltd.! ");
        res.redirect("/");
    });
    
    } catch (e) {
        req.flash("error", e.message);
        res.redirect("/signup");
    }
};

module.exports.renderLoginForm = (req, res) => {
    res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
    // Passport has already authenticated and populated req.user
    const token = signToken(req.user);
    setAuthCookie(req, res, token);

    req.flash("success","Welcome back to StayEase Pvt. Ltd.! ");
    let redirectUrl = res.locals.redirectUrl || "/";
    res.redirect(redirectUrl);
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