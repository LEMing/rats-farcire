import * as THREE from 'three';
import type {
  PlayerState,
  EnemyState,
  ProjectileState,
  PickupState,
  SerializedGameState,
  Vec3,
} from '@shared/types';
import { Renderer } from '../rendering/Renderer';
import { lerpVec3, lerpAngle } from '@shared/utils';
import { COLORS, POWERUP_CONFIGS } from '@shared/constants';
import { BlurredEmblemMaterial } from '../rendering/BlurredEmblemMaterial';
import { TargetingLaserMaterial } from '../rendering/LaserMaterial';

// ============================================================================
// Entity Visual Representation
// ============================================================================

interface EntityVisual {
  mesh: THREE.Group;
  prevState: { position: Vec3; rotation: number };
  currentState: { position: Vec3; rotation: number };
}

// ============================================================================
// Entity Manager - Handles visual representation of game entities
// ============================================================================

export class EntityManager {
  private renderer: Renderer;
  private entities: Map<string, EntityVisual> = new Map();
  public localPlayerId: string | null = null;

  // Afterimage system for dash
  private afterimages: { mesh: THREE.Group; lifetime: number }[] = [];

  // Enemy state tracking for speech bubble animation
  private enemyStates: Map<string, EnemyState> = new Map();

  // Damage visual state tracking
  private enemyDamageStates: Map<string, {
    flashTime: number;       // Time remaining for white flash
    staggerOffset: { x: number; z: number };  // Current shake offset
    staggerTime: number;     // Time remaining for shake
    lastHealth: number;      // Track health for showing damage
  }> = new Map();

  // Player recoil state
  private playerRecoil = {
    offset: 0,      // Current backward offset
    tilt: 0,        // Current tilt angle
    recovery: 0.15, // How fast recoil recovers
  };

  // Shared speech bubble geometry/material
  private bubbleGeometry!: THREE.PlaneGeometry;
  private bubbleMaterial!: THREE.MeshBasicMaterial;
  private emblemGeometry!: THREE.PlaneGeometry;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.initSpeechBubbleAssets();
  }

  private initSpeechBubbleAssets(): void {
    // Shared geometry for all speech bubbles
    this.bubbleGeometry = new THREE.PlaneGeometry(0.7, 0.5);
    this.bubbleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.emblemGeometry = new THREE.PlaneGeometry(0.3, 0.3);
  }

  setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  // ============================================================================
  // Entity Creation
  // ============================================================================

  createPlayer(state: PlayerState): void {
    const group = new THREE.Group();

    // === DALEK MODEL ===
    const dalekColor = 0x4488cc; // Blue Dalek
    const dalekMetal = 0x888899; // Metallic parts
    const dalekGold = 0xccaa44; // Gold accents
    const dalekDark = 0x222233; // Dark parts

    // --- Base skirt (bottom section with bumps) ---
    const skirtGeom = new THREE.CylinderGeometry(0.5, 0.6, 0.5, 16);
    const skirtMat = new THREE.MeshLambertMaterial({ color: dalekColor });
    const skirt = new THREE.Mesh(skirtGeom, skirtMat);
    skirt.position.y = 0.25;
    skirt.castShadow = true;
    group.add(skirt);

    // Bumps on skirt (Dalek spheres) - 2 rows
    const bumpMat = new THREE.MeshLambertMaterial({ color: dalekGold });
    for (let row = 0; row < 2; row++) {
      const bumpCount = 8;
      const radius = 0.52 - row * 0.05;
      const y = 0.15 + row * 0.2;
      for (let i = 0; i < bumpCount; i++) {
        const angle = (i / bumpCount) * Math.PI * 2;
        const bumpGeom = new THREE.SphereGeometry(0.08, 8, 8);
        const bump = new THREE.Mesh(bumpGeom, bumpMat);
        bump.position.set(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
        group.add(bump);
      }
    }

    // --- Middle section (weapons platform) ---
    const midGeom = new THREE.CylinderGeometry(0.4, 0.5, 0.3, 16);
    const midMat = new THREE.MeshLambertMaterial({ color: dalekMetal });
    const mid = new THREE.Mesh(midGeom, midMat);
    mid.position.y = 0.65;
    mid.castShadow = true;
    group.add(mid);

    // --- Shoulder section ---
    const shoulderGeom = new THREE.CylinderGeometry(0.35, 0.4, 0.2, 16);
    const shoulder = new THREE.Mesh(shoulderGeom, midMat);
    shoulder.position.y = 0.9;
    group.add(shoulder);

    // Slats around shoulder
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const slatGeom = new THREE.BoxGeometry(0.02, 0.15, 0.08);
      const slatMat = new THREE.MeshLambertMaterial({ color: dalekDark });
      const slat = new THREE.Mesh(slatGeom, slatMat);
      slat.position.set(Math.sin(angle) * 0.38, 0.9, Math.cos(angle) * 0.38);
      slat.rotation.y = -angle;
      group.add(slat);
    }

    // --- Dome head ---
    const domeGeom = new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshLambertMaterial({ color: dalekColor });
    const dome = new THREE.Mesh(domeGeom, domeMat);
    dome.position.y = 1.0;
    dome.castShadow = true;
    group.add(dome);

    // Dome lights (ears)
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    for (let side = -1; side <= 1; side += 2) {
      const lightGeom = new THREE.SphereGeometry(0.06, 8, 8);
      const light = new THREE.Mesh(lightGeom, lightMat);
      light.position.set(side * 0.2, 1.2, 0);
      group.add(light);
    }

    // --- Eyestalk ---
    const eyestalkGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8);
    const eyestalkMat = new THREE.MeshLambertMaterial({ color: dalekMetal });
    const eyestalk = new THREE.Mesh(eyestalkGeom, eyestalkMat);
    eyestalk.position.set(0, 1.05, 0.25);
    eyestalk.rotation.x = Math.PI / 2.5;
    group.add(eyestalk);

    // Eye (glowing)
    const eyeGeom = new THREE.SphereGeometry(0.05, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const eye = new THREE.Mesh(eyeGeom, eyeMat);
    eye.position.set(0, 1.15, 0.45);
    group.add(eye);

    // --- Gun arm (death ray) ---
    const gunArmGeom = new THREE.CylinderGeometry(0.03, 0.05, 0.5, 8);
    const gunArmMat = new THREE.MeshLambertMaterial({ color: dalekDark });
    const gunArm = new THREE.Mesh(gunArmGeom, gunArmMat);
    gunArm.position.set(0.25, 0.65, 0.35);
    gunArm.rotation.x = Math.PI / 2;
    group.add(gunArm);

    // Gun tip
    const gunTipGeom = new THREE.SphereGeometry(0.04, 8, 8);
    const gunTip = new THREE.Mesh(gunTipGeom, new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    gunTip.position.set(0.25, 0.65, 0.6);
    group.add(gunTip);

    // --- Plunger arm ---
    const plungerArmGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
    const plungerArm = new THREE.Mesh(plungerArmGeom, gunArmMat);
    plungerArm.position.set(-0.25, 0.65, 0.3);
    plungerArm.rotation.x = Math.PI / 2;
    group.add(plungerArm);

    // Plunger cup
    const plungerGeom = new THREE.CylinderGeometry(0.08, 0.06, 0.05, 12);
    const plunger = new THREE.Mesh(plungerGeom, new THREE.MeshLambertMaterial({ color: 0x333333 }));
    plunger.position.set(-0.25, 0.65, 0.52);
    plunger.rotation.x = Math.PI / 2;
    group.add(plunger);

    // === Muzzle flash (at gun tip) ===
    const flashGeom = new THREE.PlaneGeometry(0.5, 0.5);
    const flashMat = new THREE.MeshBasicMaterial({
      color: COLORS.muzzleFlash,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const flash = new THREE.Mesh(flashGeom, flashMat);
    flash.name = 'muzzleFlash';
    flash.position.set(0.25, 0.65, 0.7);
    group.add(flash);

    // === Targeting laser ===
    const laserGeom = TargetingLaserMaterial.createGeometry(14.5, 0.12);
    const laserMat = this.renderer.getMaterial('targetingLaser')!;
    const laser = new THREE.Mesh(laserGeom, laserMat);
    laser.name = 'targetingLaser';
    laser.rotation.x = Math.PI / 2;
    laser.position.set(0.25, 0.65, 0.6); // From gun tip
    group.add(laser);

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = state.rotation;
    group.userData.entityType = 'player';

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createEnemy(state: EnemyState): void {
    const group = new THREE.Group();

    // === CULT RAT MODEL ===
    // Colors based on enemy type
    let furColor = 0x554433; // Brown fur
    let robeColor = 0x442222; // Dark red cult robe
    let eyeColor = 0xff0000; // Evil red eyes

    switch (state.enemyType) {
      case 'runner':
        furColor = 0x665544; // Lighter brown
        robeColor = 0x553322; // Orange-ish robe
        eyeColor = 0xff6600; // Orange eyes
        break;
      case 'tank':
        furColor = 0x333322; // Dark grey-brown
        robeColor = 0x330011; // Deep crimson robe
        eyeColor = 0xff0044; // Bright red eyes
        break;
    }

    const furMat = new THREE.MeshLambertMaterial({ color: furColor });
    const robeMat = new THREE.MeshLambertMaterial({ color: robeColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xddaa99 }); // Pink skin

    // --- Cult Robe (hooded cloak) ---
    const robeGeom = new THREE.ConeGeometry(0.4, 0.7, 8);
    const robe = new THREE.Mesh(robeGeom, robeMat);
    robe.position.y = 0.35;
    robe.castShadow = true;
    group.add(robe);

    // Hood
    const hoodGeom = new THREE.SphereGeometry(0.25, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const hood = new THREE.Mesh(hoodGeom, robeMat);
    hood.position.set(0, 0.65, -0.05);
    hood.rotation.x = 0.3;
    group.add(hood);

    // --- Rat Head (poking out of hood) ---
    const headGeom = new THREE.SphereGeometry(0.18, 8, 8);
    const head = new THREE.Mesh(headGeom, furMat);
    head.position.set(0, 0.7, 0.1);
    head.scale.set(1, 0.9, 1.1);
    group.add(head);

    // Snout
    const snoutGeom = new THREE.ConeGeometry(0.08, 0.2, 6);
    const snout = new THREE.Mesh(snoutGeom, furMat);
    snout.position.set(0, 0.65, 0.28);
    snout.rotation.x = Math.PI / 2;
    group.add(snout);

    // Nose (pink)
    const noseGeom = new THREE.SphereGeometry(0.04, 6, 6);
    const nose = new THREE.Mesh(noseGeom, skinMat);
    nose.position.set(0, 0.65, 0.38);
    group.add(nose);

    // Evil eyes (glowing)
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const eyeGeom = new THREE.SphereGeometry(0.04, 6, 6);

    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.08, 0.73, 0.22);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.08, 0.73, 0.22);
    group.add(rightEye);

    // --- Rat Ears (poking through hood) ---
    const earGeom = new THREE.ConeGeometry(0.1, 0.18, 6);
    const earMat = new THREE.MeshLambertMaterial({ color: 0xddaaaa }); // Pink inner ear

    const leftEar = new THREE.Mesh(earGeom, furMat);
    leftEar.position.set(-0.18, 0.85, 0);
    leftEar.rotation.z = -0.4;
    leftEar.rotation.x = -0.2;
    group.add(leftEar);

    const rightEar = new THREE.Mesh(earGeom, furMat);
    rightEar.position.set(0.18, 0.85, 0);
    rightEar.rotation.z = 0.4;
    rightEar.rotation.x = -0.2;
    group.add(rightEar);

    // Inner ear (pink)
    const innerEarGeom = new THREE.ConeGeometry(0.06, 0.12, 6);
    const leftInnerEar = new THREE.Mesh(innerEarGeom, earMat);
    leftInnerEar.position.set(-0.17, 0.84, 0.02);
    leftInnerEar.rotation.z = -0.4;
    leftInnerEar.rotation.x = -0.2;
    group.add(leftInnerEar);

    const rightInnerEar = new THREE.Mesh(innerEarGeom, earMat);
    rightInnerEar.position.set(0.17, 0.84, 0.02);
    rightInnerEar.rotation.z = 0.4;
    rightInnerEar.rotation.x = -0.2;
    group.add(rightInnerEar);

    // --- Rat Tail (curving out from robe) ---
    const tailSegments = 6;
    const ratTailMat = new THREE.MeshLambertMaterial({ color: 0xddaa99 }); // Pink tail
    for (let i = 0; i < tailSegments; i++) {
      const t = i / tailSegments;
      const radius = 0.03 * (1 - t * 0.6);
      const segGeom = new THREE.SphereGeometry(radius, 6, 6);
      const seg = new THREE.Mesh(segGeom, ratTailMat);
      // Curve the tail
      seg.position.set(
        0,
        0.1 + t * 0.15,
        -0.35 - t * 0.4 + Math.sin(t * Math.PI) * 0.1
      );
      group.add(seg);
    }

    // --- Whiskers ---
    const whiskerMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const whiskerGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.15, 4);
        const whisker = new THREE.Mesh(whiskerGeom, whiskerMat);
        whisker.position.set(side * 0.1, 0.63 + i * 0.03, 0.32);
        whisker.rotation.z = side * (0.3 + i * 0.15);
        whisker.rotation.x = 0.2;
        group.add(whisker);
      }
    }

    // --- Cult emblem on robe back ---
    const emblemMat = this.renderer.getMaterial('emblem')!;
    const emblemGeom = new THREE.PlaneGeometry(0.3, 0.3);
    const emblem = new THREE.Mesh(emblemGeom, emblemMat);
    emblem.position.set(0, 0.4, -0.32);
    emblem.rotation.y = Math.PI;
    group.add(emblem);

    // Scale based on type
    if (state.enemyType === 'tank') {
      group.scale.setScalar(1.4);
    } else if (state.enemyType === 'runner') {
      group.scale.setScalar(0.75);
    }

    // Speech bubble with cult symbol (thought bubble effect)
    const bubbleGroup = new THREE.Group();
    bubbleGroup.name = 'speechBubble';

    // White bubble background
    const bubble = new THREE.Mesh(
      this.bubbleGeometry,
      this.bubbleMaterial.clone() // Clone so each can have independent color
    );
    bubbleGroup.add(bubble);

    // Blurred meatball emblem inside
    const bubbleEmblemMat = BlurredEmblemMaterial.create();
    const bubbleEmblem = new THREE.Mesh(this.emblemGeometry, bubbleEmblemMat);
    bubbleEmblem.position.z = 0.01;
    bubbleGroup.add(bubbleEmblem);

    // Small tail/pointer
    const tailGeom = new THREE.ConeGeometry(0.1, 0.15, 3);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const tail = new THREE.Mesh(tailGeom, tailMat);
    tail.position.set(0, -0.3, 0);
    tail.rotation.z = Math.PI;
    bubbleGroup.add(tail);

    bubbleGroup.position.set(0, 1.4, 0);
    bubbleGroup.userData.pulseTime = Math.random() * Math.PI * 2;
    bubbleGroup.userData.baseScale = 0.6;
    group.add(bubbleGroup);

    // --- Health bar (hidden by default, shown when damaged) ---
    const healthBarGroup = new THREE.Group();
    healthBarGroup.name = 'healthBar';

    // Background bar (dark red)
    const healthBgGeom = new THREE.PlaneGeometry(0.8, 0.1);
    const healthBgMat = new THREE.MeshBasicMaterial({
      color: 0x440000,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const healthBg = new THREE.Mesh(healthBgGeom, healthBgMat);
    healthBg.name = 'healthBarBg';
    healthBarGroup.add(healthBg);

    // Foreground bar (red)
    const healthFgGeom = new THREE.PlaneGeometry(0.8, 0.1);
    const healthFgMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const healthFg = new THREE.Mesh(healthFgGeom, healthFgMat);
    healthFg.name = 'healthBarFg';
    healthBarGroup.add(healthFg);

    healthBarGroup.position.set(0, 1.0, 0);
    group.add(healthBarGroup);

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = state.rotation;
    group.userData.entityType = 'enemy';
    group.userData.enemyId = state.id;

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createProjectile(state: ProjectileState): void {
    const group = new THREE.Group();

    const geom = this.renderer.getGeometry('projectile')!;
    const mat = this.renderer.getMaterial('projectile')!;
    const mesh = new THREE.Mesh(geom, mat);

    // Add glow effect
    const glowGeom = new THREE.SphereGeometry(0.25, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: COLORS.projectile,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    group.add(glow);
    group.add(mesh);

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.userData.entityType = 'projectile';

    this.renderer.addToScene(group);
    this.entities.set(state.id, {
      mesh: group,
      prevState: { position: { ...state.position }, rotation: state.rotation },
      currentState: { position: { ...state.position }, rotation: state.rotation },
    });
  }

  createPickup(state: PickupState): void {
    const group = new THREE.Group();

    const geom = this.renderer.getGeometry('pickup')!;
    let mat: THREE.Material;
    let glowColor: number | null = null;

    if (state.pickupType === 'powerup' && state.powerUpType) {
      // Power-up pickup with special color and glow
      const config = POWERUP_CONFIGS[state.powerUpType];
      mat = new THREE.MeshLambertMaterial({
        color: config.color,
        emissive: config.color,
        emissiveIntensity: 0.3,
      });
      glowColor = config.color;
    } else if (state.pickupType === 'health') {
      mat = this.renderer.getMaterial('health')!;
    } else {
      mat = this.renderer.getMaterial('ammo')!;
    }

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    group.add(mesh);

    // Add glow effect for power-ups
    if (glowColor !== null) {
      const glowGeom = new THREE.SphereGeometry(0.6, 8, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.3,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.name = 'powerupGlow';
      group.add(glow);
    }

    group.position.set(state.position.x, state.position.y, state.position.z);

    // Store pickup animation data and entity type
    group.userData.pickupAnimation = { baseY: state.position.y, time: 0 };
    group.userData.entityType = 'pickup';
    group.userData.isPowerUp = state.pickupType === 'powerup';

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
    // Also clean up enemy state tracking
    this.enemyStates.delete(id);
    this.enemyDamageStates.delete(id);
  }

  // Fade out an enemy over time (death animation)
  fadeOutEnemy(id: string, duration: number): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    const startTime = performance.now();

    const fade = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Fade opacity and sink into ground
      entity.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.Material;
          if ('opacity' in mat) {
            mat.transparent = true;
            (mat as THREE.MeshBasicMaterial).opacity = 1 - progress;
          }
        }
      });

      // Sink and rotate
      entity.mesh.position.y -= 0.02;
      entity.mesh.rotation.x += 0.02;
      entity.mesh.scale.setScalar(1 - progress * 0.3);

      if (progress < 1) {
        requestAnimationFrame(fade);
      }
    };

    requestAnimationFrame(fade);
  }

  // Trigger damage visual effects on enemy
  damageEnemy(id: string, health: number, maxHealth: number): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    // Initialize or update damage state
    let damageState = this.enemyDamageStates.get(id);
    if (!damageState) {
      damageState = {
        flashTime: 0,
        staggerOffset: { x: 0, z: 0 },
        staggerTime: 0,
        lastHealth: maxHealth,
      };
      this.enemyDamageStates.set(id, damageState);
    }

    // Trigger flash (150ms)
    damageState.flashTime = 150;

    // Trigger stagger/shake (200ms)
    damageState.staggerTime = 200;

    // Store health
    damageState.lastHealth = health;

    // Immediate white flash on all materials
    entity.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name !== 'speechBubble' && child.name !== 'healthBar') {
        const mat = child.material as THREE.MeshLambertMaterial;
        if (mat.emissive) {
          mat.emissive.setRGB(1, 1, 1);
        }
      }
    });

    // Update health bar visibility and scale
    const healthBar = entity.mesh.getObjectByName('healthBar');
    if (healthBar) {
      const healthPercent = Math.max(0, health / maxHealth);

      // Show health bar when damaged
      const bg = healthBar.getObjectByName('healthBarBg') as THREE.Mesh;
      const fg = healthBar.getObjectByName('healthBarFg') as THREE.Mesh;

      if (bg && fg) {
        // Fade in health bar
        (bg.material as THREE.MeshBasicMaterial).opacity = 0.8;
        (fg.material as THREE.MeshBasicMaterial).opacity = 0.9;

        // Scale foreground to show health remaining
        fg.scale.x = healthPercent;
        fg.position.x = -(1 - healthPercent) * 0.4; // Offset to left

        // Color gradient: green -> yellow -> red
        const fgMat = fg.material as THREE.MeshBasicMaterial;
        if (healthPercent > 0.5) {
          fgMat.color.setRGB(1 - (healthPercent - 0.5) * 2, 1, 0);
        } else {
          fgMat.color.setRGB(1, healthPercent * 2, 0);
        }
      }
    }
  }

  // ============================================================================
  // Interpolation & Visual Updates
  // ============================================================================

  updateVisuals(alpha: number): void {
    for (const [id, entity] of this.entities) {
      // Interpolate position
      const pos = lerpVec3(entity.prevState.position, entity.currentState.position, alpha);
      entity.mesh.position.set(pos.x, pos.y, pos.z);

      // Interpolate rotation
      const rot = lerpAngle(entity.prevState.rotation, entity.currentState.rotation, alpha);
      entity.mesh.rotation.y = rot;

      // Pickup bobbing animation
      if (entity.mesh.userData.pickupAnimation) {
        const anim = entity.mesh.userData.pickupAnimation;
        anim.time += 0.05;
        entity.mesh.position.y = anim.baseY + Math.sin(anim.time) * 0.2;
        entity.mesh.rotation.y += 0.02;

        // Pulsing glow for power-ups
        if (entity.mesh.userData.isPowerUp) {
          const glow = entity.mesh.getObjectByName('powerupGlow') as THREE.Mesh;
          if (glow) {
            const pulse = Math.sin(anim.time * 2) * 0.15 + 0.35;
            (glow.material as THREE.MeshBasicMaterial).opacity = pulse;
            glow.scale.setScalar(1 + Math.sin(anim.time * 1.5) * 0.15);
          }
        }
      }

      // Player updates: muzzle flash fade and recoil
      if (entity.mesh.userData.entityType === 'player') {
        const flash = entity.mesh.getObjectByName('muzzleFlash') as THREE.Mesh;
        if (flash) {
          const mat = flash.material as THREE.MeshBasicMaterial;
          if (mat.opacity > 0.01) {
            mat.opacity *= 0.7;
          }
          // Billboard flash to camera
          flash.quaternion.copy(this.renderer.camera.quaternion);
        }

        // Apply recoil animation
        if (this.playerRecoil.offset > 0.01 || this.playerRecoil.tilt > 0.01) {
          // Calculate backward offset based on player rotation
          const backX = -Math.sin(entity.mesh.rotation.y) * this.playerRecoil.offset;
          const backZ = -Math.cos(entity.mesh.rotation.y) * this.playerRecoil.offset;

          // Apply offset to all children (the Dalek parts)
          entity.mesh.children.forEach(child => {
            if (child.name !== 'muzzleFlash' && child.name !== 'targetingLaser') {
              child.position.x = backX;
              child.position.z = backZ;
            }
          });

          // Apply tilt (pitch back)
          entity.mesh.rotation.x = -this.playerRecoil.tilt;

          // Recover from recoil
          this.playerRecoil.offset *= (1 - this.playerRecoil.recovery);
          this.playerRecoil.tilt *= (1 - this.playerRecoil.recovery);
        } else {
          // Reset position when recoil is done
          entity.mesh.children.forEach(child => {
            if (child.name !== 'muzzleFlash' && child.name !== 'targetingLaser') {
              child.position.x = 0;
              child.position.z = 0;
            }
          });
          entity.mesh.rotation.x = 0;
        }
      }

      // Speech bubble animation for enemies
      if (entity.mesh.userData.entityType === 'enemy') {
        const bubbleGroup = entity.mesh.getObjectByName('speechBubble');
        if (bubbleGroup) {
          // Get enemy state for behavior-based animation
          const enemyState = this.enemyStates.get(id);
          const state = enemyState?.state ?? 'idle';

          // Update pulse time
          bubbleGroup.userData.pulseTime += 0.08;
          const t = bubbleGroup.userData.pulseTime;

          // State-based animation
          let baseScale = 0.6;
          let pulseSpeed = 1;
          let pulseAmount = 0.08;
          let bubbleColor = 0xffffff;

          if (state === 'chasing') {
            baseScale = 0.8;
            pulseSpeed = 2;
            pulseAmount = 0.1;
          } else if (state === 'attacking') {
            baseScale = 1.0;
            pulseSpeed = 4;
            pulseAmount = 0.15;
            bubbleColor = 0xffcccc; // Reddish when attacking
          }

          // Apply scale with pulse
          const scale = baseScale + Math.sin(t * pulseSpeed) * pulseAmount;
          bubbleGroup.scale.setScalar(scale);

          // Update bubble color
          const bubble = bubbleGroup.children[0] as THREE.Mesh;
          if (bubble) {
            (bubble.material as THREE.MeshBasicMaterial).color.setHex(bubbleColor);
          }

          // Billboard - face camera
          bubbleGroup.quaternion.copy(this.renderer.camera.quaternion);
        }

        // Damage flash and stagger effects
        const damageState = this.enemyDamageStates.get(id);
        const enemyState = this.enemyStates.get(id);

        if (damageState) {
          const dt = 16; // Approximate frame time in ms

          // Update flash timer
          if (damageState.flashTime > 0) {
            damageState.flashTime -= dt;
            const flashIntensity = damageState.flashTime / 150;

            // Flash from white to red to normal
            entity.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh &&
                  !child.name.includes('healthBar') &&
                  child.name !== 'speechBubble') {
                const mat = child.material as THREE.MeshLambertMaterial;
                if (mat.emissive) {
                  // White -> red fade
                  mat.emissive.setRGB(flashIntensity, flashIntensity * 0.3, flashIntensity * 0.3);
                }
              }
            });
          } else if (enemyState?.state === 'attacking') {
            // Attack telegraph - red glow when attacking
            entity.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh &&
                  !child.name.includes('healthBar') &&
                  child.name !== 'speechBubble') {
                const mat = child.material as THREE.MeshLambertMaterial;
                if (mat.emissive) {
                  const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
                  mat.emissive.setRGB(pulse * 0.5, 0, 0);
                }
              }
            });
          } else {
            // Reset emissive
            entity.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh &&
                  !child.name.includes('healthBar') &&
                  child.name !== 'speechBubble') {
                const mat = child.material as THREE.MeshLambertMaterial;
                if (mat.emissive) {
                  mat.emissive.setRGB(0, 0, 0);
                }
              }
            });
          }

          // Update stagger shake
          if (damageState.staggerTime > 0) {
            damageState.staggerTime -= dt;
            // Random shake that decays
            const shakeIntensity = (damageState.staggerTime / 200) * 0.15;
            damageState.staggerOffset.x = (Math.random() - 0.5) * shakeIntensity;
            damageState.staggerOffset.z = (Math.random() - 0.5) * shakeIntensity;
          } else {
            // Reset shake offset
            damageState.staggerOffset.x = 0;
            damageState.staggerOffset.z = 0;
          }

          // Apply stagger offset to model (not to tracked position)
          // This is purely visual shake
          entity.mesh.children.forEach(child => {
            if (child.name !== 'healthBar' && child.name !== 'speechBubble') {
              child.position.x = damageState.staggerOffset.x;
              child.position.z = damageState.staggerOffset.z;
            }
          });
        } else if (enemyState?.state === 'attacking') {
          // Attack telegraph - red glow when attacking (no damage state yet)
          entity.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh &&
                !child.name.includes('healthBar') &&
                child.name !== 'speechBubble') {
              const mat = child.material as THREE.MeshLambertMaterial;
              if (mat.emissive) {
                const pulse = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
                mat.emissive.setRGB(pulse * 0.5, 0, 0);
              }
            }
          });
        }

        // Health bar billboard - face camera
        const healthBar = entity.mesh.getObjectByName('healthBar');
        if (healthBar) {
          healthBar.quaternion.copy(this.renderer.camera.quaternion);
        }
      }
    }

    // Update afterimages
    this.updateAfterimages();
  }

  // Update enemy state for speech bubble animation
  updateEnemyState(state: EnemyState): void {
    this.enemyStates.set(state.id, state);
  }

  // ============================================================================
  // Muzzle Flash
  // ============================================================================

  triggerMuzzleFlash(playerId: string): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;

    const flash = entity.mesh.getObjectByName('muzzleFlash') as THREE.Mesh;
    if (flash) {
      const mat = flash.material as THREE.MeshBasicMaterial;
      mat.opacity = 1;
      flash.scale.setScalar(0.8 + Math.random() * 0.4);
      flash.rotation.z = Math.random() * Math.PI * 2;
    }

    // Trigger recoil animation
    this.playerRecoil.offset = 0.25; // Kick back
    this.playerRecoil.tilt = 0.08;   // Tilt back

    // Create temporary point light for muzzle flash
    const light = new THREE.PointLight(0xffaa44, 3, 10);
    light.position.copy(entity.mesh.position);
    light.position.y += 0.5;

    // Offset in firing direction
    const forward = new THREE.Vector3(0, 0, 0.8);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), entity.mesh.rotation.y);
    light.position.add(forward);

    this.renderer.addToScene(light);

    // Fade out light quickly
    let intensity = 3;
    const fadeLight = () => {
      intensity *= 0.65;
      light.intensity = intensity;
      if (intensity > 0.05) {
        requestAnimationFrame(fadeLight);
      } else {
        this.renderer.removeFromScene(light);
        light.dispose();
      }
    };
    requestAnimationFrame(fadeLight);
  }

  // ============================================================================
  // Afterimage System for Dash
  // ============================================================================

  spawnAfterimage(playerId: string, position: Vec3): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;

    // Create a simple ghost mesh
    const ghostGroup = new THREE.Group();

    // Clone simplified player shape
    const bodyGeom = this.renderer.getGeometry('playerBody')!;
    const bodyMat = new THREE.MeshBasicMaterial({
      color: COLORS.dashTrail,
      transparent: true,
      opacity: 0.5,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    ghostGroup.add(body);

    ghostGroup.position.set(position.x, position.y, position.z);
    ghostGroup.rotation.y = entity.mesh.rotation.y;

    this.renderer.addToScene(ghostGroup);
    this.afterimages.push({ mesh: ghostGroup, lifetime: 0.2 });
  }

  private updateAfterimages(): void {
    const dt = 0.016; // Approximate frame time

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const ai = this.afterimages[i];
      ai.lifetime -= dt;

      if (ai.lifetime <= 0) {
        this.renderer.removeFromScene(ai.mesh);
        this.afterimages.splice(i, 1);
        continue;
      }

      // Fade out
      ai.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshBasicMaterial;
          mat.opacity = (ai.lifetime / 0.2) * 0.5;
        }
      });
    }
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
