import re

clean_func = r'''/**
 * Builds deterministic identification / invoice title according to Book 826 per-family templates.
 * Pure function: assembled purely from record fields (color, material, shape, type, top flag, dimensions).
 */
export function buildInvoiceTitle826(item: any): string {
  const rawType = String(item.type || item.short_description || item.shortDescription || '');
  const rawShape = String(item.shape || '');
  const entry = getOnyx826Entry(rawType, rawShape);
  const family = entry?.family ?? 'lamps';

  const color = String(item.vendorColor || item.color || 'Onyx').trim();
  const material = String(item.material || 'Onyx').trim();

  // Map shape variants (Squared -> Square, Cylindrical -> Cylinder)
  let normShape = rawShape.trim();
  if (/^squared$/i.test(normShape)) normShape = 'Square';
  else if (/^cylindrical$/i.test(normShape)) normShape = 'Cylinder';
  else if (/^round$/i.test(normShape)) normShape = 'Round';
  else if (/^rectangular$/i.test(normShape)) normShape = 'Rectangular';

  // Normalized noun
  let typeNoun = entry?.labelEN ?? (rawType.trim() || 'Luminary');
  if (/tower\s*lamp/i.test(typeNoun)) typeNoun = 'Floor Lamp';

  // Top flag
  const topVal = String(item.top || item.data?.top || '').trim().toLowerCase();
  const topStr = topVal === 'open' ? 'Open Top'
    : topVal === 'closed' ? 'Closed Top'
      : (needsTopFlag(rawType, rawShape) ? '[Top: confirm]' : '');

  // Dimensions
  const w = item.widthCm ?? item.width_cm;
  const h = item.heightCm ?? item.height_cm;
  const l = item.lengthCm ?? item.length_cm;
  let sizeStr = '';
  if (w && h) {
    if (!l || Number(w) === Number(l)) {
      sizeStr = `${w} x ${h}`;
    } else {
      sizeStr = `${w} x ${l} x ${h}`;
    }
  } else if (w && l && h) {
    sizeStr = `${w} x ${l} x ${h}`;
  }

  switch (family) {
    case 'lamps': {
      const parts = [
        color,
        material !== color ? material : '',
        normShape,
        typeNoun,
      ].filter(Boolean).join(' ');
      const meta = [topStr, sizeStr ? `${sizeStr} cm` : ''].filter(Boolean).join(', ');
      return meta ? `${parts}, ${meta}` : parts;
    }
    case 'vessels': {
      let label = typeNoun;
      if (/canoe/i.test(rawType) || /canoe/i.test(rawShape)) label = 'Canoe Tray';
      const parts = [
        color,
        material !== color ? material : '',
        normShape && normShape !== 'Regular' && !label.includes(normShape) ? normShape : '',
        label,
      ].filter(Boolean).join(' ');
      const meta = [topStr, sizeStr ? `${sizeStr} cm` : ''].filter(Boolean).join(', ');
      return meta ? `${parts}, ${meta}` : parts;
    }
    case 'panels-mirrors': {
      if (/painted/i.test(rawType) || entry?.id === 'painted-wall-panel') {
        const subject = normShape || 'Scene';
        const parts = `Painted ${color} ${material} Wall Panel, ${subject}`;
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/mirror/i.test(rawType) || entry?.id === 'mirror') {
        const parts = [color, material !== color ? material : '', normShape, 'Mirror'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      const isPair = /pair/i.test(rawType) || /pair/i.test(normShape);
      const panelNoun = isPair ? 'Wall Panel Pair' : 'Wall Panel';
      const parts = [color, material !== color ? material : '', normShape, panelNoun].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm${isPair ? ' (each)' : ''}` : parts;
    }
    case 'rocks-fountains-sculpture': {
      if (/fountain/i.test(rawType) || /fountain/i.test(rawShape)) {
        const parts = [color, material !== color ? material : '', 'Fountain'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/sculpture/i.test(rawType)) {
        const subject = normShape || 'Sculpture';
        const parts = [color, material !== color ? material : '', subject, 'Sculpture'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/pillar/i.test(rawType)) {
        const parts = [color, material !== color ? material : '', 'Pillar'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/ball/i.test(rawType) || /sphere/i.test(rawType)) {
        const parts = [color, material !== color ? material : '', 'Sphere'].filter(Boolean).join(' ');
        return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
      }
      if (/bag|pebble/i.test(rawType)) {
        return [color, material !== color ? material : '', 'Pebble Stones Bag'].filter(Boolean).join(' ');
      }
      const parts = [color, material !== color ? material : '', 'Natural Rock'].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
    case 'furniture': {
      const tableNoun = /coffee/i.test(rawType) ? 'Coffee Table' : typeNoun;
      const parts = [color, material !== color ? material : '', normShape, tableNoun].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
    case 'wine': {
      const parts = [color, material !== color ? material : '', normShape, 'Wine Rack'].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
    case 'small-items': {
      const parts = [color, material !== color ? material : '', normShape, typeNoun].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
    default: {
      const parts = [color, material !== color ? material : '', normShape, typeNoun].filter(Boolean).join(' ');
      return sizeStr ? `${parts}, ${sizeStr} cm` : parts;
    }
  }
}
'''

path = r'c:\Jouhayerk\git\app\src\lib\taxonomy\onyx826.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

pattern = r'/\*\*\s*\*\s*Builds deterministic identification / invoice title according to Book 826 per-family templates\..*'
match = re.search(pattern, text, re.DOTALL)
if match:
    text = text[:match.start()] + clean_func
else:
    text = text + '\n\n' + clean_func

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated onyx826.ts with clean_func successfully!')
