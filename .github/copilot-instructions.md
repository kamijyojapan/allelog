# GitHub Copilot Instructions for Allergy Log (アレログ)

あなたはアレルギー症状記録PWA「アレログ」の開発アシスタントです。
以下のプロジェクト情報と開発ルールを厳守して回答を行ってください。

## プロジェクト概要
- **種類:** Vanilla JS (ES Modules) で構築されたサーバーレスPWA
- **構成:** バンドラーなし、IndexedDB + Service Workerで完全オフライン動作
- **主要ファイル:**
  - `app.js`: アプリのロジック中核 (`window.app`)
  - `sw.js`: Service Worker (キャッシュ戦略: HTML/JSはNetwork First)
  - `index.html`: UI構造
  - `style.css`: スタイル定義

## 回答のガイドライン
1. **言語:** 常に**日本語**で回答してください。
2. **コードスタイル:** モダンなVanilla JS (ES6+) を使用してください。フレームワーク（React/Vueなど）の構文は使用しないでください。

## 重要: GAS_Script.js について

**GAS_Script.js は Google Apps Script（GAS）上で動作するサーバーサイドスクリプトです。**

- **用途:** Google Sheetsなどのサーバー処理を担当
- **ローカル実行:** ローカル環境では実際には動作しません（参考用としてローカルに保存）
- **更新時の手順:**
  1. サーバーサイドの書き換えが必要な場合、`GAS_Script.js` をローカルで更新
  2. 更新内容をユーザーが Google Apps Script エディタにコピー&ペーストで転記
  3. GAS上で実装内容を反映

---

## ⚠️ コード変更時の必須アクション (重要)

コードやアセットに変更を加える提案をする際は、**必ず以下の5ファイルのバージョン更新**をセットで提案・指示してください。

### 1. バージョン番号の更新箇所
以下の箇所の整合性を常に保ってください。

1.  **`app.js`**: 3行目の `APP_VERSION`
    ```javascript
    const APP_VERSION = 'x.x.x';
    ```
2.  **`index.html`**: Aboutモーダル末尾の表記
    ```html
    Allergy Log (アレログ) vx.x.x
    ```
3.  **`README.md`**: 5行目のVersion表記
    ```markdown
    **Version:** x.x.x
    ```
4.  **`CHANGELOG.md`**: ファイル先頭に新バージョンを追記
    ```markdown
    ## [x.x.x] - YYYY-MM-DD
    ### カテゴリ (追加/修正/改善)
    - 変更内容
    ```
5.  **`sw.js`**: キャッシュ名のバージョン（インクリメントする）
    ```javascript
    const CACHE_NAME = 'allergy-log-vXX'; // 数値を1つ増やす
    ```

### 2. Git操作の提案
修正コードの提示後、変更を確定させるために以下のGitコマンドフローを提示してください。

```bash
git add .
git commit -m "fix: <変更内容を簡潔に>"
git push
コーディングの注意点
app.js 内の DB オブジェクトや Utils ヘルパーを活用してください。

ユーザーデータはすべて IndexedDB に保存されるため、スキーマ変更時は DB.open 内の onupgradeneeded の修正が必要です。

HTML/CSSを変更した際は、sw.js の CACHE_NAME を更新しないとユーザーの手元で即座に反映されない点に注意してください。