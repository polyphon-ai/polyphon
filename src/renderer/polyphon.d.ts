// Type declaration for the contextBridge API injected by preload.ts.
// Import PolyphonAPI from preload and use it here to keep the two in sync.
import type { PolyphonAPI } from '../main/preload';


declare global {
  interface Window {
    polyphon: PolyphonAPI;
  }
}
