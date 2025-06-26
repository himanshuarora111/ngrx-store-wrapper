# ngrx-store-wrapper

A lightweight Angular library for dynamic NgRx state management with zero boilerplate.

## Key Features

- 🏗️ Dynamic Reducers - Create store slices at runtime
- ⚡ Effect System - Auto-bound methods, polling, manual triggers
- 💾 Persistence - localStorage/sessionStorage support
- 🛡️ Type Safety - Full TypeScript support
- 🧹 Automatic Cleanup - Subscription & resource management

## Installation

```bash
npm install ngrx-store-wrapper
```

## Compatibility
The store wrapper auto-initializes itself on first use, thanks to Angular's runInInjectionContext.
No manual setup needed beyond provideStore() and getInitialDynamicReducers().

✅ Compatible with Angular 15+ and NgRx 15+

## Quick Start

### 1. Initialize Store

```typescript
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideStore({
      ...getInitialDynamicReducers(),
      // Optional manually created reducers
      counter: counterReducer 
    })
  ]
};
```

### 2. Basic Usage

```typescript
// Set state
storeWrapper.set('user', { name: 'Alice' });

// Get typed observable
interface User {
  name: string;
  age?: number;
}

storeWrapper.get<User>('user').subscribe(user => {
  console.log(user.name); // Type-safe access
});

// Effects with polling
storeWrapper.addEffect({
  key: 'liveData',
  serviceFn: dataService.fetch,
  intervalMs: 5000
});
```

## Core Concepts

### Dynamic vs Manually Created Reducers

| Feature | Dynamic Reducers | Manually Created Reducers |
|---------|------------------|---------------------------|
| Creation | At runtime via set() | Using NgRx createReducer |
| Modification | Fully managed | Protected from modification |
| Use Case | Quick state needs | Complex state logic |

### Persistence
You can persist selected store keys to localStorage or sessionStorage using:

```typescript
storeWrapper.enablePersistence('user/settings', StorageType.Local);
```

- localStorage: Persists even after the browser is closed
- sessionStorage: Clears when the session ends (safer for sensitive data)

Automatically restores values on app start
Manual cleanup via disablePersistence()

## Effect System

```typescript
@Injectable()
export class UserService {
  @AutoBind() // Preserves 'this' context
  getUser(id: string) {
    return this.http.get(`/users/${id}`);
  }
}

// Component
storeWrapper.addEffect({
  key: 'user',
  serviceFn: userService.getUser,
  args: '123',
  immediate: false
});

// Manually trigger later
storeWrapper.recallEffect('user');
```

## Best Practices

- Keys - Use consistent naming (e.g., 'feature/entity')
- Effects - Always clean up in ngOnDestroy
- Types - Leverage interfaces for complex state
- Persistence - Prefer sessionStorage for sensitive data

```typescript
// Good practice example
interface Settings {
  theme: 'light'|'dark';
  fontSize: number;
}

storeWrapper.enablePersistence('user/settings', StorageType.Local);
storeWrapper.get<Settings>('user/settings').subscribe(/*...*/);
```

## API Reference

### Store Operations

| Method | Description |
|--------|-------------|
| set(key, value) | Creates/updates dynamic state |
| get<T>(key) | Returns typed observable |
| remove(key) | Cleans up dynamic state |

### Effect Methods

| Method | Description |
|--------|-------------|
| addEffect(config) | Creates managed effect |
| recallEffect(key) | Triggers effect |
| removeEffect(key) | Cleans up effect |

## Working with Manually Created Reducers

For cases where you need more control than dynamic reducers provide:

Create a traditional NgRx reducer:

```typescript
// counter.reducer.ts
const increment = createAction('[Counter] Increment');
export const counterReducer = createReducer(
  0,
  on(increment, (state) => state + 1)
);
```

Initialize with your store:

```typescript
provideStore({
  counter: counterReducer, // Manually created
  ...getInitialDynamicReducers() // Dynamic
})
```

Key differences:

Manually created reducers:
- Use NgRx actions for updates
- Protected from set() operations
- Better for complex state logic

Dynamic reducers:
- Updated via set()
- Perfect for simple state needs
- Automatic action/reducer generation

## Documentation

For more detailed information, check out our [documentation](./docs/index.md).

## Useful Links

- 🚀 [Live Demo](https://ngrx-store-helper.vercel.app/) - Try it out!
- 📚 [Usage Examples](https://github.com/himanshuarora111/ngrx-store-helper) - See it in action
- 🛠️ [Source Code](https://github.com/himanshuarora111/ngrx-store-wrapper) - Explore the library

## License

MIT License