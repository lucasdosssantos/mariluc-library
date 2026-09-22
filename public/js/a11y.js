/* MariLuc Library — acessibilidade
 * Controla tamanho do texto e alto contraste, salvando a preferência do
 * leitor em localStorage. Roda antes do app.js e não depende dele.
 */
(function () {
  const html = document.documentElement;
  const STORAGE_KEY = "marilucA11y";
  const TAMANHOS = ["normal", "grande", "maior"];

  function load() {
    try {
      const dado = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return dado && typeof dado === "object" ? dado : {};
    } catch {
      return {};
    }
  }
  function save(estado) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(estado)); } catch { /* modo privado etc. */ }
  }

  let estado = Object.assign({ tamanho: "normal", contraste: false }, load());
  if (!TAMANHOS.includes(estado.tamanho)) estado.tamanho = "normal";

  function aplicar() {
    html.classList.remove("texto-grande", "texto-maior");
    if (estado.tamanho === "grande") html.classList.add("texto-grande");
    if (estado.tamanho === "maior") html.classList.add("texto-maior");
    html.classList.toggle("contraste-alto", Boolean(estado.contraste));

    const btnContraste = document.getElementById("a11yContrast");
    if (btnContraste) btnContraste.setAttribute("aria-pressed", String(Boolean(estado.contraste)));
    const btnDecrease = document.getElementById("a11yDecrease");
    const btnIncrease = document.getElementById("a11yIncrease");
    if (btnDecrease) btnDecrease.disabled = estado.tamanho === "normal";
    if (btnIncrease) btnIncrease.disabled = estado.tamanho === "maior";
  }

  function aumentar() {
    const i = TAMANHOS.indexOf(estado.tamanho);
    estado.tamanho = TAMANHOS[Math.min(i + 1, TAMANHOS.length - 1)];
    save(estado);
    aplicar();
  }
  function diminuir() {
    const i = TAMANHOS.indexOf(estado.tamanho);
    estado.tamanho = TAMANHOS[Math.max(i - 1, 0)];
    save(estado);
    aplicar();
  }
  function alternarContraste() {
    estado.contraste = !estado.contraste;
    save(estado);
    aplicar();
  }
  function redefinir() {
    estado = { tamanho: "normal", contraste: false };
    save(estado);
    aplicar();
  }

  // Aplica imediatamente (antes do DOMContentLoaded) para evitar "flash"
  // de estilo sem alto contraste/tamanho quando o leitor já tinha escolhido.
  aplicar();

  document.addEventListener("DOMContentLoaded", () => {
    aplicar();
    document.getElementById("a11yIncrease")?.addEventListener("click", aumentar);
    document.getElementById("a11yDecrease")?.addEventListener("click", diminuir);
    document.getElementById("a11yContrast")?.addEventListener("click", alternarContraste);
    document.getElementById("a11yReset")?.addEventListener("click", redefinir);
  });
})();
