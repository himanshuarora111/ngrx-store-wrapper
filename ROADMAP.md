# NgRx Store Wrapper - Development Roadmap

This document outlines the planned features and improvements for the NgRx Store Wrapper library.

## 🟥 Priority 0 (Urgent)

### Bug Fixes
- **Persistence Not Triggered for Reducers Called Using Traditional Way**  
  When using `this.store.dispatch()` with reducers, persistence doesn't update. This needs to be fixed to ensure persistence hooks listen to all reducers, even if they're created outside the library.

- **Cannot Use `get()` on Manually Created Keys**  
  `storeWrapper.get()` doesn't work for manually created reducers/actions since selectors are tied only to dynamic keys. This needs to be fixed to support `get()` for any valid state key.

## 🟧 Priority 1 (Next Features)

### Core Features
- **Effect Lifecycle Hooks**  
  Add support for `onStart`, `onSuccess`, `onError`, and `onComplete` callbacks in `addEffect()` and `addHttpEffect()`.

- **Schema Validation**  
  Implement built-in validation (e.g., `setWithSchema()` or validation callbacks) to prevent invalid states.

- **Event Streams**  
  Add an event bus to emit lifecycle events or state changes (like `onSet`, `onRemove`).

- **Persistence for Manual Reducers**  
  Allow users to register persistence for reducers created outside the library.

- **API for Manual Reducers**  
  Extend library API to enable `get()` and `set()` on manually created reducers/actions.

## 🟨 Priority 2 (Nice to Have)

### Developer Experience
- **Effect Debounce/Throttle**  
  Add helpers for debouncing or throttling effects.

- **Persistence Hooks**  
  Add ability to listen to when something is persisted/restored.

- **Observable for Dynamic Keys**  
  Add `selectAll()` or `selectDynamicKeys()` methods.

- **DevMode Analytics**  
  Enhance developer insights with effect counts, polling frequency, and other metrics.

- **Effect Cancellation**  
  Improve effect removal with cancellation hooks or signals.

## Contribution Guidelines

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

Please ensure all tests pass and add new tests for any new features or bug fixes.
