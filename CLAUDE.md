# Rats Farcire - Development Guidelines

## Architecture & Design Principles

This project follows industry-standard software engineering principles:

### Domain-Driven Design (DDD)
- Organize code around business domains
- Use ubiquitous language throughout the codebase
- Separate domain logic from infrastructure concerns

### Clean Architecture
- Dependencies point inward (domain at center)
- Business logic independent of frameworks, UI, and databases
- Layers: Domain -> Use Cases -> Interface Adapters -> Frameworks

### Clean Code
- Meaningful, intention-revealing names
- Small, focused functions (single responsibility)
- Self-documenting code over excessive comments
- DRY (Don't Repeat Yourself)
- KISS (Keep It Simple, Stupid)

### SOLID Principles
- **S**ingle Responsibility: One reason to change per class/module
- **O**pen/Closed: Open for extension, closed for modification
- **L**iskov Substitution: Subtypes must be substitutable for base types
- **I**nterface Segregation: Prefer small, specific interfaces
- **D**ependency Inversion: Depend on abstractions, not concretions

## Code Quality Standards

### Testing
- Write tests for business logic
- Tests should be fast, isolated, and deterministic
- Mock external dependencies

### TypeScript
- Use strict mode
- Prefer explicit types over `any`
- Use readonly where appropriate

### Structure
- Group related functionality into modules
- Use factories for complex object creation
- Configuration in dedicated config files
- Keep rendering logic separate from game logic

## Project Structure

```
src/
  core/           - Game loop, main game class
  ecs/            - Entity management
  input/          - Input handling
  map/            - Map generation
  menu/           - Menu system
    config/       - Menu configuration
    factories/    - Object factories
    materials/    - Shader materials
  rendering/      - Three.js rendering
  ui/             - UI components
  network/        - Multiplayer networking
shared/           - Shared types, constants, utils
server/           - WebSocket server
```
