# rescicle — first user build v0.0.8

最初の研究ユーザー向けの、ローカル完結型デスクトップMVPです。

## ダウンロード

Windows (x64) インストーラ:

**[rescicle Setup をダウンロード（最新リリース）](https://github.com/ShoheiImamura/rescicle-alpha/releases/latest/download/rescicle-Setup.exe)**

過去のバージョンは [Releasesページ](https://github.com/ShoheiImamura/rescicle-alpha/releases) にあります。

ダウンロードした `rescicle-Setup.exe`（約3MB）を実行してください。インストーラにはコード署名がないため、Windows SmartScreenの警告が出ることがあります。その場合は **詳細情報** → **実行** を選んでください。rescicleはユーザー単位でインストールされるので管理者権限は不要で、完了画面からそのまま起動できます。

画面の描画にはWindows同梱のWebView2ランタイムを使います。Windows 11には標準で入っています。入っていない環境では、インストーラが自動で取得します。

### 0.0.6 / 0.0.7 から上げる場合

0.0.7 以降は**起動した時点で保存データを書き換えます**。画面が出るより前に済むので、あとから取り消すことはできません。0.0.7 を使っていれば、この移行はもう終わっています。

- メモは、付いていたオブジェクトの**補足**に移り、メモという型自体が無くなります。2つに付いていたものは両方に入り、どこにも付いていなかったものは消えます。
- 却下したオブジェクトは、却下から**3分後に削除**されます。0.0.6 では一覧の末尾に残り続けていました。

0.0.6 の状態を残しておきたい場合は、**上げる前に** `%AppData%\rescicle\rescicle.sqlite` をコピーしてください。`-wal` と `-shm` が並んでいれば一緒にコピーします。

なお 0.0.6 には記録を消す機能がありません。0.0.7 以降の **設定 → rescicleの記録 → すべて消す** は、0.0.6 から持ち越した記録にも使えます。

### アンインストール

**設定 → アプリ → インストールされているアプリ** から、他のアプリと同じように削除してください。`%LocalAppData%\rescicle` 以下のプログラムファイルとショートカットが削除されます。

研究フォルダには一切手を触れません。rescicleはファイルを読むだけで、書き換えることはありません（[研究フォルダは読むだけです](#研究フォルダは読むだけです)）。

次のものは、再インストール時に続きから使えるように意図的に残ります。完全に消したい場合は手動で削除してください:

- `%AppData%\rescicle` — 設定、Research Objectと会話を保持するSQLiteデータベース、エージェント作業ディレクトリ。中身だけ空にしたいなら、アンインストール前に **設定 → rescicleの記録 → すべて消す** が使えます。
- Claude CodeへのMCP登録（登録した場合）。消さないと、Claude Codeが `rescicle` サーバーの起動失敗を報告し続けます:

```powershell
claude mcp remove --scope user rescicle
```

## 使いかた

1. rescicleをインストールして起動します。
2. **いま、何を調べていますか** に、研究について書いて **はじめる**。書いた文がそのまま最初の発言になり、研究名にもなります。研究フォルダはここでは聞きません。
3. 最初の応答が返るころ、**Claude Code側からもrescicleを読み書きできます** という案内が出ることがあります。使うなら **登録する**、使わないなら **あとで**。この端末で一度登録すれば、もう出ません。
4. 研究について普通に話します。rescicleはすでにサインイン済みの `claude` CLIを実行するので、APIキーは不要です。検出できているかは **設定** で確認できます。
5. Question / Hypothesis / Prediction / Measurement がResearch Objectとして現れ、Confirm / Rejectできます。AIが引いたつながりも、同じように1本ずつ決められます。
6. AIが引かなかったつながりは、カードを開いて **＋ つなぐ** から自分で引けます。相手を選んだ時点で引かれます（型の組が述語を決めるので、選ぶものは相手だけです）。要らない線は **はずす** で消えます。消した線は同じ手順で引き直せます。
7. 測定には **実施した** があります。確定したかどうか（status）とは別の軸で、実際にやったかどうかです。
8. **データ・ファイル** で研究フォルダを選ぶと、その中のファイルが並びます。rescicleはファイルを読むだけで、書き換え・移動・コピー・削除はしません。**データとして登録** を押した時点で登録は終わりで、そのあとに、それを生み出した測定を選べます。選ぶと線が引かれ、測定は実施済みになります。選ばなくても登録は済んでいます。フォルダはこの画面でいつでも変えられます。
9. **Ctrl+F** で検索、**Ctrl+K** で会話欄へ。Escapeで戻ります。
10. 右上の **設定** に、Claude Codeの接続状態、研究フォルダの変更、そして **rescicleの記録** があります。記録とは、研究・オブジェクト・つながり・会話のことです。**すべて消す** で全部消えて最初の画面に戻りますが、研究フォルダのファイルには触れません（画面に並ぶ「データ」はファイルの登録のことで、別のものです）。

## AIとの境界

### 研究フォルダは読むだけです

rescicleは研究フォルダのファイルを**読むだけ**です。書き換え・作成・移動・改名・削除はしません。rescicleがディスクに書くのは `%AppData%\rescicle` の中だけで、設定・SQLiteデータベース・エージェント用ディレクトリの3つです。

エージェント側も書けません。`claude` の子プロセスは作業ディレクトリが研究フォルダではなくrescicleのエージェント用ディレクトリで、`--allowedTools ""` と `--strict-mcp-config` を付けて起動するため、**ファイルを触るツールを1つも持っていません**。

これはテストで縛っています（`nothing_rescicle_does_writes_to_the_research_folder`）。フォルダの中身をバイト単位で控えてから、スキャン・読み込み・Asset登録・プロジェクト設定変更・リセットを全部走らせ、1バイトも変わっていないことを確かめます。

### 会話モード

エージェントは研究フォルダではなく、**独立したrescicleのエージェント用ディレクトリ**で動きます。rescicleが送るのは次の4つだけです:

- 会話テキスト
- 要約されたResearch Object / Relation（測定については実施したかどうかも）
- 相対ファイル名・サイズ・更新日時
- **AIが読むと決めたファイルの抜粋**（先頭4KBまで）

ファイルの中身が**先回りして送られることはありません**。AIに渡るのは名前・サイズ・更新日時だけで、中身が要ると判断したときにファイル名を挙げ、rescicleがそれを読んで次のターンに渡します。

読めるのは**研究フォルダの内側だけ**です。パスはrescicle側で解決するので、フォルダの外を指す名前は何にも届きません。テキストとして読めないファイルは読みません。1回のターンで読めるのは数件までで、往復も2回までです。

**読んだファイルはすべて記録されます。** ファイル画面で「読み込み済み」が付き、`events` にも残ります。1件ずつ許可を求める代わりに、何が出ていったかを後から見られるようにしています。

応答はJSON schemaで `{ reply, operations }` 型に固定されます。operationsはrescicle Coreが検証してからSQLiteに書き込みます。

### Claude Codeモード

rescicleはローカルのstdio MCPサーバーとしても動作します。Claude Codeには次のツールが渡されます:

- 現在の研究コンテキストの読み取り
- proposedなObjectの作成
- proposedなRelationの作成
- Objectの確定・却下
- Measurementを実施済みにする / 戻す
- プロジェクト内ファイルのメタデータ一覧
- 既存のローカルファイルのAsset登録

**つながりを外すツールはありません。** AIは線を提案し、研究者が決める ── その向きは意図的に片方向です。引いた線を消せるのは画面からだけです。

登録は **設定 → Claude Codeに登録** で終わります。rescicleが `claude` CLIを自分で実行するので、ターミナルを開く必要はありません。すでに登録されているかどうかも同じ画面が読み戻して表示します。

同じ名前への再登録はCLIに拒否されるため、登録は毎回いったん外してから入れ直します。古いビルドのパスが残っている場合も、これで現在のrescicleに置き換わります。実行されるのは次と同等です:

```powershell
claude mcp remove --scope user rescicle
claude mcp add --transport stdio --scope user rescicle -- "C:\...\rescicle.exe" --mcp-server
```

自分でターミナルから実行したい場合は、同じ画面の **設定コマンドをコピー** が使えます。

これらのMCPツールを使う前に、rescicle側でProjectを開いておいてください。

## ドメイン v0

主要なObject:

- Question
- Hypothesis
- Prediction
- Measurement
- Asset

Relation:

- `addresses` — Hypothesis → Question
- `predicts` — Hypothesis → Prediction
- `tested_by` — Prediction → Measurement
- `produces` — Measurement → Asset
- `references` / `related_to` — 型を選ばない2つ

画面から引けるのは上の4本だけです。型の組が述語を一意に決めるので、選ぶのは相手のオブジェクトだけで済みます。残る2つはどの型同士でも通るぶん述語を選ばせる必要があり、いまはAIとMCP経由でしか作られません。

各Research Object / Relationは `origin` と `status`（`proposed` / `confirmed` / `rejected`）を持ちます。

各Objectは `note` も持ちます。そのオブジェクトについての**補足**です — 確認すべきこと、注意点、そのオブジェクトの主張には含まれない条件。`body` がそのオブジェクト自身の中身なのに対し、`note` はそれについて誰かが書き添えたものです。

以前はこれが `note` 型のObjectで、関係で他のオブジェクトに結ばれていました。そうすると**補足が単独で存在でき、2つのものに同時に付く**ことになります。補足はそういうものではありません。属する先は1つで、1つに属するということを表す形は**列**です。型もその一覧もナビ項目も無くなり、`未整理 / 残す / 不要` という status も要らなくなりました — 補足を「確定」する意味がないからです。名前を付け替えて合わせていたこと自体が、合っていない印でした。

既存のデータは起動時に移されます。付いていたオブジェクトの `note` に本文が入り、2つに付いていたものは両方に入ります。どこにも付いていなかったものは、属する先が無いので消えます。

`rejected` は保管ではなく破棄です。却下したものはどの画面からも消え、**3分後に削除されます**。押し間違いに気づくのはたいてい数秒後なので、そのあいだは通知から「戻す」で取り消せます。過ぎたら消えます — 研究者が要らないと言ったものを、一覧の末尾に永久に置いておく理由はありません。消えるときは、そこに入っていた線・Asset・測定の記録も一緒に消えます。ログ（`events`）は残るので、あったことと捨てたことは辿れます。

Measurementだけは、これに加えて**実施したかどうか**を持ちます。statusは「やると決めたか」で、こちらは「やったか」です。確定したがまだ実施していない測定は普通にあるので、同じ軸には載せられません。日付は分かるときだけ表示します — ボタンを押した時刻は測定がいつ走ったかについて何も言わないので記録せず、その測定が生み出したデータファイルの更新日時があればそれを使います。

## 構成

- `src/renderer/` — 画面。ビルド工程のない素のHTML / CSS / JavaScriptです。`bridge.js` が `window.rescicle` を組み立てるので、`app.js` は自分がどのランタイムの上にいるかを知りません。
- `src-tauri/` — Rust側。ドメイン検証、SQLite、`claude` CLIの駆動、stdio MCPサーバー。

## 開発

### 必要なもの

Node.js 24 と、Rust の stable（MSVCツールチェーン）です。Windowsでまだ揃っていない場合:

```powershell
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Build Tools は数GBあり、15〜30分かかります。`rusqlite` がSQLiteをCからビルドするため、C++ワークロードとWindows SDKの両方が要ります。

> **入れ終わったらターミナルを開き直してください。** rustup は `%USERPROFILE%\.cargo\bin` をPATHに登録しますが、それより前から開いていたシェルには反映されません。`npm run dev` はこう出ます:
>
> ```
> failed to run 'cargo metadata' command to get workspace directory: ... program not found
> ```
>
> **エディタの統合ターミナルの場合、タブを開き直しても直りません。** 子シェルはエディタ本体の環境を引き継ぐので、エディタごと再起動してください。それをしたくなければ、そのシェルで直接PATHを足せば通ります:
>
> ```bash
> export PATH="$PATH:$HOME/.cargo/bin"   # Git Bash。恒久化するなら ~/.bashrc へ
> ```
>
> Build Tools のインストールがまだ走っている最中は、別の形でも止まります。`LNK1181: 入力ファイル 'kernel32.lib' を開けません` はリンカがWindows SDKを見つけられていないという意味で、インストールの完了待ちです。完了後は追加の設定なしにリンクできます（開発者用コマンドプロンプトは要りません）。

画面はWebView2で描画します。Windows 11には標準で入っています。

### 起動とビルド

```bash
npm install
npm run dev    # ビルドしてアプリを起動する（開発用）
npm test       # cargo test
npm run build  # インストーラを src-tauri/target/release/bundle/nsis/ に出力
```

`npm run dev` の初回は依存クレートを400ほどビルドするので数分かかります。2回目以降は差分だけです。

### 自分のデータを汚さずに動かす

`RESCICLE_DATA_DIR` を指定すると、`%AppData%\rescicle` ではなくそのフォルダをデータ置き場として使います。手元の研究記録に触れずに、まっさらな状態から試せます。

**Windowsの絶対パスで指定してください。** 相対パスと、Git Bash 形式の `/c/Users/...` は起動時に弾かれます。後者はWindowsから見ると絶対パスではなく、そのまま解決すると `C:\c\Users\...` という別の場所が静かに作られてしまうためです（Git Bash から `export` する場合はMSYSが変換するので、そのまま書いて構いません）。

```powershell
$env:RESCICLE_DATA_DIR = "$env:TEMP\rescicle-scratch"
npm run dev
```

### テスト

`npm test` は実物の `claude` CLIを起動するテストを除外します（CIに `claude` もサインインも無いため）。手元で主経路を通しで確認する場合:

```bash
# CLIの発見と起動のみ
cargo test --manifest-path src-tauri/Cargo.toml --test claude_cli -- --ignored --nocapture

# 会話1往復を実際に回す（Claudeのターンを1回消費します）
cargo test --manifest-path src-tauri/Cargo.toml --test claude_cli a_real_turn -- --ignored --nocapture
```

### リリース

リリースは開発マシンからではなく、GitHub Actions（`.github/workflows/release.yml`）でビルド・公開します:

1. バージョンを上げる: `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` の3箇所を同じ番号に揃えてコミット。ワークフローが3つの一致を検査するので、上げ忘れはそこで落ちます。
2. タグを打って push: `git tag v0.0.8 && git push origin main && git push origin v0.0.8`。`--tags` は不要なローカルタグまで送ってしまうので使いません。
3. ワークフローがテストを実行し、`windows-latest` でインストーラをビルドし、`gh` で `v0.0.8` GitHub Releaseを作成して `rescicle-Setup.exe` を添付します。最後にアセットが実際に乗ったか検証するので、添付に失敗すればジョブが赤くなります。

タグは `v<package.jsonのversion>` と一致している必要があります（ワークフローの guard ステップが検査します）。Tauriが出力するファイル名にはバージョンが入りますが、ワークフローが `rescicle-Setup.exe` にリネームしてから添付するため、冒頭のダウンロードリンクはバージョンを上げても更新不要です。

AIランタイムは同梱していません。rescicleはユーザーがすでにインストール・サインイン済みの `claude` CLIを動かします。画面の描画もOS同梱のWebView2に任せるので、インストーラに入るのはアプリ本体だけです。

## 意図的に対象外のもの

- 音声 / リアルタイム音声
- 常時モニタリング
- Jev
- Observation / Analysis / Result / Claim
- 文献検索
- 論文生成
- クラウド同期
- 共同編集 / 公開
- 自動アップデータ / 署名
