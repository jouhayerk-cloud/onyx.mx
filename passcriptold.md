/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// ==============================================================================
//  APP SCRIPT FOR SINGLE-SHEET DATABASE MODEL
// ==============================================================================
// This script is designed to work with a single "Onyx.mx" sheet which
// contains all data related to inventory, payments, and shipping.
//
// The sheet structure is defined in `spreadsheet.txt`.
// ==============================================================================


// IMPORTANT: After saving this script, you must deploy it.
// 1. Click "Deploy" -> "New deployment".
// 2. For "Select type", choose "Web app".
// 3. For "Who has access", select "Anyone".
// 4. Click "Deploy".
// 5. Copy the "Web app URL" provided and paste it into SCRIPT_URL in consts.tsx.

const SPREADSHEET_ID = '1H35gP2Da4qqE35ZIe_-OxUkq77ZELsIPFnoT9ef_3sQ';
const IMAGE_UPLOAD_FOLDER_ID = '14lmh3w9cYaW41jHw7-p8hrdQ1uKAJr9i';
const INVENTORY_SHEET_NAME = 'Inventory'; // The single source of truth for all item data.
const ACQUISITIONS_SHEET_NAME = 'ID'; // Sheet for the acquisitions dashboard
const PAYMENTS_SHEET_NAME = 'Payments';
const WITHDRAWALS_SHEET_NAME = 'Withdrawals';
const RECURRING_SHEET_NAME = 'Recurring';
const INVOICES_SHEET_NAME = 'Invoices';
const SHIPPING_SHEET_NAME = 'Shipping';
const CRATES_SHEET_NAME = 'Crates';


/**
 * A robust utility function to convert strings to camelCase, handling spaces, dashes, and underscores.
 * @param {string} s The input string.
 * @returns {string} The camelCased string.
 */
function toCamelCase(s) {
    if (!s) return s;
    s = String(s).trim();
    return s.replace(/[-_\s]+(.)?/g, (match, p1) => p1 ? p1.toUpperCase() : '')
            .replace(/^(.)/, c => c.toLowerCase());
}

/**
 * Main entry point for all web app requests from the frontend.
 * It acts as a router, directing requests to the appropriate handler function based on the 'action' parameter.
 * @param {GoogleAppsScript.Events.DoPost} e The event parameter containing the POST data.
 * @returns {ContentService.TextOutput} A JSON response.
 */
function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    let responseData;

    switch (action) {
      // Main App Actions
      case 'getInventory':
        responseData = getInventory(requestData.user);
        break;
      case 'getClientData':
        responseData = getClientData();
        break;
      case 'updateFullItem':
        responseData = updateFullItem(requestData);
        break;
      case 'batchUpdateItems':
        responseData = batchUpdateItems(requestData);
        break;
      case 'getImageBase64FromDriveId':
        responseData = getImageBase64FromDriveId(requestData);
        break;
      case 'batchGetImageBase64FromDriveIds':
        responseData = batchGetImageBase64FromDriveIds(requestData);
        break;
      case 'appendInventory':
        responseData = appendInventory(requestData);
        break;
      case 'deleteItem':
        responseData = deleteItem(requestData);
        break;
      case 'batchDeleteItems':
        responseData = batchDeleteItems(requestData);
        break;
      case 'createInitialItem':
        responseData = createInitialItem(requestData);
        break;
      case 'batchCreateItems':
        responseData = batchCreateItems(requestData);
        break;
      case 'batchCreateTextItems':
        responseData = batchCreateTextItems(requestData);
        break;
      case 'resetSheet':
        responseData = resetSheet(requestData);
        break;
      case 'saveGeneratedImagesBatch':
        responseData = saveGeneratedImagesBatch(requestData);
        break;
      case 'updateClientReviews':
        responseData = updateClientReviews(requestData);
        break;
      case 'getUniqueColumnValues':
        responseData = getUniqueColumnValues(requestData);
        break;
      case 'getSimilarItems':
        responseData = getSimilarItems(requestData);
        break;
      
      // Dashboard Actions
      case 'getAcquisitions':
        responseData = getAcquisitions();
        break;
      case 'appendAcquisition':
        responseData = appendAcquisition(requestData);
        break;
      case 'updateAcquisition':
        responseData = updateAcquisition(requestData);
        break;
      case 'deleteAcquisition':
        responseData = deleteAcquisition(requestData);
        break;
      
      // Expense Actions
      case 'getExpenses':
        responseData = getExpenses(requestData);
        break;
      case 'appendExpense':
        responseData = appendExpense(requestData);
        break;
      case 'updateExpense':
        responseData = updateExpense(requestData);
        break;
      case 'deleteExpense':
        responseData = deleteExpense(requestData);
        break;

      // Withdrawal Actions
      case 'getWithdrawals':
        responseData = getWithdrawals();
        break;
      case 'appendWithdrawal':
        responseData = appendWithdrawal(requestData);
        break;
      case 'updateWithdrawal':
        responseData = updateWithdrawal(requestData);
        break;
      case 'deleteWithdrawal':
        responseData = deleteWithdrawal(requestData);
        break;

      // Recurring Expense Actions
      case 'getRecurringExpenses':
        responseData = getRecurringExpenses();
        break;
      case 'appendRecurringExpense':
        responseData = appendRecurringExpense(requestData);
        break;
      case 'updateRecurringExpense':
        responseData = updateRecurringExpense(requestData);
        break;
      case 'deleteRecurringExpense':
        responseData = deleteRecurringExpense(requestData);
        break;

      // Invoice Actions
      case 'getInvoices':
        responseData = getInvoices();
        break;
      case 'appendInvoice':
        responseData = appendInvoice(requestData);
        break;
      case 'addPaymentToInvoice':
        responseData = addPaymentToInvoice(requestData);
        break;
      
      case 'uploadMedia':
        responseData = uploadMedia(requestData);
        break;
      case 'appendShippingData':
        responseData = appendShippingData(requestData);
        break;
      case 'getCrates':
        responseData = getCrates();
        break;
      case 'batchUpdateCrates':
        responseData = batchUpdateCrates(requestData);
        break;
        
      default:
        responseData = { status: 'error', message: `Invalid action: ${action}` };
        break;
    }

    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    // Comprehensive error logging for easier debugging.
    console.error(`doPost Error for action: ${JSON.parse(e.postData.contents).action}`, error.toString(), error.stack);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: `Server error: ${error.toString()}` }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Reads the header row of a sheet and creates a map of camelCased header names to their 0-based column index.
 * This makes the code resilient to changes in column order.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet to process.
 * @returns {Map<string, number>} A map of header names to column indices.
 */
function getHeaderMap(sheet) {
  if (!sheet || sheet.getLastColumn() === 0) return new Map();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = new Map();
  headers.forEach((h, i) => {
    if (h) {
      map.set(toCamelCase(h), i); // Use 0-based index
    }
  });
  return map;
}

/**
 * A robust utility function to find a column index by its camelCased key from the header map.
 * @param {Map<string, number>} headerMap The map generated by getHeaderMap.
 * @param {string} key The camelCased header key to find.
 * @returns {number} The 0-based column index, or -1 if not found.
 */
function findColumnIndex(headerMap, key) {
  return headerMap.has(key) ? headerMap.get(key) : -1;
}


/**
 * Creates an initial, empty row for a new item. This is the first step in the AI creation workflow.
 * It determines the next available itemNumber for the given vendorId.
 * @param {object} options - The options object.
 * @param {string} options.vendorId - The ID of the vendor creating the item.
 * @param {object} options.user - The user object from the frontend.
 * @returns {object} An object containing the status, the newly created item data, and its row number.
 */
function createInitialItem({ vendorId, user }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);
  
  const headerMap = getHeaderMap(sheet);
  
  const itemIdCol = findColumnIndex(headerMap, 'itemId');
  const itemNumberCol = findColumnIndex(headerMap, 'itemNumber');
  
  if (itemIdCol === -1 || itemNumberCol === -1) {
    throw new Error("Sheet must contain 'itemId' and 'itemNumber' columns.");
  }

  // Find the highest existing itemNumber for this vendor to calculate the next one.
  const data = sheet.getDataRange().getValues();
  let maxItemNumber = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][itemIdCol] === vendorId) {
      const currentItemNumber = parseInt(data[i][itemNumberCol], 10);
      if (!isNaN(currentItemNumber) && currentItemNumber > maxItemNumber) {
        maxItemNumber = currentItemNumber;
      }
    }
  }
  
  const newItemNumber = maxItemNumber + 1;
  const newRowData = {
    timestamp: new Date(),
    itemId: vendorId,
    itemNumber: newItemNumber,
    createdBy: user ? user.email : '',
  };
  
  // Construct the new row array in the correct column order.
  const newRow = Array(sheet.getLastColumn()).fill('');
  for (const [key, colIndex] of headerMap.entries()) {
      if (newRowData[key] !== undefined) {
          newRow[colIndex] = newRowData[key];
      }
  }
  
  sheet.appendRow(newRow);
  const newRowIndex = sheet.getLastRow();
  const appendedValues = sheet.getRange(newRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Read the data back from the sheet to ensure consistency and return it.
  const newItemData = {};
  for (const [key, colIndex] of headerMap.entries()) {
      newItemData[key] = appendedValues[colIndex];
  }
   
  return { status: 'success', newItemData, newRow: newRowIndex };
}

/**
 * Fetches and returns all inventory items. If the user has a 'Vendor' role,
 * it filters the results to show only that vendor's items.
 * @param {object} user - The user object from the frontend.
 * @returns {object} A success object containing the inventory data.
 */
function getInventory(user) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  const range = sheet.getDataRange();
  const values = range.getValues();
  const headerMap = getHeaderMap(sheet);

  const itemIdColIndex = findColumnIndex(headerMap, 'itemId');
  
  const inventory = [];

  // Iterate through all data rows (starting from index 1 to skip header).
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    
    // Filtering logic: If user is a vendor, skip rows that don't match their ID.
    if (user && user.role === 'Vendor' && itemIdColIndex !== -1) {
      if (row[itemIdColIndex] !== user.id) {
        continue;
      }
    }

    // Convert the row array into a structured object using the header map.
    const rowData = {};
    for (const [key, index] of headerMap.entries()) {
      rowData[key] = row[index];
    }
    
    // Skip empty rows.
    if (!rowData.itemId && !rowData.itemNumber) {
      continue;
    }

    inventory.push({
      row: i + 1, // 1-based row number for making future updates.
      label: rowData.shape || `Item ${rowData.itemNumber || i}`,
      imageUrl: rowData.mediaUrls || null,
      data: rowData
    });
  }

  return { status: 'success', data: inventory };
}

/**
 * Updates an entire row for a given item, including handling file uploads.
 * This is a critical function for saving edits and AI-generated data.
 * @param {object} requestData - The full request object from the frontend.
 * @returns {object} A success object with the fully updated item data.
 */
function updateFullItem({ row, itemData, user, generatedPngData, generatedSvgData }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  const existingRowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

  const { photosFolder, generatedFolder } = getOrCreateItemFolder(itemData);

  // Handle mediaUrl updates. The frontend is expected to send the complete, final list of photos in `itemData.photos`.
  // This array can contain existing Drive URLs (strings) and new uploads (data URL objects).
  if (itemData.photos) {
    const processedUrls = itemData.photos.map((photo, index) => {
      // If photo is already a URL string, just return it.
      if (typeof photo === 'string' && photo.startsWith('http')) return photo;
      if (typeof photo === 'object' && photo.dataUrl && photo.dataUrl.startsWith('http')) return photo.dataUrl;
      
      // If photo is a new upload (data URL object), upload it.
      if (typeof photo === 'object' && photo.dataUrl) {
          const fileName = `item_${itemData.itemNumber}_photo_${Date.now()}_${index}.jpg`;
          return uploadImageToDriveAndGetUrl(photo.dataUrl, fileName, photosFolder);
      }
      return null; // Ignore invalid entries
    });
    // **FIX**: Overwrite mediaUrls with the fully processed list. This handles additions and deletions correctly
    // and prevents the duplication of URLs on subsequent saves.
    itemData.mediaUrls = processedUrls.filter(Boolean).join(', ');
  }


  // Handle overwriting generated files (PNG/SVG from masks).
  if (generatedPngData) {
    const fileName = `item_${itemData.itemNumber}_gen_png_${Date.now()}.png`;
    const newPngUrl = uploadImageToDriveAndGetUrl(generatedPngData, fileName, generatedFolder);
    itemData.generatedPngUrl = newPngUrl;
  }
  if (generatedSvgData) {
    const fileName = `item_${itemData.itemNumber}_gen_svg_${Date.now()}.svg`;
    const blob = Utilities.newBlob(generatedSvgData, 'image/svg+xml', fileName);
    const newSvgUrl = uploadBlobToDriveAndGetUrl(blob, generatedFolder);
    itemData.generatedSvgUrl = newSvgUrl;
  }

  // Construct the new row array in the correct column order.
  const newRow = Array(sheet.getLastColumn()).fill('');
  for (const [key, colIndex] of headerMap.entries()) {
    // Prioritize new data from the form, but fall back to existing data if a field wasn't submitted.
    const value = (itemData[key] !== undefined && itemData[key] !== null) ? itemData[key] : existingRowValues[colIndex];
    if (value !== undefined && value !== null) {
      newRow[colIndex] = value;
    }
  }
  
  // Write the entire updated row back to the sheet.
  sheet.getRange(row, 1, 1, newRow.length).setValues([newRow]);
  
  // Read the data back and return it to the client to ensure UI state is in sync.
  const updatedData = {};
  for (const [key, colIndex] of headerMap.entries()) {
      updatedData[key] = newRow[colIndex];
  }

  return { status: 'success', updatedItem: updatedData };
}


/**
 * Updates multiple item rows in a single batch.
 * @param {object} requestData - The request data.
 * @param {Array<{row: number, itemData: object}>} requestData.updates - Array of update objects.
 * @returns {object} A success message.
 */
function batchUpdateItems({ updates }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);

  // To optimize, we can group updates by row, but for simplicity and smaller batches, iterating is fine.
  updates.forEach(update => {
    const { row, itemData } = update;
    if (typeof row !== 'number' || row <= 1) return; // Skip invalid rows

    try {
      const range = sheet.getRange(row, 1, 1, sheet.getLastColumn());
      const existingRowValues = range.getValues()[0];
      
      const newRow = [...existingRowValues];
      for (const [key, value] of Object.entries(itemData)) {
        const colIndex = findColumnIndex(headerMap, key);
        if (colIndex !== -1) {
          newRow[colIndex] = value;
        }
      }
      
      range.setValues([newRow]);

    } catch(e) {
       console.error(`Failed to update row ${row}:`, e.toString());
       // Continue with next update
    }
  });

  return { status: 'success', message: `${updates.length} items processed.` };
}


/**
 * Appends a new inventory item to the sheet, including handling file uploads.
 * @param {object} requestData - The request data.
 * @param {object[]} requestData.inventory - An array of new inventory items.
 * @param {object} requestData.user - The current user.
 * @returns {object} A success message.
 */
function appendInventory({ inventory, user }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  
  const newRows = inventory.map(item => {
    const { photosFolder, generatedFolder } = getOrCreateItemFolder(item);
    
    // Handle photo uploads
    const photoUrls = (item.photos || []).map((photo, index) => {
      const fileName = `item_${item.itemNumber}_${item.itemId}_photo_${index + 1}.jpg`;
      return uploadImageToDriveAndGetUrl(photo.dataUrl, fileName, photosFolder);
    }).join(', ');

    // Handle generated file uploads
    let generatedPngUrl = '';
    if (item.pngData) {
      const fileName = `item_${item.itemNumber}_gen_png.png`;
      generatedPngUrl = uploadImageToDriveAndGetUrl(item.pngData, fileName, generatedFolder);
    }
    let generatedSvgUrl = '';
    if (item.svgData) {
      const fileName = `item_${item.itemNumber}_gen_svg.svg`;
      const blob = Utilities.newBlob(item.svgData, 'image/svg+xml', fileName);
      generatedSvgUrl = uploadBlobToDriveAndGetUrl(blob, generatedFolder);
    }
    
    // Build the row object based on the sheet's headers
    const rowObject = {
      ...item,
      timestamp: new Date(),
      mediaUrls: photoUrls,
      generatedPngUrl: generatedPngUrl,
      generatedSvgUrl: generatedSvgUrl,
      createdBy: user ? user.email : '',
    };
    
    const newRow = Array(sheet.getLastColumn()).fill('');
    for (const [key, colIndex] of headerMap.entries()) {
       if (rowObject[key] !== undefined && rowObject[key] !== null) {
         newRow[colIndex] = rowObject[key];
       }
    }
    return newRow;
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  return { status: 'success', message: `${newRows.length} items added.` };
}


/**
 * Deletes an item row from the sheet. Admin only.
 * @param {object} requestData - The request data.
 * @param {number} requestData.row - The 1-based row number to delete.
 * @param {object} requestData.user - The current user.
 * @returns {object} A success message.
 */
function deleteItem({ row, user }) {
  if (!user || user.role !== 'Admin') {
    throw new Error('Permission denied. Only admins can delete items.');
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  sheet.deleteRow(row);

  return { status: 'success', message: `Item in row ${row} deleted.` };
}

/**
 * Deletes a batch of item rows from the sheet. Admin only.
 * @param {object} requestData - The request data.
 * @param {number[]} requestData.rows - An array of 1-based row numbers to delete.
 * @param {object} requestData.user - The current user.
 * @returns {object} A success message.
 */
function batchDeleteItems({ rows, user }) {
  if (!user || user.role !== 'Admin') {
    throw new Error('Permission denied. Only admins can delete items.');
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    throw new Error('No rows provided for deletion.');
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  // Sort rows in descending order to avoid shifting indices during deletion.
  const sortedRows = rows.sort((a, b) => b - a);
  
  let deletedCount = 0;
  sortedRows.forEach(row => {
    // Basic validation to ensure it's a valid row number
    if (typeof row === 'number' && row > 1 && row <= sheet.getLastRow()) {
      sheet.deleteRow(row);
      deletedCount++;
    }
  });

  return { status: 'success', message: `${deletedCount} of ${rows.length} items deleted.` };
}

/**
 * Creates multiple inventory items in a single batch operation.
 * @param {object} requestData - The request data.
 * @param {object} requestData.itemData - Common data for all items (shape, material, etc.).
 * @param {string[]} requestData.imageDataUrls - Array of base64 data URLs for each item's image.
 * @param {object} requestData.user - The current user.
 * @returns {object} A success object with an array of the newly created items' data.
 */
function batchCreateItems({ itemData, imageDataUrls, user }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  const itemIdCol = findColumnIndex(headerMap, 'itemId');
  const itemNumberCol = findColumnIndex(headerMap, 'itemNumber');

  if (itemIdCol === -1 || itemNumberCol === -1) {
    throw new Error("Sheet must contain 'itemId' and 'itemNumber' columns.");
  }

  // Find the highest existing itemNumber for this vendor to calculate the next ones.
  const data = sheet.getDataRange().getValues();
  let maxItemNumber = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][itemIdCol] === itemData.itemId) {
      const currentItemNumber = parseInt(data[i][itemNumberCol], 10);
      if (!isNaN(currentItemNumber) && currentItemNumber > maxItemNumber) {
        maxItemNumber = currentItemNumber;
      }
    }
  }

  const newRows = [];
  const createdItemsData = [];
  let currentItemNumber = maxItemNumber + 1;

  imageDataUrls.forEach((dataUrl, index) => {
    const fullItemData = {
      ...itemData,
      itemNumber: currentItemNumber,
      timestamp: new Date(),
      createdBy: user ? user.email : '',
    };
    
    // Handle image upload
    try {
      const { photosFolder } = getOrCreateItemFolder(fullItemData);
      const fileName = `item_${fullItemData.itemNumber}_${fullItemData.itemId}_photo_1.jpg`;
      fullItemData.mediaUrls = uploadImageToDriveAndGetUrl(dataUrl, fileName, photosFolder);
    } catch(e) {
      console.error(`Failed to upload image for item ${fullItemData.itemNumber}: ${e.toString()}`);
      fullItemData.mediaUrls = ''; // Continue without image if upload fails
    }

    // Build the row array
    const newRow = Array(sheet.getLastColumn()).fill('');
    for (const [key, colIndex] of headerMap.entries()) {
       if (fullItemData[key] !== undefined && fullItemData[key] !== null) {
         newRow[colIndex] = fullItemData[key];
       }
    }
    newRows.push(newRow);
    
    const rowObjectForClient = {};
    for (const [key, colIndex] of headerMap.entries()) {
       rowObjectForClient[key] = newRow[colIndex];
    }
    createdItemsData.push(rowObjectForClient);

    currentItemNumber++;
  });

  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
    
    // Add row numbers to the data being sent back to the client
    createdItemsData.forEach((item, index) => {
        createdItemsData[index] = { row: startRow + index, label: item.shape, imageUrl: item.mediaUrls, data: item };
    });
  }

  return { status: 'success', message: `${newRows.length} items created.`, createdItems: createdItemsData };
}

function batchCreateTextItems({ itemData, count, user }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  const itemIdCol = findColumnIndex(headerMap, 'itemId');
  const itemNumberCol = findColumnIndex(headerMap, 'itemNumber');

  if (itemIdCol === -1 || itemNumberCol === -1) {
    throw new Error("Sheet must contain 'itemId' and 'itemNumber' columns.");
  }

  // Find the highest existing itemNumber for this vendor to calculate the next ones.
  const data = sheet.getDataRange().getValues();
  let maxItemNumber = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][itemIdCol] === itemData.itemId) {
      const currentItemNumber = parseInt(data[i][itemNumberCol], 10);
      if (!isNaN(currentItemNumber) && currentItemNumber > maxItemNumber) {
        maxItemNumber = currentItemNumber;
      }
    }
  }

  const newRows = [];
  let currentItemNumber = maxItemNumber + 1;

  for (let i = 0; i < count; i++) {
      const fullItemData = {
        ...itemData,
        itemNumber: currentItemNumber,
        timestamp: new Date(),
        createdBy: user ? user.email : '',
      };

      // Build the row array
      const newRow = Array(sheet.getLastColumn()).fill('');
      for (const [key, colIndex] of headerMap.entries()) {
        if (fullItemData[key] !== undefined && fullItemData[key] !== null) {
          newRow[colIndex] = fullItemData[key];
        }
      }
      newRows.push(newRow);
      currentItemNumber++;
  }

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  return { status: 'success', message: `${newRows.length} items created.` };
}


/**
 * Resets the inventory sheet, deleting all data rows but preserving the header. Admin only.
 * @param {object} requestData - The request data.
 * @param {object} requestData.user - The current user.
 * @returns {object} A success message.
 */
function resetSheet({ user }) {
  if (!user || user.role !== 'Admin') {
    throw new Error('Permission denied. Only admins can reset the sheet.');
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);
  
  const lastRow = sheet.getLastRow();
  // If there's more than just the header row, delete the data rows.
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  return { status: 'success', message: 'Inventory sheet has been reset.' };
}

/**
 * Helper to get or create a subfolder within a parent folder.
 * @param {GoogleAppsScript.Drive.Folder} parentFolder - The parent folder.
 * @param {string} folderName - The name of the subfolder.
 * @returns {GoogleAppsScript.Drive.Folder} The subfolder.
 */
function getOrCreateSubfolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

/**
 * Helper to get or create the main folder and subfolders ('photos', 'generated') for an inventory item.
 * @param {object} itemData - The data for the inventory item.
 * @returns {object} An object containing the itemFolder, photosFolder, and generatedFolder.
 */
function getOrCreateItemFolder(itemData) {
  const rootFolder = DriveApp.getFolderById(IMAGE_UPLOAD_FOLDER_ID);
  const folderName = `${itemData.itemId || 'UNKNOWN'}_${itemData.itemNumber}`;
  const itemFolder = getOrCreateSubfolder(rootFolder, folderName);
  
  const photosFolder = getOrCreateSubfolder(itemFolder, 'photos');
  const generatedFolder = getOrCreateSubfolder(itemFolder, 'generated');
  
  return { itemFolder, photosFolder, generatedFolder };
}

/**
 * Helper to upload a base64 Data URL to a file in Drive in a specific folder.
 * @param {string} dataUrl - The base64 data URL string.
 * @param {string} fileName - The desired file name.
 * @param {GoogleAppsScript.Drive.Folder} folder - The destination folder.
 * @returns {string} The public URL of the uploaded file.
 */
function uploadImageToDriveAndGetUrl(dataUrl, fileName, folder) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL format.');
  
  const [_, contentType, base64Data] = match;
  const decoded = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decoded, contentType, fileName);
  
  return uploadBlobToDriveAndGetUrl(blob, folder);
}

/**
 * Helper to upload any blob to a file in Drive and get its public URL.
 * @param {GoogleAppsScript.Base.Blob} blob - The blob to upload.
 * @param {GoogleAppsScript.Drive.Folder} folder - The destination folder.
 * @returns {string} The public URL of the uploaded file.
 */
function uploadBlobToDriveAndGetUrl(blob, folder) {
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/uc?export=view&id=${file.getId()}`;
}

/**
 * Retrieves a Drive file as a base64 encoded string, used by the frontend to display images.
 * @param {object} requestData - The request data.
 * @param {string} requestData.fileId - The ID of the file in Google Drive.
 * @returns {object} A success object with the base64 data and MIME type.
 */
function getImageBase64FromDriveId({ fileId }) {
    if (!fileId || typeof fileId !== 'string' || fileId.trim().length < 10) {
        throw new Error(`Invalid or missing file ID provided: "${fileId}"`);
    }
    
    let lastError = null;
    // Try up to 3 times to fetch the file, with delays to handle rate limiting.
    for (let i = 0; i < 3; i++) {
      try {
          const file = DriveApp.getFileById(fileId);
          const blob = file.getBlob();
          const base64 = Utilities.base64Encode(blob.getBytes());
          const mimeType = blob.getContentType();

          return { status: 'success', data: { base64, mimeType } };
      } catch(e) {
          lastError = e;
          console.error(`Attempt ${i+1} failed for getImageBase64FromDriveId with fileId "${fileId}": ${e.toString()}`);
          if (i < 2) { // Don't sleep on the last attempt
              Utilities.sleep(1000 * (i + 1)); // Sleep for 1, then 2 seconds
          }
      }
    }

    // If all attempts fail, throw the last recorded error.
    console.error(`All attempts failed for fileId "${fileId}". Final error: ${lastError.toString()}`);
    throw lastError; // Re-throw the original error to be caught by doPost
}

/**
 * Retrieves multiple Drive files as base64 encoded strings in a single batch.
 * @param {object} requestData - The request data.
 * @param {string[]} requestData.fileIds - An array of file IDs from Google Drive.
 * @returns {object} A success object with a map of fileId -> {base64, mimeType}.
 */
function batchGetImageBase64FromDriveIds({ fileIds }) {
  if (!fileIds || !Array.isArray(fileIds)) {
    throw new Error('Invalid or missing fileIds array.');
  }

  const results = {};
  
  fileIds.forEach(fileId => {
    try {
      // Re-use the single-image function's logic but without the retry loop for simplicity in batch.
      // The client-side can handle retries for failed individual IDs if necessary.
      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      const mimeType = blob.getContentType();
      results[fileId] = { base64, mimeType };
    } catch (e) {
      console.error(`Failed to fetch fileId "${fileId}" in batch: ${e.toString()}`);
      results[fileId] = { error: e.toString() };
    }
  });

  return { status: 'success', data: results };
}


/**
 * Saves a batch of AI-generated scene images from the GenIMG view.
 * @param {object} requestData - The request data.
 * @returns {object} A success message.
 */
function saveGeneratedImagesBatch({ row, itemData, imageDataUrls, user }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  const { itemFolder } = getOrCreateItemFolder(itemData);
  const generatedFolder = getOrCreateSubfolder(itemFolder, 'generated-scenes');
  
  const newUrls = imageDataUrls.map((dataUrl, index) => {
    const fileName = `item_${itemData.itemNumber}_scene_${Date.now()}_${index}.png`;
    return uploadImageToDriveAndGetUrl(dataUrl, fileName, generatedFolder);
  });

  const genImgColIndex = findColumnIndex(headerMap, 'generatedImageUrls');
  if (genImgColIndex === -1) {
    throw new Error("Column 'generatedImageUrls' not found.");
  }

  // Append new URLs to existing ones.
  const range = sheet.getRange(row, genImgColIndex + 1);
  const existingUrls = range.getValue() || '';
  const allUrls = [existingUrls, ...newUrls].filter(Boolean).join(', ');
  
  range.setValue(allUrls);

  return { status: 'success', message: 'Generated images saved.' };
}


/**
 * Gets data for the client-facing catalog page (ais.html, client.html).
 * It only returns items that are NOT marked with a status of "NO".
 * @returns {object} A success object containing an array of client-visible items.
 */
function getClientData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);
  
  const data = sheet.getDataRange().getValues();
  const headerMap = getHeaderMap(sheet);
  const statusColIndex = findColumnIndex(headerMap, 'status');

  if (statusColIndex === -1) throw new Error("Column 'Status' not found.");

  const clientItems = [];

  for (let i = 1; i < data.length; i++) {
    // Check if the "status" column is NOT "NO". This includes "YES", empty, and other statuses.
    if (String(data[i][statusColIndex]).trim().toUpperCase() !== 'NO') {
        const rowData = {};
        for (const [headerKey, colIdx] of headerMap.entries()) {
            rowData[headerKey] = data[i][colIdx];
        }
        
        if (rowData.itemId || rowData.itemNumber) {
            clientItems.push(rowData);
        }
    }
  }
  
  return { status: 'success', data: clientItems };
}

/**
 * Updates the `status` column for a batch of reviews from ais.html.
 * @param {object} requestData - The request data.
 * @param {Array<{row: number, status: string}>} requestData.reviews - An array of review objects.
 * @returns {object} A success message.
 */
function updateClientReviews({ reviews }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  const statusColIndex = findColumnIndex(headerMap, 'status');
  if (statusColIndex === -1) {
    throw new Error("Column 'Status' not found.");
  }

  // Google Sheets column is 1-based, index is 0-based.
  const statusCol = statusColIndex + 1;

  reviews.forEach(review => {
    const { row, status } = review;
    if (typeof row !== 'number' || row <= 1) return; // Ignore invalid rows

    let valueToSet = ''; // Default to empty
    if (status === 'Yes') {
      valueToSet = 'Yes';
    } else if (status === 'No') {
      valueToSet = 'No';
    }
    sheet.getRange(row, statusCol).setValue(valueToSet);
  });

  return { status: 'success', message: `${reviews.length} reviews updated.` };
}

/**
 * Fetches unique, non-empty values from a specified column for autocomplete functionality.
 * @param {object} options - The options object.
 * @param {string} options.columnName - The name of the column to query.
 * @returns {object} A success object with an array of unique string values.
 */
function getUniqueColumnValues({ columnName }) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
    if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

    const headerMap = getHeaderMap(sheet);
    const camelColumnName = toCamelCase(columnName);
    const colIndex = findColumnIndex(headerMap, camelColumnName);
    
    if (colIndex === -1) {
      console.error(`Column '${columnName}' (camelCased to '${camelColumnName}') not found. Available columns: ${[...headerMap.keys()].join(', ')}`);
      throw new Error(`Column '${columnName}' not found.`);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { status: 'success', data: [] }; // No data rows
    }

    const data = sheet.getRange(2, colIndex + 1, lastRow - 1, 1).getValues();
    const uniqueValues = [...new Set(data.flat().filter(val => val && String(val).trim() !== ''))];
    
    return { status: 'success', data: uniqueValues };
  } catch (error) {
    console.error(`getUniqueColumnValues Error for column: ${columnName}`, error.toString(), error.stack);
    return { status: 'error', message: `Server error in getUniqueColumnValues: ${error.toString()}` };
  }
}

/**
 * Fetches dimension data for items with a similar shape and material.
 * @param {object} options - The options object.
 * @param {string} options.shape - The shape to match.
 * @param {string} options.material - The material to match.
 * @returns {object} A success object with an array of dimension objects.
 */
function getSimilarItems({ shape, material }) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
    if (!sheet) throw new Error(`Sheet not found: ${INVENTORY_SHEET_NAME}`);

    const headerMap = getHeaderMap(sheet);
    const shapeCol = findColumnIndex(headerMap, 'shape');
    const materialCol = findColumnIndex(headerMap, 'material');
    const widthCol = findColumnIndex(headerMap, 'widthCm');
    const heightCol = findColumnIndex(headerMap, 'heightCm');
    const lengthCol = findColumnIndex(headerMap, 'lengthCm');

    if (shapeCol === -1 || materialCol === -1 || widthCol === -1 || heightCol === -1 || lengthCol === -1) {
      throw new Error('Required dimension or identifier columns not found in the sheet.');
    }

    const data = sheet.getDataRange().getValues();
    const similarItems = [];

    // Iterate backwards to get the most recent entries first
    for (let i = data.length - 1; i > 0 && similarItems.length < 5; i--) {
      const row = data[i];
      if (row[shapeCol] === shape && row[materialCol] === material) {
        const width = row[widthCol];
        const height = row[heightCol];
        const length = row[lengthCol];
        if (width && height && length) {
           similarItems.push({ widthCm: width, heightCm: height, lengthCm: length });
        }
      }
    }
    
    return { status: 'success', data: similarItems };
  } catch (error) {
    console.error(`getSimilarItems Error for shape: ${shape}, material: ${material}`, error.toString(), error.stack);
    return { status: 'error', message: `Server error in getSimilarItems: ${error.toString()}` };
  }
}



// ==============================================================================
//  ACQUISITIONS DASHBOARD ('ID' SHEET) FUNCTIONS
// ==============================================================================

/**
 * Fetches data for the acquisitions dashboard from the 'ID' sheet.
 * @returns {object} A success object containing the acquisitions data.
 */
function getAcquisitions() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ACQUISITIONS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${ACQUISITIONS_SHEET_NAME}`);

  const range = sheet.getDataRange();
  const values = range.getValues();
  const headerMap = getHeaderMap(sheet);
  
  const acquisitions = [];

  for (let i = 1; i < values.length; i++) { // Start at 1 to skip header
    const row = values[i];
    const rowData = {};
    let hasData = false;

    for (const [key, index] of headerMap.entries()) {
      rowData[key] = row[index];
      if (row[index]) {
        hasData = true;
      }
    }

    if (!hasData) continue; // Skip entirely empty rows

    acquisitions.push({
      row: i + 1, // 1-based row number
      data: rowData
    });
  }

  return { status: 'success', data: acquisitions };
}


/**
 * Appends new acquisition items to the 'ID' sheet.
 * Frontend is expected to send all calculated fields.
 * @param {object} requestData - The request data.
 * @param {object[]} requestData.inventory - An array of new item objects.
 * @returns {object} A success message.
 */
function appendAcquisition({ inventory }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ACQUISITIONS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${ACQUISITIONS_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  const newRows = inventory.map(item => {
    
    const fullItemData = {
      ...item,
      date: item.date || new Date(),
    };

    const newRow = Array(sheet.getLastColumn()).fill('');
    for (const [key, colIndex] of headerMap.entries()) {
       if (fullItemData[key] !== undefined && fullItemData[key] !== null) {
         newRow[colIndex] = fullItemData[key];
       }
    }
    return newRow;
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  return { status: 'success', message: `${newRows.length} items added.` };
}

/**
 * Updates a single acquisition item in the 'ID' sheet.
 * Frontend sends the complete, updated state of the item.
 * @param {object} requestData - The request data.
 * @param {number} requestData.row - The 1-based row number to update.
 * @param {object} requestData.itemData - The new data for the item.
 * @returns {object} A success message.
 */
function updateAcquisition({ row, itemData }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ACQUISITIONS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${ACQUISITIONS_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  
  const fullItemData = {
    ...itemData,
    date: itemData.date || new Date(),
  };

  const newRow = Array(sheet.getLastColumn()).fill('');
  for (const [key, colIndex] of headerMap.entries()) {
      if (fullItemData[key] !== undefined && fullItemData[key] !== null) {
        newRow[colIndex] = fullItemData[key];
      }
  }
  
  sheet.getRange(row, 1, 1, newRow.length).setValues([newRow]);
  
  return { status: 'success', message: `Item in row ${row} updated.` };
}

/**
 * Deletes an acquisition item from the 'ID' sheet.
 * @param {object} requestData - The request data.
 * @param {number} requestData.row - The 1-based row number to delete.
 * @returns {object} A success message.
 */
function deleteAcquisition({ row }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ACQUISITIONS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${ACQUISITIONS_SHEET_NAME}`);

  sheet.deleteRow(row);

  return { status: 'success', message: `Item in row ${row} deleted.` };
}

// ==============================================================================
//  PAYMENTS (EXPENSES) DASHBOARD ('Payments' SHEET) FUNCTIONS
// ==============================================================================

function getExpenses({ user }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PAYMENTS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${PAYMENTS_SHEET_NAME}`);

  const range = sheet.getDataRange();
  const values = range.getValues();
  const headerMap = getHeaderMap(sheet);
  const descriptionColIndex = findColumnIndex(headerMap, 'description');
  
  const expenses = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    
    // Role-based filtering
    if (user && user.role === 'Vendor' && descriptionColIndex !== -1) {
      const description = row[descriptionColIndex] || '';
      const match = description.match(/from (\w+)$/);
      const vendorIdInDesc = match ? match[1] : null;

      // A vendor should only see expenses where their ID is explicitly in the description.
      // General expenses (without a vendor ID) are not shown to vendors.
      if (vendorIdInDesc !== user.id) {
          continue;
      }
    }
    
    const rowData = {};
    let hasData = false;
    for (const [key, index] of headerMap.entries()) {
      rowData[key] = row[index];
      if (row[index]) hasData = true;
    }
    if (!hasData) continue;
    expenses.push({ row: i + 1, ...rowData });
  }
  return { status: 'success', data: expenses };
}

function appendExpense({ expenseData }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PAYMENTS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${PAYMENTS_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  
  const amount = parseFloat(expenseData.amount) || 0;
  const commission = parseFloat(expenseData.commission) || 0;

  const fullItemData = {
    ...expenseData,
    expenseId: `EXP-${Date.now()}`,
    date: expenseData.date || new Date(),
    status: expenseData.status || 'Requested',
    amount: amount,
    commission: commission,
    totalAmount: amount + commission,
  };

  const newRow = Array(sheet.getLastColumn()).fill('');
  for (const [key, colIndex] of headerMap.entries()) {
     if (fullItemData[key] !== undefined && fullItemData[key] !== null) {
       newRow[colIndex] = fullItemData[key];
     }
  }
  
  sheet.appendRow(newRow);
  return { status: 'success', message: 'Expense added.' };
}

function updateExpense({ row, expenseData }) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PAYMENTS_SHEET_NAME);
    if (!sheet) throw new Error(`Sheet not found: ${PAYMENTS_SHEET_NAME}`);

    const headerMap = getHeaderMap(sheet);
    const existingRowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    const mergedData = {};
    for (const [key, index] of headerMap.entries()) {
        mergedData[key] = existingRowValues[index];
    }
    Object.assign(mergedData, expenseData);

    const amount = parseFloat(mergedData.amount) || 0;
    const commission = parseFloat(mergedData.commission) || 0;
    mergedData.totalAmount = amount + commission;

    const newRow = Array(sheet.getLastColumn()).fill('');
    for (const [key, colIndex] of headerMap.entries()) {
        if (mergedData[key] !== undefined && mergedData[key] !== null) {
            newRow[colIndex] = mergedData[key];
        }
    }

    sheet.getRange(row, 1, 1, newRow.length).setValues([newRow]);

    // If the expense is marked as 'Paid' and is linked to inventory items, update them.
    if (expenseData.status === 'Paid' && mergedData.inventoryItemRows) {
        try {
            const inventorySheet = ss.getSheetByName(INVENTORY_SHEET_NAME);
            if (inventorySheet) {
                const inventoryHeaderMap = getHeaderMap(inventorySheet);
                const payDateCol = findColumnIndex(inventoryHeaderMap, 'payDate');
                if (payDateCol !== -1) {
                    const itemRows = String(mergedData.inventoryItemRows).split(',').map(r => parseInt(r.trim(), 10));
                    const paymentDate = new Date(mergedData.paymentDate || new Date());
                    
                    itemRows.forEach(itemRow => {
                        if (!isNaN(itemRow) && itemRow > 1) {
                            inventorySheet.getRange(itemRow, payDateCol + 1).setValue(paymentDate);
                        }
                    });
                }
            }
        } catch (e) {
            console.error(`Error during linked inventory update for expense row ${row}: ${e.toString()}`);
            // Log the error but don't fail the entire operation, as the primary expense update succeeded.
        }
    }

    return { status: 'success', message: `Expense in row ${row} updated.` };
}


function deleteExpense({ row }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PAYMENTS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${PAYMENTS_SHEET_NAME}`);

  sheet.deleteRow(row);
  return { status: 'success', message: `Expense in row ${row} deleted.` };
}

// ==============================================================================
//  WITHDRAWALS ('Withdrawals' SHEET) FUNCTIONS
// ==============================================================================

function getWithdrawals() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WITHDRAWALS_SHEET_NAME);
  if (!sheet) { // Create sheet if it doesn't exist
    const newSheet = ss.insertSheet(WITHDRAWALS_SHEET_NAME);
    newSheet.appendRow(['ID', 'Date', 'Amount', 'Commission', 'ExchangeRate', 'Destination', 'Notes', 'TotalUSD']);
    return { status: 'success', data: [] };
  }

  const range = sheet.getDataRange();
  const values = range.getValues();
  const headerMap = getHeaderMap(sheet);
  
  const withdrawals = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowData = {};
    let hasData = false;
    for (const [key, index] of headerMap.entries()) {
      rowData[key] = row[index];
      if (row[index]) hasData = true;
    }
    if (!hasData) continue;
    withdrawals.push({ row: i + 1, ...rowData });
  }
  return { status: 'success', data: withdrawals };
}

function appendWithdrawal({ withdrawalData }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WITHDRAWALS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${WITHDRAWALS_SHEET_NAME}`);

  const headerMap = getHeaderMap(sheet);
  
  const amount = parseFloat(withdrawalData.amount) || 0;
  const commission = parseFloat(withdrawalData.commission) || 0;
  const exchangeRate = parseFloat(withdrawalData.exchangeRate) || 1;
  const totalUsd = exchangeRate > 0 ? (amount + commission) / exchangeRate : 0;

  const fullData = {
    ...withdrawalData,
    id: `WDL-${Date.now()}`,
    date: withdrawalData.date || new Date(),
    amount,
    commission,
    exchangeRate,
    totalUsd,
  };

  const newRow = Array(sheet.getLastColumn()).fill('');
  for (const [key, colIndex] of headerMap.entries()) {
     if (fullData[key] !== undefined && fullData[key] !== null) {
       newRow[colIndex] = fullData[key];
     }
  }
  
  sheet.appendRow(newRow);
  return { status: 'success', message: 'Withdrawal added.' };
}

function updateWithdrawal({ row, withdrawalData }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WITHDRAWALS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${WITHDRAWALS_SHEET_NAME}`);
  
  const headerMap = getHeaderMap(sheet);
  const existingRowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const mergedData = {};
  for(const [key, index] of headerMap.entries()) {
    mergedData[key] = existingRowValues[index];
  }
  Object.assign(mergedData, withdrawalData);

  const amount = parseFloat(mergedData.amount) || 0;
  const commission = parseFloat(mergedData.commission) || 0;
  const exchangeRate = parseFloat(mergedData.exchangeRate) || 1;
  mergedData.totalUsd = exchangeRate > 0 ? (amount + commission) / exchangeRate : 0;
  
  const newRow = Array(sheet.getLastColumn()).fill('');
  for (const [key, colIndex] of headerMap.entries()) {
    if (mergedData[key] !== undefined && mergedData[key] !== null) {
      newRow[colIndex] = mergedData[key];
    }
  }

  sheet.getRange(row, 1, 1, newRow.length).setValues([newRow]);
  return { status: 'success', message: `Withdrawal in row ${row} updated.` };
}

function deleteWithdrawal({ row }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WITHDRAWALS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${WITHDRAWALS_SHEET_NAME}`);

  sheet.deleteRow(row);
  return { status: 'success', message: `Withdrawal in row ${row} deleted.` };
}


// ==============================================================================
//  RECURRING EXPENSES ('Recurring' SHEET) FUNCTIONS
// ==============================================================================

function getRecurringExpenses() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(RECURRING_SHEET_NAME);
  if (!sheet) return { status: 'success', data: [] }; // Don't error if sheet doesn't exist yet

  const range = sheet.getDataRange();
  const values = range.getValues();
  const headerMap = getHeaderMap(sheet);
  
  const expenses = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowData = {};
    for (const [key, index] of headerMap.entries()) {
      rowData[key] = row[index];
    }
    if (Object.values(rowData).some(v => v)) { // Ensure row is not empty
       expenses.push({ row: i + 1, ...rowData });
    }
  }
  return { status: 'success', data: expenses };
}

function appendRecurringExpense({ expenseData }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(RECURRING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(RECURRING_SHEET_NAME);
    sheet.appendRow(['ID', 'Description', 'Amount', 'DayOfMonth', 'Destination']);
  }

  const headerMap = getHeaderMap(sheet);
  const fullData = { ...expenseData, id: `REC-${Date.now()}` };

  const newRow = Array(sheet.getLastColumn()).fill('');
  for (const [key, colIndex] of headerMap.entries()) {
     if (fullData[key] !== undefined) newRow[colIndex] = fullData[key];
  }
  sheet.appendRow(newRow);
  return { status: 'success', message: 'Recurring expense added.' };
}

function updateRecurringExpense({ row, expenseData }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(RECURRING_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${RECURRING_SHEET_NAME}`);
  
  const headerMap = getHeaderMap(sheet);
  const newRow = Array(sheet.getLastColumn()).fill('');
  for (const [key, colIndex] of headerMap.entries()) {
    if (expenseData[key] !== undefined) newRow[colIndex] = expenseData[key];
  }
  sheet.getRange(row, 1, 1, newRow.length).setValues([newRow]);
  return { status: 'success', message: `Recurring expense in row ${row} updated.` };
}

function deleteRecurringExpense({ row }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(RECURRING_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${RECURRING_SHEET_NAME}`);
  sheet.deleteRow(row);
  return { status: 'success', message: `Recurring expense in row ${row} deleted.` };
}

// ==============================================================================
//  INVOICES ('Invoices' SHEET) FUNCTIONS
// ==============================================================================

function getInvoices() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVOICES_SHEET_NAME);
    if (!sheet) return { status: 'success', data: [] };

    const range = sheet.getDataRange();
    const values = range.getValues();
    const headerMap = getHeaderMap(sheet);
    const paymentsCol = findColumnIndex(headerMap, 'payments');

    const invoices = [];
    for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const rowData = {};
        for (const [key, index] of headerMap.entries()) {
            if (key === 'payments' && row[index]) {
                try {
                    rowData[key] = JSON.parse(row[index]);
                } catch (e) {
                    rowData[key] = []; // If JSON is malformed, default to empty array
                }
            } else {
                rowData[key] = row[index];
            }
        }
        if (Object.values(rowData).some(v => v)) {
            invoices.push({ row: i + 1, ...rowData });
        }
    }
    return { status: 'success', data: invoices };
}

function appendInvoice({ invoiceData }) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(INVOICES_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(INVOICES_SHEET_NAME);
        sheet.appendRow(['ID', 'VendorID', 'ClientID', 'Amount', 'DueDate', 'Status', 'Payments']);
    }

    const headerMap = getHeaderMap(sheet);
    const fullData = {
        ...invoiceData,
        id: `INV-${Date.now()}`,
        payments: JSON.stringify(invoiceData.payments || []),
    };

    const newRow = Array(sheet.getLastColumn()).fill('');
    for (const [key, colIndex] of headerMap.entries()) {
        if (fullData[key] !== undefined) newRow[colIndex] = fullData[key];
    }
    sheet.appendRow(newRow);
    return { status: 'success', message: 'Invoice added.' };
}

function addPaymentToInvoice({ row, paymentData }) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVOICES_SHEET_NAME);
    if (!sheet) throw new Error(`Sheet not found: ${INVOICES_SHEET_NAME}`);

    const headerMap = getHeaderMap(sheet);
    const paymentsCol = findColumnIndex(headerMap, 'payments');
    if (paymentsCol === -1) throw new Error("Column 'Payments' not found in Invoices sheet.");

    const range = sheet.getRange(row, paymentsCol + 1);
    const existingPaymentsStr = range.getValue() || '[]';
    let payments = [];
    try {
        payments = JSON.parse(existingPaymentsStr);
    } catch (e) { /* ignore malformed JSON */ }
    
    payments.push({ ...paymentData, id: `PAY-${Date.now()}` });
    range.setValue(JSON.stringify(payments));

    return { status: 'success', message: 'Payment added to invoice.' };
}

// ==============================================================================
//  SHIPPING ('Shipping' SHEET) FUNCTIONS
// ==============================================================================

/**
 * Appends shipment manifest data to the 'Shipping' sheet.
 * @param {object} requestData - The request data.
 * @param {object[]} requestData.shipments - An array of shipment objects.
 * @returns {object} A success message.
 */
function appendShippingData({ shipments }) {
  if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
    throw new Error('No shipment data provided.');
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHIPPING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHIPPING_SHEET_NAME);
    sheet.appendRow(['CrateOrPallet', 'crateID', 'vendors', 'crateLenght', 'crateWidth', 'crateHeight', 'crateWeight', 'truckID', 'truckPosition', 'shipDate']);
  }

  const headerMap = getHeaderMap(sheet);
  
  const newRows = shipments.map(shipment => {
    const newRow = Array(sheet.getLastColumn()).fill('');
    const shipmentKeysLower = Object.keys(shipment).reduce((acc, key) => {
        acc[key.toLowerCase()] = shipment[key];
        return acc;
    }, {});

    for (const [headerKey, colIndex] of headerMap.entries()) {
        const value = shipmentKeysLower[headerKey.toLowerCase()];
        if (value !== undefined && value !== null) {
            newRow[colIndex] = Array.isArray(value) ? value.join(', ') : value;
        }
    }
    return newRow;
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  return { status: 'success', message: `${newRows.length} shipments recorded.` };
}

// ==============================================================================
//  CRATES ('Crates' SHEET) FUNCTIONS
// ==============================================================================

function getCrates() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CRATES_SHEET_NAME);
  if (!sheet) return { status: 'success', data: [] }; // Don't error if it doesn't exist yet

  const range = sheet.getDataRange();
  const values = range.getValues();
  const headerMap = getHeaderMap(sheet);
  
  const crates = [];
  for (let i = 1; i < values.length; i++) { // Start at 1 to skip header
    const row = values[i];
    const rowData = {};
    let hasData = false;

    for (const [key, index] of headerMap.entries()) {
      const cellValue = row[index];
      if (key === 'inventoryItems') {
         try {
           rowData[key] = cellValue ? JSON.parse(cellValue) : [];
         } catch (e) {
           console.error(`Error parsing inventoryItems for row ${i + 1}: ${e}`);
           rowData[key] = [];
         }
      } else if (['weight', 'baseWeight', 'w', 'h', 'd', 'x', 'y', 'z'].includes(key)) {
          // Force conversion to number. parseFloat is safer than Number() as it ignores trailing non-numeric characters.
          const num = parseFloat(cellValue);
          rowData[key] = isNaN(num) ? 0 : num;
      } else {
         rowData[key] = cellValue;
      }
      if (cellValue || cellValue === 0) { // check for 0 as a valid value
        hasData = true;
      }
    }
    if (!hasData) continue; // Skip entirely empty rows
    crates.push(rowData);
  }
  return { status: 'success', data: crates };
}

function batchUpdateCrates({ crates }) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CRATES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CRATES_SHEET_NAME);
    // Define headers for the new sheet. This should match the Crate interface keys.
    sheet.appendRow(['id', 'desc', 'weight', 'baseWeight', 'w', 'h', 'd', 'x', 'y', 'z', 'inventoryItems', 'location', 'vendorId']);
  }
  
  const headerMap = getHeaderMap(sheet);
  const numColumns = sheet.getLastColumn();

  const newRows = crates.map(crate => {
    const newRow = Array(numColumns).fill('');
    for (const [key, colIndex] of headerMap.entries()) {
      if (crate[key] !== undefined && crate[key] !== null) {
         if (key === 'inventoryItems') {
            newRow[colIndex] = JSON.stringify(crate[key]);
         } else {
            newRow[colIndex] = crate[key];
         }
      }
    }
    return newRow;
  });

  // Clear existing data (except header)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, numColumns).clearContent();
  }

  // Write new data if there is any
  if (newRows.length > 0) {
    sheet.getRange(2, 1, newRows.length, numColumns).setValues(newRows);
  }

  return { status: 'success', message: `${crates.length} crates saved.` };
}

/**
 * Endpoint for uploading standalone media (images/videos) to a unified folder.
 * Returns the Drive ID and public URL.
 * @param {object} requestData - The request data.
 * @param {string} requestData.fileName - The name for the file.
 * @param {string} requestData.mimeType - The MIME type of the file.
 * @param {string} requestData.base64 - The base64 encoded file content.
 * @returns {object} A success object with fileId and url.
 */
function uploadMedia({ fileName, mimeType, base64 }) {
  try {
    const rootFolder = DriveApp.getFolderById(IMAGE_UPLOAD_FOLDER_ID);
    const uploadsFolder = getOrCreateSubfolder(rootFolder, 'GlobalUploads');
    
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
    const file = uploadsFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { 
      status: 'success', 
      fileId: file.getId(), 
      url: `https://drive.google.com/uc?export=view&id=${file.getId()}` 
    };
  } catch (error) {
    console.error('uploadMedia Error:', error.toString());
    throw error;
  }
}