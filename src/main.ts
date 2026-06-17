import { createPinia } from "pinia";
import { createNotivue, updateConfig } from "notivue";
import { createApp } from "vue";
import FloatingVue from "floating-vue";
import App from "./App.vue";
import { router } from "./router";
import "floating-vue/dist/style.css";
import "notivue/notification.css";
import "notivue/notification-progress.css";
import "notivue/animations.css";
import "./style.css";

const mobileToastQuery = window.matchMedia("(max-width: 640px)");
const toastPosition = () => (mobileToastQuery.matches ? "bottom-center" : "top-right");

createApp(App)
  .use(createPinia())
  .use(router)
  .use(FloatingVue, { themes: { tooltip: { delay: { show: 0, hide: 0 } } } })
  .use(createNotivue({ position: toastPosition() }))
  .mount("#app");

mobileToastQuery.addEventListener("change", () => {
  updateConfig({ position: toastPosition() });
});
