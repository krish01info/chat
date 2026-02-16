const express = require("express");
const createToken = require("../livekittoken"); 


const router = express.Router();

router.get("/getToken", async (req,res)=>{

    const username = req.query.username;
    const room = "global-room";

    const token = await createToken(username, room);

    res.json({
        token,
        url: process.env.LIVEKIT_URL
    });
});


module.exports = router;
