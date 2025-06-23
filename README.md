# ngrx-store-wrapper

A lightweight Angular library that simplifies dynamic state management with NgRx. This library allows you to create, update, and remove store slices at runtime without manual boilerplate code.

## Features

- **Dynamic State Management**
  - Create and update store slices at runtime
  - Automatically generates reducers, actions, and selectors
  - Handles both static and dynamic reducers

- **Safety Features**
  - Automatic detection of static reducers
  - Protection against static reducer overwriting
  - Dev-mode warnings for resource management
  - Clear error handling for uninitialized store

- **Resource Management**
  - Warns when more than 100 dynamic keys are registered
  - Automatic cleanup of unused reducers
  - Efficient state observation through selectors

- **Easy Integration**
  - Singleton service provided in root
  - Compatible with Angular's standalone components
  - Simple API surface with set(), get(), and remove()

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
```

## API Reference

| Method | Description | Return Type | Notes |
| --- | --- | --- | --- |
| `set(key: string, value: any)` | Sets or updates data for a dynamic key | `void` | Creates reducer/action/selector automatically |
| `get<T = any>(key: string)` | Returns observable of state | `Observable<T>` | Returns `{ value: T }` for dynamic keys, raw state for static keys |
| `remove(key: string)` | Removes dynamic reducer, action, and selector | `void` | Only removes dynamic keys |

### State Return Types
- **Dynamic Keys**: Returns the value directly (e.g., `{ name: 'Alice', age: 25 }`)
- **Static Keys**: Returns raw state slice directly (e.g., `{ name: 'Alice', age: 25 }`)

**Note**: Even though dynamic state is stored internally as `{ value: T }`, the `get()` method automatically extracts and returns just the value. This means users don't need to handle the `{ value: ... }` wrapper - they get the actual data directly.

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

3. **State Management**
   - Use meaningful, unique keys
   - Consider prefixing keys in large applications
   - Handle Observable errors in subscriptions

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