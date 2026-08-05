(() => {
  // ================= Estado =================
  let PROGRAMS = [];
  let TOOLS = [];
  let activeCategory = '__all';
  let activeMethod = 'auto';
  let activeMode = 'auto'; // 'download' | 'manual' | 'auto'
  let searchTerm = '';
  const selected = new Map(); // id -> program
  let isBusy = false;
  let currentInstallId = null;

  // ================= Elementos =================
  const grid = document.getElementById('grid');
  const catNav = document.getElementById('category-nav');
  const searchInput = document.getElementById('search');
  const installBtn = document.getElementById('btn-install-selected');
  const selectedCountEl = document.getElementById('selected-count');
  const terminalBody = document.getElementById('terminal-body');
  const toolsGrid = document.getElementById('tools-grid');

  // ================= Terminal (global, compartida por todas las páginas) =================
  const MAX_LOG_LINES = 2000; // evita que el DOM crezca sin límite en sesiones largas

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function trimTerminal() {
    while (terminalBody.childElementCount > MAX_LOG_LINES) {
      terminalBody.removeChild(terminalBody.firstChild);
    }
  }

  // Agrega UNA línea ya completa (sin \n) al log, con su propia clase de color.
  function logLine(text, cls) {
    const div = document.createElement('div');
    let autoCls = cls;
    if (!autoCls) {
      const t = text.toLowerCase();
      if (t.includes('error') || t.includes('fail') || t.includes('no se pudo')) autoCls = 'line-error';
      else if (t.includes('advertencia') || t.includes('warn') || t.includes('⚠')) autoCls = 'line-warn';
      else if (t.includes('success') || t.includes('instalado') || t.includes('completed') || t.includes('listo')) autoCls = 'line-ok';
    }
    if (autoCls) div.className = autoCls;
    const ts = document.createElement('span');
    ts.className = 'line-ts';
    ts.textContent = timestamp();
    div.appendChild(ts);
    div.appendChild(document.createTextNode(text));
    terminalBody.appendChild(div);
    trimTerminal();
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }
  function logSys(text) { logLine(text, 'line-sys'); }

  // Los procesos (winget/choco/powershell) mandan la salida en chunks
  // crudos que NO respetan límites de línea: un solo chunk puede traer
  // media línea, varias líneas juntas, o cortar una palabra a la mitad.
  // Antes cada chunk se pintaba como una única línea de terminal, lo que
  // rompía el resaltado de color (una sola línea con "error" y otras 4
  // líneas sin relación quedaban todas coloreadas igual) y a veces
  // mostraba fragmentos de línea sueltos. Este buffer junta los chunks y
  // solo emite líneas completas; lo que queda sin \n al final se guarda
  // para la próxima tanda.
  let logBuffer = '';
  function pushLogChunk(rawText) {
    logBuffer += rawText;
    const parts = logBuffer.split(/\r?\n/);
    logBuffer = parts.pop(); // resto incompleto, se guarda para el próximo chunk
    parts.forEach((line) => {
      if (line.trim() === '') return;
      logLine(line);
    });
  }

  function openTerminal() { document.getElementById('terminal').classList.remove('collapsed'); }

  document.getElementById('terminal-toggle').addEventListener('click', () => {
    document.getElementById('terminal').classList.toggle('collapsed');
  });

  document.getElementById('btn-clear-log').addEventListener('click', (e) => {
    e.stopPropagation();
    terminalBody.innerHTML = '';
    logBuffer = '';
  });

  // ================= Nav lateral (hamburguesa + páginas) =================
  const sidenav = document.getElementById('sidenav');
  document.getElementById('hamburger').addEventListener('click', () => {
    sidenav.classList.toggle('expanded');
  });

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.dataset.page === page));
    });
  });

  // ================= PÁGINA: PROGRAMAS =================
  // Chocolatey (edición gratuita) SIEMPRE descarga + instala en un solo paso
  // silencioso — no existe forma de solo bajar el instalador ("download" es
  // función paga de Chocolatey Pro/Business) ni de mostrar su asistente
  // ("manual"). Por eso choco solo es válido en modo AUTOMÁTICO; en
  // "solo descargar" y "manual" se marca como no soportado en vez de dejar
  // que el usuario crea que va a pasar algo distinto de lo que realmente
  // va a pasar. (Ver también el chequeo espejo en main.js → program:install).
  function computeEffective(program, method, mode) {
    if (mode !== 'auto') {
      // Solo winget separa de verdad "descargar" (winget download) de
      // "manual" (winget install sin --silent) del comportamiento automático.
      if (method === 'winget') return program.winget ? 'winget' : null;
      if (method === 'auto') return program.winget ? 'winget' : null;
      return null;
    }
    if (method === 'auto') {
      if (program.winget) return 'winget';
      if (program.choco) return 'choco';
      if (program.ninite) return 'ninite';
      return null;
    }
    if (method === 'ninite') return program.ninite ? 'ninite' : null;
    return program[method] ? method : null;
  }

  function buildCategoryNav() {
    const counts = {};
    PROGRAMS.forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
    catNav.innerHTML = '';
    const makeBtn = (cat, label, count) => {
      const btn = document.createElement('button');
      btn.className = 'cat-item' + (cat === activeCategory ? ' active' : '');
      btn.dataset.cat = cat;
      btn.innerHTML = `<span class="cat-label">${label}</span><span class="cat-count">${count}</span>`;
      btn.addEventListener('click', () => {
        activeCategory = cat;
        [...catNav.children].forEach((c) => c.classList.toggle('active', c.dataset.cat === cat));
        renderGrid();
      });
      return btn;
    };
    catNav.appendChild(makeBtn('__all', 'Todas', PROGRAMS.length));
    Object.keys(counts).sort().forEach((cat) => catNav.appendChild(makeBtn(cat, cat, counts[cat])));
  }

  function badge(label, ok) { return `<span class="badge ${ok ? 'supported' : ''}">${label}</span>`; }

  function cardHTML(program) {
    const effective = computeEffective(program, activeMethod, activeMode);
    const supported = effective !== null;
    const isSelected = selected.has(program.id);
    return `
      <div class="card ${isSelected ? 'selected' : ''} ${!supported ? 'unsupported' : ''}" data-id="${program.id}">
        <span class="bracket tl"></span><span class="bracket tr"></span>
        <span class="bracket bl"></span><span class="bracket br"></span>
        <div class="card-top">
          <div>
            <div class="card-name">${program.name}</div>
            <div class="card-cat">${program.category}</div>
          </div>
          <div class="checkbox"></div>
        </div>
        <div class="badges">
          ${badge('W', !!program.winget)}
          ${badge('C', !!program.choco)}
          ${badge('N', !!program.ninite)}
        </div>
        ${program.warn ? `<div class="warn-flag">⚠ ${program.warn}</div>` : ''}
        <div class="status-chip" data-role="status">
          <span class="status-dot-sm"></span><span data-role="status-text">PENDIENTE</span>
        </div>
        <div class="progress-track" data-role="progress-track">
          <div class="progress-fill" data-role="progress-fill"></div>
        </div>
        <button class="btn-ghost small retry-btn" data-role="retry" style="display:none;">&#8635; Reintentar</button>
      </div>
    `;
  }

  function renderGrid() {
    const list = PROGRAMS.filter((p) => {
      const catOk = activeCategory === '__all' || p.category === activeCategory;
      const searchOk = !searchTerm || p.name.toLowerCase().includes(searchTerm);
      return catOk && searchOk;
    });

    grid.innerHTML = list.map(cardHTML).join('');

    grid.querySelectorAll('.card').forEach((el) => {
      const retryBtn = el.querySelector('[data-role="retry"]');
      if (retryBtn) {
        retryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const program = PROGRAMS.find((p) => p.id === el.dataset.id);
          retrySingle(program);
        });
      }
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-role="retry"]')) return;
        const program = PROGRAMS.find((p) => p.id === el.dataset.id);
        const effective = computeEffective(program, activeMethod, activeMode);
        if (!effective) return;
        if (selected.has(program.id)) selected.delete(program.id);
        else selected.set(program.id, program);
        renderGrid();
      });
    });

    updateSelectedCount();
  }

  function updateSelectedCount() {
    selectedCountEl.textContent = selected.size;
    installBtn.disabled = selected.size === 0 || isBusy;
  }

  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderGrid();
  });

  const chocoWarning = document.getElementById('choco-mode-warning');
  const modeButtons = () => [...document.querySelectorAll('#mode-select .method-btn')];

  function setActiveMode(mode) {
    activeMode = mode;
    modeButtons().forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  }

  // Con CHOCO elegido explícitamente, "solo descargar" y "manual" no
  // reflejan lo que realmente pasa (siempre instala silenciosamente) —
  // se deshabilitan y se avisa, en vez de dejar que el usuario los elija
  // creyendo que van a funcionar distinto.
  function updateModeAvailability() {
    const chocoSelected = activeMethod === 'choco';
    modeButtons().forEach((b) => {
      const restricted = chocoSelected && b.dataset.mode !== 'auto';
      b.disabled = restricted;
      b.title = restricted
        ? 'No disponible con CHOCO: la edición gratuita de Chocolatey siempre instala en el mismo paso, sin importar el modo.'
        : '';
    });
    chocoWarning.classList.toggle('show', chocoSelected);
    if (chocoSelected && activeMode !== 'auto') {
      logSys('CHOCO no soporta "solo descargar" ni "manual" (edición gratuita) — modo forzado a AUTOMÁTICO.');
      setActiveMode('auto');
    }
  }

  document.getElementById('method-select').addEventListener('click', (e) => {
    const btn = e.target.closest('.method-btn');
    if (!btn || !btn.dataset.method) return;
    activeMethod = btn.dataset.method;
    [...document.querySelectorAll('#method-select .method-btn')].forEach((b) => b.classList.toggle('active', b === btn));
    updateModeAvailability();
    [...selected.keys()].forEach((id) => {
      const p = selected.get(id);
      if (!computeEffective(p, activeMethod, activeMode)) selected.delete(id);
    });
    renderGrid();
  });

  document.getElementById('mode-select').addEventListener('click', (e) => {
    const btn = e.target.closest('.method-btn');
    if (!btn || !btn.dataset.mode || btn.disabled) return;
    setActiveMode(btn.dataset.mode);
    [...selected.keys()].forEach((id) => {
      const p = selected.get(id);
      if (!computeEffective(p, activeMethod, activeMode)) selected.delete(id);
    });
    renderGrid();
  });

  function getCardEls(id) {
    const card = grid.querySelector(`.card[data-id="${id}"]`);
    if (!card) return null;
    return {
      card,
      statusEl: card.querySelector('[data-role="status"]'),
      statusText: card.querySelector('[data-role="status-text"]'),
      track: card.querySelector('[data-role="progress-track"]'),
      fill: card.querySelector('[data-role="progress-fill"]'),
      retryBtn: card.querySelector('[data-role="retry"]'),
    };
  }

  function setCardStatus(id, state, label) {
    const refs = getCardEls(id);
    if (!refs) return;
    refs.statusEl.className = `status-chip ${state}`;
    refs.statusText.textContent = label;
    if (refs.retryBtn) refs.retryBtn.style.display = state === 'error' ? 'block' : 'none';
    if (state === 'active') {
      refs.track.classList.add('show');
      refs.fill.classList.add('indeterminate');
    } else {
      refs.fill.classList.remove('indeterminate');
      if (state === 'done') refs.fill.style.width = '100%';
    }
  }

  window.deploykit.onInstallStream(({ type, data }) => {
    if (type === 'log') pushLogChunk(data);
    if (type === 'progress' && currentInstallId) {
      const refs = getCardEls(currentInstallId);
      if (refs) {
        refs.fill.classList.remove('indeterminate');
        refs.fill.style.width = `${data}%`;
      }
    }
  });

  const MODE_LABELS = { download: 'DESCARGANDO', manual: 'INSTALADOR ABIERTO · ESPERANDO', auto: 'DESCARGANDO' };
  const MODE_DONE_LABELS = { download: 'DESCARGADO', manual: 'PROCESO FINALIZADO', auto: 'LISTO' };

  async function installOne(program, method, mode) {
    setCardStatus(program.id, 'active', `${method.toUpperCase()} · ${MODE_LABELS[mode] || 'PROCESANDO'}`);
    logSys(`== ${mode === 'download' ? 'Descargando' : 'Instalando'} ${program.name} vía ${method.toUpperCase()} (${mode}) ==`);
    currentInstallId = program.id;
    let result;
    try {
      result = await window.deploykit.installProgram(program, method, mode);
    } catch (err) {
      result = { ok: false, code: -1 };
    }
    currentInstallId = null;

    if (result.opened === 'ninite') {
      setCardStatus(program.id, 'done', 'NINITE ABIERTO EN NAVEGADOR');
      logSys(`Ninite no soporta instalación directa por API. Se abrió el sitio para ${program.name}.`);
    } else if (result.ok) {
      setCardStatus(program.id, 'done', MODE_DONE_LABELS[mode] || 'LISTO');
    } else {
      setCardStatus(program.id, 'error', `ERROR (código ${result.code})${result.error ? ' · ' + result.error : ''}`);
    }
    return result;
  }

  async function retrySingle(program) {
    if (isBusy) return;
    // Antes, si el modo/método activos ya no eran válidos para este programa
    // (ej. el usuario cambió a "solo descargar" después del intento fallido),
    // este fallback igual elegía cualquier método disponible (típicamente
    // choco) e ignoraba el modo — resultado: un reintento en "solo descargar"
    // terminaba descargando E instalando vía choco sin avisar. Ahora el
    // reintento respeta exactamente las mismas reglas que la instalación
    // normal (computeEffective) en vez de tener su propia ruta alternativa.
    const method = computeEffective(program, activeMethod, activeMode);
    if (!method) {
      logSys(`${program.name}: no se puede reintentar con el método/modo actual (revisá la selección de MÉTODO/MODO arriba).`);
      return;
    }
    isBusy = true;
    installBtn.disabled = true;
    openTerminal();
    await installOne(program, method, activeMode);
    isBusy = false;
    installBtn.disabled = selected.size === 0;
  }

  async function installQueue() {
    if (isBusy) return;
    isBusy = true;
    const items = [...selected.values()];
    installBtn.disabled = true;
    installBtn.classList.add('busy');
    openTerminal();

    for (let i = 0; i < items.length; i++) {
      const program = items[i];
      const method = computeEffective(program, activeMethod, activeMode);
      await installOne(program, method, activeMode);
    }

    installBtn.classList.remove('busy');
    isBusy = false;
    selected.clear();
    renderGrid();
  }

  installBtn.addEventListener('click', installQueue);

  // ================= PÁGINA: ÚTILES =================
  function toolCardHTML(tool) {
    return `
      <div class="tool-card" data-id="${tool.id}">
        <div class="tool-name">${tool.name}</div>
        <div class="tool-desc">${tool.description}</div>
        <div class="tool-meta">
          <span class="tool-version" data-role="version">
            <span class="status-dot-sm"></span><span data-role="version-text">VERIFICANDO...</span>
          </span>
          <span class="tool-update-flag" data-role="update-flag"></span>
        </div>
        <div class="tool-actions">
          <button class="btn-accent small" data-role="install">Instalar</button>
          <button class="btn-ghost small" data-role="update" style="display:none;">Actualizar</button>
        </div>
      </div>
    `;
  }

  function getToolEls(id) {
    const card = toolsGrid.querySelector(`.tool-card[data-id="${id}"]`);
    if (!card) return null;
    return {
      card,
      versionWrap: card.querySelector('[data-role="version"]'),
      versionText: card.querySelector('[data-role="version-text"]'),
      updateFlag: card.querySelector('[data-role="update-flag"]'),
      installBtn: card.querySelector('[data-role="install"]'),
      updateBtn: card.querySelector('[data-role="update"]'),
    };
  }

  async function refreshToolStatus(tool) {
    const refs = getToolEls(tool.id);
    if (!refs) return;
    refs.versionText.textContent = 'VERIFICANDO...';
    refs.updateFlag.textContent = '';

    const status = await window.deploykit.toolStatus(tool.id);

    if (status.installed) {
      refs.versionWrap.classList.add('installed');
      refs.versionText.textContent = `INSTALADO · v${status.version || '?'}`;
      refs.installBtn.textContent = 'Reinstalar';
      refs.updateBtn.style.display = 'inline-block';
      refs.updateFlag.textContent = status.updateAvailable ? `ACTUALIZACIÓN DISPONIBLE → ${status.available}` : '';
    } else {
      refs.versionWrap.classList.remove('installed');
      refs.versionText.textContent = 'NO INSTALADO';
      refs.installBtn.textContent = 'Instalar';
      refs.updateBtn.style.display = 'none';
    }
  }

  window.deploykit.onToolStream(({ type, data }) => {
    if (type === 'log') pushLogChunk(data);
  });

  function renderToolsGrid() {
    toolsGrid.innerHTML = TOOLS.map(toolCardHTML).join('');

    TOOLS.forEach((tool) => {
      const refs = getToolEls(tool.id);
      if (!refs) return;

      refs.installBtn.addEventListener('click', async () => {
        if (isBusy) return;
        isBusy = true;
        refs.installBtn.disabled = true;
        openTerminal();
        logSys(`== Instalando ${tool.name} ==`);

        const result = await window.deploykit.toolInstall(tool.id);

        refs.installBtn.disabled = false;
        isBusy = false;
        await refreshToolStatus(tool);
        logSys(result && result.ok !== false ? `${tool.name}: listo.` : `${tool.name}: hubo un error, revisá el log.`);
      });

      refs.updateBtn.addEventListener('click', async () => {
        if (isBusy) return;
        isBusy = true;
        refs.updateBtn.disabled = true;
        openTerminal();
        logSys(`== Actualizando ${tool.name} ==`);

        const result = await window.deploykit.toolUpdate(tool.id);

        refs.updateBtn.disabled = false;
        isBusy = false;
        await refreshToolStatus(tool);
        logSys(result && result.ok !== false ? `${tool.name}: actualizado.` : `${tool.name}: hubo un error, revisá el log.`);
      });

      refreshToolStatus(tool);
    });
  }

  // ================= Informativas =================
  const ROADMAP = `==============================
           HOJA DE RUTA: INSTALACIÓN LIMPIA & ATLASOS
==============================

[FASE 1: INSTALACIÓN BASE Y CONEXIÓN]
1. Formatear y realizar instalación limpia de Windows 11 (ISO Oficial).
2. Instalar el driver de red (LAN/Wi-Fi) si Windows no lo detecta automáticamente.
3. Ir a Windows Update y ejecutar TODAS las búsquedas de actualizaciones
   y reinicios hasta que indique "Todo está actualizado".

[FASE 2: DESPLIEGUE DE ATLASOS]
4. Descargar e instalar AME Wizard + Playbook de AtlasOS.
5. IMPORTANTE (Entorno DEV): Durante el asistente o en Atlas Toolbox,
   MANTENER ACTIVADA la virtualización / Hyper-V (necesario para
   emuladores y Docker/WSL2).
6. Completar la instalación de AtlasOS y reiniciar.

[FASE 3: CONTROLADORES DE HARDWARE]
7. Instalar los drivers del Chipset de la placa base (Intel/AMD).
8. Instalar el driver de la Tarjeta Gráfica (usar instalación limpia
   sin bloatware como NVCleanstall para NVIDIA o AMD Adrenalin Minimal).

[FASE 4: RUNTIMES Y ENTORNO DE DESARROLLO]
9. Ejecutar el script automatizado de PowerShell (Winget) para instalar
   Visual C++ Runtimes, JDK, Python, Git y Android CLI Tools.
10. Configurar las variables de entorno (PATH / JAVA_HOME) para las CLI.

[FASE 5: APLICACIONES Y JUEGOS]
11. Instalar clientes de juegos y multimedia (Steam, OBS, VLC, Discord).
12. Aplicar optimizaciones finales de Atlas Toolbox a nivel visual o de red.
====================================================================`;

  document.getElementById('roadmap-text').textContent = ROADMAP;

  // ================= PÁGINA: CONFIGURACIONES =================
  document.getElementById('theme-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('.theme-card');
    if (!btn) return;
    applyTheme(btn.dataset.theme);
    await window.deploykit.setSettings({ theme: btn.dataset.theme });
  });

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    document.querySelectorAll('.theme-card').forEach((c) => c.classList.toggle('active', c.dataset.theme === theme));
    window.deploykit.setTitlebarTheme(theme);
  }

  document.getElementById('btn-export-profile').addEventListener('click', async () => {
    const payload = { method: activeMethod, ids: [...selected.keys()] };
    const res = await window.deploykit.exportProfile(payload);
    if (res.ok) logSys(`Perfil exportado a ${res.path}`);
  });

  document.getElementById('btn-import-profile').addEventListener('click', async () => {
    const res = await window.deploykit.importProfile();
    if (!res.ok || !res.data) return;
    const data = res.data;
    if (data.method) {
      activeMethod = data.method;
      [...document.querySelectorAll('#method-select .method-btn')].forEach((b) => b.classList.toggle('active', b.dataset.method === activeMethod));
    }
    selected.clear();
    (data.ids || []).forEach((id) => {
      const p = PROGRAMS.find((x) => x.id === id);
      if (p) selected.set(id, p);
    });
    renderGrid();
    logSys(`Perfil importado: ${selected.size} programa(s) seleccionados.`);
  });

  // ---------- Carpeta de descargas (modo "Solo descargar") ----------
  const downloadDirInput = document.getElementById('download-dir-input');

  async function saveDownloadDir(dir) {
    if (!dir) return;
    await window.deploykit.setSettings({ downloadDir: dir });
    downloadDirInput.value = dir;
    logSys(`Carpeta de descargas guardada: ${dir}`);
  }

  document.getElementById('btn-browse-dir').addEventListener('click', async () => {
    const res = await window.deploykit.pickDownloadFolder();
    if (res.ok) await saveDownloadDir(res.path);
  });

  document.getElementById('btn-save-dir').addEventListener('click', () => {
    saveDownloadDir(downloadDirInput.value.trim());
  });

  // ================= Dependencias (verificación inicial silenciosa) =================
  window.deploykit.onDepStream(({ type, data }) => {
    if (type === 'log') pushLogChunk(data);
  });

  // ================= Init =================
  async function init() {
    const [programs, tools, settings, defaultDownloadDir] = await Promise.all([
      window.deploykit.getPrograms(),
      window.deploykit.getTools(),
      window.deploykit.getSettings(),
      window.deploykit.getDefaultDownloadDir(),
    ]);
    PROGRAMS = programs;
    TOOLS = tools;

    buildCategoryNav();
    renderGrid();
    renderToolsGrid();

    applyTheme(settings.theme || 'red');
    updateModeAvailability();
    downloadDirInput.value = settings.downloadDir || defaultDownloadDir;
  }

  init();
})();
