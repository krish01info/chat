const express = require("express");
const passport = require("passport");

const router = express.Router();


// 🔥 Send user to Google
router.get("/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);


// 🔥 Google callback
router.get("/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/google", // prevents redirect loop
  }),
  (req, res) => {
    res.redirect("/"); // go to chat after login
  }
);


// ✅ Logout (VERY recommended)
router.get("/logout", (req, res, next) => {
  req.logout(function(err){
    if(err) return next(err);

    req.session.destroy(()=>{
        res.redirect("/auth/google");
    });
  });
});

module.exports = router;
