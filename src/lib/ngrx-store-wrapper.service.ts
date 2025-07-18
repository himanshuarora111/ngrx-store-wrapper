// ngrx-store-wrapper.service.ts
import {
  Store,
  createAction,
  createReducer,
  on,
  ActionReducerMap,
  ReducerManager,
  createSelector,
  select
} from '@ngrx/store';
import { Observable, interval, Subscription, of, firstValueFrom } from 'rxjs';
import { take, catchError, startWith, finalize } from 'rxjs/operators';
import {
  isDevMode,
  Injectable,
  inject,
  DestroyRef,
  Injector,
  Type,
  NgZone
} from '@angular/core';
import { DevToolsService } from './devtools.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StorageType } from './storage-type.enum';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface StoreState {
  [key: string]: any;
}

const DYNAMIC_KEY_WARN_THRESHOLD = 100;
const LOCAL_KEY_META = '__ngrx_wrapper_persisted_keys__';
const SESSION_KEY_META = '__ngrx_wrapper_persisted_keys__';

const autoBindMetadata = new WeakMap<Function, Type<any>>();

export function AutoBind(): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    autoBindMetadata.set(originalMethod, target.constructor);

    const wrapperFn = function (this: any, ...args: any[]) {
      return originalMethod.apply(this, args);
    };

    autoBindMetadata.set(wrapperFn, target.constructor);
    
    Object.defineProperties(wrapperFn, {
      '__originalFn': {
        value: originalMethod,
        enumerable: false,
        configurable: true,
        writable: false
      },
      '__autoBound': {
        value: true,
        enumerable: false,
        configurable: false
      },
      'name': {
        value: `bound ${originalMethod.name}`,
        configurable: true
      }
    });

    descriptor.value = wrapperFn;
    return descriptor;
  };
}

@Injectable({ providedIn: 'root' })
export class NgrxStoreWrapperService {
  private reducerManager!: ReducerManager;
  private store!: Store<StoreState>;
  private staticReducerKeys: Set<string> = new Set();

  private dynamicReducers: ActionReducerMap<StoreState> = {};
  private dynamicActions: Record<string, any> = {};
  private selectors: Record<string, any> = {};
  private persistedKeys: Map<string, StorageType> = new Map();
  private pollingSubscriptions: Record<string, Subscription> = {};
  private effectConfigs: Record<string, {
    intervalMs?: number;
    immediate?: boolean;
    transform?: (result: any) => any;
    originalServiceFn: (...args: any[]) => Observable<any>;
    context?: any;
    args?: any;
  }> = {};

  private isInitialized = false;

  constructor(
    private injector: Injector, 
    private http: HttpClient,
    private devTools: DevToolsService,
    private ngZone: NgZone
  ) {}

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Store must be initialized before use. Call initializeStore() first.');
    }
  }

  public initializeStore(store: Store<StoreState>, reducerManager: ReducerManager): void {
    this.isInitialized = true;
    this.store = store;
    this.reducerManager = reducerManager;

    const selectWholeState = createSelector(
      (state: StoreState): StoreState => state,
      (state: StoreState): StoreState => state
    );

    this.store.pipe(select(selectWholeState), take(1)).subscribe((state) => {
      Object.keys(state).forEach((key) => this.staticReducerKeys.add(key));
    });
    this.loadPersistedKeys();
    this.restorePersistedState();
  }

  public set(key: string, value: any): void {
    // 1. Initialization check
    this.ensureInitialized();
  
    if (typeof key !== 'string') {
      throw new Error('Key must be a string');
    }
  
    // 2. Static key protection
    if (this.staticReducerKeys.has(key)) {
      if (isDevMode()) {
        console.warn(`[ngrx-store-wrapper] Attempted to set static reducer key: "${key}"`);
      }
      return;
    }
  
    const actionKey = `set${key}`; // Backward-compatible action key
  
    // 3. Lazy initialization
    if (!this.dynamicActions[actionKey]) {
      // Action setup (original format)
      this.dynamicActions[actionKey] = createAction(
        `[${key}] Set`, 
        (value: any) => ({ value }) // No metadata
      );
  
      // Reducer with null initialization + DevTools
      this.dynamicReducers[key] = createReducer(
        null, // Optimized initialization
        on(this.dynamicActions[actionKey], (state, { value }) => {
          // Skip no-op updates
          if (state === value) return state;
          
          // DevTools logging (inside NgZone)
          this.ngZone.run(() => {
            this.devTools.logAction('SET', key, {
              value,
              previous: state,
              timestamp: new Date().toISOString()
            });
          });
          return value;
        }
      ));
  
      // Register reducer
      this.reducerManager.addReducer(key, this.dynamicReducers[key]);
      if (isDevMode() && Object.keys(this.dynamicReducers).length > DYNAMIC_KEY_WARN_THRESHOLD) {
        console.warn(
          `[ngrx-store-wrapper] More than ${DYNAMIC_KEY_WARN_THRESHOLD} dynamic store keys registered.`
        );
      }
      // Selector setup
      this.selectors[key] = createSelector(
        (state: any) => state[key],
        val => val
      );
    } 
    this.store.dispatch(this.dynamicActions[actionKey](value));
  
    if (this.persistedKeys.has(key)) {
      const type = this.persistedKeys.get(key)!;
      const storage = type === StorageType.Local ? localStorage : sessionStorage;
      this.ngZone.runOutsideAngular(() => {
        try {
          storage.setItem(key, JSON.stringify(value));
        } catch (e) {
          console.error('Storage write failed', e);
        }
      });
    }
  }

  public get<T = any>(key: string): Observable<T> {
    if (!this.store) {
      throw new Error('Store must be initialized before getting data');
    }

    if (!this.selectors[key]) {
      this.selectors[key] = createSelector(
        (state: StoreState) => state[key],
        (val: T) => val
      );
    }

    const observable$ = this.store.pipe(select(this.selectors[key]));

    try {
      const destroyRef = inject(DestroyRef);
      return observable$.pipe(takeUntilDestroyed(destroyRef));
    } catch {
      if (isDevMode()) {
        console.warn(
          `[ngrx-store-wrapper] Auto-unsubscribe only works in components/services. ` +
            `You're using 'get("${key}")' outside an Angular injection context.`
        );
      }
      return observable$;
    }
  }

  public addEffect<T = any>(options: {
    key: string;
    serviceFn: (...args: any[]) => Observable<T>;
    context?: any;
    args?: any;
    intervalMs?: number;
    immediate?: boolean;
    transform?: (result: T) => any;
  }): void {
    // Log effect addition to DevTools outside Angular zone
    this.ngZone.runOutsideAngular(() => {
      this.devTools.logAction('EFFECT_ADD', options.key, {
        hasInterval: !!options.intervalMs,
        immediate: options.immediate !== false
      }, true);
    });
    const {
      key,
      serviceFn,
      context,
      args,
      intervalMs,
      immediate = true,
      transform
    } = options;
  
    this.removeEffect(key);
  
    this.effectConfigs[key] = {
      intervalMs,
      immediate,
      transform,
      originalServiceFn: serviceFn,
      context,
      args
    };
  
    if (immediate) {
      this.executeEffect(key);
    }
 
    if (intervalMs !== undefined) {
      this.pollingSubscriptions[key] = interval(intervalMs)
        .pipe(
          startWith(immediate ? null : intervalMs)
        )
        .subscribe(() => this.executeEffect(key));
    }
  }

  private executeEffect(key: string): void {
    const config = this.effectConfigs[key];
    if (!config) return;

    const { originalServiceFn, context, args, transform } = config;
    const boundFn = this.autoBind(originalServiceFn, context);

    boundFn(args).pipe(
      take(1),
      catchError(error => {
        console.error(`[ngrx-store-wrapper] Error in effect for key "${key}":`, error);
        return of(null);
      })
    ).subscribe({
      next: (result: any) => {
        if (result === null || result === undefined) return;
        
        const finalValue = transform ? transform(result) : result;
        // Run set inside Angular zone since it updates the store
        this.ngZone.run(() => {
          this.set(key, finalValue);
        });
      },
      error: (err) => {
        // Log error outside Angular zone to prevent unnecessary change detection
        this.ngZone.runOutsideAngular(() => {
          console.error(`[ngrx-store-wrapper] Error in effect for key "${key}":`, err);
        });
      }
    });
  }

  public addHttpEffect<T = any>(options: {
    key: string;
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
    intervalMs?: number;
    immediate?: boolean;
    transform?: (result: T) => any;
  }): void {
    const {
      key,
      url,
      method = 'GET',
      body,
      headers,
      intervalMs,
      immediate = true,
      transform
    } = options;

    this.removeEffect(key);

    const httpFn = () =>
      this.http.request(method, url, {
        body,
        headers: new HttpHeaders(headers || {})
      }).pipe(
        catchError(err => {
          console.error(`[ngrx-store-wrapper] HTTP request failed for key "${key}"`, err);
          return of(null);
        })
      );

    this.effectConfigs[key] = {
      intervalMs,
      immediate,
      transform,
      originalServiceFn: httpFn,
      context: null,
      args: undefined
    };

    const callApiAndDispatch = () => {
      const config = this.effectConfigs[key];
      if (!config) return;
      
      const subscription = config.originalServiceFn()
        .pipe(
          take(1),
          finalize(() => subscription?.unsubscribe())
        )
        .subscribe({
          next: result => {
            const finalValue = config.transform ? config.transform(result) : result;
            this.set(key, finalValue);
          },
          error: err => {
            console.error(`[ngrx-store-wrapper] Error in HTTP effect for key "${key}":`, err);
          }
        });
    };

    if (immediate) callApiAndDispatch();
    if (intervalMs !== undefined) {
      // Clean up any existing subscription
      this.removeEffect(key);
      
      const subscription = interval(intervalMs)
        .pipe(
          finalize(() => subscription?.unsubscribe())
        )
        .subscribe(() => callApiAndDispatch());
      
      this.pollingSubscriptions[key] = subscription;
    }
  }

  public recallEffect<T = any>(key: string, updatedArgs?: any): void {
    this.ensureInitialized();

    const effect = this.effectConfigs[key];
    if (!effect) {
      console.warn(`No effect found with key: ${key}`);
      return;
    }

    // Update args if provided
    if (updatedArgs !== undefined) {
      effect.args = updatedArgs;
    }

    // Log effect recall to DevTools
    this.devTools.logAction('EFFECT_RECALL', key, {
      hasUpdatedArgs: updatedArgs !== undefined,
      args: updatedArgs
    });

    this.executeEffect(key);
  }

  public removeEffect(key: string): void {
    if (this.pollingSubscriptions[key]) {
      this.pollingSubscriptions[key].unsubscribe();
      delete this.pollingSubscriptions[key];
    }

    if (this.effectConfigs[key]) {
      delete this.effectConfigs[key];
    }
  }

  public async remove(key: string): Promise<void> {
    this.ensureInitialized();

    if (this.dynamicReducers[key]) {
      // Get current state before removal for DevTools
      const currentState = await firstValueFrom(
        this.store.select(state => state[key]).pipe(take(1))
      );
      
      delete this.dynamicReducers[key];
      delete this.dynamicActions[key];
      delete this.selectors[key];
      this.reducerManager.removeReducer(key);

      // Log to DevTools
      this.devTools.logAction('REMOVE', key, {
        caller: 'remove',
        timestamp: new Date().toISOString()
      }, true);
    }
  }

  public enablePersistence(key: string, type: StorageType): void {
    this.persistedKeys.set(key, type);
    this.savePersistedKeys();

    const storage = type === StorageType.Local ? localStorage : sessionStorage;
    const valueInStorage = storage.getItem(key);

    if (valueInStorage !== null) {
      try {
        this.set(key, JSON.parse(valueInStorage));
      } catch (e) {
        console.warn(`[ngrx-store-wrapper] Failed to parse persisted value for key: ${key}`);
      }
    } else {
      this.store.pipe(select((state) => state[key]), take(1)).subscribe((val) => {
        if (val !== undefined) {
          try {
            storage.setItem(key, JSON.stringify(val));
          } catch {
            console.warn(`[ngrx-store-wrapper] Failed to persist current value for key: ${key}`);
          }
        }
      });
    }
  }

  public disablePersistence(key: string): void {
    if (!this.persistedKeys.has(key)) return;
    const type = this.persistedKeys.get(key)!;
    const storage = type === StorageType.Local ? localStorage : sessionStorage;
    storage.removeItem(key);
    this.persistedKeys.delete(key);
    this.savePersistedKeys();
  }

  private loadPersistedKeys(): void {
    const local = localStorage.getItem(LOCAL_KEY_META);
    const session = sessionStorage.getItem(SESSION_KEY_META);

    if (local) {
      try {
        const parsed = JSON.parse(local);
        Object.keys(parsed).forEach((key) => this.persistedKeys.set(key, StorageType.Local));
      } catch {}
    }

    if (session) {
      try {
        const parsed = JSON.parse(session);
        Object.keys(parsed).forEach((key) => this.persistedKeys.set(key, StorageType.Session));
      } catch {}
    }
  }

  private savePersistedKeys(): void {
    const local: Record<string, boolean> = {};
    const session: Record<string, boolean> = {};

    this.persistedKeys.forEach((type, key) => {
      if (type === StorageType.Local) local[key] = true;
      if (type === StorageType.Session) session[key] = true;
    });

    localStorage.setItem(LOCAL_KEY_META, JSON.stringify(local));
    sessionStorage.setItem(SESSION_KEY_META, JSON.stringify(session));
  }

  private restorePersistedState(): void {
    this.persistedKeys.forEach((type, key) => {
      const storage = type === StorageType.Local ? localStorage : sessionStorage;
      const value = storage.getItem(key);
      if (value) {
        try {
          this.set(key, JSON.parse(value));
        } catch {
          console.warn(`[ngrx-store-wrapper] Could not parse persisted data for key: ${key}`);
        }
      }
    });
  }

  private autoBind(fn: Function | null, context?: any): (...args: any[]) => Observable<any> {
    if (fn === null) {
      throw new Error('[ngrx-store-wrapper] serviceFn cannot be null');
    }
    if (typeof fn !== 'function') {
      throw new Error('[ngrx-store-wrapper] serviceFn must be a function');
    }

    // If context is provided, just bind to it
    if (context) return fn.bind(context);

    // Check if already bound
    if (autoBindMetadata.has(fn)) {
      const ownerClass = autoBindMetadata.get(fn)!;
      const instance = this.injector.get(ownerClass, { optional: true });
      if (instance) return fn.bind(instance);
    }

    // Check for wrapped functions
    const originalFn = (fn as any).__originalFn;
    if (originalFn && autoBindMetadata.has(originalFn)) {
      const ownerClass = autoBindMetadata.get(originalFn)!;
      const instance = this.injector.get(ownerClass, { optional: true });
      if (instance) return fn.bind(instance);
    }

    // Additional check for bound functions
    if ((fn as any).__autoBound) {
      const ownerClass = autoBindMetadata.get(fn);
      if (ownerClass) {
        const instance = this.injector.get(ownerClass, { optional: true });
        if (instance) return fn.bind(instance);
      }
    }

    // For class methods not decorated with @AutoBind
    if (fn.name) {
      try {
        const classNameMatch = fn.name.match(/^bound (\w+)/);
        const className = classNameMatch ? classNameMatch[1] : fn.name.split('.').shift();
        
        if (className) {
          const ownerClass = this.findClassByName(className);
          if (ownerClass) {
            const instance = this.injector.get(ownerClass, { optional: true });
            if (instance) return fn.bind(instance);
          }
        }
      } catch (e) {
        console.warn('[ngrx-store-wrapper] Auto-bind name parsing failed', e);
      }
    }

    throw new Error('[ngrx-store-wrapper] Failed to auto-bind serviceFn. Use @AutoBind() or provide context.');
  }
  
  private findClassByName(name: string): Type<any> | null {
    // This is a simplified approach - you might need a more robust solution
    const classes = (window as any).__ngrx_wrapper_classes__ || [];
    return classes.find((cls: any) => cls.name === name) || null;
  }
}
