/**
 * アレログ・マネージャー ローカルサーバー
 * スマホから直接HTMLレポートをアップロード可能
 */

const express = require('express');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 8080;

// 受信したレポートを一時保存（メモリ内）
let receivedReports = [];

// 静的ファイルの提供（プロジェクトルート）
app.use(express.static(__dirname));

// JSONボディパーサー
app.use(express.json({ limit: '50mb' }));

// ローカルIPアドレスを取得
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// アップロードエンドポイント
app.post('/upload', (req, res) => {
    try {
        const { fileName, content } = req.body;

        if (!fileName || !content) {
            return res.status(400).json({ error: 'ファイル名とコンテンツが必要です' });
        }

        // 受信したレポートを保存
        receivedReports.push({
            fileName,
            content,
            receivedAt: new Date().toISOString()
        });

        console.log(`✅ レポート受信: ${fileName} (${new Date().toLocaleString('ja-JP')})`);

        res.json({
            status: 'success',
            message: 'レポートを受信しました',
            fileName
        });
    } catch (error) {
        console.error('❌ アップロードエラー:', error);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// 受信済みレポート取得エンドポイント
app.get('/reports', (req, res) => {
    res.json({
        count: receivedReports.length,
        reports: receivedReports
    });
});

// サーバー起動
app.listen(PORT, () => {
    const localIP = getLocalIP();

    console.log('\n' + '='.repeat(60));
    console.log('🏥 アレログ・マネージャー サーバー起動');
    console.log('='.repeat(60));
    console.log(`\n📱 スマホからアクセス: http://${localIP}:${PORT}/manager.html`);
    console.log(`💻 PCでアクセス: http://localhost:${PORT}/manager.html`);
    console.log(`\n📡 アップロードURL: http://${localIP}:${PORT}/upload`);
    console.log(`\n⏹  終了するには: Ctrl+C\n`);
    console.log('='.repeat(60) + '\n');
});
