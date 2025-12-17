import { Game } from './core/Game';
import { MenuRenderer } from './rendering/MenuRenderer';

// ============================================================================
// Entry Point
// ============================================================================

const game = new Game();
let menuRenderer: MenuRenderer | null = null;

// Initialize menu background
async function initMenuBackground() {
  const menuBgContainer = document.getElementById('menu-background')!;
  menuRenderer = new MenuRenderer(menuBgContainer);
  await menuRenderer.init();
  menuRenderer.start();
}

// Start menu background immediately
initMenuBackground().catch(console.error);

// Menu button handlers
const menuScreen = document.getElementById('menu-screen')!;
const btnSingleplayer = document.getElementById('btn-singleplayer')!;
const btnMultiplayer = document.getElementById('btn-multiplayer')!;

btnSingleplayer.addEventListener('click', async () => {
  // Stop and dispose menu renderer
  if (menuRenderer) {
    menuRenderer.dispose();
    menuRenderer = null;
  }
  menuScreen.classList.add('hidden');
  await game.start(false);
});

btnMultiplayer.addEventListener('click', async () => {
  // Stop and dispose menu renderer
  if (menuRenderer) {
    menuRenderer.dispose();
    menuRenderer = null;
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

console.log('Rats Farcire loaded!');
