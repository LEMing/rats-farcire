# Technical Review: Rats Farcire

**Date:** December 2024
**Reviewers:** Senior Developer & Senior Software Architect

---

## Part 1: Tech Debt Review (Senior Developer Perspective)

### Summary Stats

| Metric | Value | Status |
|--------|-------|--------|
| Largest files | 4 files > 800 lines | Warning |
| Test coverage | 0% (no tests) | Critical |
| `any` type usage | 21 occurrences | Warning |
| Console statements | 20 | Warning |
| ESLint disables | 7 | Warning |
| TODO comments | 0 found | Good |

### Critical Tech Debt

#### 1. No Test Coverage

**Risk:** HIGH
**Impact:** Refactoring is risky, bugs ship to production

- Zero unit tests
- No integration tests
- No e2e tests
- Makes refactoring dangerous

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

### Phase 1: Foundation (Immediate)

1. **Add Testing Infrastructure**
   - Set up Vitest
   - Write tests for `WaveManager`, `ObjectiveSystem` (already clean)
   - Target: 50% coverage on systems/

2. **Create EventBus**
   - Simple pub/sub for game events
   - Decouple LocalGameLoop from Renderer

### Phase 2: Refactor God Classes

3. **Split EntityManager**
   - Extract `EntityFactory` (mesh creation)
   - Extract `EntityAnimator` (visual effects)

4. **Split Renderer**
   - Extract `MapRenderer`
   - Extract `EffectsManager`

### Phase 3: Polish

5. **Remove console.log statements** (use debug flag)
6. **Fix all `any` types**
7. **Add proper error boundaries**

---

## File Size Reference

| File | Lines | Status |
|------|-------|--------|
| EntityManager.ts | 1,125 | Needs splitting |
| Renderer.ts | 1,106 | Needs splitting |
| UIManager.ts | 982 | Needs splitting |
| LocalGameLoop.ts | 825 | Acceptable after recent refactor |
| EnemyAI.ts | 526 | Acceptable |
| TardisFactory.ts | 492 | Acceptable (focused) |
| MenuRenderer.ts | 480 | Acceptable |
| MapDecorations.ts | 461 | Acceptable (focused) |
| MapGenerator.ts | 432 | Acceptable |
| ObjectiveSystem.ts | 252 | Good (clean extraction) |
| ParticleSystem.ts | 210 | Good (clean extraction) |
| WaveManager.ts | 168 | Good (clean extraction) |
