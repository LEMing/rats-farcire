import { Game } from './core/Game';
import { MenuRenderer } from './rendering/MenuRenderer';
import { debug } from './utils/debug';
import { errorHandler } from './utils/errorHandler';

// ============================================================================
// Entry Point
// ============================================================================

// Initialize global error handling
errorHandler.init();

// Clean up any existing WebGL contexts from HMR
function cleanupExistingContexts() {
  const canvases = document.querySelectorAll('canvas');
  canvases.forEach((canvas) => {
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
      canvas.remove();
    } catch {
      // Ignore cleanup errors
    }
  });
}

// Clean up on HMR (Vite dev mode only)
// @ts-expect-error - Vite HMR API not typed
if (import.meta.hot) {
  // @ts-expect-error - Vite HMR API not typed
  import.meta.hot.dispose(() => {
    cleanupExistingContexts();
  });
}

// Clean up any lingering contexts from previous page loads
cleanupExistingContexts();

const game = new Game();
let menuRenderer: MenuRenderer | null = null;

// Initialize menu background with delay to let contexts release
async function initMenuBackground() {
  // Wait for any previous contexts to be fully released
  await new Promise((resolve) => setTimeout(resolve, 150));

  const menuBgContainer = document.getElementById('menu-background')!;
  menuRenderer = new MenuRenderer(menuBgContainer);

  try {
    await menuRenderer.init();
    menuRenderer.start();
  } catch (e) {
    // Menu background is optional - game can still work without it
    debug.warn('Menu background failed to initialize, continuing without it:', e);
    menuRenderer = null;
  }
}

// Start menu background immediately
initMenuBackground().catch(debug.error);

// Menu button handlers
const menuScreen = document.getElementById('menu-screen')!;
const btnSingleplayer = document.getElementById('btn-singleplayer')!;
const btnMultiplayer = document.getElementById('btn-multiplayer')!;

// Helper to wait for WebGL context release
const waitForContextRelease = () => new Promise((resolve) => setTimeout(resolve, 100));

btnSingleplayer.addEventListener('click', async () => {
  // Stop and dispose menu renderer
  if (menuRenderer) {
    menuRenderer.dispose();
    menuRenderer = null;
    // Wait for WebGL context to be released
    await waitForContextRelease();
  }
  menuScreen.classList.add('hidden');
  await game.start(false);
});

btnMultiplayer.addEventListener('click', async () => {
  // Stop and dispose menu renderer
  if (menuRenderer) {
    menuRenderer.dispose();
    menuRenderer = null;
    // Wait for WebGL context to be released
    await waitForContextRelease();
  }
  menuScreen.classList.add('hidden');
  await game.start(true);
});

// Hide cursor during gameplay
document.addEventListener('click', () => {
  if (!menuScreen.classList.contains('hidden')) return;
  document.body.style.cursor = 'none';
});

// Handle window resize
window.addEventListener('resize', () => {
  if (menuRenderer) {
    menuRenderer.resize(window.innerWidth, window.innerHeight);
  }
  game.resize();
});

// Prevent context menu
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Debug: expose game to console
(window as unknown as { game: Game }).game = game;

debug.log('Rats Farcire loaded!');
