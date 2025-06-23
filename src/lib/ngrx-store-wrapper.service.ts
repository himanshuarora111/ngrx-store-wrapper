import { Store, createAction, createReducer, on, ActionReducerMap, ReducerManager, createSelector, select } from '@ngrx/store';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { isDevMode, Injectable } from '@angular/core';

export interface StoreState {
  [key: string]: any;
}

const DYNAMIC_KEY_WARN_THRESHOLD = 100;

@Injectable({
  providedIn: 'root'
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

    this.store.pipe(select(selectWholeState), take(1)).subscribe(state => {
      Object.keys(state).forEach(key => this.staticReducerKeys.add(key));
    });
  }

  public set(key: string, value: any): void {
    if (!this.store) {
      throw new Error('Store must be initialized before setting data');
    }

    if (this.staticReducerKeys.has(key)) {
      if (isDevMode()) {
        console.warn(
          `[DynamicStoreHelper] Attempted to set value for static reducer key: "${key}". This operation is ignored.`
        );
      }
      return;
    }

    if (!this.dynamicActions[`set${key}`]) {
      this.dynamicActions[`set${key}`] = createAction(`[${key}] Set`, (payload: any) => ({ payload }));
    }

    if (!this.dynamicReducers[key]) {
      const reducer = createReducer(
        { value: null },
        on(this.dynamicActions[`set${key}`], (state, { payload }: { payload: any }) => ({ value: payload }))
      );

      this.reducerManager.addReducer(key, reducer);
      this.dynamicReducers[key] = reducer;

      if (isDevMode() && Object.keys(this.dynamicReducers).length > DYNAMIC_KEY_WARN_THRESHOLD) {
        console.warn(
          `[DynamicStoreHelper] Warning: More than ${DYNAMIC_KEY_WARN_THRESHOLD} dynamic store keys have been registered.\n` +
          `Consider pruning unused keys to avoid potential memory or performance issues.`
        );
      }
    }

    if (!this.selectors[key]) {
      this.selectors[key] = createSelector(
        (state: StoreState) => state[key],
        (state: { value: any }) => state?.value
      );
    }

    const action = this.dynamicActions[`set${key}`];
    this.store.dispatch(action({ payload: value }));
  }

  public get<T = any>(key: string): Observable<T> {
    if (!this.store) {
      throw new Error('Store must be initialized before getting data');
    }

    if (this.staticReducerKeys.has(key)) {
      if (!this.selectors[key]) {
        this.selectors[key] = createSelector(
          (state: StoreState) => state[key],
          (state) => state
        );
      }
    } else {
      if (!this.selectors[key]) {
        this.selectors[key] = createSelector(
          (state: StoreState) => state[key],
          (state: { value: T }) => state?.value
        );
      }
    }

    return this.store.pipe(select(this.selectors[key]));
  }

  public remove(key: string): void {
    if (!this.dynamicReducers[key]) return;

    this.reducerManager.removeReducer(key);
    delete this.dynamicReducers[key];
    delete this.dynamicActions[`set${key}`];
    delete this.selectors[key];
  }
}
