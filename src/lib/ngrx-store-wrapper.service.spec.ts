import { TestBed } from '@angular/core/testing';

import { NgrxStoreWrapperService } from './ngrx-store-wrapper.service';

describe('NgrxStoreWrapperService', () => {
  let service: NgrxStoreWrapperService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NgrxStoreWrapperService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
