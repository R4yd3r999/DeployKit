// Catálogo de programas. Cada entrada define cómo se instala con cada método.
// winget/choco: id del paquete, o null si no existe paquete confiable.
// ninite: true si el programa está en el catálogo público de Ninite.
// warn: nota corta para mostrar en la UI cuando algo requiere atención.

const PROGRAMS = [
  // --- Navegadores ---
  { id: 'chrome', name: 'Google Chrome', category: 'Navegadores',
    winget: 'Google.Chrome', choco: 'googlechrome', ninite: true },
  { id: 'brave', name: 'Brave', category: 'Navegadores',
    winget: 'Brave.Brave', choco: 'brave', ninite: true },
  { id: 'operagx', name: 'Opera GX', category: 'Navegadores',
    winget: 'Opera.OperaGX', choco: 'opera-gx', ninite: false },

  // --- Comunicación ---
  { id: 'discord', name: 'Discord', category: 'Comunicación',
    winget: 'Discord.Discord', choco: 'discord', ninite: false },
  { id: 'telegram', name: 'Telegram Desktop', category: 'Comunicación',
    winget: 'Telegram.TelegramDesktop', choco: 'telegram', ninite: false },

  // --- Multimedia ---
  { id: 'vlc', name: 'VLC Media Player', category: 'Multimedia',
    winget: 'VideoLAN.VLC', choco: 'vlc', ninite: true },
  { id: 'obs', name: 'OBS Studio', category: 'Multimedia',
    winget: 'OBSProject.OBSStudio', choco: 'obs-studio', ninite: true },
  { id: 'sharex', name: 'ShareX', category: 'Multimedia',
    winget: 'ShareX.ShareX', choco: 'sharex', ninite: false },

  // --- Gaming / Hardware ---
  { id: 'steam', name: 'Steam', category: 'Gaming',
    winget: 'Valve.Steam', choco: 'steam', ninite: true },
  { id: 'cheatengine', name: 'Cheat Engine', category: 'Gaming',
    winget: null, choco: 'cheatengine', ninite: false,
    warn: 'Sin paquete oficial en winget. Verificar instalador manual como respaldo.' },
  { id: 'afterburner', name: 'MSI Afterburner', category: 'Gaming',
    winget: 'Guru3D.Afterburner', choco: null, ninite: false },
  { id: 'hwinfo', name: 'HWiNFO', category: 'Gaming',
    winget: 'REALiX.HWiNFO', choco: 'hwinfo', ninite: false },

  // --- Descargas ---
  { id: 'jdownloader', name: 'JDownloader', category: 'Descargas',
    winget: 'AppWork.JDownloader', choco: 'jdownloader', ninite: false,
    warn: 'Windows Defender puede marcarlo como potencialmente no deseado.' },
  { id: 'qbittorrent', name: 'qBittorrent', category: 'Descargas',
    winget: 'qBittorrent.qBittorrent', choco: 'qbittorrent', ninite: true },

  // --- VPN / Privacidad ---
  { id: 'protonvpn', name: 'Proton VPN', category: 'VPN',
    winget: 'Proton.ProtonVPN', choco: 'protonvpn', ninite: false },
  { id: 'windscribe', name: 'Windscribe', category: 'VPN',
    winget: 'Windscribe.Windscribe', choco: 'windscribe', ninite: false },
  { id: 'wireguard', name: 'WireGuard', category: 'VPN',
    winget: 'WireGuard.WireGuard', choco: 'wireguard', ninite: false },

  // --- Seguridad ---
  { id: 'bitwarden', name: 'Bitwarden', category: 'Seguridad',
    winget: 'Bitwarden.Bitwarden', choco: 'bitwarden', ninite: false },

  // --- Utilidades ---
  { id: 'nanazip', name: 'NanaZip', category: 'Utilidades',
    winget: 'M2Team.NanaZip', choco: null, ninite: false },
  { id: 'windowsterminal', name: 'Windows Terminal', category: 'Utilidades',
    winget: 'Microsoft.WindowsTerminal', choco: 'microsoft-windows-terminal', ninite: false },
  { id: 'everything', name: 'Everything', category: 'Utilidades',
    winget: 'voidtools.Everything', choco: 'everything', ninite: true },
  { id: 'powertoys', name: 'PowerToys', category: 'Utilidades',
    winget: 'Microsoft.PowerToys', choco: 'powertoys', ninite: true },
  { id: 'rufus', name: 'Rufus', category: 'Utilidades',
    winget: 'Rufus.Rufus', choco: 'rufus', ninite: false },
  { id: 'notepadpp', name: 'Notepad++', category: 'Utilidades',
    winget: 'Notepad++.Notepad++', choco: 'notepadplusplus', ninite: true },
  { id: 'recuva', name: 'Recuva', category: 'Utilidades',
    winget: 'Piriform.Recuva', choco: 'recuva', ninite: false },

  // --- Desarrollo ---
  { id: 'vscode', name: 'VS Code', category: 'Desarrollo',
    winget: 'Microsoft.VisualStudioCode', choco: 'vscode', ninite: true },
  { id: 'githubdesktop', name: 'GitHub Desktop', category: 'Desarrollo',
    winget: 'GitHub.GitHubDesktop', choco: 'github-desktop', ninite: false },
  { id: 'androidstudio', name: 'Android Studio', category: 'Desarrollo',
    winget: 'Google.AndroidStudio', choco: 'androidstudio', ninite: false },
];

module.exports = { PROGRAMS };
