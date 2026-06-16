import { defineStore } from "pinia";
import type { Order, Payment, ProfileOrder } from "../api";

export type RecentPayment = {
  order: Pick<Order, "id" | "jarCount" | "customerName">;
  payment: Payment;
  kind: "created" | "selected";
};

export const useCheckoutStore = defineStore("checkout", {
  state: () => ({
    lastPayment: null as RecentPayment | null,
    reservationComplete: false
  }),
  actions: {
    setCreated(order: Order, payment: Payment) {
      this.lastPayment = { order, payment, kind: "created" };
      this.reservationComplete = true;
    },
    setSelected(order: ProfileOrder) {
      if (order.payment) {
        this.lastPayment = { order, payment: order.payment, kind: "selected" };
      }
    },
    clearPayment() {
      this.lastPayment = null;
      this.reservationComplete = false;
    },
    resetForAnotherReservation() {
      this.lastPayment = null;
      this.reservationComplete = false;
    }
  }
});
