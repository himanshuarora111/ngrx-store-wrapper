# NgRx Store Wrapper - Development Roadmap

This document outlines the planned features and improvements for the NgRx Store Wrapper library.

## 🟥 Priority 0 (Urgent)

### Bug Fixes
*No critical bugs currently open.*

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

- **AutoBind Simplification**  
  Simplify the auto-binding logic to reduce complexity:
    - Consider using a streamlined approach based on standard `AutoBind()` decorators.
    - Evaluate using existing solutions like `autobind-decorator` for simplicity and consistency.

- **Polling Subscription Management**  
  Ensure proper cleanup of polling subscriptions in `addHttpEffect()` to prevent memory leaks:
    - Automatically handle teardown when effects are removed.
    - Optionally expose `onStop()` or `onDestroy()` callbacks for custom cleanup logic.

- **Optional Effect Timeouts**  
  Add support for effect-level timeouts:
    ```typescript
    addEffect({
      key: 'fetch',
      serviceFn: fetchData,
      timeoutMs: 5000, // Auto-cancel after 5 seconds
    });
    ```
    - Cancel requests that exceed the timeout threshold.
    - Optionally trigger `onError` with timeout-specific errors.

- **Clear All State API**  
  Provide a utility method to clear all dynamically registered keys:
    ```typescript
    public clearAll(): void {
      Object.keys(this.dynamicReducers).forEach(key => this.remove(key));
    }
    ```
    - Safely removes all dynamic state and cleans up related resources.
    - Useful for testing and application teardown scenarios.

## 🟨 Priority 2 (Nice to Have)

### Developer Experience
- **Effect Debounce/Throttle**  
  Add helpers for debouncing or throttling effects.

- **Persistence Hooks**  
  Add ability to listen to when something is persisted/restored.

- **Observable for Dynamic Keys**  
  Add `selectAll()` or `selectDynamicKeys()` methods.

- **Unify Effect Execution Logic**  
  Current implementation handles standard effects and HTTP effects differently:
    - Error handling is centralized for `addEffect()` but duplicated in `addHttpEffect()`.
    - Transform functions run after errors in `addEffect()`, but before in `addHttpEffect()`, causing inconsistent behavior.
    - Cleanup mechanisms differ (`pollingSubscriptions` vs. ad-hoc `finalize()`).
    
    Plan:
    - Migrate both effect types to a unified `executeEffect()` method.
    - Consolidate error handling and transform timing.
    - Standardize cleanup logic.
    
    Outcome:
    - Simpler codebase.
    - Easier to maintain and extend (e.g., retries, retries with backoff).
    - Prevents subtle future inconsistencies.

- **DevMode Analytics**  
  Enhance developer insights with effect counts, polling frequency, and other metrics.

- **Effect Cancellation**  
  Improve effect removal with cancellation hooks or signals.

- **Configurable Warning Thresholds**  
  Allow configuring constants like `DYNAMIC_KEY_WARN_THRESHOLD` via:
    - Global settings or constructor options.
    - Environment variables.
    - Runtime configuration.

- **Logging Service**  
  Replace direct console calls with an injectable logging service:
    - Allow users to plug in custom loggers.
    - Support different log levels (e.g., warn, debug, error).
    - Optional suppression of logs in production environments.

### Documentation Improvements

- **Polling Effect Documentation**  
  Improve documentation for polling effects:
    - Add clear examples for polling with stop conditions and cleanup.
    - Document common pitfalls (e.g., unintentional infinite polling loops).
    - Include best practices for error handling in long-running effects.

- **Effect Usage Warnings**  
  Add runtime warnings for potential issues:
    - Warn when using `take(1)` in long-polling or subscription-based effects.
    - Provide examples of safer alternatives (e.g., `takeUntil` with destroy subject).
    - Include performance considerations for different effect patterns.

- **NgRx Migration Guide**  
  Create comprehensive migration documentation:
    - Map vanilla NgRx concepts to ngrx-store-wrapper equivalents.
    - Clarify when to use `storeWrapper.set()` vs. dispatching NgRx actions directly.
    - Include side-by-side code comparisons for common patterns.
    - Provide migration strategies for different application sizes.

## ✅ Completed

### Bug Fixes
- **Persistence Not Triggered for Reducers Called Using Traditional Way**  
  Fixed: Persistence now works with all state updates, including those made through direct store dispatches.

- **Enhanced `get()` Functionality**  
  - `storeWrapper.get()` now throws a clear error when used with string keys that haven't been created using `set()`. The error message includes guidance to call `set(key, value)` first or check for typos.
  - Added support for passing custom NgRx selectors directly to `get()`, allowing for more flexible state access patterns while maintaining type safety.

## Contribution Guidelines

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request
