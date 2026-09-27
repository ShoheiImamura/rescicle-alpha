// ドキュメントの閲覧用サイト。`npx vitepress dev docs` で起動する（アプリには含めない）。
// package.json に "type": "module" が無いので、設定は .mts にして ESM として読ませる。
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type DefaultTheme } from 'vitepress'
import { copyGenerated, embeddedImage, figureLocations, generatedUrl, repoRoot, serveGenerated } from './design'

const figures = figureLocations()

// 直下の NN-*.md を番号順に並べる。v<版>/ の下があればその版だけの文書として続ける。番号は全体で重ならない。
function docItems(sub: string): DefaultTheme.SidebarItem[] {
  const dir = path.join(repoRoot, 'docs', sub)
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d\d-.*\.md$/.test(f))
    .sort()
    .map((f) => {
      const title = /^# (.+)$/m.exec(fs.readFileSync(path.join(dir, f), 'utf-8'))?.[1] ?? f
      return { text: `${f.slice(0, 2)} ${title.replace(/`/g, '')}`, link: `/${sub ? sub + '/' : ''}${f.replace(/\.md$/, '')}` }
    })
}

function docsSidebar(): DefaultTheme.SidebarItem[] {
  const versions = fs
    .readdirSync(path.join(repoRoot, 'docs'))
    .filter((d) => /^v\d/.test(d))
    .sort()
  return [
    ...docItems(''),
    ...versions.map((v) => ({ text: v, collapsed: false, items: docItems(v) })),
  ]
}

// docs/ と design/ はリポジトリ上の相対リンクで互いを指す。サイト上の URL に読み替える。
//   ../design/README.md → /design/、../design/<dir>/<name>.puml → その図を載せた文書の位置、
//   ../docs/<file>.md（design/README.md 内）→ /<file>
function rewriteRepoLink(href: string): string {
  const m = /^(?:\.\.\/)+(docs|design)\/([^#]*?)(#.*)?$/.exec(href)
  if (!m) return href
  const [, top, rest = '', hash = ''] = m
  if (top === 'docs') return `/${rest.replace(/\.md$/, '')}${hash}`
  if (rest === '' || rest === 'README.md') return `/design/${hash}`
  const fig = /^[^/]+\/([^/]+)\.puml$/.exec(rest)
  return (fig && figures.get(fig[1]!)) ?? href
}

// docs は `records.<kind>` や `<port>` のような占位記法を地の文に書く。
// HTML の要素名でないタグは Vue が要素として解釈して壊れるので、文字として出す。
const htmlTags = new Set(
  'a abbr b blockquote br code dd del details div dl dt em h1 h2 h3 h4 h5 h6 hr i img kbd li ol p pre s small span strong sub summary sup table tbody td th thead tr u ul'.split(' '),
)
const isPlaceholderTag = (html: string) => {
  const name = /^<\/?([A-Za-z][\w-]*)/.exec(html)?.[1]
  return name !== undefined && !htmlTags.has(name.toLowerCase())
}

export default defineConfig({
  lang: 'ja',
  title: 'rescicle docs',
  description: 'rescicle の設計ドキュメントと図',
  rewrites: { 'README.md': 'index.md' },
  lastUpdated: false,
  // リポジトリ直下（../README.md など）はサイトの外。GitHub 上で読むためのリンクとして残す
  ignoreDeadLinks: [/^\.\.\/(?!design\/)/],
  vite: { plugins: [serveGenerated()] },
  buildEnd: (site) => copyGenerated(site.outDir),
  markdown: {
    config(md) {
      md.core.ruler.after('inline', 'rescicle-repo-links', (state) => {
        const tokens = state.tokens
        // 段落 1 つが埋め込み画像 1 枚だけなら、モーダル付きの図（theme/index.ts）にする
        tokens.forEach((block, i) => {
          const img = block.type === 'inline' && block.children?.length === 1 ? block.children[0] : undefined
          const m = img?.type === 'image' ? embeddedImage.exec(img.attrGet('src') ?? '') : null
          if (!img || !m || tokens[i - 1]?.type !== 'paragraph_open') return
          const alt = md.utils.escapeHtml(img.content)
          const url = generatedUrl(path.join(repoRoot, 'design', 'generated', m[1]!))
          tokens[i - 1]!.hidden = true
          tokens[i + 1]!.hidden = true
          const html = new state.Token('html_inline', '', 0)
          // :src にするのは、Vue / Vite に import として解決させず URL のまま出すため
          html.content = `<div class="diagram" id="${m[2]}"><img :src="'${url}'" alt="${alt}"><div class="diagram-caption">${alt}</div></div>`
          block.children = [html]
        })
        for (const block of tokens) {
          if (block.type === 'html_block' && isPlaceholderTag(block.content)) {
            block.type = 'code_block'
          }
          for (const t of block.children ?? []) {
            if (t.type === 'html_inline' && isPlaceholderTag(t.content)) t.type = 'text'
            if (t.type !== 'link_open') continue
            const href = t.attrGet('href')
            if (href) t.attrSet('href', rewriteRepoLink(href))
          }
        }
      })
    },
  },
  themeConfig: {
    sidebar: [{ text: '目次', link: '/' }, ...docsSidebar()],
    outline: { level: 'deep', label: '見出し' },
    search: { provider: 'local' },
    docFooter: { prev: '前', next: '次' },
    darkModeSwitchLabel: '表示',
    sidebarMenuLabel: 'メニュー',
    returnToTopLabel: '先頭へ',
  },
})
