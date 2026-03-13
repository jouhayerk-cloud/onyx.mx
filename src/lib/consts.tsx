

export const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzSFfy3OWzPpSnqdFH8QFmDswwjtwj8-GxFIkXtK-_zHCn8vBtT4AVbuEkYZtSElsIUUw/exec';

export const colors = [
  'rgb(0, 0, 0)',
  'rgb(255, 255, 255)',
  'rgb(213, 40, 40)',
  'rgb(250, 123, 23)',
  'rgb(240, 186, 17)',
  'rgb(8, 161, 72)',
  'rgb(26, 115, 232)',
  'rgb(161, 66, 244)',
];

export const vendors = {

  R: { color: '#737104' }, // Ramses
  M: { color: '#4f2068' }, // Martha

  W: { color: '#e67e22' }, // Wayne
  C: { color: '#d35400' }, // Chad

  JM: { color: '#6BCEBB' },
  EM: { color: '#00AEEF' },
  CA: { color: '#85C1E9' },
  AN: { color: '#FFED00' },
  SU: { color: '#B19CD9' },
  TE: { color: '#FFCB05' },
  DH: { color: '#8DC63F' },
  ML: { color: '#F9A17A' },
  GE: { color: '#F7941D' },
  FR: { color: '#F36F21' },
  ET: { color: '#636466' },
  AM: { color: '#800020' },
  BT: { color: '#603913' },
  RF: { color: '#00A591' },
  GS: { color: '#D11C7E' },
  CP: { color: '#A01E5D' },
};

export const appUsers = {
  R: { name: 'RAMSES', role: 'Admin' as const, pin: '77553', email: 'ramses@jouhayerk.com' },
};

export type WorkbookTabId = 'inventory' | 'archive' | 'finance' | 'production' | 'logistics' | 'database';
export const WORKBOOK_TABS: { id: WorkbookTabId; label: string; color: string; version?: string; roles: string[] }[] = [
  { id: 'inventory', label: 'WORKBOOK 326', color: '#6BCEBB', version: '326', roles: ['Developer', 'Admin', 'Vendor'] },
  { id: 'archive', label: 'ARCHIVE 825', color: '#a9d08e', version: '825', roles: ['Developer', 'Admin', 'Client'] },
  { id: 'finance', label: 'FINANCE', color: '#00AEEF', version: '326', roles: ['Developer', 'Admin'] },
  { id: 'production', label: 'PRODUCTION', color: '#FFED00', version: '326', roles: ['Developer', 'Admin', 'Vendor'] },
  { id: 'logistics', label: 'LOGISTICS', color: '#8DC63F', version: '326', roles: ['Developer', 'Admin', 'Client'] },
  { id: 'database', label: 'DATABASE', color: '#AEE6F5', version: '326', roles: ['Developer'] },
];

function hexToRgb(hex: string) {
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  return [r, g, b];
}

export const segmentationColors = [
  '#E6194B',
  '#3C89D0',
  '#3CB44B',
  '#FFE119',
  '#911EB4',
  '#42D4F4',
  '#F58231',
  '#F032E6',
  '#BFEF45',
  '#469990',
];
export const segmentationColorsRgb = segmentationColors.map((c) => hexToRgb(c));

export const lineOptions = {
  size: 8,
  thinning: 0,
  smoothing: 0,
  streamline: 0,
  simulatePressure: false,
};

export const defaultPromptParts = {
  '2D bounding boxes': [
    'Detect',
    'items',
    ', with no more than 20 items. Output a json list where each entry contains the 2D bounding box in "box_2d" and a text label in "label".',
  ],
  'Segmentation masks': [
    `Give the segmentation masks for`,
    'all objects',
    `. Output a JSON list of segmentation masks where each entry contains the 2D bounding box in the key "box_2d", the segmentation mask in key "mask", and the text label in the key "label". Use descriptive labels.`,
  ],
  '3D bounding boxes': [
    'Output in json. Detect the 3D atextrabounding boxes of ',
    'items',
    ', output no more than 10 items. Return a list where each entry contains the object name in "label" and its 3D bounding box in "box_3d".',
  ],
  Points: [
    'Point to the',
    'items',
    ' with no more than 10 items. The answer should follow the json format: [{"point": <point>, "label": <label1>}, ...]. The points are in [y, x] format normalized to 0-1000.',
  ],
};

export const defaultPrompts = {
  '2D bounding boxes': defaultPromptParts['2D bounding boxes'].join(' '),
  '3D bounding boxes': defaultPromptParts['3D bounding boxes'].join(' '),
  'Segmentation masks': defaultPromptParts['Segmentation masks'].join(''),
  Points: defaultPromptParts.Points.join(' '),
};

const safetyLevel = 'only_high';

export const safetySettings = new Map();

safetySettings.set('harassment', safetyLevel);
safetySettings.set('hate_speech', safetyLevel);
safetySettings.set('sexually_explicit', safetyLevel);
safetySettings.set('dangerous_content', safetyLevel);
safetySettings.set('civic_integrity', safetyLevel);

export const imageOptions = [
  'https://storage.googleapis.com/maker-suite-media/L-vision/creative/image-analysis-1.jpg',
  'https://storage.googleapis.com/maker-suite-media/L-vision/creative/image-analysis-2.jpg',
  'https://storage.googleapis.com/maker-suite-media/L-vision/creative/image-analysis-3.jpg',
  'https://storage.googleapis.com/maker-suite-media/L-vision/creative/image-analysis-4.jpg',
  'https://storage.googleapis.com/maker-suite-media/L-vision/creative/image-analysis-5.jpg',
  'https://storage.googleapis.com/maker-suite-media/L-vision/creative/image-analysis-6.jpg',
];