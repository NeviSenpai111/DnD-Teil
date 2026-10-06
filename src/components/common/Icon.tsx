import type { SVGProps } from "react";

/** 24×24 outline paths, drawn with a 1.5px stroke (see DESIGN.md §4). */
const PATHS = {
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  "arrow-left": "M19 12H5m6-6l-6 6 6 6",
  "arrow-right": "M5 12h14m-6-6l6 6-6 6",
  "arrow-up": "M12 19V5m-6 6l6-6 6 6",
  "arrow-up-right": "M7 17L17 7M8 7h9v9",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  import: "M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3",
  folder: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  dice: "M5 4.5h14a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  sword: "M14.5 4.5H19.5V9.5L9 20l-2.5-2.5L17 7M4.5 15.5l4 4M3.5 20.5l2-2",
  shield: "M12 3.5l7 2.5v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  pack: "M8 7V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V7M6.5 7h11a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 13h6",
  alert: "M12 4l9 15.5H3zM12 10v4M12 17h.01",
  book: "M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.3c1.8.8 3 2.7 3 5.7",
  print: "M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7z",
  download: "M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7",
  copy: "M9 9h10v10H9zM5 15V5h10",
  edit: "M14.5 5.5l4 4L8 20H4v-4zM12.5 7.5l4 4",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  palette: "M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.6-.7 1.6-1.5 0-.4-.15-.75-.4-1.05-.25-.3-.4-.65-.4-1.05 0-.85.7-1.55 1.55-1.55h1.9a4.25 4.25 0 0 0 4.25-4.25C20.5 6.9 16.7 3.5 12 3.5zM7.5 12.5h.01M9 8.5h.01M13.5 7.5h.01M17 10h.01",
  // Twenty-sided die seen face-on: the brand sigil.
  sigil: "M12 2.5l8.25 4.75v9.5L12 21.5l-8.25-4.75v-9.5zM12 6.25L18 16H6zM12 2.5v3.75M3.75 7.25L12 6.25l8.25 1M3.75 7.25L6 16l-2.25.75M20.25 7.25L18 16l2.25.75M6 16l6 5.5 6-5.5",
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative outline icon; label it with `aria-label` + `role="img"` when it carries meaning. */
export function Icon({ name, className = "h-4 w-4", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
