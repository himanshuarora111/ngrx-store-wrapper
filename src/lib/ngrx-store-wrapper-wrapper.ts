import { inject, runInInjectionContext, EnvironmentInjector } from '@angular/core';
import { Store } from '@ngrx/store';
import { ReducerManager } from '@ngrx/store';
import { NgrxStoreWrapperService, StoreState } from './ngrx-store-wrapper.service';
import { StorageType } from './storage-type.enum';
import { Observable } from 'rxjs';

let initialized = false;

let service: NgrxStoreWrapperService;
let store: Store<StoreState>;
let reducerManager: ReducerManager;

function ensureInitialized() {
  if (!initialized) {
    runInInjectionContext(inject(EnvironmentInjector), () => {
      service = inject(NgrxStoreWrapperService);
      store = inject(Store);
      reducerManager = inject(ReducerManager);
    });

    service.initializeStore(store, reducerManager);
    initialized = true;
  }
}

export const storeWrapper = {
  set: (key: string, value: any) => {
    ensureInitialized();
    service.set(key, value);
  },
  get: <T = any>(key: string) => {
    ensureInitialized();
    return service.get<T>(key);
  },
  remove: (key: string) => {
    ensureInitialized();
    service.remove(key);
  },
  enablePersistence: (key: string, type: StorageType) => {
    ensureInitialized();
    service.enablePersistence(key, type);
  },
  disablePersistence: (key: string) => {
    ensureInitialized();
    service.disablePersistence(key);
  },
  addEffect: (options: {
    key: string;
    serviceFn: (...args: any[]) => Observable<any>;
    context?: any;
    args?: any;
    intervalMs?: number;
    immediate?: boolean;
    transform?: (result: any) => any;
  }) => {
    ensureInitialized();
    service.addEffect(options);
  },
  addHttpEffect: (options: {
    key: string;
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
    intervalMs?: number;
    immediate?: boolean;
    transform?: (result: any) => any;
  }) => {
    ensureInitialized();
    service.addHttpEffect(options);
  },
  removeEffect: (key: string) => {
    ensureInitialized();
    service.removeEffect(key);
  },
  recallEffect: (key: string, updatedData?: any) => {
    ensureInitialized();
    service.recallEffect(key, updatedData);
  }
};
