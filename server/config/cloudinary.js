const cloudinary = require("cloudinary").v2;

cloudinary.config({
    // Trim to avoid hidden whitespace breaking auth (e.g. " CLOUD_NAME= foo")
    cloud_name: process.env.CLOUD_NAME?.trim(),
    api_key: process.env.API_KEY?.trim(),
    // Support both common names (API_SECRET) and the existing typo (API_SECRETE)
    api_secret: (process.env.API_SECRET ?? process.env.API_SECRETE)?.trim()
});

module.exports = cloudinary;

