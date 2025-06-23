import { ActionReducerMap } from '@ngrx/store';
import { StoreState } from './ngrx-store-wrapper.service';

export const getInitialDynamicReducers = (): ActionReducerMap<StoreState> => {
  return {};
};
