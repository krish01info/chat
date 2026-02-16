const multer = require("multer");

const upload = multer({
    dest: "uploads/",
    limits: {
        fileSize: 5 * 1024 * 1024  // FIXED: 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // ADDED: Accept images and videos only
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webp/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error("Only images and videos are allowed!"));
        }
    }
});

module.exports = upload;