# Google Apps Script for Onyx.mx (Media Only)

This script serves as the bridge between the React frontend and Google Drive. It handles file uploads and fetches image data as Base64. Data persistence is handled via **Supabase**, so this script **does not** interact with Google Sheets.

---

```javascript
/**
 * Onyx.mx Media-Only Backend Script
 * Logic: Google Drive Uploads + Base64 Image Fetching
 */

const UPLOAD_FOLDER_ID = '14lmh3w9cYaW41jHw7-p8hrdQ1uKAJr9i';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch (action) {
      case 'uploadMedia':
        return jsonResponse(handleUploadMedia(data));
      case 'getImageBase64FromDriveId':
        return jsonResponse(handleGetImageBase64(data.fileId));
      case 'batchGetImageBase64FromDriveIds':
        return jsonResponse(handleBatchGetImageBase64(data.fileIds));
      default:
        return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
    }
  } catch (err) {
    console.error("GAS error:", err.toString());
    return jsonResponse({ status: 'error', message: 'Server error: ' + err.toString() });
  }
}

/**
 * Uploads base64 file to Google Drive and returns the Public URL
 */
function handleUploadMedia(data) {
  try {
    const folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
    const bytes = Utilities.base64Decode(data.base64);
    const blob = Utilities.newBlob(bytes, data.mimeType, data.fileName);
    const file = folder.createFile(blob);
    
    // Set view permissions so the app can display the image
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      status: 'success',
      fileId: file.getId(),
      url: `https://drive.google.com/uc?export=view&id=${file.getId()}`
    };
  } catch (err) {
    return { status: 'error', message: 'Upload error: ' + err.toString() };
  }
}

/**
 * Image processing helpers for AI/Canvas
 */
function handleGetImageBase64(fileId) {
  for (let i = 0; i < 3; i++) {
    try {
      const blob = DriveApp.getFileById(fileId).getBlob();
      return { 
        status: 'success', 
        data: { base64: Utilities.base64Encode(blob.getBytes()), mimeType: blob.getContentType() } 
      };
    } catch (e) { 
      if (i === 2) throw e; 
      Utilities.sleep(1000 * (i + 1)); 
    }
  }
}

function handleBatchGetImageBase64(fileIds) {
  const res = {};
  fileIds.forEach(id => {
    try { 
      const b = DriveApp.getFileById(id).getBlob(); 
      res[id] = { base64: Utilities.base64Encode(b.getBytes()), mimeType: b.getContentType() }; 
    }
    catch(e) { res[id] = { error: e.toString() }; }
  });
  return { status: 'success', data: res };
}

function jsonResponse(obj) { 
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON); 
}

function doOptions(e) { 
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT); 
}
```
