require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const session = require("express-session");
const passport = require("./config/passport");
const cors = require("cors");

const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");

const qrRoute = require("./routes/qr");
const livekitRoutes = require("./routes/livekit");
const uploadRoute = require("./routes/upload");
const authRoutes = require("./routes/auth");
const socketHandler = require("./socket");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* =========================
   🔥 REDIS SETUP (CRITICAL)
   ========================= */

const pubClient = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
});

const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

pubClient.on("connect", () => {
    console.log("✅ Redis pub client connected");
});

subClient.on("connect", () => {
    console.log("✅ Redis sub client connected");
});

pubClient.on("error", (err) => {
    console.error("❌ Redis pub error:", err);
});

subClient.on("error", (err) => {
    console.error("❌ Redis sub error:", err);
});

pubClient.on("disconnect", () => {
    console.warn("⚠️ Redis pub client disconnected");
});

subClient.on("disconnect", () => {
    console.warn("⚠️ Redis sub client disconnected");
});

/* =========================
   🌐 EXPRESS CONFIG
   ========================= */

app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/favicon.ico", (req, res) => res.status(204).end());

/* =========================
   🔐 SESSION SETUP
   ========================= */

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: "lax",
    },
});

app.use(sessionMiddleware);

/* =========================
   🧑‍🚀 PASSPORT
   ========================= */

app.use(passport.initialize());
app.use(passport.session());

/* =========================
   📁 STATIC FILES
   ========================= */

app.use(express.static(path.resolve("./public"), {
    index: false,
}));

const videoDistPath = path.resolve("./client/dist");
app.use("/video", express.static(videoDistPath));

app.get("/video", (req, res) => {
    res.sendFile(path.join(videoDistPath, "index.html"));
});

/* =========================
   🔐 AUTH MIDDLEWARE
   ========================= */

function ensureAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect("/auth/google");
}

/* =========================
   🏠 ROUTES
   ========================= */

app.get("/", ensureAuth, (req, res) => {
    res.sendFile(path.resolve("./public/index.html"));
});

const sql = require("./db");

app.get("/api/me", ensureAuth, (req, res) => {
    res.json({
        id: req.user.id,
        name: req.user.username,
        avatar: req.user.avatar_url,
    });
});

app.get("/api/conversations", ensureAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const rows = await sql`
            SELECT
                c.id AS conversation_id,
                u.id AS peer_id,
                LEFT(u.id::text, 8) AS peer_code,
                u.username AS peer_name,
                u.avatar_url AS peer_avatar
            FROM conversations c
            JOIN conversation_participants cp 
              ON cp.conversation_id = c.id AND cp.user_id = ${userId}
            JOIN conversation_participants cp2 
              ON cp2.conversation_id = c.id AND cp2.user_id != ${userId}
            JOIN users u ON u.id = cp2.user_id
            WHERE c.is_group = false
            ORDER BY c.created_at DESC
        `;
        res.json(rows);
    } catch (err) {
        console.error("❌ conversations list error:", err);
        res.status(500).json([]);
    }
});

/* =========================
   🔌 EXTRA ROUTES
   ========================= */

app.use("/auth", authRoutes);
app.use("/upload", uploadRoute);
app.use("/qr", qrRoute);
app.use("/livekit", livekitRoutes);

/* =========================
   🔥 SOCKET.IO SESSION SHARE
   ========================= */

io.engine.use(sessionMiddleware);

io.use((socket, next) => {
    next();
});

socketHandler(io);

/* =========================
   🚀 START SERVER
   ========================= */

const PORT = process.env.PORT || 4000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("🔥 Server running on port " + PORT);
});
