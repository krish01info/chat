const { AccessToken } = require("livekit-server-sdk");

async function createToken(identity, room){

    const at = new AccessToken(
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET,
        { identity }
    );

    at.addGrant({
        roomJoin: true,
        room: room,
        canPublish: true,
        canSubscribe: true
    });

    return await at.toJwt();
}

module.exports = createToken;
