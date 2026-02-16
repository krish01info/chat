const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const crypto = require("crypto");
const sql = require("../db");

// QR for per-user "my code" so others can scan to connect
router.get("/my", async (req, res) => {

    try{
        const userId = req.user?.id;
        if(!userId){
            return res.status(401).json({ error: "Not authenticated" });
        }

        const myCode = userId.toString().slice(0,8);

        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const joinUrl = `${baseUrl}/?code=${myCode}`;

        const qrImage = await QRCode.toDataURL(joinUrl);

        res.json({ qr: qrImage, code: myCode, joinUrl });

    }catch(err){
        console.log(err);
        res.status(500).json({ error: "QR generation failed" });
    }

});

module.exports = router;
