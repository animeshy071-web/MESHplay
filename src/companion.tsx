// Companion window entry — the floating always-on-top stats widget for
// native PC games (opened by the Tauri launcher as a second frameless window).
import { createRoot } from 'react-dom/client'
import CompanionOverlay from './components/CompanionOverlay'

createRoot(document.getElementById('root')!).render(<CompanionOverlay />)
