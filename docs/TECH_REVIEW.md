# Technical Review: Rats Farcire

**Date:** December 2024
**Reviewers:** Senior Developer & Senior Software Architect

---

## Part 1: Tech Debt Review (Senior Developer Perspective)

### Summary Stats

| Metric | Value | Status |
|--------|-------|--------|
| Largest files | 4 files > 800 lines | Warning |
| Test coverage | 45 tests (systems/ covered) | Improved |
| `any` type usage | 21 occurrences | Warning |
| Console statements | 20 | Warning |
| ESLint disables | 7 | Warning |
| TODO comments | 0 found | Good |
| EventBus | Type-safe, 14 event types | Good |

### Critical Tech Debt

#### 1. ~~No Test Coverage~~ - ADDRESSED

**Risk:** ~~HIGH~~ MEDIUM (improved)
**Impact:** Core systems now have test coverage

- [x] 45 unit tests added (WaveManager, ObjectiveSystem, EventBus)
- [ ] No integration tests
- [ ] No e2e tests
- Refactoring core systems is now safer

#### 2. God Classes Remain

| File | Lines | Concern |
|------|-------|---------|
| EntityManager.ts | 1,125 | Handles ALL entity lifecycle, rendering setup, animations |
| Renderer.ts | 1,106 | Map building, camera, effects, power cells, TARDIS |
| UIManager.ts | 982 | All UI elements in one class |
| LocalGameLoop.ts | 825 | Better after extraction, still large |

#### 3. Type Safety Issues

- 21 uses of `any` type
- 7 ESLint disable comments (mostly in Renderer/MenuRenderer)
- Type assertions (`as`) used frequently

#### 4. Console Statements in Production

- 20 console.log/warn/error statements
- Should use proper logging service or strip in production

### Medium Priority Debt

#### 5. Hardcoded Magic Numbers

```typescript
// Found in various files
const HITSTOP_DURATION = 8; // Why 8?
light.intensity = 0.8 + pulse * 0.4; // Magic multipliers
```

#### 6. Mixed Responsibilities in Callbacks

```typescript
// LocalGameLoop handles game logic AND visual feedback
private handleCellDelivered(cellNumber: number, totalCells: number): void {
  this.renderer.setTardisPowerLevel(cellNumber);  // Visual
  this.ui.showNotification(...);                   // UI
  this.player.score += 500;                        // Game logic
  this.renderer.addScreenShake(0.6);               // Visual
  this.waveManager.addBonusEnemies(MINI_HORDE_SIZE); // Game logic
}
```

#### 7. Inconsistent Error Handling

- Some try/catch blocks, others assume success
- No centralized error handling strategy

---

## Part 2: Architecture Review (Senior Architect Perspective)

### Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         main.ts                              │
│                            │                                 │
│                         Game.ts                              │
│              ┌─────────────┼─────────────┐                  │
│              │             │             │                   │
│              ▼             ▼             ▼                   │
│      ┌───────────┐  ┌───────────┐  ┌──────────┐            │
│      │ Renderer  │  │LocalGame  │  │InputMgr  │            │
│      │  (1106)   │  │Loop (825) │  │  (126)   │            │
│      └─────┬─────┘  └─────┬─────┘  └──────────┘            │
│            │              │                                  │
│            │        ┌─────┴─────┐                           │
│            │        │           │                            │
│            │   ┌────▼───┐  ┌────▼────┐                      │
│            │   │WaveMgr │  │Objective│                      │
│            │   │ (168)  │  │Sys (252)│                      │
│            │   └────────┘  └─────────┘                      │
│            │                                                 │
│      ┌─────▼─────┐  ┌───────────┐  ┌──────────┐            │
│      │ Particle  │  │EntityMgr  │  │ UIManager│            │
│      │Sys (210)  │  │  (1125)   │  │  (982)   │            │
│      └───────────┘  └───────────┘  └──────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Strengths

1. **Clear Separation Started**
   - `shared/` for cross-cutting types/constants
   - `systems/` for extracted game systems
   - Callback pattern for decoupling

2. **Dependency Injection Foundation**
   - `GameDependencies` interface exists
   - `IRenderer`, `IUIManager` interfaces defined
   - Ready for testing infrastructure

3. **Single Entry Point**
   - Clear flow from `main.ts` → `Game.ts`
   - Menu system separated from game

4. **Good Domain Modeling**
   - `PowerCellState`, `WaveState`, `ObjectiveState` are clean
   - Shared types are well-defined

### Architecture Weaknesses

#### 1. Renderer is an Anti-Pattern (Facade doing too much)

```
Renderer responsibilities:
├── Scene management
├── Camera control
├── Map building (walls, floors, decorations)
├── Power cell rendering
├── TARDIS rendering
├── Particle system (delegated)
├── Blood decals
├── Torch flickering
├── Screen shake
├── Post-processing
└── Coordinate conversion
```

**Recommendation:** Extract into focused renderers:
- `SceneManager` - Scene, camera, lighting
- `MapRenderer` - Tiles, walls, decorations
- `EffectsRenderer` - Particles, decals, shake
- `EntityRenderer` - Player, enemies, projectiles (currently in EntityManager)

#### 2. EntityManager Violates SRP

```
EntityManager responsibilities:
├── Entity creation (Player, Enemy, Projectile, Pickup)
├── Entity state management
├── THREE.js mesh creation (detailed models!)
├── Animation (afterimages, health bars, speech bubbles)
├── Visual updates
└── Server state synchronization
```

**Recommendation:** Split into:
- `EntityRegistry` - Pure state management
- `EntityFactory` - Mesh creation
- `EntityAnimator` - Visual effects

#### 3. Tight Coupling Between Game Logic and Rendering

```typescript
// LocalGameLoop directly calls renderer
this.renderer.spawnBloodBurst(enemy.position, enemy.enemyType, 2);
this.renderer.addScreenShake(0.15);
const screenPos = this.renderer.worldToScreen(enemy.position);
```

**Recommendation:** Event-driven architecture
```typescript
// Better: emit events, renderer subscribes
this.events.emit('enemyHit', { position, type });
this.events.emit('screenShake', { intensity: 0.15 });
```

#### 4. Missing Layer Separation

```
Current:  Game → LocalGameLoop → Renderer (direct calls)
Better:   Game → GameLogic → EventBus → Renderer
                           → EventBus → Audio (future)
                           → EventBus → Analytics (future)
```

#### 5. No Service Layer

- Network calls mixed with game logic
- No abstraction for persistence (future: save games)
- No abstraction for audio (future feature)

### Recommended Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │SceneSetup│  │EntityViz │  │EffectsViz│  │   UI     │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       └─────────────┴─────────────┴─────────────┘          │
│                           │                                  │
│                     EventBus                                 │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                    Application Layer                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ GameLoop │  │WaveSystem│  │Objective │  │ Combat   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                      Domain Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Entities │  │  Rules   │  │   Map    │  │   AI     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Network  │  │  Storage │  │  Input   │  │  Audio   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Prioritized Action Plan

### Phase 1: Foundation (Immediate) - COMPLETED

1. **Add Testing Infrastructure** - DONE
   - [x] Set up Vitest with coverage configuration
   - [x] Write tests for `WaveManager` (11 tests)
   - [x] Write tests for `ObjectiveSystem` (15 tests)
   - [x] Write tests for `EventBus` (19 tests)
   - Total: 45 passing tests

2. **Create EventBus** - DONE
   - [x] Type-safe pub/sub system (`src/core/EventBus.ts`)
   - [x] Defined all game events with typed payloads
   - [x] Integrated into LocalGameLoop (emitting events alongside direct calls)
   - Events: screenShake, bloodBurst, hitStop, enemyHit, enemyKilled, playerHit, playerDied, cellPickedUp, cellDropped, cellDelivered, objectiveComplete, waveStarted, waveCompleted, gameOver

### Phase 2: Refactor God Classes - COMPLETED

3. **Split EntityManager** - DONE
   - [x] Extract `EntityFactory` (578 lines - mesh creation)
   - [x] Extract `EntityAnimator` (439 lines - visual effects)
   - EntityManager reduced from 1,125 to 268 lines (76% reduction)

4. **Split Renderer** - DONE
   - [x] Extract `MapRenderer` (661 lines - map, torches, TARDIS, power cells)
   - [x] EffectsManager skipped - ParticleSystem already handles effects, remaining code minimal
   - Renderer reduced from 1,106 to 551 lines (50% reduction)

### Phase 3: Polish

5. **Remove console.log statements** (use debug flag)
6. **Fix all `any` types**
7. **Add proper error boundaries**

---

## File Size Reference

| File | Lines | Status |
|------|-------|--------|
| UIManager.ts | 982 | Needs splitting |
| LocalGameLoop.ts | 825 | Acceptable after recent refactor |
| MapRenderer.ts | 661 | Good (extracted from Renderer) |
| EntityFactory.ts | 578 | Good (extracted from EntityManager) |
| Renderer.ts | 551 | Good (50% reduction after extraction) |
| EnemyAI.ts | 526 | Acceptable |
| TardisFactory.ts | 492 | Acceptable (focused) |
| MenuRenderer.ts | 480 | Acceptable |
| MapDecorations.ts | 461 | Acceptable (focused) |
| EntityAnimator.ts | 439 | Good (extracted from EntityManager) |
| MapGenerator.ts | 432 | Acceptable |
| EntityManager.ts | 268 | Good (76% reduction after extraction) |
| ObjectiveSystem.ts | 252 | Good (clean extraction) |
| ParticleSystem.ts | 210 | Good (clean extraction) |
| WaveManager.ts | 168 | Good (clean extraction) |
