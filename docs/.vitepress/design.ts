// design/ の図を docs サイトに出す。描画は design/build.sh の生成物（design/generated/<dir>/<name>.svg）を
// そのまま使い、ここでは PlantUML を描画しない。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const designDir = path.join(repoRoot, 'design')

// docs の本文は図を ![伝えること](../design/generated/<dir>/<name>.svg) で埋め込む（GitHub でもそのまま見える）。
// サイトでは同じ画像をモーダル付きの図にし、design/<dir>/<name>.puml へのリンクは図を載せた文書の位置へ飛ばす。
export const embeddedImage = /^(?:\.\.\/)+design\/generated\/([^/]+\/([^/]+)\.(?:svg|png))$/

/** 図の名前 → 載せている文書の URL（/<page>#<name>） */
export function figureLocations(): Map<string, string> {
  const docsDir = path.join(repoRoot, 'docs')
  const found = new Map<string, string>()
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && e.name !== 'design') walk(p)
      } else if (/^\d\d-.*\.md$/.test(e.name)) {
        const page = '/' + path.relative(docsDir, p).split(path.sep).join('/').replace(/\.md$/, '')
        for (const m of fs.readFileSync(p, 'utf-8').matchAll(/\]\(((?:\.\.\/)+design\/generated\/[^)]+)\)/g)) {
          const name = embeddedImage.exec(m[1]!)?.[2]
          if (name && !found.has(name)) found.set(name, `${page}#${name}`)
        }
      }
    }
  }
  walk(docsDir)
  return found
}

// 生成物はページから相対 import せず、/design-generated/ で配る（dev は middleware、build は出力へコピー）。
// 相対パスで参照すると build では解決されるが、dev では docs/ の外を指すため壊れる。
const generatedDir = path.join(designDir, 'generated')
const generatedPrefix = '/design-generated/'

export function generatedUrl(file: string): string {
  return generatedPrefix + path.relative(generatedDir, file).split(path.sep).join('/')
}

const contentTypes: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png' }

export function serveGenerated() {
  return {
    name: 'rescicle-design-generated',
    configureServer(server: { middlewares: { use: (prefix: string, fn: (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use(generatedPrefix, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]!)
        const file = path.join(generatedDir, rel)
        if (!file.startsWith(generatedDir + path.sep) || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', contentTypes[path.extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export function copyGenerated(outDir: string) {
  fs.cpSync(generatedDir, path.join(outDir, generatedPrefix), { recursive: true })
}
