import "./style.css";
import { joinVideo } from "./video";

function renderLobby() {
  const app = document.querySelector("#app");
  if (!app) return;
  app.innerHTML = `
    <div class="video-lobby">
      <div class="lobby-card">
        <h1>Video Call</h1>
        <p class="lobby-sub">Start or join a video call with others</p>
        <button type="button" id="joinBtn" class="btn btn-primary">Join Video Call</button>
      </div>
    </div>
  `;
  document.getElementById("joinBtn").onclick = () => {
    joinVideo({ onLeave: renderLobby });
  };
}

renderLobby();
