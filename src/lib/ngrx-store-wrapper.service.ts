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
import { Observable, interval, Subscription, of } from 'rxjs';
import { take, catchError, startWith, finalize } from 'rxjs/operators';
import {
  isDevMode,
  Injectable,
  inject,
  DestroyRef,
  Injector,
  Type
} from '@angular/core';
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

  constructor(private injector: Injector, private http: HttpClient) {}

  public initializeStore(store: Store<StoreState>, reducerManager: ReducerManager): void {
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
    if (!this.store) {
      throw new Error('Store must be initialized before setting data');
    }

    if (typeof key !== 'string') {
      throw new Error('Key must be a string');
    }
  
    if (this.staticReducerKeys.has(key)) {
      if (isDevMode()) {
        console.warn(`[ngrx-store-wrapper] Attempted to set static reducer key: "${key}"`);
      }
      return;
    }
  
    const actionKey = `set${key}`;
  
    if (!this.dynamicActions[actionKey]) {
      this.dynamicActions[actionKey] = createAction(
        `[${key}] Set`, 
        (value: any) => ({ value })
      );
      this.dynamicReducers[key] = createReducer(
        null, 
        on(this.dynamicActions[actionKey], (state, { value }) => {
          if (state === value) return state;
          return value;
        }
      ));
  
      this.reducerManager.addReducer(key, this.dynamicReducers[key]);
      if (isDevMode() && Object.keys(this.dynamicReducers).length > DYNAMIC_KEY_WARN_THRESHOLD) {
        console.warn(
          `[ngrx-store-wrapper] More than ${DYNAMIC_KEY_WARN_THRESHOLD} dynamic store keys registered.`
        );
      }
      this.selectors[key] = createSelector(
        (state: any) => state[key],
        val => val
      );
    } 
    this.store.dispatch(this.dynamicActions[actionKey](value));
  
    if (this.persistedKeys.has(key)) {
      const type = this.persistedKeys.get(key)!;
      const storage = type === StorageType.Local ? localStorage : sessionStorage;
      storage.setItem(key, JSON.stringify(value));
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

    const boundFn = this.autoBind(config.originalServiceFn, config.context);
    const result$ = (Array.isArray(config.args)
      ? boundFn(...config.args)
      : boundFn(config.args)
    ).pipe(
      catchError(error => {
        console.error(`[ngrx-store-wrapper] Error in effect for key "${key}":`, error);
        return of(null); // Continue stream with null
      })
    );

    result$.subscribe({
      next: result => {
        if (result === null || result === undefined) return;
        const finalValue = config.transform ? config.transform(result) : result;
        this.set(key, finalValue);
      },
      error: err => {
        console.error(`[ngrx-store-wrapper] Post-catch error for key "${key}":`, err);
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
    const config = this.effectConfigs[key];
    if (!config) {
      if (isDevMode()) {
        console.warn(`[ngrx-store-wrapper] Cannot recall effect. No config found for key "${key}".`);
      }
      return;
    }

    if (updatedArgs !== undefined) {
      config.args = updatedArgs;
    }

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

  public remove(key: string): void {
    if (!this.dynamicReducers[key]) return;

    this.reducerManager.removeReducer(key);
    delete this.dynamicReducers[key];
    delete this.dynamicActions[`set${key}`];
    delete this.selectors[key];

    this.removeEffect(key);

    if (this.persistedKeys.has(key)) {
      const type = this.persistedKeys.get(key)!;
      const storage = type === StorageType.Local ? localStorage : sessionStorage;
      storage.removeItem(key);
      this.persistedKeys.delete(key);
      this.savePersistedKeys();
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

  private autoBind(fn: Function, context?: any): (...args: any[]) => Observable<any> {
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
