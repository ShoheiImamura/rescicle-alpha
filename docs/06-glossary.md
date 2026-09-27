# 用語集

rescicle と Research Record Specification（RRS）で使用する日本語・英語・コード表記・意味を定める。

本書は**表記と用語選択の規範**である。データモデルの意味論は [05-data-model.md](05-data-model.md)（alpha の実装範囲は 05 §9）、画面は [08-screens.md](08-screens.md)、ふるまいは [09-usecases.md](09-usecases.md)、設計判断は [07-decisions.md](07-decisions.md) を正とする。

画面に出す語は alpha の画面（`src/renderer/app.js` の `TYPE_LABEL` / `STATUS_LABEL` / `ORIGIN_LABEL`）に揃える（D-118）。本書の「UI 表示名」はその値を書く。

---

## 1. 表記ルール

### 1.1 基本

* 製品名は常に **rescicle** と小文字で書く。
* 初出では **Research Record Specification（RRS）** と書き、以後は RRS とする。RRS はいま草案（draft）。
* kind / predicate / status / origin / metadata key は、コードでは本書の小文字 `snake_case` をそのまま使う。
* **文書の本文・見出し・表の説明文は日本語中心に書く。** 本書の「日本語表示」を使い、見出しと各節の初出では「日本語（`English`）」の形で英語名をバッククォート付きで添える。例: 「論文（`Paper`）ではなく研究記録（`Research Record`）を中心にする」。2 回目以降は日本語だけでよい。
* **英語のまま残すもの**: バッククォートで囲むコード値・識別子（kind / predicate / status / origin / actor の値、MCP ツール名、テーブル名・列名、エラーコード、JSON キー、パス）、固有名詞と外部標準（rescicle、RRS、PROV-O、RO-Crate、Nanopublication、ORCID、DataCite、JSON-LD、Claude Code、Codex CLI、MCP、SQLite、Tauri、WebView2、GakuNin RDM、JaLC、Octopus、ResearchEquals）、料金プラン名（Free / Pro / Lab / Institution / Enterprise / Network）、実行モード名（Mode A / B / C）、Research Working Environment、Primary Research Record、Wow、HARKing、BYOK。
* UI モック・ASCII 図・コード例の中は英語のままでよい。
* Record kind の英語名は単数形、先頭大文字で書く。例: Question、Measurement、Result。
* `confirmed` は「科学的に正しい」ではなく「研究者が確認した」の意味でのみ使う。

### 1.2 用語の区分

| 区分 | 意味 |
| --- | --- |
| 正規用語 | 仕様・設計・UI で優先して使用する語 |
| UI 別名 | 研究者に分かりやすく見せるための表現。RRS の対応先を必ず持つ |
| 予約 | RRS では定義するが alpha では生成・実装しない語 |
| 外部標準 | RRS の内部語彙ではなく、Export / Publish 時の写像先 |
| 非推奨 | 意味が曖昧、旧設計由来、または現行モデルと矛盾するため新規文書・コードで使わない語 |

### 1.3 本文で使う日本語表示（対応表）

各節の表に載っていない一般語の対応。本文ではこの左列を使う。

| 日本語表示 | English |
| --- | --- |
| レコード | RRS Record |
| 関係 | Relation |
| 述語 | predicate |
| リビジョン | Revision |
| イベント | Event |
| 由来 | origin |
| 状態 | status（curation の状態） |
| 実施の状態（予定 / 実施中 / 完了 / 中断） | execution_status (planned / in_progress / completed / aborted) |
| 変数 / 条件の辞書 | Variable / variable dictionary |
| 操作主体 | actor |
| 提案 / 提案中の提案 | Proposal / Pending proposal |
| エージェント | Agent / AI Agent |
| エージェント提案 | Agent Proposal |
| 代替仮説 | Alternative Hypothesis |
| 見分ける実験（複数の仮説の予測が同じプロトコルに結ばれている） | Discriminating experiment |
| プロトコル（判定の手順） | Protocol |
| run（測定 = 手順を 1 回走らせたもの） | Run |
| 次の測定 | Next Measurement（run の無い Protocol） |
| 証拠 | Evidence（役割。kind ではない） |
| 支持する / 矛盾する | supports / contradicts |
| 構造的な関係 / 証拠的な関係 | structural / evidential Relation |
| 根拠 | Basis（`based_on`） |
| 欠けている文脈（測定ごとに記録すると決めた条件の書き漏れ） | Missing Context |
| プロジェクト / プロジェクトルート | Project / Project root |
| 研究記録 / 研究マップ / タイムライン | Research Record / Research Map / Timeline |
| 研究オブジェクト（画面で問い・仮説・予測・測定・データをまとめて呼ぶ語。D-118） | Research Object（RRS では RRS Record） |
| 補足（オブジェクトの `note` 列。D-115） | note |
| 判定式 / 判定式の補足 / 記号 | criterion / criterion_note / criterion symbol（D-116） |
| 会話モード / Claude Code モード | in-app conversation（`claude -p`）/ MCP |
| ツール | MCP Tool |
| エージェント指示 | Agent Instruction |
| エージェント制約 | Agent Constraint |
| コンテキストビルダー | Context Builder |
| 決定論コア | Deterministic Core |
| 外向きポリシー / 外部送信 | Egress Policy / egress |
| ローカルファースト | Local-first |
| 生ファイル内容 / ファイルメタデータ | Raw file content / File metadata |
| 研究フォルダ | research folder（`projects.root_path`） |
| 読み込み済み（AI が読んだファイル。`file_read`） | file read |
| エクスポート / インポート / 公開 | Export / Import / Publish |
| 選択的公開 | Selective Publish |
| 互換性テスト | Compatibility Test |
| 参照実装 | Reference Implementation |
| 公開標準 | Open Standard |
| ドメイン拡張 | Domain Extension |
| 来歴 | Provenance |
| 装置 / 試料 / 条件 | instrument / sample / conditions |
| マイルストーン | Milestone |
| パイロット | Pilot |
| デザインパートナー | design partner |
| 成功条件 | Success criteria |
| 決定事項 / 未決事項 | Decision / Open question |
| 事業モデル / 参入障壁 / ロックイン | Business Model / Moat / Lock-in |
| 論文 / データセット / レポート | Paper / Dataset / Report |
| 共同研究 / 出版 / 検証 / 再現 / 査読 / 発見 | Collaboration / Publication / Verification / Replication / Review / Discovery |
| 冪等性 / トランザクション / マイグレーション | Idempotency / Transaction / Migration |
| フォルダ / パス | folder / path |
| 写像 | mapping（既存標準への対応） |
| 検証（Verification） / 妥当性検証（Validation） | 意味が異なるので併記で区別する |
| kind / subject / object / predicate | 英語のまま（DB とコードの語彙。predicate は本文では「述語」も可） |

---

## 2. 製品・仕様・アーキテクチャ

| 日本語表示 | English / 表記 | 意味 |
| --- | --- | --- |
| rescicle | `rescicle` | RRS の Reference Implementation である製品・サービス・Network のブランド |
| 研究記録仕様 | Research Record Specification（RRS） | データモデル、Exchange Format、Agent Interface、Compatibility Rules を定める draft 仕様。日本語名は説明訳であり正式名称ではない |
| 研究記録 | Research Record | Project 内の Record、Revision、Relation、Event からなる機械可読な研究構造全体 |
| レコード | RRS Record | Graph の1ノードを表す安定した identity。内容は Revision に保存する。定義と初出は RRS Record と書き、文中の略記としてのみ Record を使う（D-62） |
| 研究マップ | Research Map | 選択した一つの Question に属する Hypothesis 以下の現在状態を Graph として示す UI。Question 自体は上部の選択領域に置く。データモデルそのものではない |
| 研究コパイロット | Research Copilot | 研究者と Agent が研究構造を共同で整理する製品体験 |
| 研究作業環境 | Research Working Environment | rescicle の製品ポジション。公開の手前で研究活動から構造が生まれるローカル作業環境。一次研究記録（Octopus 等）の対語（[03](03-positioning.md)、D-90） |
| 画面 | rescicle（デスクトップアプリ） | マップ・一覧・データ・ファイル・会話欄を 1 つの窓に持ち、確定 / 却下を行うローカル UI。Tauri + WebView2（[08-screens.md](08-screens.md)）。Node 版の Research View / Local Web UI に当たる |
| rescicle Core | rescicle Core | Policy、整合性、永続化、file inspection を担う製品の Core |
| RRS Core | RRS Core | RRS の最小共通語彙と互換規則。rescicle Core とは別概念 |
| 決定論コア | Deterministic Core | hash、metadata、統計、Policy 判定など、AI 推論を使わず確定的に処理する部分 |
| エージェント制約 | Agent Constraint | rescicle Core がサーバー側で強制する Agent の行動規則。Agent は proposed しか作れず confirm できない、研究者の confirm / reject / archive / retract は MCP 経由なら statement 必須、origin=researcher の未確認 Record は Agent が消せない、内容変更は Revision、証拠は Relation で based_on 必須、予測は測定前に expected（仮説が正しければどうなるか）を書き、どう測るか・何を見るかはプロトコルに書く、egress は Egress Policy で決まる（D-64 / D-68 / D-83）。Agent Instruction（プロンプトで守らせる規則）と対になり、Instruction は破れるが Constraint は破れない。効くのは Core を通る操作だけ。alpha がいま強制している範囲は 05 §9 と 09-usecases の「rescicle が守っている境界」 |
| rescicle Network | Official rescicle Network | Collaboration、Publication、Verification、Discovery 等を提供する将来のサービス層 |
| 一次研究記録 | Primary Research Record | Octopus 等が担う、研究段階ごとの公開記録。rescicle の作業環境とは別レイヤー（03、D-90） |
| ドメイン拡張 | Domain Extension | `rrs-physics` 等の分野固有語彙。RRS Core を肥大化させず追加する |
| rescicle 互換 | `rescicle compatible` | Compatibility Test を通過した製品の将来の認証表示。RRS が draft の間は使用しない |
| プロジェクト | Project | 研究者が選んだ folder に対応する RRS のコンテナ。Node 版 v0.1 は 1 Project = 1 SQLite DB（フォルダ内 `.rescicle/`）。alpha は端末に 1 つの DB に全 Project を置き、Project は研究フォルダのパスを持つ（D-111） |

### Record と Research Record の違い

* **RRS Record**（仕様文書での表記。実装・DB・API では `record`）は Question や Asset などの1ノード。仕様文書では裸の Record と書かず RRS Record と書く。
* **Research Record Graph** は RRS Record 群と Relation、Revision、Event を含む研究記録全体。Project 単位。
* **Research Map** は Research Record Graph を人間向けに表示した View。
* UI には Record という語を出さず、kind 名（仮説 / 測定 / 結果 …）を表示する。
* TypeScript 採用時のクラス名は `RrsRecord`（組み込みの `Record<K, V>` との衝突回避）。名前空間は `rrs:Record`（D-62）。

---

## 3. Record kind

docs 本文の表示は「日本語表示」、画面に出す語は「UI 表示名」（空欄なら日本語表示と同じ）。alpha の実装（`src/renderer/app.js` の `TYPE_LABEL`）はこの列に従う。画面ではこれらをまとめて「研究オブジェクト」と呼ぶ（D-118）。

| 日本語表示 | UI 表示名 | English | kind | 意味 | alpha |
| --- | --- | --- | --- | --- | --- |
| 問い | | Question | `question` | Project 内で答えを求めている研究上の問い。Project は複数持てるがマップでは一つを選ぶ | 実装 |
| 仮説 | | Hypothesis | `hypothesis` | 現象についての説明候補。作成時からちょうど一つの Question に属する。title は否定しうる主張（名詞句は不可、D-83 / D-101） | 実装（1 つの問いに属する制約はまだない） |
| 予測 | | Prediction | `prediction` | Hypothesis が成立する場合に期待される観測。RRS では期待される結果（expected）を推奨（D-83 / D-98）。alpha は判定式（`criterion`）を必須にし、記号表を持つ（D-116） | 実装（判定式） |
| プロトコル | | Protocol | `protocol` | 予測を判定するための手順。metadata に条件の文（condition、conditions があれば省略可）/ 見るもの（observable）、拡張に装置・試料・条件（変数の key、D-107）。直せる（D-98） | なし（D-117） |
| 測定（run） | | Measurement / Run | `measurement` | プロトコルを 1 回走らせた事実。いつ・実施の状態（予定 / 実施中 / 完了 / 中断）・実際にどの装置・試料・条件で。予測の成否は持たない（D-108）。`run_of` でプロトコルを指す（D-98） | 一部（手順と run を分けない。実施したか 2 値。D-117） |
| アセット | データ | Asset | `asset` | CSV、TIFF、Notebook 等のファイル・成果物。科学的意味ではなくデータの入れ物。alpha の画面では「データ」（登録前のものは「ファイル」） | 実装 |
| 観測 | | Observation | `observation` | Measurement から直接得られた値または記述 | なし |
| 分析 | | Analysis | `analysis` | Observation / Asset を加工する Activity | 予約 |
| 結果 | | Result | `result` | Analysis の出力。Agent または研究者によるデータの解釈 | なし |
| 表明 | | Assertion | `assertion` | 外部へ伝える、世界についての主張。Nanopublication の assertion に対応 | 予約 |
| メモ | | Note | `note` | 構造化しない自由記述。分からないこともメモに書き、`about` で対象に付ける（D-109） | 列（オブジェクトの `note`、画面は「補足」。D-115） |
| 変数 | | Variable | `variable` | 条件の軸の定義（key・名前・値の種類・単位・別名）。条件の辞書。組み込みの候補表から始め、プロジェクトで足す（D-107） | なし（予測ごとの記号表が芽。D-116） |
| （廃止）不明点 | | Unknown | `unknown` | D-109 で廃止。分からないことはメモ（note）に書く | 廃止 |

origin の UI 表示名は §6.1 の表（研究者 / AI提案）に従う。

### 3.1 Observation / Result / Evidence

| 語 | 判定基準 |
| --- | --- |
| Observation | Measurement から直接得た内容。v0.1 では Core が機械的に抽出した値、または研究者が口述した観測 |
| Result | Analysis の出力。v0.1 では Agent / 研究者が Observation や Asset を解釈した内容 |
| Evidence | kind ではない。Observation / Result / Assertion が `supports` または `contradicts` の subject になるときに果たす役割 |

例:

```text
Observation O1 --supports--> Prediction P1
Result R1      --contradicts--> Hypothesis H2
```

### 3.2 Protocol と Run（D-98）

* 「これから測る計画」は run の無い `protocol`。run を予定として先に作るときは run の `execution_status=planned`（D-108。metadata の `execution_status` は D-98 で廃止したまま）。
* `status=confirmed` の protocol は「研究者がその手順を採用した」という意味。走らせたかどうかは run（`measurement --run_of--> protocol`）とその実施の状態で分かる。
* run は予測の成否を持たない。成否は観測を根拠にした結果（result）から予測への supports / contradicts で表し、研究者が確定する（D-108）。

---

## 4. Relation predicate

コード・DB・Export では predicate のコード値を使用する。この表は RRS 全体。区分は 05 §4（D-51）に従い、判断的（tested_by / supports / contradicts）は明示 confirm が必要。

alpha が受け付けるのは 6 つだけ: `addresses`（hypothesis → question）、`predicts`（hypothesis → prediction）、`tested_by`（prediction → measurement。protocol がないため）、`produces`（measurement → asset。RRS の `generated` に当たる）、`references` / `related_to`（型を問わない）。`references` は RRS にない。区分（構造的 / 判断的）と自動確定はまだない（05 §9.4）。

| 日本語 | English | predicate | subject → object | 区分 |
| --- | --- | --- | --- | --- |
| 問いに対応する | addresses | `addresses` | hypothesis → question。仮説の一意な所属（マップでは線にしない） | 構造的 |
| 予測する | predicts | `predicts` | hypothesis → prediction | 構造的 |
| 手順で判定する | tested by | `tested_by` | prediction → protocol | 判断的 |
| 走らせた | run of | `run_of` | measurement → protocol | 構造的 |
| 生成する | generates | `generated` | measurement / analysis → asset / observation / result | 構造的 |
| 使用する | uses | `used` | analysis → asset / observation | 構造的 |
| 由来する | derived from | `derived_from` | observation / result → asset | 構造的 |
| 支持する | supports | `supports` | observation / result / assertion → prediction / hypothesis / assertion（run は主語にならない、D-108） | 判断的（証拠的） |
| 矛盾する | contradicts | `contradicts` | observation / result / assertion → prediction / hypothesis / assertion | 判断的（証拠的） |
| 根拠とする | based on | `based_on` | hypothesis / prediction / result → 根拠 Record | 構造的 |
| 対象とする | about | `about` | note → Record（D-109。`resolved_by` は廃止） | 構造的 |
| 関連する | related to | `related_to` | Record → Record | 構造的 |

Node 版の画面（Research View）での見せ方: 関係は「主語 / 動詞 / 目的語」の表で、自分の項目は「この項目」と書く（向きを誤読させない）。`based_on` は表に出さず、subject 側では「根拠: …」、object 側では「この項目を根拠にしている: …」の 1 行にまとめる（仮説 → 問い の addresses と based_on が同じ相手に並ぶため、D-82）。

### 構造的 Relation と判断的 Relation

* **構造的 Relation**は研究構造上の配置・由来を示す。両端 Record の確認に応じて自動 confirm される。
* **判断的 Relation**は科学的判断を含み、両端が confirmed でも研究者が個別に確認する。`tested_by` / `supports` / `contradicts`（D-51。`discriminates` は D-100 で廃止）。
* **証拠的 Relation**は判断的のうち `supports` / `contradicts`。Evidence の役割を担う。
* 「両端が confirmed なら Evidence も自動的に正しい」という意味ではない。

---

## 5. Identity / Revision / Event

| 日本語表示 | English / code | 意味 |
| --- | --- | --- |
| 識別子 | Identity / ID | Record 等を一意に識別する安定 ID。RRS は UUID v7 を使う |
| リビジョン | Revision | Record 内容の不変スナップショット。変更時は上書きせず新 Revision を追加する |
| 現在リビジョン | Current Revision | Record が現在参照する最新 Revision |
| Revision 固定 | Revision pin | Relation が `subject_revision` / `object_revision` で特定 Revision を指すこと |
| レコードイベント | Record Event | Record の create / confirm / reject / archive / revise の履歴 |
| 関係イベント | Relation Event | Relation の confirm / reject / retract の履歴 |
| タイムライン | Timeline | Revision、Event、Relation から導出する履歴 View。独立した正本テーブルではない |
| 現在 View | Current View | Current Revision と現在有効な Relation から作る投影 |
| 撤回 | Retract | Relation を無効化する操作。`retracted_at` で表し、reject とは区別する |

### Confirm / Reject / Revise / Archive / Retract

| 日本語 | English / action | 対象 | 意味 |
| --- | --- | --- | --- |
| 確定（画面表示。文書では確認 / confirm。D-118） | Confirm / `confirm` | Record / 判断的 Relation（tested_by / supports / contradicts） | 研究者が研究上の記録として認める（D-97） |
| 却下 | Reject / `reject` | proposed Record / 判断的 Relation | 研究者が提案を認めない |
| 修正 | Revise / `revise` | Record | 新 Revision を追加する。上書き編集ではない |
| アーカイブ | Archive / `archive` | Record | 使用しなくなった Record を現在 View から外す |
| 撤回 | Retract / `retract` | Relation | 作成済み Relation を取り下げる |

---

## 6. origin / actor / status

### 6.1 origin

Record / Relation の内容が誰・何に由来するかを表す。

| 日本語 | UI 表示名 | origin | 意味 | alpha |
| --- | --- | --- | --- | --- |
| 研究者由来 | 研究者 | `researcher` | 研究者の発言・操作に基づく | 使用 |
| Agent 由来 | AI提案 | `agent` | AI Agent の推論・提案 | 使用 |
| システム由来 | （表示しない） | `system` | Deterministic Core の計算・確認 | 古い行にだけある |
| 装置由来 | | `instrument` | 装置からの直接出力 | 予約 |
| インポート由来 | | `imported` | 外部データの Import | 予約 |
| 文献由来 | | `literature` | 文献から取得した情報 | なし |

alpha の画面での origin の表示名は「研究者 / AI提案」の 2 つ（`app.js` の `ORIGIN_LABEL`）。`system` は表示しない。Node 版は「あなた / エージェント / 自動」だった。

### 6.2 actor

Event を発生させた操作主体を表す。origin と同じとは限らない。

| 日本語 | actor | 意味 |
| --- | --- | --- |
| 研究者 | `researcher` | 画面から研究者本人が直接操作 |
| Agent 経由の研究者 | `researcher_via_agent`（alpha は `researcher-via-agent` / `researcher-via-mcp`） | 研究者発言の引用を伴う操作。alpha は会話モードと MCP で値が分かれ、提案中からの変更しかできない（D-120） |
| Agent | `agent` | Agent の自律操作 |
| システム | `system` | Deterministic Core の操作 |

例: 研究者の発言を Agent が Record 化した場合、`origin=researcher` だが created Event の `actor=agent` になり得る。

### 6.3 status

status は**人間による curation 状態**であり、科学的真偽ではない。

| 日本語表示 | status | 意味 |
| --- | --- | --- |
| 提案中 | `proposed` | 提案されたが、まだ研究者が確定していない（Node 版の旧表示「未確認」、D-97） |
| 確定 | `confirmed` | 研究者が研究上の記録として認めた（Node 版は「採用」、D-97 → D-118） |
| 却下 | `rejected` | 研究者が提案を認めなかった。画面には出さない。alpha は 3 分後に削除する（D-110） |
| アーカイブ | `archived` | 済んだ（答えが出た / 乗り越えられた / 反証された、または提案のまま要らなくなった）。マップと一覧から外れ、残る。真偽は言わない（D-124） |

正常な例:

```text
Hypothesis H1: status=confirmed
Result R2 --contradicts--> H1
```

これは「研究者が H1 を研究対象の仮説として認めているが、H1 に反する結果も存在する」という意味で、矛盾した状態ではない。

### 6.4 execution_status（run の実施の状態、D-108）

Measurement（run）の実施の状態。status（curation）とは独立する。予測の成否は持たない（旧 `outcomes` は D-108 で廃止）。alpha は「実施済み」かどうかの 2 値（`measurements.performed_at`）だけを持つ（D-117）。

| 日本語表示 | execution_status の値 | 意味 |
| --- | --- | --- |
| 予定 | `planned` | これから走らせる run |
| 実施中 | `in_progress` | 走らせている途中 |
| 完了 | `completed` | 最後まで走らせた（既定） |
| 中断 | `aborted` | 途中でやめた。理由は本文に。中断した run も記録として残す |

---

## 7. 製品・UI 語彙と RRS の対応

| 製品・UI 表現 | RRS 上の表現 |
| --- | --- |
| Data / File | `asset` |
| Interpretation / Finding | `result` |
| Evidence | `supports` / `contradicts` における Observation / Result / Assertion の役割 |
| Claim | `assertion` |
| Missing Context | 測定ごとに記録すると決めた条件を書いていない run（`missing_conditions`、導出値。D-107 / D-109） |
| Alternative Hypothesis | `origin=agent` 等の `hypothesis`。同じ Question に `addresses` |
| 見分ける実験 | 複数の仮説の `prediction`（親の仮説は予測ごとに 1 つ）が同じ `protocol` に `tested_by` で結ばれていること。成否は結果（result）から各予測への supports / contradicts（D-108） |
| 条件 / 見るもの | protocol の `conditions`（変数の key、D-107）と `metadata.condition` / `observable`（UI 表示名、D-98） |
| 仮説が正しければ | prediction の `metadata.expected`（UI 表示名、D-83。予測の仮説は `predicts` で 1 つに決まる、D-100） |
| Next Measurement | run の無い `protocol`（D-98） |
| Basis | `based_on` Relation |
| Agent Proposal | 主に `origin=agent, status=proposed` の Record / Relation |
| Pending | `status=proposed` |
| まだ測っていない | run の無い Protocol（D-98） |
| Confirm / Reject | status 遷移または Relation Event |
| Correct / Edit | 新 Revision を作る `revise` |
| Missing Evidence | 必要な `supports` / `contradicts` がない状態（書き留めるなら対象についての `note`） |
| Measurement Data | Measurement に `generated` で結ばれた Asset / Observation |
| Research Map | Current View の Graph 表示 |

---

## 8. Local-first / Egress

| 日本語表示 | English / code | 意味 |
| --- | --- | --- |
| ローカルファースト | Local-first | **No implicit data egress**。ユーザーが明示した Policy なしに研究情報を端末外へ送らない |
| 暗黙のデータ送出なし | No implicit data egress | rescicle における Local-first の定義 |
| 外向きポリシー | Egress Policy | 端末外へ返してよい情報を Project 単位で制御する Policy |
| ローカル限定 | Local Only / Mode A | Local DB、Local files、Local model のみ |
| BYOK クラウド | BYOK Cloud / Mode B | ユーザー自身の契約で Cloud AI を使用。alpha は研究者本人の Claude Code（D-119）。Node 版 v0.1 は MCP 対応の汎用エージェント（Claude Code / Codex CLI など、D-87）。API key は後 |
| 組織管理 | Organization Managed / Mode C | 組織承認済み AI gateway を使用 |
| 生ファイル内容 | Raw file content | CSV の raw row 等。alpha は AI が名前を挙げたファイルの先頭 4KB だけを会話モードで渡し、`file_read` に記録する（D-112）。MCP では返さない |
| ファイルメタデータ | File metadata | path、size、hash、columns、統計等 |
| 選択的公開 | Selective Publish | 確認済みの Record / Relation を選んで外部公開すること |

注意:

* 「DB がローカルにある」だけでは Local-first ではない。
* Policy が保証するのは rescicle Core を経由する情報だけ。alpha の会話モードは Core が唯一の経路だが、Claude Code から MCP で使うときは迂回を防げない。
* 個人契約のエージェント（Claude Code、Codex CLI）と BYOK API は契約・データ取扱い条件が異なるため同義語として扱わない。
* 研究者向けの画面ではエージェントを「AI」と書き、製品名は例としてだけ出す（D-87）。

---

## 9. 外部標準

| 表記 | 正式名 / 意味 | RRS での役割 |
| --- | --- | --- |
| PROV-O | W3C Provenance Ontology | Entity / Activity / Agent と provenance の写像先 |
| RO-Crate | Research Object Crate | Project と Asset を JSON-LD で束ねる Export / Archive 形式 |
| Nanopublication | Nanopublication | Assertion、provenance、publication info を公開する形式 |
| ORCID | Open Researcher and Contributor ID | 研究者 identity の外部 ID |
| DataCite | DataCite Metadata Schema / DOI service | Dataset / Research Object の識別・引用 metadata |
| RDF | Resource Description Framework | 外部標準で使用。RRS の内部 DB 表現には採用しない |
| JSON-LD | JSON for Linking Data | Export 時の表現。内部 DB 表現ではない |

注意: schema.org の `CreateAction.result` property と RRS の `result` kind は別物。

---

## 10. 使用しない用語・旧称・非推奨表現

新しい仕様、コード、UI では以下を使用しない。

| 使用しない語・表現 | 置換先 | 理由 |
| --- | --- | --- |
| Science Record | Research Record | 現行の標準名と不一致 |
| Science Record Standard | Research Record Specification（RRS） | 標準と製品の名称を分離したため |
| Open Science Record Standard | RRS | 旧構想の名称 |
| rescicle Standard | RRS | 標準を製品商標で囲わないため |
| rescicle Science Record | Research Record | 同上 |
| `measurement_session` / MeasurementSession | `measurement` | 旧 kind / table 名 |
| `create_measurement_session()` | `create_measurement()` | 旧 MCP Tool 名 |
| `get_measurement_session()` | `get_record()` | 旧 MCP Tool 名 |
| `produced` predicate | `generated` | 現行 predicate に統合済み |
| `contains` predicate | `generated` または Relation 不要 | 現行 predicate に統合済み |
| `motivated` predicate | `based_on` | 旧 predicate |
| `update_record()` | `revise_record()` | 内容を上書きせず Revision を積むため |
| 上書き編集 / in-place update | Revise / 新 Revision | Immutable Revision に反する |
| `edited` Event | `revised` Event | 現行 Event 名に統一 |

metadata に参照を埋めない規則: Relation で辿れる参照の**複製**は禁じる。予測ごとの「その仮説が正しければどうなるか」は予測本体の `expected` になった（D-100）。
| 独立 kind としての Proposal | `status=proposed` の Record | Proposal は kind ではなく curation 状態 |
| 独立 kind / Node としての Evidence | `supports` / `contradicts` における役割 | Evidence は Relation 文脈の役割 |
| 独立 kind としての Interpretation | `result` | 現行 kind に対応させる |
| 独立 kind としての Finding | `result` | 同上 |
| Agent 解釈を Observation として保存 | `result`、`origin=agent` | Observation と Result の境界に反する |
| `note.metadata.rrs_kind=result` | `result` kind | 旧移行案であり撤回済み |
| `metadata.discriminates=[...]` / `metadata.expected_by_hypothesis` | 仮説ごとの `prediction` + 共有する `protocol`（D-100） | UUID 参照を metadata に埋め込まない |
| Asset の有無による計画 / 実測の判定 | run の有無（`run_of`） | curation status と実行を分離するため（D-98） |
| `planned: true/false` / `metadata.execution_status` | run の無い protocol、または run の `execution_status`（D-108） | 実施の状態は run の拡張の欄で、metadata ではない |
| status としての `planned` / `completed` / `supported` | run の `execution_status`、成否は result → prediction の supports / contradicts | `status` は curation 専用。実施と成否は別の軸（D-108） |
| status としての `retracted` | `retracted_at` / Retract Event | Relation status と撤回状態は直交する |
| `confirmed` = 正しい / proven / true | `confirmed` = 研究者確認済み | curation と科学的真偽を混同する |
| confirmed fact | confirmed Record、または confirmed Evidence Relation | Agent Proposal を事実扱いしない |
| Relation 両端 confirmed = Evidence も自動 confirmed | `confirm_relation` | `supports` / `contradicts` は個別確認が必要 |
| `origin=researcher` = confirmed | origin と status を別々に記述 | 研究者由来でも MCP 作成時は proposed |
| origin と actor の同一視 | origin / actor を明記 | 内容の由来と操作主体は別概念 |
| Experiment（RRS kind の意味で） | Measurement / Analysis / Project | RRS に `experiment` kind はなく意味が広すぎる |
| Data（仕様上の型名として） | Asset / Observation / Result | 入れ物・観測・解釈を区別できない |
| File（Record kind 名として） | Asset | File は UI 語または RO-Crate の型 |
| Claim（kind 名として） | Assertion | RRS の正規 kind は `assertion` |
| Fact / Truth（status の意味として） | confirmed / supports / contradicts を分けて記述 | 真偽を単一 status で表さない |
| AI-generated | `origin=agent`、必要なら actor も併記 | 生成元と操作主体が曖昧 |
| AI Policy | Egress Policy | 現行名称に統一 |
| DB が Local = Local-first | No implicit data egress | rescicle の Local-first 定義を満たさない |
| Claude Code = BYOK API | それぞれを明記 | 契約・保持・学習利用条件が異なる |
| Claude（エージェント一般の意味で） | エージェント（画面では AI） | 特定のエージェントに依存しない（D-87） |
| Discuss ボタン | 会話欄で議論 | カードには置かない（D-12）。会話は同じ窓の会話欄 |
| 独自エージェント UI | 自前の推論ループ / API 直叩きの Agent Runtime | 会話欄は枠だけ。研究者の `claude` CLI を動かす（D-89、D-112） |
| 採用（`confirmed` の画面表示として） | 確定 | alpha の画面語に揃える（D-118） |
| Research View / View（画面の名前として） | 画面、マップ、一覧 | Node 版の名前 |
| 許可ルート / allowed_roots | 研究フォルダ | alpha は許可リストを持たない。読んだものを記録する（D-112） |
| `.rescicle/` | `%AppData%\rescicle` | alpha は研究フォルダに書かない（D-111） |
| Add to Research Map | Confirm | Map への追加と curation を分離しない |
| Distinguishing Measurement | 見分ける実験（複数の仮説の予測 + 共有する protocol） | 現行モデルでは関係の形で表す（D-100） |
| Export as rescicle Measurement | Export as RRS Measurement | 装置連携を製品固有名称にしない |
| `propose_hypothesis()` 等の Reasoning Tool | `get_research_context()` + `create_record()` | MCP に Agent reasoning を埋め込まない |
| `rescicle compatible` を現時点の認証として表示 | RRS draft / rescicle implementation | Compatibility Test 未実装のため |

---

## 11. 曖昧な自然語を使う場合のルール

### Data

会話・マーケティングでは使用してよいが、仕様では次に分解する。

* ファイルや成果物 → Asset
* 測定から直接得た内容 → Observation
* 分析・解釈した内容 → Result
* 外部へ表明する主張 → Assertion

### Experiment

一般向け説明では使用してよいが、仕様では対象を明示する。

* 測定行為 → Measurement
* データ加工 → Analysis
* 一連の研究単位 → Project または Question を根とする Graph

### Claim

UI・事業説明では使用してよい。RRS kind を指す場合は Assertion と書く。Hypothesis を「未確定の Claim」と言い換えない。

### Session

* エージェント（Claude Code など）との会話単位 → Conversation Session
* 測定単位 → Measurement
* `measurement_session` という kind / table は使用しない
* Pro の Automatic session detection は製品機能名であり、RRS kind ではない

### Evidence

「証拠データ」のように単体 Node を指す語として使わない。何が何を支持・否定するかを必ず記述する。

推奨:

```text
Result R1 is evidence supporting Hypothesis H1.
Result R1 --supports--> Hypothesis H1
```

非推奨:

```text
Evidence E1
```

---

## 12. 文書・UI レビュー用チェックリスト

新しい文書、UI、API を追加するときは以下を確認する。

* [ ] Record と Research Record を区別している
* [ ] Data を Asset / Observation / Result に分解している
* [ ] Evidence を kind / Node として扱っていない
* [ ] Interpretation / Finding を仕様上は Result に対応させている
* [ ] status と実施の状態（execution_status）と予測の成否（supports / contradicts）を混同していない
* [ ] confirmed を科学的真偽として説明していない
* [ ] origin と actor を区別している
* [ ] 内容変更を上書きではなく Revision として説明している
* [ ] Relation の方向と predicate を正しく書いている
* [ ] `supports` / `contradicts` の個別確認を省略していない
* [ ] alpha 未実装のもの（05 §9。Observation / Result / Analysis / Assertion / Protocol / Variable / Revision / Import / RO-Crate Export）を実装済みのように書いていない
* [ ] RRS を確定済み標準または認証制度として扱っていない
* [ ] 旧語 `measurement_session` / `produced` / `contains` を使っていない（alpha の `produces` は現役の述語）
* [ ] 画面の語を alpha の表示（確定 / 却下 / 提案中 / アーカイブ、研究オブジェクト、データ、補足）で書いている（D-118）
