# Google Apps Script for Onyx.mx (Media Only)

This script serves as the bridge between the React frontend and Google Drive. It handles file uploads and fetches image data as Base64. Data persistence is handled via **Supabase**, so this script **does not** interact with Google Sheets.

---

```javascript
/**
 * Onyx.mx Media-Only Backend Script
 * Logic: Google Drive Uploads + Base64 Image Fetching
 */

const UPLOAD_FOLDER_ID = '1tr9_cgbNUVs5lwLJYOYaHiDa-CLLUIek';
const SHOWROOM_FOLDER_ID = '1tr9_cgbNUVs5lwLJYOYaHiDa-CLLUIek'; // Dedicated Showroom Folder ID (separated from inventory)

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
      case 'extractDocImages':
        return jsonResponse(handleExtractDocImages(data.docId));
      case 'fetchIcloudAlbum':
        return jsonResponse(handleFetchIcloudAlbum(data.token));
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
    const targetFolderId = (data.folderType === 'showroom') ? SHOWROOM_FOLDER_ID : UPLOAD_FOLDER_ID;
    const folder = DriveApp.getFolderById(targetFolderId);
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

/**
 * Extracts inline images from a Google Doc by ID.
 * Returns array of base64 images with index and content type.
 */
function handleExtractDocImages(docId) {
  try {
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    const images = body.getImages();
    const results = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const blob = img.getBlob();
      results.push({
        index: i + 1,
        name: 'image_' + (i + 1) + '.jpg',
        mimeType: blob.getContentType(),
        base64: Utilities.base64Encode(blob.getBytes()),
        width: img.getWidth(),
        height: img.getHeight()
      });
    }
    return { status: 'success', count: results.length, docTitle: doc.getName(), images: results };
  } catch (err) {
    return { status: 'error', message: 'Extract Doc Images error: ' + err.toString() };
  }
}

/**
 * Resolves Apple iCloud Shared Album photos by token.
 * Returns array of direct high-res CDN photo URLs.
 */
function handleFetchIcloudAlbum(token) {
  try {
    const cleanToken = token.replace(/.*#/, '').trim();
    const payload = JSON.stringify({ streamCtag: null });
    
    // 1. Initial lookup to discover partition host
    const res1 = UrlFetchApp.fetch('https://sharedstreams.icloud.com/' + cleanToken + '/sharedstreams/webstream', {
      method: 'post',
      contentType: 'text/plain',
      payload: payload,
      muteHttpExceptions: true
    });
    
    let host = 'sharedstreams.icloud.com';
    const redirectHost = res1.getHeaders()['X-Apple-MMe-Host'];
    if (redirectHost) {
      host = redirectHost;
    }
    
    // 2. Fetch stream metadata from partition host
    const res2 = UrlFetchApp.fetch('https://' + host + '/' + cleanToken + '/sharedstreams/webstream', {
      method: 'post',
      contentType: 'text/plain',
      payload: payload,
      muteHttpExceptions: true
    });
    
    const streamData = JSON.parse(res2.getContentText());
    const photos = streamData.photos || [];
    const guids = photos.map(function(p) { return p.photoGuid; });
    
    // 3. Batch fetch direct Akamai CDN asset URLs (up to 100)
    const assetPayload = JSON.stringify({ photoGuids: guids.slice(0, 100) });
    const res3 = UrlFetchApp.fetch('https://' + host + '/' + cleanToken + '/sharedstreams/webasseturls', {
      method: 'post',
      contentType: 'text/plain',
      payload: assetPayload,
      muteHttpExceptions: true
    });
    
    const assetData = JSON.parse(res3.getContentText());
    const items = assetData.items || {};
    const locations = assetData.locations || {};
    
    const results = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const derivKeys = Object.keys(p.derivatives || {}).sort(function(a, b) { return parseInt(b) - parseInt(a); });
      if (!derivKeys.length) continue;
      
      const deriv = p.derivatives[derivKeys[0]];
      const itemInfo = items[deriv.checksum];
      if (itemInfo && locations[itemInfo.url_location]) {
        const locHost = locations[itemInfo.url_location].hosts[0];
        const fullUrl = 'https://' + locHost + itemInfo.url_path;
        results.push({
          guid: p.photoGuid,
          caption: p.caption || '',
          width: deriv.width,
          height: deriv.height,
          url: fullUrl,
          name: 'IMG_' + (i + 1) + '.jpg'
        });
      }
    }
    
    return {
      status: 'success',
      albumName: streamData.streamName || 'iCloud Album',
      totalPhotos: photos.length,
      photos: results
    };
  } catch (err) {
    return { status: 'error', message: 'iCloud Album error: ' + err.toString() };
  }
}

function jsonResponse(obj) { 
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.TEXT); 
}

function doOptions(e) { 
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT); 
}
```
