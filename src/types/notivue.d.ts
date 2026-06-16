declare module "notivue" {
  import type { Component, Plugin } from "vue";

  export const Notivue: Component;
  export const Notification: Component;
  export function createNotivue(options?: Record<string, unknown>): Plugin;
  export const push: {
    success(message: string): void;
    error(message: string): void;
    warning(message: string): void;
    info(message: string): void;
  };
}
