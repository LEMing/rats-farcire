import * as THREE from 'three';
import type { PlayerState, EnemyState, ProjectileState, PickupState } from '@shared/types';
import { COLORS, POWERUP_CONFIGS, WEAPON_CONFIGS } from '@shared/constants';
import { TargetingLaserMaterial } from '../rendering/LaserMaterial';
import { BlurredEmblemMaterial } from '../rendering/BlurredEmblemMaterial';

/**
 * EntityFactory - Responsible for creating THREE.js meshes for game entities
 *
 * Extracted from EntityManager to follow Single Responsibility Principle.
 * This class handles only the visual representation creation.
 */

export interface MaterialProvider {
  getMaterial(name: string): THREE.Material | undefined;
  getGeometry(name: string): THREE.BufferGeometry | undefined;
}

export interface SpeechBubbleAssets {
  bubbleGeometry: THREE.PlaneGeometry;
  bubbleMaterial: THREE.MeshBasicMaterial;
  emblemGeometry: THREE.PlaneGeometry;
}

export class EntityFactory {
  private materialProvider: MaterialProvider;
  private speechBubbleAssets: SpeechBubbleAssets;

  constructor(materialProvider: MaterialProvider) {
    this.materialProvider = materialProvider;
    this.speechBubbleAssets = this.createSpeechBubbleAssets();
  }

  private createSpeechBubbleAssets(): SpeechBubbleAssets {
    return {
      bubbleGeometry: new THREE.PlaneGeometry(0.7, 0.5),
      bubbleMaterial: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
      emblemGeometry: new THREE.PlaneGeometry(0.3, 0.3),
    };
  }

  // ============================================================================
  // Player Creation (Dalek Model)
  // ============================================================================

  createPlayer(state: PlayerState): THREE.Group {
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
    const laserMat = this.materialProvider.getMaterial('targetingLaser');
    if (laserMat) {
      const laserGeom = TargetingLaserMaterial.createGeometry(14.5, 0.12);
      const laser = new THREE.Mesh(laserGeom, laserMat);
      laser.name = 'targetingLaser';
      laser.rotation.x = Math.PI / 2;
      laser.position.set(0.25, 0.65, 0.6); // From gun tip
      group.add(laser);
    }

    // === Carrying indicator (power cell above head) ===
    group.add(this.createCarryIndicator());

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = state.rotation;
    group.userData.entityType = 'player';

    return group;
  }

  private createCarryIndicator(): THREE.Group {
    const carryIndicator = new THREE.Group();
    carryIndicator.name = 'carryIndicator';
    carryIndicator.visible = false; // Hidden by default
    carryIndicator.position.y = 1.8; // Above the Dalek's dome

    // Mini power cell (hexagonal battery shape to match new design)
    const miniCoreGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.25, 6);
    const miniCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.95,
    });
    const miniCore = new THREE.Mesh(miniCoreGeom, miniCoreMat);
    miniCore.name = 'miniCore';
    carryIndicator.add(miniCore);

    // Glow shell
    const miniGlowGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.3, 6);
    const miniGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.3,
    });
    const miniGlow = new THREE.Mesh(miniGlowGeom, miniGlowMat);
    miniGlow.name = 'miniGlow';
    carryIndicator.add(miniGlow);

    // Point light (golden glow)
    const indicatorLight = new THREE.PointLight(0xffaa00, 0.5, 3);
    carryIndicator.add(indicatorLight);

    return carryIndicator;
  }

  // ============================================================================
  // Enemy Creation (Cult Rat Model)
  // ============================================================================

  createEnemy(state: EnemyState): THREE.Group {
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
    const emblemMat = this.materialProvider.getMaterial('emblem');
    if (emblemMat) {
      const emblemGeom = new THREE.PlaneGeometry(0.3, 0.3);
      const emblem = new THREE.Mesh(emblemGeom, emblemMat);
      emblem.position.set(0, 0.4, -0.32);
      emblem.rotation.y = Math.PI;
      group.add(emblem);
    }

    // Scale based on type
    if (state.enemyType === 'tank') {
      group.scale.setScalar(1.4);
    } else if (state.enemyType === 'runner') {
      group.scale.setScalar(0.75);
    }

    // Speech bubble with cult symbol
    group.add(this.createSpeechBubble());

    // Health bar
    group.add(this.createHealthBar());

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = state.rotation;
    group.userData.entityType = 'enemy';
    group.userData.enemyId = state.id;

    return group;
  }

  private createSpeechBubble(): THREE.Group {
    const bubbleGroup = new THREE.Group();
    bubbleGroup.name = 'speechBubble';

    // White bubble background
    const bubble = new THREE.Mesh(
      this.speechBubbleAssets.bubbleGeometry,
      this.speechBubbleAssets.bubbleMaterial.clone() // Clone so each can have independent color
    );
    bubbleGroup.add(bubble);

    // Blurred meatball emblem inside
    const bubbleEmblemMat = BlurredEmblemMaterial.create();
    const bubbleEmblem = new THREE.Mesh(this.speechBubbleAssets.emblemGeometry, bubbleEmblemMat);
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

    return bubbleGroup;
  }

  private createHealthBar(): THREE.Group {
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

    return healthBarGroup;
  }

  // ============================================================================
  // Projectile Creation - Unique visuals per weapon type
  // ============================================================================

  createProjectile(state: ProjectileState): THREE.Group {
    const group = new THREE.Group();
    const weaponType = state.weaponType || 'pistol';

    switch (weaponType) {
      case 'pistol':
        this.createPistolProjectile(group);
        break;
      case 'shotgun':
        this.createShotgunProjectile(group);
        break;
      case 'machinegun':
        this.createMachinegunProjectile(group);
        break;
      case 'rifle':
        this.createRifleProjectile(group);
        break;
      case 'rocket':
        this.createRocketProjectile(group);
        break;
      default:
        this.createPistolProjectile(group);
    }

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = -state.rotation; // Face direction of travel
    group.userData.entityType = 'projectile';
    group.userData.weaponType = weaponType;

    return group;
  }

  // Pistol: Classic yellow energy bullet
  private createPistolProjectile(group: THREE.Group): void {
    const coreGeom = new THREE.SphereGeometry(0.08, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffff44 });
    const core = new THREE.Mesh(coreGeom, coreMat);
    group.add(core);

    // Soft glow
    const glowGeom = new THREE.SphereGeometry(0.15, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffff88,
      transparent: true,
      opacity: 0.4,
    });
    group.add(new THREE.Mesh(glowGeom, glowMat));
  }

  // Shotgun: Orange hot pellet
  private createShotgunProjectile(group: THREE.Group): void {
    const coreGeom = new THREE.SphereGeometry(0.06, 6, 6);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff6622 });
    const core = new THREE.Mesh(coreGeom, coreMat);
    group.add(core);

    // Hot ember glow
    const glowGeom = new THREE.SphereGeometry(0.12, 6, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.5,
    });
    group.add(new THREE.Mesh(glowGeom, glowMat));

    // Sparks trailing (small spheres offset behind)
    for (let i = 0; i < 3; i++) {
      const sparkGeom = new THREE.SphereGeometry(0.02, 4, 4);
      const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.6 - i * 0.15,
      });
      const spark = new THREE.Mesh(sparkGeom, sparkMat);
      spark.position.z = -0.05 - i * 0.04;
      spark.position.x = (Math.random() - 0.5) * 0.04;
      group.add(spark);
    }
  }

  // Machine Gun: Green tracer round (elongated)
  private createMachinegunProjectile(group: THREE.Group): void {
    // Elongated bullet shape
    const coreGeom = new THREE.CapsuleGeometry(0.04, 0.15, 4, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.rotation.x = Math.PI / 2; // Align with travel direction
    group.add(core);

    // Tracer glow trail
    const trailGeom = new THREE.CylinderGeometry(0.02, 0.06, 0.25, 6);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x88ff88,
      transparent: true,
      opacity: 0.4,
    });
    const trail = new THREE.Mesh(trailGeom, trailMat);
    trail.rotation.x = Math.PI / 2;
    trail.position.z = -0.15;
    group.add(trail);

    // Outer glow
    const glowGeom = new THREE.SphereGeometry(0.12, 6, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x44ff44,
      transparent: true,
      opacity: 0.25,
    });
    group.add(new THREE.Mesh(glowGeom, glowMat));
  }

  // Rifle: Blue high-energy plasma bolt
  private createRifleProjectile(group: THREE.Group): void {
    // Sharp energy core
    const coreGeom = new THREE.OctahedronGeometry(0.08, 0);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.rotation.z = Math.PI / 4;
    group.add(core);

    // Inner plasma glow
    const innerGeom = new THREE.SphereGeometry(0.12, 8, 8);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x88aaff,
      transparent: true,
      opacity: 0.6,
    });
    group.add(new THREE.Mesh(innerGeom, innerMat));

    // Outer energy field
    const outerGeom = new THREE.SphereGeometry(0.2, 8, 8);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x4466ff,
      transparent: true,
      opacity: 0.2,
    });
    group.add(new THREE.Mesh(outerGeom, outerMat));

    // Energy trail
    const trailGeom = new THREE.ConeGeometry(0.08, 0.3, 6);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x6688ff,
      transparent: true,
      opacity: 0.3,
    });
    const trail = new THREE.Mesh(trailGeom, trailMat);
    trail.rotation.x = -Math.PI / 2;
    trail.position.z = -0.2;
    group.add(trail);
  }

  // Rocket: Large red missile with smoke trail
  private createRocketProjectile(group: THREE.Group): void {
    // Missile body
    const bodyGeom = new THREE.CapsuleGeometry(0.08, 0.25, 4, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x884444 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    // Warhead tip (red)
    const tipGeom = new THREE.ConeGeometry(0.08, 0.12, 8);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.18;
    group.add(tip);

    // Fins
    const finMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    for (let i = 0; i < 4; i++) {
      const finGeom = new THREE.BoxGeometry(0.02, 0.12, 0.08);
      const fin = new THREE.Mesh(finGeom, finMat);
      fin.position.z = -0.12;
      fin.rotation.z = (i * Math.PI) / 2;
      fin.position.x = Math.sin((i * Math.PI) / 2) * 0.08;
      fin.position.y = Math.cos((i * Math.PI) / 2) * 0.08;
      group.add(fin);
    }

    // Engine glow
    const engineGeom = new THREE.SphereGeometry(0.06, 8, 8);
    const engineMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const engine = new THREE.Mesh(engineGeom, engineMat);
    engine.position.z = -0.18;
    group.add(engine);

    // Flame trail
    const flameGeom = new THREE.ConeGeometry(0.1, 0.35, 8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.7,
    });
    const flame = new THREE.Mesh(flameGeom, flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.z = -0.35;
    group.add(flame);

    // Smoke puffs
    for (let i = 0; i < 4; i++) {
      const smokeGeom = new THREE.SphereGeometry(0.06 + i * 0.02, 6, 6);
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.3 - i * 0.06,
      });
      const smoke = new THREE.Mesh(smokeGeom, smokeMat);
      smoke.position.z = -0.4 - i * 0.12;
      smoke.position.x = (Math.random() - 0.5) * 0.1;
      smoke.position.y = (Math.random() - 0.5) * 0.1;
      group.add(smoke);
    }
  }

  // ============================================================================
  // Pickup Creation
  // ============================================================================

  createPickup(state: PickupState): THREE.Group {
    const group = new THREE.Group();

    // Weapon pickups get custom 3D models
    if (state.pickupType === 'weapon' && state.weaponType) {
      this.createWeaponPickupModel(group, state.weaponType);
    } else {
      // Regular pickups (health, ammo, powerup)
      const geom = this.materialProvider.getGeometry('pickup');
      let mat: THREE.Material | undefined;
      let glowColor: number | undefined;

      if (state.pickupType === 'powerup' && state.powerUpType) {
        const config = POWERUP_CONFIGS[state.powerUpType];
        mat = new THREE.MeshLambertMaterial({
          color: config.color,
          emissive: config.color,
          emissiveIntensity: 0.3,
        });
        glowColor = config.color;
      } else if (state.pickupType === 'health') {
        mat = this.materialProvider.getMaterial('health');
      } else {
        mat = this.materialProvider.getMaterial('ammo');
      }

      if (geom && mat) {
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);
      }

      // Add glow effect for power-ups
      if (glowColor !== undefined) {
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
    }

    group.position.set(state.position.x, state.position.y, state.position.z);

    // Store pickup animation data and entity type
    group.userData.pickupAnimation = { baseY: state.position.y, time: 0 };
    group.userData.entityType = 'pickup';
    group.userData.isPowerUp = state.pickupType === 'powerup';
    group.userData.isWeapon = state.pickupType === 'weapon';

    return group;
  }

  // Create unique 3D models for weapon pickups
  private createWeaponPickupModel(group: THREE.Group, weaponType: string): void {
    const config = WEAPON_CONFIGS[weaponType as keyof typeof WEAPON_CONFIGS];
    const color = config?.color || 0xffffff;

    const metalMat = new THREE.MeshLambertMaterial({
      color: 0x444455,
      emissive: 0x111122,
    });
    const accentMat = new THREE.MeshBasicMaterial({
      color: color,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.6,
    });

    switch (weaponType) {
      case 'pistol':
        this.createPistolPickup(group, metalMat, accentMat);
        break;
      case 'shotgun':
        this.createShotgunPickup(group, metalMat, accentMat);
        break;
      case 'machinegun':
        this.createMachinegunPickup(group, metalMat, accentMat);
        break;
      case 'rifle':
        this.createRiflePickup(group, metalMat, accentMat);
        break;
      case 'rocket':
        this.createRocketPickup(group, metalMat, accentMat);
        break;
    }

    // Glowing base platform
    const baseGeom = new THREE.CylinderGeometry(0.4, 0.5, 0.1, 16);
    const baseMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.4,
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = -0.3;
    group.add(base);

    // Outer glow
    const glowGeom = new THREE.SphereGeometry(0.7, 8, 8);
    const outerGlow = new THREE.Mesh(glowGeom, glowMat);
    outerGlow.material.opacity = 0.2;
    outerGlow.name = 'powerupGlow';
    group.add(outerGlow);
  }

  // Pistol: Compact handgun shape
  private createPistolPickup(group: THREE.Group, metalMat: THREE.Material, accentMat: THREE.Material): void {
    // Handle/grip
    const gripGeom = new THREE.BoxGeometry(0.12, 0.25, 0.08);
    const grip = new THREE.Mesh(gripGeom, metalMat);
    grip.position.set(0, -0.05, 0);
    group.add(grip);

    // Slide/body
    const slideGeom = new THREE.BoxGeometry(0.1, 0.12, 0.3);
    const slide = new THREE.Mesh(slideGeom, metalMat);
    slide.position.set(0, 0.1, 0.05);
    group.add(slide);

    // Barrel
    const barrelGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
    const barrel = new THREE.Mesh(barrelGeom, accentMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, 0.25);
    group.add(barrel);

    // Trigger guard
    const guardGeom = new THREE.TorusGeometry(0.04, 0.015, 8, 8, Math.PI);
    const guard = new THREE.Mesh(guardGeom, metalMat);
    guard.rotation.x = Math.PI / 2;
    guard.position.set(0, -0.02, 0.08);
    group.add(guard);
  }

  // Shotgun: Double barrel design
  private createShotgunPickup(group: THREE.Group, metalMat: THREE.Material, accentMat: THREE.Material): void {
    // Stock
    const stockGeom = new THREE.BoxGeometry(0.1, 0.12, 0.3);
    const stockMat = new THREE.MeshLambertMaterial({ color: 0x663300 }); // Wood
    const stock = new THREE.Mesh(stockGeom, stockMat);
    stock.position.set(0, 0, -0.25);
    group.add(stock);

    // Receiver
    const receiverGeom = new THREE.BoxGeometry(0.12, 0.14, 0.15);
    const receiver = new THREE.Mesh(receiverGeom, metalMat);
    receiver.position.set(0, 0.02, -0.02);
    group.add(receiver);

    // Double barrels
    for (let i = -1; i <= 1; i += 2) {
      const barrelGeom = new THREE.CylinderGeometry(0.035, 0.04, 0.5, 8);
      const barrel = new THREE.Mesh(barrelGeom, accentMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(i * 0.04, 0.03, 0.3);
      group.add(barrel);
    }

    // Forend (pump grip)
    const forendGeom = new THREE.BoxGeometry(0.14, 0.1, 0.12);
    const forend = new THREE.Mesh(forendGeom, stockMat);
    forend.position.set(0, -0.02, 0.15);
    group.add(forend);
  }

  // Machine Gun: Belt-fed with ammo box
  private createMachinegunPickup(group: THREE.Group, metalMat: THREE.Material, accentMat: THREE.Material): void {
    // Main body
    const bodyGeom = new THREE.BoxGeometry(0.15, 0.15, 0.5);
    const body = new THREE.Mesh(bodyGeom, metalMat);
    body.position.set(0, 0, 0);
    group.add(body);

    // Barrel with cooling holes
    const barrelGeom = new THREE.CylinderGeometry(0.04, 0.05, 0.4, 8);
    const barrel = new THREE.Mesh(barrelGeom, accentMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.4);
    group.add(barrel);

    // Barrel shroud (perforated)
    const shroudGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12);
    const shroudMat = new THREE.MeshLambertMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.8,
    });
    const shroud = new THREE.Mesh(shroudGeom, shroudMat);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.02, 0.35);
    group.add(shroud);

    // Ammo box
    const ammoGeom = new THREE.BoxGeometry(0.12, 0.15, 0.1);
    const ammoMat = new THREE.MeshLambertMaterial({ color: 0x556644 }); // Military green
    const ammo = new THREE.Mesh(ammoGeom, ammoMat);
    ammo.position.set(0.12, -0.08, -0.05);
    group.add(ammo);

    // Handle
    const handleGeom = new THREE.BoxGeometry(0.08, 0.12, 0.06);
    const handle = new THREE.Mesh(handleGeom, metalMat);
    handle.position.set(0, 0.12, 0.05);
    group.add(handle);
  }

  // Rifle: Sleek sniper-style
  private createRiflePickup(group: THREE.Group, metalMat: THREE.Material, accentMat: THREE.Material): void {
    // Stock
    const stockGeom = new THREE.BoxGeometry(0.08, 0.1, 0.35);
    const stockMat = new THREE.MeshLambertMaterial({ color: 0x442200 }); // Dark wood
    const stock = new THREE.Mesh(stockGeom, stockMat);
    stock.position.set(0, 0, -0.3);
    group.add(stock);

    // Receiver
    const receiverGeom = new THREE.BoxGeometry(0.1, 0.12, 0.2);
    const receiver = new THREE.Mesh(receiverGeom, metalMat);
    receiver.position.set(0, 0.02, -0.02);
    group.add(receiver);

    // Long barrel
    const barrelGeom = new THREE.CylinderGeometry(0.025, 0.03, 0.6, 8);
    const barrel = new THREE.Mesh(barrelGeom, accentMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.4);
    group.add(barrel);

    // Scope
    const scopeGeom = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8);
    const scopeMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
    const scope = new THREE.Mesh(scopeGeom, scopeMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, 0.05);
    group.add(scope);

    // Scope lenses (glowing)
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
    const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), lensMat);
    frontLens.position.set(0, 0.1, 0.16);
    group.add(frontLens);
    const backLens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 8), lensMat);
    backLens.rotation.y = Math.PI;
    backLens.position.set(0, 0.1, -0.06);
    group.add(backLens);

    // Bipod
    for (let i = -1; i <= 1; i += 2) {
      const legGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.15, 6);
      const leg = new THREE.Mesh(legGeom, metalMat);
      leg.position.set(i * 0.06, -0.1, 0.2);
      leg.rotation.z = i * 0.3;
      group.add(leg);
    }
  }

  // Rocket Launcher: Tube with grip
  private createRocketPickup(group: THREE.Group, metalMat: THREE.Material, accentMat: THREE.Material): void {
    // Main tube
    const tubeGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 12);
    const tubeMat = new THREE.MeshLambertMaterial({ color: 0x445544 }); // Military green
    const tube = new THREE.Mesh(tubeGeom, tubeMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.05, 0);
    group.add(tube);

    // Front opening (darker)
    const frontGeom = new THREE.CylinderGeometry(0.08, 0.1, 0.05, 12);
    const frontMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const front = new THREE.Mesh(frontGeom, frontMat);
    front.rotation.x = Math.PI / 2;
    front.position.set(0, 0.05, 0.36);
    group.add(front);

    // Rear exhaust warning stripes
    const rearGeom = new THREE.CylinderGeometry(0.1, 0.08, 0.08, 12);
    const rearMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const rear = new THREE.Mesh(rearGeom, rearMat);
    rear.rotation.x = Math.PI / 2;
    rear.position.set(0, 0.05, -0.38);
    group.add(rear);

    // Grip
    const gripGeom = new THREE.BoxGeometry(0.08, 0.18, 0.08);
    const grip = new THREE.Mesh(gripGeom, metalMat);
    grip.position.set(0, -0.1, -0.05);
    group.add(grip);

    // Trigger guard
    const guardGeom = new THREE.TorusGeometry(0.04, 0.012, 8, 8, Math.PI);
    const guard = new THREE.Mesh(guardGeom, metalMat);
    guard.rotation.x = Math.PI / 2;
    guard.rotation.z = Math.PI;
    guard.position.set(0, -0.08, 0.02);
    group.add(guard);

    // Sight
    const sightGeom = new THREE.BoxGeometry(0.04, 0.08, 0.15);
    const sight = new THREE.Mesh(sightGeom, accentMat);
    sight.position.set(0, 0.18, 0.1);
    group.add(sight);

    // Loaded rocket visible (tip)
    const rocketTipGeom = new THREE.ConeGeometry(0.06, 0.1, 8);
    const rocketTipMat = new THREE.MeshBasicMaterial({ color: 0xff6644 });
    const rocketTip = new THREE.Mesh(rocketTipGeom, rocketTipMat);
    rocketTip.rotation.x = Math.PI / 2;
    rocketTip.position.set(0, 0.05, 0.42);
    group.add(rocketTip);
  }

  // ============================================================================
  // Afterimage Creation (for dash effect)
  // ============================================================================

  createAfterimage(position: { x: number; y: number; z: number }, rotation: number): THREE.Group {
    const ghostGroup = new THREE.Group();

    const bodyGeom = this.materialProvider.getGeometry('playerBody');
    if (bodyGeom) {
      const bodyMat = new THREE.MeshBasicMaterial({
        color: COLORS.dashTrail,
        transparent: true,
        opacity: 0.5,
      });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      ghostGroup.add(body);
    }

    ghostGroup.position.set(position.x, position.y, position.z);
    ghostGroup.rotation.y = rotation;

    return ghostGroup;
  }
}
