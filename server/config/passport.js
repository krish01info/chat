const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const sql = require("../db");

// Use GOOGLE_CALLBACK_URL if set (e.g. http://localhost:4000/auth/google/callback),
// otherwise default path (relative) – must match Authorized redirect URIs in Google Console
const callbackURL = process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
    },
    async (accessToken, refreshToken, profile, done) => {

      try {
        // FIXED: Added database integration
        // Check if user exists
        const existingUser = await sql`
          SELECT * FROM users 
          WHERE google_id = ${profile.id}
        `;

        if (existingUser.length > 0) {
          // User exists, return it
          return done(null, existingUser[0]);
        }

        // Create new user
        const newUser = await sql`
          INSERT INTO users (google_id, email, username, avatar_url)
          VALUES (
            ${profile.id},
            ${profile.emails[0].value},
            ${profile.displayName},
            ${profile.photos[0]?.value || null}
          )
          RETURNING *
        `;

        return done(null, newUser[0]);

      } catch (err) {
        console.error("Google Auth Error:", err);
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);  // FIXED: serialize by user.id instead of whole user
});

passport.deserializeUser(async (id, done) => {
  try {
    // FIXED: Fetch user from database
    const user = await sql`
      SELECT * FROM users WHERE id = ${id}
    `;
    done(null, user[0]);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;