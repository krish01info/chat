import { defineConfig } from 'vite'

export default defineConfig({
  base: '/video/',
  server:{
    proxy:{
      "/livekit":"http://localhost:4000",
      "/socket.io":"http://localhost:4000"
    }
  }
})
