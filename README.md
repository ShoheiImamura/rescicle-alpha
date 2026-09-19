# rescicle — first user build v0.0.3

最初の研究ユーザー向けの、ローカル完結型デスクトップMVPです。

## ダウンロード

Windows (x64) インストーラ:

**[rescicle Setup をダウンロード（最新リリース）](https://github.com/ShoheiImamura/rescicle-alpha/releases/latest/download/rescicle-Setup.exe)**

過去のバージョンは [Releasesページ](https://github.com/ShoheiImamura/rescicle-alpha/releases) にあります。

ダウンロードした `rescicle-Setup.exe` を実行してください。インストーラにはコード署名がないため、Windows SmartScreenの警告が出ることがあります。その場合は **詳細情報** → **実行** を選んでください。rescicleはユーザー単位でインストールされるので管理者権限は不要で、インストール完了後に自動で起動します。

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

## 開発

Node.js 24を推奨します。

```bash
npm install
npm test
npm start
```

Windowsインストーラのローカルビルド（`out/make/squirrel.windows/x64/` に出力されます）:

```bash
npm run make
```

### リリース

リリースは開発マシンからではなく、GitHub Actions（`.github/workflows/release.yml`）でビルド・公開します:

1. バージョンを上げる: `npm version 0.0.4 --no-git-tag-version` してコミット。
2. タグを打って push: `git tag v0.0.4 && git push origin main && git push origin v0.0.4`。`--tags` は不要なローカルタグまで送ってしまうので使いません。
3. ワークフローがテストを実行し、`windows-latest` でインストーラをビルドし、`gh` で `v0.0.4` GitHub Releaseを作成して `rescicle-Setup.exe` を添付します。最後にアセットが実際に乗ったか検証するので、添付に失敗すればジョブが赤くなります。

タグは `v<package.jsonのversion>` と一致している必要があります（ワークフローの guard ステップが検査します）。インストーラのファイル名にはバージョンが入らないので、冒頭のダウンロードリンクは常に最新リリースを指し、バージョンを上げても更新は不要です。

AIランタイムは同梱していません。rescicleはユーザーがすでにインストール・サインイン済みの `claude` CLIを動かすため、インストーラにはアプリ本体とElectronしか入りません。

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
