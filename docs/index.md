# NgRx Store Wrapper - Complete Documentation

## 📖 Table of Contents
- [Introduction](#introduction)
- [Installation & Setup](#installation--setup)
- [Compatibility](#compatibility)
- [Core Concepts](#core-concepts)
  - [Dynamic vs. Manually Created Reducers](#dynamic-vs-manually-created-reducers)
  - [State Persistence](#state-persistence)
  - [Effect System](#effect-system)
- [API Reference](#api-reference)
  - [Store Operations](#store-operations)
  - [Effect Management](#effect-management)
  - [Effect Configuration](#effect-configuration)
  - [Storage Types](#storage-types)
  - [AutoBind Decorator](#autobind-decorator)
- [Advanced Usage](#advanced-usage)
  - [Effect Binding Alternatives](#effect-binding-alternatives)
  - [Parallel Usage with Manual Reducers](#parallel-usage-with-manual-reducers)
  - [State Shape Deep Dive](#state-shape-deep-dive)
  - [Complex Effect Chains](#complex-effect-chains)
  - [Effect Error Handling](#effect-error-handling)
  - [Effect Cleanup Patterns](#effect-cleanup-patterns)
- [Advanced Topics](#advanced-topics)
  - [Lazy-Loaded Modules](#lazy-loaded-modules)
  - [Namespacing Keys](#namespacing-keys)
  - [Automatic Key Cleanup](#automatic-key-cleanup)
- [Best Practices](#best-practices)
  - [Key Naming](#key-naming)
  - [Effect Cleanup](#effect-cleanup)
  - [Type Safety](#type-safety)
  - [Error Handling](#error-handling)
  - [Performance Optimization](#performance-optimization)
  - [Anti-Patterns](#anti-patterns)
- [Performance Considerations](#performance-considerations)
- [Troubleshooting](#troubleshooting)
- [Migration Guide](#migration-guide)
- [Usage Examples](#usage-examples)
  - [Setup and Initialization](#setup-and-initialization)
  - [Dynamic State Operations](#dynamic-state-operations)
  - [Persistence Control](#persistence-control)
  - [Working with Manually Created Reducers](#working-with-manually-created-reducers)
  - [Effects: Adding, Triggering, and Removing](#effects-adding-triggering-and-removing)
  - [Polling Effects](#polling-effects)
  - [Effect with Manual Trigger and Delayed Execution](#effect-with-manual-trigger-and-delayed-execution)
  - [Using Complex Keys and Namespacing](#using-complex-keys-and-namespacing)
  - [Cleanup Best Practices](#cleanup-best-practices)
- [FAQ](#faq)

## 🌟 Introduction

A lightweight Angular library that simplifies NgRx state management by:

- 🏗️ Eliminating boilerplate (no explicit actions/reducers)
- ⚡ Enabling dynamic state creation at runtime
- 💾 Automating persistence (localStorage/sessionStorage)
- 🛡️ Maintaining full TypeScript support

Ideal for:
- Rapid prototyping
- Apps with dynamic state needs
- Teams reducing NgRx complexity

## 🔍 Compatibility

✅ Compatible with Angular 15+ and NgRx 15+

- Although peerDependencies previously targeted Angular 19+, the library is tested with Angular 16.2.0 and NgRx 16.2.0.
- Expected to remain compatible through Angular 20.

## 🔧 Installation & Setup

### 1. Install Package

```bash
npm install ngrx-store-wrapper
```

### 2. Initialize Store

```typescript
// app.config.ts
import { provideStore } from '@ngrx/store';
import { getInitialDynamicReducers } from 'ngrx-store-wrapper';

export const appConfig = {
  providers: [
    provideStore({
      ...getInitialDynamicReducers(), // Required for dynamic state
      auth: authReducer,              // Optional manually created reducers
    })
  ]
};
```

### 3. Auto-Initialization
The wrapper self-initializes on first API call (no manual injection needed).

## 🔩 Core Concepts

### Dynamic vs. Manually Created Reducers

| Feature | Dynamic Reducers | Manually Created Reducers |
|---------|------------------|------------------|
| Creation | Runtime via set() | createReducer() |
| Modification | Mutable | Immutable |
| Persistence | Supported | Not supported |

### State Persistence

```typescript
// Enable
storeWrapper.enablePersistence('user/settings', StorageType.Local);

// Disable 
storeWrapper.disablePersistence('user/settings');
```

Storage Types:
- StorageType.Local - Persists after browser close
- StorageType.Session - Clears on tab close

### Effect System

Key Features:
- Auto-binding (@AutoBind or context parameter)
- Polling (intervalMs)
- Manual triggers (recallEffect())

```typescript
// With context binding
storeWrapper.addEffect({
  key: 'user',
  serviceFn: userService.fetchUser,
  context: userService, // Alternative to @AutoBind
  args: '123'
});
```

## 📚 API Reference

### Store Operations

| Method | Description |
|--------|-------------|
| set(key: string, value: any) | Creates/updates dynamic state |
| get<T>(key: string) | Returns typed Observable<T> |
| remove(key: string) | Deletes state + cleans up resources |

### Effect Management

| Method | Description |
|--------|-------------|
| addEffect(config) | Registers effect (polling/immediate) |
| recallEffect(key, newArgs?) | Manually triggers effect |
| removeEffect(key) | Stops effect + polling |

### Persistence Control

| Method | Description |
|--------|-------------|
| enablePersistence(key, type) | Enables auto-sync with storage |
| disablePersistence(key) | Disables + clears storage |

## 🚀 Advanced Usage

### Effect Binding Alternatives

```typescript
@Injectable()
export class UserService {
  @AutoBind() // Preserves 'this' context
  fetchUser(id: string) {
    return this.http.get(`/users/${id}`);
  }
}

// Component
storeWrapper.addEffect({
  key: 'user',
  serviceFn: userService.fetchUser,
  args: '123',
  immediate: false
});
```

### Parallel Usage with Manual Reducers

```typescript
// Manual reducer (protected)
const counterReducer = createReducer(0, ...);

// Dynamic reducer (mutable)
storeWrapper.set('session/timer', 0);

// Hybrid effect
storeWrapper.addEffect({
  key: 'syncCount',
  serviceFn: () => {
    store.dispatch(increment()); // Manual action
    storeWrapper.set('session/timer', Date.now()); // Dynamic update
  }
});
```

### State Shape Deep Dive

| Reducer Type | Internal Storage | Consumer Receives |
|--------------|------------------|------------------|
| Dynamic | { value: T } | T (unwrapped) |
| Manual | T (direct) | T |

## ✅ Best Practices

### Key Naming
Use domain/entity format:
- user/profile
- admin/settings
- session/timer

### Effect Cleanup
Always call in ngOnDestroy:

```typescript
ngOnDestroy() {
  storeWrapper.removeEffect('liveData');
}
```

### Type Safety
Define interfaces for complex state:

```typescript
interface UserSettings { 
  theme: string; 
  fontSize?: number;
}

storeWrapper.get<UserSettings>('user/settings');
```

## ⚡ Performance Considerations

🚀 Limit dynamic keys to <100

🚀 Avoid persisting large objects

🚀 Use sessionStorage for high-frequency updates

🚀 Use immediate: false for manual-trigger effects

## 🐞 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Store not initialized" | Check provideStore() setup |
| "Effect not triggering" | Verify immediate or recallEffect() |
| "Persistence not working" | Call enablePersistence() |
| "Effect error" | Add error handling in service methods |

## 🔄 Migration Guide

### Common Migration Pitfalls

1. **State Structure Changes**
   - Dynamic reducers wrap values in `{ value: T }`
   - Manual reducers return raw state
   - Update selectors accordingly

2. **Effect Management**
   - Add proper error handling
   - Use `immediate: false` for manual triggers
   - Clean up effects in `ngOnDestroy()`

3. **Performance Considerations**
   - Limit dynamic keys to <100
   - Use `transform` to reduce data size
   - Use `sessionStorage` for temporary state

### Migration Steps

1. **Initial Setup**
```typescript
// 1. Add dynamic reducers
provideStore({
  ...getInitialDynamicReducers(),
  // Keep existing reducers
  auth: authReducer
});

// 2. Migrate state
storeWrapper.set('users', []);
```

2. **Migrate Effects**
```typescript
// Before (NgRx)
// 1. Create action
const loadUsers = createAction('[Users] Load');

// 2. Create effect
@Injectable()
export class UsersEffects {
  loadUsers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadUsers),
      switchMap(() =>
        this.userService.getAll().pipe(
          map(users => loadUsersSuccess({ users })),
          catchError(error => of(loadUsersFailure({ error })))
        )
      )
    )
  );
}

// 3. Create reducer
const usersReducer = createReducer(
  initialState,
  on(loadUsersSuccess, (state, { users }) => ({ ...state, users })),
  on(loadUsersFailure, (state, { error }) => ({ ...state, error }))
);

// 4. Create selector
export const selectUsers = (state: AppState) => state.users.users;
export const selectUsersError = (state: AppState) => state.users.error;

// 5. Use in component
const users$ = store.select(selectUsers);
const error$ = store.select(selectUsersError);

// After (Store Wrapper)
// 1. Set initial state
storeWrapper.set('users', []);

// 2. Add effect
storeWrapper.addEffect({
  key: 'users/load',
  serviceFn: userService.getAll,
  immediate: true,
  transform: users => ({ users })
});

// 3. Use in component
const users$ = storeWrapper.get<User[]>('users');
```

3. **Testing Strategy**
```typescript
// Before (NgRx)
const actions = TestBed.inject(Actions);
actions.pipe(ofType(loadUsers)).subscribe(...);

// After (Store Wrapper)
storeWrapper.get<User[]>('users').subscribe(...);
```

### Performance Considerations

1. **State Management**
   - Keep dynamic keys under 100
   - Use manual reducers for complex state
   - Clean up unused dynamic reducers

2. **Effects**
   - Use `immediate: false` for manual triggers
   - Add proper error handling
   - Use `transform` to reduce data size

3. **Persistence**
   - Use `sessionStorage` for temporary state
   - Limit persisted data size
   - Clean up persisted data when no longer needed

## ❓ FAQ

### Common Questions

**Q: Can I use this with existing NgRx stores?**
✅ Yes! Works alongside manually created reducers.

**Q: How to debug state changes?**
Use NgRx DevTools - fully compatible.

**Q: SSR support?**
⚠️ Requires localStorage polyfill for server-side.

**Q: How to handle errors in effects?**
Add error handling in service methods and subscribe with error handler:

```typescript
storeWrapper.get<User>('user').subscribe({
  next: user => console.log('User loaded', user),
  error: err => console.error('Failed to load user', err)
});
```

**Q: How to test effects?**
Use TestBed and mock services:

```typescript
it('should handle user effect', () => {
  const userService = TestBed.inject(UserService);
  const spy = spyOn(userService, 'fetchUser').and.returnValue(of(mockUser));
  
  storeWrapper.addEffect({
    key: 'user',
    serviceFn: userService.fetchUser,
    args: '123'
  });
  
  expect(spy).toHaveBeenCalled();
});
```

## 📦 Advanced Topics

### Lazy-Loaded Modules

Initialize dynamic state within lazy modules by calling storeWrapper.set() in services or lifecycle hooks. This keeps state modular and scoped.

```typescript
// Lazy module service
@Injectable({ providedIn: 'any' })
export class FeatureService {
  constructor() {
    // Initialize feature-specific state
    storeWrapper.set('featureX/settings', { theme: 'dark' });
  }
}
```

### Namespacing Keys

Use structured key names to:
- Avoid collisions
- Group related data logically
- Make debugging easier

```typescript
// Good practice
storeWrapper.set('featureX/settings', { theme: 'dark' });
storeWrapper.set('user/profile', userProfile);

// Bad practice (avoid flat structure)
storeWrapper.set('settings', { theme: 'dark' }); // Could collide with other settings
```

### Automatic Key Cleanup

When removing a dynamic key via storeWrapper.remove():

1. Unregisters its reducer
2. Removes persisted storage
3. Deletes effect subscriptions
4. Cleans up all associated resources

This helps prevent memory leaks in long-running applications.

```typescript
// Complete cleanup example
storeWrapper.remove('featureX/settings'); // Removes state and cleanup
storeWrapper.disablePersistence('featureX/settings'); // Clears storage
storeWrapper.removeEffect('featureX/effect'); // Cleans up effects
```

## 🔄 Usage Examples

Here are comprehensive examples demonstrating all library features:

### 1. Setup and Initialization

```typescript
// app.config.ts
import { provideStore } from '@ngrx/store';
import { getInitialDynamicReducers } from 'ngrx-store-wrapper';

export const appConfig = {
  providers: [
    provideStore({
      ...getInitialDynamicReducers(),
      counter: counterReducer, // Manually created reducer example
    }),
  ],
};
```

### 2. Dynamic State Operations

```typescript
import { storeWrapper } from 'ngrx-store-wrapper';
import { StorageType } from 'ngrx-store-wrapper';

// Setting dynamic state
storeWrapper.set('user', { name: 'Alice', age: 25 });

// Getting typed observable for dynamic state
interface User {
  name: string;
  age: number;
}

storeWrapper.get<User>('user').subscribe(user => {
  console.log('User:', user.name, user.age);
});

// Removing dynamic state slice
storeWrapper.remove('user');
```

### 3. Persistence Control

```typescript
// Enable persistence to localStorage
storeWrapper.enablePersistence('userSettings', StorageType.Local);

// Data will be saved and restored automatically

// Disable persistence and clear storage
storeWrapper.disablePersistence('userSettings');
```

### 4. Working with Manually Created Reducers

```typescript
// Actions and reducer (counter example)
import { createAction, createReducer, on } from '@ngrx/store';

const increment = createAction('[Counter] Increment');

export const counterReducer = createReducer(
  0,
  on(increment, state => state + 1)
);

// Using the manually created reducer
storeWrapper.get<number>('counter').subscribe(count => {
  console.log('Counter value:', count);
});

// Attempts to set manual reducer state are ignored silently
storeWrapper.set('counter', 10); // Has no effect
```

### 5. Effects: Adding, Triggering, and Removing

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AutoBind, storeWrapper } from 'ngrx-store-wrapper';

@Injectable()
export class UserService {
  constructor(private http: HttpClient) {}

  @AutoBind()
  fetchUser(userId: string) {
    return this.http.get(`/api/users/${userId}`);
  }
}

// Register an effect that runs immediately
storeWrapper.addEffect({
  key: 'fetchUserEffect',
  serviceFn: userService.fetchUser,
  args: '123',
  immediate: true,
});

// Manually trigger the effect later
storeWrapper.recallEffect('fetchUserEffect');

// Remove effect and clean resources
storeWrapper.removeEffect('fetchUserEffect');
```

### 6. Polling Effects

```typescript
storeWrapper.addEffect({
  key: 'liveData',
  serviceFn: dataService.getLiveUpdates,
  intervalMs: 5000, // Poll every 5 seconds
  immediate: true,
  transform: (response) => response.dataItems, // Optional transform
});
```

### 7. Effect with Manual Trigger and Delayed Execution

```typescript
storeWrapper.addEffect({
  key: 'manualLoad',
  serviceFn: dataService.loadData,
  immediate: false, // Effect will NOT execute immediately
});

// Trigger manually later
storeWrapper.recallEffect('manualLoad');
```

### 8. Using Complex Keys and Namespacing

```typescript
// Set state with namespaced keys
storeWrapper.set('featureX/settings', { theme: 'dark', fontSize: 14 });
storeWrapper.set('user/profile', { name: 'Bob', email: 'bob@example.com' });

// Enable persistence for a nested key
storeWrapper.enablePersistence('featureX/settings', StorageType.Session);

// Subscribe to changes
storeWrapper.get<{ theme: string; fontSize: number }>('featureX/settings')
  .subscribe(settings => console.log(settings.theme, settings.fontSize));
```

### 9. Cleanup Best Practices

```typescript
// Remove state and persistence
storeWrapper.remove('featureX/settings');
storeWrapper.disablePersistence('featureX/settings');

// Clean up effects
storeWrapper.removeEffect('liveData');
```
