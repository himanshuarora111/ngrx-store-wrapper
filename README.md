# ngrx-store-wrapper

**ngrx-store-wrapper** is a lightweight Angular library for **dynamic NgRx state management**. It allows you to inject reducers and selectors at runtime, enabling powerful, modular, and flexible applications without boilerplate. Ideal for large Angular projects that rely on **NgRx store**.

## Features

- **Dynamic State Management**
  - Create and update store slices at runtime
  - Automatically generates reducers, actions, and selectors
  - Handles both static and dynamic reducers

- **Persistence Support**
  - Persistent storage using localStorage or sessionStorage
  - Automatic state restoration on application load
  - Support for both local and session persistence
  - Easy persistence toggle for store keys

- **Safety Features**
  - Automatic detection of static reducers
  - Protection against static reducer overwriting
  - Dev-mode warnings for resource management
  - Clear error handling for uninitialized store

- **Resource Management**
  - Warns when more than 100 dynamic keys are registered
  - Automatic cleanup of unused reducers
  - Efficient state observation through selectors
  - Automatic subscription cleanup when components are destroyed
  - Automatic cleanup of persisted data when keys are removed

- **Easy Integration**
  - Singleton service provided in root
  - Compatible with Angular's standalone components
  - Simple API surface with set(), get(), remove(), enablePersistence(), and disablePersistence()

## Installation

```bash
npm install ngrx-store-wrapper
```

## Usage

### 1. Initialize with ApplicationConfig

```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideStore } from '@ngrx/store';
import { getInitialDynamicReducers } from 'ngrx-store-wrapper';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideStore({
      ...getInitialDynamicReducers(), 
    })
  ]
};
```

### 2. Using the Store

```typescript
// Import the store wrapper
import { storeWrapper } from 'ngrx-store-wrapper';

// Set a value dynamically
storeWrapper.set('user', { name: 'Alice', age: 25 });

// Get an observable for the key's data
storeWrapper.get('user').subscribe(user => {
  console.log(user);
});

// Remove a dynamic store slice
storeWrapper.remove('user');

// Enable persistence for a store key
storeWrapper.enablePersistence('user', StorageType.Local);

// Disable persistence for a store key
storeWrapper.disablePersistence('user');
```

## API Reference

| Method | Description | Return Type | Notes |
| --- | --- | --- | --- |
| `set(key: string, value: any)` | Sets or updates data for a dynamic key | `void` | Creates reducer/action/selector automatically |
| `get<T = any>(key: string)` | Returns observable of state | `Observable<T>` | Returns `{ value: T }` for dynamic keys, raw state for static keys |
| `remove(key: string)` | Removes dynamic reducer, action, and selector | `void` | Only removes dynamic keys |
| `enablePersistence(key: string, type: StorageType)` | Enables persistence for a store key | `void` | `type` can be `StorageType.Local` or `StorageType.Session` |
| `disablePersistence(key: string)` | Disables persistence for a store key | `void` | Removes stored data from persistence |

### StorageType Enum
- `StorageType.Local`: Persists data in localStorage (persists across sessions)
- `StorageType.Session`: Persists data in sessionStorage (persists only for current session)

### State Return Types
- **Dynamic Keys**: Returns the value directly (e.g., `{ name: 'Alice', age: 25 }`)
- **Static Keys**: Returns raw state slice directly (e.g., `{ name: 'Alice', age: 25 }`)

**Note**: The library now returns the actual value directly without wrapping it in a payload object. This means users get the exact data they set without any additional wrapping.

## Key Concepts

### getInitialDynamicReducers()
This function is essential for initializing the dynamic store system. It:
1. Sets up the initial state structure
2. Creates the necessary reducer configuration
3. Enables dynamic reducer registration
4. Detects static reducers from the initial state

### Store State Structure
The store state is a simple object with string keys:

```typescript
interface StoreState {
  [key: string]: any;
}
```

### Dynamic vs Static Reducers
- **Static Reducers**: Automatically detected from initial store state
- **Dynamic Reducers**: Created at runtime for new keys
- **Protection**: Attempts to modify static reducers are ignored in dev mode

### Internal Implementation

1. **Reducers**: Created automatically using `createReducer` from NgRx
2. **Actions**: Generated with `createAction` for each key
3. **Selectors**: Created using `createSelector` for efficient state observation
4. **State Structure**: Dynamic state is wrapped in `{ value: T }` structure

## Best Practices

1. **Initialization**
   - Always initialize store with `getInitialDynamicReducers()`
   - Use `storeWrapper` for all store operations

2. **Resource Management**
   - Clean up unused dynamic keys with `remove()`
   - Be cautious of creating more than 100 dynamic keys
   - Remove reducers when components are destroyed
   - Clean up persisted data when it's no longer needed

3. **State Management**
   - Use meaningful, unique keys
   - Consider prefixing keys in large applications
   - Handle Observable errors in subscriptions
   - Use `enablePersistence()` for data that needs to persist across sessions

4. **Persistence Usage**
   - Use `StorageType.Local` for data that should persist across browser sessions
   - Use `StorageType.Session` for data that should only persist during current session
   - Remember to call `disablePersistence()` when data should no longer be persisted

## Development

To build the library:

```bash
ng build ngrx-store-wrapper
```

To run tests:

```bash
ng test ngrx-store-wrapper
```

## License

MIT License