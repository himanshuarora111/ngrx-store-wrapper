// ngrx-store-wrapper.service.ts
import {
  Store,
  createAction,
  createReducer,
  on,
  ActionReducerMap,
  ReducerManager,
  createSelector,
  select,
} from '@ngrx/store';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  isDevMode,
  Injectable,
  inject,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StorageType } from './storage-type.enum';

export interface StoreState {
  [key: string]: any;
}

const DYNAMIC_KEY_WARN_THRESHOLD = 100;
const LOCAL_KEY_META = '__ngrx_wrapper_persisted_keys__';
const SESSION_KEY_META = '__ngrx_wrapper_persisted_keys__';

@Injectable({ providedIn: 'root' })
export class NgrxStoreWrapperService {
  private reducerManager!: ReducerManager;
  private store!: Store<StoreState>;
  private staticReducerKeys: Set<string> = new Set();

  private dynamicReducers: ActionReducerMap<StoreState> = {};
  private dynamicActions: Record<string, any> = {};
  private selectors: Record<string, any> = {};
  private persistedKeys: Map<string, StorageType> = new Map();


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

    if (this.staticReducerKeys.has(key)) {
      if (isDevMode()) {
        console.warn(
          `[ngrx-store-wrapper] Attempted to set value for static reducer key: "${key}". This operation is ignored.`
        );
      }
      return;
    }

    if (!this.dynamicActions[`set${key}`]) {
      this.dynamicActions[`set${key}`] = createAction(`[${key}] Set`, (value: any) => ({ value }));
    }

    if (!this.dynamicReducers[key]) {
      const reducer = createReducer(
        null,
        on(this.dynamicActions[`set${key}`], (_state, { value }: { value: any }) => value)
      );

      this.reducerManager.addReducer(key, reducer);
      this.dynamicReducers[key] = reducer;

      if (isDevMode() && Object.keys(this.dynamicReducers).length > DYNAMIC_KEY_WARN_THRESHOLD) {
        console.warn(
          `[ngrx-store-wrapper] More than ${DYNAMIC_KEY_WARN_THRESHOLD} dynamic store keys registered.`
        );
      }
    }

    if (!this.selectors[key]) {
      this.selectors[key] = createSelector(
        (state: StoreState) => state[key],
        (state: any) => state
      );
    }

    const action = this.dynamicActions[`set${key}`];
    this.store.dispatch(action(value));

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

  public remove(key: string): void {
    if (!this.dynamicReducers[key]) return;

    this.reducerManager.removeReducer(key);
    delete this.dynamicReducers[key];
    delete this.dynamicActions[`set${key}`];
    delete this.selectors[key];

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
}
