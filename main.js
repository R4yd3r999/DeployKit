const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PROGRAMS } = require('./src/programs');
const { TOOLS } = require('./src/tools');

let mainWindow;
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const LOGS_DIR = path.join(app.getPath('userData'), 'logs');

function todayLogPath() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `deploykit-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`;
  return path.join(LOGS_DIR, name);
}

// Escribe una línea al archivo de log del día (con hora). No debe nunca
// tirar la app abajo si falla — el log en pantalla sigue funcionando igual.
function appendLogFile(line) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
    fs.appendFileSync(todayLogPath(), `[${ts}] ${line}\n`, 'utf-8');
  } catch (err) {
    console.error('No se pudo escribir el log en disco:', err);
  }
}

// Colores del overlay de controles nativos (min/max/cerrar) por tema.
// Deben reflejar --bg-void y --text-hi de cada tema en styles.css.
const TITLEBAR_OVERLAY_BY_THEME = {
  red: { color: '#0a0a0c', symbolColor: '#eef0f3', height: 40 },
  blue: { color: '#070b0f', symbolColor: '#eaf3fb', height: 40 },
  purple: { color: '#0c0810', symbolColor: '#f1ebf6', height: 40 },
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0a0a0c',
    // Antes: frame:false + botones propios dibujados en HTML. En Windows,
    // los frameless windows redimensionables tienen un bug conocido de
    // Chromium/Windows donde el borde invisible de resize (~8px) hace que,
    // al achicar/restaurar la ventana en modo ventana, el contenido pintado
    // quede desalineado y los elementos pegados al borde derecho (nuestros
    // botones de minimizar/maximizar/cerrar) terminen recortados o fuera
    // del área visible. titleBarOverlay delega esos 3 botones al propio
    // Windows (dibujo nativo, respeta Snap Layouts, sin el bug de recorte)
    // y nosotros solo estilizamos el resto de la barra de título.
    titleBarStyle: 'hidden',
    // Arranca ya con el color del tema guardado (si hay uno) para evitar
    // un flash del overlay rojo por defecto antes de que el renderer
    // cargue y lo corrija.
    titleBarOverlay: TITLEBAR_OVERLAY_BY_THEME[readSettings().theme] || TITLEBAR_OVERLAY_BY_THEME.red,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- Controles de ventana ----------
// minimizar/maximizar/cerrar ahora los dibuja Windows vía titleBarOverlay
// (ver createWindow). Solo necesitamos sincronizar el color del overlay
// cuando el usuario cambia de tema en Configuraciones.
ipcMain.on('window:set-titlebar-theme', (event, theme) => {
  const overlay = TITLEBAR_OVERLAY_BY_THEME[theme] || TITLEBAR_OVERLAY_BY_THEME.red;
  if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.setTitleBarOverlay === 'function') {
    mainWindow.setTitleBarOverlay(overlay);
  }
});

// ---------- Datos ----------
ipcMain.handle('programs:list', () => PROGRAMS);
ipcMain.handle('tools:list', () => TOOLS);

// ---------- Configuración persistente (tema, etc.) ----------
function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}
function writeSettings(obj) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('No se pudo guardar settings.json', err);
  }
}
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (event, partial) => {
  const merged = { ...readSettings(), ...partial };
  writeSettings(merged);
  return merged;
});
ipcMain.handle('settings:default-download-dir', () => path.join(app.getPath('downloads'), 'DeployKit'));
ipcMain.handle('settings:pick-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Elegir carpeta de descargas',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || filePaths.length === 0) return { ok: false };
  return { ok: true, path: filePaths[0] };
});

// ---------- Perfil de selección (export / import) ----------
ipcMain.handle('profile:export', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Exportar selección',
    defaultPath: 'deploykit-perfil.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('profile:import', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Importar selección',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return { ok: false };
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---------- Helper: correr un comando, transmitir su salida y dejarla en el log de disco ----------
function runStreamed(win, channel, command, args, label) {
  return new Promise((resolve) => {
    const cmdLine = `${command} ${args.join(' ')}`;
    appendLogFile(`== INICIO${label ? ' · ' + label : ''} ==`);
    appendLogFile(`$ ${cmdLine}`);

    const child = spawn(command, args, { shell: true, windowsHide: true });
    let lastBucket = -1; // último escalón de 5% ya avisado por texto en el log

    const send = (type, data) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, { type, data });
    };

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      send('log', text);
      appendLogFile(text.trimEnd());
      const match = text.match(/(\d{1,3})\s?%/);
      if (match) {
        const pct = Math.min(100, Number(match[1]));
        // La barra de progreso (evento 'progress') se actualiza siempre, en
        // vivo, para que se vea fluida. Pero como texto en el log solo se
        // imprime una línea nueva cada vez que se cruza un escalón de 5%
        // (0, 5, 10...) — si avisáramos en CADA byte con "%" el log se
        // volvería ilegible (winget/choco reescriben la misma línea muchas
        // veces por segundo mientras descargan).
        send('progress', pct);
        const bucket = Math.floor(pct / 5) * 5;
        if (bucket !== lastBucket) {
          lastBucket = bucket;
          const line = `→ ${bucket}%${label ? ' · ' + label : ''}`;
          send('log', `\n${line}\n`);
          appendLogFile(line);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      send('log', text);
      appendLogFile(`[stderr] ${text.trimEnd()}`);
    });

    child.on('error', (err) => {
      send('log', `\n[ERROR] No se pudo ejecutar el comando: ${err.message}\n`);
      appendLogFile(`[ERROR] No se pudo ejecutar el comando: ${err.message}`);
      resolve({ ok: false, code: -1, error: err.message });
    });

    child.on('close', (code) => {
      send('done', code);
      appendLogFile(`== FIN${label ? ' · ' + label : ''} · código de salida: ${code} ==`);
      resolve({ ok: code === 0, code });
    });
  });
}

// ---------- Helper: reportar un error ANTES de llegar a correr un comando
// (ej. "no se encontró versión en winget", "método desconocido") — antes
// estos casos devolvían el error solo al valor de retorno de la promesa y
// nunca aparecían ni en el log de pantalla ni en el de disco, así que un
// fallo temprano se veía en la UI como "hubo un error" sin ninguna pista
// de la causa en ningún lado. Ahora siempre queda una línea explicando qué
// pasó, tanto en pantalla como en el archivo de log. ----------
function failEarly(win, channel, label, message) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, { type: 'log', data: `\n[ERROR] ${label ? label + ': ' : ''}${message}\n` });
  }
  appendLogFile(`[ERROR]${label ? ' ' + label + ':' : ''} ${message}`);
  return { ok: false, code: -1, error: message };
}

// ---------- Helper: parsear la salida tabular de winget ----------
function parseWingetTable(output) {
  const lines = output.split(/\r?\n/).map((l) => l.replace(/\r$/, ''));
  const headerIdx = lines.findIndex((l) => /\bName\b/.test(l) && /\bId\b/.test(l) && /\bVersion\b/.test(l));
  if (headerIdx === -1) return [];
  const header = lines[headerIdx];
  const cols = ['Name', 'Id', 'Version', 'Available', 'Source'];
  const positions = cols
    .map((c) => ({ c, i: header.indexOf(c) }))
    .filter((x) => x.i !== -1)
    .sort((a, b) => a.i - b.i);

  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^No installed package|^No applicable/.test(line.trim())) continue;
    if (/^\d+ (installed packages?|upgrades? available|package\(s\))/i.test(line.trim())) continue;
    const row = {};
    for (let j = 0; j < positions.length; j++) {
      const start = positions[j].i;
      const end = j + 1 < positions.length ? positions[j + 1].i : line.length;
      row[positions[j].c] = (line.slice(start, end) || '').trim();
    }
    if (row.Name || row.Id) rows.push(row);
  }
  return rows;
}

// ---------- Dependencias (winget / chocolatey) ----------
ipcMain.handle('dep:check', async (event, method) => {
  const cmd = method === 'choco' ? 'choco' : 'winget';
  return new Promise((resolve) => {
    const child = spawn(cmd, ['--version'], { shell: true, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', () => resolve({ installed: false, version: null }));
    child.on('close', (code) => {
      resolve({ installed: code === 0, version: out.trim() || null });
    });
  });
});

ipcMain.handle('dep:install', async (event, method) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (method === 'choco') {
    const psCommand =
      'Set-ExecutionPolicy Bypass -Scope Process -Force; ' +
      '[System.Net.ServicePointManager]::SecurityProtocol = ' +
      '[System.Net.ServicePointManager]::SecurityProtocol -bor 3072; ' +
      'iex ((New-Object System.Net.WebClient).DownloadString(' +
      "'https://community.chocolatey.org/install.ps1'))";
    return runStreamed(win, 'dep:stream', 'powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand,
    ], 'Instalar Chocolatey');
  }
  shell.openExternal('https://apps.microsoft.com/detail/9nblggh4nns1');
  return { ok: true, code: 0, opened: 'store' };
});

// ---------- Instalación de programas (página Programas) ----------
// mode: 'download' (solo bajar el instalador, no correrlo) |
//       'manual'   (bajar + correr el instalador SIN --silent, para que el
//                    usuario elija las opciones a mano) |
//       'auto'     (bajar + instalar silencioso con opciones default —
//                    comportamiento original de la app)
ipcMain.handle('program:install', async (event, { program, method, mode }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const installMode = mode || 'auto';

  if (method === 'winget') {
    if (installMode === 'download') {
      const settings = readSettings();
      const downloadDir = settings.downloadDir || path.join(app.getPath('downloads'), 'DeployKit');
      try {
        fs.mkdirSync(downloadDir, { recursive: true });
      } catch (err) {
        return failEarly(win, 'install:stream', program.name, `No se pudo crear la carpeta de descargas (${downloadDir}): ${err.message}`);
      }
      return runStreamed(win, 'install:stream', 'winget', [
        'download', '--id', program.winget, '-e',
        '--download-directory', downloadDir,
        '--accept-package-agreements', '--accept-source-agreements',
      ], `${program.name} · descargando (winget)`);
    }

    const args = ['install', '--id', program.winget, '-e'];
    if (installMode === 'auto') args.push('--silent');
    args.push('--accept-package-agreements', '--accept-source-agreements');
    const modeLabel = installMode === 'manual' ? 'instalando (manual)' : 'instalando';
    return runStreamed(win, 'install:stream', 'winget', args, `${program.name} · ${modeLabel} (winget)`);
  }

  if (method === 'choco') {
    // Chocolatey (edición Community/gratuita) no separa "descargar" de
    // "instalar": choco download es una feature exclusiva de Chocolatey
    // Pro/Business (licenciada), y sus paquetes están empaquetados para
    // instalar desatendido por convención, por lo que tampoco hay forma
    // confiable de forzar la UI del instalador real en modo "manual". El
    // resultado real de correr choco install es: se descarga Y se instala
    // en el mismo paso, y el instalador no queda expuesto en ninguna
    // carpeta — vive dentro de la caché interna de Chocolatey
    // (C:\ProgramData\chocolatey\lib\<paquete>\tools), no en la carpeta de
    // descargas configurada por el usuario.
    //
    // La UI (computeEffective en renderer.js) ya debería impedir llegar
    // acá con installMode !== 'auto' para choco, pero nos negamos igual
    // por las dudas (ej. algún flujo de reintento) en vez de instalar
    // silenciosamente algo que el usuario no pidió.
    if (installMode !== 'auto') {
      const reason = installMode === 'download'
        ? 'Chocolatey (edición gratuita) no soporta "solo descargar": no existe una forma de bajar el instalador sin instalarlo, y esa función no queda disponible en la edición Community.'
        : 'Chocolatey (edición gratuita) no soporta modo "manual": sus paquetes siempre se instalan desatendidos (silenciosos), no hay forma de mostrar el asistente del instalador real.';
      return failEarly(win, 'install:stream', `${program.name} (choco)`, `${reason} Instalación cancelada — elegí "AUTOMÁTICO" o cambiá a método WINGET si el programa lo soporta.`);
    }
    return runStreamed(win, 'install:stream', 'choco', ['install', program.choco, '-y'], `${program.name} · instalando (choco)`);
  }

  if (method === 'ninite') {
    shell.openExternal('https://ninite.com/');
    return { ok: true, code: 0, opened: 'ninite' };
  }
  return failEarly(win, 'install:stream', program.name, `Método desconocido: "${method}"`);
});

// ---------- Helper: comparar versiones tipo "3.12.4" / "8.0" numéricamente ----------
function compareVersions(a, b) {
  const pa = String(a).split(/[.\-_]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.\-_]/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ---------- Helper: ¿está instalado tal id vía choco? (independiente del PATH) ----------
function chocoListInstalled(id) {
  return new Promise((resolve) => {
    const child = spawn('choco', ['list', '--local-only', id], { shell: true, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', () => resolve({ installed: false, version: null }));
    child.on('close', () => {
      const row = out.split(/\r?\n/).find((l) => l.toLowerCase().startsWith(`${id.toLowerCase()} `));
      if (!row) return resolve({ installed: false, version: null });
      const version = row.trim().split(/\s+/)[1] || null;
      resolve({ installed: true, version, source: 'choco' });
    });
  });
}

// ---------- Helper: detectar una herramienta corriendo su propio comando (java -version, node --version, etc) ----------
function cliDetect(cmd, args, regexSource, filter) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: true, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString())); // java -version, dotnet, etc imprimen a stderr en algunos casos
    child.on('error', () => resolve({ installed: false, version: null }));
    child.on('close', () => {
      const regex = new RegExp(regexSource, 'i');
      const lines = out.split(/\r?\n/).filter((l) => (filter ? l.includes(filter) : true));
      let best = null;
      for (const line of lines) {
        const m = line.match(regex);
        if (m && m[1]) {
          if (!best || compareVersions(m[1], best) > 0) best = m[1];
        }
      }
      resolve(best ? { installed: true, version: best } : { installed: false, version: null });
    });
  });
}

// ---------- Helper: resolver el id de winget más reciente que matchea un prefijo ----------
function resolveLatestWinget(prefix, searchTerm) {
  return new Promise((resolve) => {
    const child = spawn('winget', [
      'search', '--id', prefix, '--source', 'winget', '--accept-source-agreements',
    ], { shell: true, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const rows = parseWingetTable(out).filter((r) => r.Id && r.Id.startsWith(prefix));
      if (rows.length === 0) return resolve(null);
      let best = rows[0];
      for (const row of rows) {
        if (compareVersions(row.Version, best.Version) > 0) best = row;
      }
      resolve({ id: best.Id, version: best.Version });
    });
  });
}

// Determina qué gestor usar para una herramienta dado el método pedido.
// Mismo criterio que computeEffective en renderer.js para Programas —
// no depende de que la UI ya lo haya filtrado, por si acaso.
function computeToolEffective(tool, method) {
  if (tool.special === 'chocolatey') return 'special';
  if (method === 'choco') return tool.choco ? 'choco' : null;
  if (method === 'winget') return (tool.winget || tool.resolvePrefix) ? 'winget' : null;
  // auto: preferir winget (más rápido, no hace falta agregar choco antes),
  // y caer a choco si la herramienta no tiene id de winget.
  if (tool.winget || tool.resolvePrefix) return 'winget';
  if (tool.choco) return 'choco';
  return null;
}

// choco no tiene un comando directo de "solo consultar la última versión
// disponible" tan cómodo como winget upgrade; "choco outdated -r" da una
// línea por paquete con formato "nombre|actual|disponible|pinned" para lo
// que ya está instalado, que es justo lo que necesitamos acá.
function chocoOutdated(id) {
  return new Promise((resolve) => {
    const child = spawn('choco', ['outdated', '-r'], { shell: true, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', () => resolve({ updateAvailable: false }));
    child.on('close', () => {
      const line = out.split(/\r?\n/).find((l) => l.toLowerCase().startsWith(`${id.toLowerCase()}|`));
      if (!line) return resolve({ updateAvailable: false });
      const parts = line.split('|');
      resolve({ updateAvailable: true, available: parts[2] || null });
    });
  });
}

// ---------- Útiles: estado / instalar / actualizar (keyed por tool.id) ----------
async function detectTool(tool, effective) {
  // 1) chequeo directo por CLI: el más confiable para herramientas de UNA
  //    sola versión posible (node, python, dotnet) — encuentra
  //    instalaciones que no vinieron de winget/choco (nvm, Store, etc).
  //    Se salta con noCliDetect en herramientas donde puede convivir más
  //    de una versión a la vez (ej. Java 8/11/17/21): ahí el PATH solo
  //    refleja UNA de ellas (la que haya quedado primera), así que este
  //    chequeo daría un resultado engañoso para las otras.
  if (tool.detectCmd && !tool.noCliDetect) {
    const res = await cliDetect(tool.detectCmd, tool.detectArgs || [], tool.detectRegex, tool.detectFilter);
    if (res.installed) return { ...res, source: 'cli' };
  }

  // 2) chequeo por el registro del gestor de paquetes correspondiente al
  //    método activo — independiente de lo que haya en el PATH ahora mismo.
  if (effective === 'choco' && tool.choco) {
    return chocoListInstalled(tool.choco);
  }

  const term = tool.resolvePrefix || tool.winget;
  if (term) {
    return new Promise((resolve) => {
      const child = spawn('winget', [
        'list', tool.searchTerm || term, '--accept-source-agreements',
      ], { shell: true, windowsHide: true });
      let out = '';
      child.stdout.on('data', (d) => (out += d.toString()));
      child.on('error', () => resolve({ installed: false, version: null }));
      child.on('close', () => {
        const prefix = tool.resolvePrefix || tool.winget;
        const rows = parseWingetTable(out).filter((r) => r.Id && r.Id.startsWith(prefix));
        if (rows.length === 0) return resolve({ installed: false, version: null });
        let best = rows[0];
        for (const row of rows) {
          if (compareVersions(row.Version, best.Version) > 0) best = row;
        }
        resolve({ installed: true, version: best.Version, source: 'winget' });
      });
    });
  }
  return { installed: false, version: null };
}

ipcMain.handle('tool:status', async (event, toolId, method) => {
  const tool = TOOLS.find((t) => t.id === toolId);
  if (!tool) return { installed: false, version: null };

  if (tool.special === 'chocolatey') {
    const res = await new Promise((resolve) => {
      const child = spawn('choco', ['--version'], { shell: true, windowsHide: true });
      let out = '';
      child.stdout.on('data', (d) => (out += d.toString()));
      child.on('error', () => resolve({ installed: false, version: null }));
      child.on('close', (code) => resolve({ installed: code === 0, version: out.trim() || null }));
    });
    return { ...res, updateAvailable: false };
  }

  const effective = computeToolEffective(tool, method || 'auto');
  const detected = await detectTool(tool, effective);
  if (!detected.installed) return { installed: false, version: null, updateAvailable: false };

  // Si el método activo es CHOCO, chequear actualizaciones vía choco en vez
  // de winget (evita golpear un winget roto solo para saber la versión).
  if (effective === 'choco') {
    const upd = await chocoOutdated(tool.choco);
    return { ...detected, ...upd };
  }

  // Si además tiene resolución dinámica, comparar contra la última disponible.
  if (tool.resolvePrefix) {
    const latest = await resolveLatestWinget(tool.resolvePrefix, tool.searchTerm);
    const updateAvailable = latest ? compareVersions(latest.version, detected.version) > 0 : false;
    return { ...detected, updateAvailable, available: updateAvailable ? latest.version : null };
  }

  if (tool.winget) {
    const upd = await new Promise((resolve) => {
      const child = spawn('winget', [
        'upgrade', '--id', tool.winget, '--exact', '--accept-source-agreements',
      ], { shell: true, windowsHide: true });
      let out = '';
      child.stdout.on('data', (d) => (out += d.toString()));
      child.on('error', () => resolve({ updateAvailable: false }));
      child.on('close', () => {
        const rows = parseWingetTable(out);
        if (rows.length === 0) return resolve({ updateAvailable: false });
        resolve({ updateAvailable: !!rows[0].Available, available: rows[0].Available || null });
      });
    });
    return { ...detected, ...upd };
  }

  return { ...detected, updateAvailable: false };
});

ipcMain.handle('tool:install', async (event, toolId, method) => {
  const tool = TOOLS.find((t) => t.id === toolId);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!tool) return failEarly(win, 'tool:stream', toolId, 'Herramienta desconocida (no está en el catálogo TOOLS).');

  if (tool.special === 'chocolatey') {
    const psCommand =
      'Set-ExecutionPolicy Bypass -Scope Process -Force; ' +
      '[System.Net.ServicePointManager]::SecurityProtocol = ' +
      '[System.Net.ServicePointManager]::SecurityProtocol -bor 3072; ' +
      'iex ((New-Object System.Net.WebClient).DownloadString(' +
      "'https://community.chocolatey.org/install.ps1'))";
    return runStreamed(win, 'tool:stream', 'powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand,
    ], `${tool.name} · instalando`);
  }

  const effective = computeToolEffective(tool, method || 'auto');

  if (effective === 'choco') {
    return runStreamed(win, 'tool:stream', 'choco', ['install', tool.choco, '-y'], `${tool.name} · instalando (choco)`);
  }

  if (effective !== 'winget') {
    return failEarly(win, 'tool:stream', tool.name, `No hay ningún método disponible para instalar esta herramienta con "${method || 'auto'}".`);
  }

  let wingetId = tool.winget;
  if (tool.resolvePrefix) {
    const latest = await resolveLatestWinget(tool.resolvePrefix, tool.searchTerm);
    if (!latest) {
      return failEarly(win, 'tool:stream', tool.name,
        `No se encontró ninguna versión disponible en winget para "${tool.resolvePrefix}". ` +
        'Puede ser que winget esté desactualizado, que la fuente "winget" no esté agregada ' +
        '(revisá con "winget source list"), que no haya conexión a internet, o que winget ' +
        'directamente no funcione en este sistema (algunas builds recortadas de Windows, como ' +
        'AtlasOS, sacan App Installer) — probá cambiando el método a CHOCO.');
    }
    wingetId = latest.id;
  }

  return runStreamed(win, 'tool:stream', 'winget', [
    'install', '--id', wingetId, '-e', '--silent',
    '--accept-package-agreements', '--accept-source-agreements',
  ], `${tool.name} · instalando (winget)`);
});

ipcMain.handle('tool:update', async (event, toolId, method) => {
  const tool = TOOLS.find((t) => t.id === toolId);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!tool) return failEarly(win, 'tool:stream', toolId, 'Herramienta desconocida (no está en el catálogo TOOLS).');

  if (tool.special === 'chocolatey') {
    return runStreamed(win, 'tool:stream', 'choco', ['upgrade', 'chocolatey', '-y'], `${tool.name} · actualizando`);
  }

  const effective = computeToolEffective(tool, method || 'auto');

  if (effective === 'choco') {
    return runStreamed(win, 'tool:stream', 'choco', ['upgrade', tool.choco, '-y'], `${tool.name} · actualizando (choco)`);
  }

  if (effective !== 'winget') {
    return failEarly(win, 'tool:stream', tool.name, `No hay ningún método disponible para actualizar esta herramienta con "${method || 'auto'}".`);
  }

  if (tool.resolvePrefix) {
    // "Actualizar" para una herramienta de última-versión = resolver de
    // nuevo el id más reciente e instalarlo (winget lo deja al día).
    const latest = await resolveLatestWinget(tool.resolvePrefix, tool.searchTerm);
    if (!latest) {
      return failEarly(win, 'tool:stream', tool.name,
        `No se encontró ninguna versión disponible en winget para "${tool.resolvePrefix}". ` +
        'Puede ser que winget esté desactualizado, que la fuente "winget" no esté agregada ' +
        '(revisá con "winget source list"), que no haya conexión a internet, o que winget ' +
        'directamente no funcione en este sistema — probá cambiando el método a CHOCO.');
    }
    return runStreamed(win, 'tool:stream', 'winget', [
      'install', '--id', latest.id, '-e', '--silent',
      '--accept-package-agreements', '--accept-source-agreements',
    ], `${tool.name} · actualizando (winget)`);
  }

  return runStreamed(win, 'tool:stream', 'winget', [
    'upgrade', '--id', tool.winget, '-e', '--silent',
    '--accept-package-agreements', '--accept-source-agreements',
  ], `${tool.name} · actualizando (winget)`);
});

// ---------- Logs en disco (accesibles / persistentes entre sesiones) ----------
ipcMain.handle('logs:open-folder', async () => {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const err = await shell.openPath(LOGS_DIR);
    return { ok: !err, error: err || null, path: LOGS_DIR };
  } catch (err) {
    return { ok: false, error: err.message, path: LOGS_DIR };
  }
});
