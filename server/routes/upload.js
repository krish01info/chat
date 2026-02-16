const express = require("express");
const router = express.Router();
const cloudinary = require("../config/cloudinary");
const upload = require("../middleware/multer");
const fs = require("fs-extra");

router.post("/", upload.single("file"), async (req, res) => {

    try {
        // ADDED: Check if file exists
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(
            req.file.path,
            { 
                folder: "chat_app",
                resource_type: "auto"  // ADDED: auto-detect resource type
            }
        );

        // Clean up local file
        await fs.remove(req.file.path);
        
        console.log("Upload successful:", result.secure_url);

        res.json({ 
            url: result.secure_url,
            type: result.resource_type  // ADDED: return file type
        });

    } catch (err) {
        console.error("Upload error:", err);

        // Clean up file if it exists
        if (req.file && req.file.path) {
            await fs.remove(req.file.path).catch(console.error);
        }

        res.status(500).json({ 
            error: "Upload failed",
            message: err.message  // ADDED: more detailed error
        });
    }

});

module.exports = router;