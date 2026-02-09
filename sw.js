const CACHE_NAME = 'allergy-log-v31';
const ASSETS = [
    '/allelog/',
    '/allelog/index.html',
    '/allelog/style.css',
    '/allelog/app.js',
    '/allelog/manifest.json',
    '/allelog/favicon.ico',
    '/allelog/icon-192.png',
    '/allelog/icon-512.png'
];

self.addEventListener('install', (e) => {
    console.log('[SW] Installing...');
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    console.log('[SW] Activating...');
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // http/https 以外のリクエスト（chrome-extension://など）は無視
    if (!e.request.url.startsWith('http')) {
        return;
    }

    // 1. HTMLページへのアクセス（画面遷移）の場合
    // .htmlが含まれるかではなく、ブラウザの「navigate」モードで判定するのが確実です
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    // 正常に取得できたらキャッシュを更新して、そのレスポンスを返す
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                    return response;
                })
                .catch(() => {
                    // オフラインなどで取得失敗した場合
                    // キャッシュされている 'index.html' を強制的に返す（これが重要！）
                    return caches.match('/allelog/index.html')
                        .then(response => {
                             // index.htmlがなければ、キャッシュ内のルートパスを探す保険
                            return response || caches.match('/allelog/');
                        });
                })
        );
    } 
    // 2. その他のアセット（画像、CSS、JSなど）
    else {
        e.respondWith(
            caches.match(e.request)
                .then((response) => {
                    // キャッシュにあればそれを返す、なければネットワークへ
                    return response || fetch(e.request).then((response) => {
                        // 新しい画像などを動的にキャッシュしたい場合はここで保存処理を追加
                        return response;
                    });
                })
        );
    }
});
