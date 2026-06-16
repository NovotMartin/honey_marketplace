import { defineStore } from "pinia";

const storageKey = "honey-marketplace:last-customer";

export const useSessionStore = defineStore("session", {
  state: () => ({
    lastCustomerName: localStorage.getItem(storageKey) ?? ""
  }),
  actions: {
    rememberCustomer(name: string) {
      this.lastCustomerName = name;
      localStorage.setItem(storageKey, name);
    }
  }
});
