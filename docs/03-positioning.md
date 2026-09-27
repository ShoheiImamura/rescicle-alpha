# ポジショニング

本書は「rescicle をどこに置くか」を固定する。[01-concept.md](01-concept.md) が何を作るか、[04-business.md](04-business.md) がなぜ売れるかを扱うのに対し、本書は**登ってはいけない山**と**登る山**を明示する。決定は [07-decisions.md](07-decisions.md) の D-90。

評価時点: 2026-09（Octopus の公開情報と Author Guide に基づく仮説。パイロットで更新する）。

---

## 1. 結論

> **Octopus = Primary Research Record（研究版の「出版先」）**
>
> **rescicle = Research Working Environment（研究版の「VS Code / Git / Claude Code」）**

「研究を小さい単位に分解して、グラフとして公開するサービス」として Octopus と同じ山を登ると負け筋が強い。rescicle は**公開の手前**にある私的な作業環境であり、構造化は研究者がフォームに書くのではなくエージェント（`Agent`）が日常の研究活動から生む。公開時に Octopus / RO-Crate / Nanopublication / Zenodo / 論文へ写像する。

第一原理:

> **人間に研究構造を書かせるのではなく、研究活動から構造が勝手に生まれる。**

自己認識として捨てるもの:

> 「研究記録の新しい形式を発明した」

そこにいるのは Octopus、ResearchEquals、Nanopublication、PROV-O などである。代わりに取る自己認識:

> **既存の研究標準を、人間が意識せず使えるようにする AI-native な研究環境**

---

## 2. Octopus を無視できない理由

[Octopus](https://www.octopus.ac/)（[FAQ](https://www.octopus.ac/faq)）は、論文の代わりに研究プロセスを段階ごとの publication として公開する一次研究記録（`Primary Research Record`）である。Jisc と Octopus Publishing CIC の非営利運営、UKRI の支援、無料提供。ORCID・DataCite DOI・versioning が既にある。正面から「Octopus より良い研究公開サイト」を作るのは厳しい。

### 2.1 時系列

| 時期 | 出来事 |
| --- | --- |
| 2018-10 頃 | Alexandra Freeman が Royal Society で構想を発表。Problem → Hypothesis → Method → Data → Analysis → Interpretation… の基本構造がほぼ完成していた（[Royal Society ブログ](https://royalsociety.org/blog/2019/10/octopus-a-radical-new-approach-to-scientific-publishing/)） |
| 2019-10 | prototype。Mozilla 助成、Imperial College の学生らも参加 |
| 2021-08-06 | Jisc の正式プロジェクトとして開発開始（[Jisc](https://www.jisc.ac.uk/innovation/projects/octopus-creating-a-new-primary-research-record-for-science)） |
| 2022-06〜07 | 現行サービス正式リリース（Octopus: initial release June 2022、Jisc: Released in July 2022） |
| 2026-06 | 外部データセット等を研究グラフへ取り込む「Pearls」を追加（[Introducing Pearls](https://www.octopus.ac/blog/introducing-pearls)） |

アイデアとして約 8 年、実サービスとして約 4 年。無視できない先行である。

### 2.2 Octopus が強いところ

* 研究を小さい単位に分けて公開する思想が既に社会実装されている
* 機関支援・非営利・無料という運営形態
* ORCID / DOI / versioning など「正式な記録」に必要な装備

### 2.3 それでも隙間がある

Author Guide（[Octopus Author Guide](https://int.octopus.ac/author-guide)）の実態は、journal に submit するつもりで publication を作ることである。タイトル、publication type、本文、references、funding、co-author、preview、publish。公開後は formal version of record になり、ORCID に紐づく。

名前は「research as it happens」でも、UI 上の境界は依然として:

```text
研究する → Octopus に記録・公開する
```

Octopus 自身も、複数の linked publication を順番に作るのが painful だったため bulk publishing を改善したと書いている（[2025 の投稿](https://www.octopus.ac/blog/making-it-easier-to-share-multiple-linked-publications)）。**人間が publication form を埋める**設計であることは、rescicle にとって良いニュースである。

構想の起点は 2018 年なので、「研究者が研究を構造化して登録する」が自然だった。2026 年なら「研究者は普通に研究する。構造化は Agent がやる」が可能になっている。この時間差を使う。

---

## 3. 勝ち筋: Research Working Environment

### 3.1 やらないこと / やること

| 方向 | 勝ち目 | 扱い |
| --- | --- | --- |
| Octopus のような研究公開サービス | かなり厳しい | やらない。敵にせず出口にする |
| 新しい Science Record 標準だけ作る | 厳しい | RRS は草案・参照実装の範囲に留める（[01 §3](01-concept.md)、D-01） |
| ELN を作る | 激戦 | フォーム中心のノートにはしない（[04 §1](04-business.md)） |
| Research graph viewer 単体 | 単体では弱い | View は作業環境の一部 |
| Local-first research workspace | 面白い | **やる**（C2） |
| AI が自動で Science Record を作る | 強い | **やる**（C1） |
| 既存標準・Octopus 等へ export | 強い | **やる**（C3） |
| 研究者の全履歴を Git 的に管理する | 強い | **やる**（Revision / Timeline） |

### 3.2 体験の差

研究フォルダに `data.csv` / `analysis.ipynb` / `plot.png` / `memo.md` / `protocol.pdf` がある。研究者は「Hypothesis を登録します」とは言わない。エージェントと:

> このグラフ見ると濃度依存っぽいな。でも 20mg だけ外れてる。測定ミスかな？

と話す。rescicle が裏で問い・仮説・予測・測定・観測・結果と関係を提案する。研究者は確認（`Confirm`） / 却下（`Reject`） / 修正だけする。これは Octopus ではない。

中心 UI は入力フォームの山ではなく、概ね次でよい（alpha ではマップと会話欄が同じ窓にあり、データ・ファイル画面が並ぶ。Timeline に当たる履歴画面はまだない。[08-screens.md](08-screens.md)）:

```text
Chat / Files / Research Graph / Timeline
```

フォームを作り込みすぎない。エージェントが「今の発言を新しい仮説として記録しますか」「この CSV は昨日のプロトコルから生成されたデータと思われます。関連付けますか」と処理する。

### 3.3 私的な研究（`Private research`）

Octopus は基本的に公開のためのシステムである（Open Access、ORCID、DOI、「patent office」）。現実の研究の大半はその手前にある。

例:

* この仮説たぶん間違ってる
* 昨日の結果怪しい
* A 案と B 案どっちで行く？
* このデータはまだ誰にも見せたくない
* この解析コードは何のために書いたか
* 半年前になぜこの条件を捨てたか

ここをローカルで履歴付きに残し、ある時点で Publish すると Octopus / RO-Crate / Nanopublication / Zenodo / 論文へ変換できる、が rescicle の世界である。ローカルファーストと外向きポリシー（[01 §5](01-concept.md)）はこの境界そのものである。

```text
PRIVATE（rescicle）
  Thought → Hypothesis → Prediction → Experiment → Observation → Correction → …
        ↓ Publish（選択的）
PUBLIC（Octopus / RO-Crate / Nanopub / Zenodo / Paper）
```

---

## 4. Octopus は敵ではなく出口

関係は競合ではなくパイプラインにする。

```text
rescicle（作業・私的記録） → 選択的公開 → Octopus / 他の標準・リポジトリ
```

将来の例（v0.1 の範囲外。方針のみ）:

1. 研究者が「この研究を Octopus 形式で公開して」と言う
2. エージェントが Research Problem / Rationale-Hypothesis / Method / Results / Analysis / Interpretation へ切り出す
3. 人間が確認する
4. Octopus API（または同等の出口）へ publish

Octopus が普及するほど、rescicle の出口価値が上がる。Git と GitHub の比喩（[01 §9](01-concept.md)）に当てると、Octopus は「公開ホストの一種」、rescicle は「日常の作業環境 + ローカルの研究記録」である。rescicle Network は将来の公式ホストであり、Octopus を排除する必要はない。

---

## 5. 既存 docs との対応

| 本書の主張 | 既存 |
| --- | --- |
| 会話が入力、マップが確認 | C1（01 §15）、D-89、D-112 |
| 手元にあり、許した情報だけ出る | C2、Egress Policy |
| 記録は閉じない。既存標準へ写像 | C3、D-02、05 §7 |
| 論文ではなく研究記録 | 01 §4。ただし「公開サイトを自前で勝つ」ではない |
| 事業の順番は個人ユーティリティから | 01 §13、06 |
| 最初の Wow は Paywall の外 | D-13、D-113 |
| Agent Constraint | [09-usecases.md](09-usecases.md) の「rescicle が守っている境界」、04 §1 |

本書が強調して足すのは一点である。**公開単位の発明競争には出ない。作業環境と自動構造化で、既存の公開単位へ届ける。**

---

## 6. 製品判断への含意（短いチェックリスト）

* 公開グラフの閲覧・DOI・査読フローを v0.1 の中心にしない
* 「研究記録の新オントロジー」を売り文句にしない。RRS は内部と互換のための小さく単純なモデル（01 §2）
* 入力 UI の主戦場をフォームにしない。Chat + Map + Files + Timeline
* private な却下・迷い・未公開データを第一級の価値にする（Timeline / statement / rejected の扱い、D-88）
* エクスポート先の一覧に Octopus を明示候補として残す（実装時期はパイロット後。U-05 / M7 系と揃える）
* Octopus の採用が進むことを脅威ではなく追い風として文書・事業仮説に書く
