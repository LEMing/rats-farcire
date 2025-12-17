# Rats Farcire

Изометрический 2.5D top-down shooter на Three.js с мультиплеером.

## Описание

Волновой шутер, где вы сражаетесь против "фаршистов" — крыс-культистов фарша. Процедурно генерируемые карты, волны врагов, сбор аптечек и патронов.

### Особенности

- **Графика**: Изометрическая 2.5D камера (orthographic), low-poly стиль
- **Геймплей**: WASD движение, прицеливание мышью, стрельба ЛКМ
- **Враги**: Три типа фаршистов (grunt, runner, tank) с размытой эмблемой "комка фарша"
- **Карты**: Процедурная генерация комнат и коридоров
- **Мультиплеер**: Authoritative сервер на Node.js + WebSocket, комнаты до 4 игроков

## Структура проекта

```
rats-farcire/
├── src/                    # Клиентский код
│   ├── main.ts            # Точка входа
│   ├── core/              # Основная игровая логика
│   │   ├── Game.ts        # Главный контроллер
│   │   └── LocalGameLoop.ts # Локальный игровой цикл (singleplayer)
│   ├── rendering/         # Three.js рендеринг
│   │   ├── Renderer.ts    # Сцена, камера, освещение
│   │   └── BlurredEmblemMaterial.ts # Размытая эмблема фаршистов
│   ├── ecs/               # Entity Component System
│   │   └── EntityManager.ts # Управление визуалами сущностей
│   ├── input/             # Ввод
│   │   └── InputManager.ts # WASD + мышь
│   ├── map/               # Генерация карт
│   │   └── MapGenerator.ts # Процедурный генератор
│   ├── ai/                # Искусственный интеллект
│   │   └── EnemyAI.ts     # Chase + avoidance + A*
│   ├── network/           # Сетевой код
│   │   └── NetworkClient.ts # WebSocket клиент
│   └── ui/                # Интерфейс
│       └── UIManager.ts   # HUD, меню
├── server/                # Серверный код
│   ├── index.ts          # WebSocket сервер
│   ├── GameRoom.ts       # Игровая комната
│   └── ServerMapGenerator.ts # Генератор карт для сервера
├── shared/               # Общий код
│   ├── types.ts          # TypeScript типы
│   ├── constants.ts      # Игровые константы
│   └── utils.ts          # Утилиты
└── index.html            # HTML страница
```

## Управление

- **WASD / Стрелки** — Движение
- **Мышь** — Прицеливание
- **ЛКМ** — Стрельба
- **R** — Перезарядка (если реализовано)
- **E** — Взаимодействие (если реализовано)

## Запуск

### Установка зависимостей

```bash
npm install
```

### Режим разработки (Singleplayer)

```bash
npm run dev
```

Откройте http://localhost:3000

### Multiplayer

Терминал 1 — Запуск сервера:
```bash
npm run server
```

Терминал 2 — Запуск клиента:
```bash
npm run dev
```

Или одной командой:
```bash
npm run dev:all
```

### Production сборка

```bash
npm run build
npm run preview
```

## Конфигурация

Основные настройки в `shared/constants.ts`:

```typescript
// Сеть
export const SERVER_PORT = 8080;
export const TICK_RATE = 20;
export const MAX_PLAYERS_PER_ROOM = 4;

// Игрок
export const PLAYER_SPEED = 8;
export const PLAYER_MAX_HEALTH = 100;
export const SHOOT_COOLDOWN = 150; // ms

// Карта
export const TILE_SIZE = 2;
export const MAP_WIDTH = 50;
export const MAP_HEIGHT = 50;
export const ROOM_COUNT = 8;
```

## Архитектура мультиплеера

```
┌─────────┐    WebSocket     ┌─────────┐
│ Client  │ ───────────────► │ Server  │
│         │ ◄─────────────── │         │
└─────────┘                  └─────────┘
     │                            │
     │ Input (20 Hz)              │ State Snapshot (20 Hz)
     ▼                            ▼
┌─────────┐                  ┌─────────┐
│ Predict │                  │Authori- │
│  Local  │                  │ tative  │
└─────────┘                  │ Logic   │
     │                       └─────────┘
     │ Interpolate
     ▼
┌─────────┐
│ Render  │
│ (60 Hz) │
└─────────┘
```

- **Authoritative Server**: Вся игровая логика выполняется на сервере
- **Snapshot Sync**: Сервер отправляет полное состояние 20 раз в секунду
- **Interpolation**: Клиент интерполирует между снимками для плавности
- **Input Buffering**: Ввод игрока буферизуется с sequence numbers

## Технологии

- **Three.js** — 3D рендеринг
- **TypeScript** — Типизация
- **Vite** — Сборка и dev-сервер
- **WebSocket (ws)** — Сетевое взаимодействие
- **tsx** — Запуск TypeScript на сервере

## Расширение

### Добавление нового типа врага

1. Добавьте тип в `shared/types.ts`:
```typescript
export type EnemyType = 'grunt' | 'runner' | 'tank' | 'boss';
```

2. Добавьте конфиг в `shared/constants.ts`:
```typescript
export const ENEMY_CONFIGS = {
  // ...
  boss: {
    health: 500,
    speed: 2,
    damage: 50,
    attackCooldown: 1500,
    attackRange: 3,
    hitboxRadius: 1.5,
    score: 100,
  },
};
```

3. Добавьте визуал в `EntityManager.ts`:
```typescript
case 'boss':
  bodyMat = new THREE.MeshLambertMaterial({ color: 0x800080 });
  break;
```

### Добавление нового оружия

Добавьте в `LocalGameLoop.ts` и `GameRoom.ts` новую логику стрельбы.

## Лицензия

MIT
