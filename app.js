if (process.env.NODE_ENV !== "production") {
    // Load .env from this project directory (not process.cwd())
    require("dotenv").config({ path: require("path").join(__dirname, ".env") });
}
const express = require("express");//importing express
const app = express();//importing express
const mongoose = require("mongoose");// importing mongoose
const path = require("path");//path module
const compression = require("compression");
const cookieParser = require("cookie-parser");
const methodOverride = require("method-override");// importinf method-override
const ejsMate = require("ejs-mate");//importing ejs-mate it help to create layouts and partials of ejs template
const ExpressError = require("./utils/ExpressError.js"); //import ExpressError class to handle errors
const session = require("express-session"); // importing express-session for session mangement
const MongoStore = require("connect-mongo");//importing connect-mongo to store session in mongoDB
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const socialAuthRoutes = require("./routes/socialAuth.js");
const { verifyTokenString } = require("./utils/jwt.js");
const { signToken } = require("./utils/jwt.js");
const router = express.Router({ mergeParams: true });
const NewsletterSubscriber = require("./models/newsletter.js");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
//
const dbUrl = process.env.ATLASDB_URL; //database url

// Needed for correct req.secure / x-forwarded-proto handling behind proxies
app.set("trust proxy", 1);

app.set("view engine", "ejs");//set the view engine tp ejs
app.set("views", path.join(__dirname, "views")); //set the views directory

// Ensure template changes reflect during development
if (process.env.NODE_ENV !== "production") {
    app.disable("view cache");
}

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true})); //for parsing data to url formate
app.use(methodOverride("_method"));// for using put and delete methods
app.engine("ejs", ejsMate); //usign ejs-Mate as the template engine
app.use(cookieParser());
app.use(
    express.static(path.join(__dirname, "public"), {
        maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    })
);

// Silence browser favicon requests if a favicon isn't provided.
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Linux (Render) is case-sensitive: map /css/* to existing public/CSS/*
app.use("/css", express.static(path.join(__dirname, "public", "CSS")));

//session store
const store = MongoStore.create({
    mongoUrl: dbUrl,
    crypto: {
        secret: process.env.SECRET,
    },
    touchAfter: 24 * 3600, // time period in seconds
});
// Log session store errors correctly (avoid duplicate handlers)
store.on("error", (err) => {
    console.log("Error in MONGO SESSION STORE", err);
});

const sessionOptions = {
    secret: process.env.SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};

//using session middleware
app.use(session(sessionOptions)); 
app.use(flash());

//passport configuration
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Social auth routes (Google/Facebook/Apple placeholder)
app.use(socialAuthRoutes);

// If no passport session user exists, try to hydrate from JWT cookie.
app.use(async (req, res, next) => {
    if (req.user) return next();
    const token = req.cookies?.token;
    if (!token) return next();
    try {
        const payload = verifyTokenString(token);
        req.auth = payload;
        req.user = await User.findById(payload.id);
    } catch (e) {
        // ignore invalid/expired token for normal page loads
    }
    return next();
});

//middleware for flash messages
app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currentUser = req.user;
    res.locals.searchQuery = (req.query?.q || "").toString();
    next();
});

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

function maskEmail(email) {
    const s = String(email || "");
    const [user, domain] = s.split("@");
    if (!user || !domain) return s;
    const head = user.slice(0, 2);
    return `${head}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

function maskPhone(phone, countryCode) {
    const digits = String(phone || "").replace(/\D/g, "");
    const cc = String(countryCode || "+91");
    if (digits.length <= 4) return `${cc} ${digits}`;
    const tail = digits.slice(-4);
    return `${cc} ${"*".repeat(Math.max(4, digits.length - 4))}${tail}`;
}

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function jsonOk(res, extra) {
    return res.json({ success: true, ...(extra || {}) });
}

function jsonFail(res, statusCode, message) {
    return res.status(statusCode || 400).json({ success: false, message: message || "Request failed" });
}

function explainSmtpError(err) {
    const raw = String(err?.message || err || "");
    const host = String(process.env.SMTP_HOST || "").toLowerCase();
    const isGmail = host.includes("smtp.gmail.com") || host.includes("gmail");

    if (isGmail && (/badcredentials/i.test(raw) || /username and password not accepted/i.test(raw) || /\b535\b/.test(raw))) {
        return "Gmail SMTP authentication failed. Enable 2-Step Verification and set SMTP_PASS to a Google App Password (not your normal Gmail password).";
    }

    if (/\bEAUTH\b/i.test(raw) || /authentication/i.test(raw)) {
        return "SMTP authentication failed. Re-check SMTP_USER/SMTP_PASS (use provider SMTP login/key, not your account password).";
    }

    if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED/i.test(raw)) {
        return "SMTP connection failed. Check SMTP_HOST/SMTP_PORT and your network/firewall settings.";
    }

    return "";
}

function hasSmtpConfig() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function validateSmtpConfigForHost() {
    const host = String(process.env.SMTP_HOST || "").toLowerCase();
    if (!host) return "";

    // Gmail SMTP requires an App Password (16 chars) when 2FA is enabled.
    if (host.includes("smtp.gmail.com") || host.includes("gmail")) {
        const pass = String(process.env.SMTP_PASS || "");
        const compact = pass.replace(/\s+/g, "");
        if (compact.length !== 16) {
            return "Gmail SMTP requires a 16-character Google App Password. Generate an App Password (after enabling 2-Step Verification) and paste it into SMTP_PASS (no spaces).";
        }
    }

    return "";
}

async function sendOtpEmail(toEmail, otp) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const from = process.env.OTP_FROM_EMAIL || process.env.SMTP_USER;
    const brand = process.env.OTP_BRAND || "StayEase";

    await transporter.sendMail({
        from,
        to: toEmail,
        subject: `${brand} OTP: ${otp}`,
        text: `Your ${brand} OTP is ${otp}. It expires in 5 minutes.`,
        html: `<p>Your <b>${brand}</b> OTP is <b style="font-size:18px">${otp}</b>.</p><p>It expires in 5 minutes.</p>`,
    });
}

function hasTwilioConfig() {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

function hasMsg91Config() {
    return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
}

async function sendOtpSmsMsg91(countryCode, phoneDigits, otp) {
    // MSG91 OTP API (India): requires DLT-approved template_id.
    // Docs vary by account; this supports the common v5 OTP endpoint.
    const cc = String(countryCode || "+91").replace(/\D/g, "") || "91";
    const mobile = `${cc}${String(phoneDigits || "").replace(/\D/g, "")}`;

    const params = new URLSearchParams({
        template_id: String(process.env.MSG91_TEMPLATE_ID),
        mobile,
        otp: String(otp),
    });

    // Optional: some accounts need this
    if (process.env.MSG91_OTP_EXPIRY) params.set("otp_expiry", String(process.env.MSG91_OTP_EXPIRY));
    if (process.env.MSG91_REALTIME) params.set("realTimeResponse", String(process.env.MSG91_REALTIME));

    const url = `https://control.msg91.com/api/v5/otp?${params.toString()}`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            authkey: String(process.env.MSG91_AUTH_KEY),
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
        throw new Error(`MSG91 OTP send failed (${res.status}). ${text || ""}`.trim());
    }

    // MSG91 may return {type:'success'} JSON, or plain text.
    try {
        const data = JSON.parse(text || "{}");
        const type = String(data?.type || "").toLowerCase();
        if (type && type !== "success") {
            throw new Error(String(data?.message || "MSG91 OTP send failed"));
        }
    } catch (_) {
        // ignore non-JSON responses
    }
}

async function sendOtpSms(countryCode, phoneDigits, otp) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const to = `${countryCode}${phoneDigits}`;
    const brand = process.env.OTP_BRAND || "StayEase";
    await client.messages.create({
        from: process.env.TWILIO_FROM,
        to,
        body: `${brand} OTP: ${otp} (valid for 5 minutes)`,
    });
}

// Some browser extensions / accidental links may navigate to /back.
// Provide a safe redirect to referrer (or home) instead of a 404.
app.get("/back", (req, res) => {
    const ref = req.get("Referrer") || req.get("Referer");
    return res.redirect(ref || "/");
});

// data deletion route (PUBLIC)
app.get("/data-deletion", (req, res) => {
    res.status(200).send(`
        <html>
            <head>
                <title>Data Deletion Instructions - StayEase</title>
            </head>
            <body style="font-family: Arial; padding: 40px;">
                <h2>Data Deletion Instructions</h2>
                <p>
                    If you want your data deleted from StayEase, please email us at:
                </p>
                <p>
                    <strong>mustafaaadil3326@gmail.com</strong>
                </p>
                <p>
                    We will process your request within 7 working days.
                </p>
            </body>
        </html>
    `);
});

//importing the router

// const homeRouter = require("./routes/home.js");
// app.use("/", homeRouter);

// Admin routes (mount early so dynamic routes like /:id/reviews don't shadow /admin/*)
const adminRouter = require("./routes/admin.js");
app.use("/", adminRouter);

// Payment APIs (Razorpay)
const paymentRouter = require("./routes/payment.js");
app.use("/api/payment", paymentRouter);

const listingRouter = require("./routes/listing.js");
app.use("/", listingRouter);

//importing the review router
const reviewRouter = require("./routes/review.js");
app.use("/:id/reviews", reviewRouter);

//importing the user routers
// importing
const userRouter = require("./routes/user.js");
app.use("/", userRouter);

// Booking routes
const bookingRouter = require("./routes/booking.js");
app.use("/", bookingRouter);

// Newsletter subscription (public)
app.post("/newsletter", async (req, res, next) => {
    try {
        const email = (req.body?.email || "").toString().trim().toLowerCase();
        if (!email) {
            throw new ExpressError(400, "Please enter an email address.");
        }

        // Lightweight email sanity check
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!emailOk) {
            throw new ExpressError(400, "Please enter a valid email address.");
        }

        await NewsletterSubscriber.updateOne(
            { email },
            { $setOnInsert: { email } },
            { upsert: true }
        );

        const accept = (req.get("accept") || "").toLowerCase();
        const wantsJson = accept.includes("application/json") || req.xhr;

        if (wantsJson) {
            return res.json({ success: true, message: "Subscribed successfully." });
        }

        req.flash("success", "Subscribed successfully. You’ll receive travel deals & updates.");
        return res.redirect("back");
    } catch (err) {
        return next(err);
    }
});

// OTP auth (placeholder) - stored in session
app.post("/send-otp", async (req, res) => {
    try {
        const tab = (req.body?.tab || "login").toString().toLowerCase() === "signup" ? "signup" : "login";
        const method = (req.body?.method || "email").toString().toLowerCase() === "phone" ? "phone" : "email";
        const role = (req.body?.role || "user").toString().toLowerCase() === "admin" ? "admin" : "user";

        let target = "";
        let email = "";
        let phone = "";
        let countryCode = "+91";

        if (method === "email") {
            email = (req.body?.email || "").toString().trim().toLowerCase();
            const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            if (!emailOk) return jsonFail(res, 400, "Please enter a valid email.");
            target = maskEmail(email);
        } else {
            countryCode = (req.body?.countryCode || "+91").toString().trim() || "+91";
            phone = (req.body?.phone || "").toString().trim();
            const digits = phone.replace(/\D/g, "");
            if (digits.length < 8) return jsonFail(res, 400, "Please enter a valid mobile number.");
            phone = digits;
            target = maskPhone(phone, countryCode);
        }

        const otp = generateOtp();
        const expiresAt = Date.now() + 5 * 60 * 1000;

        req.session.seOtp = {
            otp,
            tab,
            method,
            role,
            email,
            phone,
            countryCode,
            expiresAt,
            verified: false,
            verifiedAt: null,
        };

        // Optional real delivery
        const isProd = process.env.NODE_ENV === "production";
        const delivery = {
            attempted: false,
            sent: false,
            provider: null,
        };
        if (method === "email") {
            if (hasSmtpConfig()) {
                const smtpHint = validateSmtpConfigForHost();
                if (smtpHint) return jsonFail(res, 500, smtpHint);
                delivery.attempted = true;
                delivery.provider = "smtp";
                await sendOtpEmail(email, otp);
                delivery.sent = true;
            } else if (isProd) {
                return jsonFail(res, 500, "Email OTP delivery is not configured on the server.");
            }
        } else {
            // Prefer MSG91 for India routing when configured; fallback to Twilio if present.
            if (hasMsg91Config()) {
                delivery.attempted = true;
                delivery.provider = "msg91";
                await sendOtpSmsMsg91(countryCode, phone, otp);
                delivery.sent = true;
            } else if (hasTwilioConfig()) {
                delivery.attempted = true;
                delivery.provider = "twilio";
                await sendOtpSms(countryCode, phone, otp);
                delivery.sent = true;
            } else if (isProd) {
                return jsonFail(res, 500, "SMS OTP delivery is not configured on the server.");
            }
        }

        const showDebugOtp = String(process.env.SHOW_DEBUG_OTP || "").toLowerCase() === "true";
        const debugOtp = showDebugOtp && process.env.NODE_ENV !== "production" ? otp : undefined;
        return jsonOk(res, { target, delivery, ...(debugOtp ? { debugOtp } : {}) });
    } catch (e) {
        const isProd = process.env.NODE_ENV === "production";
        const hint = explainSmtpError(e);
        const details = String(e?.message || e || "").trim();
        const message = isProd
            ? "Unable to send OTP."
            : `Unable to send OTP. ${hint || details}`.trim();
        return jsonFail(res, 500, message);
    }
});

// Verify OTP for signup only (does NOT create user / set auth cookie)
app.post("/verify-otp-signup", async (req, res) => {
    try {
        const otp = (req.body?.otp || "").toString().trim();
        if (!/^\d{6}$/.test(otp)) return jsonFail(res, 400, "Please enter the 6-digit OTP.");

        const record = req.session.seOtp;
        if (!record) return jsonFail(res, 400, "OTP expired. Please request a new OTP.");
        if (record.tab !== "signup") return jsonFail(res, 400, "OTP is not for signup.");
        if (Date.now() > Number(record.expiresAt || 0)) {
            req.session.seOtp = null;
            return jsonFail(res, 400, "OTP expired. Please request a new OTP.");
        }
        if (otp !== String(record.otp)) return jsonFail(res, 401, "Invalid OTP.");

        record.verified = true;
        record.verifiedAt = Date.now();
        req.session.seOtp = record;
        return jsonOk(res, { verified: true });
    } catch (e) {
        return jsonFail(res, 500, "Unable to verify OTP.");
    }
});

// Complete signup after OTP verification: creates account with username+password
app.post("/complete-signup", async (req, res) => {
    try {
        const record = req.session.seOtp;
        if (!record) return jsonFail(res, 400, "OTP expired. Please request a new OTP.");
        if (record.tab !== "signup") return jsonFail(res, 400, "Invalid signup session.");
        if (!record.verified) return jsonFail(res, 400, "Please verify OTP first.");
        if (Date.now() > Number(record.expiresAt || 0)) {
            req.session.seOtp = null;
            return jsonFail(res, 400, "OTP expired. Please request a new OTP.");
        }

        const username = (req.body?.username || "").toString().trim();
        const password = (req.body?.password || "").toString();
        const confirmPassword = (req.body?.confirmPassword || "").toString();
        if (!username) return jsonFail(res, 400, "Username is required.");
        if (!password) return jsonFail(res, 400, "Password is required.");
        if (password !== confirmPassword) return jsonFail(res, 400, "Passwords do not match.");

        const desiredRole = record.role === "admin" ? "admin" : "user";

        if (record.method === "email") {
            if (!record.email) return jsonFail(res, 400, "Email is required.");
            const existingEmail = await User.findOne({ email: record.email });
            if (existingEmail) return jsonFail(res, 409, "Email already registered. Please log in.");

            const user = await User.register(
                new User({ email: record.email, username, role: desiredRole }),
                password
            );
            const token = signToken(user);
            setAuthCookie(req, res, token);
            req.session.seOtp = null;
            return jsonOk(res, { userId: user._id.toString(), role: user.role });
        }

        // phone signup
        if (!record.phone) return jsonFail(res, 400, "Mobile number is required.");
        const existingPhone = await User.findOne({ phone: record.phone, countryCode: record.countryCode });
        if (existingPhone) return jsonFail(res, 409, "Mobile number already registered. Please log in.");

        const user = await User.register(
            new User({ phone: record.phone, countryCode: record.countryCode, username, role: desiredRole }),
            password
        );
        const token = signToken(user);
        setAuthCookie(req, res, token);
        req.session.seOtp = null;
        return jsonOk(res, { userId: user._id.toString(), role: user.role });
    } catch (e) {
        const message = String(e?.message || "Unable to sign up.");
        return jsonFail(res, 400, message);
    }
});

app.post("/verify-otp", async (req, res) => {
    try {
        const otp = (req.body?.otp || "").toString().trim();
        if (!/^\d{6}$/.test(otp)) return jsonFail(res, 400, "Please enter the 6-digit OTP.");

        const record = req.session.seOtp;
        if (!record) return jsonFail(res, 400, "OTP expired. Please request a new OTP.");
        if (Date.now() > Number(record.expiresAt || 0)) {
            req.session.seOtp = null;
            return jsonFail(res, 400, "OTP expired. Please request a new OTP.");
        }

        if (otp !== String(record.otp)) return jsonFail(res, 401, "Invalid OTP.");

        // Resolve/find/create user
        let user = null;
        const desiredRole = record.role === "admin" ? "admin" : "user";

        if (record.method === "email") {
            user = await User.findOne({ email: record.email });
            if (!user && record.tab === "login") {
                return jsonFail(res, 404, "No account found for this email. Please sign up.");
            }
            if (!user && record.tab === "signup") {
                const username = record.email;
                const password = `otp-${generateOtp()}-${Date.now()}`;
                user = await User.register(
                    new User({ email: record.email, username, role: desiredRole }),
                    password
                );
            }
        } else {
            user = await User.findOne({ phone: record.phone, countryCode: record.countryCode });
            if (!user && record.tab === "login") {
                return jsonFail(res, 404, "No account found for this number. Please sign up.");
            }
            if (!user && record.tab === "signup") {
                const username = `${record.countryCode}${record.phone}`;
                const password = `otp-${generateOtp()}-${Date.now()}`;
                user = await User.register(
                    new User({ phone: record.phone, countryCode: record.countryCode, username, role: desiredRole }),
                    password
                );
            }
        }

        if (!user) return jsonFail(res, 500, "Unable to complete authentication.");

        // Issue JWT cookie so the app treats user as logged in
        const token = signToken(user);
        setAuthCookie(req, res, token);

        req.session.seOtp = null;
        return jsonOk(res, { userId: user._id.toString(), role: user.role });
    } catch (e) {
        return jsonFail(res, 500, "Unable to verify OTP.");
    }
});


main().then(() => {
    console.log("Connected to DB");
}).catch((err) => {
    console.log(err);
});
async function main() {
    await mongoose.connect(dbUrl);// connect to the database
    // Optional: promote a specific user to admin via env ADMIN_USERNAME
    if (process.env.ADMIN_USERNAME) {
        try {
            await User.updateOne({ username: process.env.ADMIN_USERNAME }, { role: "admin" });
        } catch (e) {
            console.log("ADMIN bootstrap failed:", e.message);
        }
    }
}

//Error handling middleware
app.use((err, req, res, next) => {
    let { statusCode=500, message="Something went wrong!" } = err;

    // Always log the real error on the server for debugging.
    // (Client response stays user-friendly.)
    if (process.env.NODE_ENV !== "test") {
        console.error(err);
    }

    const accept = (req.get("accept") || "").toLowerCase();
    const ua = (req.get("user-agent") || "").toLowerCase();

    const isApiPath = req.originalUrl?.startsWith?.("/api/");
    const explicitlyJson = accept.includes("application/json");
    const explicitlyHtml = accept.includes("text/html");
    const isPostman = ua.includes("postmanruntime");

    // If it's an API path, explicitly asks for JSON, is XHR, or a non-browser client (Postman)
    // making a non-GET request without explicitly asking for HTML, return JSON.
    const wantsJson =
        isApiPath ||
        explicitlyJson ||
        req.xhr ||
        isPostman ||
        (req.method !== "GET" && !explicitlyHtml);
    if (wantsJson) {
        return res.status(statusCode).json({ success: false, message });
    }

    res.status(statusCode).render("error.ejs", { message });
    // res.status(statusCode).send(message);
    // res.send("Something went wrong! please try agian");
});
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () =>{
    console.log(`Server is listening on port ${PORT}`);
})
