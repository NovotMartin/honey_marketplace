declare module "vue-router" {
  import type { Component, Plugin } from "vue";

  export type RouteRecordRaw = {
    path: string;
    name?: string;
    component?: Component;
    redirect?: string;
  };

  export type Router = Plugin & {
    push(to: string | { path: string; query?: Record<string, string> }): Promise<void>;
    replace(to: string | { path: string; query?: Record<string, string> }): Promise<void>;
  };

  export type RouteLocationNormalizedLoaded = {
    path: string;
    query: Record<string, string | string[] | null | undefined>;
  };

  export const RouterLink: Component;
  export const RouterView: Component;
  export function createRouter(options: { history: unknown; routes: RouteRecordRaw[]; scrollBehavior?: () => { top: number } }): Router;
  export function createWebHistory(base?: string): unknown;
  export function useRouter(): Router;
  export function useRoute(): RouteLocationNormalizedLoaded;
}
