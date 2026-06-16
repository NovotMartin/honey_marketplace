import { createPinia } from "pinia";
import { createNotivue } from "notivue";
import { createApp } from "vue";
import App from "./App.vue";
import "notivue/notification.css";
import "notivue/animations.css";
import "./style.css";

createApp(App).use(createPinia()).use(createNotivue()).mount("#app");
