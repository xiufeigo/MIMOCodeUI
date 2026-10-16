import { type Component } from "solid-js"
import { Globe } from "lucide-solid"

/**
 * 右栏「浏览器」段：未接入态。
 * 项目里没有内嵌 webview 实现，这里只给出明确的说明，
 * 不用 iframe / webview 伪造一个假的浏览器。
 */
export const BrowserSection: Component = () => (
  <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
    <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-raised)] text-[var(--text-muted)]">
      <Globe size={18} />
    </span>
    <p class="text-xs text-[var(--text-secondary)]">内嵌浏览器尚未接入</p>
    <p class="max-w-[16rem] text-[10px] leading-relaxed text-[var(--text-muted)]">
      当前客户端还没有网页预览能力（缺少 webview 通道），因此这里保留入口占位，不提供实际浏览。
    </p>
    <span class="rounded-md border border-[var(--border-color)] bg-[var(--bg-raised)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
      敬请期待
    </span>
  </div>
)
