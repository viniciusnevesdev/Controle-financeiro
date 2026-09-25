import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./beta-dark.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      // Não reutiliza a resposta HTTP antiga do sw.js e verifica a publicação
      // mais recente sempre que o usuário recarrega a página.
      const registration = await navigator.serviceWorker.register("./sw.js", {
        updateViaCache: "none",
      });
      await registration.update();
    } catch (error) {
      console.error("Falha ao verificar atualização do app", error);
    }
  });
}
