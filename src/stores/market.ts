import { defineStore } from "pinia";
import { getPublicState, type PublicState } from "../api";

export const useMarketStore = defineStore("market", {
  state: () => ({
    publicState: null as PublicState | null
  }),
  getters: {
    availableJars: (state) => state.publicState?.availableJars ?? 0,
    totalJars: (state) => state.publicState?.settings.totalJars ?? 0,
    canReserve: (state) => (state.publicState?.availableJars ?? 0) > 0,
    progressPercent: (state) => {
      if (!state.publicState || state.publicState.settings.totalJars === 0) {
        return 0;
      }

      return Math.min(100, Math.round((state.publicState.totalReservedJars / state.publicState.settings.totalJars) * 100));
    }
  },
  actions: {
    async refresh() {
      this.publicState = await getPublicState();
      return this.publicState;
    },
    setPublicState(publicState: PublicState) {
      this.publicState = publicState;
    }
  }
});
