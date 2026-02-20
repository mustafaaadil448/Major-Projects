const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new Schema({
    email: {
        type: String,
        default: null,
    },
    phone: {
        type: String,
        default: null,
    },
    countryCode: {
        type: String,
        default: null,
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
    },
    isBlocked: {
        type: Boolean,
        default: false,
    },
});

userSchema.pre("validate", function (next) {
    const hasEmail = Boolean(this.email && String(this.email).trim());
    const hasPhone = Boolean(this.phone && String(this.phone).trim());
    if (!hasEmail && !hasPhone) {
        this.invalidate("email", "Email or phone is required.");
    }
    next();
});
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);
