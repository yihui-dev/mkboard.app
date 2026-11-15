import type { MkboardApi } from "../../../shared";

declare global {
  interface Window {
    mkboard: MkboardApi;
  }
}

export {};
