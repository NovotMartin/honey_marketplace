interface CustomEventMap {}

declare module "notivue" {
  import type { Component, Plugin } from "vue";

  export const Notivue: Component;
  export const Notification: Component;
  export const NotificationProgress: Component;
  export function createNotivue(options?: Record<string, unknown>): Plugin;
  export function updateConfig(options: Record<string, unknown>): void;
  export const push: {
    success(message: string): void;
    error(message: string): void;
    warning(message: string): void;
    info(message: string): void;
  };
}
