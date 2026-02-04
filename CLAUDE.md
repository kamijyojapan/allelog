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

## バージョン参照箇所（すべて一致させること）

バージョン番号は以下の **4箇所** に書かれている。変更したときは全箇所を同時に更新する。

| ファイル | 場所 |
|---------|------|
| `app.js` | 3行目: `const APP_VERSION = 'x.x.x';` |
| `index.html` | About モーダル末尾: `Allergy Log (アレログ) vx.x.x` |
| `README.md` | 5行目: `**Version:** x.x.x` |
| `CHANGELOG.md` | 最新エントリのバージョン番号 |

---

## ⚠️ push 前に必ず行うこと

以下を **すべて完了してから** `git commit` を行う。これは毎回必須。

### 1. バージョン番号の決定

セマンティックバージョニング基準：
- **MINOR up (x.X.0):** 新機能の追加
- **PATCH up (x.x.X):** バグ修正・小さな改善

### 2. 4箇所のバージョン番号を更新

```
app.js 3行目          → const APP_VERSION = '新バージョン';
index.html About末尾  → Allergy Log (アレログ) v新バージョン
README.md 5行目       → **Version:** 新バージョン
CHANGELOG.md          → 新エントリを先頭に追加（下記テンプレート参照）
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
