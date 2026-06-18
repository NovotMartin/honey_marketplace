import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import HomeView from "./views/HomeView.vue";
import ReserveView from "./views/ReserveView.vue";
import MyHoneyView from "./views/MyHoneyView.vue";
import AdminView from "./views/AdminView.vue";
import AdminOrdersView from "./views/AdminOrdersView.vue";
import SharedPaymentView from "./views/SharedPaymentView.vue";
import UsersView from "./views/UsersView.vue";
import ResetPasswordView from "./views/ResetPasswordView.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: HomeView },
  { path: "/chcimed", name: "reserve", component: ReserveView },
  { path: "/mujmed", name: "my-honey", component: MyHoneyView },
  { path: "/admin", name: "admin", component: AdminView },
  { path: "/objednavky", name: "admin-orders", component: AdminOrdersView },
  { path: "/uzivatele", name: "users", component: UsersView },
  { path: "/platba/:orderId/:token", name: "shared-payment", component: SharedPaymentView },
  { path: "/reset-hesla/:token", name: "reset-password", component: ResetPasswordView },
  { path: "/:pathMatch(.*)*", redirect: "/" }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});
