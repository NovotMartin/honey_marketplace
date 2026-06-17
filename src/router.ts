import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import HomeView from "./views/HomeView.vue";
import ReserveView from "./views/ReserveView.vue";
import MyHoneyView from "./views/MyHoneyView.vue";
import AdminView from "./views/AdminView.vue";
import AdminOrdersView from "./views/AdminOrdersView.vue";
import SharedPaymentView from "./views/SharedPaymentView.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: HomeView },
  { path: "/chcimed", name: "reserve", component: ReserveView },
  { path: "/mujmed", name: "my-honey", component: MyHoneyView },
  { path: "/admin", name: "admin", component: AdminView },
  { path: "/objednavky", name: "admin-orders", component: AdminOrdersView },
  { path: "/platba/:orderId/:token", name: "shared-payment", component: SharedPaymentView },
  { path: "/:pathMatch(.*)*", redirect: "/" }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});
