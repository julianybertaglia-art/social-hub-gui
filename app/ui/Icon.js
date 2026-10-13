// Conjunto único de ícones da TidePlace (traço 1.7, 24×24).
// Substitui os símbolos de texto (◈ ⌂ ✦ ⚡…) que variavam por fonte e sistema.

const PATHS = {
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  inbox: <><path d="M4 13.5 6.5 5h11L20 13.5" /><path d="M4 13.5V19h16v-5.5h-5a3 3 0 0 1-6 0H4Z" /></>,
  funnel: <><path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5Z" /></>,
  bolt: <><path d="M13 3 5.5 13.5h5.5L10 21l8.5-10.5H13L13 3Z" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  idea: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.3 1 2.2h5.2c0-.9.4-1.7 1-2.2A6 6 0 0 0 12 3Z" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  tasks: <><path d="M10 6.5h10M10 12h10M10 17.5h10" /><path d="m3.5 6.5 1.5 1.5L7.5 5.5M3.5 12l1.5 1.5L7.5 11M3.5 17.5 5 19l2.5-2.5" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" fill="currentColor" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="m7.5 14.5 3.5-4 3 2.5L19 7" /></>,
  megaphone: <><path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  send: <><path d="M20 4 3.5 10.5l6.5 2.5 2.5 6.5L20 4Z" /><path d="m10 13 4-4" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c.7-3 3-4.8 6-4.8s5.3 1.8 6 4.8" /><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6.1M17.5 14.9c1.7.6 3 2.2 3.5 4.6" /></>,
  star: <><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 15.9l-4.9 2.7 1.1-5.3-4-3.7 5.4-.6L12 4Z" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.8 6.5" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" /></>,
  plug: <><path d="M9 3v5M15 3v5" /><path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" /><path d="M12 17v4" /></>,
  pulse: <><path d="M3 12h4l2.5-6 5 12 2.5-6h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.7 0-.9.8-1.6 1.7-1.6H17a3.5 3.5 0 0 0 3.5-3.5c0-4.2-3.8-7.5-8.5-7.5Z" /><circle cx="7.8" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.8" r="1" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  chevronRight: <><path d="m9 6 6 6-6 6" /></>,
  arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  arrowLeft: <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  instagram: <><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.8" cy="7.2" r=".7" fill="currentColor" /></>,
  whatsapp: <><path d="M4.5 19.5 5.6 16A7.8 7.8 0 1 1 8.4 18.6l-3.9.9Z" /><path d="M9.3 8.6c0 3.2 2.9 6 6 6l1-1.4-1.9-1-.8.8c-1-.4-2-1.4-2.4-2.4l.8-.8-1-1.9-1.7.7Z" /></>,
  tiktok: <><path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 4c.4 2.4 2.2 4 4.5 4.2" /></>,
  flow: <><rect x="3.5" y="4" width="6" height="5" rx="1.2" /><rect x="14.5" y="4" width="6" height="5" rx="1.2" /><rect x="9" y="15" width="6" height="5" rx="1.2" /><path d="M6.5 9v2.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V9M12 13v2" /></>,
  chat: <><path d="M5 5h14v10H9l-4 4V5Z" /></>,
  phone: <><rect x="6.5" y="3" width="11" height="18" rx="2.5" /><path d="M10.5 18h3" /></>,
  play: <><path d="M7 5v14l11-7L7 5Z" /></>,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  refresh: <><path d="M19 8a7.5 7.5 0 1 0 .8 5" /><path d="M19.5 3.5V8H15" /></>,
  logout: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></>,
  trash: <><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  sparkle: <><path d="M12 4c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z" /><path d="M18.5 15.5c.3 1.3.9 1.9 2 2-1.1.3-1.7.9-2 2-.3-1.1-.9-1.7-2-2 1.1-.1 1.7-.7 2-2Z" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4l3 2" /></>,
  flame: <><path d="M12 21c3.6 0 6-2.4 6-5.8 0-3.9-3.4-5.7-4-9.7-2.3 1.4-3.2 3.6-3 6-1-.5-1.8-1.6-2-2.9-1.9 1.6-3 3.9-3 6.6C6 18.6 8.4 21 12 21Z" /></>,
  reply: <><path d="M10 8 5 12.5l5 4.5" /><path d="M5 12.5h9a5 5 0 0 1 5 5V19" /></>,
  tag: <><path d="M4 4h7.5l8.5 8.5-7.5 7.5L4 11.5V4Z" /><circle cx="8.3" cy="8.3" r="1.3" /></>,
  layers: <><path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></>,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-2.5Z" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5" /></>,
  columns: <><rect x="3.5" y="4.5" width="5" height="15" rx="1.2" /><rect x="9.5" y="4.5" width="5" height="10" rx="1.2" /><rect x="15.5" y="4.5" width="5" height="12.5" rx="1.2" /></>,
  upload: <><path d="M12 16V4M7 8.5 12 4l5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5z" /></>,
  keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.5M10.5 10h.5M14 10h.5M17 10h.5M7 14h10" /></>,
  wave: <><path d="M3 9c2.2 0 2.2-2 4.5-2S9.7 9 12 9s2.2-2 4.5-2S18.8 9 21 9" /><path d="M3 15c2.2 0 2.2-2 4.5-2s2.2 2 4.5 2 2.2-2 4.5-2 2.3 2 4.5 2" /></>,
};

export default function Icon({ name, size = 18, className = '', title, strokeWidth = 1.7, ...rest }) {
  const content = PATHS[name] || PATHS.grid;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {content}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS);
