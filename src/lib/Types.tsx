/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
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

export type DetectTypes =
  | '2D bounding boxes'
  | 'Segmentation masks'
  | '3D bounding boxes'
  | 'Points';

export type BoundingBox2DType = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

export type BoundingBoxMaskType = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  path: string;
  maskWidth: number;
  maskHeight: number;
  points?: { x: number; y: number }[];
};

export type BoundingBox3DType = {
  center: [number, number, number];
  size: [number, number, number];
  rpy: [number, number, number];
  label: string;
};

export type PointingType = {
  point: {
    x: number;
    y: number;
  };
  label: string;
};

export interface InventoryItemData {
  rowId?: string;
  timestamp?: string;
  itemId: string;
  itemNumber: string;
  name?: string;
  category?: string;
  vendorId?: string;
  createdBy?: string;
  status?: string;
  shape: string;
  material: string;
  description: string;
  color: string;
  quantity: string;
  price: string;
  weightKg: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
  expires: string;
  mediaUrls?: string;
  shortDescription?: string;
  generatedDescription?: string;
  detailedDescription?: string;
  generatedImageUrls?: string;
  image_urls?: string[];
  drive_ids?: string[];
  generatedPngUrl?: string;
  generatedSvgUrl?: string;
  spatialBoxes2d?: string;
  spatialPoints?: string;
  spatialMasks?: string;
  spatialBoxes3d?: string;
  isClientVisible?: string | boolean;
  printDate?: string;
  payDate?: string;
  payReq?: string;
  sentDate?: string;
  bookLanded?: string;
  bookRetail?: string;
  bookBardcode?: string;
  bookAqCode?: string;
  box_land_code?: string;
  crate_id?: string;
  workbook?: string;
  dispersal_status?: 'Requested' | 'Sent' | 'Dispersed';
  bank_account?: string;
  acquired_by?: string;
  acquired_at?: string;
  sent_at?: string;
  dispersed_at?: string;
  requested_by?: string;
}

export interface InventoryItem {
  row: number | string;
  label: string;
  imageUrl: string | null;
  data: InventoryItemData;
}

export type UploadedFile = {
  type: 'image' | 'video';
  dataUrl?: string;
  localUrl?: string;
  originalFile?: File;
  name?: string;
};

export enum PaymentDestination {
  BoA_Employee = "Bank of America Employee",
  BBVA_Martha = "BBVA Martha",
  BBVA_Ramses = "BBVA Ramses",
  Fast_Cash_Wire = "Fast Cash Wire",
}

export enum ExpenseStatus {
  Requested = "Requested",
  Paid = "Paid",
}

export interface Withdrawal {
  row: number;
  id: string;
  amount: number; // in MXN
  commission: number; // in MXN
  exchangeRate: number;
  date: string;
  destination: PaymentDestination;
  notes?: string;
  totalUsd?: number; // Calculated field: (amount + commission) / exchangeRate
}

export interface Expense {
  row: number;
  id: string;
  vendorId?: string; // Vendor ID
  date: string; // Creation Date
  description: string;
  amount: number;
  destination: PaymentDestination;
  commission?: number;
  totalAmount: number;
  status: ExpenseStatus;
  paymentDate?: string;
  notes?: string;
  inventoryItemRows?: string; // Comma-separated list of inventory row numbers
}

export interface RecurringExpense {
  row: number;
  id: string;
  description: string;
  amount: number;
  dayOfMonth: number;
  destination: PaymentDestination;
}

// ─── Finance & Logistics (Supabase-backed) ──────────────────────────

export type FinanceSubcategory = 'Acquisition' | 'Monthly Expense' | 'Supplies' | 'Labor' | 'Crate/Pallet' | 'Operating';

export interface FinanceRecord {
  id: string;
  date?: string;
  type?: string;
  category?: string;
  subcategory?: FinanceSubcategory;
  description?: string;
  amount?: number;
  commission?: number;
  currency?: string;
  bank_account?: string;
  payment_method?: string;
  pay_date?: string;
  reference?: string;
  exchange_rate?: number;
  status?: string;
  requested_by?: string;
  approved_by?: string;
  sent_at?: string;
  dispersed_at?: string;
  destination?: string;
  vendor_id?: string;
  related_ids?: string[];
  related_inventory_ids?: string;
  notes?: string;
  recurring?: boolean;
  recurring_day?: number;
  updated_at?: string;
}

export interface LogisticsRecord {
  id: string;
  type?: string;
  vendors?: string;
  vendor_id?: string;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  weight_kg?: number;
  truck_id?: string;
  truck_position?: string;
  ship_date?: string;
  status?: string;
  origin?: string;
  destination_address?: string;
  contents_summary?: string;
  insurance_value?: number;
  customs_status?: string;
  pallet_count?: number;
  crate_count?: number;
  freight_cost?: number;
  description?: string;
  tracking_number?: string;
  carrier?: string;
  inventory_ids?: string;
  quantity?: number;
  cost_mxn?: number;
  date?: string;
  updated_at?: string;
}

export type PaymentType = 'Wire Transfer' | 'Cash Advance' | 'Cash' | 'Wire' | 'Direct USA Wire';

export interface Payment {
  id: string;
  amount: number;
  date: string;
  type: PaymentType;
  confirmation?: string;
}

export interface Invoice {
  row: number;
  id: string;
  vendorId: string;
  clientId: string;
  amount: number;
  dueDate: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  payments: Payment[];
}
// FIX: Moved CameraView and Crate types from atoms.tsx to resolve circular dependency issues.
export type CameraView = 'perspective' | 'top' | 'side' | 'front';

// New type for simplified item info stored in crates to reduce payload size
export interface PackedItem {
  row: number | string;
  itemId: string;
  itemNumber: string;
  shape: string;
  material: string;
  weightKg: string;
  bookBardcode?: string;
  bookAqCode?: string;
  bookLandCode?: string;
  price?: string;
  widthCm?: string;
  heightCm?: string;
  lengthCm?: string;
  color?: string;
}

export interface Crate {
  id: string;
  desc: string;
  weight: number; // Gross weight (base + items)
  baseWeight: number; // Tare weight of the empty crate
  w: number; h: number; d: number;
  x: number; y: number; z: number;
  inventoryItems: PackedItem[];
  location: 'warehouse' | 'truck';
  vendorId?: string;
  rotationY?: number; // Add rotation property
}
// Workbook Specific Types
export interface WorkbookPropertiesSheet {
  sheetName: string;
  data: any[];
}

export interface WorkbookTruckSheet {
  sheetName: string;
  truckId: string;
  data: any[];
}
