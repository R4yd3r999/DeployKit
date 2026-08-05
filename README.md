# DeployKit

App de escritorio (Electron) con tres secciones:

- **Programas** — catálogo con categorías, selección múltiple, 3 modos de
  instalación (Solo descargar / Manual / Automático) e instalación
  secuencial vía winget / chocolatey / ninite, con log en vivo.
- **Útiles** — runtimes de desarrollo (Visual C++ Redistributables, JDK 21,
  Python 3.12, Node.js LTS, Android CLI Tools, Chocolatey) con detección de
  versión instalada, aviso de actualización disponible, e instalar/actualizar
  por separado. Debajo, tarjetas "Informativas" con la hoja de ruta de
  instalación limpia + AtlasOS.
- **Configuraciones** — 3 temas visuales completos (Stealth Red, Cryo Blue,
  Wraith Purple, persistidos entre sesiones), carpeta de descargas
  configurable (persistida en `settings.json`, sobrevive a updates de la
  app), y exportar/importar el perfil de selección de la página Programas.

## Los 3 modos de instalación (página Programas)

- **Solo descargar** — baja el instalador a la carpeta que configuraste en
  Configuraciones → Personalización, sin correrlo. Usa el comando nativo
  `winget download --id <id> --download-directory <carpeta>`. **Solo
  funciona con el método winget** — Chocolatey (edición gratuita) no separa
  "descargar" de "instalar" (no hay flag universal para eso en paquetes
  comunitarios), así que en este modo las tarjetas que solo tienen choco o
  ninite quedan atenuadas/no seleccionables, igual que cuando un método no
  está soportado.
- **Manual** — corre `winget install` **sin** `--silent`, así que se ve la
  ventana real del instalador y elegís las opciones vos. La cola espera a
  que cierres ese instalador antes de seguir con el siguiente (el
  `child_process` no devuelve el control hasta que el proceso termina, sea
  interactivo o no). Ojo: si cancelás el instalador en vez de completarlo,
  la tarjeta puede igual marcar error o éxito según el código de salida que
  devuelva ese instalador puntual — no hay forma de verificar "instalación
  realmente completa" más allá de eso.
- **Automático** — el comportamiento original: `--silent` con las opciones
  por defecto, sin intervención. Es best-effort: si un paquete de winget no
  tiene switches de instalación silenciosa bien definidos en su manifiesto,
  puede igual mostrar su instalador (no es algo que la app pueda forzar,
  depende de cómo esté empaquetado cada programa en el repositorio de
  winget).

## Requisitos

- Node.js 18+ → https://nodejs.org
- Windows 10 (1809+) u 11
- Correr como **administrador** para instalar con Chocolatey o paquetes de
  alcance "machine" (el `.exe` empaquetado ya pide elevación automáticamente)

## Instalación y ejecución (modo desarrollo)

```bash
cd deploykit
npm install
```

Si tu npm bloquea el postinstall de Electron (mensaje "installer scripts
blocked"/"not covered by allowScripts"), es una protección nueva de npm —
aprobalo así:

```bash
npm install-scripts approve electron
npm rebuild electron
```

Después:

```bash
npm start
```

## Generar el .exe distribuible

```bash
npm run dist
```

Usa `electron-builder`, ya con el ícono (`build/icon.ico`) y la elevación de
administrador configurados en `package.json`. El instalador queda en `dist/`.

## Estructura

- `main.js` — proceso principal: ventana, IPC, corre winget/choco/powershell
  vía `child_process.spawn`, parsea la salida tabular de `winget list` /
  `winget upgrade` para saber versión instalada y si hay actualización,
  maneja diálogos nativos de exportar/importar perfil, y persiste
  configuración (tema) en `app.getPath('userData')/settings.json`.
- `preload.js` — puente seguro (`contextBridge`) entre el renderer y Node.
- `src/programs.js` — catálogo de la página Programas.
- `src/tools.js` — catálogo de la página Útiles.
- `src/index.html` / `styles.css` / `renderer.js` — interfaz: nav lateral
  con hamburguesa, las 3 páginas, y la terminal de logs (global, compartida
  por las tres).
- `build/icon.png` / `build/icon.ico` — ícono de la app.

## Decisiones y limitaciones a tener en cuenta

- **Progreso real vs. estimado** (página Programas): la barra lee porcentajes
  del texto que imprime winget/choco. Si el instalador no imprime porcentaje,
  queda en modo indeterminado (animación de vaivén) en vez de inventar un
  número.
- **Detección de versión / actualización** (página Útiles): usa dos
  estrategias en cascada — primero corre el propio comando de la
  herramienta (`python --version`, `java -version`, `node --version`,
  `dotnet --list-sdks`/`--list-runtimes`), porque es lo único que detecta
  instalaciones que **no** vinieron de winget (instalador oficial, nvm,
  Store, etc.) — este era justo el bug reportado ("tengo Python pero dice
  que no está"). Si el CLI no responde, cae a revisar `winget list` como
  respaldo. Está aislado en `detectTool()` / `cliDetect()` en `main.js`.
- **Python y .NET no están pineados a una versión fija**: en vez de un id
  de winget fijo, se resuelve en caliente cuál es la versión más reciente
  publicada (`resolveLatestWinget()`, corre `winget search --id <prefijo>`
  y compara versiones numéricamente) y esa es la que se instala/actualiza.
  JDK sí sigue fijo en 21 LTS porque lo pediste a propósito (LTS, no
  "la última").
- **Limitación real a tener en cuenta**: si la app acaba de instalar algo
  que se agrega al PATH (Python, Node, .NET), el chequeo por CLI puede
  seguir sin verlo hasta reiniciar la app — el proceso de Electron ya
  arrancó con el PATH viejo cargado en memoria. El respaldo por `winget
  list` cubre ese hueco mientras tanto.
- **Chocolatey en Útiles** es un caso especial: no tiene id de winget, así
  que reutiliza el flujo de instalación por PowerShell y su propio comando
  de actualización (`choco upgrade chocolatey -y`).
- **Ninite**: sin API pública para generar un instalador combinado por
  código (confirmado contra su propia documentación). Elegir "Ninite" como
  método en Programas abre `ninite.com` para armar el combo a mano con los
  programas de su catálogo (badge "N" en cada tarjeta).
- **IDs de winget/choco**: verificados a la fecha de este proyecto,
  incluyendo la corrección de NanaZip a `M2Team.NanaZip` (id correcto) y el
  agregado de `Microsoft.WindowsTerminal`. Si algo falla con "no encontrado",
  correr `winget search "<nombre>"` para confirmar el id actual.
- **Temas**: son variables CSS (`--accent`, `--bg-*`, `--radius`, etc.) más
  algunas reglas estructurales por tema (Stealth Red usa corner-brackets tipo
  mira táctica y esquinas anguladas; Cryo Blue usa subrayado inferior y
  esquinas redondeadas; Wraith Purple usa barra lateral izquierda) — no es
  solo un cambio de color plano.

## Próximos pasos sugeridos

- Reintentar por lote (reintentar todos los que fallaron en una tanda, no
  solo de a uno).
- Un ícono distinto por categoría/programa en vez de solo texto.
- Barra de progreso real también para Útiles (hoy solo Programas la tiene).
