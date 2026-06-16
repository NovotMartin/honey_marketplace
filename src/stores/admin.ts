import { defineStore } from "pinia";
import { getAdminDashboard, type AdminDashboard } from "../api";

export const useAdminStore = defineStore("admin", {
  state: () => ({
    dashboard: null as AdminDashboard | null
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.dashboard)
  },
  actions: {
    async refresh(sessionToken: string) {
      this.dashboard = await getAdminDashboard(sessionToken);
      return this.dashboard;
    },
    logout() {
      this.dashboard = null;
    }
  }
});
