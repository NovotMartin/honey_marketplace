import { onMounted, onUnmounted } from "vue";

export function useAutoRefresh(refresh: () => Promise<unknown> | unknown, intervalMs: number | null = null) {
  let timer: number | undefined;
  let running = false;

  async function run() {
    if (running || document.hidden) {
      return;
    }

    running = true;

    try {
      await refresh();
    } catch (error) {
      console.warn("Automatické obnovení dat selhalo.", error);
    } finally {
      running = false;
    }
  }

  function onVisibilityChange() {
    if (!document.hidden) {
      void run();
    }
  }

  onMounted(() => {
    if (intervalMs !== null) {
      timer = window.setInterval(() => void run(), intervalMs);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onUnmounted(() => {
    if (timer !== undefined) {
      window.clearInterval(timer);
    }

    document.removeEventListener("visibilitychange", onVisibilityChange);
  });
}
