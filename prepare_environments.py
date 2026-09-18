from pathlib import Path
import json
import os
import re
import shutil

ROOT = Path(__file__).resolve().parent
STABLE = ROOT / "_stable"
SITE = ROOT / "_site"
STABLE_RELEASE = os.environ.get("STABLE_RELEASE", "1.0.0").strip()
BETA_LABEL = os.environ.get("BETA_LABEL", "1.1.0-beta.2").strip()
OFFICIAL_DB = "meu-dinheiro-inteligente"
BETA_DB = "meu-dinheiro-inteligente-beta"
OFFICIAL_FALLBACK = "meu-dinheiro-inteligente-state"
BETA_FALLBACK = "meu-dinheiro-inteligente-beta-state"
SHELL_REVISION = "env3"

RUNTIME_FILES = [
    ".nojekyll",
    "index.html",
    "404.html",
    "manifest.webmanifest",
    "icon.svg",
    "apple-touch-icon.png",
    "sw.js",
]


def fill(template: str, **values) -> str:
    for key, value in values.items():
        template = template.replace(f"__{key.upper()}__", str(value))
    return template


def copy_runtime(source: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for name in RUNTIME_FILES:
        src = source / name
        if src.exists():
            shutil.copy2(src, target / name)
    assets = source / "assets"
    if not assets.exists():
        raise SystemExit(f"Assets ausentes em {source}")
    shutil.copytree(assets, target / "assets", dirs_exist_ok=True)


def patch_index(path: Path, environment: str, release: str, beta: bool) -> None:
    text = path.read_text(encoding="utf-8")
    text = text.replace('<link rel="icon" href="./icon.svg" type="image/svg+xml" />', '<link rel="icon" href="./apple-touch-icon.png" type="image/png" sizes="512x512" />')
    text = text.replace('<link rel="icon" href="./icon.svg" type="image/svg+xml">', '<link rel="icon" href="./apple-touch-icon.png" type="image/png" sizes="512x512">')
    if 'name="app-environment"' not in text:
        text = text.replace('<meta charset="UTF-8" />', f'<meta charset="UTF-8" />\n    <meta name="app-environment" content="{environment}" />\n    <meta name="app-release" content="{release}" />', 1)
    if beta:
        text = text.replace('content="Meu Dinheiro"', 'content="Meu Dinheiro Beta"')
        text = text.replace('<title>Meu Dinheiro Inteligente</title>', '<title>Meu Dinheiro Beta</title>')
        if 'name="robots"' not in text:
            text = text.replace('<meta name="app-release" content="' + release + '" />', '<meta name="app-release" content="' + release + '" />\n    <meta name="robots" content="noindex,nofollow" />', 1)
        if 'beta-tools.js' not in text:
            text = text.replace('</body>', f'    <script src="./beta-tools.js?v={release}" defer></script>\n  </body>', 1)
    path.write_text(text, encoding="utf-8")


def patch_manifest(path: Path, release: str, beta: bool) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    data["name"] = "Meu Dinheiro Beta" if beta else "Meu Dinheiro"
    data["short_name"] = "Dinheiro Beta" if beta else "Meu Dinheiro"
    data["description"] = "Ambiente Beta isolado do Meu Dinheiro." if beta else "Controle financeiro pessoal local, simples e seguro."
    data["id"] = "./"
    data["scope"] = "./"
    data["start_url"] = f"./launch.html?v={release}"
    data["display"] = "standalone"
    data["display_override"] = ["standalone", "minimal-ui"]
    data["prefer_related_applications"] = False
    data["icons"] = [{
        "src": "./apple-touch-icon.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any"
    }]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def service_worker(cache_name: str, cache_prefix: str, target: Path) -> str:
    index = (target / "index.html").read_text(encoding="utf-8")
    assets = re.findall(r'(?:src|href)="(\./assets/[^"]+)"', index)
    core = ["./", "./index.html", "./manifest.webmanifest", "./apple-touch-icon.png", *assets]
    template = r'''const CACHE = "__CACHE__";
const CACHE_PREFIX = "__PREFIX__";
const CORE = __CORE__;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  const scopePath = new URL(self.registration.scope).pathname;
  const isAppNavigation = url.pathname === scopePath || url.pathname === scopePath + "index.html";
  if (acceptsHtml && !isAppNavigation) return;
  if (acceptsHtml) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
'''
    return fill(template, cache=cache_name, prefix=cache_prefix, core=json.dumps(core, ensure_ascii=False))


def glass_icon(kind: str, beta: bool = False) -> str:
    accent = "#3478F6" if beta else "#20B970"
    accent2 = "#7C5CFF" if beta else "#38C98A"
    orange = "#FF9F0A"
    blue = "#3478F6"
    red = "#FF5A5F"
    bg1 = "#FFFFFF"
    bg2 = "#EEF4F8"
    common_start = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{bg1}" stop-opacity=".96"/><stop offset="1" stop-color="{bg2}" stop-opacity=".88"/></linearGradient><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".12"/></filter></defs><rect x="3" y="3" width="58" height="58" rx="17" fill="url(#g)" stroke="#DCE4E8" filter="url(#s)"/>'''
    if kind == "menu":
        body = f'''<rect x="16" y="16" width="13" height="13" rx="4" fill="{blue}"/><rect x="35" y="16" width="13" height="13" rx="4" fill="{accent}"/><rect x="16" y="35" width="13" height="13" rx="4" fill="{red}"/><rect x="35" y="35" width="13" height="13" rx="4" fill="#B7C0C7"/>'''
    elif kind == "diagnostic":
        body = f'''<circle cx="28" cy="28" r="12" fill="none" stroke="{blue}" stroke-width="4"/><path d="M37 37l10 10" stroke="{blue}" stroke-width="5" stroke-linecap="round"/><path d="M20 29h5l2-5 4 9 3-6h3" fill="none" stroke="{accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'''
    elif kind == "launch":
        body = f'''<path d="M39 13c-9 2-17 10-20 20l9 9c10-3 18-11 20-20 1-4 0-8-1-10-2-1-5-1-8 1Z" fill="{accent}"/><circle cx="39" cy="23" r="4" fill="#fff"/><path d="M20 35l-6 3 6 2M27 42l-3 7-3-7" fill="{accent2}"/><path d="M16 48c5-1 8-4 9-9-5 1-8 4-9 9Z" fill="{orange}"/>'''
    elif kind == "recover":
        body = f'''<path d="M18 24a16 16 0 1 1-1 15" fill="none" stroke="{orange}" stroke-width="5" stroke-linecap="round"/><path d="M13 15v12h12" fill="none" stroke="{orange}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 25l10 10M40 25 30 35" stroke="{accent}" stroke-width="3.5" stroke-linecap="round"/>'''
    elif kind == "safe":
        body = f'''<path d="M32 11 49 17v13c0 11-7 19-17 23-10-4-17-12-17-23V17l17-6Z" fill="{accent}"/><path d="m23 31 6 6 12-13" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'''
    elif kind == "copy":
        body = f'''<ellipse cx="24" cy="18" rx="12" ry="5" fill="{accent}"/><path d="M12 18v19c0 3 5 5 12 5 3 0 5 0 7-1V18" fill="{accent}" fill-opacity=".82"/><path d="M12 27c0 3 5 5 12 5s12-2 12-5M12 35c0 3 5 5 12 5" fill="none" stroke="#fff" stroke-width="2" opacity=".75"/><path d="M34 37h15m-5-5 5 5-5 5" fill="none" stroke="{blue}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'''
    else:
        body = f'''<circle cx="32" cy="32" r="15" fill="{accent}"/><path d="M32 21v13" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="42" r="2.5" fill="#fff"/>'''
    return common_start + body + "</svg>"


def write_icons(target: Path, beta: bool) -> None:
    icons = target / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    for kind in ("menu", "diagnostic", "launch", "recover", "safe", "copy"):
        (icons / f"{kind}.svg").write_text(glass_icon(kind, beta=beta), encoding="utf-8")


def launcher_html(release: str, beta: bool) -> str:
    template = r'''<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f6f7f4"><meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"><meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0"><meta name="robots" content="noindex,nofollow">
<link rel="icon" href="./icons/launch.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="./apple-touch-icon.png"><title>__TITLE__ · Inicializador</title>
<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f6f7f4;color:#101412;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}body{min-height:100dvh;display:grid;place-items:center;padding:24px}main{width:min(100%,360px);text-align:center}.mark{width:66px;height:66px;margin:0 auto 15px;border-radius:20px;background:#fff;display:grid;place-items:center;box-shadow:0 10px 30px rgba(0,0,0,.07)}.mark img{width:58px;height:58px}h1{font-size:24px;margin:0 0 7px}.status{font-size:14px;color:#6b726e;line-height:1.45;margin:0}.env{font-size:11px;font-weight:800;letter-spacing:.05em;color:__ACCENT__;margin-top:8px}.bar{height:5px;background:#dde3df;border-radius:999px;overflow:hidden;margin:18px 36px}.bar span{display:block;width:35%;height:100%;background:__ACCENT__;border-radius:inherit;animation:move 1s ease-in-out infinite alternate}@keyframes move{to{transform:translateX(185%)}}.menu{display:inline-block;margin-top:7px;color:#66706a;font-size:12px;text-decoration:none}@media(prefers-color-scheme:dark){html,body{background:#111411;color:#f7f8f7}.mark{background:#1c201d}.status,.menu{color:#a4aba6}.bar{background:#2b302c}}</style>
</head><body><main><div class="mark"><img src="./icons/launch.svg" alt=""></div><h1>__TITLE__</h1><p class="status" id="status">Preparando uma abertura limpa…</p><p class="env">__ENVLINE__ · __RELEASE__</p><div class="bar"><span></span></div><a class="menu" href="__MENU__">Abrir menu de ferramentas</a></main>
<script>(()=>{const RELEASE='__RELEASE__',PREFIX='__PREFIX__',status=document.getElementById('status');const cleanupKey=`${PREFIX}launch-clean-${RELEASE}`;const basePath=new URL('./',location.href).pathname;async function clean(){let needs=true;try{needs=localStorage.getItem(cleanupKey)!=='1'}catch(_){}if(!needs)return;try{if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.allSettled(regs.filter(r=>{try{return new URL(r.scope).pathname===basePath}catch(_){return false}}).map(r=>r.unregister()))}if('caches'in window){const keys=await caches.keys();await Promise.allSettled(keys.filter(k=>k.startsWith(PREFIX)).map(k=>caches.delete(k)))}try{localStorage.setItem(cleanupKey,'1')}catch(_){}}catch(_){}}(async()=>{await clean();status.textContent='Abrindo a interface…';setTimeout(()=>location.replace(`./?v=${encodeURIComponent(RELEASE)}&launch=${Date.now()}`),90)})()})();</script></body></html>'''
    return fill(template,
        title="Meu Dinheiro Beta" if beta else "Meu Dinheiro",
        accent="#3478F6" if beta else "#20A968",
        envline="BETA · dados isolados" if beta else "OFICIAL · uso diário",
        release=release,
        prefix="meu-dinheiro-beta-" if beta else "meu-dinheiro-oficial-",
        menu="../menu.html" if beta else "./menu.html",
    )


def recover_html(release: str, beta: bool) -> str:
    template = r'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f7f4"><meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"><meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="./icons/recover.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="./apple-touch-icon.png"><title>__TITLE__ · Recuperação</title><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f6f7f4;color:#111512;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}main{min-height:100dvh;display:grid;place-items:center;padding:24px}section{width:min(100%,390px);background:#fff;border-radius:24px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.07)}.top{display:flex;gap:13px;align-items:center}.top img{width:54px;height:54px}h1{font-size:22px;margin:0}p{font-size:14px;line-height:1.48;color:#6b726e}.notice{padding:11px 12px;border-radius:14px;background:#fff6e8;color:#86520a;font-size:12px;line-height:1.4}.ok{color:#24843f}.bad{color:#d83a2e}.bar{height:6px;background:#e5e9e6;border-radius:999px;overflow:hidden;margin:18px 0}.bar span{display:block;height:100%;width:18%;background:#ff9f0a;border-radius:inherit;animation:move .9s ease-in-out infinite alternate}@keyframes move{to{transform:translateX(430%)}}.actions{display:grid;gap:9px;margin-top:16px}.actions a{text-decoration:none;text-align:center;padding:12px 14px;border-radius:13px;background:#123b2d;color:#fff;font-size:14px;font-weight:700}.actions a.secondary{background:#edf0ed;color:#223129}@media(prefers-color-scheme:dark){html,body{background:#111411;color:#f7f8f7}section{background:#1c201d;box-shadow:none}p{color:#a4aba6}.notice{background:#322615;color:#ffc568}.bar{background:#2b302c}.actions a{background:#dff3e7;color:#123b2d}.actions a.secondary{background:#2b302c;color:#f7f8f7}}</style></head><body><main><section><div class="top"><img src="./icons/recover.svg" alt=""><h1>__HEADING__</h1></div><p id="status">Removendo somente os componentes temporários da interface.</p><div class="notice">__NOTICE__</div><div class="bar" id="bar"><span></span></div><div class="actions" id="actions" hidden><a href="./launch.html?v=__RELEASE__&recover=1">Abrir novamente</a><a class="secondary" href="./safe.html?v=__RELEASE__&recover=1">Abrir modo seguro</a><a class="secondary" href="__MENU__">Voltar ao menu</a></div></section></main><script>(async()=>{const PREFIX='__PREFIX__',status=document.getElementById('status'),actions=document.getElementById('actions'),bar=document.getElementById('bar'),basePath=new URL('./',location.href).pathname;try{let workers=0,cachesRemoved=0;if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();const targets=regs.filter(r=>{try{return new URL(r.scope).pathname===basePath}catch(_){return false}});const rs=await Promise.allSettled(targets.map(r=>r.unregister()));workers=rs.filter(r=>r.status==='fulfilled'&&r.value).length}if('caches'in window){const keys=await caches.keys();const targets=keys.filter(k=>k.startsWith(PREFIX));const rs=await Promise.allSettled(targets.map(k=>caches.delete(k)));cachesRemoved=rs.filter(r=>r.status==='fulfilled'&&r.value).length}status.className='ok';status.textContent=`Interface recuperada: ${workers} controlador(es) removido(s) e ${cachesRemoved} cache(s) removido(s). Seus dados foram preservados.`;bar.hidden=true;actions.hidden=false;try{localStorage.setItem(PREFIX+'last-recovery',new Date().toISOString())}catch(_){}}catch(err){status.className='bad';status.textContent='A limpeza automática não terminou. Seus dados não foram apagados. Use o modo seguro para verificar o armazenamento.';bar.hidden=true;actions.hidden=false}})();</script></body></html>'''
    return fill(template,
        title="Meu Dinheiro Beta" if beta else "Meu Dinheiro",
        heading="Recuperar somente a Beta" if beta else "Recuperar Meu Dinheiro",
        notice="Esta ferramenta NÃO apaga movimentações, contas, categorias ou configurações. E não toca no app Oficial." if beta else "Esta ferramenta NÃO apaga movimentações, contas, categorias ou configurações. Ela limpa somente cache e o controlador da interface.",
        release=release,
        prefix="meu-dinheiro-beta-" if beta else "meu-dinheiro-oficial-",
        menu="../menu.html" if beta else "./menu.html",
    )


def safe_html(release: str, beta: bool) -> str:
    template = r'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f7f4"><meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"><meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="./icons/safe.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="./apple-touch-icon.png"><title>__TITLE__ · Modo seguro</title><style>:root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;color:#111512;background:#f6f7f4}*{box-sizing:border-box}body{margin:0;min-height:100dvh;padding:calc(22px + env(safe-area-inset-top)) 18px 40px;background:#f6f7f4;color:#111512}main{width:min(100%,520px);margin:0 auto}header{margin:8px 2px 20px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.09em;color:__ACCENT__;text-transform:uppercase;margin:0 0 6px}.title-row{display:flex;align-items:center;gap:12px}.title-row img{width:54px;height:54px}h1{font-size:27px;margin:0 0 6px}p{font-size:14px;line-height:1.48;color:#6b726e;margin:0}.card{background:#fff;border-radius:20px;padding:17px;margin:12px 0;box-shadow:0 6px 24px rgba(0,0,0,.05)}.row{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #edf0ed}.row:last-child{border-bottom:0}.row strong{font-size:14px}.row span{font-size:13px;color:#6b726e;text-align:right;word-break:break-word}.status{display:flex;align-items:center;gap:9px}.dot{width:9px;height:9px;border-radius:50%;background:#f0b429;flex:none}.dot.ok{background:#34c759}.dot.bad{background:#ff3b30}.actions{display:grid;gap:9px;margin-top:14px}button,a.button{appearance:none;border:0;text-decoration:none;text-align:center;border-radius:13px;padding:13px 15px;font:700 14px/1.2 inherit;background:#123b2d;color:#fff;display:block}.secondary{background:#edf0ed!important;color:#223129!important}pre{white-space:pre-wrap;word-break:break-word;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f4f6f4;padding:11px;border-radius:12px;max-height:180px;overflow:auto}small{display:block;color:#89908b;margin-top:9px;line-height:1.45}@media(prefers-color-scheme:dark){:root,body{background:#111411;color:#f7f8f7}.card{background:#1c201d}.row{border-color:#2b302c}.row span,p,small{color:#a4aba6}.secondary{background:#2b302c!important;color:#f7f8f7!important}pre{background:#111411;color:#e5e9e6}}</style></head><body><main><header><p class="eyebrow">__EYEBROW__</p><div class="title-row"><img src="./icons/safe.svg" alt=""><div><h1>Modo seguro</h1><p>Esta tela não carrega o aplicativo principal. Ela verifica o armazenamento local e permite criar um backup de emergência sem editar seus dados.</p></div></div></header><section class="card"><div class="status"><span class="dot" id="healthDot"></span><strong id="healthTitle">Verificando armazenamento…</strong></div><small id="healthDetail">Nenhum dado será alterado durante esta verificação.</small></section><section class="card" id="countsCard" hidden><div class="row"><strong>Movimentações</strong><span id="transactionsCount">—</span></div><div class="row"><strong>Contas</strong><span id="accountsCount">—</span></div><div class="row"><strong>Categorias</strong><span id="categoriesCount">—</span></div><div class="row"><strong>Banco local</strong><span id="dbName">—</span></div><div class="row"><strong>Versão da interface</strong><span>__RELEASE__</span></div></section><section class="card"><strong>O que fazer</strong><div class="actions"><a class="button" href="./launch.html?v=__RELEASE__&safe=1">Tentar abrir o app novamente</a><button class="secondary" id="backupBtn" type="button">Criar backup de emergência</button><a class="button secondary" href="./recover.html?v=__RELEASE__&from=safe">Limpar somente a interface</a><a class="button secondary" href="__MENU__">Voltar ao menu</a></div><small>O backup é uma cópia JSON dos dados encontrados neste ambiente. Não apaga nem altera registros.</small></section><section class="card"><strong>Diagnóstico</strong><pre id="log">Iniciando…</pre></section></main><script>(()=>{const DB_NAME='__DB__',FALLBACK='__FALLBACK__',STORE='app',KEY='current-state',ENV='__ENV__';const logEl=document.getElementById('log'),dot=document.getElementById('healthDot'),title=document.getElementById('healthTitle'),detail=document.getElementById('healthDetail'),counts=document.getElementById('countsCard'),backup=document.getElementById('backupBtn');let state=null;const logs=[];function log(m){logs.push(`${new Date().toLocaleTimeString('pt-BR')}  ${m}`);logEl.textContent=logs.join('\n')}function openExisting(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME);let created=false;r.onupgradeneeded=()=>{created=true;try{r.transaction?.abort()}catch(_){}};r.onsuccess=()=>{if(created){try{r.result.close()}catch(_){}reject(new Error('Banco ainda não existe'));return}resolve(r.result)};r.onerror=()=>reject(r.error||new Error('Falha ao abrir banco'));r.onblocked=()=>reject(new Error('Banco local bloqueado por outra aba'))})}function req(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}async function read(){try{const db=await openExisting();try{if(db.objectStoreNames.contains(STORE))state=await req(db.transaction(STORE,'readonly').objectStore(STORE).get(KEY))}finally{db.close()}}catch(e){log('IndexedDB: '+(e?.message||e))}if(!state){try{const raw=localStorage.getItem(FALLBACK);if(raw)state=JSON.parse(raw)}catch(e){log('Fallback: '+(e?.message||e))}}if(!state)throw new Error('Nenhum estado salvo foi encontrado neste ambiente.')}async function init(){try{if(!('indexedDB'in window))log('IndexedDB indisponível; tentando fallback local.');await read();const t=Array.isArray(state.transactions)?state.transactions.length:0,a=Array.isArray(state.accounts)?state.accounts.length:0,c=Array.isArray(state.categories)?state.categories.length:0;document.getElementById('transactionsCount').textContent=String(t);document.getElementById('accountsCount').textContent=String(a);document.getElementById('categoriesCount').textContent=String(c);document.getElementById('dbName').textContent=DB_NAME;counts.hidden=false;dot.classList.add('ok');title.textContent='Seus dados locais estão acessíveis';detail.textContent=`Foram encontradas ${t} movimentações, ${a} contas e ${c} categorias neste ambiente.`;log(`Estado lido com sucesso: transactions=${t}; accounts=${a}; categories=${c}`)}catch(e){dot.classList.add('bad');title.textContent='Não foi possível localizar os dados deste ambiente';detail.textContent=e?.message||String(e);log('ERRO: '+(e?.stack||e));backup.disabled=true}}backup.addEventListener('click',()=>{if(!state)return;backup.disabled=true;backup.textContent='Preparando backup…';try{const payload={exportedAt:new Date().toISOString(),source:'Meu Dinheiro — modo seguro',environment:ENV,release:'__RELEASE__',database:DB_NAME,state};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`meu-dinheiro-backup-${ENV}-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);backup.textContent='Backup criado';log('Backup de emergência criado com sucesso')}catch(e){backup.disabled=false;backup.textContent='Tentar backup novamente';log('ERRO no backup: '+(e?.message||e))}});init()})();</script></body></html>'''
    return fill(template,
        title="Meu Dinheiro Beta" if beta else "Meu Dinheiro",
        accent="#3478F6" if beta else "#20A968",
        eyebrow="BETA · recuperação isolada" if beta else "OFICIAL · recuperação",
        release=release,
        db=BETA_DB if beta else OFFICIAL_DB,
        fallback=BETA_FALLBACK if beta else OFFICIAL_FALLBACK,
        env="beta" if beta else "oficial",
        menu="../menu.html" if beta else "./menu.html",
    )


def menu_html() -> str:
    template = r'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f7f4"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="./icons/menu.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="./icons/menu.svg"><title>Menu · Meu Dinheiro</title><style>:root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;color:#111512;background:#f4f7f5;--green:#20a968;--blue:#3478f6;--orange:#e78400;--purple:#7655e9}*{box-sizing:border-box}body{margin:0;min-height:100dvh;padding:calc(18px + env(safe-area-inset-top)) 14px calc(28px + env(safe-area-inset-bottom));background:radial-gradient(circle at 15% 0%,rgba(32,169,104,.08),transparent 28%),radial-gradient(circle at 90% 7%,rgba(52,120,246,.08),transparent 26%),#f4f7f5}main{width:min(100%,620px);margin:0 auto}.head{text-align:center;padding:4px 5px 17px}.head .menu-icon{width:54px;height:54px}.head h1{font-size:27px;margin:7px 0 4px}.head p{margin:0;color:#69716c;font-size:13px;line-height:1.45}.env-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}.env{position:relative;background:rgba(255,255,255,.82);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.8);border-radius:22px;padding:14px 10px 12px;text-align:center;text-decoration:none;color:inherit;box-shadow:0 8px 26px rgba(31,48,39,.06)}.env>img{width:88px;height:88px;border-radius:21px;display:block;margin:0 auto 8px}.env strong{display:block;font-size:14px}.env small{display:block;color:#7b837e;font-size:10px;margin-top:3px}.env.beta strong{color:#2467d8}.badge{position:absolute;right:10px;top:10px;padding:4px 7px;border-radius:999px;background:#3478f6;color:#fff;font-weight:800;font-size:9px;letter-spacing:.05em}h2{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#8a928d;margin:19px 4px 8px}.list{display:grid;gap:8px}.item{display:grid;grid-template-columns:48px 1fr 18px;align-items:center;gap:11px;background:rgba(255,255,255,.86);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(223,230,225,.9);border-radius:17px;padding:9px 11px;text-decoration:none;color:inherit;box-shadow:0 4px 16px rgba(31,48,39,.035)}.item img{width:46px;height:46px}.copy{min-width:0}.copy strong{display:block;font-size:13px;line-height:1.2;margin-bottom:3px}.copy span{display:block;color:#737b76;font-size:11px;line-height:1.35}.chev{font-size:24px;color:#a0a8a3;font-weight:300}.official strong{color:#168753}.beta-link strong{color:#2467d8}.diagnostic strong{color:#2467d8}.recover strong{color:#c66a00}.safe strong{color:#168753}.beta-safe strong{color:#6749d6}.note-grid{display:grid;gap:8px;margin-top:15px}.note{display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:center;border-radius:17px;padding:11px 12px;background:#fff;border:1px solid #e4e9e5}.note img{width:42px;height:42px}.note strong{font-size:12px;display:block;margin-bottom:2px}.note span{font-size:11px;color:#727a75;line-height:1.35}.note.warning{background:#fffaf0;border-color:#f3dca9}.footer{text-align:center;font-size:10px;color:#939a96;margin-top:15px}@media(max-width:360px){.env>img{width:76px;height:76px}.env strong{font-size:13px}}@media(prefers-color-scheme:dark){:root{background:#111411;color:#f7f8f7}body{background:radial-gradient(circle at 15% 0%,rgba(32,169,104,.11),transparent 28%),radial-gradient(circle at 90% 7%,rgba(52,120,246,.12),transparent 26%),#111411}.head p,h2,.copy span,.env small,.note span,.footer{color:#a0a8a3}.env,.item,.note{background:rgba(28,32,29,.86);border-color:#2b302c;box-shadow:none}.note.warning{background:#282116;border-color:#493819}}</style></head><body><main><header class="head"><img class="menu-icon" src="./icons/menu.svg" alt=""><h1>Meu Dinheiro</h1><p>Menu central das versões, diagnóstico e ferramentas de recuperação.</p></header><section class="env-grid"><a class="env" href="./"><img src="./apple-touch-icon.png" alt="Ícone Meu Dinheiro"><strong>Oficial</strong><small>Uso diário · __OFFICIAL_RELEASE__</small></a><a class="env beta" href="./beta/"><span class="badge">BETA</span><img src="./beta/apple-touch-icon.png" alt="Ícone Meu Dinheiro Beta"><strong>Beta</strong><small>Testes e atualizações · __BETA_RELEASE__</small></a></section><h2>Links principais</h2><div class="list"><a class="item official" href="./"><img src="./apple-touch-icon.png" alt=""><span class="copy"><strong>1. Oficial — uso diário</strong><span>Versão estável. Seus dados reais ficam aqui.</span></span><span class="chev">›</span></a><a class="item beta-link" href="./beta/"><img src="./beta/apple-touch-icon.png" alt=""><span class="copy"><strong>2. Beta — testes e atualizações</strong><span>Banco separado do Oficial. Pode testar sem arriscar os dados reais.</span></span><span class="chev">›</span></a><a class="item diagnostic" href="./diagnostico/"><img src="./icons/diagnostic.svg" alt=""><span class="copy"><strong>3. Central de Diagnóstico</strong><span>Ponto de partida para abrir, verificar ou recuperar qualquer ambiente.</span></span><span class="chev">›</span></a><a class="item official" href="./launch.html"><img src="./icons/launch.svg" alt=""><span class="copy"><strong>4. Inicializador seguro — Oficial</strong><span>Resolve cache/controlador antigo antes de abrir o app.</span></span><span class="chev">›</span></a><a class="item recover" href="./recover.html"><img src="./icons/recover.svg" alt=""><span class="copy"><strong>5. Recuperação — Oficial</strong><span>Limpa somente a interface. Não apaga movimentações nem configurações.</span></span><span class="chev">›</span></a><a class="item safe" href="./safe.html"><img src="./icons/safe.svg" alt=""><span class="copy"><strong>6. Modo seguro — Oficial</strong><span>Verifica o banco real e permite backup de emergência.</span></span><span class="chev">›</span></a><a class="item beta-link" href="./beta/launch.html"><img src="./beta/icons/launch.svg" alt=""><span class="copy"><strong>7. Inicializador — Beta</strong><span>Faz abertura limpa somente da versão de testes.</span></span><span class="chev">›</span></a><a class="item recover" href="./beta/recover.html"><img src="./beta/icons/recover.svg" alt=""><span class="copy"><strong>8. Recuperação — Beta</strong><span>Limpa somente componentes temporários da Beta. Não toca no Oficial.</span></span><span class="chev">›</span></a><a class="item beta-safe" href="./beta/safe.html"><img src="./beta/icons/safe.svg" alt=""><span class="copy"><strong>9. Modo seguro — Beta</strong><span>Verifica somente o banco de testes e permite backup separado.</span></span><span class="chev">›</span></a></div><div class="note-grid"><a class="item beta-link" href="./beta/?tools=1"><img src="./icons/copy.svg" alt=""><span class="copy"><strong>Copiar dados do Oficial para testes</strong><span>Abre as ferramentas da Beta. A cópia permitida é somente Oficial → Beta.</span></span><span class="chev">›</span></a><div class="note warning"><img src="./icons/safe.svg" alt=""><div><strong>Dados protegidos</strong><span>Oficial e Beta usam bancos locais diferentes. Recuperação e modo seguro também respeitam essa separação.</span></div></div></div><div class="footer">Meu Dinheiro · Oficial __OFFICIAL_RELEASE__ · Beta __BETA_RELEASE__</div></main></body></html>'''
    return fill(template, official_release=STABLE_RELEASE, beta_release=BETA_LABEL)


def diagnostic_html() -> str:
    template = r'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f6f7f4"><link rel="icon" href="../icons/diagnostic.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="../icons/diagnostic.svg"><title>Diagnóstico · Meu Dinheiro</title><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#f6f7f4;color:#111512;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}main{max-width:430px;margin:auto;padding:calc(24px + env(safe-area-inset-top)) 16px 38px}.heading{display:flex;gap:12px;align-items:center}.heading img{width:58px;height:58px}h1{font-size:27px;margin:0 0 4px}.lead{margin:0;color:#6b726e;line-height:1.45;font-size:13px}.menu{display:block;margin:13px 0 18px;padding:11px 13px;border-radius:14px;background:#eaf2ff;color:#2467d8;text-decoration:none;font-size:13px;font-weight:700;text-align:center}h2{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#8a928d;margin:21px 4px 8px}.card{display:grid;grid-template-columns:46px 1fr 16px;gap:10px;align-items:center;text-decoration:none;color:inherit;background:#fff;border-radius:17px;padding:10px 11px;margin:8px 0;box-shadow:0 4px 18px rgba(0,0,0,.04)}.card img{width:44px;height:44px}.card strong{display:block;font-size:13px;margin-bottom:3px}.card span{display:block;color:#6b726e;font-size:11px;line-height:1.4}.tag{display:inline-block!important;width:auto!important;margin-top:5px;padding:3px 6px;border-radius:999px;background:#e7f3eb;color:#168753!important;font-weight:800;font-size:9px!important}.beta .tag{background:#eaf2ff;color:#2467d8!important}.warn .tag{background:#fff2df;color:#c66a00!important}.chev{font-size:22px!important;color:#a0a8a3!important}@media(prefers-color-scheme:dark){html,body{background:#111411;color:#f7f8f7}.card{background:#1c201d;box-shadow:none}.lead,.card span,h2{color:#a4aba6}.menu{background:#182a46;color:#7fb0ff}}</style></head><body><main><div class="heading"><img src="../icons/diagnostic.svg" alt=""><div><h1>Diagnóstico</h1><p class="lead">Ferramentas independentes para abrir, recuperar ou verificar o Meu Dinheiro sem apagar seus dados.</p></div></div><a class="menu" href="../menu.html">Abrir Menu Principal</a><h2>Oficial · __OFFICIAL_RELEASE__</h2><a class="card" href="../"><img src="../apple-touch-icon.png" alt=""><div><strong>Abrir app Oficial</strong><span>Versão estável usada no dia a dia.</span><span class="tag">ESTÁVEL</span></div><span class="chev">›</span></a><a class="card" href="../launch.html"><img src="../icons/launch.svg" alt=""><div><strong>Inicializador seguro</strong><span>Faz uma abertura limpa antes de entregar a interface.</span></div><span class="chev">›</span></a><a class="card warn" href="../recover.html"><img src="../icons/recover.svg" alt=""><div><strong>Recuperar interface</strong><span>Remove somente cache/controlador. Não apaga o banco financeiro.</span><span class="tag">PRESERVA DADOS</span></div><span class="chev">›</span></a><a class="card" href="../safe.html"><img src="../icons/safe.svg" alt=""><div><strong>Modo seguro</strong><span>Lê os dados locais sem depender do aplicativo principal e permite backup.</span></div><span class="chev">›</span></a><h2>Beta · __BETA_RELEASE__</h2><a class="card beta" href="../beta/"><img src="../beta/apple-touch-icon.png" alt=""><div><strong>Abrir Beta</strong><span>Ambiente de testes com banco separado do Oficial.</span><span class="tag">DADOS ISOLADOS</span></div><span class="chev">›</span></a><a class="card beta" href="../beta/launch.html"><img src="../beta/icons/launch.svg" alt=""><div><strong>Inicializador da Beta</strong><span>Abre somente o ambiente de testes em modo limpo.</span></div><span class="chev">›</span></a><a class="card warn" href="../beta/recover.html"><img src="../beta/icons/recover.svg" alt=""><div><strong>Recuperar Beta</strong><span>Limpa somente componentes temporários da Beta.</span><span class="tag">NÃO TOCA NO OFICIAL</span></div><span class="chev">›</span></a><a class="card beta" href="../beta/safe.html"><img src="../beta/icons/safe.svg" alt=""><div><strong>Modo seguro da Beta</strong><span>Verifica somente o banco de testes e permite backup separado.</span></div><span class="chev">›</span></a></main></body></html>'''
    return fill(template, official_release=STABLE_RELEASE, beta_release=BETA_LABEL)


def write_tool_pages(target: Path, release: str, beta: bool) -> None:
    write_icons(target, beta=beta)
    (target / "launch.html").write_text(launcher_html(release, beta), encoding="utf-8")
    (target / "recover.html").write_text(recover_html(release, beta), encoding="utf-8")
    (target / "safe.html").write_text(safe_html(release, beta), encoding="utf-8")


def write_environment_json(path: Path, beta: bool) -> None:
    payload = {
        "environment": "beta" if beta else "production",
        "release": BETA_LABEL if beta else STABLE_RELEASE,
        "branch": "main" if beta else "stable",
        "database": BETA_DB if beta else OFFICIAL_DB,
        "fallback": BETA_FALLBACK if beta else OFFICIAL_FALLBACK,
        "writes_to_production": False if beta else True,
        "stable": False if beta else True,
    }
    if beta:
        payload["copy_direction"] = "production-to-beta-only"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if not STABLE.exists() or not (STABLE / "index.html").exists():
    raise SystemExit("Checkout da branch stable ausente ou inválido")
if not (ROOT / "index.html").exists():
    raise SystemExit("Build da branch main ausente")
if not (STABLE / "apple-touch-icon.png").exists():
    raise SystemExit("Ícone Oficial ausente na branch stable")
if not (ROOT / "apple-touch-icon.png").exists():
    raise SystemExit("Ícone Beta ausente na branch main")

if SITE.exists():
    shutil.rmtree(SITE)
SITE.mkdir(parents=True)

# OFICIAL: interface vem exclusivamente da branch stable.
copy_runtime(STABLE, SITE)
patch_index(SITE / "index.html", "official", STABLE_RELEASE, beta=False)
shutil.copy2(SITE / "index.html", SITE / "404.html")
patch_manifest(SITE / "manifest.webmanifest", STABLE_RELEASE, beta=False)
(SITE / "sw.js").write_text(service_worker(f"meu-dinheiro-oficial-{STABLE_RELEASE}-{SHELL_REVISION}", "meu-dinheiro-oficial-", SITE), encoding="utf-8")
write_tool_pages(SITE, STABLE_RELEASE, beta=False)
write_environment_json(SITE / "environment.json", beta=False)

# BETA: interface vem da main, porém banco/cache/PWA são próprios.
beta = SITE / "beta"
copy_runtime(ROOT, beta)
for js_path in (beta / "assets").glob("*.js"):
    text = js_path.read_text(encoding="utf-8")
    text = text.replace(OFFICIAL_DB, BETA_DB)
    js_path.write_text(text, encoding="utf-8")
patch_index(beta / "index.html", "beta", BETA_LABEL, beta=True)
shutil.copy2(beta / "index.html", beta / "404.html")
patch_manifest(beta / "manifest.webmanifest", BETA_LABEL, beta=True)
(beta / "sw.js").write_text(service_worker(f"meu-dinheiro-beta-{BETA_LABEL}-{SHELL_REVISION}", "meu-dinheiro-beta-", beta), encoding="utf-8")
write_tool_pages(beta, BETA_LABEL, beta=True)
write_environment_json(beta / "environment.json", beta=True)

beta_tools_source = ROOT / "beta-tools.js"
if not beta_tools_source.exists():
    raise SystemExit("beta-tools.js ausente na main")
(beta / "beta-tools.js").write_text(beta_tools_source.read_text(encoding="utf-8").replace("__BETA_RELEASE__", BETA_LABEL), encoding="utf-8")

# MENU PRINCIPAL + CENTRAL DE DIAGNÓSTICO.
menu = menu_html()
(SITE / "menu.html").write_text(menu, encoding="utf-8")
menu_dir = SITE / "menu"
menu_dir.mkdir(exist_ok=True)
(menu_dir / "index.html").write_text(menu.replace('href="./', 'href="../').replace('src="./', 'src="../'), encoding="utf-8")
diag = SITE / "diagnostico"
diag.mkdir(exist_ok=True)
(diag / "index.html").write_text(diagnostic_html(), encoding="utf-8")

(SITE / "ambientes.json").write_text(json.dumps({
    "official": {"path": "./", "release": STABLE_RELEASE, "branch": "stable", "database": OFFICIAL_DB},
    "beta": {"path": "./beta/", "release": BETA_LABEL, "branch": "main", "database": BETA_DB},
    "menu": {"path": "./menu.html", "alias": "./menu/"},
    "diagnostic": {"path": "./diagnostico/"},
    "data_flow": "official-to-beta-only",
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Validações locais que bloqueiam a publicação se algo crítico estiver incorreto.
expected = [
    "index.html", "launch.html", "recover.html", "safe.html", "menu.html", "menu/index.html", "diagnostico/index.html",
    "environment.json", "ambientes.json", "apple-touch-icon.png", "icons/menu.svg", "icons/diagnostic.svg", "icons/launch.svg", "icons/recover.svg", "icons/safe.svg",
    "beta/index.html", "beta/launch.html", "beta/recover.html", "beta/safe.html", "beta/environment.json", "beta/beta-tools.js", "beta/apple-touch-icon.png",
    "beta/icons/launch.svg", "beta/icons/recover.svg", "beta/icons/safe.svg",
]
missing = [item for item in expected if not (SITE / item).is_file() or (SITE / item).stat().st_size == 0]
if missing:
    raise SystemExit("Publicação bloqueada: arquivos ausentes: " + ", ".join(missing))

beta_js = "\n".join(p.read_text(encoding="utf-8") for p in (beta / "assets").glob("*.js"))
if BETA_DB not in beta_js:
    raise SystemExit("Publicação bloqueada: a Beta não usa o banco isolado")
if f'"{OFFICIAL_FALLBACK}"' in beta_js:
    raise SystemExit("Publicação bloqueada: a Beta ainda referencia a chave exata do Oficial")
# Os builds começam a partir da mesma estrutura de desenvolvimento. Os ícones PWA
# são aplicados logo depois, a partir das fontes canônicas, por
# generate_valid_pwa_icons.py. A verificação de que Oficial e Beta são diferentes
# fica em verify_site.py, depois dessa aplicação; testar aqui exigiria copiar o
# ícone gerado da Beta de volta para a fonte compartilhada.

menu_text = (SITE / "menu.html").read_text(encoding="utf-8")
for link in ("./", "./beta/", "./diagnostico/", "./launch.html", "./recover.html", "./safe.html", "./beta/launch.html", "./beta/recover.html", "./beta/safe.html"):
    if f'href="{link}"' not in menu_text:
        raise SystemExit(f"Publicação bloqueada: link ausente no menu: {link}")

print(f"[OK] Oficial {STABLE_RELEASE}: stable / {OFFICIAL_DB}")
print(f"[OK] Beta {BETA_LABEL}: main / {BETA_DB}")
print("[OK] Menu, diagnóstico, inicializadores, recuperações e modos seguros gerados")
print("[OK] Fluxo de cópia permitido: Oficial -> Beta; nunca Beta -> Oficial")
