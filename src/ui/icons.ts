// 统一线性图标集：1.7 线宽、圆头、currentColor 着色，杜绝 emoji 图标
const wrap = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

export const ICONS = {
  cave: wrap('<path d="M3 20h18M5 20V11l7-6 7 6v9"/><path d="M9 20v-5h6v5"/>'),
  wheel: wrap('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>'),
  rind: wrap('<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5"/><circle cx="12" cy="12" r="1.4"/>'),
  brush: wrap('<path d="M15 3l6 6-9 9H6v-6z"/><path d="M11 9l4 4"/>'),
  forecast: wrap('<path d="M3 17l5-5 4 3 7-8"/><path d="M21 7v5h-5"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  camera: wrap('<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.2"/><path d="M8 7l1.5-2.5h5L16 7"/>'),
  alert: wrap('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
  check: wrap('<path d="M5 12l4 4 10-10"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  rotate: wrap('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v4h-4"/>'),
  vent: wrap('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>'),
  shelf: wrap('<path d="M4 4v16M20 4v16M4 9h16M4 15h16"/>'),
  compare: wrap('<path d="M12 4v16M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),
  trash: wrap('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
}

export type IconName = keyof typeof ICONS

export function icon(name: IconName): string {
  return ICONS[name]
}
