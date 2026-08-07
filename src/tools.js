// Herramientas de "Útiles": runtimes y piezas de entorno.
//
// Dos formas de resolver el paquete:
//  - winget: id fijo (para versiones que se piden a propósito, ej. JDK 21 LTS)
//  - resolvePrefix + searchTerm: no hay id fijo, se resuelve en caliente
//    la versión más reciente publicada en winget (ej. Python, .NET)
//
// detectCmd/detectArgs/detectRegex/detectFilter: chequeo directo por CLI
// (más confiable que winget list, porque encuentra instalaciones que no
// vinieron de winget — instalador oficial, nvm, Store, etc).

const TOOLS = [
  {
    id: 'vcredist',
    name: 'Visual C++ Redistributables',
    description: 'Todos los años en un solo paquete. Crítico para que la mayoría de los juegos y programas nativos arranquen sin error de DLL faltante.',
    winget: 'abbodi1406.vcredist',
    choco: 'vcredist-all',
  },
  {
    id: 'jdk21',
    name: 'Entorno Java',
    description: 'JDK 21 LTS (Eclipse Temurin). Configura JAVA_HOME y el PATH automáticamente durante la instalación.',
    winget: 'EclipseAdoptium.Temurin.21.JDK',
    choco: 'temurin21',
    detectCmd: 'java', detectArgs: ['-version'], detectRegex: '"(\\d+[\\d._]*)"',
  },
  {
    id: 'python',
    name: 'Python (última versión)',
    description: 'Se resuelve la versión estable más reciente publicada en winget, no una fija. Se agrega al PATH. Incluye pip.',
    resolvePrefix: 'Python.Python.3.',
    searchTerm: 'Python 3',
    // El paquete choco "python" ya de por sí sigue siempre la última 3.x
    // publicada (a diferencia de winget no hace falta resolver un id).
    choco: 'python',
    detectCmd: 'python', detectArgs: ['--version'], detectRegex: 'Python\\s+(\\d+\\.\\d+\\.\\d+)',
  },
  {
    id: 'nodejs',
    name: 'Node.js LTS',
    description: 'Runtime de JavaScript en servidor. Incluye npm.',
    winget: 'OpenJS.NodeJS.LTS',
    choco: 'nodejs-lts',
    detectCmd: 'node', detectArgs: ['--version'], detectRegex: 'v?(\\d+\\.\\d+\\.\\d+)',
  },
  {
    id: 'dotnetsdk',
    name: '.NET SDK',
    description: 'Última versión estable del SDK (incluye el runtime). Necesario para compilar proyectos .NET / .NET Core.',
    resolvePrefix: 'Microsoft.DotNet.SDK.',
    searchTerm: 'dotnet sdk',
    // Igual que con python: el paquete choco "dotnet-sdk" es flotante,
    // siempre resuelve a la última estable — no necesita búsqueda previa.
    choco: 'dotnet-sdk',
    detectCmd: 'dotnet', detectArgs: ['--list-sdks'], detectRegex: '(\\d+\\.\\d+\\.\\d+)',
  },
  {
    id: 'dotnetdesktop',
    name: '.NET Desktop Runtime',
    description: 'Última versión estable. Solo el runtime para correr apps de escritorio .NET/.NET Core (WPF, WinForms) sin instalar el SDK completo.',
    resolvePrefix: 'Microsoft.DotNet.DesktopRuntime.',
    searchTerm: 'dotnet desktop runtime',
    choco: 'dotnet-desktopruntime',
    detectCmd: 'dotnet', detectArgs: ['--list-runtimes'], detectRegex: '(\\d+\\.\\d+\\.\\d+)',
    detectFilter: 'WindowsDesktop.App',
  },
  {
    id: 'androidcli',
    name: 'Herramientas CLI de Android',
    description: 'SDK / sdkmanager sin instalar todo Android Studio. Para compilar o depurar APKs desde la terminal.',
    winget: 'Google.AndroidSDK.CommandLineTools',
    // No es 1:1 (el paquete choco instala el SDK base, no solo las
    // command-line tools), pero cubre el mismo caso de uso sin Android Studio.
    choco: 'android-sdk',
  },
  {
    id: 'chocolatey',
    name: 'Chocolatey',
    description: 'Gestor de paquetes por línea de comandos. Se usa como método alternativo a winget en toda la app (Programas y Útiles) — clave si winget no funciona en tu sistema (builds recortadas como AtlasOS suelen sacar App Installer).',
    special: 'chocolatey',
  },
];

module.exports = { TOOLS };
