import { Game } from './core/Game';

// ============================================================================
// Entry Point
// ============================================================================

const game = new Game();

// Menu button handlers
const menuScreen = document.getElementById('menu-screen')!;
const btnSingleplayer = document.getElementById('btn-singleplayer')!;
const btnMultiplayer = document.getElementById('btn-multiplayer')!;

btnSingleplayer.addEventListener('click', () => {
  menuScreen.classList.add('hidden');
  game.start(false);
});

btnMultiplayer.addEventListener('click', () => {
  menuScreen.classList.add('hidden');
  game.start(true);
});

// Hide cursor during gameplay
document.addEventListener('click', () => {
  if (!menuScreen.classList.contains('hidden')) return;
  document.body.style.cursor = 'none';
});

// Handle window resize
window.addEventListener('resize', () => {
  game.resize();
});

// Prevent context menu
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Debug: expose game to console
(window as unknown as { game: Game }).game = game;

console.log('Rats Farcire loaded. Click to start!');
