export interface ArchiveBook {
  id: string;
  season: string;
  source_file: string;
  sha256: string;
  sheet_count: number;
  complete: boolean;
  imported_at: string;
  imported_by: string | null;
}

export interface ArchiveItem {
  id: string;
  book_id: string;
  vendor: string;
  sheet: string;
  src_row: number;
  item_number: string | null;
  tag_id: string | null;
  item_date: string | null;
  description: string | null;
  color: string | null;
  shape: string | null;
  quantity: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  attrs: Record<string, any>;
  raw: Record<string, any>;
}

export interface ArchiveFinance {
  item_id: string;
  price_mxn: number | null;
  total_pesos: number | null;
  aq: number | null;
  lnd: number | null;
  retail: number | null;
  total_usd: number | null;
  aqc: number | null;
  lc: number | null;
  sqm_price: number | null;
  aq_round: number | null;
  lnd_round: number | null;
  desc_price: number | null;
}
