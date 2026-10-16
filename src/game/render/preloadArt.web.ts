// On the web, Skia (CanvasKit) loads only when the game canvas mounts (GameCanvas.web.tsx), so the pictures
// are loaded there, all at once, before the first frame is drawn.
export function preloadGameArt() {}
