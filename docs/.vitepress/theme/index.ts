import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'

// 図はページ幅に縮めて表示する。クリックで同じタブのモーダルに開く。
// モーダルは最初は画面に収め、図のクリックか「原寸」で原寸に切り替える（原寸はドラッグで動かせる）。
// Esc・背景のクリック・× で閉じる。
function setupDiagramViewer() {
  const dialog = document.createElement('dialog')
  dialog.className = 'diagram-viewer'
  dialog.innerHTML = `
    <div class="dv-bar">
      <span class="dv-title"></span>
      <button type="button" class="dv-zoom"></button>
      <button type="button" class="dv-close" aria-label="閉じる">×</button>
    </div>
    <div class="dv-stage"><img alt=""></div>`
  document.body.appendChild(dialog)
  const title = dialog.querySelector<HTMLElement>('.dv-title')!
  const zoom = dialog.querySelector<HTMLButtonElement>('.dv-zoom')!
  const stage = dialog.querySelector<HTMLElement>('.dv-stage')!
  const img = stage.querySelector('img')!

  const setActual = (actual: boolean) => {
    dialog.classList.toggle('actual', actual)
    zoom.textContent = actual ? '全体' : '原寸'
  }

  document.addEventListener('click', (e) => {
    const src = (e.target as HTMLElement).closest('.diagram img')
    if (!(src instanceof HTMLImageElement)) return
    img.src = src.currentSrc || src.src
    img.alt = src.alt
    title.textContent = src.alt
    setActual(false)
    dialog.showModal()
    stage.scrollTo(0, 0)
  })
  zoom.addEventListener('click', () => setActual(!dialog.classList.contains('actual')))
  dialog.querySelector('.dv-close')!.addEventListener('click', () => dialog.close())
  // 背景（ステージの余白）のクリックで閉じる。ドラッグの終わりは除く
  let dragged = false
  stage.addEventListener('click', (e) => {
    if (dragged) return
    if (e.target === img) {
      // クリックした位置を中心に原寸へ
      if (!dialog.classList.contains('actual')) {
        const r = img.getBoundingClientRect()
        const fx = (e.clientX - r.left) / r.width
        const fy = (e.clientY - r.top) / r.height
        setActual(true)
        stage.scrollTo(fx * img.naturalWidth - stage.clientWidth / 2, fy * img.naturalHeight - stage.clientHeight / 2)
      } else {
        setActual(false)
      }
    } else if (e.target === stage) {
      dialog.close()
    }
  })

  // 原寸のときはドラッグで動かす
  let start: { x: number; y: number; left: number; top: number } | null = null
  stage.addEventListener('pointerdown', (e) => {
    dragged = false
    if (!dialog.classList.contains('actual') || e.button !== 0) return
    start = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop }
    e.preventDefault()
  })
  window.addEventListener('pointermove', (e) => {
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true
    stage.scrollTo(start.left - dx, start.top - dy)
  })
  window.addEventListener('pointerup', () => (start = null))
}

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof window === 'undefined') return
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupDiagramViewer)
    else setupDiagramViewer()
  },
} satisfies Theme
