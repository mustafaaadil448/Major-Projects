const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const missing = [
    ["CLOUD_NAME", process.env.CLOUD_NAME],
    ["CLOUD_API_KEY", process.env.CLOUD_API_KEY],
    ["CLOUD_API_SECRET", process.env.CLOUD_API_SECRET],
]
    .filter(([, value]) => !value)
    .map(([name]) => name);

if (missing.length) {
    throw new Error(
        `Cloudinary configuration missing: ${missing.join(", ")}. ` +
            "Set these in your .env (dev) or environment variables (prod)."
    );
}

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "StayEase DEV",
        allowedFormats: ["jpeg", "png", "jpg"]
    },
});

module.exports = {
    cloudinary,
    storage
};