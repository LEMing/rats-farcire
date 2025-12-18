# RATS FARCIRE - Game Design Document

## Overview

**Genre:** Top-down extraction shooter with roguelike elements
**Theme:** Dark humor, Tarantino-esque action
**Lore:** A Dalek crash-lands in the Farshist cult's underground lair. The Doctor's abandoned TARDIS is hidden somewhere in the dungeon. Find it, power it up, and escape before the endless rat horde overwhelms you.

**The Irony:** A Dalek using the Doctor's TARDIS to escape - dark humor that fits the tone.

---

## Core Game Loop

1. **Spawn** in a random room
2. **Explore** the procedural dungeon
3. **Find** 3 Power Cells scattered across the map
4. **Deliver** cells to the TARDIS (one at a time)
5. **Escape** through the powered TARDIS = WIN
6. **Survive** waves of Farshist cult rats throughout

---

## Phase 1: Objective-Based Gameplay (MVP)

### 1.1 TARDIS as Escape Objective

- TARDIS spawns in a **random room** (not spawn room, not adjacent to spawn)
- Initially **dormant** (dark, dim lamp, no glow)
- Player must **collect 3 Power Cells** scattered across the map
- Each cell delivered to TARDIS = 1/3 power (visual feedback)
- Fully powered TARDIS = **ESCAPE (WIN)**

### 1.2 Power Cell System

| Property | Value |
|----------|-------|
| Count | 3 per map |
| Spawn Location | Random rooms (not spawn, not TARDIS room) |
| Visual | Glowing cyan crystal/orb, pulsing |
| Pickup | Walk over to collect |

**Carrying a Cell:**
- 25% movement speed reduction
- Cannot dash
- Shooting auto-drops the cell
- Press E key to drop manually
- Cell drops on ground, can be re-collected

**Cell Delivery:**
- Walk to TARDIS while carrying cell
- Auto-deposits when within range
- TARDIS lamp brightness increases (33% → 66% → 100%)
- Visual/audio feedback on each delivery

### 1.3 Win Condition

- All 3 cells delivered to TARDIS
- TARDIS door opens (animation)
- Player enters TARDIS = Victory screen
- Victory screen shows:
  - "STRATEGIC RETREAT!"
  - Final score
  - Waves survived
  - Best combo
  - Cells delivered time breakdown

### 1.4 Tension Mechanics

- Wave timer continues while exploring
- Each wave spawns regardless of cells collected
- Creates urgency: explore fast or get overwhelmed
- Delivering a cell triggers a **mini-horde** (5-8 bonus enemies)

---

## Phase 2: Map & Exploration

### 2.1 Fog of War

- Unexplored areas are dark/black
- Rooms reveal when player enters
- Revealed rooms stay visible
- Creates discovery moments and tension

### 2.2 Minimap

- Corner minimap (bottom-right, 150x150px)
- Shows:
  - Explored rooms (gray)
  - Current room (white)
  - Player position (blue dot)
  - TARDIS location (blue box, once discovered)
  - Power cell locations (cyan dots, once discovered)
  - Enemy clusters (red blips, optional)

### 2.3 Room Types

| Room Type | Frequency | Contents |
|-----------|-----------|----------|
| Empty | 30% | Basic floor, debris |
| Altar Room | 20% | Cult altar, candles, ritual circle |
| Grinder Room | 10% | Meat grinder shrine, meat piles |
| Armory | 10% | Guaranteed ammo + health pickup |
| Cell Room | 3 fixed | Contains Power Cell |
| TARDIS Room | 1 fixed | The escape point |
| Trap Room | 10% | Spike traps or steam vents |
| Horde Room | 10% | Triggers enemy ambush on entry |

### 2.4 Environmental Hazards

| Hazard | Damage | Effect |
|--------|--------|--------|
| Spike Trap | 10/sec | Visible, periodic |
| Steam Vent | 5 + knockback | Periodic burst |
| Meat Puddle | 0 | 30% slow (affects rats too) |

---

## Phase 3: Enemy Variety

### Current Enemies

| Type | HP | Speed | Damage | Score |
|------|-----|-------|--------|-------|
| Grunt | 40 | 5 | 18 | 10 |
| Runner | 25 | 8 | 8 | 15 |
| Tank | 120 | 3 | 30 | 30 |

### New Enemies

**Priest Rat** (Support)
- HP: 60, Speed: 4
- No direct attack
- Buffs nearby rats (+20% damage, +20% speed)
- Visible dark aura
- Priority target
- Score: 25

**Bomber Rat** (Kamikaze)
- HP: 20, Speed: 10
- Explodes on death (AOE damage)
- Damages player AND other rats
- Glows red when close
- Score: 20

**Brood Mother** (Mini-boss, Wave 5+)
- HP: 300, Speed: 2
- Spawns Runner rats every 5 seconds
- Telegraphed slam attack
- Drops guaranteed power-up
- Score: 100

**The High Priest** (Final Boss)
- HP: 500
- Teleports between altars
- Summons rat waves
- Projectile attack (meat chunks)
- Optional boss for bonus ending

---

## Phase 4: Player Progression (Meta)

### 4.1 Extermination Points

Earned per run:
- Survive wave = 10 points
- Escape with TARDIS = 100 points
- Combo bonus = max_combo × 2 points

### 4.2 Permanent Upgrades

| Upgrade | Cost | Effect |
|---------|------|--------|
| Dalek Armor I | 50 | +10 max HP |
| Dalek Armor II | 100 | +20 max HP |
| Dalek Armor III | 200 | +30 max HP |
| Extended Mag I | 75 | +25 max ammo |
| Extended Mag II | 150 | +50 max ammo |
| Swift Protocol | 100 | +10% move speed |
| Rapid Extermination | 150 | -10% shot cooldown |
| Extended Power | 100 | Power-ups last 12s |
| Cell Carrier | 200 | 75% speed with cell |

### 4.3 Unlockable Weapons

**Laser Beam** (500 points)
- Continuous beam, 8 DPS
- No ammo, overheats
- Penetrates enemies

**Grenade Launcher** (1000 points)
- 3 ammo capacity, slow reload
- AOE explosion
- Self-damage possible

---

## Phase 5: Polish & Juice

### 5.1 Dalek Voice Lines

| Trigger | Lines |
|---------|-------|
| Game Start | "EXTERMINATE ALL VERMIN!" |
| Kill | "EXTERMINATE!" / "INFERIOR!" / "DELETED!" |
| 5+ Combo | "MAXIMUM EXTERMINATION!" |
| Cell Pickup | "POWER CELL ACQUIRED!" |
| Cell Drop | "CELL JETTISONED!" |
| Low Health | "SYSTEMS CRITICAL!" |
| Find TARDIS | "THE DOCTOR'S CAPSULE..." |
| Cell Delivered | "POWER INCREASING!" |
| Escape | "STRATEGIC RETREAT!" |

### 5.2 Environmental Props

- Rat propaganda posters ("FARSH IS LIFE")
- Doctor's scattered notes
- Dalek wreckage (other Daleks didn't make it)
- Cult scriptures (humorous meat-worship texts)

### 5.3 Audio (Future)

- Shotgun blast
- Dalek voice synthesizer
- Rat squeaks/chitters
- TARDIS materialization
- Ambient cult chanting
- Dynamic music system

---

## Phase 6: Game Modes

### 6.1 Campaign Mode (Default)
- Find 3 cells, power TARDIS, escape
- 10-15 minute runs
- Win condition exists

### 6.2 Endless Mode (Unlockable)
- No TARDIS, no cells
- Pure survival
- Leaderboard focused

### 6.3 Daily Challenge
- Seeded map (same for everyone)
- Special modifiers
- Global leaderboard

### 6.4 Boss Rush (Unlockable)
- Fight all mini-bosses + High Priest
- No waves between
- Speed-run focused

---

## Implementation Priority

### Sprint 1: MVP Objective System
- [x] TARDIS model and placement
- [x] Move TARDIS to random room (not spawn)
- [x] Power Cell entity and spawning
- [x] Cell carrying mechanic
- [x] Cell delivery to TARDIS
- [x] WIN condition and victory screen
- [x] Player spawn without TARDIS

### Sprint 2: Exploration
- [ ] Fog of war system
- [ ] Minimap UI
- [ ] Room type variety
- [ ] Environmental hazards

### Sprint 3: New Enemies
- [ ] Priest Rat (buffer)
- [ ] Bomber Rat (exploder)
- [ ] Brood Mother mini-boss

### Sprint 4: Meta Progression
- [ ] Extermination Points currency
- [ ] Permanent upgrades menu
- [ ] Save/load progression (localStorage)

### Sprint 5: Polish
- [ ] Dalek voice lines (text bubbles)
- [ ] More environmental props
- [ ] Sound effects

---

## Target Experience

> *You spawn in a dark room. Your Dalek's eye scans the shadows. The HUD shows: OBJECTIVE: FIND THE TARDIS.*
>
> *You blast through corridors, combo counter climbing. A glowing cell pulses in the distance - one of three. You grab it... movement slows. Rats swarm. Drop the cell, EXTERMINATE, pick it up again.*
>
> *The TARDIS stands dormant in a ritual chamber. Insert cell one - it flickers. Two more to go. The wave counter shows 4. Time is running out.*
>
> *Final cell. Rats everywhere. Brood Mother blocking the path. Dash through, take damage, slam the cell into the TARDIS. It roars to life. You step inside.*
>
> *STRATEGIC RETREAT. Score: 12,450. Best Combo: 23. Waves Survived: 6.*
