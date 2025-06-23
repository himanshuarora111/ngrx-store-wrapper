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
  effect,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface StoreState {
  [key: string]: any;
}

const DYNAMIC_KEY_WARN_THRESHOLD = 100;

@Injectable({
  providedIn: 'root',
})
export class NgrxStoreWrapperService {
  private reducerManager!: ReducerManager;
  private store!: Store<StoreState>;
  private staticReducerKeys: Set<string> = new Set();

  private dynamicReducers: ActionReducerMap<StoreState> = {};
  private dynamicActions: Record<string, any> = {};
  private selectors: Record<string, any> = {};

  constructor() {}

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
        on(this.dynamicActions[`set${key}`], (state, { value }: { value: any }) => value)
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
  }
}
