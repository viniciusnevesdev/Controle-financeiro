/* Meu Dinheiro — ferramentas exclusivas do ambiente Beta */
(() => {
  'use strict';

  const BETA_RELEASE = '1.2.0-beta.60';
  const PROD_DB = 'meu-dinheiro-inteligente';
  const BETA_DB = 'meu-dinheiro-inteligente-beta';
  const PROD_FALLBACK = 'meu-dinheiro-inteligente-state';
  const BETA_FALLBACK = 'meu-dinheiro-inteligente-beta-state';
  const STORE = 'app';
  const STATE_KEY = 'current-state';

  const requestPromise = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha no armazenamento'));
  });

  function openExistingDatabase(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      let created = false;
      request.onupgradeneeded = () => {
        created = true;
        try { request.transaction?.abort(); } catch (_) {}
      };
      request.onsuccess = () => {
        if (created) {
          try { request.result.close(); } catch (_) {}
          reject(new Error('Banco ainda não existe neste navegador'));
          return;
        }
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o banco'));
      request.onblocked = () => reject(new Error('Banco ocupado por outra aba'));
    });
  }

  function openBetaDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(BETA_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o banco Beta'));
    });
  }

  async function readOfficialState() {
    try {
      const db = await openExistingDatabase(PROD_DB);
      try {
        if (db.objectStoreNames.contains(STORE)) {
          const state = await requestPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(STATE_KEY));
          if (state) return state;
        }
      } finally {
        db.close();
      }
    } catch (_) {}
    try {
      const raw = localStorage.getItem(PROD_FALLBACK);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  async function writeBetaState(state) {
    const db = await openBetaDatabase();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(state, STATE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Falha ao gravar na Beta'));
        tx.onabort = () => reject(tx.error || new Error('Gravação da Beta cancelada'));
      });
    } finally {
      db.close();
    }
    try { localStorage.setItem(BETA_FALLBACK, JSON.stringify(state)); } catch (_) {}
  }

  async function copyOfficialToBeta() {
    const state = await readOfficialState();
    if (!state) throw new Error('Nenhum dado salvo foi encontrado no app Oficial neste navegador. Abra o Oficial pelo menos uma vez neste Safari e tente novamente.');
    await writeBetaState(state);
    try { localStorage.setItem('meu-dinheiro-beta-copied-at', new Date().toISOString()); } catch (_) {}
    return {
      transactions: Array.isArray(state.transactions) ? state.transactions.length : 0,
      accounts: Array.isArray(state.accounts) ? state.accounts.length : 0,
      categories: Array.isArray(state.categories) ? state.categories.length : 0,
    };
  }

  async function clearBetaOnly() {
    try { localStorage.removeItem(BETA_FALLBACK); } catch (_) {}
    try { localStorage.removeItem('meu-dinheiro-beta-copied-at'); } catch (_) {}
    try {
      const db = await openExistingDatabase(BETA_DB);
      try {
        if (db.objectStoreNames.contains(STORE)) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(STATE_KEY);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error('Falha ao limpar a Beta'));
            tx.onabort = () => reject(tx.error || new Error('Limpeza da Beta cancelada'));
          });
        }
      } finally { db.close(); }
    } catch (_) {}
  }

  function installStyle() {
    if (document.getElementById('mdBetaStyle')) return;
    const style = document.createElement('style');
    style.id = 'mdBetaStyle';
    style.textContent = `
      #mdBetaBadge{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:calc(82px + env(safe-area-inset-bottom));z-index:2147483000;border:0;border-radius:999px;padding:7px 10px;background:linear-gradient(135deg,#3478f6,#7655e9);color:#fff;font:800 10px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;letter-spacing:.08em;box-shadow:0 5px 18px rgba(52,120,246,.28)}
      #mdBetaSheetBackdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(15,20,17,.32);display:none;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
      #mdBetaSheetBackdrop.open{display:flex}
      #mdBetaSheet{width:min(100%,430px);border-radius:24px;background:rgba(248,250,248,.96);color:#111512;padding:18px;box-sizing:border-box;box-shadow:0 20px 60px rgba(0,0,0,.22);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;border:1px solid rgba(255,255,255,.8)}
      #mdBetaSheet h2{font-size:20px;margin:0 0 5px}#mdBetaSheet p{font-size:13px;line-height:1.45;color:#6b726e;margin:0 0 14px}
      .md-beta-chip{display:inline-block;padding:5px 8px;border-radius:999px;background:#eaf2ff;color:#2467d8;font-size:10px;font-weight:800;letter-spacing:.05em;margin-bottom:12px}
      .md-beta-safe{padding:11px 12px;border-radius:14px;background:#edf4ff;border:1px solid #dce9ff;font-size:12px;line-height:1.42;margin-bottom:14px;color:#315a8c}
      .md-beta-actions{display:grid;gap:8px}.md-beta-actions button,.md-beta-actions a{appearance:none;border:0;border-radius:14px;padding:12px;text-align:center;text-decoration:none;font:700 13px/1.1 inherit;background:#2467d8;color:#fff}.md-beta-actions .secondary{background:#e9ece9;color:#26312a}.md-beta-actions .danger{background:#fff0ed;color:#c44332}.md-beta-actions .close{background:transparent;color:#6b726e;padding:8px}
      @media(prefers-color-scheme:dark){#mdBetaSheet{background:rgba(26,30,27,.97);color:#f6f8f6;border-color:#303630}#mdBetaSheet p{color:#a4aba6}.md-beta-safe{background:#17253a;border-color:#243c5d;color:#9fc3ff}.md-beta-actions .secondary{background:#2b302c;color:#f1f4f1}.md-beta-actions .danger{background:#321d19;color:#ff8d7e}.md-beta-actions .close{color:#a4aba6}}
    `;
    document.head.appendChild(style);
  }

  function installUi() {
    installStyle();
    if (document.getElementById('mdBetaBadge')) return;

    const badge = document.createElement('button');
    badge.id = 'mdBetaBadge';
    badge.type = 'button';
    badge.textContent = 'BETA';
    badge.setAttribute('aria-label', 'Abrir ferramentas da versão Beta');

    const backdrop = document.createElement('div');
    backdrop.id = 'mdBetaSheetBackdrop';
    backdrop.innerHTML = `
      <section id="mdBetaSheet" role="dialog" aria-modal="true" aria-label="Ambiente Beta">
        <span class="md-beta-chip">BETA · ${BETA_RELEASE}</span>
        <h2>Meu Dinheiro Beta</h2>
        <p>Ambiente para testar mudanças antes de levá-las ao app Oficial.</p>
        <div class="md-beta-safe"><strong>Dados isolados.</strong> Registrar, editar ou apagar algo aqui não altera o Oficial. A única cópia permitida é <strong>Oficial → Beta</strong>.</div>
        <div class="md-beta-actions">
          <button type="button" id="mdBetaCopy">Copiar dados do Oficial</button>
          <a class="secondary" href="../menu.html">Abrir menu de ferramentas</a>
          <a class="secondary" href="./safe.html">Modo seguro da Beta</a>
          <button type="button" class="danger" id="mdBetaClear">Limpar somente a Beta</button>
          <button type="button" class="close" id="mdBetaClose">Fechar</button>
        </div>
      </section>`;

    document.body.append(badge, backdrop);
    const open = () => backdrop.classList.add('open');
    const close = () => backdrop.classList.remove('open');
    badge.onclick = open;
    document.getElementById('mdBetaClose').onclick = close;
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });

    document.getElementById('mdBetaCopy').onclick = async (event) => {
      if (!confirm('Substituir os dados atuais da Beta por uma cópia do app Oficial? O app Oficial NÃO será alterado.')) return;
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Copiando…';
      try {
        const result = await copyOfficialToBeta();
        alert(`Cópia concluída: ${result.transactions} movimentações, ${result.accounts} contas e ${result.categories} categorias. O app Oficial permaneceu intacto.`);
        location.replace('./?copied=' + Date.now());
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Copiar dados do Oficial';
        alert(error?.message || 'Não foi possível copiar os dados. Nenhum dado do Oficial foi alterado.');
      }
    };

    document.getElementById('mdBetaClear').onclick = async (event) => {
      if (!confirm('Apagar somente os dados da Beta? Seus dados do app Oficial permanecerão intactos.')) return;
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Limpando…';
      await clearBetaOnly();
      location.replace('./?cleared=' + Date.now());
    };

    const params = new URLSearchParams(location.search);
    if (params.get('tools') === '1' || location.hash === '#beta-tools') setTimeout(open, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUi, { once: true });
  else installUi();
})();
