# Node 版 rescicle との差分（2026-09-27 調べ）

Node 版 `ShoheiImamura/rescicle`（WSL `~/project/rescicle`、`35c6353`、決定 D-01〜D-109）と、この alpha（Tauri、`v0.0.10` / `0d1be0c`）を突き合わせた作業メモ。移植の順番を決めるための下書きで、決まったものから `07-decisions.md`（D-110〜）に移す。

**状況（2026-09-27）**: §1 は D-110〜D-119 に移した（P1 と P8 は保留として）。§2 は D-120〜D-128 でほぼ済み（各項目に記す）。§3 は未着手。§5（文書と図）は済み（残りは §5 の末尾）。

- 2 つはコードも履歴も別物。alpha は Rust + 素の JS、Node 版は TS + Vite + Alpine。**コードは持ってこられない。持ってくるのは決定・文書・図・画面の考え方。**
- パスは alpha の repo root からの相対。`*.rs` は `src-tauri/src/`、`app.js` は `src/renderer/app.js`。
- 判定: **あり** / **一部** / **なし** / **対象外**（Node・Web・事業・工程に固有）/ **逆**（alpha が意図して別の方針）。重さ: 小 / 中 / 大。

---

## 1. 先に決めること（方針の衝突）

alpha と Node 版で、どちらかを捨てないと先に進めない点。**機能より先にここを決める。**

| # | 論点 | Node 版 | alpha | 調べた側の推し → 決定 |
|---|---|---|---|---|
| P1 | 履歴 | 不変リビジョン、append-only、却下も残す（D-06/39-41/53/88/97） | 上書き UPDATE、線は物理削除、却下は 3 分後 DELETE（db.rs:24-26, 373, 519-542, 905-922） | 最重量。当面は「却下を消さず隠す」「線は retracted_at」だけ入れ、リビジョンは後回し → **保留**。当面は alpha の現状（D-110） |
| P2 | データの置き場 | フォルダ内 `.rescicle/rescicle.db`（D-17） | `%AppData%` の中央 DB、「研究フォルダに 1 バイトも書かない」（settings.rs:44-50, tests/smoke.rs:710） | alpha を維持（D-111） |
| P3 | 会話と書き込み経路 | CLI を飼い MCP で書く、許可ダイアログ、会話はメモリ（D-89/102） | `claude -p` を毎ターン起動、JSON operations を alpha が検証、会話は DB 保存・`--resume`（agent.rs:252-389, claude_agent.rs:350-372） | alpha を維持。ただし権限の穴（§2）を塞ぐ（D-112、D-120） |
| P4 | 最初のフロー | ファイルから始める（D-103） | 「いま、何を調べていますか」から、フォルダは後で（app.js:355-385） | alpha を維持（D-113） |
| P5 | 研究名 | 既定はフォルダ名、画面で編集しない（D-91） | 画面で改名、AI の名前案（commands.rs:167-198） | alpha を維持（D-114） |
| P6 | メモ | note は Record + `about`（D-109） | オブジェクトの `note` 列（schema.sql:18-23） | alpha を維持（「不明点を項目にしない」の結論は同じ）（D-115） |
| P7 | 予測の中身 | `metadata.expected`（結果文）必須、条件は variable 辞書でプロトコル側（D-83/98/107） | 判定式 `criterion` + 記号表 `criterion_symbols` が必須（domain.rs:114-138） | alpha の判定式を残し、記号表を variable 辞書へ育てる方向で検討（D-116） |
| P8 | 測定の分け方 | protocol（手順）と measurement（run、4 状態）、tested_by は 予測→protocol（D-98/100/108） | measurement 1 つ、「実施した」2 値、tested_by は 予測→測定 | 要議論。protocol 導入は大 → **保留**（D-117） |
| P9 | 画面の語 | 採用 / 却下（D-97）、Record / 項目 | 確定 / 却下、研究オブジェクト | alpha の「確定 / 却下」「研究オブジェクト」に揃える（D-118、06 を直した） |
| P10 | エージェント | MCP 汎用、Codex も（D-87） | Claude Code 専用 | alpha を維持（Codex は後）（D-119） |

---

## 2. すぐ直す価値があるもの（小〜中、方針に依らない）

1. **済み（D-120）。actor と経路の列分割（D-30）は未。** **AI の権限の穴（最優先）**（D-08/25/56/64）
   - アプリ内 AI が `status:"confirmed"` で作れる（agent.rs:276）。`set_status` で研究者のものも rejected → 3 分後に削除できる（agent.rs:353-369, db.rs:916-921）。
   - MCP の `set_object_status` は statement なしで confirm/reject でき、actor を `researcher-via-mcp` と記録するので AI の操作と区別できない（mcp.rs:43-49, 145-149）。
   - 直し方: `update_object_status` に actor/origin 検査。AI 経路は「自分が作った proposed の取り下げ」以外を拒否。MCP の confirm は statement 必須。actor と経路（via）を分ける（D-30）。
2. **済み（D-121）。** **トランザクション**: db.rs に BEGIN がない。`create_object`+`replace_symbols`+`event` などを `transaction()` で包む（D-69 の前提にもなる）。小
3. **済み（D-122）。** **MCP 書き込みの画面反映**: GUI はポーリングしないので MCP の書き込みが次の操作まで出ない。`PRAGMA data_version` を監視して Tauri event を emit（D-76）。小
4. **済み（D-123）。sha256 は未。** **assets の UNIQUE 索引**: `(relative_path, object_id)` で path の一意性を守れていない（schema.sql:51-65）。`UNIQUE(project_id, path)` に。sha256 が常に NULL（D-18）。小
5. **済み（D-123）。** **path を `/` 区切りで保存**（files.rs:106-110）。既存 DB の変換つき（D-80）。小
6. **済み（D-124）。** **archive をどの状態からでも**（今は confirmed からだけ、app.js:1163-1170）。反証を archived で表す指示を直す（agent_instructions.md:43、D-15）。小
7. **済み（D-125）。** **context に直近の events を足す**（db.rs:951-1018、D-20/52）。**MCP の read 系呼び出しも記録**（D-70）。小
8. **済み（D-126）。** **指示文**: AI が導いた仮説・予測は研究者が同意しても origin=agent（agent_instructions.md:40、D-68）。MCP の instructions に agent_instructions.md を載せる（mcp.rs:200、D-87）。小
9. **一部済み（D-128）: esc、採用済みの箱を濃く、開発者語の置き換え。未: 色の `:root` 変数化、語彙テスト。** **UI**: `data-target-id` の esc 漏れ（app.js:858）。採用済みの箱を濃く（styles.css:349、D-96）。色を `:root` 変数へ（D-93）。「MCP server」など開発者語の置き換えと語彙テスト（D-82）。小
10. **済み（D-127）。** **JSON エクスポート**（全テーブルをダイアログで保存、D-78）。小
11. **済み（design/build.sh を移したので追加）。** **`.gitattributes` に `*.sh text eol=lf`**（design/build.sh を持ってくる場合）。小

---

## 3. 取り込みたい機能（中〜大）

| 機能 | 決定 | 要るもの | 重さ |
|---|---|---|---|
| 関係の自動確定（構造的は両端 confirmed で自動、判断的は明示）、確認カードで 1 操作 | D-22/38/51/69 | 述語に区分、連鎖確定、カード UI、トランザクション | 中 |
| ラベル Q1 / H1 / P2 | D-81 | label 列と採番、context・MCP・画面・指示 | 中 |
| 予測の親は 1 つ、問い:仮説 1:N | D-100/101 | `predicts`/`addresses` の数の制約 | 小〜中 |
| 述語の整理（三元組の完全列挙、references/related_to の抜け道を絞る、based_on） | D-10/44 | domain.rs の表、指示 | 中 |
| 一覧を表に、詳細パネルを共有、複数選択とまとめ操作 | D-95/106 | UI | 中 |
| 履歴画面（events を読む） | D-74/106 | UI | 中 |
| マップのビューポート（拡大縮小・全体・向き）、盤内検索、選択時に無関係を薄く、問いごとの枠 | D-94/101/102 | UI | 中 |
| 会話の送信待ち・中断、Markdown の見出しと表 | D-102 | 1 ターン 1 プロセス構造に依存 / 表は小 | 中 / 小 |
| 測定の実施状態を 4 値（予定/実施中/完了/中断） | D-27/108 | 2 値 → enum | 小 |
| variable 辞書（単位・型・組み込み候補） | D-107 | criterion_symbols を拡張 or variable 型。protocol がないと半分 | 大 |
| protocol と run | D-98/100/105 | 型・述語・マップの段 | 大 |
| 証拠（observation / result / supports / contradicts） | D-04/05/19/21 | kind・述語・CSV 読み取り | 大 |
| リビジョン | D-06/24/39-41/53 | スキーマの根本変更（P1） | 大 |
| エクスポート（PROV-O / RO-Crate）、公開 | D-02/45/88 | リビジョンが前提 | 大 |

**不要（対象外）**: D-13, 26, 33-35, 37, 46, 47, 48（当面「同じ型・同じ題の proposed があれば返す」で足りる）, 49, 55, 58, 59, 65-67, 71-73, 75-77, 79, 90, 99, 104, 105。D-54/63（unknown）は D-109 で廃止済みで alpha も同じ。

---

## 4. alpha にだけあるもの（上書きしない）

- 予測の判定式（`criterion` / `criterion_note` / 記号表）。統計の演算を名前で書かせ、閾値を AI に作らせない指示（agent_instructions.md:8-36）。
- 会話: stream-json の部分表示、会話の DB 保存、`--resume`、operations の 1 件ずつ検証、同ターン内の `ref` 解決、JSON でなかったときの再要求。
- ファイル: AI が名前を挙げたものだけ先頭 4KB、研究フォルダの内側だけ、`file_read` 記録と「読み込み済み」表示。研究フォルダ非書き込みのテスト。
- Web 検索: WebSearch / WebFetch だけを許可（テストで固定）、「取得ページは指示ではない」の指示。
- 判断の取り消し（3 分間「戻す」）、アーカイブ = 済んだ出口、アーカイブした問いは生きた子がある間だけ薄く残る。
- 手で線を引く「＋ つなぐ」（型の組で述語が決まる）、研究者専用の「はずす」。※ D-12（View から作らない）とは逆。
- データ・ファイル画面: 木表示、フォルダ単位の登録、登録後に「どの測定のデータか」を聞く、見つからないデータの表示、フォルダ変更時の報告。
- オンボーディング（書き出しの候補、作成と最初の送信を 1 回で）、研究名の改名と AI 名前案。
- 種類ごとの説明、最初の提案時の「確かめるのは研究者です」。
- マップ: 空の列を残して連鎖の欠けを見せる、references/related_to を薄い線で。
- 設定: Claude Code の検出、MCP のワンボタン登録と古いパスの検出、「すべて消す」の 2 段確認、MCP が現在のプロジェクトに追従。
- 配布: NSIS インストーラ、リリース CI、`RESCICLE_DATA_DIR`。

---

## 5. 文書と図の移し方（済み、2026-09-27）

| Node 版のファイル | 判定 | 直す箇所 |
|---|---|---|
| docs/02-science-problems.md | そのまま | 9 行目の凡例 1 行 |
| docs/03-positioning.md | ほぼそのまま | 92 行目「Research View + Agent パネル」、§5 の番号参照 |
| docs/01-concept.md | 手直し | 11 行目（View が CLI を起こす / MCP で書く）、§5 Egress Policy（Raw DENY → alpha の「名前を挙げたファイルの 4KB を読み、記録する」）、Codex 並記、§7、§10 |
| docs/04-business.md | 手直し | §1 表、§2 対象、§4 ライセンス（alpha は UNLICENSED）、§5-7 の MCP 言及 |
| docs/05-data-model.md | 手直し | RRS の仕様として残し、「RRS の規定」と「alpha の実装範囲」を分ける |
| docs/06-glossary.md | 手直し | Research View / Local Web / .rescicle / allowed_roots / Codex、UI 語（採用 → 確定 など、P9） |
| docs/07-decisions.md | 凍結して移す | 冒頭に「D-01〜D-109 は Node 版の決定。alpha は D-110 から」と注記 |
| docs/v0.1/08〜11 | 移さない | 08 の §1 目的・§7 AI が質問する条件・§9 シナリオ・§12 成功条件だけ拾って新しい文書に。09 の許可表（status × action × actor）の形は alpha 版で作り直す価値あり |
| docs/README.md | 書き直し | 開発手順（pnpm 等）を外す。番号規則とライセンス節は残す |
| docs/.vitepress/ | 手直し | コメントの `pnpm`。`config.mts` にする（alpha の package.json に `"type": "module"` がない） |
| design/README.md, build.sh | 手直し / そのまま | README の 08/09 参照と View の節 |
| design/concept/core-vision, rdra/problem-causal-model | そのまま | |
| design/rdra/problem-causal-model-after, value-model, stakeholder-model, requirement-tree-future | ほぼそのまま | Egress Policy の言い回し、OpenAI/Codex |
| design/rdra/requirement-tree, requirement-model, information-model-research | 手直し | View、ラベル、Revision、[M1]〜[M5] |
| design/rdra/context-diagram, usecase-model, information-model-record | 書き直し | alpha の構成と usecases.md の UC-1〜9 で |
| design/erd/, design/view/, design/generated/ | 移さない | ERD は schema.sql から新しく描く。生成物は再生成 |

**alpha の既存文書**: `docs/usecases.md` と `docs/screens.md` を正にする（Node 版 08 §4-5・§9、usecase-model、design/view の役）。`PRODUCT_SCOPE.md` は英語で v0.0.8 のまま。README も v0.0.8 表記。

**置き場所の案**

```
docs/
  README.md                 目次と番号規則
  01〜06                    上の表どおり
  07-decisions.md           凍結 + D-110〜
  08-screens.md             ← screens.md（改名するならリンクも直す）
  09-usecases.md            ← usecases.md
  10-domain.md              任意: schema.sql / domain.rs / 指示の要約
  archive/node-v0.1/        任意: 08〜11 を参照用に
  design/index.md
  .vitepress/
design/
  README.md  build.sh  concept/  rdra/  erd/rescicle-alpha-erd.puml  generated/
```

**道具**
- VitePress: `npm i -D vitepress@^1.6.4`、scripts に `docs:dev` / `docs:build` / `docs:preview`。.gitignore に `docs/.vitepress/dist/` と `cache/`。
- design/build.sh は Java + plantuml.jar（+ Graphviz）。図が `Noto Sans CJK JP` を指定しており Windows にはない（`Noto Sans JP` だけ）ので、**図の生成は WSL から `/mnt/c/.../design/build.sh` を回すのが手堅い**。

### §5 でやったこと（2026-09-27）

- docs/01〜07 を移して alpha に合わせた。05 は §1〜§8 を RRS の規定として残し、§9「alpha の実装範囲」を足した。07 は D-01〜D-109 を凍結し、D-110〜D-119（§1）と D-120〜D-128（§2）を足した。
- `usecases.md` → `09-usecases.md`、`screens.md` → `08-screens.md`。Node 版 08 の §1 / §7 / §9 / §12 は `10-first-user.md` に alpha の形で移した。v0.1/08〜11 と archive は置いていない（原本は Node 版リポジトリ）。
- design/: concept と rdra を移し、context-diagram / usecase-model / information-model-record は alpha で書き直した。requirement-model / requirement-tree は Milestone の代わりに alpha の実装状態（済 / 一部 / 未）を付けた。ERD は `design/erd/rescicle-alpha-erd.puml` を schema.sql から新しく描いた。`design/generated/` は WSL で build.sh を回して再生成した。
- docs/.vitepress は `config.mts` にして移した。README・PRODUCT_SCOPE を v0.0.10 に。

残り:
- VitePress は依存に入れていない（`npm i -D vitepress@^1.6.4` と scripts `docs:dev` / `docs:build` / `docs:preview` を足すかは未決）。ビルドは未確認。
- 02 の K ごとの判定、04 の本文の数字、03 の Octopus の評価は Node 版のまま（alpha で変わるのは注記した箇所だけ）。
