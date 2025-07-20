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
import { take, catchError, startWith, distinctUntilChanged, debounceTime } from 'rxjs/operators';
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
  private persistenceSubscriptions: Map<string, Subscription> = new Map();
  private effectConfigs: Record<string, {
    intervalMs?: number;
    immediate?: boolean;
    transform?: (result: any) => any;
    originalServiceFn: (...args: any[]) => Observable<any>;
    context?: any;
    args?: any;
  }> = {};

  constructor(private injector: Injector, private http: HttpClient) {
    // Set up cleanup on destroy
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.ngOnDestroy());
  }

  private ngOnDestroy(): void {
    // Clean up all polling subscriptions
    Object.values(this.pollingSubscriptions).forEach(sub => sub.unsubscribe());
    this.pollingSubscriptions = {};

    // Clean up all persistence subscriptions
    this.persistenceSubscriptions.forEach(sub => sub.unsubscribe());
    this.persistenceSubscriptions.clear();
  }

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

    if (key.includes('.')) {
      console.warn(`[ngrx-store-wrapper] Dots in key names may cause issues: "${key}"`);
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
  }

  public get<T = any>(key: string): Observable<T> {
    if (!this.store) {
      throw new Error('Store must be initialized before getting data');
    }

    if (!(key in this.dynamicReducers)) {
      throw new Error(
        `Key "${key}" not created in store. ` +
        `Call set("${key}", value) first or check for typos.`
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
      
      config.originalServiceFn()
        .pipe(
          take(1)
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
    delete this.effectConfigs[key];

    this.removeEffect(key);

    if (this.persistedKeys.has(key)) this.disablePersistence(key);
  }

  public enablePersistence(key: string, type: StorageType): void {
    // 1. Key existence check (selector acts as verification)
    if (!this.selectors[key]) {
      throw new Error(
        `[ngrx-store-wrapper] Key "${key}" does not exist in store. ` +
        `Call set() before enablePersistence().`
      );
    }
  
    const storage = type === StorageType.Local ? localStorage : sessionStorage;
  
    // 2. Warn if overwriting existing storage
    if (storage.getItem(key) !== null && isDevMode()) {
      console.warn(
        `[ngrx-store-wrapper] Overwriting existing value for "${key}" in ` +
        `${type === StorageType.Local ? 'localStorage' : 'sessionStorage'}`
      );
    }
  
    // 3. Persist current value (using existing selector)
    this.store.pipe(
      select(this.selectors[key]), // Guaranteed to exist
      take(1)
    ).subscribe(currentValue => {
      try {
        storage.setItem(key, JSON.stringify(currentValue));
      } catch (e) {
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          console.error(`Storage quota exceeded for key "${key}"`);
          this.disablePersistence(key); // Auto-disable if quota exceeded
        } else {
          console.error(`Persist failed for ${key}`, e);
        }
      }
    });
  
    // 4. Set up future updates
    this.persistedKeys.set(key, type);
    this.updatePersistedKeysMeta(key, type);
  
    this.persistenceSubscriptions.get(key)?.unsubscribe();
    this.persistenceSubscriptions.set(
      key,
      this.store.pipe(
        select(this.selectors[key]), // Reuse selector
        distinctUntilChanged(),
        debounceTime(50)
      ).subscribe(value => {
        try {
          storage.setItem(key, JSON.stringify(value));
        } catch (e) {
          console.error(`Persist update failed for ${key}`, e);
        }
      })
    );
  }

  public disablePersistence(key: string): void {
    if (!this.persistedKeys.has(key)) {
      if (isDevMode()) {
        console.warn(`[ngrx-store-wrapper] Key "${key}" is not currently persisted`);
      }
      return;
    }
  
    const type = this.persistedKeys.get(key)!;
    const storage = type === StorageType.Local ? localStorage : sessionStorage;
  
    // Cleanup storage
    try {
      storage.removeItem(key);
    } catch (e) {
      console.error(`[ngrx-store-wrapper] Failed to remove "${key}" from storage:`, e);
    }
  
    // Cleanup subscriptions
    this.persistenceSubscriptions.get(key)?.unsubscribe();
    this.persistenceSubscriptions.delete(key);
  
    // Update persistence state
    this.persistedKeys.delete(key);
    this.updatePersistedKeysMeta(key, null);
  
    if (isDevMode()) {
      console.log(`[ngrx-store-wrapper] Disabled persistence for key: "${key}"`);
    }
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

  private updatePersistedKeysMeta(key: string, type: StorageType | null): void {
    const targetType = type ?? this.persistedKeys.get(key);
    if (!targetType) return;

    const metaKey = targetType === StorageType.Local ? LOCAL_KEY_META : SESSION_KEY_META;
    const storage = targetType === StorageType.Local ? localStorage : sessionStorage;
    const currentMetaStr = storage.getItem(metaKey);
    const meta: Record<string, boolean> = currentMetaStr ? JSON.parse(currentMetaStr) : {};

    if (type) {
        meta[key] = true;
    } else {
        delete meta[key];
    }

    storage.setItem(metaKey, JSON.stringify(meta));
}

private restorePersistedState(): void {
  this.persistedKeys.forEach((type, key) => {
    const storage = type === StorageType.Local ? localStorage : sessionStorage;
    try {
      const value = storage.getItem(key);
      if (value) {
        this.set(key, JSON.parse(value));
      }
    } catch (e) {
      console.error(`[ngrx-store-wrapper] Failed to restore persisted state for key "${key}", removing key from storage`, e);
      storage.removeItem(key);
    }
  });
}

private readonly autoBindCache = new WeakMap<Function, Function>();

private autoBind(fn: Function, context?: any): (...args: any[]) => Observable<any> {
  if (typeof fn !== 'function') {
    throw new Error('[ngrx-store-wrapper] serviceFn must be a function');
  }

  if (this.autoBindCache.has(fn)) {
    return this.autoBindCache.get(fn)! as (...args: any[]) => Observable<any>;
  }

  let boundFn: Function | null = null;

  // If context is provided, just bind to it
  if (context) {
    boundFn = fn.bind(context);
  } else if (autoBindMetadata.has(fn)) {
    const ownerClass = autoBindMetadata.get(fn)!;
    const instance = this.injector.get(ownerClass, { optional: true });
    if (instance) boundFn = fn.bind(instance);
  } else {
    // Check for wrapped functions
    const originalFn = (fn as any).__originalFn;
    if (originalFn && autoBindMetadata.has(originalFn)) {
      const ownerClass = autoBindMetadata.get(originalFn)!;
      const instance = this.injector.get(ownerClass, { optional: true });
      if (instance) boundFn = fn.bind(instance);
    } else if ((fn as any).__autoBound) {
      const ownerClass = autoBindMetadata.get(fn);
      if (ownerClass) {
        const instance = this.injector.get(ownerClass, { optional: true });
        if (instance) boundFn = fn.bind(instance);
      }
    } else if (fn.name) {
      try {
        const classNameMatch = fn.name.match(/^bound (\w+)/);
        const className = classNameMatch ? classNameMatch[1] : fn.name.split('.').shift();
        if (className) {
          const ownerClass = this.findClassByName(className);
          if (ownerClass) {
            const instance = this.injector.get(ownerClass, { optional: true });
            if (instance) boundFn = fn.bind(instance);
          }
        }
      } catch (e) {
        console.warn('[ngrx-store-wrapper] Auto-bind name parsing failed', e);
      }
    }
  }

  if (!boundFn) {
    throw new Error('[ngrx-store-wrapper] Failed to auto-bind serviceFn. Use @AutoBind() or provide context.');
  }

  (boundFn as any).__autoBound = true;
  this.autoBindCache.set(fn, boundFn);

  return boundFn as (...args: any[]) => Observable<any>;
}

  
  private findClassByName(name: string): Type<any> | null {
    // This is a simplified approach - you might need a more robust solution
    const classes = (window as any).__ngrx_wrapper_classes__ || [];
    return classes.find((cls: any) => cls.name === name) || null;
  }
}
