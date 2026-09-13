/**
 * 主题：三态偏好（跟随系统 / 浅色 / 深色），持久化到 localStorage。
 *
 * 用内联脚本在 <head> 中同步执行，避免首帧闪烁（FOUC）；
 * localStorage 键与 lib/theme.ts 保持一致。
 */
export const THEME_KEY = "crac-practice:theme";

/** 供 <head> 内联执行：根据偏好给 <html> 加上/移除 dark class */
export const themeInitScript = `(function(){try{
var p=localStorage.getItem(${JSON.stringify(THEME_KEY)})||'system';
var m=window.matchMedia('(prefers-color-scheme: dark)').matches;
var dark=p==='dark'||(p==='system'&&m);
document.documentElement.classList.toggle('dark',dark);
document.documentElement.dataset.theme=p;
}catch(e){}})();`;
