// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Produced from the live Supabase schema of project yircifkayqpuydfdqzlm.
// Regenerate whenever the schema changes; do not patch it, and do not add
// application types here. The value of this file is that it can be thrown away
// and reproduced, which is exactly what src/lib/Types.tsx could not do.
//
// Regenerate with the Supabase MCP `generate_typescript_types`, or:
//   npx supabase gen types typescript --project-id yircifkayqpuydfdqzlm
//
// Last generated: 2026-09-07.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          is_active: boolean | null
          last_submit_at: string | null
          notes: string | null
          role: string
          store_enabled: boolean | null
          store_logo: string | null
          total_submits: number | null
          vendor_prefix: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_submit_at?: string | null
          notes?: string | null
          role: string
          store_enabled?: boolean | null
          store_logo?: string | null
          total_submits?: number | null
          vendor_prefix?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_submit_at?: string | null
          notes?: string | null
          role?: string
          store_enabled?: boolean | null
          store_logo?: string | null
          total_submits?: number | null
          vendor_prefix?: string | null
        }
        Relationships: []
      }
      color_normalization_backup_20260906: {
        Row: {
          backed_up_at: string | null
          color_before: string | null
          id: string | null
        }
        Insert: {
          backed_up_at?: string | null
          color_before?: string | null
          id?: string | null
        }
        Update: {
          backed_up_at?: string | null
          color_before?: string | null
          id?: string | null
        }
        Relationships: []
      }
      finance: {
        Row: {
          amount: number | null
          approved_by: string | null
          bank_account: string | null
          category: string | null
          commission: number | null
          currency: string | null
          date: string | null
          description: string | null
          destination: string | null
          dispersed_at: string | null
          exchange_rate: number | null
          id: string
          notes: string | null
          pay_date: string | null
          payment_method: string | null
          recurring: boolean | null
          recurring_day: number | null
          reference: string | null
          related_ids: string[] | null
          related_inventory_ids: string | null
          requested_by: string | null
          sent_at: string | null
          status: string | null
          subcategory: string | null
          type: string | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          amount?: number | null
          approved_by?: string | null
          bank_account?: string | null
          category?: string | null
          commission?: number | null
          currency?: string | null
          date?: string | null
          description?: string | null
          destination?: string | null
          dispersed_at?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          pay_date?: string | null
          payment_method?: string | null
          recurring?: boolean | null
          recurring_day?: number | null
          reference?: string | null
          related_ids?: string[] | null
          related_inventory_ids?: string | null
          requested_by?: string | null
          sent_at?: string | null
          status?: string | null
          subcategory?: string | null
          type?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          amount?: number | null
          approved_by?: string | null
          bank_account?: string | null
          category?: string | null
          commission?: number | null
          currency?: string | null
          date?: string | null
          description?: string | null
          destination?: string | null
          dispersed_at?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          pay_date?: string | null
          payment_method?: string | null
          recurring?: boolean | null
          recurring_day?: number | null
          reference?: string | null
          related_ids?: string[] | null
          related_inventory_ids?: string | null
          requested_by?: string | null
          sent_at?: string | null
          status?: string | null
          subcategory?: string | null
          type?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: []
      }
      finance_826: {
        Row: {
          amount: number
          approved_by: string | null
          bank_account: string | null
          category: string | null
          commission: number | null
          created_at: string | null
          currency: string | null
          date: string | null
          description: string | null
          destination: string | null
          dispersed_at: string | null
          exchange_rate: number | null
          id: string
          notes: string | null
          pay_date: string | null
          payment_method: string | null
          recurring: boolean | null
          recurring_day: number | null
          reference: string | null
          related_ids: string[] | null
          related_inventory_ids: string | null
          requested_by: string | null
          sent_at: string | null
          status: string | null
          subcategory: string | null
          type: string
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          amount: number
          approved_by?: string | null
          bank_account?: string | null
          category?: string | null
          commission?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          description?: string | null
          destination?: string | null
          dispersed_at?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          pay_date?: string | null
          payment_method?: string | null
          recurring?: boolean | null
          recurring_day?: number | null
          reference?: string | null
          related_ids?: string[] | null
          related_inventory_ids?: string | null
          requested_by?: string | null
          sent_at?: string | null
          status?: string | null
          subcategory?: string | null
          type: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          approved_by?: string | null
          bank_account?: string | null
          category?: string | null
          commission?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          description?: string | null
          destination?: string | null
          dispersed_at?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          pay_date?: string | null
          payment_method?: string | null
          recurring?: boolean | null
          recurring_day?: number | null
          reference?: string | null
          related_ids?: string[] | null
          related_inventory_ids?: string | null
          requested_by?: string | null
          sent_at?: string | null
          status?: string | null
          subcategory?: string | null
          type?: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          acquired_at: string | null
          acquired_by: string | null
          book_acquisition: number | null
          book_aq_code: string | null
          book_barcode: string | null
          book_land_code: string | null
          book_landed: number | null
          book_retail: number | null
          color: string | null
          crate_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          detailed_description: string | null
          expires: string | null
          generated_color: string | null
          generated_description: string | null
          generated_image_urls: string | null
          generated_png_url: string | null
          generated_svg_url: string | null
          generated_type: string | null
          height_cm: number | null
          hidden_reason: string | null
          id: string
          invoice_id: string | null
          is_client_visible: boolean | null
          is_hidden: boolean | null
          item_id: string | null
          item_number: number | null
          labels_printed_total: number
          length_cm: number | null
          lifecycle_status: string | null
          marked_by: string | null
          material: string | null
          media_urls: string | null
          ocr_raw_text: string | null
          pack_date: string | null
          packing_status: string | null
          pay_date: string | null
          pay_req: string | null
          payment_ids: string | null
          payment_requested_at: string | null
          payment_status: string | null
          price_mxn: number | null
          print_date: string | null
          print_job_checksum: string | null
          print_job_count: number
          print_job_id: string | null
          processed_media_urls: string | null
          quantity: number | null
          rating: number | null
          sent_date: string | null
          sent_manifest_id: string | null
          sent_notes: string | null
          sent_pack: string | null
          shape: string | null
          shipped: boolean | null
          short_description: string | null
          spatial_boxes_2d: Json | null
          spatial_boxes_3d: Json | null
          spatial_masks: Json | null
          spatial_points: Json | null
          status: string | null
          timestamp: string | null
          translation_status: string | null
          updated_at: string | null
          vendor_id: string | null
          vendor_notes: string | null
          weight_kg: number | null
          width_cm: number | null
          workbook: string | null
        }
        Insert: {
          acquired_at?: string | null
          acquired_by?: string | null
          book_acquisition?: number | null
          book_aq_code?: string | null
          book_barcode?: string | null
          book_land_code?: string | null
          book_landed?: number | null
          book_retail?: number | null
          color?: string | null
          crate_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          detailed_description?: string | null
          expires?: string | null
          generated_color?: string | null
          generated_description?: string | null
          generated_image_urls?: string | null
          generated_png_url?: string | null
          generated_svg_url?: string | null
          generated_type?: string | null
          height_cm?: number | null
          hidden_reason?: string | null
          id?: string
          invoice_id?: string | null
          is_client_visible?: boolean | null
          is_hidden?: boolean | null
          item_id?: string | null
          item_number?: number | null
          labels_printed_total?: number
          length_cm?: number | null
          lifecycle_status?: string | null
          marked_by?: string | null
          material?: string | null
          media_urls?: string | null
          ocr_raw_text?: string | null
          pack_date?: string | null
          packing_status?: string | null
          pay_date?: string | null
          pay_req?: string | null
          payment_ids?: string | null
          payment_requested_at?: string | null
          payment_status?: string | null
          price_mxn?: number | null
          print_date?: string | null
          print_job_checksum?: string | null
          print_job_count?: number
          print_job_id?: string | null
          processed_media_urls?: string | null
          quantity?: number | null
          rating?: number | null
          sent_date?: string | null
          sent_manifest_id?: string | null
          sent_notes?: string | null
          sent_pack?: string | null
          shape?: string | null
          shipped?: boolean | null
          short_description?: string | null
          spatial_boxes_2d?: Json | null
          spatial_boxes_3d?: Json | null
          spatial_masks?: Json | null
          spatial_points?: Json | null
          status?: string | null
          timestamp?: string | null
          translation_status?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_notes?: string | null
          weight_kg?: number | null
          width_cm?: number | null
          workbook?: string | null
        }
        Update: {
          acquired_at?: string | null
          acquired_by?: string | null
          book_acquisition?: number | null
          book_aq_code?: string | null
          book_barcode?: string | null
          book_land_code?: string | null
          book_landed?: number | null
          book_retail?: number | null
          color?: string | null
          crate_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          detailed_description?: string | null
          expires?: string | null
          generated_color?: string | null
          generated_description?: string | null
          generated_image_urls?: string | null
          generated_png_url?: string | null
          generated_svg_url?: string | null
          generated_type?: string | null
          height_cm?: number | null
          hidden_reason?: string | null
          id?: string
          invoice_id?: string | null
          is_client_visible?: boolean | null
          is_hidden?: boolean | null
          item_id?: string | null
          item_number?: number | null
          labels_printed_total?: number
          length_cm?: number | null
          lifecycle_status?: string | null
          marked_by?: string | null
          material?: string | null
          media_urls?: string | null
          ocr_raw_text?: string | null
          pack_date?: string | null
          packing_status?: string | null
          pay_date?: string | null
          pay_req?: string | null
          payment_ids?: string | null
          payment_requested_at?: string | null
          payment_status?: string | null
          price_mxn?: number | null
          print_date?: string | null
          print_job_checksum?: string | null
          print_job_count?: number
          print_job_id?: string | null
          processed_media_urls?: string | null
          quantity?: number | null
          rating?: number | null
          sent_date?: string | null
          sent_manifest_id?: string | null
          sent_notes?: string | null
          sent_pack?: string | null
          shape?: string | null
          shipped?: boolean | null
          short_description?: string | null
          spatial_boxes_2d?: Json | null
          spatial_boxes_3d?: Json | null
          spatial_masks?: Json | null
          spatial_points?: Json | null
          status?: string | null
          timestamp?: string | null
          translation_status?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_notes?: string | null
          weight_kg?: number | null
          width_cm?: number | null
          workbook?: string | null
        }
        Relationships: []
      }
      inventory_826: {
        Row: {
          book_acquisition: number | null
          book_aq_code: string | null
          book_barcode: string | null
          book_land_code: string | null
          book_landed: number | null
          book_retail: number | null
          color: string | null
          crate_id: string | null
          created_at: string | null
          detailed_description: string | null
          generated_color: string | null
          generated_type: string | null
          height_cm: number | null
          id: string
          item_id: string
          item_number: number
          length_cm: number | null
          material: Database["public"]["Enums"]["material_type"] | null
          media_urls: Json | null
          ocr_raw_text: string | null
          pay_req: string | null
          price_mxn: number
          quantity: number | null
          shape: Database["public"]["Enums"]["shape_type"] | null
          short_description: string | null
          status: string | null
          translation_status: string | null
          updated_at: string | null
          vendor_id: string
          vendor_notes: string | null
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          book_acquisition?: number | null
          book_aq_code?: string | null
          book_barcode?: string | null
          book_land_code?: string | null
          book_landed?: number | null
          book_retail?: number | null
          color?: string | null
          crate_id?: string | null
          created_at?: string | null
          detailed_description?: string | null
          generated_color?: string | null
          generated_type?: string | null
          height_cm?: number | null
          id?: string
          item_id: string
          item_number: number
          length_cm?: number | null
          material?: Database["public"]["Enums"]["material_type"] | null
          media_urls?: Json | null
          ocr_raw_text?: string | null
          pay_req?: string | null
          price_mxn?: number
          quantity?: number | null
          shape?: Database["public"]["Enums"]["shape_type"] | null
          short_description?: string | null
          status?: string | null
          translation_status?: string | null
          updated_at?: string | null
          vendor_id: string
          vendor_notes?: string | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          book_acquisition?: number | null
          book_aq_code?: string | null
          book_barcode?: string | null
          book_land_code?: string | null
          book_landed?: number | null
          book_retail?: number | null
          color?: string | null
          crate_id?: string | null
          created_at?: string | null
          detailed_description?: string | null
          generated_color?: string | null
          generated_type?: string | null
          height_cm?: number | null
          id?: string
          item_id?: string
          item_number?: number
          length_cm?: number | null
          material?: Database["public"]["Enums"]["material_type"] | null
          media_urls?: Json | null
          ocr_raw_text?: string | null
          pay_req?: string | null
          price_mxn?: number
          quantity?: number | null
          shape?: Database["public"]["Enums"]["shape_type"] | null
          short_description?: string | null
          status?: string | null
          translation_status?: string | null
          updated_at?: string | null
          vendor_id?: string
          vendor_notes?: string | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: []
      }
      logistics: {
        Row: {
          carrier: string | null
          contents_summary: string | null
          cost_mxn: number | null
          crate_count: number | null
          customs_status: string | null
          date: string | null
          description: string | null
          destination_address: string | null
          freight_cost: number | null
          height_cm: number | null
          id: string
          insurance_value: number | null
          inventory_ids: string | null
          length_cm: number | null
          origin: string | null
          pallet_count: number | null
          parent_id: string | null
          quantity: number | null
          ship_date: string | null
          status: string | null
          tracking_number: string | null
          truck_id: string | null
          truck_position: string | null
          type: string | null
          updated_at: string | null
          vendor_id: string | null
          vendors: string | null
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          carrier?: string | null
          contents_summary?: string | null
          cost_mxn?: number | null
          crate_count?: number | null
          customs_status?: string | null
          date?: string | null
          description?: string | null
          destination_address?: string | null
          freight_cost?: number | null
          height_cm?: number | null
          id?: string
          insurance_value?: number | null
          inventory_ids?: string | null
          length_cm?: number | null
          origin?: string | null
          pallet_count?: number | null
          parent_id?: string | null
          quantity?: number | null
          ship_date?: string | null
          status?: string | null
          tracking_number?: string | null
          truck_id?: string | null
          truck_position?: string | null
          type?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendors?: string | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          carrier?: string | null
          contents_summary?: string | null
          cost_mxn?: number | null
          crate_count?: number | null
          customs_status?: string | null
          date?: string | null
          description?: string | null
          destination_address?: string | null
          freight_cost?: number | null
          height_cm?: number | null
          id?: string
          insurance_value?: number | null
          inventory_ids?: string | null
          length_cm?: number | null
          origin?: string | null
          pallet_count?: number | null
          parent_id?: string | null
          quantity?: number | null
          ship_date?: string | null
          status?: string | null
          tracking_number?: string | null
          truck_id?: string | null
          truck_position?: string | null
          type?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendors?: string | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: []
      }
      logistics_826: {
        Row: {
          created_at: string | null
          customs_status: string | null
          dimensions: Json | null
          freight_cost: number | null
          id: string
          inventory_ids: Json | null
          tracking_number: string | null
          truck_id: string | null
          type: Database["public"]["Enums"]["container_type"]
          vendors: Json | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          customs_status?: string | null
          dimensions?: Json | null
          freight_cost?: number | null
          id?: string
          inventory_ids?: Json | null
          tracking_number?: string | null
          truck_id?: string | null
          type: Database["public"]["Enums"]["container_type"]
          vendors?: Json | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          customs_status?: string | null
          dimensions?: Json | null
          freight_cost?: number | null
          id?: string
          inventory_ids?: Json | null
          tracking_number?: string | null
          truck_id?: string | null
          type?: Database["public"]["Enums"]["container_type"]
          vendors?: Json | null
          weight?: number | null
        }
        Relationships: []
      }
      migration_backup_20260903_drive: {
        Row: {
          backed_up_at: string | null
          generated_png_url: string | null
          id: string | null
          processed_media_urls: string | null
          spatial_masks: Json | null
        }
        Insert: {
          backed_up_at?: string | null
          generated_png_url?: string | null
          id?: string | null
          processed_media_urls?: string | null
          spatial_masks?: Json | null
        }
        Update: {
          backed_up_at?: string | null
          generated_png_url?: string | null
          id?: string | null
          processed_media_urls?: string | null
          spatial_masks?: Json | null
        }
        Relationships: []
      }
      onyxchan_commands: {
        Row: {
          action: string
          created_at: string | null
          id: number
          payload: Json
          status: string
          target_device: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: never
          payload?: Json
          status?: string
          target_device: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: never
          payload?: Json
          status?: string
          target_device?: string
        }
        Relationships: [
          {
            foreignKeyName: "onyxchan_commands_target_device_fkey"
            columns: ["target_device"]
            isOneToOne: false
            referencedRelation: "onyxchan_devices"
            referencedColumns: ["device_id"]
          },
        ]
      }
      onyxchan_devices: {
        Row: {
          accessories: string[] | null
          assigned_user_email: string
          assigned_user_id: string | null
          battery_level: number | null
          created_at: string | null
          device_id: string
          device_name: string
          firmware_version: string | null
          last_seen: string | null
          rssi: number | null
          status: string
          token_hash: string | null
          token_issued_at: string | null
          token_last_used_at: string | null
          token_revoked_at: string | null
        }
        Insert: {
          accessories?: string[] | null
          assigned_user_email: string
          assigned_user_id?: string | null
          battery_level?: number | null
          created_at?: string | null
          device_id: string
          device_name?: string
          firmware_version?: string | null
          last_seen?: string | null
          rssi?: number | null
          status?: string
          token_hash?: string | null
          token_issued_at?: string | null
          token_last_used_at?: string | null
          token_revoked_at?: string | null
        }
        Update: {
          accessories?: string[] | null
          assigned_user_email?: string
          assigned_user_id?: string | null
          battery_level?: number | null
          created_at?: string | null
          device_id?: string
          device_name?: string
          firmware_version?: string | null
          last_seen?: string | null
          rssi?: number | null
          status?: string
          token_hash?: string | null
          token_issued_at?: string | null
          token_last_used_at?: string | null
          token_revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onyxchan_devices_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      print_job_items: {
        Row: {
          id: string
          inventory_id: string | null
          job_id: string
          labels_printed: number
          tag_id: string | null
        }
        Insert: {
          id?: string
          inventory_id?: string | null
          job_id: string
          labels_printed?: number
          tag_id?: string | null
        }
        Update: {
          id?: string
          inventory_id?: string | null
          job_id?: string
          labels_printed?: number
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          checksum: string | null
          id: string
          is_reprint: boolean
          item_count: number
          label_count: number
          label_size: string | null
          notes: string | null
          printed_at: string
          printed_by: string | null
          source: string
        }
        Insert: {
          checksum?: string | null
          id: string
          is_reprint?: boolean
          item_count?: number
          label_count?: number
          label_size?: string | null
          notes?: string | null
          printed_at?: string
          printed_by?: string | null
          source?: string
        }
        Update: {
          checksum?: string | null
          id?: string
          is_reprint?: boolean
          item_count?: number
          label_count?: number
          label_size?: string | null
          notes?: string | null
          printed_at?: string
          printed_by?: string | null
          source?: string
        }
        Relationships: []
      }
      production: {
        Row: {
          advance: number | null
          description: string | null
          hidden_reason: string | null
          id: string
          is_hidden: boolean | null
          price_unit: number | null
          progress: number | null
          quantity: number | null
          rating: number | null
          ready_date: string | null
          status: string | null
          tag_id: string | null
          total: number | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          advance?: number | null
          description?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean | null
          price_unit?: number | null
          progress?: number | null
          quantity?: number | null
          rating?: number | null
          ready_date?: string | null
          status?: string | null
          tag_id?: string | null
          total?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          advance?: number | null
          description?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean | null
          price_unit?: number | null
          progress?: number | null
          quantity?: number | null
          rating?: number | null
          ready_date?: string | null
          status?: string | null
          tag_id?: string | null
          total?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      shipments: {
        Row: {
          id: string
          manifest_id: string
          metadata: Json | null
          payload: Json | null
          timestamp: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          manifest_id: string
          metadata?: Json | null
          payload?: Json | null
          timestamp?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          manifest_id?: string
          metadata?: Json | null
          payload?: Json | null
          timestamp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_app_role: { Args: never; Returns: string }
      get_my_vendor_prefix: { Args: never; Returns: string }
      inventory_normalise_type: { Args: { raw: string }; Returns: string }
      issue_device_token: { Args: { p_device_id: string }; Returns: string }
      link_onyxchan_device: {
        Args: { p_device_id: string; p_user_id: string }
        Returns: undefined
      }
      onyx_cypher: { Args: { n: number }; Returns: string }
      onyx_round: { Args: { n: number }; Returns: number }
      record_device_heartbeat: {
        Args: { p_battery?: number; p_device_id: string; p_rssi?: number }
        Returns: undefined
      }
      revoke_device_token: { Args: { p_device_id: string }; Returns: undefined }
      verify_device_token: { Args: { p_token: string }; Returns: string }
    }
    Enums: {
      container_type: "crate" | "pallet" | "cardboard"
      material_type:
        | "onyx"
        | "marble"
        | "fluorite"
        | "calcite"
        | "concrete"
        | "travertine"
        | "other"
      shape_type:
        | "cylinder"
        | "squared"
        | "fountain"
        | "rustic_wine_rack"
        | "medium"
        | "large"
        | "rectangular"
        | "small"
        | "square"
        | "horses"
        | "round"
        | "elk"
        | "mini"
        | "moose"
        | "deer"
        | "wall_panel"
        | "boulder"
        | "basin"
        | "sphere"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      container_type: ["crate", "pallet", "cardboard"],
      material_type: [
        "onyx",
        "marble",
        "fluorite",
        "calcite",
        "concrete",
        "travertine",
        "other",
      ],
      shape_type: [
        "cylinder",
        "squared",
        "fountain",
        "rustic_wine_rack",
        "medium",
        "large",
        "rectangular",
        "small",
        "square",
        "horses",
        "round",
        "elk",
        "mini",
        "moose",
        "deer",
        "wall_panel",
        "boulder",
        "basin",
        "sphere",
        "other",
      ],
    },
  },
} as const
