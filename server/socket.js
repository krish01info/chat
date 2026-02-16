const sql = require("./db");

function socketHandler(io){

    io.on("connection", (socket)=>{

        console.log("User connected:", socket.id);

        function getAuthedUserId(){
            return socket.request?.session?.passport?.user ?? null;
        }

        async function getAuthedUser(){
            if(socket.data.user) return socket.data.user;

            const userId = getAuthedUserId();
            if(!userId) return null;

            const users = await sql`SELECT id, username, avatar_url FROM users WHERE id = ${userId}`;
            socket.data.user = users[0] || null;
            return socket.data.user;
        }

        // Resolve a "person code" (short user id) to a user row
        async function getUserByCode(code){
            if(!code) return null;

            const rows = await sql`
                SELECT id, username, avatar_url
                FROM users
                WHERE LEFT(id::text, 8) = ${code}
                LIMIT 1
            `;

            return rows[0] || null;
        }

        // Find or create a 1:1 conversation between two users
        async function getOrCreateDmConversation(currentUserId, peerCode){
            const peer = await getUserByCode(peerCode);
            if(!peer) return null;

            const peerId = peer.id;

            // Try to find existing DM between these two users
            const existing = await sql`
                SELECT c.id
                FROM conversations c
                JOIN conversation_participants cp1
                    ON cp1.conversation_id = c.id AND cp1.user_id = ${currentUserId}
                JOIN conversation_participants cp2
                    ON cp2.conversation_id = c.id AND cp2.user_id = ${peerId}
                WHERE c.is_group = false
                LIMIT 1
            `;

            if(existing[0]){
                return { conversationId: existing[0].id, peer };
            }

            // Create new DM conversation
            const insertedConversations = await sql`
                INSERT INTO conversations (is_group, name, created_by)
                VALUES (false, ${"dm"}, ${currentUserId})
                RETURNING id
            `;

            const conversationId = insertedConversations[0]?.id;

            if(conversationId){
                await sql`
                    INSERT INTO conversation_participants (conversation_id, user_id)
                    VALUES (${conversationId}, ${currentUserId}), (${conversationId}, ${peerId})
                    ON CONFLICT (conversation_id, user_id) DO NOTHING
                `;
            }

            return { conversationId, peer };
        }

        // 🔥 JOIN CONVERSATION (1:1 chat by other person's code)
        socket.on("join_conversation", async ({ conversation_id }) => {

            try {

                const user = await getAuthedUser();
                if(!user?.id || !conversation_id){
                    return socket.emit("error", "Unauthorized");
                }

                const peerCode = conversation_id; // other person's code
                const result = await getOrCreateDmConversation(user.id, peerCode);

                if(!result?.conversationId){
                    return socket.emit("error", "User not found for this code");
                 }

                 const roomName = result.conversationId.toString();

                // ✅ Verify membership
                const participant = await sql`
                    SELECT 1 FROM conversation_participants
                    WHERE conversation_id = ${result.conversationId}
                    AND user_id = ${user.id}
                `;

                if(participant.length === 0){
                    return socket.emit("error", "Unauthorized");
                }

                socket.join(roomName);

                console.log(`User ${user.id} joined DM conversation ${roomName}`);

                // Notify BOTH sides that they are now connected
                const payload = {
                    conversationId: result.conversationId,
                    peerName: result.peer.username,
                    peerAvatar: result.peer.avatar_url,
                };

                socket.emit("connected", payload);
                io.to(roomName)
                  .except(socket.id)
                  .emit("connected", {
                      conversationId: result.conversationId,
                      peerName: user.username,
                      peerAvatar: user.avatar_url,
                  });

            } catch(err){
                console.log("JOIN ERROR:", err);
            }
        });

        // 🔥 REQUEST CONNECTION (one person enters code and clicks Connect; other gets request)
        socket.on("request_connection", async ({ peer_code }) => {
            try {
                const user = await getAuthedUser();
                if(!user?.id || !peer_code) return socket.emit("error", "Unauthorized");

                const peer = await getUserByCode(peer_code.trim());
                if(!peer) return socket.emit("request_sent", { ok: false, error: "User not found" });
                if(peer.id === user.id) return socket.emit("request_sent", { ok: false, error: "Cannot connect to yourself" });

                const peerId = peer.id;

                // Already have a DM? Then just join and notify
                const existing = await sql`
                    SELECT c.id FROM conversations c
                    JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ${user.id}
                    JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ${peerId}
                    WHERE c.is_group = false LIMIT 1
                `;
                if(existing[0]){
                    const roomName = existing[0].id.toString();
                    socket.join(roomName);
                    socket.emit("request_sent", { ok: true, already_connected: true, peer_code: peer_code.trim(), conversation_id: existing[0].id });
                    socket.emit("connected", { conversationId: existing[0].id, peerName: peer.username, peerAvatar: peer.avatar_url });
                    return;
                }

                // Check for existing pending request
                const pending = await sql`
                    SELECT id FROM connection_requests
                    WHERE from_user_id = ${user.id} AND to_user_id = ${peerId} AND status = 'pending'
                `;
                if(pending[0]){
                    socket.emit("request_sent", { ok: true, pending: true });
                    return;
                }

                await sql`
                    INSERT INTO connection_requests (from_user_id, to_user_id, status)
                    VALUES (${user.id}, ${peerId}, 'pending')
                    ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET status = 'pending'
                `;

                socket.emit("request_sent", { ok: true });

                const targetRoom = "user:" + peerId;
                console.log(`[Request] Sending connection_request to room: ${targetRoom} (peer: ${peer.username})`);
                
                io.to(targetRoom).emit("connection_request", {
                    from_user_id: user.id,
                    from_name: user.username,
                    from_avatar: user.avatar_url,
                    from_code: user.id.toString().slice(0, 8),
                });
                
                // Debug: check if anyone is in that room
                const socketsInRoom = await io.in(targetRoom).fetchSockets();
                console.log(`[Request] Sockets in room ${targetRoom}: ${socketsInRoom.length}`);
            } catch(err){
                console.log("REQUEST CONNECTION ERROR:", err);
                socket.emit("request_sent", { ok: false, error: err.message });
            }
        });

        socket.on("accept_connection_request", async ({ from_user_id }) => {
            try {
                const user = await getAuthedUser();
                if(!user?.id || !from_user_id) return socket.emit("error", "Unauthorized");

                const req = await sql`
                    SELECT * FROM connection_requests
                    WHERE to_user_id = ${user.id} AND from_user_id = ${from_user_id} AND status = 'pending'
                    LIMIT 1
                `;
                if(!req[0]) return socket.emit("error", "Request not found or already handled");

                const fromUserId = req[0].from_user_id;
                const toUserId = user.id;

                const inserted = await sql`
                    INSERT INTO conversations (is_group, name, created_by)
                    VALUES (false, 'dm', ${fromUserId})
                    RETURNING id
                `;
                const conversationId = inserted[0].id;
                await sql`
                    INSERT INTO conversation_participants (conversation_id, user_id)
                    VALUES (${conversationId}, ${fromUserId}), (${conversationId}, ${toUserId})
                    ON CONFLICT (conversation_id, user_id) DO NOTHING
                `;
                await sql`UPDATE connection_requests SET status = 'accepted' WHERE id = ${req[0].id}`;

                const roomName = conversationId.toString();
                socket.join(roomName);

                const fromUser = await sql`SELECT id, username, avatar_url FROM users WHERE id = ${fromUserId}`.then(r => r[0]);

                socket.emit("connected", { conversationId, peerName: fromUser?.username, peerAvatar: fromUser?.avatar_url, peer_code: fromUserId.toString().slice(0, 8) });

                io.to("user:" + fromUserId).emit("connection_request_accepted", {
                    conversationId,
                    peerName: user.username,
                    peerAvatar: user.avatar_url,
                    peer_code: user.id.toString().slice(0, 8),
                });
                io.to("user:" + fromUserId).emit("connected", { conversationId, peerName: user.username, peerAvatar: user.avatar_url, peer_code: user.id.toString().slice(0, 8) });
            } catch(err){
                console.log("ACCEPT REQUEST ERROR:", err);
                socket.emit("error", err.message);
            }
        });

        socket.on("reject_connection_request", async ({ from_user_id }) => {
            try {
                const user = await getAuthedUser();
                if(!user?.id || !from_user_id) return;

                await sql`
                    UPDATE connection_requests SET status = 'rejected'
                    WHERE to_user_id = ${user.id} AND from_user_id = ${from_user_id} AND status = 'pending'
                `;
                io.to("user:" + from_user_id).emit("request_rejected", { by_name: user.username });
            } catch(err){
                console.log("REJECT REQUEST ERROR:", err);
            }
        });

        // 🔥 SEND MESSAGE (FAST: emit first, store later)
        socket.on("send_message", async ({ conversation_id, content, media_url }) => {
            try {
                const user = await getAuthedUser();
                if(!user?.id || !conversation_id){
                    return socket.emit("error", "Unauthorized");
                }

                const peerCode = conversation_id;
                const result = await getOrCreateDmConversation(user.id, peerCode);

                if(!result?.conversationId){
                    return socket.emit("error", "User not found for this code");
                }

                const roomId = result.conversationId.toString();
                const messageType = media_url 
                    ? (media_url.includes(".mp4") ? "video" : "image") 
                    : "text";

                // ✅ TEMP MESSAGE (instant UI update)
                const tempMessage = {
                    temp_id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    conversation_id: result.conversationId,
                    sender_id: user.id,
                    sender_name: user.username,
                    sender_avatar: user.avatar_url,
                    message_type: messageType,
                    content: content || null,
                    media_url: media_url || null,
                    created_at: new Date().toISOString(),
                    optimistic: true
                };

                // 🚀 EMIT FIRST (NO DB WAIT)
                io.to(roomId).emit("receive_message", tempMessage);

                // 🔁 STORE IN DB (ASYNC – DOES NOT BLOCK CHAT)
                setImmediate(async () => {
                    try {
                        const inserted = await sql`
                            INSERT INTO messages
                            (conversation_id, sender_id, message_type, content, media_url)
                            VALUES
                            (${result.conversationId}, ${user.id}, ${messageType}, ${content || null}, ${media_url || null})
                            RETURNING *
                        `;

                        const saved = inserted[0];
                        if (!saved) {
                            throw new Error("Insert returned no rows");
                        }

                        // 🔁 CONFIRM MESSAGE (replace temp on frontend)
                        io.to(roomId).emit("message_confirmed", {
                            temp_id: tempMessage.temp_id,
                            message: {
                                ...saved,
                                sender_name: user.username,
                                sender_avatar: user.avatar_url,
                                optimistic: false
                            }
                        });

                    } catch (dbErr) {
                        console.error("DB SAVE ERROR:", dbErr);
                        // ❌ notify sender only if DB failed
                        socket.emit("message_failed", {
                            temp_id: tempMessage.temp_id,
                            error: dbErr.message
                        });
                    }
                });

            } catch(err){
                console.error("MESSAGE ERROR:", err);
                socket.emit("error", "Failed to send message");
            }
        });


        // 🔥 LOAD OLD MESSAGES (VERY IMPORTANT FEATURE)
        socket.on("load_messages", async ({ conversation_id }) => {

            try{
                const user = await getAuthedUser();
                if(!user?.id || !conversation_id){
                    return socket.emit("previous_messages", []);
                }

                const peerCode = conversation_id;
                const result = await getOrCreateDmConversation(user.id, peerCode);

                if(!result?.conversationId){
                    return socket.emit("previous_messages", []);
                }

                const messages = await sql`
                    SELECT
                        m.*,
                        u.username AS sender_name,
                        u.avatar_url AS sender_avatar
                    FROM messages m
                    LEFT JOIN users u ON u.id = m.sender_id
                    WHERE m.conversation_id = ${result.conversationId}
                    ORDER BY m.created_at DESC
                    LIMIT 50
                `;

                socket.emit("previous_messages", messages.reverse());

            }catch(err){
                console.log("LOAD ERROR:", err);
            }
        });


        socket.on("disconnect", ()=>{
            console.log("User disconnected:", socket.id);
        });

        // Join personal room and deliver any pending connection requests (e.g. phone sent request while PC wasn't in room)
        (async () => {
            const u = await getAuthedUser();
            if (!u?.id) return;
            const roomName = "user:" + u.id;
            socket.join(roomName);
            console.log(`[Socket] User ${u.id} joined personal room: ${roomName}`);

            const pending = await sql`
                SELECT cr.id, cr.from_user_id, u.username AS from_name, u.avatar_url AS from_avatar
                FROM connection_requests cr
                JOIN users u ON u.id = cr.from_user_id
                WHERE cr.to_user_id = ${u.id} AND cr.status = 'pending'
            `;
            for (const row of pending) {
                socket.emit("connection_request", {
                    from_user_id: row.from_user_id,
                    from_name: row.from_name,
                    from_avatar: row.from_avatar,
                    from_code: row.from_user_id.toString().slice(0, 8),
                });
                console.log(`[Socket] Delivered pending request from ${row.from_name} to user ${u.id}`);
            }
        })();
    });

}

module.exports = socketHandler;