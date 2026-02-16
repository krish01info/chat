# 💬 Real-Time Chat Application

A full-stack real-time chat application built with modern web technologies, featuring real-time messaging, authentication, media support, and scalable architecture using Docker.

---

## 🚀 Features

- 🔐 User authentication (Passport.js)
- 💬 Real-time chat using Socket.IO
- 📡 WebRTC support for real-time communication
- 🧠 Redis integration for performance optimization
- ☁️ Cloudinary for media uploads
- ⚡ Modern frontend powered by Vite
- 🐳 Docker & Docker Compose support
- 📦 Scalable backend architecture

---

## 🏗️ Project Structure

chat/
│
├── client/ # Frontend (Vite)
│ ├── src/
│ ├── public/
│ ├── dist/
│ ├── index.html
│ ├── package.json
│ └── vite.config.js
│
├── server/ # Backend (Node.js + Express)
│ ├── config/ # Passport & Cloudinary config
│ ├── db/ # Database connection
│ ├── middleware/
│ ├── migrations/
│ ├── routes/
│ ├── socket.js # Socket.IO logic
│ ├── webrtc.js # WebRTC logic
│ ├── redis.js # Redis setup
│ └── server.js # App entry point
│
├── public/ # Static assets
├── uploads/ # Uploaded files (ignored in git)
├── Dockerfile
├── docker-compose.yml
├── .env # Environment variables (ignored)
├── .gitignore
└── package.json


---

## ⚙️ Tech Stack

### Frontend
- HTML, CSS, JavaScript
- Vite

### Backend
- Node.js
- Express.js
- Socket.IO
- WebRTC
- Redis
- Passport.js

### DevOps
- Docker
- Docker Compose

---

## 🛠️ Installation & Setup

### 1️⃣ Clone the repository
```bash
git clone https://github.com/Krish01info/chat.git
cd chat
