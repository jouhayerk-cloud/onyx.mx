import * as XLSX from 'xlsx';
import * as fs from 'fs';

const filePath = 'c:/Jouhayerk/git/app/public/ML 012026 4C.xlsx';
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('Headers:', data[0]);
if (data.length > 1) {
    console.log('Sample Data:', data[1]);
}
