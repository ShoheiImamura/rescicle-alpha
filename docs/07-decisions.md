# 決定事項

> **D-01〜D-109 は Node 版（`ShoheiImamura/rescicle`、TS + Vite + Alpine、`35c6353`）の決定で、2026-09-27 に凍結して移した。** 本文は書き換えていない。コマンド名（`rescicle init` など）、MCP ツール名、画面、`.rescicle/`、節番号の参照（08 / 09 / 10 / 11 は Node 版 v0.1 の文書を指す）は Node 版のもので、alpha には当てはまらないことがある。**alpha（Rust + Tauri のデスクトップ版）の決定は D-110 から**、本書の末尾に足す。Node 版の決定を alpha が上書きするときは、D-110 以降で番号を挙げて書く。

再設計（2026-09-03）で確定した事項と、コードを書く前に決めるべき事項。

---

## 決定事項

### D-01 標準と製品の名前を分ける

* 標準: Research Record Specification (RRS)（名称は D-60 で確定）
* 製品 / Network: rescicle
* `rescicle compatible` は製品認証マーク
* 理由: Git / GitHub のように、標準を製品商標で囲い込まない。Fork や独自実装を ecosystem 拡大として扱えるようにする。

### D-02 既存標準を写像先にする。内部を RDF にしない

* 内部: SQLite の単純な関係モデル
* エクスポート（`Export`） / 公開（`Publish`）: PROV-O / RO-Crate / Nanopublication / ORCID / DataCite へ写像
* 理由: v0.1 の速度を落とさない。「新しい Ontology を発明した」ではなく「既存標準をエージェント（`Agent`）が日常的に生成する」立ち位置にする。

### D-03 ローカルファースト（`Local-first`）の定義を「暗黙のデータ送出なし（`No implicit data egress`）」にする

* エージェント実行モード A / B / C、プロジェクト（`Project`）ごとの外向きポリシー（`Egress Policy`）を Core 仕様にする
* v0.1 は Mode B（MCP 対応の汎用エージェント。検証は Claude Code、D-87）のみ、生ファイル内容（`Raw file content`）は DENY
* MVP で rescicle は推論費を負担しない（研究者本人の契約のエージェント / BYOK）

### D-04 証拠（`Evidence`）はノードではなく関係（`Relation`）

* `supports` / `contradicts` に由来（`origin`） / 状態（`status`） / confidence を持たせる
* 理由: 測定（`Measurement`） / 観測（`Observation`） / 証拠の混同を減らし、結果（`Result`）と表明（`Assertion`）の関係を自然に表せる。

### D-05 観測と結果は生成元 Activity で区別する

* 測定から直接 → observation
* 分析（`Analysis`）経由 → result
* 理由: 例示ではなく機械的に判定できる規則にする。PROV の wasGeneratedBy と整合する。

### D-06 レコード（RRS Record）は不変のリビジョン（`Revision`）で持つ

* records（識別子）+ record_revisions（スナップショット）+ record_events（状態変更）+ relations（append-only、撤回はフラグ）
* タイムライン（`Timeline`）は導出。別テーブルにしない
* 関係は特定リビジョンを指せる
* 理由: HARKing 対策。実験前後・投稿前後の文言を判別できる。

### D-07 MCP はレコード読み書きツール（`Tool`）に限定し、Reasoning を持たない

* `propose_hypothesis()` の類は作らない
* 理由: 特定エージェントの Reasoning 方式に依存しない。

### D-08 MCP 経由のレコードは必ず proposed。confirm には研究者発言の引用を必須にする

* create_record に状態引数を持たせない
* confirm / reject は `researcher_statement` 必須、actor=researcher_via_agent としてイベント（`Event`）に残す
* ビュー（`View`）からの confirm は actor=researcher
* 例外: register_asset / extract_observations が origin=system で作るレコードは confirmed。ファイルの存在と機械的に読み取った値は Deterministic Core が確定できる（05 §3 kind ごとの確認要否）。note も確認不要で confirmed
* 理由: 成功条件「Agent が勝手に確定した Record が残っていない」を Server 側で保証し、監査可能にする。
* 限界: エージェントが SQLite を直接書けば迂回できる。セットアップで `.rescicle/` への直接アクセスをエージェント側の権限で deny する（手順はエージェントごと。11 §4）。

### D-09 不明点（`Unknown`）をレコードの kind にする

* **D-109 で廃止**（2026-09-26）: 不明点は項目にせず、対象に about で付けたメモ（note）に書く。以下は当時の記録
* `unknown` kind、`about` で対象を指す。解消は当初 archived + `resolved_by` としたが、D-54 で「`resolved_by` を明示 confirm し status は変えない」に改訂
* 理由: 「分からないことを埋めない」を構造として持つ。欠けている文脈（`Missing Context`）の集計表示に使う。

### D-10 述語（`predicate`）は固定（D-31 以降 13 個）。`contains` / `produced` は `generated` に統合

* addresses / predicts / tested_by / generated / used / derived_from / supports / contradicts / based_on / about / resolved_by / discriminates / related_to（D-31 で `discriminates` を追加し 13 個）
* `derived_from` は observation / result → asset のみ。測定との関係は `generated` で表す（重複排除）
* 述語と kind の組み合わせはサーバー（`Server`）が作成時に検証する
* 分野固有はドメイン拡張（`Domain Extension`）

### D-11 v0.1 の kind は 9 個。analysis / assertion は RRS で定義するが実装しない

* question / hypothesis / prediction / measurement / observation / result / asset / unknown / note
* result は当初除外していたが、supports / contradicts の subject が v0.1 に存在しなくなるため追加
* 理由: マイルストーン（`Milestone`）を増やさない。

### D-12 ビューから Discuss ボタンを外す

* v0.1 ではビューからエージェントの会話へ割り込めない、が当初の理由。D-89 で会話は View の chrome（Agent パネル）にあるので、割り込みボタンは不要なまま外す
* ビューから可能なのは確認 / 却下（`Reject`） / アーカイブ / 撤回と allowed_roots の登録。レコードの作成はしない（09 §2.3）。パネルは `create_record` のフォームではない

### D-13 Free / Pro の境界は「頼めばやってくれる / 頼まなくてもやってくれる」

* 最初の Wow の瞬間（対話 → マップ → データ接続）はすべて Free

### D-14 id は UUID v7

* 時系列ソート可能、マージ可能、エクスポート時に urn:uuid として使える

### D-15 状態は curation 状態であり、科学的真偽ではない

* confirmed の仮説（`Hypothesis`）は「研究者が候補として認めた」の意味
* 支持・否定は `supports` / `contradicts` 関係で表す
* archive はどの状態からも可能

### D-16 create_record の kind と由来を制限する

* kind: question / hypothesis / prediction / result / unknown / note（result は D-21 で追加）
* 由来: researcher / agent
* asset / measurement / observation は専用ツール（register_asset / create_measurement / attach_assets / create_observation / extract_observations）経由のみ
* 理由: 拡張テーブルのないレコードや到達不能な由来をエージェントが作れないようにする

### D-17 プロジェクトはフォルダ、DB は `.rescicle/rescicle.db`

* MCP サーバーは cwd から上位へ `.rescicle/` を探してプロジェクトを解決する
* 外向きポリシーは `.rescicle/policy.json`

### D-18 アセット（`Asset`）は path ごとに 1 レコード。同一 sha256 は警告のみ

* `metadata.duplicate_of` に既存アセットの id を記録する
* 理由: path 複数対応のテーブル分割は v0.1 に不要

### D-19 observations 拡張テーブルは定量観測のみ

* property / value_json は NOT NULL、定性観測は body のみで拡張行を作らない
* subject_id は持たず、`generated` 関係で測定と結ぶ（旧 U-07 を解消）

### D-20 get_research_context の選定基準を固定する

* 問い（`Question`） / 仮説 / 予測（`Prediction`） / 不明点 / 証拠 / 未確認の提案（`Pending proposal`）（由来を問わない）/ 未確認の判断的関係は全件、測定 10 件、観測 20 件、結果 20 件、メモ（`Note`） 5 件、record / relation events 10 件ずつ（D-52 で改訂）
* 関連度による絞り込みは v0.2

### D-21 result kind を v0.1 に含め、エージェントの解釈は result、Core の機械読み取りは observation とする

* Core が CSV から読み取った値は `extract_observations` で observation（origin=system、confirmed）
* エージェントの解釈は `create_record(kind="result")`（origin=agent、proposed）。based_on 必須
* result → prediction / hypothesis を `supports` / `contradicts` で結ぶ。これが成功条件 4 の経路
* note に `rrs_kind=result` を持たせる案は撤回
* 理由: v0.1 に analysis kind がなくても証拠を仮説に結べるようにする。拡張テーブル不要でマイルストーンも増えない

### D-22 関係の confirm は述語の性質で二分する（D-51 で判断的区分に改訂）

* 構造的（addresses / predicts / generated / used / derived_from / based_on / about / resolved_by / related_to）: 両端のレコードが confirmed になった時点でサーバーが自動 confirm。system が作る関係も proposed で作り、両端 confirmed なら即座に自動 confirm（例外なし、D-38）
* 判断的（tested_by / discriminates / supports / contradicts。うち後 2 つが証拠的）: confirm_relation / reject_relation（statement 必須）またはビューで個別に confirm（D-51 で tested_by / discriminates を追加）
* 「関係から状態を外す」案は不採用。supports は科学的主張そのもの
* 理由: 関係が永久に proposed のままになりエクスポートに一つも出ない問題を解消する

### D-23 measurement は proposed、system / confirmed はアセットと generated 関係のみ

* create_measurement は origin=researcher / agent 引数付き。装置（`instrument`） / 試料（`sample`）はエージェントの申告で Core は検証できない
* アセットは system / confirmed。`measurement --generated--> asset` は proposed で作り、測定の confirm で自動 confirm（D-38 で改訂）
* 05 §3 の確認要否表で measurement を「確認が必要」側へ移動

### D-24 revise_record 後の状態は必ず proposed

* confirmed / rejected どちらからも proposed に戻る。遷移図に revise 辺を追加
* 理由: エージェントが confirmed レコードの文言を書き換えて confirmed のまま残せない。rejected からの復帰経路も明示される

### D-25 archive_record / retract_relation は researcher_statement 必須

* 例外: 対象が proposed かつエージェント自身が作ったものは reason のみで可（自分の提案の取り下げ）
* 理由: エージェントが confirmed レコードをマップから消せないようにする

### D-26 外向きポリシーは `.rescicle/policy.json` のみ

* projects テーブルの egress_policy_json は削除
* 理由: 研究者が編集しやすく、DB を配布してもポリシーが漏れない

### D-27 計画段階の測定は metadata.execution_status + attach_assets（U-08 案 B）

* create_measurement(execution_status=planned) で作る。状態は curation のみ。アセットの有無で実行状態を判定しない
* 実行後は attach_assets で同じレコードにアセットを結び、execution_status=completed のリビジョンを積む（レコードは 1 つ、リビジョン 1 が計画、リビジョン 2 が実行）
* 研究マップ（`Research Map`）では PLANNED を破線表示。PROV では planned を prov:Plan に写像
* 当初の bool `planned` は 3 回目レビューを受けて enum に変更
* 案 A は D-15 に反するため不採用。案 C は測定固有の情報（装置・条件）を置けないため不採用
* 理由: 予測からの tested_by を張り直す必要がなく、将来の Automatic capture も「既存レコードに結ぶ」同じ経路で済む。計画がデータに先行した証拠がレコードに残る

### D-28 次の測定（`Next Measurement`）は「識別予測（`Discriminating Prediction`） + 計画測定（`Planned Measurement`）」の組で表す

* discriminates の表現は D-31（関係）に変更

### D-29 提案ビュー（`Proposal View`）は由来を問わず proposed を全件表示する

* 研究者由来 / エージェント由来 / 証拠的関係でグループ分け
* 理由: origin=researcher の proposed（Wow 画面の H1）を confirm する経路がビューに必要

### D-30 create_record の created イベントは actor=agent、created_via=mcp

* origin=researcher でも同じ。誰の発言かは origin、操作主体は actor

### D-31 discriminates は関係にする（U-06 解決）

* `prediction --discriminates--> hypothesis`。当初は構造的関係としたが、D-51 で判断的（明示 confirm 必須）に改訂
* 述語は 13 個になる
* 理由: metadata 内の UUID 配列は参照整合性・エクスポート・互換性テスト（`Compatibility Test`）のいずれでも検証できない。「12 個で固定」より検証可能性を優先する

### D-32 アセットの識別子は path、内容はリビジョン（U-09 解決）

* path はプロジェクトルート（`Project root`）からの相対パスを正規化したもの
* 同じ path で sha256 が変わったら同じレコードに新リビジョン。assets 拡張テーブルは record_revision_id で持つ
* observation / result の `derived_from` は object_revision で旧内容を指し続ける。PROV は wasRevisionOf
* 「新アセット識別子 + 関係で接続」案は述語が増えるため不採用
* 理由: 不変リビジョン原則をそのままアセットに適用でき、新しい述語も不要

### D-33 マイルストーンは縦に一本通す Walking skeleton から始める

* UI 単体のマイルストーンは置かない。0 Decision packet → 1 Walking skeleton → 2 File safety → 3 証拠 → 4 Discriminating → 5 リビジョン / タイムライン → 6 パイロット（`Pilot`） → 7 エクスポート
* 理由: 会話 → レコード → 関係 → 確認 → マップの一往復が最も不確実で、最初に検証すべき

### D-34 v0.1 の RRS は draft。互換性テストと認証は後回し

* invariant は v0.1 の実利用で検証されてから固定する
* 理由: 標準を固める作業より、縦に動く体験とデータ保全を優先する

### D-35 パイロットの成功閾値を事前に定める

* 3〜5 名、15 分課題、8 項目ごとの閾値、フォーム入力との比較（08 §12）
* 成功条件 6（エージェントが勝手に確定したレコードがない）は必須

### D-36 実装契約を 09-implementation-contract.md に固定する

* 冪等性（`Idempotency`）、SQLite 設定とトランザクション（`Transaction`）、Local Web の bind / token / Origin、ファイル境界、タイムスタンプ、マイグレーション（`Migration`）、エラーコード、status × action 表、エクスポート規則
* 理由: 実装者ごとに判断が揺れる箇所を先に固定する

### D-37 事業計画を 04-business.md に分離し、検証を 2 段階にする

* 01 は「何を作るか」、04 は「なぜ売れるか、誰に、いつ」
* 検証は 15 分の Wow 試験（08 §12）と 4 週間のデザインパートナー（`design partner`）試用（04 §2）の 2 段階
* 最初の顧客は物性・材料系の実験研究者。計算科学と臨床は v0.2 以降
* Paper Copilot の前倒しは不採用。レポート生成を Pro の最初の候補にする（U-12）
* 理由: 技術文書に対して事業側の根拠（競合、顧客、時間軸）が欠けていた

### D-38 system が作る関係にも例外を置かない

* すべての関係は proposed で作られ、両端 confirmed なら即座に自動 confirm される一般規則のみ
* `observation --derived_from--> asset` は両端 system / confirmed なので即確定。`measurement --generated--> asset / observation` は測定の confirm を待つ
* 理由: 「片端 proposed なのに confirmed」という矛盾を例外列挙で管理するより、例外ゼロの方が実装もテストも単純

### D-39 アセットは識別子（assets）と内容（asset_revisions）を別テーブルにする

* assets(record_id, project_id, path) UNIQUE(project_id, path)、asset_revisions(record_revision_id, sha256, ...)
* 理由: リビジョン行ごとに path を持つと UNIQUE が成立しない

### D-40 kind 固有属性はリビジョン単位で持つ

* measurement_revisions / asset_revisions / observation_revisions を record_revision_id で持つ
* revise_record は extension 引数で kind 固有属性を受け、同一トランザクションで拡張行を作る
* attach_assets は実測時刻・実測条件を受け取り、completed の新リビジョンを積む
* 理由: 計画時に未定だった値や実行後の訂正で過去リビジョンの内容が変わらないようにする

### D-41 関係は Revision 固定を原則必須にし、revise 時にサーバーが再提案する

* predicts / tested_by / supports / contradicts / based_on / derived_from / discriminates は両端 pin 必須。他は省略時に current を記録
* revise_record は旧リビジョン端点の関係を新リビジョンに pin した proposed コピー（origin=system、metadata.reproposed_from）として作る。構造的なものは再 confirm で自動確定、証拠的なものは個別再判断
* 関係の UNIQUE は revision id を含む
* 理由: 旧文言について確認した関係が新文言に無審査で引き継がれない。再提案をエージェント任せにしない

### D-42 関係の状態は proposed / confirmed / rejected、撤回は retracted_at、履歴は relation_events

* 理由: タイムラインが関係の完全な状態履歴を再構成できる

### D-43 note は revise 後も confirmed

### D-44 述語検証は許可三元組の完全列挙

* 09 §2.4。based_on の object は hypothesis / prediction では広く、result では observation / result のみ
* origin=agent の hypothesis / prediction / result は based_on 必須（サーバー強制に）

### D-45 エクスポートで planned リビジョンを別 URI の prov:Plan に展開する

* 内部レコードは 1 つのまま。レコード URI は prov:Activity、planned リビジョン URI が prov:Plan。エクスポート gate で確定
* 理由: D-27 の利点（関係の張り直し不要、Automatic capture との同一経路）を保つ

### D-46 外部送信 DENY はツール全体を拒否、allowed_roots は policy.json

* file_metadata=DENY で path と size を返す契約は撤回。REDACT は v0.2
* allowed_roots の登録はビューまたは add_allowed_root（statement 必須）。MCP の root_path 引数は登録済み root の子であることを検証
* v0.1 はプロジェクトルート内のみ

### D-47 Local Web の token は fragment 経由で Cookie に交換し、全 API を認証対象にする

* rotation はビュー再起動時。Origin 欠落も拒否。CSP と text 描画

### D-48 idempotency_key は必須、request_hash で衝突検出

### D-49 テスト戦略を 09 §12 に置き、マイルストーンの完了条件に番号で対応させる

### D-50 はじめにをマイルストーン 0 の成果物にする

* 11-setup.md。MCP 設定例、policy.json 例、権限の拒否設定（`permission deny`）と検証手順、非機密データ限定の注意
* パイロットは非機密データに限る

### D-51 tested_by と discriminates を判断的関係に移す（D-22 改訂）

* 区分は構造的（addresses / predicts / generated / used / derived_from / based_on / about / resolved_by / related_to）と判断的（tested_by / discriminates / supports / contradicts）。判断的のうち supports / contradicts が証拠的
* 判断的は両端 confirmed でも自動確定せず、confirm_relation またはビューで明示 confirm
* ビューはレコードと付随する判断的関係を 1 カード 1 操作に束ね、イベントは別に記録する
* 理由: 両端 confirmed の間にエージェントが張った tested_by / discriminates が誰の確認もなく confirmed になる穴を塞ぐ。成功条件 6 の検査が actor=system の自動確定を見ないため

### D-52 get_research_context に 結果 / 証拠 / 未確認の関係 / relation_events を含め、未確認は由来を問わない（D-20 改訂）

* 理由: confirmed の結果と証拠がコンテキストから落ち、エージェントが次の会話で主要な研究結果を忘れる

### D-53 revise 時の関係引き継ぎは「リビジョンの作り手 × 述語」の継承表で決める（D-41 改訂）

* system のリビジョン（アセット再登録）は confirmed を維持し、関係を引き継がない。旧内容から得た observation は旧リビジョンに残し、新内容には extract_observations を再実行
* エージェント / 研究者の revise は 05 §4 の表に従い proposed コピーを再提案
* 理由: 旧 CSV から得た observation を新 CSV 由来として捏造しない

### D-54 不明点の解消は archive ではなく resolved_by の明示 confirm

* **D-109 で廃止**（2026-09-26）: unknown と resolved_by を無くした。以下は当時の記録
* resolve_unknown は unknown を confirmed にし（statement は unknown の Event）、resolved_by は構造的の自動 confirm に任せる（D-63 で改訂。当初は resolved_by を明示 confirm としていた）
* 欠けている文脈は「confirmed の resolved_by を持たない proposed / confirmed の unknown」
* archive は関係なくなった不明点専用
* 理由: archived を端点にすると resolved_by が永久に proposed になりビューとエクスポートから消える。例外ゼロ（D-38）を守る

### D-55 policy.json 欠落は fail-closed、ポリシー変更は project_events に記録

* 全ツールが E_POLICY_MISSING。default は init_project が書く
* records.<kind>=DENY は端点 id も返さず関係ごと落とす（REDACT は v0.2）
* 理由: 暗黙のデータ送出なしを default 復帰で破らない

### D-56 DB bootstrap と防御

* records.current_revision_id は NULL 許容の DEFERRABLE FK。INSERT 順を 09 §5 に固定
* records に created_by を持つ（archive 例外の判定に使う）
* SQLite trigger で actor=agent の confirmed イベントと、イベントを伴わない状態更新を拒否（多層防御。外部プロセスが trigger を消す場合は権限の拒否設定で補う）
* init_project は idempotency_key の対象外。CLI と MCP は同じ Core 関数

### D-57 Research View の HTTP endpoint と DTO を MCP と共有する

* 09 §13。DTO の JSON Schema を両方のテストで共有

### D-58 顧客インタビュー記録は匿名化して docs/interviews/ に置く

* 参加者は ID（P1, P2 …）で呼び、所属・研究テーマの固有名詞・装置名の型番は書かない。実名と連絡経路は .review/（gitignore）
* 理由: 分野と所属で個人が特定される

### D-59 事業計画に価格・原価・粗利の仮説を数値で置く

* 04 §3。数値は検証対象の仮説で、デザインパートナーインタビューで支払意思を聞いて更新する


### D-60 標準の名称を Research Record Specification (RRS) で確定する

* 「仮称」の注記を全文書から外す。U-04 は商標調査のみ残す

### D-61 Record は kind ごとのテーブルを作らず、records 1 テーブル + kind 固有の拡張テーブルで持つ

* question / hypothesis / prediction / result / unknown / note は `records` + `record_revisions` のみ。kind 列で区別する
* 固有の列を持つ 3 kind だけ拡張テーブルを持つ。measurement → `measurement_revisions`、observation → `observation_revisions`、asset → `assets` + `asset_revisions`
* 理由: Relation の subject / object が `records.id` 一本で参照でき、predicate × kind の検証は `records.kind` を見るだけで済む。Revision / Event / status 遷移 / trigger を 1 か所に書ける。予約 kind（analysis / assertion）の追加に schema 変更が要らない
* 代償: kind 固有の必須列を DB の NOT NULL で守れないため、JSON Schema と Server 側検証（09 §6）に寄せる。1 Project = 1 DB で規模は小さく、records の肥大は問題にならない
* ERD は design/erd/rescicle-v0.1-erd.puml


### D-62 Graph の 1 ノードの名前は Record を維持する

* 実装・DB・API は `record` / `records` / `record_revisions` / `record_events` / `create_record` のまま。`node` や接頭辞付き `rrs_records` への改名はしない
* 仕様文書では裸の Record ではなく **RRS Record** と書き、Project 全体の Graph は **Research Record Graph** と呼んで単数形同士の混同を避ける
* UI には Record という語を出さず、kind 名（仮説 / 測定 / 結果 …）を表示する
* TypeScript を採用した場合、クラス名は `RrsRecord` にして組み込みの `Record<K, V>` と衝突させない。名前空間は `rrs:Record`
* 理由: 汎用名だからこそ Question / Measurement / Asset を同じ Revision 機構で扱える。新しい Ontology 語彙を増やさない。Project 専用 SQLite なので `records` の文脈は明確で、接頭辞は冗長。`node` は Graph 実装に概念を引っ張られる
* 改名候補（node / entity / item）の比較は本決定で閉じる

### D-63 resolved_by は構造的のまま。resolve_unknown は解消先 confirmed を前提に unknown を confirmed にする

* **D-109 で廃止**（2026-09-26）: resolve_unknown と resolved_by を無くした。以下は当時の記録
* 例外を作らない（D-38）。研究者の statement は unknown 側の record_events に残す
* 解消先が proposed なら E_INVALID_TRANSITION。先に解消先を confirm する
* 理由: 「構造的なのに明示 confirm」という二重定義を消す

### D-64 Agent が archive / retract できるのは status=proposed かつ origin=agent かつ created_by=agent のみ

* MCP 経由の created_by は常に agent なので、origin を条件に加えないと origin=researcher の未確認 Record まで Agent が消せる
* 理由: 研究者の発言をエージェントが起こした Record は研究者のもの

### D-65 価値・戦略要求・コンセプトは docs を正本にし、PUML は図とする

* C1〜C3 は 01 §15、V1〜V13 と S1〜S9 と価値指標は 04 §2 / §7、F13 / F15 / S9 は 08 §4 / §11 と 09 §14 / §15
* design/README の「正は docs」を守る。PUML だけに存在する要求を作らない
* 理由: 実装者が docs だけ読んでも要求を失わない

### D-66 Mode C の時期は「段階 3 と並行、v0.2 の最初の機能として企業 R&D pilot」

* S8 / F14 / 04 §3 を同じ表現に揃える

### D-67 既存 Project の policy.json 再生成は `rescicle policy init`

* init_project は E_PROJECT_EXISTS になるため、default を再生成する専用コマンドを置く。project_events に記録
* 理由: fail-closed（D-55）で全 Tool が止まったときの回復経路が必要

### D-68 Claude が導いた Hypothesis / Prediction は研究者が同意しても origin=agent

* 08 §9 step 2 の P1 は origin=agent。研究者の「うん」は confirm であって由来ではない
* origin=researcher は研究者が自分の言葉で述べた内容に限る
* 理由: D-30 と整合し、成功条件 2・3（Agent の提案が confirmed で残る）を正しく計測できる

### D-69 確認カードは相手端点 confirmed の判断的 Relation だけを束ね、1 transaction で確定する

* 相手端点が proposed の Relation は waiting_on として表示し confirm しない
* 順序: Record → 構造的自動 confirm → 束ねた判断的 Relation。途中失敗は全 rollback（09 §4）
* 理由: 判断的 Relation の confirm は両端 confirmed が前提で、順序を決めないと E_INVALID_TRANSITION が出る

### D-70 read ツールの呼び出しは `tool_calls` に追記する

* idempotency_keys は write 専用で、read ツールの呼び出しは残らない。送信範囲の説明（09 §14）の「実際の呼び出し履歴」の出典として、tool_name / egress_class / created_at だけの追記専用テーブルを持つ
* 引数と結果は保存しない。保持は無期限
* 理由: 情報セキュリティ担当への説明に「何を何回送ったか」が要る。write は Event が正なので二重に記録しない

### D-71 v0.1 のビューから変えられる policy は allowed_roots の追加だけ

* allowed_roots の削除と records.* / file_* の ALLOW / DENY 変更は policy.json の手動編集。Core は sha256 の差分で検知し policy_changed（statement="manual edit"）を記録する
* 理由: 09 §2.3 のビューの操作範囲を広げない。削除と DENY 化は頻度が低く、fail-closed の policy を UI から壊す経路を増やさない

### D-72 permission deny の状態は研究者の「申告」として記録する

* ビューの「拒否を確認した」で project_events(permission_deny_declared, actor=researcher, created_via=view) を書く。送信範囲の説明には「研究者の申告（日時）」として出す
* 理由: Core はエージェント側の設定を検証できない。検証できないものを「設定済み」と表示しない

### D-73 wireframe は 1 つの fixture から件数と状態を取る

* design/view/_fixture.json（08 §9 の step 8 直後）を唯一の元とし、各画面の data 属性を design/view/check.py が照合する
* 理由: 画面ごとに状態が食い違うと受入仕様にならない

### D-74 Research View はオブジェクト指向 UI（OOUI）で組む

* ナビゲーションはオブジェクト名（ホーム / 項目 / 履歴 / プロジェクト → D-92 で マップ / 一覧 / 履歴 / プロジェクト）。「未確認」は項目一覧の status フィルタであり、独立したタスク画面にしない
* 操作（確認 / 却下 / アーカイブ / 撤回）は画面ではなくオブジェクトの状態（09 §2.1 / §2.2）で決まり、マップ・一覧・ホームのどこで選んでも同じ詳細パネルと同じ操作が出る
* 判断的関係は項目の詳細の中でシングル view（履歴と撤回）を持つ。履歴の対象はリンクにする
* 詳細部品は `ItemDetail`（= RecordDetailDTO、09 §13）1 種類で、マップの右パネルと一覧の行が共有する。CTA は 09 §2.1 をそのまま使い、未確認の項目にもアーカイブを出す（却下と違い、判断せずに片づける操作）
* オブジェクトの定義（コア内容 / メタデータ / 入れ子 / CTA / 関係 / view）は design/view/object-map.puml が正
* 理由: 「どの画面なら押せるか」を覚えさせない。項目の kind 名をそのままオブジェクト名にする D-62 と揃う

### D-75 技術スタックは TypeScript（Node 22、pnpm）、SQLite は better-sqlite3

* MCP サーバー / Core / CLI / Research View を 1 言語で書く。CSV 要約は papaparse + simple-statistics で、`src/core/summarize/` に隔離し、U-13 の結果で差し替えられるようにする
* 理由: MCP SDK の成熟、`npx rescicle` での配布、M1〜M3 の速度。科学データ処理が Python に劣る点は v0.1 の要約範囲（range / 分位点 / downsample）では問題にならない（U-01 を解決）

### D-76 npm パッケージは 1 つ、プロセスは `rescicle mcp` と `rescicle view` の 2 つ

* `rescicle mcp` はエージェント（Claude Code など）が stdio で起動し、エージェントの終了で止まる。`rescicle view` は 127.0.0.1 の HTTP で研究者が起動し、ブラウザで開き続ける
* 両方が同じ Core library と同じ SQLite ファイルを使う。View の変更検知は `PRAGMA data_version` の 1 秒ポーリング（U-03 の暫定解をそのまま採用）
* 単一パッケージ構成（`src/core` / `src/mcp` / `src/cli` / `src/view` / `schemas/dto`）。monorepo への分割は Pro を切り出すときに行う
* 理由: View がエージェントの寿命に縛られない。WebSocket 通知が不要になる
* D-89: View がエージェント CLI を子として起こすときも、`rescicle mcp` を呼ぶのはその子（または外の CLI）であり View ではない。View を閉じると自分の子だけ殺す。マップの変更検知はポーリングのまま

### D-77 Research View は Vite + TypeScript + Alpine.js

* 属性は完全形（`x-on:` / `x-bind:`）。design/view の HTML をテンプレートの元にする。ビルド済み静的ファイルを `rescicle view` が配信し、API は同じプロセスの `/api/*`（09 §13）
* 理由: 画面 5 つで状態が少なく、マップは固定レイアウトの SVG で足りる。DTO の型は MCP と共有する

### D-78 「次回の入口」は v0.1 に含め、RO-Crate はパイロット後に判定する

* U-14 は「入れる」で解決。ResumeDTO / GET /api/resume / ホームは M5 の完了条件に含める（View の表示は D-92 で外した。入口はエージェント側だけ）
* U-05 は据え置き。代わりに `rescicle export --json`（DB 全テーブルをそのまま JSON へ）を M2 に入れ、持ち出せることの最低保証にする
* 理由: 継続（S5）の指標を試用 1 週目から取る。Lock-in の不安には JSON 書き出しで答えられる

### D-79 受入テストの正本は 08 §9 のシナリオと design/view/_fixture.json

* 08 §9 の step 1〜8 を MCP ツール呼び出しの列として E2E テストに書き、実行後の records / relations / events を fixture と id・status・action で比較する
* View は同じ fixture を seed に 5 画面を描き、check.py の照合を Playwright のテストに移す
* 理由: マイルストーン 1〜5 の完了条件を 1 本のテストで機械的に確かめる。fixture を仕様の正本の一部に昇格させる

### D-80 M0 の spike とインタビューを待たず M1 から着手し、対応 OS は Windows / macOS / Linux

* U-13 の結果が変えるのは M3 の要約種別だけなので、M1〜M2 は先行する。M3 に入る前に spike の結果を得る
* ライセンスは Core が Apache-2.0、RRS 仕様（docs/05）が CC BY 4.0（U-10 を解決）。パイロットまでリポジトリは非公開。商標調査（U-04）は公開前
* 対応 OS は Windows ネイティブ・macOS・Linux。CI は Windows と Linux。path は Core 内部で POSIX 区切りの Project root 相対に正規化し、ドライブ文字と大文字小文字の差を 09 §7 のテストに加える
* 理由: 研究室の計測 PC は Windows が多く、Claude Code / Codex CLI も Windows ネイティブで動く

### D-81 Record に Project 内のラベル（Q1 / H1 / P2 …）を持たせ、会話・MCP・View で同じ名前を使う

* `records.label` = kind の接頭辞 + Project 内の連番（Q / H / P / M / O / R / A / U / N）。UNIQUE(project_id, label)。作成時に Core が採番し、変えない
* 同一性は id（UUID v7）が担う。ラベルは表示名で、Export では id と併記する。RRS の仕様には入れない（実装の便宜）
* MCP の応答・Context Builder・View・E2E fixture でこのラベルを使い、ツール引数の id にはラベルも渡せる
* 理由: C1「会話が入力、マップが確認」は同じものを同じ名前で指せて成り立つ。研究者は会話で「H1」と呼び、画面で「H1」を探す

### D-82 研究者向けの画面の語彙は docs/06 の日本語表示に限り、機械検査する

* 述語・状態・由来・操作主体は 06 の日本語表示で書く。述語コード、UUID、決定番号、節番号、endpoint、DTO 名、マイルストーン名は UI に出さない（title 属性や折りたたみに退避）
* test/view/vocabulary.test.ts が HTML の可視文字列を検査する。S1 のゴールに「研究者が自分の言葉と名前で読める」を成立条件として加える
* 理由: 匠メソッド再訪と初見レビュー（2026-09-03）で、M1 の画面が開発者の語彙で書かれていると分かった。価値デザインの「言葉」を画面に適用する規則を持つ

### D-83 仮説と予測に書き方の型を要求し、真偽は要求しない

* 仮説（hypothesis）の title は**否定しうる主張**にする。「〜が原因で〜が起きる」「〜は〜である」。名詞句（「接触抵抗の変化」「〜の影響」）は不可。これが v0.1 で求める最小限の「モデル」で、因果グラフや式は求めない
* （D-98 で改めた: 予測の必須は `metadata.expected` だけ。condition / observable はプロトコルの欄で、予測に付けると拒否する。以下は当時の記録）予測（prediction）は `metadata.condition`（どういう条件で測るか）/ `metadata.observable`（何を見るか）/ `metadata.expected`（仮説が正しければどうなるか）を必須にする。欠けていれば `E_VALIDATION`（欠けた項目名を details.missing に返す）
* 識別予測は予測の `metadata.expected_by_hypothesis`（`{ 仮説の id: その仮説が正しければ予測の結果はどうなるか }`）を持つ。入力ではラベルも受け、Core が id に正規化する。`discriminates` を張るとき、その仮説のキーが（pin された Revision の）metadata にあることを Core が要求する。つまり discriminates の object 集合 ⊆ expected_by_hypothesis のキー集合、かつ空文字なし。仮説ごとに結果が違って初めて予測が仮説を見分けられる
* Relation 側に期待値を置く案は退けた。confirm の単位が関係ごとに分散し、カード表示と Export が重くなる。`discriminates` Relation は「どの仮説を見分けるか」の参照整合性に専念させる。06 §10 の「metadata に参照を埋めない」は、Relation で辿れる参照の**複製**を禁じる規則であり、この期待値は Relation では表せない内容（結果の文）なので例外とする
* Core が見るのは**項目の有無だけ**で、文の内容（反証可能か、妥当か）は判定しない。仮説の文の型は Agent Instruction（08 §8）と create_record の説明で守らせ、Core は名詞句を拒否しない。日本語の文型判定は誤判定が多く、誤って拒否する害が大きい
* View は予測の 3 項目と「仮説 H1 が正しければ: …」を詳細・一覧・ホームの次の一手に出す。空欄は空欄のまま見せ、研究者が確認前に気づけるようにする
* 理由: 初見レビュー（2026-09-03）の seed で、仮説が名詞句だと真偽が定まらず、予測を導けず、「確認」が何を認めたのかも決まらないと分かった。D-15（status は curation であり真偽ではない）を守ったまま、構造だけを機械が見る
* レビュー（`.review/2026-09-03_d83-wording-form-review.md`）後の補足: 3 項目の必須は **origin を問わず維持する**（研究者の一言でも Core は拒否し、エージェントが対話で聞いて型に寄せる。based_on のような非対称にはしない）。その代わり Agent Instruction は「聞いていない条件は作らない、聞けなければ予測を作らず不明点にする」とし、拒否が「埋めて通す」圧力にならないようにする。RRS の仕様（05）では 3 項目と expected_by_hypothesis は任意の語彙とし、必須化は 09 §6 に置く。同じ仮説の二重指定と、全仮説で同じ結果は Core が拒否する（同一文字列の検出であり内容判定ではない）

---

### D-88 選択的公開は confirmed に加え、発言（statement）付きの rejected を「捨てた候補」として含める。archived は出さない

* 公開（Selective Publish、エクスポートの公開モード）に含める Record は 3 段で決める
  1. `confirmed`: 公開する。証拠で否定された予測・仮説は D-15 のとおり confirmed のまま `contradicts` を持つので、否定的結果はこの段で外に出る
  2. `rejected` で、却下の Event に研究者の statement があるもの: **捨てた候補**として公開する。主張（Nanopub の assertion）にはせず、来歴（PROV の reject Activity と statement）として出す。origin=agent で研究者が一言もなく却下した提案は含めない（誰も支持していない Agent の出力を外に出す理由がない）
  3. `archived`: 出さない。判断せずに片づけたもの
* 片端が rejected の関係は、その Record が 2 で公開されるなら一緒に出す（「H2 は Q1 に対する仮説だった」という配置は捨てた理由の文脈になる）。片端が archived の関係は出さない。05 §4 の「ビューとエクスポートから外れる」は現在ビューについての規則で、公開の範囲は本決定に従う
* 理由: 05 §7.2 は confirmed だけを公開するとしていたが、[02](02-science-problems.md) の K-03 / K-08 / K-60 と 04 §1 は「途中で捨てた仮説と理由が残る」ことを価値にしている。却下時の statement は「なぜその仮説を捨てたか」（K-08）そのもので、公開から落とすと約束と規則が食い違う。一方、研究者は証拠を記録する前の段階で「違うと思う」を却下ボタンで表すので（D-15 の建前では contradicts）、statement のある却下は科学的判断を含む。statement の有無で線を引くのはそのためで、確認画面は却下時に一言を求める（09 §2.3 の MCP 経路は statement 必須、View 経路は任意のまま）
* v0.1 に公開機能はない（08 §10）。`rescicle export --json` は全テーブルを出す開発者向けで、本決定の対象外。M7 の RO-Crate と Nanopub の写像（05 §7.2 / §7.3）は本決定に従う
* マップの畳み（08 §5.1）と整合させる: 却下済みを畳んだ箱を展開したとき、statement のある却下は理由を見せる

## 未決事項（コードを書く前に決める）

解決したものは D-xx に移して削除する。番号は再利用しない（U-01 → D-75、U-06 → D-31、U-07 → D-19、U-08 → D-27、U-09 → D-32、U-14 → D-78）。

### U-02 エージェント利用時のデータ取扱い条件

個人サブスクリプションで動くエージェント（Claude Code の Pro / Max、ChatGPT 契約の Codex CLI）は consumer 規約、API key は商用規約で、保持期間と学習利用の条件が異なる。v0.1 の検証は Claude Code で行うので、まず Claude Code の現時点の条件を確認して日付付きで 01-concept.md 5 章に記載する。opt-out 設定が必要ならセットアップ手順に含める。D-87 で対応するエージェントごとに同じ表を持つ（Codex CLI は 2 番目）。確認する軸は 3 つ: 保持期間、学習利用、**安全監視**（プロバイダが会話内容とエージェントの行動を分類器で読み、アカウント単位でリスク評価すること。OpenAI は 2026-09-01 の Astra の告知で明言した。Anthropic 側は未確認）。

### U-03 ビューが SQLite の変更を検知する方法

暫定解として `PRAGMA data_version` の 1 秒ポーリングを 09 §5 に置いた。パイロット後に再検討する。

エージェントが MCP 経由で書いた変更をビューに反映する。候補: ポーリング（1〜2 秒）、SQLite の更新フック、MCP サーバーが WebSocket で通知。マイルストーン 1〜2 ではポーリングで十分。

### U-04 商標調査

名称は Research Record Specification (RRS) で確定（D-60）。残るのは商標・既存プロジェクトとの衝突調査で、製品名 rescicle とドメインも含める（04 §5）。衝突が見つかった場合のみ名称を再検討する。

### U-05 エクスポート（RO-Crate）を v0.1 に含めるか

パイロット後に判定（D-78）。v0.1 は `rescicle export --json` を M2 に置く。RO-Crate はマイルストーン 7 のまま据え置き。

### U-10 ライセンス

仮決め済み → D-80（Core は Apache-2.0、RRS 仕様は CC BY 4.0）。公開前に最終確認する。

### U-11 デザインパートナーの募集経路と旗艦ラボ

物性・材料系で 3〜5 名のデザインパートナーと、Lab tier の要件を取る旗艦ラボ 1 つを確定する（04 §2）。顧客インタビュー 5 名は M6（パイロット）の前に行う（当初は「コードより先」としたが、D-80 で M1〜M5 を先行させたため期限を改めた。2026-09-04）。最初のデザインパートナー候補は 1 名確定しており、詳細は `.review/`（非公開）に置く。docs には実名を書かない。

### U-12 Pro の最初の機能

研究記録からのレポート / 進捗まとめ生成を候補とする（04 §3）。デザインパートナー試用で「頼まなくてもやってほしいこと」を聞いてから決める。

### U-13 CSV 要約の feasibility spike

Core が返す要約（列の range と基本統計）だけで Wow シナリオの「25K 付近で不連続」や、デザインパートナーの ODMR スペクトル・T2 測定（時系列 + パラメータスイープ）からエージェントが意味のある result を出せるかは未検証。マイルストーン 0 で代表 CSV 3〜5 件を借り、ダウンサンプリング / 分位点 / グループ化統計 / 変化点候補のどれを Core に入れるかを決める。結果次第で v0.1 の約束を「列構造と基本統計から検討材料を作る」に狭める。

Pass / Fail 基準: 代表 CSV 5 件について、Core の要約だけを渡したエージェントが作る result をデザインパートナーが 5 段階で評価し、4 以上が 3 件以上なら Pass。2 件以下なら要約種別を追加して再試行、それでも届かなければ v0.1 の約束を狭める。

### D-84 仮説の改訂は予測の結果文を機械的には戻さず、discriminates の再提案と View の注記で扱う

* hypothesis を revise すると、05 §4 の継承表で `discriminates` が新 Revision への proposed コピーとして再提案される。予測の `metadata.expected_by_hypothesis` の結果文はそのまま残し、Core は予測を proposed に戻さない
* View は、キーの仮説が予測の現在 Revision より後に改訂されていれば「この仮説はその後に改訂されました。結果を見直してください」を結果文に添える。直すときはエージェントとの会話で `revise_record(prediction)` を呼ぶ
* 理由: 予測を勝手に未確認へ戻すと、研究者が確認した事実（予測そのものの内容）まで取り消したように見える。見直しが要ることは判断的関係の再提案と注記で伝わる（D-83 レビュー B-4）

### D-86 部分参加（`Partial Participation`）への拡張を妨げない 3 つの制約

将来、研究者以外の参加者（装置を持つ技術者、共同研究先の測定担当、学生、再現する人、代替仮説を出す人、興味を持つ一般人）が研究記録の一部だけを担えるようにする。これは [04 §3](04-business.md) の段階 5〜6（公開 / Science ネットワーク）の話で、v0.1 に実装は加えない。ただし次の 3 点を v0.1 で閉じると後から開けないので、制約として置く。

* **origin の値集合を閉じない**。05 §3 の origin 表は rescicle v0.1 が使う値であり、RRS としては開集合とする。v0.1 の Core の CHECK 制約は現在の値で閉じてよいが、コードと docs で `origin=researcher` を「人間由来」の意味に使わない（研究者以外の人間由来の値を後から足せるようにする）。同様に `origin` を「本人か Agent か」の二値として解釈する分岐を書かない。D-64 / D-68 のように特定の値を名指しする規則はよい
* **confirm の権限と Record の作者を同一視しない**。`status=confirmed` の意味は「その Project の確認権限を持つ人が確認した」であり、「Record の作者が確認した」でも「研究者本人が確認した」でもない。05 §3 の「研究者が確認した」は v0.1 の単一ユーザー前提の言い換えとして読む。record_events の actor は役割（researcher / researcher_via_agent / agent / system）のままにし、誰が確認したかの識別子は将来 Event に付ける列として足す。識別子を ORCID に固定しない（研究者以外の参加者は ORCID を持たない）
* **status を一軸に保つ**。status は「本 Project の確認権限者による判断」だけを表す。コミュニティ検証・再現・査読・訂正の結果は status の値を増やして表さず（`verified` / `replicated` のような値を足さない）、Relation か別 Record か Network 側の属性として別の軸で持つ。proposed / confirmed / rejected / archived の意味は RRS の Core 語彙として固定する
* 理由: 論文は「問いから結論まで一人が通しでやる」単位で、部分参加の余地がない。rescicle は Question / Hypothesis / Prediction / Measurement / Observation / Result / Unknown の粒度で記録を持つので、市民科学が手作業でやっていた作業の分解が副産物として生まれる。Unknown は「誰かがやれば埋まる作業」、Measurement は仮説を持たない人が来歴付きで出せる観測、Replication は主張者と検証者が別人でよい関係として、既にモデルに入っている。開くときの最大のリスクは、参加者の confirm が研究者の confirm と同じ見た目で流通し、途中段階の主張や疑似科学が「confirmed」として広まることで、3 つ目の制約はそれを防ぐ。最初の入口は一般人ではなく「一部分だけを担う専門家」（企業技術者、共同研究先の測定担当、学生）とし、confirm の分離と帰属の設計をそこで試してから広げる

### D-87 v0.1 の Agent は MCP 対応の汎用エージェントとし、Claude Code に固定しない

* Mode B の定義を「研究者本人の契約で動く MCP 対応の汎用エージェント（Claude Code、Codex CLI など）が rescicle の MCP サーバーを呼ぶ」とする。v0.1 の検証（M6 の 15 分試験）は Claude Code で行うが、設計・実装・文言は特定のエージェントに依存させない
* docs とコードの文言は「エージェント」を主語にし、研究者向けの画面では「AI」と書く。Claude Code は「例」または「検証に使ったもの」として名指しする。過去の決定の題（D-68 など）は書き換えない
* `rescicle init` は `.mcp.json`（Claude Code など mcpServers 形式のクライアント）と `.codex/config.toml`（Codex CLI）の両方を雛形として書く。既にあれば触らない
* エージェント指示（08 §8）は MCP サーバーの `instructions` として送る。クライアントが instructions を無視する場合の保険として `rescicle agent-instruction` で同じ文を出し、CLAUDE.md / AGENTS.md に貼れるようにする
* read ツールの呼び出し記録（tool_calls、D-70）に MCP の初期化で受け取ったクライアント名と版を残し、送信範囲の説明に「呼び出したエージェント」として出す。どのエージェント（どのプロバイダ）に情報が渡ったかを Core が事実として示せるのはこの経路だけ
* 権限の拒否設定（11 §4、D-72）はエージェントごとに手順が違い、Codex CLI は読み取りを path 単位で拒否できない環境がある。拒否できないエージェントでは申告せず、送信範囲の説明には未申告と出る。申告の意味（研究者の宣言であり Core は検証しない）は変えない
* 理由: 04 §5 の「Anthropic へのプラットフォーム依存」は v0.2 の自前 Agent Runtime まで解けない前提だったが、Core は MCP の標準実装で、Claude Code 固有なのは配線と文言だけだった。国内の大学は ChatGPT の機関契約を持つところが多く、Codex CLI で動くことは配布経路として効く。U-11 の質問「Claude 利用可否」は「どのエージェントを使えるか」に広げる
* 限界: 迂回（01 §5）を防げないのはどのエージェントでも同じ。Agent Instruction を守る度合いはエージェントごとに違い、10 §5 の「Claude の振る舞いの試験」は Claude Code 以外で使う前にそのエージェントでもやる

### D-89 Research View に Agent パネルを載せる（既存 CLI を飼う。独自 Runtime は作らない）

起動の主語を研究者に戻す。`rescicle view` が本体。会話は同じ窓の chrome。作成は今どおり MCP（09 §2.3）。推論・許可ダイアログの本体・課金は研究者本人の Claude Code / Codex CLI 契約。v0.2 の自前 Agent Runtime（API 直叩き）は作らない。

**エンジン**

* View は改造していない公式バイナリを子プロセスとして起こす（Claude Code CLI / Codex CLI の `app-server`）。xterm に TUI を埋め込まない。任意コマンドのシェルを View に置かない
* 置き場所のイメージは VS Code のターミナル（マップの横に常時ある入力）まで。中身はプロンプト欄とメッセージ列。Cursor の Agent 窓と同じ種類
* 会話イベントはベンダー中立の DTO（user / assistant / tool / permission / error）に正規化する。画面の主語は「エージェント」（D-87）。Claude に固定しない
* v0.1 のパネル完了条件は Claude と Codex の両方を選べること。足場は中立 UI を先に置き、接続は一本ずつ足してよい
* MCP は今の `.mcp.json` / `.codex/config.toml` のまま、子が `rescicle mcp` を stdio で起こす。`created_via` は `mcp`。View は MCP クライアントにならない
* `--bare` は付けない。Claude の bare はサブスクの OAuth も `.mcp.json` も読まない
* API キーを View は持たない。未ログインなら View 内ログインを出さず、公式 CLI で一度ログインするよう誘導する（Anthropic は第三者製品が claude.ai ログインを仲介することを禁じる。OpenAI は `codex app-server` を製品埋め込みの口として出している）

**セッション**

* パネル内の生きた接続は常に一つ。セレクタで切替。二会話を並べない
* プロジェクト排他はしない。外の Claude Code / Codex 窓との同時は今どおり許す（WAL + `BEGIN IMMEDIATE` で Core は壊れない。困るのは提案の意味の二重化で、確認は View が一本）
* 会話は View プロセスのメモリだけ。再起動・切替・再読み込みでスレッドは消える。Record にも `.rescicle` にも書かない。再開の正はマップと `get_research_context` / `get_resume_context`
* 前回選んだベンダーも記憶しない

**許可**

* rescicle の MCP ツールと、プロジェクト内の Read（CSV など）は自動許可
* Write / Edit / Bash / コンピュータ利用、および `.rescicle` は既定拒否。例外はその場でパネルが聞く。記憶はセッション限り
* View が子を起こすとき 11 §4 の deny を渡す。Codex で path deny できない環境は D-87 のとおり申告しない

**画面**

* 全ページの chrome。ナビに「会話」は置かない（オブジェクトではない、D-74）
* 右に幅固定の Agent。マップが残り幅。項目を選ぶと詳細はマップ上のドロワ（Agent を外さない）。狭い幅では Agent を下に落としてよい
* マップの選択は入力直上のチップ（`H1` など）で見せ、送信時だけエージェントに添える。チップを外せば添えない。選択は confirm にしない
* パネルは最初から見える。子はまだ起こさない。PATH に CLI が一本ならそれを使い、最初の送信で起こす。二本なら選ばせる。ゼロならマップと確認だけ動く
* View を閉じたら自分の子だけ殺す。外窓は触らない
* 生成中も View の確認 / 却下は受け付ける。マップは `data_version` のポーリングのまま（D-76、U-03）

**パイロット**

* 間に合えば被験者は `rescicle view` だけ開く。入っている CLI 一本でよい。08 §12 の合否は変えない
* パネル未了なら今の二窓で M6 を止めない

* 理由: C1（会話が入力、マップが確認）が物理的に二窓だと Wow の切替コストになる。入力を View に足しても、推論ループを自前にすると 08 が避けた Runtime になり、課金と許可と規約が rescicle の製品になる。公式 CLI を飼れば作成経路（MCP）と actor 規則は今のまま
* 限界: CLI のヘッドレスプロトコル（Claude の stream-json / Codex の app-server）は版で変わりうる。Anthropic が SDK / `claude -p` をサブスクと別メーターにする案は 2026-06 に凍結済みで、再導入されうる。迂回は今どおり Core では防げない。U-02 はパネルでも閉じない（会話は外部 LLM に出る）

### D-90 Octopus と同じ公開サイト競争には出ない。rescicle は Research Working Environment

* Octopus = Primary Research Record（研究版の出版先）。rescicle = Research Working Environment（研究版の VS Code / Git / Claude Code）
* 「研究を小さい単位に分解してグラフとして公開するサービス」として正面から勝とうとしない。公開の手前の私的な作業環境で、研究活動から構造が生まれることを第一原理にする
* Octopus / RO-Crate / Nanopublication / Zenodo / 論文は出口。Octopus の普及は脅威ではなく追い風として扱う
* 自己認識「研究記録の新しい形式を発明した」は捨て、「既存標準を人間が意識せず使える AI-native な研究環境」にする
* 詳細は [03-positioning.md](03-positioning.md)。競合表は [04 §1](04-business.md)
* 理由: Octopus は 2018 構想・2022 正式リリース、Jisc / 非営利 / UKRI、ORCID・DOI・versioning 済み。同じ山は負け筋。Author Guide が journal submit 型のフォームであることに隙間がある
* 含意: v0.1 の中心を公開グラフ・DOI・査読にしない。入力フォームを作り込みすぎない（Chat / Files / Map / Timeline）。private な履歴を第一級にする

### D-91 プロジェクト名は勝手に決めない。既定はフォルダ名、変更は研究者の言葉で

* `rescicle init` / `init_project` の `name` は省略可。省略時は `basename(root)`（フォルダ名）
* エージェントは研究者が言っていない名前を `init_project` に渡さない。エージェント指示（08 §8）に明記
* 変更は `update_project`（MCP、`researcher_statement` 必須、actor=researcher_via_agent）と `rescicle rename <name> [--description]`（CLI、actor=researcher、created_via=cli）。同じ Core 関数 `updateProject`
* `project_events` に `project_updated`（details に name / description の from / to）を残す。schema 0003 で `action` の CHECK を作り直す
* View からの編集は置かない（v0.1）。名前を直す場所は会話か CLI
* 理由: 1 フォルダ = 1 Project（09 §1）なので、フォルダ名がすでに事実上の名前。init で別に名前を求めると docs の例（"Low temperature project"）をそのまま打つことになり、自分の研究と関係ない名前が残って直せなかった（0.1.0-alpha.1 を実際に入れて分かった）
* 含意: 11 §2 の手順は `rescicle init` だけ。名前の話は「研究者が言ったら変える」に寄せ、init の必須入力を増やさない

### D-92 最初に見せるのはマップ。ホームは置かない

* `/` は研究のマップ。ナビは マップ / 一覧 / 履歴 / プロジェクト（項目のサブナビ「マップ｜一覧」をトップに昇格）
* ホーム画面（前回の続き / 問い / 次の一手 / 確認をお願いしたいもの / 分かっていないこと / 最近の判断）は廃止。当初は「前回の続き」だけマップの上に 1 行残したが、実際に見ると要らなかったので外した（未確認の件数はナビのバッジ、不明点と計画測定はマップに出ている）。permission deny 未申告の案内だけマップの上に出す
* `get_resume_context` / `GET /api/resume`（ResumeDTO）は変えない。エージェント側の入口はそのまま
* D-74 のナビ、D-78 の「ホーム = 次回の入口」はこの形に読み替える。design/view/01-home-resume-v1.html は参照のみ
* 理由: ホームの 6 区画のうち 5 つは研究ビューに既にある（問い = マップ上部、次の一手 = 予測、未確認 = 破線、不明点 = 右のノード、最近の判断 = 履歴）。0.1.0-alpha.1 を実際に使うと、開いてまず見たいのはマップで、ホームは 1 クリック余計だった

### D-93 View の見た目は 1 つのトークン集合で揃える（shadcn/ui 風、フレームワークは入れない）

* `app.css` の先頭に色・境界・角・影の CSS 変数（zinc の中立色、1px の薄い境界、8px の角、控えめな影）を置き、全部品（ヘッダー、カード、ボタン、チップ、表、帯、入力）がそれだけを参照する
* 部品の種類は shadcn/ui に倣う: ボタンは outline（既定）/ primary（黒塗り）/ danger / ghost、状態フィルタは pill のトグル、ナビは muted 背景のタブ、表は縦線なしで行区切りだけ
* CSS フレームワークや外部フォントは入れない（CSP は self のみ。ローカルファーストの View から外に出る要求を作らない）
* 状態（確認済み / 未確認 / 却下）は引き続き線種と記号でも表す（`design/view/_wireframe.css` の方針）。色は補助
* 理由: alpha.1 の画面は wireframe の線画をそのまま出していて、画面ごとに部品の見た目がばらついていた。フレームワークを使ったような統一感が要るが、依存を増やすほどの規模ではない

### D-94 マップは実寸が既定。向き（上→下 / 左→右）と俯瞰はトグルで切り替える（試行）

* 既定は実寸（viewBox の 1.2 倍。箱の文字が本文と同じ大きさ）。枠より広ければ横スクロール
* 「全体を見る」で枠に収める俯瞰、「横に並べる」で仮説を左に置いて段を右へ伸ばす向きに切り替える。どちらもブラウザ（localStorage）に残す。`?dir=lr` でも指定できる
* 横向きはレイアウトを上→下の座標系で計算して出力時に転置する実装（`map-layout.ts` の `Orientation`）。線の文字の位置だけ向きごとに調整
* 図中の文字に下線は付けない（枠がリンクであることは形で分かる）
* 理由: alpha.1 の縮尺表示は文字が読めなかった。向きは「仮説が縦に並ぶ方が読みやすいか」を実物で見て決めるための試行で、微妙なら lr を外す

### D-95 マップと一覧は同じ画面の 2 つの見せ方。操作は右の詳細パネルだけに置く

* トップナビから「一覧」を外す。マップのカードの左上に「マップ | 一覧」の切り替えを置き、右の詳細パネル（ItemDetail）と選択中の項目は両方で共有する
* 一覧は表（名前 / 内容 / 由来 / 状態 / 作成）だけにし、行の中の関係表と確認 / 却下 / アーカイブのボタンは外す。行を選ぶと右に詳細と操作が出る（マップの箱を選んだときと同じ）
* 状態フィルタ（未確認 N / 確認済み / 却下 / すべて）と種類フィルタ、由来によるまとめ（あなたの言葉 / エージェントの提案 / 証拠）はそのまま。未確認の件数はナビのバッジではなく「未確認 N」のフィルタに出す
* `/?tab=list` は一覧を開いた状態の URL として残す（プロジェクト画面の件数リンクが使う）
* 理由: マップからでも一覧からでも同じ操作ができるなら、画面を分ける意味がなく、一覧に操作と関係を全部並べると詳細パネルと二重になる。一覧は「並べて眺める」ための表示に絞る

### D-96 マップでは状態を文字で書かず、濃さで表す

* 箱の 1 行目は「種類 ラベル」（測定だけ「· 計画中 / 実測済み」を添える）。「確認済み / 未確認」の文字と ● ○ の記号は出さない
* 確認済み = 濃い実線の枠と濃い文字、未確認 = 薄い破線の枠と薄い文字、却下 = 灰色。線も同じで、確定は実線、未確認は破線。線の文字は述語だけ
* 由来（あなた / エージェント）も箱や詳細には書かない。箱は「種類 ラベル / 題」の 2 行。問いは上部領域に題と状態を置く。由来は一覧の列とまとめで見る
* 段の並びで意味が決まる線（予測・検証・生成・由来）には文字を書かない。書くのは 見分け・支持・矛盾 と、選択中だけ描く 根拠・不明点・関連・解消。対応（`addresses`）は問い別フィルタの所属情報に使い、SVGには描かない
* 一覧では状態と由来、詳細では状態、履歴では出来事と操作者を文字で出す（表なので濃さでは読めない）
* 理由: 問いの「確認済み」（エージェントの書き起こしが意図どおり、D-29）は研究者にとって意味が薄く、全部の箱に書くとノイズになる。状態そのものと自動確認の規則は変えず、マップでの表現だけ「薄い → 濃い」にする

### D-97 画面の語は「採用 / 却下」。却下した項目は画面に出さない

* 研究者向けの表示で `confirm` は「採用」、`proposed` は「提案中」、`confirmed` は「採用」と書く（06 の日本語表示を更新）。文書・コード・ツール名は confirm / proposed / confirmed のまま
* 却下（`rejected`）した項目はマップにも一覧にも出さない（フィルタ「却下」も外す）。DB の記録・Event・履歴には残る。詳細の「相手が却下・アーカイブ済みの関係」はそのまま
* 理由: エージェントの提案に対して「確認」は語感がずれる。研究者がすることは提案を採用するか却下するか。却下したものを後から見返す用途は薄く、見えないほうがマップが整理される。記録としての保持（09 §4、append-only）は変えない
* 一覧の状態フィルタ（提案中 / 採用 / すべて）も外す。状態は列で見え、提案中は由来のまとめで先頭に来る。残る絞り込みは種類だけ

### D-98 プロトコルと run。予測の判定は run が持ち、証拠の線は Core が導く

* **D-108 で改めた**（2026-09-26）: run は判定（outcome）を持たず実施の状態を持つ。run → 予測の証拠を Core が導く規則は廃止し、証拠は観測・結果から張る。プロトコルと run の関係（run_of、条件の継承）はそのまま。以下は当時の記録
* 新しい kind **プロトコル（`protocol`、ラベル T1 …）** を RRS に足す。予測を判定するための手順で、`metadata.condition`（どう測るか）/ `observable`（何を見るか）が必須、拡張に `instrument` / `sample` / `conditions`（こうやる）、body に手順の文。直せる（版が積まれる）
* **測定 = run**。プロトコルを 1 回走らせた事実。`measurement --run_of--> protocol`（構造的、Core が create_measurement で張る）。拡張は `started_at` / `ended_at` と `instrument` / `sample` / `conditions`（こうやった。空ならプロトコルの値を継承）と `outcome`
* 線の向きを変える: `tested_by` は **予測 → プロトコル**。`metadata.execution_status`（計画中 / 実測済み）は廃止し、run が 0 個のプロトコルが「これから測る計画」
* 予測の必須欄は `expected` だけに（D-83 の `condition` / `observable` はプロトコルへ）。識別予測の `expected_by_hypothesis` はそのまま
* **判定は run の `outcome`（成立 / 不成立 / 決着つかず）**。エージェントが見立てとして書き（proposed）、研究者が run を採用したときに確定する。採用時に値を変えれば新 Revision（reason に前後）。null のまま採用したものは決着つかずと読む
* 採用した run の outcome から Core が `run --supports / contradicts--> 予測`（origin=system、プロトコルを tested_by で指す予測すべて）を張る。system 由来の証拠は研究者の判定の写しなので、両端 confirmed で自動確定する（判断的関係の唯一の例外）。エージェントも研究者もこの線を直接は張れない（E_FORBIDDEN）。inconclusive は線なし
* 予測の「成立 2 / 不成立 1」は View が数えるだけ。Core は集約規則を持たない。結果（result）は run をまたいだ総合を書く任意の記録として残す
* actor 規則: プロトコルはエージェント提案 / 研究者の言葉、採用は研究者。run はエージェントが作り採用は研究者。outcome の確定は採用時の研究者だけ
* DB は作り直す。schema の基線を `0001_v01_protocol.sql` に書き直し、0002 / 0003 は畳んだ。`schema_migrations` に `name` 列を足し、名前が違う（旧基線の）DB は「この版は移せません。export して init し直してください」で止める。「migrate はデータを失わない」原則はパイロットの被験者が出た時点から
* マップは段を増やさない。run はプロトコル（枠）の真下に「run 1（M1）· 成立」「run 2（M2）· 不成立」と同じ列に縦に並べる（実態）。予測・プロトコル・run を選ぶと、その配下の観測を run ごとに 3 件まで表示し、観測を選ぶと兄弟を全部表示する（見分けの予測からも tested_by のプロトコル配下を開く）。予測とプロトコルは `tested_by` 1 本。証拠の線は run → 予測（判定は run の outcome。観測は見た値）。ファイルと結果はマップに箱を置かない（一覧・詳細に残る）。プロトコルの箱には「run 3 · 成立 2 / 不成立 1」と数える
* 理由: 予測の真偽は測定ごとにばらつくのが前提で、予測本体に真偽欄を足すと証拠と判定のずれを許す設計になる。判定を run に置くと、同じ手順の run が並ぶことがそのまま再現の表現になり、「どう測るか」（手順）と「どうなるはず」（仮説の話）の切れ目も自然。今の「計画中の測定」は手順の代役で、再利用も版管理もできなかった
* 保留: `run_of` の名前、同じ手順だった run を後から束ねる操作（会話で revise で足りるか）、成立条件の機械判定（v0.2）、プロジェクト横断の手順の再利用（範囲外）

### D-99 台本の題材はダイヤモンド NV センタのスピンコヒーレンス

* 08 §9 のシナリオ、design/view/_fixture.json、test/e2e/scenario.test.ts、scripts/dev-seed.mjs の題材を「材料 X の低温抵抗」から「HPHT ダイヤモンド中の NV⁻ アンサンブルの T2* は何で決まるか」に替える。仮説は窒素スピン浴（H1）/ 13C 核スピン浴（H2）/ 電子線照射で生じた空孔関連欠陥（H3）/ NV⁰ への電荷状態変化（H4）、プロトコルは窒素濃度 3 水準の Ramsey（T1、run M1）と照射量 2 水準の Ramsey（T2、run なし）
* 構造（Q1 / H1〜H4 / P1 / P2 / T1 / T2 / M1 / A1〜A3 / O1〜O3 / R1 / U1、関係 r01〜r31、状態と Event の順）は D-98 の台本と同じ。CSV は `tau_us,contrast` の Ramsey 減衰で、T2* を 2.0 / 3.8 / 7.2 µs にして「窒素が薄いほど長い」を機械的に再現できるようにした
* 題材は真栄 力氏（筑波大学）の公開論文リストの主題を下敷きにした架空のシナリオで、実際の測定値・結論ではない。docs に本人名を書くのは題材の出典として。数値は次の公開情報に寄せた:
  * [N] 1.3 ± 0.4 ppm の 12C 濃縮 HPHT {111}（0.4 mm 厚）で T2* 中央値 4.5 µs、1.1 × 1.1 mm² で分散 10%、窒素浴の限界の ~2/3 でひずみ勾配が残りを決める — Shinei et al., Commun. Mater. 6, 66 (2025) https://doi.org/10.1038/s43246-025-00782-7
  * 窒素浴の係数 1/T2* = 2π × 16.6 kHz/ppm（9.6 µs·ppm）、13C は 2π × 160 kHz/%（1 µs·%）、Ramsey は C₀·exp(−(τ/T2*)^p)·Σcos — Bauch et al., Phys. Rev. X 8, 031025 (2018) https://arxiv.org/abs/1801.03793
  * T2 は窒素関連常磁性欠陥 [Ns⁰] + [NV⁻] + [NV⁰] に反比例 — Shinei et al., J. Appl. Phys. 132, 214402 (2022) https://doi.org/10.1063/5.0103332
  * 2.0 MeV 電子線 5×10¹⁷–3.6×10¹⁸ e/cm² + 1375 ± 25 ℃ 2 h 真空アニール、[Ns⁰] 初期 6.8 ppm、1×10¹⁸ 超で Ns⁰ の ~70% が H3 中心などに転換、[NV⁻] の増加率 ~0.13 ppm / 10¹⁷ e/cm²、EPR は X-band 9.428 GHz — Shinei et al., arXiv:2606.27723 (2026) https://arxiv.org/abs/2606.27723
  * 単空孔形成で Ns⁰ から空孔へ電子が移り NV⁻/(NV⁻+NV⁰) が減る — Shinei et al., Diam. Relat. Mater. 140, 110523 (2023) https://doi.org/10.1016/j.diamond.2023.110523
  * Ti / Al ゲッタで HPHT の [N] を半対数的に制御、T2 は [N] に反比例 — Teraji et al., Phil. Trans. R. Soc. A 382, 20220322 (2024) https://doi.org/10.1098/rsta.2022.0322
* データファイルの形も論文の測定に合わせた: `ramsey_S*.csv`（tau_us, signal_counts, ref_counts, contrast。14N 超微細 3 本のビートを含む減衰）、`t2star_map_S1.csv`（x_um, y_um, T2star_us, p, contrast0 の 11 × 11 点）、`samples.csv`（試料表: 濃縮度、EPR の [Ns⁰] [NV⁻]、照射・アニール条件）。T2* は 1/T2* = [Ns⁰]/9.6 + 1/11.5（µs⁻¹）で 4.5 / 6.7 / 2.6 µs
* 理由: 最初のパイロット被験者候補の分野に合わせる。低温抵抗の台本は物性の一般例で、実物のデータの形（Ramsey 減衰）や語（T2*、P1 中心、ppm）が画面に出たほうが、被験者が自分の研究として読める
* design/view の mockup と check.py は旧台本のまま（D-98 の注記と同じ）

### D-100 仮説 : 予測 は 1:N。見分ける実験は「同じプロトコルに結ばれた複数の仮説の予測」

* **D-108 で改めた**（2026-09-26）: 「run の判定は予測ごと（outcomes_json）」の部分は廃止。仮説 : 予測 = 1:N と見分ける実験の表し方はそのまま。以下は当時の記録
* 予測の親の仮説はちょうど 1 つ。`create_record(prediction, hypothesis_id)` が必須で、Core が `hypothesis --predicts--> prediction` を張る。別の仮説から同じ予測へ `predicts` を張ると `E_VALIDATION`
* `discriminates` 関係と `metadata.expected_by_hypothesis` を廃止（述語は 13 に戻る）。2 つの仮説が同じ実験について違うことを言うなら、それは 2 つの予測（P2「変わらない」/ P3「短くなる」）で、同じプロトコル T2 に `tested_by` で結ぶ。同じ結果を予測する仮説は同じ文の予測が 2 つできるが、それは「その実験では見分けられない」がそのまま見えているだけ
* run の判定は**予測ごと**: `measurement_revisions.outcomes_json = { 予測の id: supported | contradicted | inconclusive }`。1 つのプロトコルの run はそこに結ばれた予測を全部判定する。採用時の select も予測ごと。証拠の線（run → 予測）も予測ごとに導く
* 予測 : プロトコルは N:N のまま
* マップ: 予測は親の仮説の下に 1 本。プロトコルは最初に結ばれた予測の下に置き、他の予測からも線を引く。叉（fork）の描画は消えた。プロトコルに 2 本以上の線が入っていれば見分ける実験
* エージェント指示: 「予測は仮説 1 つに属する。仮説ごとに結果が違うなら仮説ごとに予測を作り、同じプロトコルに結ぶ」「run の判定は結ばれた予測ごとに書く」
* DB は作り直し（基線を `0001_v01_baseline.sql` に改名。D-98 の基線で作った DB も init し直し）
* 理由: 予測は「この仮説が正しければこうなる」という文なので親は必然的に 1 つ。`discriminates` + `expected_by_hypothesis` は 2 つの予測を 1 レコードに押し込むための無理で、マップの叉と D-83 の「結果が全部同じなら見分けられない」検査もその代償だった。1:N にすると線は 1 種類、識別は関係の形から自然に出て、run の判定も予測ごとに素直に置ける
* 含意: D-83 の「識別予測」の記述はこの形に読み替える。D-98 の outcome（run に 1 つ）は outcomes（予測ごと）に

### D-101 問い : 仮説は 1:N。マップは問いを上部で選び、仮説から始める

* プロジェクトは複数の問いを持てるが、研究マップが一度に表示する問いは 1 つ。問いはSVGノードではなく上部領域に「問い Q1 + 題 + 状態」で表示し、複数ならセレクトで切り替える。選択は `?q=Q1` と localStorage に残す
* 仮説は作成時からちょうど 1 つの問いに属する。`create_record(hypothesis, question_id)` を必須にし、Core が同じトランザクションで `hypothesis --addresses--> question` を作る。別の有効な問いへの `addresses` は `E_VALIDATION`
* `addresses` は所属、`based_on` は根拠なので別物。Agent が作る仮説の `based_on` 必須規則は維持する
* View は選択した問いの `addresses` から仮説、予測、プロトコル、run、観測へ辿った部分グラフを描く。共有プロトコルはその問いの予測から到達できれば含める。他の問いと孤立仮説は除外する。`addresses` 自体はSVGに描かない
* DB形式は変えずサービス層の制約とする。既存の正しい `addresses` はそのまま読める
* 理由: 複数の問いを同じ根の段に並べると、研究の流れよりプロジェクト全体の分類が前面に出る。問いをコンテキストとして選び、仮説を図の起点にすると、表示する研究の筋と関係の意味が一致する

### D-102 Agent パネルの設計レビュー（2026-09-06）: D-89 を Claude Code 2.1.263 で検証して 4 点を直す

D-89 を実装する前に、公式 CLI の実際の口と突き合わせた。Claude Code CLI 2.1.263 で `claude -p --input-format stream-json --output-format stream-json --permission-prompt-tool stdio` を直接叩いて確かめた（許可要求 `control_request` / `can_use_tool` の形、`control_response` の allow / deny、1 プロセスでの複数 turn、MCP の自動許可）。Codex CLI はこの環境に無く、`codex app-server` の JSON-RPC は文書で確認しただけ。

**D-89 のままでよいもの**: 改造していない公式バイナリを子として飼う。会話イベントはベンダー中立の DTO（`src/view/agent/types.ts`）。MCP は `.mcp.json` のまま、子が `rescicle mcp` を stdio で起こし `created_via=mcp`。View は API キーを持たず、View 内ログインを出さない。生きた接続は常に一つ。rescicle の MCP ツールは自動許可、Write / Edit / Bash は聞く、許可の記憶はセッション限り。選択チップは送信時だけ添え、confirm にしない。View を閉じたら自分の子だけ殺す。

**直したもの**

* **再読み込みで会話は消えない**。D-89 の「再読み込みでスレッドは消える」は、マップ / 履歴 / プロジェクトが別 HTML で、ページ移動が再読み込みになる v0.1 の View と両立しない（移動のたびに会話が消える）。会話は View プロセスのメモリが持ち、画面は開くたびに `GET /api/agent/state` で取り直す。消えるのは View の再起動、エンジン切替、「終了」のとき。Record にも `.rescicle` にも書かないのは変えない
* **ストリームは WebSocket ではなく SSE**（`GET /api/agent/events`）+ POST。Node に WebSocket サーバーは無く、依存を増やすか自前で書くかになる。SSE は既存の Cookie 認証と Origin 検査（09 §8）をそのまま通り、CSP の `connect-src 'self'` で足りる
* **研究者の `~/.claude` の許可設定は読まない**（`--setting-sources project`、`--permission-mode default`）。研究者が自分の CLI を `auto` や broad allow にしていると、パネルの「既定は聞く」が黙って崩れる（この開発機の設定がそうだった）。11 §4 の deny（`.rescicle/**` の Read / Write / Edit、`Bash(*sqlite3*)`）は View が `--settings` で子に渡す（`PERMISSION_DENY_RULES`、docs/11 と test で一致を見る）。代償として、研究者が user 設定に置いた model やフックもパネルでは効かない。プロジェクト内の Read は CLI の既定で聞かれないので、D-89 の「プロジェクト内の Read は自動許可」は旗を足さずに満たされる
* **`.mcp.json` は `--mcp-config` で明示し `--strict-mcp-config`**。project スコープの MCP は CLI が承認を求め、`-p` ではそれが通らない。ファイルは D-89 のとおり `.mcp.json` のまま。`.mcp.json` が無い Project（MCP の `init_project` や seed で作ったもの。`rescicle init` だけが雛形を書く）では、View を動かしている rescicle 自身（`node <dist>/cli/index.js mcp`）を指すインライン設定を渡す。これが無いとパネルの AI は rescicle ツールを持たず、会話しても何もマップに出ない（seed した Project で実際に起きた）

**分かった前提（壊れたらここを疑う）**

* `system/init` は最初の入力を受けてから出る（turn ごとに出る）。起動直後に init を待つと双方が待って止まる。View は起動待ちでも即書く
* 許可要求は `--permission-prompt-tool stdio` が無いと来ない（`--permission-prompts host` だけでは自動拒否）
* `echo` など CLI が安全とみなす Bash は聞かれずに通る。CLI の判断で、View は関与しない
* `--no-session-persistence` で CLI 側に会話を残さない。ただし CLI の自動メモリ（`~/.claude/projects/…/memory`）への書き込みは CLI の既定で通る

**未了**: Codex CLI の接続。`codex app-server`（initialize → thread/start → turn/start、`item/agentMessage/delta`、approval）のアダプタは、実機で検証できるまで書かない。パネルには「検出。接続は未対応」と出し、選べない。D-89 の完了条件（両方選べる）はそのまま残る。会話の途中経過（partial message）は流さず、AI の文はブロック単位で出す。

* 理由: 設計は口の実在を前提にしていたが、旗の組み合わせと init の順序は文書からは読めず、実機でしか確かめられなかった。直した 4 点はいずれも「D-89 の意図を v0.1 の View の構造と CLI の実際に合わせる」もので、意図（研究者の契約で動く公式 CLI を、View が枠だけ持って飼う）は変えない
* 限界: stream-json の行の形と旗は版で変わりうる（D-89 の限界のまま）。検証した版を `src/view/agent/claude.ts` に書き、壊れたときはそこから追う

**画面レビューで直したこと（2026-09-07、実機で操作して）**

* **Origin 検査は bind port ではなくブラウザの Host と Origin の一致を見る**（09 §8）。WSL2 / VS Code のポート転送でページが `127.0.0.1:8788`、View が `8787` のとき、読み取り（GET は Origin を見ない）は通るのに書き込み（送信・起動・許可）だけが 403 になっていた。同一オリジンなら Origin と Host は同じ値なので、それを比べる。転送前の port に固定しない
* **失敗の理由を消さない**。送信・許可の失敗後に状態を取り直すと `reload` が error を空にしていて、画面には最初の案内文だけが残っていた。理由を保って再表示する
* **拒否設定の申告バナーは消す**。パネルの子には View が deny を渡して強制するので（このページの上の 4 点）、パネルが主経路のいま「未申告」の赤い帯は雑音。申告の操作はプロジェクト画面に残す（外の CLI 窓向け）。送信範囲の説明には「パネル経由は View が強制（申告に関係なく効く）」と「外の CLI 窓についての研究者の申告」を分けて出す（`panel_deny`）
* **ツール行は研究者向けの一言にする**。`ToolSearch`（エージェント内部の遅延ツール読み込み）は会話に出さない。`mcp__rescicle__get_research_map` → 「研究マップの読み取り」、`Write` → 「ファイルの書き込み」のように和語にする（`TOOL_JA`）。生の引数 JSON は出さない
* **動作中を明示する**。送信ボタンの disable だけでなく、入力欄の上に点滅する 3 点と文言（起動中 / 考えています / 許可を待っています）を出す
* **「毎回許可（このセッション）」を足す**。今回だけ許可に加えて、同じツールを以後聞かずに通す第 3 の選択肢。覚えるのは View 側（Claude Code の対応は不要）で、記憶はセッション限り（再起動・切替・終了で忘れる）。強制の deny（.rescicle/** と sqlite3）はこれと無関係に効き続ける
* **詳細ドロワは選んだ項目の反対側に出す**。マップ上のドロワが選択ノードに被っていた。ノードが右寄りなら左、左寄りなら右に置く（Agent パネルは外さない）
* **詳細はマップの下に横長で置く（ドロワをやめる、2026-09-07）**。反対側に出しても隣の枝（H1 を選ぶと H3 / P3 / T2）が隠れ、中身は上 4 割で終わって下は空だった。マップの直下に「内容 / つながり / 操作」の 3 列で出し、マップは一切隠さない。選ぶと見える位置までだけスクロールする（`scrollIntoView nearest`）。つながりのチップに乗せるとマップ上の相手が光る。ドラッグ移動と位置の記憶は不要になったので消した
* **つながりの名前引きは却下済みも含む全記録から**。マップから却下済みを外したあとの集合で名前を引いていたので、相手が却下済み（H2 / P2）だと ID の断片で出て、しかも「相手が却下済み」の欄に入らなかった
* **本体と Agent パネルの境につまみ**。ドラッグで幅を変える（280px 〜 画面の 6 割）。ダブルクリックで既定（380px）に戻す。幅は `localStorage` に覚え、3 ページで共通。狭い幅（Agent が下に落ちるとき）では出さない
* **会話の入力欄は Cursor の composer 風**。1 枚のカードに選択チップ / 枠なしで伸びる textarea / 下段（エンジン選択・終了・送信）。Enter は改行、Ctrl/⌘+Enter で送信（誤送信を避ける、2026-09-08）。IME 変換中の Enter は送らない。生成中は送信ボタンの位置が「止める」に入れ替わる
* **AI の発言は Markdown 風に描く**。`###` や `**` が素文のまま出ていた。外部ライブラリは使わず（CSP: self）、`markdown.ts` で見出し・箇条書き・コード・太字・リンク（http(s) のみ）だけを HTML にする。文字はすべてエスケープしてから組むので AI の出力に HTML が混じっても実行されない。`x-html` は Alpine の CSP ビルドで禁止なので、自前の `x-md` ディレクティブで当てる。研究者の発言とツール行は素文のまま
* **注意書きの帯（PC の中だけで動きます…）はプロジェクト画面だけに出す**。マップと履歴では最初の画面の雑音になっていた。送信範囲の説明はプロジェクト画面にあるので、帯もそこに置く
* **Agent パネルの「畳む」は無くす**。畳む場面がなく、幅はつまみで変えられる
* **動作中でも入力と送信ができる。送った文は「送信待ち」に並び、AI の番が終わったら順に届く**（2026-09-08）。それまでは動作中に入力欄ごと disabled で、サーバーも動作中の送信を拒否していた（考えている間に思いついたことを書き留められない）。Claude Code 本体の入力待ちと同じ振る舞いに揃える。待ち行列は View プロセスのメモリ（`AgentSession.queue`）、`POST /api/agent/queue/cancel` で取り消せる。割り込み（送ったら今の生成を止める）は取らない。提案を書いている途中で止めると項目が中途半端に残りうるので、「止める」は明示的に押させる。子が終了したら送信待ちは捨て、何件捨てたかを会話に残す
* **AI の発言の表（`| a | b |` + `|---|`）も描く**。区切り行が無ければ表にしない
* **入力欄は 2 行から始める**。1 行だと狭く、カーソルを持っていくのも手間だった。カードのどこを押しても入力欄にカーソルが入る
* **ナビから「履歴」を外す**。項目ごとの判断は詳細パネル（あなたの判断 / すべての記録）に、プロジェクトの出来事はプロジェクト画面にあるので、独立した履歴ページは要らない。ページ自体（`/timeline.html`）と API はまだ残している。消すなら vite の入口と `timeline.ts` ごと
* **観測は最初から常に出す**（2026-09-08）。D-98 では予測・プロトコル・run を選んだときだけ run の下に観測を開いていたが、観測は測った値そのもので、選ばないと見えないと「まだ測っていない」と見分けがつきにくく、選ぶたびにマップの高さが変わって視点が跳ねていた（詳細を下端に張り付けてからは特に）。run ごとに 3 件まで + 「他 N 件」の畳みはそのままなので高さは有界。観測を選ぶと兄弟を全部出す規則も変えない
* **全幅のヘッダーを無くし、左 = 研究、右 = AI の 2 列だけにする**（2026-09-08）。上に一段あると、右の Agent パネルが「本体の付属」に見え、縦の場所も取っていた。名前・プロジェクト名・画面ナビは左列の頭（`.mainhead`）に入れ、左列の中でスクロールに追随する。右列は上端から下端まで AI との会話。注意書きの帯もプロジェクト画面の左列の中に置く。狭い幅で Agent を下に落とす規則（D-89）は変えない。あわせて: 画面ナビは マップ / 一覧 / プロジェクト（一覧はマップのカード内の切り替えから右上のナビへ。同じ項目と詳細パネルを共有し、`?tab=list` で開く）。マップのグレーの盤は左列の頭より下を全部埋め、カードの枠は無し。問いの選択・向き（縦横）・拡大率（− / 100% / +）・全体・凡例は盤の内側に浮かせる。初期表示はマップ（D-92 のまま）。図は盤の中で Figma と同じ操作で動かす: ホイールで移動、Ctrl / ⌘ + ホイール（トラックパッドはピンチ）でカーソル中心の拡大縮小、ドラッグで移動（`map-viewport.ts`。スクロールはやめた）。並びと関係は固定で、動くのは見る場所と倍率だけ。最初は実寸で収まれば実寸、収まらなければ全体。問いや向きを変えたときだけ置き直し、データの更新では動かさない。選んだ項目が枠の外なら最小限だけ寄せる。選ぶと、その項目と関係で直接つながる項目・線だけ濃く残し、他は薄くする（Figma の選択のように。並びは変えない）。図と一覧はそれぞれの中でスクロールし、詳細は盤の下端に重なる
* **マップは全部を 1 枚に描き、問いごとに枠で囲う**（2026-09-08）。それまでは上で問いを 1 つ選び、その仮説から下だけを描いていた（D-101）。問いが 2 つ以上あると全体像が見えず、「どの問いを見ているか」がドロップダウンの中の隠れた状態になっていた。盤の中を自由に動けるようになったので、問い = 枠（Figma のセクション）、仮説以下 = その中身、として 1 枚に置く。枠は縦向きなら横、横向きなら縦に並ぶ。枠の見出しが問いのリンク（押すと詳細）。問い : 仮説は 1:N なので枠は重ならない。複数の問いに属する項目（共有プロトコル）は先の問いの枠に、どの問いにも付かない項目は「問いなし」の枠に置く。上の問いはドロップダウン 1 つだけ（見出しのボタンと選択の重複をやめ、問いの詳細は枠から）。選ぶと「その枠へ飛ぶ」。枠の四角も問いのリンクで、空いているところを押すと問いが選べる（選ぶと AI の入力欄にチップとして付くので、そこから仮説を足せる）。初期表示は前回の問い（`?q=` / localStorage）の枠に寄せる（全体を収めると倍率が下がって読めないため）。項目を選ぶと上の問いの表示は属する問いに合わせるが飛ばない。枠をまたぐ線は描かない（`renderMap`、`frames`）
* **不明点はマップの箱にしない**（2026-09-08）。不明点は構造ではなく対象に付いた注記で、木の横に箱が生えると段の意味が崩れ幅も取る。対象の箱の右肩に「? N」（未解消の件数。05 §2.2 の Missing Context と同じ数え方: proposed / confirmed で confirmed の resolved_by を持たない）を付け、押すと対象の詳細が開いて不明点がつながりに並ぶ。about / resolved_by の線も描かない。08 §5.1 の「不明点は対象の右」はこれで置き換わる。**D-109 で改めた**: 不明点という項目は無くなり、「? N」は run の未記録の条件の数（D-107）
* **マップに検索を置く**（2026-09-08）。盤の右上の欄（`/` で入る）に打つと、名前・種類・題・本文の部分一致で一致した箱を橙の枠で光らせ、他を薄くする。Enter（Shift で戻る）で一致を順に選び、盤の中央に寄せる（倍率は実寸未満なら実寸に上げる）。畳まれた観測やマップに箱の無い項目（ファイル・結果・不明点）も一致すれば詳細が開く。却下・アーカイブは対象外。Esc で消す
* **問いはドロップダウンだけ、凡例は 1 行**（2026-09-08）。盤の左上は「問い Q1 題」のボタンと選択が重複していたので、選択（飛ぶ）だけにし、状態（提案中）も書かない。凡例は枠 3 つ（採用 / 提案中 / 選択中）・線 4 つ（確定 / 提案中 / 支持 / 矛盾）・不明点の印だけにし、見分けの叉・畳んだ観測・太線の項目と長い読み方の文を外した
* **キーボードの入口**（2026-09-08）: `/` で検索欄、`c`（または Ctrl / ⌘ + I）で AI の入力欄。入力中は効かない。AI の入力欄で Esc は選択中の項目（無ければ盤）へ戻る（文は残す）ので、項目を選ぶ → `c` で話す → Esc で項目へ、が往復できる。ドロワの「AI と話す」ボタンも同じ。マップの `/` は index.ts、`c` は全ページ共通の agent-panel.ts。日本語 IME が入っていると盤の上でも keydown の key が "Process" になる（Windows の Chrome / Edge）ので、物理キー（code）でも見る。項目を押すとマップを描き直すので押した箱の焦点が body に落ちる。焦点がどこにも無ければ新しい箱へ戻す
* **Tab の順は読む順**（2026-09-08）: 左の頭のナビ → 盤の操作（問い / 検索 / 向き / 拡大率 / 全体、左から右）→ マップ（枠ごとに、枠 → 段の上から下・同じ段は左から右。それまでは作成順で飛び飛びだった）→ 凡例 → 詳細（開いているとき）→ つまみ → AI（会話の操作 → 入力欄 → エンジン / 終了 / 送信）。Tab で箱に入ったら盤がその箱を見せる
* **入力欄の Tab は「送る」へ直行**（2026-09-08）: エンジンの選択と「終了…」は入力欄のカードからパネルの頭の行（題・状態の右）へ移す。下段はヒントと「送る」だけ（動作中は「止める」も。DOM では送るの後で、見た目は左）。textarea → Tab → 送る
* **詳細の「内容」は kind ごとの表**（2026-09-08）: 見出し（仮説: 根拠・説明 / 予測: 仮説が正しければ / プロトコル: 条件・見るもの・装置・試料・手順・注記（条件の値は D-107 で下の「条件（計画と測定ごと）」の表へ）/ run: 実施・装置・試料・期間・条件の値・未記録の条件・注記（D-107 / D-108）/ 観測: 値 / ファイル: 場所・大きさ・指紋）+ 値。値は改行と「。」で文ごとに割って縦に並べる。長い文章を 1 段落で出すと読めなかった。エージェント指示にも「本文は 1 行 1 点、5 行まで、段落にしない」を足す
* **詳細から「つながり」の列を外す**（2026-09-08）: 線はマップにあり、採用と一緒に確定する関係は既定どおり束ねる。関係ごとの ✓・確認 / 却下・撤回は「すべての記録と例外操作」の中へ。内容（広く）と操作（狭く）の 2 列にして詰める
* **プロジェクト画面にファイルの一覧と参照を出す**（2026-09-08）: それまでは allowed_roots ごとに「登録済みのファイル」だけを出していて、AI がまだ触っていないファイルは View に一切出なかった。`GET /api/files` が allowed_roots 配下を `search_files` と同じ規則で列挙し（500 件で打ち切り）、登録済みなら Asset（一覧で開く）と、その Asset を端点に持つ撤回・却下されていない関係の相手（観測 / 結果 / 仮説 …、マップで開く）を添える。未登録は「未登録」と出し、登録は会話で頼む（View から register はしない）。file_metadata=DENY なら一覧ごと出さない（AI にも見えないものを研究者にだけ見せない）。アップロードは無い（ファイルは研究者がフォルダに置く。D-46 の境界をブラウザから越える経路を作らない）。絞り込みは名前・登録名・参照の名前と題の部分一致
* **設定タブを「読める場所とファイル」と「申告」だけにする**（2026-09-08）: 外に出してよい情報の設定（読み取り）、設定の変更履歴、説明の書き出しボタンは、送信範囲の説明タブに同じものがあるので設定タブから外す。申告のパネルも 3 行に詰める（右の AI パネルには不要で、外の CLI 窓を使う人向け、という要点だけ）

### D-103 最初のフローはファイルから（2026-09-08）

公開版 0.1.0-alpha.2 を空のフォルダから使い始める試行で、最初の画面は空のマップと「右の AI に話す」だけで、AI が自分で読める場所を足し、失敗行を出しながら登録し、研究者は自分のデータがどう扱われたかを後追いで知った。順序を研究者の側に戻す。

* **記録が無い間は「はじめる」画面**（マップの代わり）。1. プロジェクト直下と 1 段下のフォルダを押して allowed_roots に加える（`GET /api/folders`。境界は D-46 のまま、追加は D-71 のまま取り消せない）。2. 配下のファイル（`GET /api/files`）の行の「AI と話す」で、そのファイルを選択チップにして入力欄へ。CSV は「中身を読める」、他は「場所だけ」と印を付ける。データが無い研究者のために「そのまま右で話す」も同じ画面に置く。ファイル必須にはしない
* **選択チップにファイル（path）を足す**。`{ label, kind: asset, title, path }`。未登録なら label は path、登録済みなら A1 …。エージェントへの添え書きは「その path を inspect_asset し、未登録なら register_asset してから提案する」。エージェント指示（08 §8）にも同じ 1 行と「add_allowed_root は研究者が名指ししたフォルダだけ」を足す。View でフォルダを選べるので、AI が自分で足す場面を減らす
* **最初の問いが出たらマップへ切り替え、研究者が盤を動かす（ホイール・ドラッグ・拡大率・問いの選択）までは描き直しのたびに枠を収め直す**。それまでは問いが変わったときだけ収めていたので、問いだけの枠を中央に置いた後に仮説が並んで枠が広がると右が切れていた
* CLI の `init` は変えない。「next:」の案内と README / 11 の最短をこの順に寄せる
* プロジェクト画面のファイル一覧にも同じ「AI と話す」を置き、「AI が読めるもの」の列を足す

### D-104 View から送信範囲の説明を外す（いったん、2026-09-08）

プロジェクト画面の「送信範囲の説明」タブ（Egress Policy の読み取り表、設定の変更履歴、ツールごとの送信範囲、呼び出した AI ツール、Markdown / JSON の書き出し）と、上の案内の「送信範囲を見る」リンクを外す。新規の研究者が最初に触る画面から、情報セキュリティ担当向けの文書を退ける。09 §14 の説明パケットそのもの、`rescicle egress-report`、`GET /api/egress-report`、D-70 / D-72 の記録は変えない。プロジェクト画面の申告の文言は「rescicle egress-report に出ます」に改める。必要になったら、研究者の画面ではなく別の入口（CLI か管理者向けの画面）として戻す。

### D-105 仮説とプロトコルは結ばない（2026-09-08）

プロトコルの `based_on` に仮説を置けなくする（09 §4 の三元組から protocol → hypothesis を外す）。エージェント指示の「protocol も based_on で根拠を示す」を外し、「プロトコルと仮説を結ぶのは、それが試す予測（tested_by）だけ」とする。仮説 → 予測 → プロトコルの木がすでにその関係を表していて、プロトコル → 仮説の線は同じ情報の二重化で、マップでは仮説をまたぐ線になって読みにくかった。古い DB に残る protocol --based_on--> hypothesis はマップに描かない。予測 → プロトコル（tested_by）はそのまま。


### D-106 一覧はコレクション view として複数選択とまとめ操作を持つ。D-95 の「操作は詳細パネルだけ」の例外（2026-09-12）

OOUI の見直し（2026-09-12）で、一覧に複数選択を入れる。提案中の行にチェック、由来のまとめごとに全選択。チェックがある間だけ表の上に「N 件をチェック中 · まとめて採用 / まとめて却下 / チェックを外す」のバーが出る。採用は 1 件ずつ 1 request（束ねた関係は既定どおり、run の判定の選び直しは詳細から 1 件ずつ）、却下は件数を示す確認ダイアログを挟む。途中で失敗したら何件まで済んだかを出して止め、残りはチェックのまま。チェックは行の選択（詳細パネル）を動かさない。

* D-95 の「操作は右の詳細パネルだけに置く」は、1 件の操作が行の中と詳細で二重になるのを避けるためのもの。まとめ操作はコレクション view にしか置けないので二重にならず、D-95 の理由と衝突しない。例外はこの「チェックした複数の項目へのまとめ操作」に限り、行の中に 1 件ずつのボタンは戻さない
* 同じ見直しで、履歴をナビに戻す（0a0c4f8 で外していたが、ページによってナビが違い、URL を知らないと辿れなかった）、関係の文を「主語は 目的語 動詞」の語順にして相手をリンクにする、マップの箱の「run 1（M1）」を他の種類と同じ「測定 M1」にする（1 オブジェクト 1 名。画面の語は「測定」「プロトコル」で統一し、run と手順は文書上の呼び名）、「はじめる」を番号付き手順ではなく「AI が読める場所」「ファイル」の 2 つのコレクションとして見せる、問いのドロップダウンの名前を「表示する問い」にする
* 理由: 提案が 10 件あると 選ぶ → 採用 を 10 回繰り返すことになり、表のコレクション view で複数選択 → まとめて操作 は OOUI の定石。残りは D-74 の「ナビはオブジェクト名」「言及は辿れる」「1 オブジェクト 1 名」を実装が守れていなかった箇所の修正

### D-107 条件は「変数」の辞書から選ぶ。辞書は組み込みの候補表から始め、プロジェクトで育てる（2026-09-26）

それまでの `conditions` は自由な JSON オブジェクトで、Core はオブジェクトであることしか見なかった。キー名・単位・型はエージェント任せなので、`{"温度": "4K"}` と `{"T_K": 4}` が同じプロジェクトに混ざり、run どうしを条件で並べることも、書き漏れた条件を数えることもできなかった。「どういう条件で測ったか」を後から検証できる形で残すのは、汎用の LLM とメモでは作りにくい rescicle の価値なので、ここを構造にする。型を厳しくしても、研究者は話すだけで、型に落とすのは LLM、検証するのは Core、確定は研究者の採用、という分担で入力の手間は増えない。

* **新しい kind 変数（`variable`、ラベル V1 …）**。「何を条件の軸として扱うか」の定義で、拡張 `variable_revisions` に次を持つ（Revision 単位、05 §5）

  ```text
  key         機械が引く名前。英小文字・数字・_ で英字から（temperature, magnetic_field）。プロジェクト内で一意（rejected / archived を除く）。変えられない
  name        画面の名前（温度、磁場）
  value_type  quantity（数値か範囲）| category（文字列）| text（自由文）
  unit        quantity の単位（K, T, Hz …。UCUM の表記に寄せる）。category / text は null
  allowed     category の取りうる値（任意。空なら自由）
  aliases     別名（温度, temp …）。Core が書き込み時に key へ正規化する（NFKC・小文字で突き合わせ）
  ```

* **組み込みの候補表（12 項目）**を Core の定数に持つ: temperature K / pressure Pa / magnetic_field T / duration s / frequency Hz / voltage V / current A / wavelength nm / laser_power mW / microwave_power dBm / humidity % / repetitions（単位なし）。物性・材料寄り（D-99）。**候補表はレコードではない**。`init` で全部を作るとマップと一覧が埋まるので、プロジェクトで初めて条件に使われた時点でその変数を origin=system / confirmed で作る（定義は rescicle が決めたもので研究者の判断を含まない）。研究者は revise で名前・単位・別名を直せる（system 由来でも変数だけは revise できる）
* 候補表に無い条件は `create_variable` で **proposed** に作る（origin=agent / researcher）。候補表の key・別名や既存の変数と重なれば `E_DUPLICATE`。proposed の変数も条件のキーに使えて会話は止まらない。その変数を使うプロトコルか run を研究者が採用すると、proposed の変数も同じ研究者の採用として一緒に確定する。エージェントは確定できない（D-08 のまま）
* **`conditions` のキーは変数の key か別名に限る**。無ければ `E_VALIDATION`（「list_variables で探し、無ければ create_variable」）。rejected / archived の変数の key は `E_INVALID_TRANSITION`。同じ key で作り直せば使える。値は value_type で検証する
  * quantity: 数値（変数の単位）、`{ "min": 4, "max": 300 }`（範囲・掃引）、研究者が別の単位で言ったら**換算せず** `{ "value": 1500, "unit": "uW" }`。Core は換算しない（LLM の計算違いを記録に入れない）
  * category: 文字列（allowed があればその中）/ text: 文字列
  * `null`: プロトコルでは「測定ごとに記録する」の宣言
* **プロトコルが条件を宣言する**。プロトコルの `conditions` のキーが「この手順で扱う条件」。run の `conditions` に宣言外のキーを足すのは許す。値が null のキーを run が書かなければ `missing_conditions`（導出値、レコードは作らない）として欠けている文脈に数える: `get_record` / `RecordDTO.missing_conditions`、`get_resume_context.missing_context`、`get_research_context` の測定、マップの run の右肩「? N」
* `metadata.condition`（文）は**補足の説明**に格下げし、`conditions` のキーが 1 つ以上あれば省略できる。`observable` は必須のまま。研究者が言っていない条件をエージェントは書かない（D-83）
* MCP: `list_variables`（プロジェクトの変数と使用回数、まだ使われていない候補表は status=catalog）、`create_variable`。書き込みの応答に正規化後の `conditions` を返す。`get_research_context` に `variables`。エージェント指示に「条件は list_variables の key で書く。無い条件は create_variable で提案してから使う。単位を換算しない。null は測定ごとに記録」
* View: 変数はマップに箱を置かない（一覧と詳細）。**プロトコルの詳細に「条件 × 測定」の表**（画面の見出しは「条件（計画と測定ごと）」。行 = 変数「名前（単位）」、列 = 計画 / M1 / M2 …、継承した値は淡く、測定ごとに記録と決めて書いていないものは「未記録」を赤で）。run の詳細は変数の名前と単位で条件を出し、「未記録の条件」の行を足す。10⁶ 以上・10⁻³ 未満の数は `5×10¹⁷` で出す
* `rescicle check` は辞書に無いキー（使った後で変数が却下された等）を警告として並べる（終了コードは変えない）
* DB: `variable_revisions` を足し、`records.kind` に variable。基線の作り直しに含めた（D-108）
* エクスポート: 変数は RO-Crate の `PropertyValue`（`propertyID` = key、`unitText` = unit）、run の条件はその変数を指す `PropertyValue`（値つき）の並びに写す（写像の細部は M7 で決める）
* 理由: キーと単位が揃わない条件は比較できず、「同じ手順を温度だけ変えて走らせた」という再現の表現（D-98）が活きない。全分野共通の固定リストにしないのは、候補に無い条件を近い候補へ押し込む誤った構造化を生むから。辞書をレコードにするのは、変数の追加も「提案 → 研究者の採用」で履歴に残し、誰がいつ単位を決めたかを辿れるようにするため（D-61）
* 保留: 単位の換算と比較、観測の property / unit との統合（同じ辞書で observable を引けば「温度を変えたら T2* がどう変わるか」を並べられる。CSV 列名からの単位推定 `unitOfColumn` との対応が先）、分野別の候補表、重複した変数の統合、プロジェクト横断の辞書（範囲外）

### D-108 測定は「やったか」を持ち、予測の成否は持たない。証拠は観測と結果から（2026-09-26）

研究者の指摘: 測定に「成立」と付くのはおかしい。測定が持つべきは実施するか・最後までやったかで、予測の成否はデータ → 観測 → その解釈から導くべき。D-98 / D-100 は「やった」事実と「どう読んだか」を run 1 つに混ぜていた。

* **run は実施の状態 `execution_status` を持つ**: planned（予定）/ in_progress（実施中）/ completed（完了）/ aborted（中断）。既定は completed、`attach_assets` の既定も completed（データが出た）。中断の理由は本文に。レコードの status（研究者の採用）とは別の軸で、予定の run を採用しても予定のまま。revise の extension で動かす。D-98 で廃止した `metadata.execution_status` は run の欄として戻したが metadata には書けない（`E_VALIDATION`）
* **廃止**: `measurement_revisions.outcomes_json`、`create_measurement` / `attach_assets` / `revise` / `confirm_record` の `outcomes`、採用した run から Core が張る `run --supports / contradicts--> 予測`（origin=system）、それを自動確定する `autoConfirmable` の例外。判断的関係に例外は無くなった
* **証拠の主語は観測か結果だけ**（09 §2.4）。`measurement --supports-->` は `E_INVALID_PREDICATE`。成否は、観測（`extract_observations` / 口述）を根拠にした結果（result、based_on 必須）から予測への `supports / contradicts` をエージェントが提案し、研究者が確定する
* マップ: run の箱に実施の状態（「測定 M1 · 完了」）、プロトコルの箱に「測定 N · 完了 a / 中断 b …」、予測の箱に「支持 N / 矛盾 N / 未確認 N」（結果は箱にしないので線が無くても数で見せる）。観測からの証拠は線で描く。run の詳細から判定の選択を外し、「実施」の行を足す。次回の入口の `planned` は run の無いプロトコルのまま
* **schema は基線を作り直した**（`0001_v01_run_status.sql`、D-107 / D-109 を含む）。移行の migration は書かない（alpha の間は DB をリセットする方針）。旧基線の DB は MCP / View / migrate が REINIT で止まり、手順を案内する: `rescicle export --json --out old-records.json` → `.rescicle/` を退避 → `rescicle init` → AI に「old-records.json を移して」と頼む。AI はファイルを読んでツールで作り直し、全部 proposed で戻るので研究者が採用し直す。`export` は schema を問わず読み取り専用で開き、適用済み migration（`schema`）も書き出す。エージェント指示に移し直しの 1 行を足した
* あわせて直した不具合: `rescicle migrate` は適用しても「schema is up to date」と出していた（openDb の中で適用済みになり、後から呼ぶ migrate が空だった）
* 理由: 同じ手順の run が並ぶ再現の表現（D-98）は残しつつ、「やった」と「どう読んだか」を分ける。中断した run も記録として残る（K-03）。判定を解釈（result）に置くと、「エージェントの解釈は result に置く」（D-21）とも揃う
* 保留: 予定の run の条件を事前登録として扱うか（HARKing 対策の強化）、見分ける実験の成否を予測ごとに並べる画面

### D-109 不明点を項目にしない。分からないことはメモに書く（2026-09-26）

研究者の言葉: 「不明点をいちいちオブジェクト化しないでほしい。ただのメモとしておけばいい」。

* **廃止**: kind `unknown`（ラベル U）、述語 `resolved_by`、MCP の `resolve_unknown` / `get_unknowns`、`GET /api/unknowns`、`RecordDTO.missing_context`（真偽値）。D-09 / D-54 / D-63 を置き換える
* 分からないこと・気づいたことは note に書き、対象へ `note --about--> 対象` で付ける。`about` の主語は note だけ。note は作成時 confirmed（採用を待たない）で、about は構造的なので両端 confirmed で自動確定する
* note はマップに箱を置かない（一覧と詳細に残る）。マップの「? N」は run の未記録の条件の数（D-107）だけ
* 欠けている文脈（`get_resume_context.missing_context`）は「測定ごとに記録すると決めた条件を書いていない run」だけ
* 台本（D-99）の U1 は N1（メモ、M1 について）に置き換えた
* 理由: 不明点を項目にすると、採用・解消・アーカイブの操作と数え方が増え、研究者はメモ 1 行で済むことに手続きを払う。構造として数えたい欠け（条件の書き漏れ）は D-107 で導出値にした

---

## alpha の決定（D-110〜）

Node 版をやめて Rust + Tauri で作り直した alpha（`rescicle-alpha`、`v0.0.10`）で決めたこと。D-110〜D-119 は 2026-09-27 に Node 版と突き合わせたときの方針（[gap-from-node.md](gap-from-node.md) §1 の P1〜P10）。原則は **alpha の現状を正とし、Node 版の決定は採るものだけ採る**。

### D-110 履歴（リビジョン・却下・線の取り消し）は当面いまのまま。直し方は保留（2026-09-27）

Node 版は不変リビジョン、append-only、却下も残す（D-06 / D-39〜41 / D-53 / D-88 / D-97）。alpha はそうなっていない。

* **当面の正は alpha の現状**: オブジェクトの title / body / note / criterion は上書きする。却下したオブジェクトは 3 分後に削除し、付いていた線・データ・測定の記録も一緒に消える。研究者が「はずす」線は物理削除する。残るのは `events` の 1 行（`object_rejected` / `relation_removed` など）だけ
* 未決の検討事項（どれも決めていない）:
  * 却下を消さずに隠す（status は rejected のまま残し、画面と AI の文脈から外す）
  * 線の取り消しを `relations.retracted_at` で表し、行を消さない
  * 内容の変更をリビジョンとして積む（`object_revisions`）。スキーマの根本変更で、エクスポート（PROV-O / RO-Crate）の前提
* 判断の材料: 01 §15 の C2「履歴は上書きされない」、02 の K-03 / K-08（捨てた仮説を残す）、04 §7.2 の S3。いまの alpha はどれも満たしていない。一方で「研究者が要らないと言ったものを一覧の末尾に永久に置かない」（alpha の 0.0.7）は研究者の声から来ている。隠すことと消すことを分ければ両立できる見込み
* 決めるまで、文書では「alpha は履歴を持たない」と正直に書く（05 §9.5）

### D-111 データは端末の中央 DB に置く。研究フォルダには 1 バイトも書かない（2026-09-27）

Node 版 D-17（フォルダ内 `.rescicle/rescicle.db`）を置き換える。

* DB は `%AppData%\rescicle\rescicle.sqlite`（`RESCICLE_DATA_DIR` で差し替え）。設定とエージェントの作業ディレクトリも同じフォルダ
* プロジェクトは研究フォルダのパス（`root_path`）を持つだけ。フォルダを変えても記録は動かない
* テスト `nothing_rescicle_does_writes_to_the_research_folder` で縛る
* 理由: 研究フォルダは研究者のもので、共有ドライブや同期フォルダにあることも多い。そこに DB を置くと同期の衝突と「知らないファイルが増えた」を生む。読むだけにしておけば、何を触ったかの説明が 1 行で済む
* 代償: 研究フォルダを別の端末に持っていっても記録は付いてこない。エクスポート（未実装）で補う

### D-112 会話は `claude -p` を 1 ターンずつ起動し、AI の書き込みは rescicle が検証してから書く。ファイルは許可ではなく記録で扱う（2026-09-27）

Node 版 D-89 / D-102（CLI を飼い、エージェントが MCP で書く、許可ダイアログ、会話はメモリ）を置き換える。

* 1 ターン = `claude -p` 1 回。出力は stream-json で受け、返事を部分表示する。会話は `messages` に保存し、次のターンは `--resume` で続ける
* AI の応答は `{ reply, operations, read_files }`（`response_schema.json`）。operations を rescicle が 1 件ずつ検証してから DB に書く。同じターン内で作ったものは `ref` で指せる。JSON でなければ 1 回だけ出し直させる
* AI に許すツールは WebSearch / WebFetch だけ（`--allowedTools`、`--strict-mcp-config`、テストで固定）。作業ディレクトリは研究フォルダではない
* **ファイルの中身は AI が `read_files` で名前を挙げたものだけ**、研究フォルダの内側から先頭 4KB を rescicle が読んで次のターンに渡す。読んだものはすべて `events` に `file_read` で残し、ファイル画面に「読み込み済み」と出す。Node 版の「生ファイルは DENY、allowed_roots で先に許可」はやめる
* MCP サーバーは Claude Code 側から同じ記録を使うための副経路として残す
* 理由: 許可を先に求めると、どのファイルが要るか誰も分からない時点で判断させることになる。出ていったものを後から必ず辿れる方が、研究者にとって確かめられる。書き込みを rescicle の検証に通すと、AI が何を書けるかをプロンプトではなく Core で決められる
* 当時あった穴（AI が研究者の判断を上書きできる経路、MCP の確定に発言が要らないこと）は D-120 で塞いだ

### D-113 最初は「いま、何を調べていますか」から。研究フォルダは後で（2026-09-27）

Node 版 D-103（ファイルから始める）を置き換える。

* 最初の画面は 1 つの入力欄。書いた文がそのまま最初の発言になり、1 行目（30 字まで）が研究名になる。作成と最初の送信は 1 回の操作
* 研究フォルダはデータ・ファイル画面でいつでも選ぶ。選ぶまで AI にはファイル一覧が空で渡る
* 理由: 設定が終わる前に製品が一度動いて見える。着地するのは空のマップではなく、応答が走っている画面

### D-114 研究名は画面で変えられる。AI は名前を提案するだけ（2026-09-27）

Node 版 D-91（既定はフォルダ名、画面で編集しない）を置き換える。

* 研究名は画面で改名できる。「AIに考えてもらう」を押すと AI が 1 行の案を入力欄に入れ、保存は研究者が押す。AI が自分で改名することはない
* 理由: 最初の名前は書き出しの 1 行目を切ったもので、1 週間後には研究の中身に合わなくなる。フォルダ名を既定にしないのは、フォルダを後で選ぶから（D-113）

### D-115 補足はオブジェクトの列。メモという型は持たない（2026-09-27）

Node 版 D-109（note は Record、`about` で対象に付ける）とは形が違う。「不明点を項目にしない」という結論は同じ。

* 各オブジェクトが `note` 列を 1 つ持つ。画面では「補足」。置き換えると全体が置き換わる
* 理由: 補足は 1 つのものに属する。型にすると単独で存在でき、2 つに同時に付けられ、確定・却下の対象になる。どれも補足の性質と合わない（0.0.7 で型から列に移した）
* RRS（05）の `note` kind とは食い違う。エクスポートを作るときに、列を `note --about-->` に写す

### D-116 予測は判定式を持つ。記号表を変数の辞書へ育てる（2026-09-27）

Node 版 D-83 / D-98 / D-107（`metadata.expected` 必須、条件はプロトコル側の変数辞書）とは別の道を取る。

* 予測は `criterion`（判定式。何と比べてどうなったら外れるか）が必須。`criterion_note` は記号の意味と前提。統計の演算は名前で書き（`spearman(a, b)`、`sd_within`）、閾値を AI に作らせない（`agent_instructions.md`）
* 式に出てくる量を `criterion_symbols`（name / meaning）に宣言する。同じ名前の記号は同じ量
* **方向**: 記号表を Node 版 D-107 の変数の辞書（単位・型・別名）へ育てる。プロジェクトで共有する辞書にし、記号をデータの列に結べば式を評価できる。protocol（D-117）を入れるなら、条件もこの辞書で書く
* 理由: 期待値を文で書くと、2 つの予測が同じことを言っているか、どちらが外れたかを比べられない。式にすると比べられる

### D-117 測定の分け方（protocol と run）は保留（2026-09-27）

Node 版 D-98 / D-100 / D-108 は測定を protocol（手順）と measurement（run、4 状態）に分け、`tested_by` を 予測 → protocol にした。alpha は測定 1 つで、実施したかどうかの 2 値、`tested_by` は 予測 → 測定。

* **当面の正は alpha の現状**
* 未決: protocol を入れるか。入れると「同じ手順を何度も走らせる」（再現）と「複数の仮説の予測が同じ手順に結ばれる」（見分ける実験、D-100）が表せる。代わりに型・述語・マップの段が 1 つずつ増える。実施の状態を 4 値（予定 / 実施中 / 完了 / 中断）にするのは protocol と独立に小さく入れられる
* 決める材料: 最初の研究者が同じ測定を繰り返すか、1 つの測定で複数の仮説を見分けようとするか

### D-118 画面の語は「確定 / 却下」と「研究オブジェクト」（2026-09-27）

Node 版 D-97（採用 / 却下、Record / 項目）を置き換える。

* status の表示は 提案中 / 確定 / 却下 / アーカイブ。型は 問い / 仮説 / 予測 / 測定 / データ。まとめて呼ぶときは「研究オブジェクト」。由来は 研究者 / AI提案。オブジェクトの `note` は「補足」
* 正は `src/renderer/app.js` の `TYPE_LABEL` / `STATUS_LABEL` / `ORIGIN_LABEL`。文書（06 など）はこれに合わせる

### D-119 エージェントは Claude Code 専用（2026-09-27）

Node 版 D-87（MCP 汎用、Codex CLI も）を当面置き換える。

* 会話モードは `claude` CLI だけを動かす。MCP サーバーは標準の stdio 実装なので他のエージェントからも繋がるが、検証と案内は Claude Code だけ
* Codex など他の CLI への対応は後。会話モードの駆動部（`claude_agent.rs`）を差し替えられる形にしておく
* 理由: 最初の研究者が使っているのが Claude Code で、1 つに絞ると CLI の検出・MCP の登録・応答の形式の検証をテストで固定できる

### D-120 AI 経由の状態変更を制限する（2026-09-27）

Node 版 D-08 / D-25 / D-56 / D-64 を alpha に入れる。[gap-from-node.md](gap-from-node.md) §2-1。

* actor が `researcher` 以外（`researcher-via-agent` / `researcher-via-mcp`）の状態変更は、proposed → confirmed / rejected / archived と confirmed → archived だけ。確定・却下済みを覆せない（`domain.rs` の `check_relayed_status_change`）
* origin=agent のオブジェクトとつながりは、指定された status に関わらず proposed で生まれる（`agent.rs` の `birth_status`）
* MCP の `set_object_status` は `statement`（研究者の発言の引用）が必須。status は confirmed / rejected / archived。statement は event の `detail_json` に残る
* actor と経路（via）を別の列に分ける整理（Node D-30）はしていない。値の中に経路を含めたまま
* 理由: 研究者の判断を AI が上書きできる経路があると、「確かめるのは研究者」という製品の約束が指示文だけに依る

### D-121 書き込みはトランザクションで包む（2026-09-27）

* `Db::atomic`: 最外は `BEGIN IMMEDIATE`、内側は `SAVEPOINT`。`create_object`・`register_asset` など複数行の書き込みを包む
* 理由: オブジェクトと記号表と event の片方だけが残る状態を作らない。MCP の別プロセスと同時に書いても崩れない

### D-122 MCP の書き込みを画面に反映する（2026-09-27）

Node 版 D-76 に当たる。

* `PRAGMA data_version` を 1 秒ごとに見て、他プロセスのコミットがあれば `record:changed` を emit し、画面が読み直す。会話のターン中は終わるまで待つ
* 理由: Claude Code から MCP で書いたものが、次に何か操作するまで画面に出なかった

### D-123 データのパスは `/` 区切りで、研究の中で一意（2026-09-27）

Node 版 D-18 / D-80 の一部。

* `assets.relative_path` は `/` 区切りで保存する。`assets.project_id` を足し、`UNIQUE(project_id, relative_path)`。既存の DB は起動時に変換する（`file_read` の記録も）
* `sha256` はまだ書かない（NULL）
* あわせて直した不具合: 却下したデータを研究者が登録し直すと戻るはずが、status を読んでおらず戻らなかった。AI は却下済みのデータを戻せない（D-120）

### D-124 アーカイブは提案中からもできる。戻すと元の状態に戻る（2026-09-27）

Node 版 D-15 に合わせる。

* アーカイブは提案中・確定のどちらからもできる。「アーカイブから戻す」は元の状態（`events` から読む `archived_from`）に戻す
* 指示文: archived は真偽を言わない。反証されたなら、理由はその補足（note）に書く

### D-125 AI に直近の操作を渡し、MCP の読み取りも記録する（2026-09-27）

Node 版 D-20 / D-52 / D-70。

* 研究コンテキストに `recentEvents`（直近 30 件、`mcp_read` を除く）を入れる
* MCP の読み取り（`get_research_context` / `list_project_files`）を `events` に `mcp_read` として残す
* 理由: 何が外に出たかを後から辿れる記録（D-112）を、Claude Code 側の経路にも広げる

### D-126 指示文: AI が導いたものは origin=agent。MCP にも同じ指示を渡す（2026-09-27）

* AI が導いた仮説・予測は、研究者が同意しても origin=agent（Node D-68）。同意は確定で表す
* MCP の instructions に `agent_instructions.md` の全文と、MCP 用の前置きを載せる（Node D-87 の「指示はサーバーが配る」）

### D-127 JSON で書き出せる（2026-09-27）

Node 版 D-78 に当たる。

* 設定 →「この研究を書き出す」。保存ダイアログは Documents から始まる。1 研究の全テーブル（研究・オブジェクト・つながり・付属の表・会話・events）
* RO-Crate / PROV-O への写像はまだ（U-05）。研究フォルダは端末の外に持ち出しても記録が付いてこない（D-111）ので、その補い

### D-128 画面の小さな直し（2026-09-27）

* HTML 属性に入れる id をすべてエスケープする
* 確定済みの箱を濃く（枠を太く）、提案中の題を薄く（Node D-96）
* 設定の「MCP server」を研究者の言葉に（Node D-82）
* 未着手: 色の `:root` 変数化（Node D-93）、画面の語彙のテスト（Node D-82）
