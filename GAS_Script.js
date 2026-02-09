/**
 * アレログ GASスクリプト
 * Version: 1.4.0
 * Last Updated: 2026-02-09
 *
 * 変更履歴:
 * - v1.4.0 (2026-02-09): 症状記録に誘因情報を追加（運動、ストレス、睡眠不足、体調不良）
 */

// --- 設定エリア (IDはご自身のものを維持してください) ---
const QUEUE_FOLDER_ID   = '16immG5iIwbYEhrfgrFR0PkK_IBgKbTdo';
const ARCHIVE_FOLDER_ID = '1LEoGEiWsXlXYE5OVODoKF4WBz0rJLjFo';
const DEST_FOLDER_ID    = '1RmKGcGM1MU5c4eH0-DYuPQyo7-0_7SEO';
const TEMPLATE_ID       = '1NsTBLu2q3h1z0a7-8Vt4MAaWcOcctIX5QiC41TvIvPk';
const SPREADSHEET_ID    = '1yxz1Qu54BHdnibSwZCW3A0KUzZdEv4c-lXPFNAvB3E4';
const NOTIFY_EMAIL      = 'kamijyo@keiomed.com';

// 1. アプリからの受信（キューに保存）
function doPost(e) {
  try {
    const jsonString = e.postData.contents;
    const data = JSON.parse(jsonString);

    // キューに保存
    const timestamp = new Date().getTime();
    const fileName = `${timestamp}_${data.patientName}.json`;
    const queueFolder = DriveApp.getFolderById(QUEUE_FOLDER_ID);
    queueFolder.createFile(fileName, jsonString, MimeType.PLAIN_TEXT);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'queued',
      message: '1～2分以内にレポートが作成されます'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// レポートシートへの記録
function recordReport(data, pdfUrl) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('レポート');

  // 送信日時をフォーマット
  let submittedDate = '-';
  if (data.submittedAt) {
    try {
      const date = new Date(data.submittedAt);
      submittedDate = date.toLocaleString('ja-JP');
    } catch (e) {
      submittedDate = '-';
    }
  }

  sheet.appendRow([
    new Date().toLocaleString('ja-JP'), // 処理完了日時
    submittedDate,                       // 送信日時
    data.chartId || '-',
    data.patientName,
    `${data.year}年${data.month}月`,
    pdfUrl,
    '完了'
  ]);
}

// メール通知（一旦不要）
// function notifySuccess(data, pdfUrl) {
//   MailApp.sendEmail({
//     to: NOTIFY_EMAIL,
//     subject: `【アレログ】${data.patientName}様(ID:${data.chartId})のレポート作成完了`,
//     body: `レポートが作成されました。\nID: ${data.chartId}\n氏名: ${data.patientName}\n対象: ${data.year}年${data.month}月\nPDF: ${pdfUrl}`
//   });
// }

// 2. 定期実行用関数（キュー処理）
function processQueue() {
  // ロックを取得（他の実行が進行中なら即座にスキップ）
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return;
  }

  try {
    const queueFolder = DriveApp.getFolderById(QUEUE_FOLDER_ID);
    const files = queueFolder.getFiles();

    if (!files.hasNext()) {
      return;
    }

    const archiveFolder = DriveApp.getFolderById(ARCHIVE_FOLDER_ID);
    let processedCount = 0;
    const MAX_FILES_PER_RUN = 5;

    while (files.hasNext() && processedCount < MAX_FILES_PER_RUN) {
      const file = files.next();
      const fileName = file.getName();
      const content = file.getBlob().getDataAsString();

      try {
        const data = JSON.parse(content);
        const pdfUrl = createPdfReport(data);

        recordReport(data, pdfUrl);
        file.moveTo(archiveFolder);
        processedCount++;

      } catch (e) {
        console.error('エラー: ' + fileName, e);
        file.setName(fileName + '_ERROR');
      }
    }
  } finally {
    lock.releaseLock();
  }
}

// 3. PDF作成ロジック (サマリー集計 & 重症度ハイライト強化版)
function createPdfReport(data) {
  // フォルダ取得
  const rootFolder = DriveApp.getFolderById(DEST_FOLDER_ID);
  const folderName = `${data.patientName}`;
  const folders = rootFolder.getFoldersByName(folderName);
  const patientFolder = folders.hasNext() ? folders.next() : rootFolder.createFolder(folderName);

  // テンプレートコピー
  const templateFile = DriveApp.getFileById(TEMPLATE_ID);
  const docFile = templateFile.makeCopy(`${data.year}-${data.month}_レポート`, patientFolder);

  // ドキュメント開く
  const doc = DocumentApp.openById(docFile.getId());
  const body = doc.getBody();

  // === サマリー集計 ===
  let symptomCount = 0;
  let maxSev = 0;
  (data.items || []).forEach(item => {
      // 送られてきたルート項目はすべて「症状」
      symptomCount++;
      const s = Number(item.severity) || 0;
      if (s > maxSev) maxSev = s;
  });

  // === ヘッダー置換 (サマリー含む) ===
  // 送信日時をフォーマット（app.jsから送信されたタイムスタンプを使用）
  let submittedDate = '-';
  if (data.submittedAt) {
    try {
      const date = new Date(data.submittedAt);
      submittedDate = date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      console.error('送信日時の解析エラー:', e);
      submittedDate = '-';
    }
  }

  body.replaceText('{{ChartId}}', data.chartId || '未設定');
  body.replaceText('{{Name}}', data.patientName || '未設定');
  body.replaceText('{{Month}}', `${data.year}年${data.month}月`);
  body.replaceText('{{Count}}', symptomCount.toString());
  body.replaceText('{{MaxSev}}', maxSev.toString());
  body.replaceText('{{SubmittedDate}}', submittedDate);

  // === データ展開 (時系列用) ===
  let allEvents = [];
  const seenIds = new Set();

  (data.items || []).forEach(symptom => {
    // 症状本体
    if (!seenIds.has(symptom.id)) {
      allEvents.push(symptom);
      seenIds.add(symptom.id);
    }
    // スナップショット展開
    if (symptom.snapshot) {
      (symptom.snapshot.meals || []).forEach(meal => {
        if (!seenIds.has(meal.id)) { meal.type = 'meal'; allEvents.push(meal); seenIds.add(meal.id); }
      });
      (symptom.snapshot.meds || []).forEach(med => {
        if (!seenIds.has(med.id)) { med.type = 'med'; allEvents.push(med); seenIds.add(med.id); }
      });
    }
  });

  // 時系列ソート
  allEvents.sort((a, b) => new Date(a.id).getTime() - new Date(b.id).getTime());

  // === テーブル処理 ===
  const tables = body.getTables();
  if (tables.length > 0) {
    const table = tables[0];

    // テンプレート行の確保
    let templateRow = null;
    if (table.getNumRows() > 1) {
       templateRow = table.getRow(1);
    }

    allEvents.forEach(item => {
      const row = templateRow ? templateRow.copy() : table.appendTableRow();
      if (templateRow) table.appendTableRow(row);
      
      // 1. 日時
      const d = new Date(item.id);
      const dateStr = Utilities.formatDate(d, 'Asia/Tokyo', 'MM/dd\nHH:mm');
      const cellDate = row.getCell(0);
      cellDate.setText(dateStr);
      cellDate.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.LEFT);
      cellDate.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
      cellDate.getChild(0).asParagraph().setFontSize(10);
      
      // 2. 種類
      let typeText = '';
      if(item.type === 'meal') typeText = '🍽️ 食事';
      else if(item.type === 'med') typeText = '💊 服薬';
      else if(item.type === 'symptom') typeText = `⚠️ 症状\nLv.${item.severity}`;
      
      const cellType = row.getCell(1);
      cellType.setText(typeText);
      cellType.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
      cellType.getChild(0).asParagraph().setFontSize(10);
      
      // 3. 写真/服薬内容
      const cellPhoto = row.getCell(2);
      cellPhoto.setText('');
      cellPhoto.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);

      // 複数写真対応（後方互換性のため photo も考慮）
      const photos = item.photos || (item.photo ? [item.photo] : []);
      if (photos.length > 0) {
        let insertIndex = 0;
        photos.forEach((photoData, idx) => {
          try {
            const base64Data = photoData.split(',')[1];
            const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg');
            const img = cellPhoto.insertImage(insertIndex, blob);
            const width = 120;
            const ratio = width / img.getWidth();
            img.setWidth(width).setHeight(img.getHeight() * ratio);
            insertIndex = cellPhoto.getNumChildren(); // 次の画像は最後に追加
            // 画像間に改行を追加（最後の画像以外）
            if (idx < photos.length - 1) {
              cellPhoto.insertParagraph(insertIndex, '');
            }
          } catch(e) {
            if (insertIndex === 0) cellPhoto.setText('(画像エラー)');
          }
        });
      } else if (item.type === 'med') {
        const meds = item.items ? item.items.map(i => `・${i.name} ${i.count}`).join('\n') : '内容なし';
        cellPhoto.setText(meds);
        cellPhoto.getChild(0).asParagraph().setFontSize(9);
      }

      // 4. 詳細
      let detailText = '';
      if(item.type === 'meal') {
         const tags = item.tags ? item.tags.join(', ') : '';
         detailText = `${tags ? '【' + tags + '】\n' : ''}${item.note || ''}`;
      } else if(item.type === 'symptom') {
         // 誘因情報の変換
         let triggersText = '';
         if (item.triggers && item.triggers.length > 0) {
             const triggerLabels = {
                 'exercise': '運動',
                 'stress': 'ストレス',
                 'sleep_lack': '睡眠不足',
                 'illness': '体調不良'
             };
             triggersText = item.triggers.map(id => triggerLabels[id] || id).join(', ');
         }
         detailText = `部位: ${item.parts || '-'}`;
         if (triggersText) detailText += `\n誘因: ${triggersText}`;
         detailText += `\n状況: ${item.note || ''}`;
      }
      const cellDetail = row.getCell(3);
      cellDetail.setText(detailText);
      cellDetail.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
      cellDetail.getChild(0).asParagraph().setFontSize(10);

      // ★重要: 行全体の背景色と文字色の適用
      if (item.type === 'symptom') {
        const severity = Number(item.severity) || 0;
        let bgColor = '#FFF8E1'; // デフォルト: 薄い黄色 (Lv1-3)
        let textColor = '#F57F17'; // デフォルト: 濃いオレンジ/黄色

        // Lv4以上なら赤く強調
        if (severity >= 4) {
            bgColor = '#FFEBEE'; // 薄い赤
            textColor = '#B71C1C'; // 濃い赤
        }

        for (let i = 0; i < row.getNumCells(); i++) {
            row.getCell(i).setBackgroundColor(bgColor);
        }
        cellType.getChild(0).asParagraph().setForegroundColor(textColor);
        cellDate.getChild(0).asParagraph().setBold(true);
      }
    });

    if (templateRow) {
      table.removeRow(1);
    }
  }

  // PDF変換
  doc.saveAndClose();
  const pdfBlob = docFile.getAs(MimeType.PDF);
  const pdfFile = patientFolder.createFile(pdfBlob);
  docFile.setTrashed(true);

  return pdfFile.getUrl();
}