const DB_NAME = 'AllergyCareDB_V7';
const DB_VERSION = 2;
const APP_VERSION = '1.3.7';

// --- DB Helper ---
const DB = {
    open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('meals')) db.createObjectStore('meals', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('meds')) db.createObjectStore('meds', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('symptoms')) db.createObjectStore('symptoms', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
    },
    async put(store, data) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(data);
            tx.oncomplete = () => resolve(data.id);
            tx.onerror = () => reject(tx.error);
        });
    },
    async delete(store, id) {
        const db = await this.open();
        return new Promise(resolve => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(id);
            tx.oncomplete = () => resolve();
        });
    },
    async getAll(store) {
        const db = await this.open();
        return new Promise(resolve => {
            const req = db.transaction(store, 'readonly').objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result);
        });
    },
    async getRange(store, start, end) {
        const db = await this.open();
        return new Promise(resolve => {
            const range = IDBKeyRange.bound(start, end);
            const req = db.transaction(store, 'readonly').objectStore(store).getAll(range);
            req.onsuccess = () => resolve(req.result);
        });
    },
    async getPresets() {
        const db = await this.open();
        return new Promise(resolve => {
            const req = db.transaction('settings').objectStore('settings').get('med_presets');
            req.onsuccess = () => resolve(req.result ? req.result.items : []);
        });
    },
    async compress(file) {
        if(!file) return null;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const cvs = document.createElement('canvas');
                    const scale = Math.min(1024 / Math.max(img.width, img.height), 1);
                    cvs.width = img.width * scale;
                    cvs.height = img.height * scale;
                    cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
                    cvs.toBlob(resolve, 'image/jpeg', 0.6);
                };
                img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsDataURL(file);
        });
    }
};

// --- Utils Helper ---
const Utils = {
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            if (!blob) return resolve(null);
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
};

// --- Tags Definition ---
const MEAL_TAGS = {
    '食材 (特定原材料等)': ['卵', '乳', '小麦', 'そば', '落花生', 'えび', 'かに', 'くるみ', '大豆', 'ごま', '魚類', '果物', 'ナッツ類'],
    'タイミング': ['朝食', '昼食', '夕食', 'おやつ'],
    '場所': ['自宅', '給食/弁当', '外食', '加工食品']
};

// --- Application Logic ---
const state = {
    currentDate: new Date(),
    selectedDate: new Date(),
    logs: [],
    editingLog: null,
    tempPhotos: [],
    isDoctorMode: false,
    isMenuOpen: false
};

const debugLogs = [];

function debugLog(msg) {
    const time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    debugLogs.push(`[${time}] ${msg}`);
    console.log('[DEBUG]', msg);
    const el = document.getElementById('debug-log-output');
    if (el) {
        el.textContent = debugLogs.join('\n');
        el.scrollTop = el.scrollHeight;
    }
}
window.debugLog = debugLog;

window.app = {
    async init() {
        debugLog(`アプリ起動 v${APP_VERSION}`);
        debugLog(`display-mode: ${window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'}`);
        debugLog(`deferredPrompt: ${window.deferredPrompt ? 'あり' : 'なし'}`);
        debugLog(`URL: ${window.location.href}`);
        // アイコンとmanifestのレスポンス確認
        ['./icon-192.png', './icon-512.png', './manifest.json'].forEach(src => {
            fetch(src).then(r => debugLog(`fetch ${src}: ${r.status}`)).catch(e => debugLog(`fetch ${src}: エラー ${e.message}`));
        });
        const chromeVer = navigator.userAgent.match(/Chrome\/([\d.]+)/);
        debugLog(`Chrome: ${chromeVer ? chromeVer[1] : 'unknown'}`);
        if (navigator.getInstalledRelatedApps) {
            navigator.getInstalledRelatedApps().then(apps => debugLog(`installedRelatedApps: ${apps.length} 件`));
        }
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`Persistent storage granted: ${isPersisted}`);
        }
        
        await this.reloadAll();
        
        // ▼▼ 追加: 設定画面の入力フィールド連携 ▼▼
        const idInput = document.getElementById('setting-chart-id');
        const nameInput = document.getElementById('setting-patient-name');
        
        if (idInput && nameInput) {
            // アプリ起動時にlocalStorageから値をロードして表示
            idInput.value = localStorage.getItem('allelog_chart_id') || '';
            nameInput.value = localStorage.getItem('allelog_patient_name') || '';
            
            // 入力変更時に即座にlocalStorageへ保存
            idInput.onchange = (e) => localStorage.setItem('allelog_chart_id', e.target.value);
            nameInput.onchange = (e) => localStorage.setItem('allelog_patient_name', e.target.value);
        }

        const snapshotDaysInput = document.getElementById('setting-snapshot-days');
        if (snapshotDaysInput) {
            snapshotDaysInput.value = this.getSnapshotDays();
            snapshotDaysInput.onchange = (e) => {
                localStorage.setItem('allelog_snapshot_days', e.target.value);
                this.updateSnapshotNotice();
            };
        }
        this.updateSnapshotNotice();
        // ▲▲ 追加ここまで ▲▲
        
        // Listeners
        document.getElementById('prev-month').onclick = () => this.changeMonth(-1);
        document.getElementById('next-month').onclick = () => this.changeMonth(1);
        document.getElementById('btn-today').onclick = () => this.goHome();
        document.getElementById('btn-doctor').onclick = () => this.toggleDoctorMode();
        document.getElementById('btn-send-data').onclick = () => this.sendDoctorData();
        
        // Menu Listeners
        document.getElementById('btn-menu').onclick = () => this.toggleMenu();
        document.getElementById('menu-backdrop').onclick = () => this.toggleMenu();

        // Menu Items
        document.getElementById('menu-data').onclick = () => { this.toggleMenu(); document.getElementById('view-settings').classList.remove('hidden'); };
        document.getElementById('menu-med-reg').onclick = () => { this.toggleMenu(); this.openMedManager(); };
        document.getElementById('menu-settings').onclick = () => {
            this.toggleMenu();
            this.openSettingsMenu();
        };
        document.getElementById('menu-refresh').onclick = () => { this.toggleMenu(); this.forceRefresh(); };
        document.getElementById('menu-about').onclick = () => { 
            this.toggleMenu(); 
            document.getElementById('view-about').classList.remove('hidden'); 
        };

        const changelogBtn = document.getElementById('btn-changelog');
        if (changelogBtn) changelogBtn.onclick = () => this.openChangelog();

        // PWA インストールボタン
        const installBtn = document.getElementById('menu-install');
        if (window.matchMedia('(display-mode: standalone)').matches) {
            installBtn.classList.add('hidden');
            debugLog('インストールボタン: 非表示（installed）');
        } else {
            window.addEventListener('beforeinstallprompt', () => {
                installBtn.classList.remove('hidden');
                debugLog('インストールボタン: 表示中');
            });
            debugLog('インストールボタン: beforeinstallprompt 待機中');
        }
        installBtn.onclick = async () => {
            this.toggleMenu();
            debugLog(`インストールボタン押し: deferredPrompt ${window.deferredPrompt ? 'あり' : 'なし'}`);
            if (window.deferredPrompt) {
                window.deferredPrompt.prompt();
                const { outcome } = await window.deferredPrompt.userChoice;
                debugLog(`prompt 結果: ${outcome}`);
                window.deferredPrompt = null;
                installBtn.classList.add('hidden');
            }
        };
        window.addEventListener('appinstalled', () => {
            installBtn.classList.add('hidden');
            window.deferredPrompt = null;
            debugLog('appinstalled イベント発火');
        });

        // デバッグログ表示ボタンの配線
        document.getElementById('btn-show-logs').onclick = () => {
            this.closeModals();
            document.getElementById('view-debug-logs').classList.remove('hidden');
            document.getElementById('debug-log-output').textContent = debugLogs.join('\n');
            const logEl = document.getElementById('debug-log-output');
            logEl.scrollTop = logEl.scrollHeight;
        };

        document.getElementById('btn-edit-entry').onclick = () => this.startEdit();
        document.getElementById('btn-delete-entry').onclick = () => this.deleteEntry();
        
        // Photo Inputs
        this.setupPhotoInput('meal-cam', 'meal');
        this.setupPhotoInput('meal-file', 'meal');
        this.setupPhotoInput('sym-cam', 'symptom');
        this.setupPhotoInput('sym-file', 'symptom');
        
        // 初期状態でホームをアクティブに
        this.setActiveNav('home');
    },

    async reloadAll() {
        const [meals, meds, symptoms] = await Promise.all([
            DB.getAll('meals'), DB.getAll('meds'), DB.getAll('symptoms')
        ]);

        // データ移行処理（photoをphotosに変換）
        const migratePhotos = (log) => {
            if (log.photo && !log.photos) {
                log.photos = [log.photo];
                // photoフィールドは削除しない（互換性のため）
            }
            return log;
        };

        state.logs = [...meals.map(migratePhotos), ...meds.map(migratePhotos), ...symptoms.map(migratePhotos)]
            .sort((a,b) => b.id - a.id);
        this.renderCalendar();
        this.renderTimeline();
    },

    goHome() {
        this.closeInputOverlay();
        this.closeModals();
        this.closeMedManager();
        if(state.isMenuOpen) this.toggleMenu();
        
        state.currentDate = new Date();
        state.selectedDate = new Date();
        this.renderCalendar();
        this.renderTimeline();
        this.setActiveNav('home');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    toggleMenu() {
        state.isMenuOpen = !state.isMenuOpen;
        document.getElementById('side-menu').classList.toggle('open', state.isMenuOpen);
        document.getElementById('menu-backdrop').classList.toggle('open', state.isMenuOpen);
    },

    async toggleDoctorMode() {
        state.isDoctorMode = !state.isDoctorMode;
        const btn = document.getElementById('btn-doctor');
        const sendBtn = document.getElementById('btn-send-data');

        if(state.isDoctorMode) {
            btn.classList.add('active');
            sendBtn.classList.remove('hidden');
            
            // 初回のみ注意表示
            const db = await DB.open();
            const req = db.transaction('settings').objectStore('settings').get('doctor_notice_shown');
            req.onsuccess = () => {
                if(!req.result || !req.result.value) {
                    alert('【ドクターモード】\nカレンダー：数字は最大重症度\nタイムライン：症状のみ表示');
                    DB.put('settings', { key: 'doctor_notice_shown', value: true });
                }
            };
        } else {
            btn.classList.remove('active');
            sendBtn.classList.add('hidden');
        }
        
        // カレンダーとタイムラインを再描画
        this.renderCalendar();
        this.renderTimeline();
    },

    // --- Calendar ---
    changeMonth(diff) {
        state.currentDate.setMonth(state.currentDate.getMonth() + diff);
        this.renderCalendar();
    },
    renderCalendar() {
        const y = state.currentDate.getFullYear();
        const m = state.currentDate.getMonth();
        document.getElementById('current-month-label').innerText = `${y}年 ${m+1}月`;
        
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        ['日','月','火','水','木','金','土'].forEach(w => {
            const d = document.createElement('div'); d.innerText = w; d.style.color='#666'; d.style.fontSize='0.8rem';
            grid.appendChild(d);
        });

        const firstDay = new Date(y, m, 1).getDay();
        const lastDate = new Date(y, m+1, 0).getDate();
        for(let i=0; i<firstDay; i++) grid.appendChild(document.createElement('div'));

        for(let d=1; d<=lastDate; d++) {
            const cell = document.createElement('div'); cell.className = 'cal-cell';
            cell.innerHTML = `<span>${d}</span>`;
            const dObj = new Date(y, m, d);
            
            // Highlight
            const today = new Date();
            if(y===today.getFullYear() && m===today.getMonth() && d===today.getDate()) cell.classList.add('today');
            if(y===state.selectedDate.getFullYear() && m===state.selectedDate.getMonth() && d===state.selectedDate.getDate()) cell.classList.add('selected');

            const dayLogs = state.logs.filter(l => this.isSameDay(new Date(l.id), dObj));

            // *** Doctor Mode Logic ***
            if (state.isDoctorMode) {
                const symptoms = dayLogs.filter(l => l.type === 'symptom');
                if (symptoms.length > 0) {
                    const maxSev = Math.max(...symptoms.map(s => Number(s.severity)));
                    const badge = document.createElement('div');
                    badge.className = 'severity-num';
                    badge.innerText = maxSev;
                    cell.appendChild(badge);
                }
            } else {
                // Normal Mode (Dots)
                if(dayLogs.length>0) {
                    const dots = document.createElement('div'); dots.className = 'dots-container';
                    [...new Set(dayLogs.map(l=>l.type))].forEach(t => {
                        const dot = document.createElement('div'); dot.className = `dot ${t}`; dots.appendChild(dot);
                    });
                    cell.appendChild(dots);
                }
            }

            cell.onclick = () => { state.selectedDate = dObj; this.renderCalendar(); this.renderTimeline(); };
            grid.appendChild(cell);
        }
    },

    // --- Timeline ---
    renderTimeline() {
        const target = state.selectedDate;
        document.getElementById('timeline-title').innerText = `${target.getFullYear()}/${target.getMonth()+1}/${target.getDate()} の記録`;
        const list = document.getElementById('log-list');
        list.innerHTML = '';
        
        let dayLogs = state.logs.filter(l => this.isSameDay(new Date(l.id), target));

        // *** Doctor Mode Filter ***
        if (state.isDoctorMode) {
            dayLogs = dayLogs.filter(l => l.type === 'symptom');
        }
        
        if(dayLogs.length===0) { document.getElementById('empty-state').classList.remove('hidden'); return; }
        document.getElementById('empty-state').classList.add('hidden');
        
        dayLogs.forEach(log => {
            const el = document.createElement('div'); el.className = `log-card type-${log.type}`;
            const time = new Date(log.id).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            let html = `<div class="log-meta"><span class="badge">${this.getTypeName(log.type)}</span> ${time}</div>`;

            // 複数画像の処理（最初の1枚+残り枚数バッジ）
            const photos = log.photos || (log.photo ? [log.photo] : []);
            if (photos.length > 0) {
                html += `<div style="position:relative;">`;
                html += `<img src="${URL.createObjectURL(photos[0])}" class="log-img">`;
                if (photos.length > 1) {
                    html += `<div class="photo-count-badge">+${photos.length - 1}</div>`;
                }
                html += `</div>`;
            }

            if(log.type==='meal') {
                html += `<div><b>${(log.tags||[]).join(', ')}</b></div><div style="color:#555">${log.note||''}</div>`;
            } else if(log.type==='med') {
                const text = (log.items||[]).map(i => `${i.name}(${i.count})`).join(', ');
                html += `<div>💊 ${text}</div>`;
            } else if(log.type==='symptom') {
                html += `<div><b>Lv.${log.severity}</b> ${log.parts||''}</div>`;
            }
            el.innerHTML = html;
            el.onclick = () => this.showDetail(log);
            list.appendChild(el);
        });
    },

    getTypeName(type) { return type==='meal'?'食事':type==='med'?'服薬':'症状'; },

    // --- Detail Modal ---
    async showDetail(log) {
        state.editingLog = log;
        const body = document.getElementById('detail-body');
        const d = new Date(log.id);
        const snapshotUpdate = log.type === 'symptom' ? await this.ensureSymptomSnapshot(log) : null;
        let html = `<p style="color:#666;font-size:0.8rem;margin-bottom:10px;">${d.toLocaleString()}</p>`;
        if(snapshotUpdate && snapshotUpdate.updated) {
            html += `<div style="background:#fff8e1;color:#8a6d3b;border:1px solid #f1e3a1;padding:6px 8px;border-radius:6px;margin-bottom:10px;font-size:0.8rem;">
                スナップショットを更新しました
            </div>`;
        }

        // 複数画像の表示（グリッド形式）
        const photos = log.photos || (log.photo ? [log.photo] : []);
        if (photos.length > 0) {
            html += '<div class="detail-photo-grid">';
            photos.forEach(photo => {
                html += `<img src="${URL.createObjectURL(photo)}" class="detail-photo">`;
            });
            html += '</div>';
        }

        if(log.type==='meal') {
            html += `<h3>食事</h3><p><b>タグ:</b> ${log.tags.join(', ')}</p><p style="background:#f9f9f9;padding:10px;border-radius:4px;">${log.note}</p>`;
        } else if(log.type==='med') {
            html += `<h3>服薬</h3><ul style="padding-left:20px;">${(log.items||[]).map(i=>`<li>${i.name} : <b>${i.count}錠</b></li>`).join('')}</ul>`;
        } else if(log.type==='symptom') {
            html += `<h3 style="color:var(--danger)">症状 Lv.${log.severity}</h3>`;
            html += `<p><b>部位:</b> ${log.parts}</p><p><b>詳細:</b> ${log.note}</p>`;
            
            if(log.snapshot) {
                const mealsCount = log.snapshot.meals ? log.snapshot.meals.length : 0;
                const medsCount = log.snapshot.meds ? log.snapshot.meds.length : 0;
                const recalcText = log.snapshotRecalcAt ? `最終再集計: ${new Date(log.snapshotRecalcAt).toLocaleString()}` : '';
                html += `
                <div class="attachment-box">
                    <div class="attachment-header" onclick="document.getElementById('att-content').classList.toggle('hidden')">
                        <span>📎 添付データ (食事${mealsCount} / 服薬${medsCount})</span>
                        <span>▼</span>
                    </div>
                    <div id="att-content" class="attachment-content hidden">
                        <small style="color:#666; display:block; margin-bottom:5px;">発症前${this.getSnapshotDays()}日の記録</small>
                        ${recalcText ? `<small style="color:#888; display:block; margin-bottom:6px;">${recalcText}</small>` : ''}
                        ${this.renderSnapshotList(log.snapshot)}
                    </div>
                </div>`;
            }
        }
        body.innerHTML = html;
        document.getElementById('view-detail').classList.remove('hidden');
    },

    renderSnapshotList(snap) {
        let html = '';
        if(snap.meals) snap.meals.forEach(m => {
            const time = new Date(m.id).toLocaleString([], {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
            // 複数画像対応：最初の1枚のみを表示
            const photos = m.photos || (m.photo ? [m.photo] : []);
            const img = photos.length > 0 ? `<img src="${URL.createObjectURL(photos[0])}" class="mini-thumb">` : `<div class="mini-thumb"></div>`;
            const photoCount = photos.length > 1 ? `(+${photos.length - 1})` : '';
            html += `<div class="mini-log">${img}<div><div>📷 ${time} ${photoCount}</div><div style="color:#666">${m.tags.join(',')}</div></div></div>`;
        });
        if(snap.meds) snap.meds.forEach(m => {
            const time = new Date(m.id).toLocaleString([], {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
            const text = (m.items||[]).map(i=>i.name).join(',');
            html += `<div class="mini-log"><div class="mini-thumb" style="background:#e8f5e9;display:flex;align-items:center;justify-content:center;">💊</div><div><div>${time}</div><div style="color:#666">${text}</div></div></div>`;
        });
        return html || 'データなし';
    },

    async ensureSymptomSnapshot(log) {
        if(!log || log.type !== 'symptom') return { updated: false };
        const ts = Number(log.id);
        const sinceTs = ts - (this.getSnapshotDays() * 24 * 60 * 60 * 1000);
        const [pastMeals, pastMeds] = await Promise.all([
            DB.getRange('meals', sinceTs, ts), DB.getRange('meds', sinceTs, ts)
        ]);

        const nextSnapshot = { meals: pastMeals, meds: pastMeds };
        const prevSnapshot = log.snapshot || { meals: [], meds: [] };
        const updated = !this.isSameSnapshot(prevSnapshot, nextSnapshot);
        const recalcAt = Date.now();

        log.snapshotRecalcAt = recalcAt;
        if(updated) {
            log.snapshot = nextSnapshot;
            log.snapshotUpdatedAt = recalcAt;
        }

        // 写真データの互換性処理
        const photos = log.photos || (log.photo ? [log.photo] : []);

        await DB.put('symptoms', {
            id: log.id,
            type: log.type,
            severity: log.severity,
            parts: log.parts,
            note: log.note,
            photos: photos,
            snapshot: log.snapshot,
            snapshotRecalcAt: log.snapshotRecalcAt,
            snapshotUpdatedAt: log.snapshotUpdatedAt
        });

        return { updated, recalcAt };
    },

    isSameSnapshot(a, b) {
        const aMeals = (a.meals || []).map(i => i.id).sort((x,y)=>x-y);
        const bMeals = (b.meals || []).map(i => i.id).sort((x,y)=>x-y);
        const aMeds = (a.meds || []).map(i => i.id).sort((x,y)=>x-y);
        const bMeds = (b.meds || []).map(i => i.id).sort((x,y)=>x-y);
        return aMeals.length === bMeals.length && aMeds.length === bMeds.length
            && aMeals.every((v,i)=>v===bMeals[i])
            && aMeds.every((v,i)=>v===bMeds[i]);
    },

    getSnapshotDays() {
        return Number(localStorage.getItem('allelog_snapshot_days')) || 1;
    },
    updateSnapshotNotice() {
        const el = document.getElementById('symptom-snapshot-notice');
        if (el) el.textContent = `過去${this.getSnapshotDays()}日の食事と服薬の履歴も保存します`;
    },

    // --- Forms ---
    async openForm(type, data=null) {
        document.getElementById('input-overlay').classList.remove('hidden');
        document.querySelectorAll('.form-section').forEach(f => f.classList.add('hidden'));
        document.getElementById(`form-${type}`).classList.remove('hidden');
        
        const isEdit = !!data;
        document.getElementById('edit-id').value = isEdit ? data.id : '';

        const dateInput = document.getElementById('record-date');
        const targetDate = isEdit ? new Date(data.id) : new Date();
        targetDate.setMinutes(targetDate.getMinutes() - targetDate.getTimezoneOffset());
        dateInput.value = targetDate.toISOString().slice(0,16);

        this.resetForms();

        // Render Tags if meal
        if(type === 'meal') this.renderMealTags(data ? data.tags : []);

        if(isEdit) this.fillForm(type, data);
        if(type === 'med') await this.renderMedList(data ? data.items : null);
        
        // 下部メニューのactive状態
        this.setActiveNav(type);
    },
    
    closeInputOverlay() {
        document.getElementById('input-overlay').classList.add('hidden');
        state.editingLog = null;
        this.setActiveNav('home');
    },

    renderMealTags(selectedTags = []) {
        const container = document.getElementById('meal-tags-container');
        container.innerHTML = '';
        
        Object.keys(MEAL_TAGS).forEach(category => {
            const section = document.createElement('div');
            section.className = 'tag-section';
            section.innerHTML = `<div class="tag-section-title">${category}</div>`;
            const grid = document.createElement('div');
            grid.className = 'tag-grid';
            
            MEAL_TAGS[category].forEach(tag => {
                const label = document.createElement('label');
                const isChecked = selectedTags.includes(tag) ? 'checked' : '';
                label.innerHTML = `<input type="checkbox" value="${tag}" ${isChecked}>${tag}`;
                grid.appendChild(label);
            });
            section.appendChild(grid);
            container.appendChild(section);
        });
    },

    // --- Medication Manager ---
    openMedManager() {
        this.renderPresetList();
        document.getElementById('view-med-manager').classList.remove('hidden');
    },
    closeMedManager() {
        document.getElementById('view-med-manager').classList.add('hidden');
        if(!document.getElementById('form-med').classList.contains('hidden')) {
            this.renderMedList(); 
        }
    },
    async renderMedList(existingItems = null) {
        const presets = await DB.getPresets();
        const container = document.getElementById('med-list-container');
        container.innerHTML = '';

        if(presets.length === 0) {
            container.innerHTML = '<div style="padding:15px; text-align:center; color:#888;">下のボタンから薬剤を登録してください</div>';
            return;
        }

        presets.forEach(p => {
            let countVal = p.defaultCount || 1;
            let isChecked = false;
            if(existingItems) {
                const found = existingItems.find(i => i.name === p.name);
                if(found) { isChecked = true; countVal = found.count; }
            }

            const row = document.createElement('div');
            row.className = 'med-row';
            row.innerHTML = `
                <label>
                    <input type="checkbox" class="med-check" value="${p.name}" ${isChecked?'checked':''}>
                    ${p.name}
                </label>
                <input type="number" class="qty-input" min="0.5" step="0.5" value="${countVal}">
            `;
            container.appendChild(row);
        });
    },

    // --- Save Actions ---
    getTimestampFromInput() {
        const val = document.getElementById('record-date').value;
        return val ? new Date(val).getTime() : Date.now();
    },

    async saveMeal() {
        const id = document.getElementById('edit-id').value;
        const ts = this.getTimestampFromInput();
        const originalId = id ? Number(id) : null;
        const hasDateChange = !!originalId && originalId !== ts;
        const note = document.getElementById('meal-note').value;
        const tags = Array.from(document.querySelectorAll('#meal-tags-container input:checked')).map(c=>c.value);

        // 写真の処理（fillForm()で既にtempPhotosにセット済み）
        const photos = [...state.tempPhotos];

        const recordId = (!originalId || hasDateChange) ? ts : originalId;
        await DB.put('meals', { id: recordId, type:'meal', photos, tags, note });
        if (hasDateChange) await DB.delete('meals', originalId);
        this.closeInputOverlay();
        this.reloadAll();
    },

    async saveMed() {
        const id = document.getElementById('edit-id').value;
        const ts = this.getTimestampFromInput();
        const originalId = id ? Number(id) : null;
        const hasDateChange = !!originalId && originalId !== ts;
        const rows = document.querySelectorAll('.med-row');
        const items = [];
        rows.forEach(row => {
            const checkbox = row.querySelector('.med-check');
            if(checkbox && checkbox.checked) {
                const count = row.querySelector('.qty-input').value;
                items.push({ name: checkbox.value, count: count });
            }
        });

        if(items.length===0) return alert('薬を選択してください');
        
        const recordId = (!originalId || hasDateChange) ? ts : originalId;
        await DB.put('meds', { id: recordId, type:'med', items });
        if (hasDateChange) await DB.delete('meds', originalId);
        this.closeInputOverlay();
        this.reloadAll();
    },

    async saveSymptom() {
        const id = document.getElementById('edit-id').value;
        const ts = this.getTimestampFromInput();
        const originalId = id ? Number(id) : null;
        const hasDateChange = !!originalId && originalId !== ts;

        if(!id && !confirm(`過去${this.getSnapshotDays()}日の食事と服薬の履歴も保存します。よろしいですか？`)) return;

        const severity = document.getElementById('symptom-severity').value;
        const parts = document.getElementById('symptom-parts').value;
        const note = document.getElementById('symptom-note').value;

        // 写真の処理（fillForm()で既にtempPhotosにセット済み）
        const photos = [...state.tempPhotos];

        let snapshot = (id && state.editingLog && !hasDateChange) ? state.editingLog.snapshot : null;
        if(!snapshot) {
            const sinceTs = ts - (this.getSnapshotDays() * 24 * 60 * 60 * 1000);
            const [pastMeals, pastMeds] = await Promise.all([
                DB.getRange('meals', sinceTs, ts), DB.getRange('meds', sinceTs, ts)
            ]);
            snapshot = { meals: pastMeals, meds: pastMeds };
        }

        const recordId = (!originalId || hasDateChange) ? ts : originalId;
        await DB.put('symptoms', {
            id: recordId, type:'symptom',
            severity, parts, note, photos, snapshot
        });
        if (hasDateChange) await DB.delete('symptoms', originalId);
        this.closeInputOverlay();
        this.reloadAll();
    },

    // --- Preset Manager ---
    async renderPresetList() {
        const list = document.getElementById('preset-list');
        list.innerHTML = '';
        const presets = await DB.getPresets(); 
        
        presets.forEach((p, idx) => {
            const li = document.createElement('li');
            li.style.padding = '10px 0';
            li.style.borderBottom = '1px solid #eee';
            li.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${p.name} (定数:${p.defaultCount})</span>
                    <button style="border:1px solid #ddd; background:#fff; border-radius:4px; padding:4px 8px; color:#666; cursor:pointer;" 
                        onclick="app.deletePreset(${idx})">削除</button>
                </div>`;
            list.appendChild(li);
        });
    },
    async addPreset() {
        const nameInput = document.getElementById('new-med-name');
        const countInput = document.getElementById('new-med-count');
        const name = nameInput.value.trim();
        const count = countInput.value;
        if(!name) return;
        const presets = await DB.getPresets();
        if(!presets.some(p => p.name === name)) {
            presets.push({ name: name, defaultCount: count });
            await DB.put('settings', { key: 'med_presets', items: presets });
            this.renderPresetList();
            nameInput.value = '';
        } else {
            alert('登録済みです');
        }
    },
    async deletePreset(idx) {
        if(!confirm('削除しますか？')) return;
        const presets = await DB.getPresets();
        presets.splice(idx, 1);
        await DB.put('settings', { key: 'med_presets', items: presets });
        this.renderPresetList();
    },

    // --- Helpers ---
    startEdit() {
        document.getElementById('view-detail').classList.add('hidden');
        this.openForm(state.editingLog.type, state.editingLog);
    },
    async deleteEntry() {
        if(!confirm('本当に削除しますか？')) return;
        const log = state.editingLog;
        const store = log.type==='meal'?'meals':log.type==='med'?'meds':'symptoms';
        await DB.delete(store, log.id);
        this.closeModals();
        this.reloadAll();
    },
    closeModals() {
        document.getElementById('view-detail').classList.add('hidden');
        document.getElementById('view-settings').classList.add('hidden');
        document.getElementById('view-settings-menu').classList.add('hidden');
        document.getElementById('view-med-manager').classList.add('hidden');
        document.getElementById('view-about').classList.add('hidden');
        document.getElementById('view-changelog').classList.add('hidden');
        document.getElementById('view-debug-logs').classList.add('hidden');
    },
    openSettingsMenu() {
        // localStorageから値を読み込んで設定画面に表示
        const idInput = document.getElementById('setting-chart-id');
        const nameInput = document.getElementById('setting-patient-name');
        const snapshotDaysInput = document.getElementById('setting-snapshot-days');

        if (idInput && nameInput) {
            idInput.value = localStorage.getItem('allelog_chart_id') || '';
            nameInput.value = localStorage.getItem('allelog_patient_name') || '';
        }

        if (snapshotDaysInput) {
            snapshotDaysInput.value = this.getSnapshotDays();
        }

        document.getElementById('view-settings-menu').classList.remove('hidden');
    },
    async openChangelog() {
        const modal = document.getElementById('view-changelog');
        const output = document.getElementById('changelog-output');
        if (!modal || !output) return;
        modal.classList.remove('hidden');
        if (output.dataset.loaded) return;

        try {
            const res = await fetch('CHANGELOG.md');
            const text = await res.text();
            output.textContent = text;
            output.dataset.loaded = '1';
        } catch (e) {
            output.textContent = '更新履歴を読み込めませんでした。';
        }
    },
    closeChangelog() {
        const modal = document.getElementById('view-changelog');
        if (modal) modal.classList.add('hidden');
    },
    saveSettingsAndClose() {
        const idInput = document.getElementById('setting-chart-id');
        const nameInput = document.getElementById('setting-patient-name');

        if (idInput && nameInput) {
            localStorage.setItem('allelog_chart_id', idInput.value);
            localStorage.setItem('allelog_patient_name', nameInput.value);
        }

        const snapshotDaysInput = document.getElementById('setting-snapshot-days');
        if (snapshotDaysInput) {
            localStorage.setItem('allelog_snapshot_days', snapshotDaysInput.value);
            this.updateSnapshotNotice();
        }

        this.closeModals();
    },
    clearDebugLogs() {
        debugLogs.length = 0;
        const el = document.getElementById('debug-log-output');
        if (el) el.textContent = '';
    },
    resetForms() {
        document.querySelectorAll('input[type=text], textarea').forEach(e=>e.value='');
        document.querySelectorAll('input[type=checkbox]').forEach(e=>e.checked=false);
        document.querySelectorAll('[id$="-preview-area"]').forEach(e=>e.classList.add('hidden'));
        state.tempPhotos = [];
    },
    fillForm(type, data) {
        if(type==='meal') {
            document.getElementById('meal-note').value = data.note;
            // 既存データの互換性処理（photoからphotosへの移行）
            if (data.photo && !data.photos) {
                data.photos = [data.photo];
            }
            if (data.photos && data.photos.length > 0) {
                state.tempPhotos = [...data.photos];
                this.showPhotoGrid('meal-preview-area', state.tempPhotos, 'meal');
                this.updatePhotoButtons('meal');
            }
            // tags are handled in renderMealTags
        } else if(type==='symptom') {
            document.getElementById('symptom-severity').value = data.severity;
            document.getElementById('sev-display').innerText = data.severity;
            document.getElementById('symptom-parts').value = data.parts;
            document.getElementById('symptom-note').value = data.note;
            // 既存データの互換性処理
            if (data.photo && !data.photos) {
                data.photos = [data.photo];
            }
            if (data.photos && data.photos.length > 0) {
                state.tempPhotos = [...data.photos];
                this.showPhotoGrid('symptom-preview-area', state.tempPhotos, 'symptom');
                this.updatePhotoButtons('symptom');
            }
        }
    },
    setupPhotoInput(inputId, type) {
        document.getElementById(inputId).onchange = async (e) => {
            const files = Array.from(e.target.files);
            const currentCount = state.tempPhotos.length;

            // 4枚制限チェック
            if (currentCount + files.length > 4) {
                alert(`写真は最大4枚までです。現在${currentCount}枚添付済みです。`);
                e.target.value = ''; // input をリセット
                return;
            }

            // 各ファイルを圧縮して配列に追加
            try {
                for (const file of files) {
                    const blob = await DB.compress(file);
                    if (blob) {
                        state.tempPhotos.push(blob);
                    }
                }
            } catch (err) {
                console.error('画像の処理中にエラーが発生しました:', err);
                alert('画像の処理に失敗しました。別の画像を選択してください。');
            }

            this.showPhotoGrid(`${type}-preview-area`, state.tempPhotos, type);
            this.updatePhotoButtons(type);
            e.target.value = ''; // 次回の選択のためにリセット
        };
    },
    showPhotoGrid(containerId, photos, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (photos.length === 0) {
            container.classList.add('hidden');
            return;
        }

        photos.forEach((blob, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'photo-grid-item';

            const img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            img.className = 'log-img';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'photo-delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.removePhoto(index, type);
            };

            wrapper.appendChild(img);
            wrapper.appendChild(deleteBtn);
            container.appendChild(wrapper);
        });

        container.classList.remove('hidden');
    },
    removePhoto(index, type) {
        state.tempPhotos.splice(index, 1);
        this.showPhotoGrid(`${type}-preview-area`, state.tempPhotos, type);
        this.updatePhotoButtons(type);
    },
    updatePhotoButtons(type) {
        const buttonsContainer = document.querySelector(`#form-${type} .photo-buttons`);
        const messageContainer = document.getElementById(`${type}-photo-limit-msg`);

        if (!buttonsContainer || !messageContainer) return;

        if (state.tempPhotos.length >= 4) {
            buttonsContainer.classList.add('hidden');
            messageContainer.classList.remove('hidden');
        } else {
            buttonsContainer.classList.remove('hidden');
            messageContainer.classList.add('hidden');
        }
    },
    clearImage(type) {
        state.tempPhotos = [];
        const previewArea = document.getElementById(`${type}-preview-area`);
        if (previewArea) previewArea.classList.add('hidden');
        this.updatePhotoButtons(type);
    },
    async exportData() {
        const [meals, meds, symptoms, settings] = await Promise.all([
            DB.getAll('meals'), DB.getAll('meds'), DB.getAll('symptoms'), DB.getPresets()
        ]);
        alert('デモ版のため画像を除くデータのみエクスポートします');
        const data = { meals, meds, symptoms, presets: settings };
        const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `allergy_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
    },
    async importData(input) {
        if(!input.files[0] || !confirm('上書きしますか？')) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if(data.presets) await DB.put('settings', { key: 'med_presets', items: data.presets });
                if(data.meals) for(const m of data.meals) await DB.put('meals', m);
                if(data.meds) for(const m of data.meds) await DB.put('meds', m);
                if(data.symptoms) for(const s of data.symptoms) await DB.put('symptoms', s);
                alert('復元完了'); location.reload();
            } catch(err) { console.error(err); alert('不正なファイルです'); }
        };
        reader.readAsText(input.files[0]);
    },
    // 強制更新
    async forceRefresh() {
        if('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            if(registration) {
                await registration.update();
            }
        }
        location.reload(true);
    },
    // ドクター注意をリセット
    async resetDoctorNotice() {
        await DB.put('settings', { key: 'doctor_notice_shown', value: false });
        alert('次回ドクターモード起動時に説明が表示されます');
        this.closeModals();
    },
    // 下部メニューのactive状態を設定
    setActiveNav(nav) {
        document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(`nav-${nav}`);
        if(el) el.classList.add('active');
    },

    // ▼▼ 修正: データ送信ロジック (スナップショット処理の安全性向上版) ▼▼
    async sendDoctorData() {
        let chartId = document.getElementById('setting-chart-id').value || localStorage.getItem('allelog_chart_id') || '';
        let patientName = document.getElementById('setting-patient-name').value || localStorage.getItem('allelog_patient_name') || '';

        if (!chartId) {
            chartId = prompt('カルテIDを入力してください', chartId);
            if (chartId === null) return;
        }
        if (!patientName) {
            patientName = prompt('患者氏名を入力してください', patientName);
            if (patientName === null) return;
        }

        if (!confirm(`${state.currentDate.getMonth() + 1}月分のデータを送信しますか？\nID: ${chartId}\n氏名: ${patientName}`)) return;

        localStorage.setItem('allelog_chart_id', chartId);
        localStorage.setItem('allelog_patient_name', patientName);
        
        const idInput = document.getElementById('setting-chart-id');
        const nameInput = document.getElementById('setting-patient-name');
        if (idInput) idInput.value = chartId;
        if (nameInput) nameInput.value = patientName;

        document.getElementById('loading-overlay').classList.remove('hidden');

        try {
            const year = state.currentDate.getFullYear();
            const month = state.currentDate.getMonth();

            const targetLogs = state.logs.filter(l => {
                const d = new Date(l.id);
                return l.type === 'symptom' && d.getFullYear() === year && d.getMonth() === month;
            });

            if (targetLogs.length === 0) throw new Error('送信対象のデータがありません');

            const payload = {
                chartId: chartId,
                patientName: patientName,
                year: year,
                month: month + 1,
                submittedAt: new Date().toISOString(),
                items: []
            };

            for (const log of targetLogs) {
                // 複数写真対応（後方互換性のため photo も考慮）
                const photos = log.photos || (log.photo ? [log.photo] : []);
                const photoBase64Array = [];
                for (const photo of photos) {
                    if (photo) {
                        const base64 = await Utils.blobToBase64(photo);
                        photoBase64Array.push(base64);
                    }
                }

                let snapshotData = null;

                // ★修正点: 食事がなくてもsnapshotがあれば処理するように変更
                if (log.snapshot) {
                    snapshotData = { meals: [], meds: log.snapshot.meds || [] };

                    if (log.snapshot.meals && log.snapshot.meals.length > 0) {
                        for (const meal of log.snapshot.meals) {
                            // 複数写真対応（後方互換性のため photo も考慮）
                            const mealPhotos = meal.photos || (meal.photo ? [meal.photo] : []);
                            const mealPhotoBase64Array = [];
                            for (const photo of mealPhotos) {
                                if (photo) {
                                    const base64 = await Utils.blobToBase64(photo);
                                    mealPhotoBase64Array.push(base64);
                                }
                            }
                            snapshotData.meals.push({ ...meal, photos: mealPhotoBase64Array });
                        }
                    }
                }

                payload.items.push({
                    ...log,
                    photos: photoBase64Array,
                    snapshot: snapshotData
                });
            }

            // ★ GASのウェブアプリURL (変更なし) ★
            const SERVER_URL = 'https://script.google.com/macros/s/AKfycbzYbK0uLmOoPhijc30JvUradBV30HMGxXHmaPF22RZrxy_ZS4_fgVfut3Ne6UMsZk-8/exec'; 
            
            const response = await fetch(SERVER_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            const resJson = await response.json();

            if (resJson.status === 'queued') {
                alert('送信完了しました。\n1～2分以内に医師用カルテ(PDF)が作成されます。');
            } else if (resJson.status === 'error') {
                throw new Error('サーバーエラー: ' + (resJson.message || '不明なエラー'));
            } else {
                throw new Error('予期しない応答: ' + JSON.stringify(resJson));
            }

        } catch (e) {
            console.error(e);
            alert('送信失敗: ' + e.message);
        } finally {
            document.getElementById('loading-overlay').classList.add('hidden');
        }
    },
    // ▲▲ 修正ここまで ▲▲

    isSameDay(d1, d2) {
        return d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate();
    }
};

app.init();