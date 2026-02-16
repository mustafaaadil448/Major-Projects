const mongoose = require("mongoose");

const newsletterSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            unique: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("NewsletterSubscriber", newsletterSchema);
