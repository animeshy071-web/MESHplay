import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Starts the Remote Play server (LAN WebSocket + phone page) alongside the
// dev server, so `npm run dev` gives the full experience in one command.
function meshplayRemote(): Plugin {
  return {
    name: 'meshplay-remote-dev',
    configureServer() {
      if (process.env.MESHPLAY_REMOTE === 'off') return
      import('./scripts/remote-server.mjs')
        .then((m) => m.startRemoteServer())
        .catch((e) => console.error('[MESHplay Remote] failed to start:', e.message))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), meshplayRemote()],
})
