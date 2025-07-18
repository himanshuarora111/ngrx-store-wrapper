import { Injectable, NgZone } from '@angular/core';

declare const window: any;

interface DevToolsExtension {
  connect: (options: any) => any;
  send: (action: any, state: any) => void;
  init: (state: any) => void;
  subscribe: (listener: (message: any) => void) => () => void;
  disconnect: () => void;
}

@Injectable({ providedIn: 'root' })
export class DevToolsService {
  private devToolsExtension: DevToolsExtension | null = null;
  private devToolsConnection: any = null;
  private isEnabled = false;

  constructor(private ngZone: NgZone) {
    this.initialize();
  }

  private initialize(): void {
    this.ngZone.runOutsideAngular(() => {
      try {
        this.devToolsExtension = window?.__REDUX_DEVTOOLS_EXTENSION__ || window?.devToolsExtension;
        this.isEnabled = !!this.devToolsExtension;

        if (this.isEnabled && this.devToolsExtension) {
          this.devToolsConnection = this.devToolsExtension.connect({
            name: 'NgRx Store Wrapper',
            features: {
              pause: true,
              lock: true,
              persist: true,
              export: true,
              import: 'custom',
              jump: true,
              skip: true,
              reorder: true,
              dispatch: true,
              test: true
            }
          });
        }
      } catch (error) {
        console.warn('[ngrx-store-wrapper] Failed to initialize DevTools:', error);
        this.isEnabled = false;
        this.devToolsExtension = null;
        this.devToolsConnection = null;
      }
    });
  }

  private getCallerInfo(depth = 3): { file?: string; line?: number; column?: number } {
    try {
      const stack = new Error().stack || '';
      const stackFrames = stack.split('\n').slice(2); // Skip Error creation and getCallerInfo frames
      
      if (stackFrames.length > depth) {
        // Match the file path and line/column numbers from the stack trace
        // Example: "    at ClassName.methodName (http://localhost:4200/main.js:123:45)"
        const match = stackFrames[depth].match(/at\s+.+\((.+):(\d+):(\d+)\)/);
        if (match) {
          const [, file, line, column] = match;
          return {
            file: file.split('/').pop() || file, // Just get the filename
            line: parseInt(line, 10),
            column: parseInt(column, 10)
          };
        }
      }
    } catch (e) {
      // Silently fail if stack trace parsing fails
      console.warn('Failed to parse stack trace', e);
    }
    return {};
  }

  private getStateSnapshot(): any {
    // This method should return the current state snapshot
    // You might need to implement this based on your state management
    return {};
  }

  logAction(actionType: string, key: string, payload: any = {}, includeCallerInfo = true): void {
    if (!this.isEnabled || !this.devToolsConnection) return;

    const action = {
      type: `[ngrx-store-wrapper] ${actionType} ${key}`,
      payload: {
        key,
        ...payload,
        timestamp: new Date().toISOString(),
        ...(includeCallerInfo ? { _caller: this.getCallerInfo() } : {})
      }
    };

    this.ngZone.runOutsideAngular(() => {
      this.devToolsConnection.send(action, this.getStateSnapshot());
    });
  }

  logState(state: any): void {
    if (!this.isEnabled || !this.devToolsConnection) return;
    
    this.ngZone.runOutsideAngular(() => {
      this.devToolsConnection.init(state);
    });
  }

  isDevToolsAvailable(): boolean {
    return this.isEnabled;
  }
}
