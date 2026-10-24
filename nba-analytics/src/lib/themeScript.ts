/**
 * Theme bootstrapping shared by the server layout and ThemeProvider.
 * Plain module (no "use client") so the server layout can inline the script.
 */
export const STORAGE_KEY = "theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Applies the saved preference (or the OS setting) before first paint — no flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}');var d=p==='dark'||(p!=='light'&&window.matchMedia('${DARK_QUERY}').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
