// 运行平台检测：区分桌面 / 平板 / 手机，安卓版只连云端服务器。

export type AppPlatform = "windows" | "macos" | "linux" | "android" | "ios" | "browser" | "unknown"

/** 浏览器环境下的兜底检测（主要用于开发调试）。 */
export function detectBrowserPlatform(): AppPlatform {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return "android"
  if (/iphone|ipad|ipod/i.test(ua)) return "ios"
  if (/windows/i.test(ua)) return "windows"
  if (/mac os/i.test(ua)) return "macos"
  if (/linux/i.test(ua)) return "linux"
  return "browser"
}

export function isMobilePlatform(platform: AppPlatform): boolean {
  return platform === "android" || platform === "ios"
}
