# rescicle — first user build v0.0.5

最初の研究ユーザー向けの、ローカル完結型デスクトップMVPです。

## ダウンロード

Windows (x64) インストーラ:

**[rescicle Setup をダウンロード（最新リリース）](https://github.com/ShoheiImamura/rescicle-alpha/releases/latest/download/rescicle-Setup.exe)**

過去のバージョンは [Releasesページ](https://github.com/ShoheiImamura/rescicle-alpha/releases) にあります。

ダウンロードした `rescicle-Setup.exe`（約3MB）を実行してください。インストーラにはコード署名がないため、Windows SmartScreenの警告が出ることがあります。その場合は **詳細情報** → **実行** を選んでください。rescicleはユーザー単位でインストールされるので管理者権限は不要で、完了画面からそのまま起動できます。

画面の描画にはWindows同梱のWebView2ランタイムを使います。Windows 11には標準で入っています。入っていない環境では、インストーラが自動で取得します。

### アンインストール

**設定 → アプリ → インストールされているアプリ** から、他のアプリと同じように削除してください。`%LocalAppData%\rescicle` 以下のプログラムファイルとショートカットが削除されます。

研究フォルダには一切手を触れません。rescicleはファイルをその場で参照するだけです。

次のものは、再インストール時に続きから使えるように意図的に残ります。完全に消したい場合は手動で削除してください:

- `%AppData%\rescicle` — 設定、Research Objectと会話を保持するSQLiteデータベース、エージェント作業ディレクトリ。
- Claude CodeへのMCP登録（設定コマンドを実行した場合）。消さないと、Claude Codeが `rescicle` サーバーの起動失敗を報告し続けます:

```powershell
claude mcp remove --scope user rescicle
```

## 使いかた

1. rescicleをインストールして起動します。
2. 既存の研究フォルダを選びます。ファイルはその場で参照されるだけで、移動もアップロードもされません。
3. **AI接続** を開き、Claude Codeが検出されていることを確認します。rescicleはすでにサインイン済みの `claude` CLIを実行するので、APIキーは不要です。
4. 必要なら **MCP設定コマンドをコピー** を押し、ターミナルで一度実行してください。rescicleのローカルMCPサーバー経由で、Claude Code側からrescicleを操作できるようになります。
5. 研究について普通に話します。
6. Question / Hypothesis / Prediction / Measurement がResearch Objectとして現れ、Confirm / Rejectできます。
7. 手元の既存ファイルをAssetとして登録できます。

## AIとの境界

### 会話モード

エージェントは研究フォルダではなく、**独立したrescicleのエージェント用ディレクトリ**で動きます。rescicleが送るのは次の3つだけです:

- 会話テキスト
- 要約されたResearch Object / Relation
- 相対ファイル名・サイズ・更新日時

v0ではファイルの中身を自動送信することは**ありません**。

応答はJSON schemaで `{ reply, operations }` 型に固定されます。operationsはrescicle Coreが検証してからSQLiteに書き込みます。

### Claude Codeモード

rescicleはローカルのstdio MCPサーバーとしても動作します。Claude Codeには次のツールが渡されます:

- 現在の研究コンテキストの読み取り
- proposedなObjectの作成
- proposedなRelationの作成
- Objectの確定・却下
- プロジェクト内ファイルのメタデータ一覧
- 既存のローカルファイルのAsset登録

生成される設定コマンドは次と同等です:

```powershell
claude mcp add --transport stdio --scope user rescicle -- "C:\...\rescicle.exe" --mcp-server
```

これらのMCPツールを使う前に、rescicle側でProjectを開いておいてください。

## ドメイン v0

主要なObject:

- Question
- Hypothesis
- Prediction
- Measurement
- Asset
- Note

Relation:

- `addresses`
- `predicts`
- `tested_by`
- `produces`
- `references`
- `related_to`

各Research Object / Relationは `origin` と `status`（`proposed` / `confirmed` / `rejected`）を持ちます。

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
2. タグを打って push: `git tag v0.0.5 && git push origin main && git push origin v0.0.5`。`--tags` は不要なローカルタグまで送ってしまうので使いません。
3. ワークフローがテストを実行し、`windows-latest` でインストーラをビルドし、`gh` で `v0.0.5` GitHub Releaseを作成して `rescicle-Setup.exe` を添付します。最後にアセットが実際に乗ったか検証するので、添付に失敗すればジョブが赤くなります。

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
