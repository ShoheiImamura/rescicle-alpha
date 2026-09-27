# ドキュメント

rescicle alpha（Rust + Tauri のデスクトップ版）の設計文書。インストールと使いかたはリポジトリ直下の [README.md](../README.md)、開発手順も同じ README の「開発」にある。

番号は読む順に振り、重ねない（「05 §9」のように番号だけで指せるように）。01〜07 は Node 版（`ShoheiImamura/rescicle`）から移して alpha に合わせた文書（2026-09-27）、08 以降は alpha で書いた文書。新しい文書は 11 から続ける。

| ファイル | 内容 |
| --- | --- |
| [01-concept.md](01-concept.md) | コアコンセプト・戦略・事業モデル |
| [02-science-problems.md](02-science-problems.md) | 科学世界の課題と、その根拠（研究現場の声と公的調査） |
| [03-positioning.md](03-positioning.md) | Octopus との境界と勝ち筋 |
| [04-business.md](04-business.md) | 事業計画 |
| [05-data-model.md](05-data-model.md) | Research Record Specification (RRS) の規定（§1〜§8）と、alpha の実装範囲（§9） |
| [06-glossary.md](06-glossary.md) | 日英用語集と画面の語 |
| [07-decisions.md](07-decisions.md) | 決定事項。D-01〜D-109 は Node 版（凍結）、alpha は D-110 から |
| [08-screens.md](08-screens.md) | 画面一覧 |
| [09-usecases.md](09-usecases.md) | ユースケースと流れ（研究者が何をしようとして、裏で何が起きるか） |
| [10-first-user.md](10-first-user.md) | 最初の研究者で確かめること（目的・AI が質問する条件・シナリオ・成功条件） |
| [gap-from-node.md](gap-from-node.md) | Node 版との差分の作業メモ |

図:

| ファイル | 内容 |
| --- | --- |
| [../design/](../design/README.md) | 図（PlantUML）と生成手順 |

正の置き場所: 文書と実装が食い違ったら実装が正。データの形は `src-tauri/src/schema.sql` と `domain.rs`、AI への指示は `src-tauri/src/agent_instructions.md`、画面の語は `src/renderer/app.js`。

## 閲覧用サイト

VitePress で docs と図をまとめて見られる（`docs/.vitepress/`）。図は `design/build.sh` の生成物（`design/generated/`）をそのまま載せる。

```bash
npx vitepress dev docs     # 開発用サーバー
npx vitepress build docs   # docs/.vitepress/dist/ に出力
```

## ライセンス

alpha のリポジトリは `UNLICENSED`（非公開）。公開するときの案は Core が Apache-2.0、RRS 仕様（05 §1〜§8）が CC BY 4.0（D-80、U-10）。商標調査は未了（U-04）。
