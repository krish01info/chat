import { Room } from "livekit-client";

let room = null;
let localVideoContainer = null;
let remoteVideosContainer = null;
let onLeaveCallback = null;

function getUsername() {
  const params = new URLSearchParams(window.location.search);
  return params.get("username") || "Guest";
}

function createVideoElement(participantIdentity, isLocal) {
  const div = document.createElement("div");
  div.className = `video-tile ${isLocal ? "local" : "remote"}`;
  div.dataset.identity = participantIdentity;
  div.innerHTML = `
    <div class="video-label">${isLocal ? "You" : participantIdentity}</div>
    <div class="video-wrap"></div>
  `;
  return div;
}

function attachTrackToContainer(track, container, publication) {
  if (!container) return;
  const wrap = container.querySelector(".video-wrap") || container;
  const el = track.attach();
  el.setAttribute("playsinline", "true");
  if (publication?.sid) el.dataset.publicationSid = publication.sid;
  wrap.appendChild(el);
}

function removeTrackFromContainer(container, publicationSid) {
  if (!container) return;
  const wrap = container.querySelector(".video-wrap");
  if (!wrap) return;
  if (publicationSid) {
    const el = wrap.querySelector(`[data-publication-sid="${publicationSid}"]`);
    if (el) el.remove();
  } else wrap.innerHTML = "";
}

export async function joinVideo(options = {}) {
  onLeaveCallback = options.onLeave || (() => {});

  const username = getUsername().trim() || "Guest";

  const app = document.querySelector("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="video-call">
      <header class="call-header">
        <span class="call-title">Video Call</span>
        <span class="participant-count" id="participantCount">Connecting…</span>
      </header>
      <div class="video-grid" id="videoGrid">
        <div class="video-tile local" data-identity="local">
          <div class="video-label">You</div>
          <div class="video-wrap"></div>
        </div>
      </div>
      <div class="call-controls">
        <button type="button" id="toggleMic" class="control-btn" title="Mute / Unmute microphone">
          <span class="icon">🎤</span>
          <span class="label">Mute</span>
        </button>
        <button type="button" id="toggleCamera" class="control-btn" title="Turn camera on / off">
          <span class="icon">📹</span>
          <span class="label">Camera</span>
        </button>
        <button type="button" id="disconnectBtn" class="control-btn disconnect" title="Leave call">
          <span class="icon">📞</span>
          <span class="label">Leave</span>
        </button>
      </div>
    </div>
  `;

  const videoGrid = document.getElementById("videoGrid");
  localVideoContainer = videoGrid.querySelector('.video-tile[data-identity="local"]');
  remoteVideosContainer = videoGrid;

  try {
    const res = await fetch(`/livekit/getToken?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!data.token) throw new Error(data.error || "Failed to get token");

    room = new Room();

    room.on("trackSubscribed", (track, publication, participant) => {
      let tile = videoGrid.querySelector(`.video-tile.remote[data-identity="${participant.identity}"]`);
      if (!tile) {
        tile = createVideoElement(participant.identity, false);
        videoGrid.appendChild(tile);
      }
      attachTrackToContainer(track, tile, publication);
      updateParticipantCount();
    });

    room.on("trackUnsubscribed", (track, publication, participant) => {
      const tile = videoGrid.querySelector(`.video-tile.remote[data-identity="${participant.identity}"]`);
      if (tile) removeTrackFromContainer(tile, publication?.sid);
    });

    room.on("participantDisconnected", (participant) => {
      const tile = videoGrid.querySelector(`.video-tile.remote[data-identity="${participant.identity}"]`);
      if (tile) tile.remove();
      updateParticipantCount();
    });

    room.on("disconnected", () => {
      cleanup();
      if (onLeaveCallback) onLeaveCallback();
    });

    await room.connect(data.url, data.token);
    await room.localParticipant.enableCameraAndMicrophone();

    room.localParticipant.videoTrackPublications.forEach((pub) => {
      const track = pub.track;
      if (track) attachTrackToContainer(track, localVideoContainer, pub);
    });
    room.localParticipant.audioTrackPublications.forEach((pub) => {
      const track = pub.track;
      if (track) attachTrackToContainer(track, localVideoContainer, pub);
    });

    updateParticipantCount();
    updateControlLabels();

    document.getElementById("disconnectBtn").onclick = leaveRoom;
    document.getElementById("toggleMic").onclick = toggleMic;
    document.getElementById("toggleCamera").onclick = toggleCamera;
  } catch (err) {
    console.error(err);
    alert(err.message || "Could not join the call");
    if (onLeaveCallback) onLeaveCallback();
  }
}

function updateParticipantCount() {
  const el = document.getElementById("participantCount");
  if (!el || !room) return;
  const remote = room.remoteParticipants.size;
  el.textContent = remote === 0 ? "Waiting for others…" : `${1 + remote} in call`;
}

function updateControlLabels() {
  if (!room) return;
  const mic = document.getElementById("toggleMic");
  const cam = document.getElementById("toggleCamera");
  if (mic) {
    const muted = room.localParticipant.isMicrophoneEnabled === false;
    mic.querySelector(".label").textContent = muted ? "Unmute" : "Mute";
    mic.classList.toggle("active", muted);
  }
  if (cam) {
    const off = room.localParticipant.isCameraEnabled === false;
    cam.querySelector(".label").textContent = off ? "Start camera" : "Stop camera";
    cam.classList.toggle("active", off);
  }
}

function toggleMic() {
  if (!room) return;
  const enabled = room.localParticipant.isMicrophoneEnabled;
  room.localParticipant.setMicrophoneEnabled(!enabled);
  updateControlLabels();
}

function toggleCamera() {
  if (!room) return;
  const enabled = room.localParticipant.isCameraEnabled;
  room.localParticipant.setCameraEnabled(!enabled);
  updateControlLabels();
}

export function leaveRoom() {
  if (!room) {
    cleanup();
    if (onLeaveCallback) onLeaveCallback();
    return;
  }
  room.disconnect(true);
  cleanup();
  if (onLeaveCallback) onLeaveCallback();
}

function cleanup() {
  room = null;
  localVideoContainer = null;
  remoteVideosContainer = null;
}
