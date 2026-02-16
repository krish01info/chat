// ✅ Auto connect to same server
const socket = io();

let user_id = null;
let user_name = null;
let conversation_id = null; // will be set when you enter / scan someone else's code
let currentPeerName = null; // name of person you're chatting with

const sendButton = document.getElementById("sendButton");
const messageInput = document.getElementById("messageInput");
const allmessages = document.getElementById("messages");
const attachBtn = document.getElementById("attachBtn");
const attachMenu = document.getElementById("attachMenu");
const fileInputImage = document.getElementById("fileInputImage");
const fileInputVideo = document.getElementById("fileInputVideo");
const fileInputDocument = document.getElementById("fileInputDocument");
const disconnectBtn = document.getElementById("disconnectBtn");
const headerDisconnectBtn = document.getElementById("headerDisconnectBtn");
const joinVideoBtn = document.getElementById("joinVideo");
const headerVideoBtn = document.getElementById("headerVideoBtn");
const chatHeaderName = document.getElementById("chatHeaderName");
const roomCodeText = document.getElementById("roomCodeText");
const roomCodeInput = document.getElementById("roomCodeInput");
const joinRoomButton = document.getElementById("joinRoomButton");
const roomSection = document.getElementById("roomSection");
const usernameDisplay = document.getElementById("username");
const avatarImg = document.getElementById("avatar");
const scanQrButton = document.getElementById("scanQrButton");
const qrScanOverlay = document.getElementById("qrScanOverlay");
const qrScanClose = document.getElementById("qrScanClose");
const conversationList = document.getElementById("conversationList");
const requestModal = document.getElementById("requestModal");
const requestMessage = document.getElementById("requestMessage");
const acceptRequestBtn = document.getElementById("acceptRequestBtn");
const rejectRequestBtn = document.getElementById("rejectRequestBtn");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar = document.getElementById("sidebar");

let html5QrScanner = null;
let pendingRequestFromUserId = null;

// 🔥 Store failed messages for retry
const failedMessages = new Map();

// 🔥 LOAD LOGGED-IN USER FIRST
async function loadUser(){

    const res = await fetch("/api/me");

    if(res.status !== 200){
        window.location.href = "/auth/google";
        return;
    }

    const user = await res.json();

    user_id = user.id;
    user_name = user.name;

    document.getElementById("username").innerText = user.name;

    // Use a short version of your user id as "my code"
    const myCode = (user.id || "").toString().slice(0, 8);
    if(roomCodeText){
        roomCodeText.textContent = myCode || "not available";
    }

    // Load QR for my code so others can scan it
    try{
        const qrRes = await fetch("/qr/my");
        if(qrRes.ok){
            const data = await qrRes.json();
            const img = document.getElementById("qrImage");
            if(data.qr && img){
                img.src = data.qr;
            }
        }
    }catch(err){
        console.error("Failed to load QR:", err);
    }

    if(user.avatar){
        document.getElementById("avatar").src = user.avatar;
    }

    loadConversations();
}

// ✅ Load sidebar: people you're connected with
async function loadConversations(){
    if(!conversationList) return;
    try {
        const res = await fetch("/api/conversations");
        const list = await res.json();
        conversationList.innerHTML = "";
        list.forEach(c => {
            const li = document.createElement("li");
            li.dataset.peerCode = c.peer_code;
            li.dataset.peerName = c.peer_name || "Unknown";
            li.innerHTML = `
                <img class="peer-avatar" src="${escapeAttr(c.peer_avatar || '')}" alt="" onerror="this.style.display='none'"/>
                <span class="peer-name">${escapeHtml(c.peer_name || "Unknown")}</span>
            `;
            if(c.peer_code === conversation_id) {
                li.classList.add("active");
                updateChatHeader(c.peer_name || "Unknown");
            }
            li.addEventListener("click", () => switchToConversation(c.peer_code, c.peer_name));
            conversationList.appendChild(li);
        });
    } catch(err) {
        console.error("Failed to load conversations:", err);
    }
}

function updateChatHeader(name) {
    if(chatHeaderName) {
        currentPeerName = name;
        chatHeaderName.textContent = name || "Select a chat";
    }
    // Show/hide header buttons based on whether we're in a chat
    if(headerDisconnectBtn) headerDisconnectBtn.style.display = name ? "flex" : "none";
    if(headerVideoBtn) headerVideoBtn.style.display = name ? "flex" : "none";
}

function escapeAttr(v){ return (v||"").replace(/"/g,"&quot;"); }

function switchToConversation(peerCode, peerName){
    conversation_id = peerCode;
    allmessages.innerHTML = "";
    document.querySelectorAll("#conversationList li").forEach(el => {
        el.classList.toggle("active", el.dataset.peerCode === peerCode);
        if(el.dataset.peerCode === peerCode && el.dataset.peerName) {
            updateChatHeader(el.dataset.peerName);
        }
    });
    if(peerName) updateChatHeader(peerName);
    if(socket.connected){
        socket.emit("join_conversation", { conversation_id: peerCode });
        socket.emit("load_messages", { conversation_id: peerCode });
    }
    if(roomCodeInput) roomCodeInput.value = peerCode;
}

// Kick off user-load immediately.
const userLoaded = loadUser();

// Initialize header buttons visibility
if(headerDisconnectBtn) headerDisconnectBtn.style.display = "none";
if(headerVideoBtn) headerVideoBtn.style.display = "none";

// ✅ SIDEBAR TOGGLE on mobile
if(sidebarToggle && sidebar) {
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
  
  // Close sidebar when a conversation is selected
  if(conversationList) {
    conversationList.addEventListener("click", () => {
      if(window.innerWidth <= 768) {
        sidebar.classList.remove("open");
      }
    });
  }
  
  // Close sidebar when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if(window.innerWidth <= 768 && sidebar.classList.contains("open")) {
      if(!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
        sidebar.classList.remove("open");
      }
    }
  });
}


// ✅ CONNECT (no auto-join; wait until you enter / scan someone's code)
socket.on("connect", async () => {
    console.log("Connected:", socket.id);
    await userLoaded;
});

// Helpful visibility into server results
socket.onAny((event, ...args) => {
    if(event === "receive_message" || event === "previous_messages") return;
    console.log("[socket event]", event, ...args);
});


// ✅ ERRORS
socket.on("connect_error", (err) => {
    console.error("Connection error:", err);
});

socket.on("error", (msg) => {
    console.error("Server error:", msg);
});


// ✅ OLD MESSAGES
socket.on("previous_messages", (messages) => {
    messages.forEach(renderMessage);
});


// ✅ CONNECTION POPUP + refresh sidebar
socket.on("connected", ({ peerName, peer_code }) => {
    const name = peerName || "the other user";
    alert(`You are now connected with ${name}.`);
    loadConversations();
    if(peer_code) {
        conversation_id = peer_code;
        if(roomCodeInput) roomCodeInput.value = peer_code;
        updateChatHeader(name);
    }
});

socket.on("request_sent", ({ ok, error, already_connected, peer_code }) => {
    if(!ok){ alert(error || "Failed to send request."); return; }
    if(already_connected && peer_code){
        conversation_id = peer_code;
        if(roomCodeInput) roomCodeInput.value = peer_code;
        allmessages.innerHTML = "";
        socket.emit("join_conversation", { conversation_id: peer_code });
        socket.emit("load_messages", { conversation_id: peer_code });
        loadConversations();
        // Update header when already connected
        setTimeout(() => {
            const activeLi = document.querySelector(`#conversationList li[data-peer-code="${peer_code}"]`);
            if(activeLi && activeLi.dataset.peerName) {
                updateChatHeader(activeLi.dataset.peerName);
            }
        }, 100);
        return;
    }
    alert("Request sent! The other person will see a popup to accept.");
});

socket.on("connection_request", ({ from_user_id, from_name }) => {
    console.log("[Frontend] Received connection_request from:", from_name, from_user_id);
    pendingRequestFromUserId = from_user_id;
    if(requestMessage) requestMessage.textContent = `${from_name || "Someone"} wants to connect with you.`;
    if(requestModal) {
        requestModal.classList.add("show");
        if (typeof window !== "undefined" && window.focus) window.focus();
        console.log("[Frontend] Modal should be visible now");
    } else {
        console.error("[Frontend] requestModal element not found!");
    }
});

socket.on("connection_request_accepted", ({ peerName, peer_code }) => {
    if(peer_code){
        conversation_id = peer_code;
        if(roomCodeInput) roomCodeInput.value = peer_code;
        allmessages.innerHTML = "";
        socket.emit("join_conversation", { conversation_id: peer_code });
        socket.emit("load_messages", { conversation_id: peer_code });
        updateChatHeader(peerName || "Unknown");
    }
    loadConversations();
    alert(`You are now connected with ${peerName || "them"}.`);
});

socket.on("request_rejected", ({ by_name }) => {
    alert(by_name ? `${by_name} declined your request.` : "Request was declined.");
});

// 🔥 NEW MESSAGE (with optimistic update support)
socket.on("receive_message", (msg) => {
    if (msg.optimistic) {
        // Optimistic message - show with pending indicator
        renderMessage(msg, { isPending: true });
    } else {
        // Regular message from DB
        renderMessage(msg);
    }
});

// 🔥 MESSAGE CONFIRMED (replace temp with real DB message)
socket.on("message_confirmed", ({ temp_id, message }) => {
    const tempElement = document.querySelector(`[data-temp-id="${temp_id}"]`);
    
    if (tempElement) {
        // Update with real data
        tempElement.setAttribute('data-message-id', message.id);
        tempElement.removeAttribute('data-temp-id');
        
        // Remove pending indicator
        tempElement.classList.remove('message-pending');
        
        // Update status icon
        const statusIcon = tempElement.querySelector('.message-status');
        if (statusIcon) {
            statusIcon.textContent = '✓✓';
            statusIcon.classList.add('sent');
        }
    }
});

// 🔥 MESSAGE FAILED (show retry button)
socket.on("message_failed", ({ temp_id, error }) => {
    const tempElement = document.querySelector(`[data-temp-id="${temp_id}"]`);
    
    if (tempElement) {
        // Remove pending state
        tempElement.classList.remove('message-pending');
        tempElement.classList.add('message-failed');
        
        // Update status icon
        const statusIcon = tempElement.querySelector('.message-status');
        if (statusIcon) {
            statusIcon.textContent = '✗';
            statusIcon.classList.add('failed');
        }
        
        // Add retry button
        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-button';
        retryBtn.textContent = '🔄 Retry';
        retryBtn.onclick = () => {
            const msgData = failedMessages.get(temp_id);
            if (msgData) {
                // Remove failed message
                tempElement.remove();
                
                // Resend
                socket.emit("send_message", msgData);
                
                // Clear from failed messages
                failedMessages.delete(temp_id);
            }
        };
        
        tempElement.appendChild(retryBtn);
        
        console.error('Message failed:', error);
    }
});


// ⭐ Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return "";
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    // Today: show time only
    if (diffDays === 0) {
        return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
    // Yesterday
    if (diffDays === 1) {
        return "Yesterday " + date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
    // This week: show day and time
    if (diffDays < 7) {
        return date.toLocaleDateString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });
    }
    // Older: show date and time
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

// ⭐ RENDER MESSAGE (with optimistic update support)
function renderMessage(msg, options = {}) {
    const div = document.createElement("div");
    div.className = "message";
    
    const displayName = escapeHtml(msg.sender_name || msg.sender_id || "Unknown");
    const timestamp = formatTimestamp(msg.created_at);
    const isOwnMessage = msg.sender_id === user_id;
    
    // Add temp_id or real id
    if (msg.temp_id) {
        div.setAttribute('data-temp-id', msg.temp_id);
        // Store message data for potential retry
        failedMessages.set(msg.temp_id, {
            conversation_id: conversation_id,
            content: msg.content,
            media_url: msg.media_url
        });
    } else if (msg.id) {
        div.setAttribute('data-message-id', msg.id);
    }
    
    // Add pending class if optimistic
    if (options.isPending || msg.optimistic) {
        div.classList.add('message-pending');
    }
    
    // Add sent/received class
    div.classList.add(isOwnMessage ? 'message-sent' : 'message-received');
    
    // Build message HTML
    let content = `<strong>${displayName}</strong>`;
    
    if (msg.media_url) {
        const isVideo = msg.media_url.includes(".mp4");
        content += `
            <div class="message-content">
                ${isVideo 
                    ? `<video src="${escapeAttr(msg.media_url)}" controls style="max-width: 100%; border-radius: 8px;"></video>` 
                    : `<img src="${escapeAttr(msg.media_url)}" style="max-width: 100%; border-radius: 8px;"/>`}
            </div>
        `;
    } else {
        content += `<div class="message-content">${escapeHtml(msg.content)}</div>`;
    }
    
    // Add timestamp and status indicator
    content += `<div class="message-meta">`;
    if (timestamp) {
        content += `<span class="message-timestamp">${timestamp}</span>`;
    }
    
    // Status indicator (only for own messages)
    if (isOwnMessage) {
        if (options.isPending || msg.optimistic) {
            content += `<span class="message-status pending">⏱</span>`;
        } else {
            content += `<span class="message-status sent">✓✓</span>`;
        }
    }
    content += `</div>`;
    
    div.innerHTML = content;
    
    allmessages.appendChild(div);
    allmessages.scrollTop = allmessages.scrollHeight;
}


// 🔐 prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// ✅ SEND TEXT
function sendMessage(){

    const content = messageInput.value.trim();

    if(!content) return;

    if(!conversation_id){
        alert("Enter the other person's code and click Connect first.");
        return;
    }

    // Send to server (optimistic update happens on server response)
    socket.emit("send_message", {
        conversation_id,
        content
    });

    messageInput.value = "";
}

sendButton.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e)=>{
    if(e.key === "Enter") sendMessage();
});


// We no longer auto-generate a room; each person has their own code
// (shown under their name). You connect by entering someone else's code
// or scanning their QR.


// ✅ WhatsApp-style attach: toggle menu
if(attachBtn && attachMenu){
    attachBtn.addEventListener("click", (e)=>{
        e.stopPropagation();
        attachMenu.classList.toggle("show");
    });
    document.addEventListener("click", ()=>{
        attachMenu.classList.remove("show");
    });
    attachMenu.addEventListener("click", (e)=> e.stopPropagation());
}

function handleFileUpload(file){
    if(!file) return;
    if(!conversation_id){
        alert("Connect to someone first.");
        return;
    }
    const formData = new FormData();
    formData.append("file", file);
    fetch("/upload", { method: "POST", body: formData })
        .then(async r=> {
            const data = await r.json().catch(()=> ({}));
            if(!r.ok) throw new Error(data.message || data.error || "Upload failed");
            return data;
        })
        .then(data=> {
            if(data && data.url) socket.emit("send_message", { conversation_id, content: null, media_url: data.url });
            else alert((data && data.error) || "Upload failed");
        })
        .catch(err=> alert(err.message || "Upload failed"));
}

if(fileInputImage) fileInputImage.addEventListener("change", e=> { handleFileUpload(e.target.files[0]); e.target.value = ""; });
if(fileInputVideo) fileInputVideo.addEventListener("change", e=> { handleFileUpload(e.target.files[0]); e.target.value = ""; });
if(fileInputDocument) fileInputDocument.addEventListener("change", e=> { handleFileUpload(e.target.files[0]); e.target.value = ""; });

if(attachMenu){
    attachMenu.querySelectorAll("[data-attach]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
            const type = btn.getAttribute("data-attach");
            attachMenu.classList.remove("show");
            if(type === "image" && fileInputImage) fileInputImage.click();
            else if(type === "video" && fileInputVideo) fileInputVideo.click();
            else if(type === "document" && fileInputDocument) fileInputDocument.click();
        });
    });
}

// ✅ Disconnect from current chat
function handleDisconnect() {
    if(!conversation_id) return;
    conversation_id = null;
    currentPeerName = null;
    if(allmessages) allmessages.innerHTML = "";
    if(messageInput) messageInput.value = "";
    if(roomCodeInput) roomCodeInput.value = "";
    document.querySelectorAll("#conversationList li").forEach(el=> el.classList.remove("active"));
    updateChatHeader(null);
}

if(disconnectBtn){
    disconnectBtn.addEventListener("click", handleDisconnect);
}
if(headerDisconnectBtn){
    headerDisconnectBtn.addEventListener("click", handleDisconnect);
}

// ✅ Join Video Call: open built Vite app served by Express at /video
function handleVideoCall() {
    if(!conversation_id) {
        alert("Please connect to someone first.");
        return;
    }
    const name = (user_name || "Guest").replace(/[^a-zA-Z0-9]/g, "_");

    // Use same origin as the chat app, just different path
    const base = window.location.origin;
    const url = `${base}/video?username=${encodeURIComponent(name)}`;

    window.open(url, "_blank", "noopener");
}

if(joinVideoBtn){
    joinVideoBtn.addEventListener("click", handleVideoCall);
}
if(headerVideoBtn){
    headerVideoBtn.addEventListener("click", handleVideoCall);
}

// ✅ Connect: send request to other person (they get popup to Accept/Decline)
joinRoomButton.addEventListener("click", () => {
    const code = roomCodeInput.value.trim();
    if(!code) return;
    if(socket.connected) socket.emit("request_connection", { peer_code: code });
});

// ✅ Toggle QR / room info when clicking on your name or avatar
function toggleRoomSection(){
    if(!roomSection) return;
    roomSection.style.display = roomSection.style.display === "none" ? "block" : "none";
}

if(usernameDisplay){
    usernameDisplay.style.cursor = "pointer";
    usernameDisplay.title = "Click to show room QR & code";
    usernameDisplay.addEventListener("click", toggleRoomSection);
}

if(avatarImg){
    avatarImg.style.cursor = "pointer";
    avatarImg.title = "Click to show room QR & code";
    avatarImg.addEventListener("click", toggleRoomSection);
}

// ✅ Camera-based QR scanning to join a room
async function startQrScan(){

    if(!window.Html5Qrcode){
        alert("QR scanning library not loaded yet. Please wait a moment and try again.");
        return;
    }

    qrScanOverlay.style.display = "flex";

    if(!html5QrScanner){
        html5QrScanner = new Html5Qrcode("qr-reader");
    }

    const config = { fps: 10, qrbox: 250 };

    const onScanSuccess = (decodedText) => {
        // Accept either full URL with ?room= or just a bare code
        let code = "";
        try{
            const url = new URL(decodedText);
            code = url.searchParams.get("code") || url.searchParams.get("room") || url.pathname.replace("/","");
        }catch{
            code = decodedText;
        }

        code = (code || "").trim();
        if(!code){
            alert("Could not read a room code from this QR.");
            return;
        }

        roomCodeInput.value = code;
        if(socket.connected) socket.emit("request_connection", { peer_code: code });
        stopQrScan();
    };

    const onScanFailure = () => {
        // Ignore continuous scan failures; user can close manually
    };

    try{
        await html5QrScanner.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
    }catch(err){
        console.error("QR scan start error:", err);
        alert("Camera access failed. Please allow camera permission and try again.");
        qrScanOverlay.style.display = "none";
    }
}

function stopQrScan(){
    if(html5QrScanner){
        html5QrScanner.stop().catch(()=>{});
    }
    qrScanOverlay.style.display = "none";
}

if(scanQrButton){
    scanQrButton.addEventListener("click", startQrScan);
}

if(qrScanClose){
    qrScanClose.addEventListener("click", stopQrScan);
}

// ✅ Connection request modal: Accept / Decline
if(acceptRequestBtn){
    acceptRequestBtn.addEventListener("click", () => {
        if(pendingRequestFromUserId && socket.connected){
            socket.emit("accept_connection_request", { from_user_id: pendingRequestFromUserId });
        }
        pendingRequestFromUserId = null;
        if(requestModal) requestModal.classList.remove("show");
    });
}
if(rejectRequestBtn){
    rejectRequestBtn.addEventListener("click", () => {
        if(pendingRequestFromUserId && socket.connected){
            socket.emit("reject_connection_request", { from_user_id: pendingRequestFromUserId });
        }
        pendingRequestFromUserId = null;
        if(requestModal) requestModal.classList.remove("show");
    });
}
