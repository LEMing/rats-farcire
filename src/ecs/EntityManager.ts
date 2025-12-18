import type {
  PlayerState,
  EnemyState,
  ProjectileState,
  PickupState,
  SerializedGameState,
  Vec3,
} from '@shared/types';
import { Renderer } from '../rendering/Renderer';
import { EntityFactory } from './EntityFactory';
import { EntityAnimator, EntityVisual } from './EntityAnimator';

// ============================================================================
// Entity Manager - Handles visual representation of game entities
// ============================================================================

export class EntityManager {
  private renderer: Renderer;
  private factory: EntityFactory;
  private animator: EntityAnimator;
  private entities: Map<string, EntityVisual> = new Map();
  public localPlayerId: string | null = null;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.factory = new EntityFactory(renderer);
    this.animator = new EntityAnimator(renderer);
  }

  setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  // ============================================================================
  // Entity Creation (delegated to EntityFactory)
  // ============================================================================

  createPlayer(state: PlayerState): void {
    const group = this.factory.createPlayer(state);

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createEnemy(state: EnemyState): void {
    const group = this.factory.createEnemy(state);

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createProjectile(state: ProjectileState): void {
    const group = this.factory.createProjectile(state);

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createPickup(state: PickupState): void {
    const group = this.factory.createPickup(state);

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: 0 },
      currentState: { position: { ...state.position }, rotation: 0 },
    });
  }

  // ============================================================================
  // Entity Updates
  // ============================================================================

  updatePlayer(state: PlayerState): void {
    this.updateEntityState(state.id, state.position, state.rotation);

    // Update carrying indicator visibility
    const entity = this.entities.get(state.id);
    if (entity) {
      const indicator = entity.mesh.getObjectByName('carryIndicator');
      if (indicator) {
        indicator.visible = state.carryingCellId !== null;

        // Animate the indicator (rotate and bob)
        if (indicator.visible) {
          const time = performance.now() * 0.001;
          const miniCore = indicator.getObjectByName('miniCore');
          const miniGlow = indicator.getObjectByName('miniGlow');
          if (miniCore && miniGlow) {
            miniCore.rotation.y = time * 2;
            miniGlow.rotation.y = -time * 1.5;
            indicator.position.y = 1.8 + Math.sin(time * 3) * 0.1;
          }
        }
      }
    }
  }

  updateEnemy(state: EnemyState): void {
    this.updateEntityState(state.id, state.position, state.rotation);
  }

  updateProjectile(state: ProjectileState): void {
    this.updateEntityState(state.id, state.position, state.rotation);
    // Laser shader handles the visual trail effect
  }

  private updateEntityState(id: string, position: Vec3, rotation: number): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    entity.prevState = { ...entity.currentState };
    entity.currentState = { position: { ...position }, rotation };
  }

  removeEntity(id: string): void {
    const entity = this.entities.get(id);
    if (entity) {
      this.renderer.removeFromScene(entity.mesh);
      this.entities.delete(id);
    }
    // Clean up animator state
    this.animator.cleanupEntity(id);
  }

  // Fade out an enemy over time (death animation)
  fadeOutEnemy(id: string, duration: number): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.animator.fadeOutEnemy(entity, duration);
  }

  // Trigger damage visual effects on enemy
  damageEnemy(id: string, health: number, maxHealth: number): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.animator.triggerDamageEffects(id, entity, health, maxHealth);
  }

  // ============================================================================
  // Interpolation & Visual Updates (delegated to EntityAnimator)
  // ============================================================================

  updateVisuals(alpha: number): void {
    this.animator.updateVisuals(this.entities, alpha);
  }

  // Update enemy state for speech bubble animation
  updateEnemyState(state: EnemyState): void {
    this.animator.updateEnemyState(state);
  }

  // ============================================================================
  // Muzzle Flash
  // ============================================================================

  triggerMuzzleFlash(playerId: string): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;
    this.animator.triggerMuzzleFlash(entity);
  }

  // ============================================================================
  // Afterimage System for Dash
  // ============================================================================

  spawnAfterimage(playerId: string, position: Vec3): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;

    const ghostGroup = this.factory.createAfterimage(position, entity.mesh.rotation.y);
    this.animator.addAfterimage(ghostGroup);
  }

  getLocalPlayerPosition(): Vec3 | null {
    if (!this.localPlayerId) return null;
    const entity = this.entities.get(this.localPlayerId);
    return entity?.currentState.position ?? null;
  }

  // ============================================================================
  // Multiplayer State Synchronization
  // ============================================================================

  applyServerState(state: SerializedGameState): void {
    // Collect all current server entity IDs by type
    const serverPlayerIds = new Set(state.players.map(([id]) => id));
    const serverEnemyIds = new Set(state.enemies.map(([id]) => id));
    const serverProjectileIds = new Set(state.projectiles.map(([id]) => id));
    const serverPickupIds = new Set(state.pickups.map(([id]) => id));

    // Sync players
    for (const [id, playerState] of state.players) {
      if (!this.entities.has(id)) {
        this.createPlayer(playerState);
      } else {
        this.updatePlayer(playerState);
      }
    }

    // Sync enemies
    for (const [id, enemyState] of state.enemies) {
      if (!this.entities.has(id)) {
        this.createEnemy(enemyState);
      } else {
        this.updateEnemy(enemyState);
      }
    }

    // Sync projectiles
    for (const [id, projState] of state.projectiles) {
      if (!this.entities.has(id)) {
        this.createProjectile(projState);
      } else {
        this.updateProjectile(projState);
      }
    }

    // Sync pickups
    for (const [id, pickupState] of state.pickups) {
      if (!this.entities.has(id)) {
        this.createPickup(pickupState);
      }
    }

    // Remove entities that no longer exist on server
    const toRemove: string[] = [];
    for (const [id, entity] of this.entities) {
      const type = entity.mesh.userData.entityType;
      let shouldRemove = false;

      switch (type) {
        case 'player':
          shouldRemove = !serverPlayerIds.has(id);
          break;
        case 'enemy':
          shouldRemove = !serverEnemyIds.has(id);
          break;
        case 'projectile':
          shouldRemove = !serverProjectileIds.has(id);
          break;
        case 'pickup':
          shouldRemove = !serverPickupIds.has(id);
          break;
      }

      if (shouldRemove) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeEntity(id);
    }
  }
}
