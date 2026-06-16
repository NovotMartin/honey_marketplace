import { defineStore } from "pinia";
import { getCurrentProfile, loginProfile, logoutProfile, type AuthProfileResponse, type ProfileResponse } from "../api";

const lastCustomerKey = "honey-marketplace:last-customer";
const sessionTokenKey = "honey-marketplace:customer-token";

export const useSessionStore = defineStore("session", {
  state: () => ({
    lastCustomerName: localStorage.getItem(lastCustomerKey) ?? "",
    sessionToken: localStorage.getItem(sessionTokenKey) ?? "",
    profile: null as ProfileResponse | null,
    restoring: false
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.sessionToken && state.profile),
    isAdmin: (state) => Boolean(state.sessionToken && state.profile?.customer.isAdmin),
    customerName: (state) => state.profile?.customer.name ?? state.lastCustomerName
  },
  actions: {
    rememberCustomer(name: string) {
      this.lastCustomerName = name;
      localStorage.setItem(lastCustomerKey, name);
    },
    setAuthenticated(response: AuthProfileResponse | (ProfileResponse & { sessionToken: string })) {
      this.sessionToken = response.sessionToken;
      this.profile = { customer: response.customer, orders: response.orders };
      this.rememberCustomer(response.customer.name);
      localStorage.setItem(sessionTokenKey, response.sessionToken);
    },
    setProfile(profile: ProfileResponse) {
      this.profile = profile;
      this.rememberCustomer(profile.customer.name);
    },
    async login(payload: { name: string; password: string }) {
      const response = await loginProfile(payload);
      this.setAuthenticated(response);
      return response;
    },
    async restoreSession() {
      if (!this.sessionToken) {
        return false;
      }

      this.restoring = true;

      try {
        this.setProfile(await getCurrentProfile(this.sessionToken));
        return true;
      } catch {
        this.clearSession();
        return false;
      } finally {
        this.restoring = false;
      }
    },
    async logout() {
      const token = this.sessionToken;
      this.clearSession();

      if (token) {
        await logoutProfile(token).catch(() => undefined);
      }
    },
    clearSession() {
      this.sessionToken = "";
      this.profile = null;
      localStorage.removeItem(sessionTokenKey);
    }
  }
});
