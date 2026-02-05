# CLAUDE.md - アレログ (Allergy Log)

このファイルは Claude Code がこのリポジトリで作業する際のガイダンスです。

---

## プロジェクト概要

アレルギー症状記録PWA。バンドラーなしの Vanilla JS で構成。サーバー不要、IndexedDB + Service Worker で完全オフライン動作。

## アーキテクチャ

| ファイル | 役割 |
|---------|------|
| `index.html` | メインHTML。side-menu・モーダル・フォーム構成 |
| `app.js` | アプリ全機能。`window.app` オブジェクト構成、末尾で `app.init()` |
| `style.css` | 全スタイル。CSS変数で色管理 |
| `sw.js` | Service Worker。キャッシュ戦略（HTML/JS: Network First、その他: Cache First） |
| `manifest.json` | PWAマニフェスト |
| `GAS_Script.js` | Google Apps Script のサーバー側スクリプト（下記「GAS_Script.js について」を参照） |

### GAS_Script.js について

- このファイルは **Google Apps Script (GAS)** 上で動作するサーバー側スクリプトである。
- ローカルでは実行しない。あくまで参考・編集用として保存している。
- サーバー側の変更が必要な場合は `GAS_Script.js` を更新し、その内容をユーザーが GAS のエディタ上に手動で転記する。

## バージョン参照箇所（すべて一致させること）

バージョン番号は以下の **5箇所** に書かれている。変更したときは全箇所を同時に更新する。

| ファイル | 場所 |
|---------|------|
| `app.js` | 3行目: `const APP_VERSION = 'x.x.x';` |
| `index.html` | About モーダル末尾: `Allergy Log (アレログ) vx.x.x` |
| `README.md` | 5行目: `**Version:** x.x.x` |
| `CHANGELOG.md` | 最新エントリのバージョン番号 |
| `sw.js` | `CACHE_NAME` の末尾の数値を1つ増やす: `'allergy-log-vXX'` |

---

## ⚠️ push 前に必ず行うこと

以下を **すべて完了してから** `git commit` を行う。これは毎回必須。

### 1. バージョン番号の決定

セマンティックバージョニング基準：
- **MINOR up (x.X.0):** 新機能の追加
- **PATCH up (x.x.X):** バグ修正・小さな改善

### 2. 5箇所のバージョン番号を更新

```
app.js 3行目          → const APP_VERSION = '新バージョン';
index.html About末尾  → Allergy Log (アレログ) v新バージョン
README.md 5行目       → **Version:** 新バージョン
CHANGELOG.md          → 新エントリを先頭に追加（下記テンプレート参照）
sw.js                 → CACHE_NAME の末尾の数値を1つ増やす
```

### 3. CHANGELOG.md に新エントリを追加（先頭に）

テンプレート：
```markdown
## [x.x.x] - YYYY-MM-DD

### 追加
- 新機能の説明

### 修正
- バグ修正の説明

### 改善
- 改善の説明
```

該当しないセクションは省略してよい。

### 4. README.md の「🆕 最近の更新」を書き換える

直前の1〜2件の変更を簡潔にまとめる。

---

## コミット規約

```bash
git commit -m "簡潔な日本語のコミットメッセージ

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

プレフィックス（任意）: `feat:` 新機能 / `fix:` バグ修正 / `docs:` ドキュメント / `refactor:` リファクタ

---

## コーディング注意点

- **モダン Vanilla JS (ES6+)** を使用する。React / Vue などのフレームワーク構文は使用しない。
- `app.js` 内の `DB` オブジェクトや `Utils` ヘルパーを活用する。
- ユーザーデータはすべて **IndexedDB** に保存されるため、スキーマ変更時は `DB.open` 内の `onupgradeneeded` を修正する必要がある。
- HTML / CSS を変更した際は、`sw.js` の `CACHE_NAME` を更新しないとユーザーの手元で即座に反映されない。
