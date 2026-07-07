# BuiltIQ Health

BuiltIQ Health is a wellness and fitness application focused on helping users build themselves physically, mentally, and spiritually through exercise tracking, nutrition tracking, progress history, and future AI coaching.

## Product Vision

BuiltIQ Health helps people become stronger, healthier, and more consistent by combining workout tracking, nutrition tracking, wellness habits, progress insights, and personalized AI coaching in one simple platform.

## Core Concept

BuiltIQ Health is built around the idea that health is wealth and that users are always building themselves for the present and the future.

## Current MVP Focus

The initial product focus is to create a strong foundation for:

- User accounts and authentication
- Strength training and workout logging
- Exercise templates
- Workout history
- Progress tracking
- Nutrition and macro tracking
- Secure database structure
- Mobile-friendly user experience

## Future Product Direction

Future versions may include:

- AI Wellness Coach
- Personalized workout generation
- Nutrition recommendations
- Habit tracking
- Recovery tracking
- Progress analytics
- Wearable integrations
- iOS and Android apps
- Tiered free and premium subscriptions

## Development Principles

All development should follow these principles:

1. Keep the app simple and easy to use.
2. Protect user data with proper authentication and database security.
3. Document every meaningful change.
4. Build mobile-first whenever possible.
5. Avoid unnecessary complexity until the MVP is stable.
6. Maintain a clear product roadmap.
7. Treat AI-generated code as code that must be reviewed and tested.

## Branch Strategy

Recommended branch setup:

- `develop` = active coding and AI development
- `main` = stable testing environment
- `production` = future live user environment

For now, if only `main` exists, create a `develop` branch before making major changes.

## Change Management

Every meaningful change should use a BuiltIQ change number:

Example:

```text
BIQ-0001 Initial documentation foundation
BIQ-0002 Authentication security updates
BIQ-0003 Workout history redesign
BIQ-0004 Nutrition tracker foundation
BIQ-0005 AI Coach planning
```

Each change should update `CHANGELOG.md` and include testing steps.

## Recommended Cursor Workflow

Before coding, ask Cursor to:

```text
Review README.md, ROADMAP.md, CHANGELOG.md, DECISIONS.md, and .cursorrules before making changes. Follow the BuiltIQ change management process. Create or use the next BIQ change number, document files changed, database changes, testing steps, and recommended commit message.
```
