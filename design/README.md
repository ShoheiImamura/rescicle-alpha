# design/

rescicle alpha の図を置く。仕様と説明は docs/ が正で、ここは図の原本（PlantUML）と生成物だけを扱う。Node 版（`ShoheiImamura/rescicle`）から 2026-09-27 に移し、alpha に合わせて直した。Node 版にあった画面設計（`view/`）と v0.1 の ERD は移していない（画面の正は `src/renderer/app.js` と [docs/08-screens.md](../docs/08-screens.md)）。

| ディレクトリ / ファイル | 内容 |
| --- | --- |
| `concept/` | コンセプトの図。`core-vision.puml` は docs/01 §1 に載る |
| `rdra/` | RDRA のモデルに匠メソッドの観点を組み込んだもの。下表参照 |
| `erd/` | alpha の DB の ERD。`rescicle-alpha-erd.puml`。正は `src-tauri/src/schema.sql` |
| `generated/` | **生成物だけ**を置く。`generated/<原本のディレクトリ>/<原本名>.svg / .png`。手で編集しない |
| `build.sh` | PlantUML 図をすべて再生成する（`PLANTUML=/path/to/plantuml.jar ./design/build.sh`） |

原本と生成物は同名で、生成物の場所は原本のディレクトリ名を `generated/` の下に写したもの。例: `rdra/value-model.puml` → `generated/rdra/value-model.svg`。

図は、その内容を説明する docs の文書に `![伝えること](../design/generated/<dir>/<name>.svg)` で埋め込む。図の題名も伝えることで書き、RDRA / 匠メソッドなどの手法名は下の表の「層」の列にだけ残す。載せている文書は次のとおり。

| 文書 | 図 |
| --- | --- |
| docs/01 §1 | core-vision |
| docs/02 冒頭 | problem-causal-model、problem-causal-model-after |
| docs/04 §7 | stakeholder-model、value-model、requirement-tree、requirement-tree-future |
| docs/05 §2 | information-model-research（RRS の規定） |
| docs/05 §9 | information-model-record、rescicle-alpha-erd（alpha の実装） |
| docs/09 冒頭 | context-diagram、usecase-model |

`requirement-model` はトレースの検査用で、どの文書にも載せていない。

## rdra/ の構成

| ファイル | 層 | 内容 | 正 |
| --- | --- | --- | --- |
| `context-diagram.puml` | RDRA システム価値層 | コンテキストモデル。研究者・claude CLI・研究フォルダ・Claude Code（MCP）とのやり取り | docs/01 §1 / §5、docs/09、D-111 / D-112 / D-119 |
| `stakeholder-model.puml` | 匠メソッド | ステークホルダーモデル。alpha の重みと対象外を明示 | 04 §2 / §7.1、匠分析 §1 |
| `problem-causal-model.puml` | 匠メソッド（V の上流） | 課題の因果モデル（before: 今の科学）。docs/02 の K を矢印で原因 → 結果につなぐ。枠は課題のグループ、層（根 / 誘因と行動 / 結果）は各ノードのステレオタイプ。色は付けない | 02 §1〜8、02 §10 |
| `problem-causal-model-after.puml` | 匠メソッド（V の上流） | 同じ因果モデルの after（rescicle がある科学）。ノードと矢印は before と同一で、中身だけを書き換える。色は rescicle が効くノードと矢印にだけ付ける（濃い緑 = 変わる / 薄い緑 = 一部・将来 / 白 = 変わらない）。alpha で未達のものは注記する | 02 §1〜8、02 §10、D-86、D-110 |
| `value-model.puml` | 匠メソッド | 価値分析モデル（V → P）と価値デザインモデル（ビジョン・言葉・意味・コンセプト 3 つ・ストーリー） | 01 §2 / §14 / §15、04 §7 |
| `requirement-model.puml` | RDRA システム価値層 + 匠 要求分析ツリー | **トレース用**。戦略要求 S → 要求 Q → 要件 F → alpha の実装状態（済 / 一部 / 未）。読むための木は `requirement-tree.puml` | 10 §1 / §4、04 §7.2、05 §9 |
| `requirement-tree.puml` | 匠メソッド 要求分析ツリー | 価値 V → 戦略要求 C（01 §15 の C1〜C3）→ 業務要求 Q → IT 要求 F（[済] [一部] [未]）。WBS 記法 | 01 §15、10 §4、04 §7.2 |
| `requirement-tree-future.puml` | 匠メソッド 要求分析ツリー（別紙: 将来） | requirement-tree から外した将来の枝（S6〜S8、Q14〜Q16・Q18、F14） | 04 §3 / §7.2 |
| `usecase-model.puml` | RDRA システム層 | ユースケース複合図。アクター（研究者 / AI / Claude Code）→ UC-1〜UC-9 → 対象（情報） | docs/09、docs/08、05 §9 |
| `information-model-research.puml` | RDRA システム層 | 情報モデル 1/2: 研究構造（RRS の kind と predicate）。alpha の範囲は 05 §9 | 05 §2 / §4 |
| `information-model-record.puml` | RDRA システム層 | 情報モデル 2/2: alpha の記録機構と主体 | 05 §9、D-110 / D-120 |

番号の対応: K（課題、[docs/02](../docs/02-science-problems.md)）→ V（価値）→ S（戦略要求）→ Q / B（要求）→ F（要件）→ alpha の実装状態。K は V の上流で、ステークホルダーの「今の状態」を裏返すと V になる。匠メソッドの分析原文は Node 版の `.review/`（非公開）。

## 規則

* kind / status / origin と画面の語の表記は docs/06-glossary.md に従う（D-118）。
* 図の再生成はすべて `design/build.sh`。フォントは Noto Sans CJK JP を前提（Windows には無いので、WSL から回すのが手堅い）。plantuml.jar は各自で取得し、`PLANTUML` 環境変数でパスを渡す（リポジトリには含めない）。`@startuml` の名前は原本のファイル名と同じにする（出力名がずれないため）。
* 生成物は `generated/` 以外に置かない。原本のディレクトリに `.svg` / `.png` を置かない。

```bash
# WSL から（Java と Graphviz、fonts-noto-cjk が入っていること）
PLANTUML=~/plantuml.jar /mnt/c/Users/<you>/projects/rescicle-first-user-v2/design/build.sh
```
