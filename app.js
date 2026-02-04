const DB_NAME = 'AllergyCareDB_V7';
const DB_VERSION = 2;
const APP_VERSION = '1.1.2';

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
        return new Promise(resolve => {
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
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
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
    tempPhoto: null,
    isDoctorMode: false,
    isMenuOpen: false
};

window.app = {
    async init() {
        await this.reloadAll();
        
        // Listeners
        document.getElementById('prev-month').onclick = () => this.changeMonth(-1);
        document.getElementById('next-month').onclick = () => this.changeMonth(1);
        document.getElementById('btn-today').onclick = () => this.goHome();
        document.getElementById('btn-doctor').onclick = () => this.toggleDoctorMode();
        
        // Menu Listeners
        document.getElementById('btn-menu').onclick = () => this.toggleMenu();
        document.getElementById('menu-backdrop').onclick = () => this.toggleMenu();

        // Menu Items
        document.getElementById('menu-data').onclick = () => { this.toggleMenu(); document.getElementById('view-settings').classList.remove('hidden'); };
        document.getElementById('menu-med-reg').onclick = () => { this.toggleMenu(); this.openMedManager(); };
        document.getElementById('menu-settings').onclick = () => { 
            this.toggleMenu(); 
            document.getElementById('view-settings-menu').classList.remove('hidden'); 
        };
        document.getElementById('menu-refresh').onclick = () => { this.toggleMenu(); this.forceRefresh(); };
        document.getElementById('menu-about').onclick = () => { 
            this.toggleMenu(); 
            document.getElementById('view-about').classList.remove('hidden'); 
        };
        document.getElementById('menu-exit').onclick = () => { this.toggleMenu(); if(confirm('アプリを終了しますか？\n(ブラウザのタブを閉じてください)')) { window.close(); } };
        
        document.getElementById('btn-edit-entry').onclick = () => this.startEdit();
        document.getElementById('btn-delete-entry').onclick = () => this.deleteEntry();
        
        // Photo Inputs
        this.setupPhotoInput('meal-cam', 'meal-preview', 'meal-preview-area');
        this.setupPhotoInput('meal-file', 'meal-preview', 'meal-preview-area');
        this.setupPhotoInput('sym-cam', 'symptom-preview', 'symptom-preview-area');
        this.setupPhotoInput('sym-file', 'symptom-preview', 'symptom-preview-area');
        
        // 初期状態でホームをアクティブに
        this.setActiveNav('home');
    },

    async reloadAll() {
        const [meals, meds, symptoms] = await Promise.all([
            DB.getAll('meals'), DB.getAll('meds'), DB.getAll('symptoms')
        ]);
        state.logs = [...meals, ...meds, ...symptoms].sort((a,b) => b.id - a.id);
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
        if(state.isDoctorMode) {
            btn.classList.add('active');
            
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
            
            if(log.photo) html += `<img src="${URL.createObjectURL(log.photo)}" class="log-img">`;
            
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
        
        if(log.photo) html += `<img src="${URL.createObjectURL(log.photo)}" style="width:100%;border-radius:8px;margin-bottom:15px;">`;

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
                        <small style="color:#666; display:block; margin-bottom:5px;">発症前1週間の記録</small>
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
            const img = m.photo ? `<img src="${URL.createObjectURL(m.photo)}" class="mini-thumb">` : `<div class="mini-thumb"></div>`;
            html += `<div class="mini-log">${img}<div><div>📷 ${time}</div><div style="color:#666">${m.tags.join(',')}</div></div></div>`;
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
        const weekAgo = ts - (7 * 24 * 60 * 60 * 1000);
        const [pastMeals, pastMeds] = await Promise.all([
            DB.getRange('meals', weekAgo, ts), DB.getRange('meds', weekAgo, ts)
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

        await DB.put('symptoms', {
            id: log.id,
            type: log.type,
            severity: log.severity,
            parts: log.parts,
            note: log.note,
            photo: log.photo,
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
        state.tempPhoto = null;

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
        
        let photo = state.tempPhoto; 
        if(!photo && id && state.editingLog) photo = state.editingLog.photo;

        const recordId = (!originalId || hasDateChange) ? ts : originalId;
        await DB.put('meals', { id: recordId, type:'meal', photo, tags, note });
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

        if(!id && !confirm('過去1週間の食事と服薬の履歴も保存します。よろしいですか？')) return;

        const severity = document.getElementById('symptom-severity').value;
        const parts = document.getElementById('symptom-parts').value;
        const note = document.getElementById('symptom-note').value;
        
        let photo = state.tempPhoto;
        if(!photo && id && state.editingLog) photo = state.editingLog.photo;

        let snapshot = (id && state.editingLog && !hasDateChange) ? state.editingLog.snapshot : null;
        if(!snapshot) {
            const weekAgo = ts - (7 * 24 * 60 * 60 * 1000);
            const [pastMeals, pastMeds] = await Promise.all([
                DB.getRange('meals', weekAgo, ts), DB.getRange('meds', weekAgo, ts)
            ]);
            snapshot = { meals: pastMeals, meds: pastMeds };
        }

        const recordId = (!originalId || hasDateChange) ? ts : originalId;
        await DB.put('symptoms', {
            id: recordId, type:'symptom',
            severity, parts, note, photo, snapshot
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
    },
    resetForms() {
        document.querySelectorAll('input[type=text], textarea').forEach(e=>e.value='');
        document.querySelectorAll('input[type=checkbox]').forEach(e=>e.checked=false);
        document.querySelectorAll('img[id$="-preview"]').forEach(e=>{e.src='';});
        document.querySelectorAll('[id$="-preview-area"]').forEach(e=>e.classList.add('hidden'));
    },
    fillForm(type, data) {
        if(type==='meal') {
            document.getElementById('meal-note').value = data.note;
            if(data.photo) this.showPreview('meal-preview', 'meal-preview-area', data.photo);
            // tags are handled in renderMealTags
        } else if(type==='symptom') {
            document.getElementById('symptom-severity').value = data.severity;
            document.getElementById('sev-display').innerText = data.severity;
            document.getElementById('symptom-parts').value = data.parts;
            document.getElementById('symptom-note').value = data.note;
            if(data.photo) this.showPreview('symptom-preview', 'symptom-preview-area', data.photo);
        }
    },
    setupPhotoInput(inputId, imgId, areaId) {
        document.getElementById(inputId).onchange = async (e) => {
            const file = e.target.files[0];
            if(file) {
                const blob = await DB.compress(file);
                state.tempPhoto = blob;
                this.showPreview(imgId, areaId, blob);
            }
        };
    },
    showPreview(imgId, areaId, blob) {
        const img = document.getElementById(imgId);
        img.src = URL.createObjectURL(blob);
        document.getElementById(areaId).classList.remove('hidden');
    },
    clearImage(type) {
        state.tempPhoto = null;
        if(state.editingLog) state.editingLog.photo = null; 
        document.getElementById(`${type}-preview-area`).classList.add('hidden');
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
    isSameDay(d1, d2) {
        return d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate();
    }
};

app.init();