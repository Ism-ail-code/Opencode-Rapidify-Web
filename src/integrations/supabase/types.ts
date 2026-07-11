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
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          merchant_id: string | null
          metadata: Json | null
          product_id: string | null
          session_id: string | null
          user_agent: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          merchant_id?: string | null
          metadata?: Json | null
          product_id?: string | null
          session_id?: string | null
          user_agent?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          merchant_id?: string | null
          metadata?: Json | null
          product_id?: string | null
          session_id?: string | null
          user_agent?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          brand_color: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          slug: string
          store_domain: string | null
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_id?: string | null
          slug: string
          store_domain?: string | null
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          slug?: string
          store_domain?: string | null
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          input: Json | null
          max_retries: number
          merchant_id: string | null
          next_retry_at: string | null
          output: Json | null
          product_id: string | null
          provider: string
          result: Json | null
          retries: number
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          max_retries?: number
          merchant_id?: string | null
          next_retry_at?: string | null
          output?: Json | null
          product_id?: string | null
          provider?: string
          result?: Json | null
          retries?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          max_retries?: number
          merchant_id?: string | null
          next_retry_at?: string | null
          output?: Json | null
          product_id?: string | null
          provider?: string
          result?: Json | null
          retries?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color_hex: string | null
          created_at: string
          id: string
          model_glb_url: string | null
          model_usdz_url: string | null
          name: string
          product_id: string
          sort_order: number
          thumbnail_url: string | null
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          id?: string
          model_glb_url?: string | null
          model_usdz_url?: string | null
          name: string
          product_id: string
          sort_order?: number
          thumbnail_url?: string | null
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          id?: string
          model_glb_url?: string | null
          model_usdz_url?: string | null
          name?: string
          product_id?: string
          sort_order?: number
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          buy_url: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          merchant_id: string
          model_glb_url: string | null
          model_usdz_url: string | null
          price_cents: number
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          buy_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          merchant_id: string
          model_glb_url?: string | null
          model_usdz_url?: string | null
          price_cents?: number
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          buy_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          merchant_id?: string
          model_glb_url?: string | null
          model_usdz_url?: string | null
          price_cents?: number
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          corporate_title: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          corporate_title?: string
          created_at?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          corporate_title?: string
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_members: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          role: Database["public"]["Enums"]["merchant_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          role?: Database["public"]["Enums"]["merchant_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          role?: Database["public"]["Enums"]["merchant_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_members_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_connections: {
        Row: {
          created_at: string
          id: string
          last_sync_at: string | null
          merchant_id: string
          oauth_refresh_hash: string | null
          oauth_token_hash: string
          platform: string
          status: string
          store_name: string
          store_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_sync_at?: string | null
          merchant_id: string
          oauth_refresh_hash?: string | null
          oauth_token_hash?: string
          platform: string
          status?: string
          store_name?: string
          store_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_sync_at?: string | null
          merchant_id?: string
          oauth_refresh_hash?: string | null
          oauth_token_hash?: string
          platform?: string
          status?: string
          store_name?: string
          store_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_connections_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      external_catalog_items: {
        Row: {
          connection_id: string
          created_at: string
          currency: string | null
          description: string | null
          external_sku: string
          id: string
          image_urls: string[] | null
          mapped_product_id: string | null
          metadata: Json | null
          price_cents: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          currency?: string | null
          description?: string | null
          external_sku: string
          id?: string
          image_urls?: string[] | null
          mapped_product_id?: string | null
          metadata?: import("./types").Json | null
          price_cents?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          external_sku?: string
          id?: string
          image_urls?: string[] | null
          mapped_product_id?: string | null
          metadata?: import("./types").Json | null
          price_cents?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_catalog_items_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "marketplace_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_catalog_items_mapped_product_id_fkey"
            columns: ["mapped_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          merchant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          merchant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          merchant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_credits_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          merchant_id: string
          metadata: Json | null
          reason: string
          ref_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          merchant_id: string
          metadata?: Json | null
          reason: string
          ref_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          merchant_id?: string
          metadata?: Json | null
          reason?: string
          ref_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      used_nonces: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          nonce: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          nonce: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          resource: string
          resource_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource: string
          resource_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource?: string
          resource_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      asset_cache: {
        Row: {
          cached_path: string
          checksum: string | null
          content_type: string | null
          created_at: string
          expires_at: string
          id: string
          size_bytes: number | null
          source_url: string
        }
        Insert: {
          cached_path: string
          checksum?: string | null
          content_type?: string | null
          created_at?: string
          expires_at: string
          id?: string
          size_bytes?: number | null
          source_url: string
        }
        Update: {
          cached_path?: string
          checksum?: string | null
          content_type?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          size_bytes?: number | null
          source_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_credits: {
        Args: {
          _merchant_id: string
          _amount: number
          _reason: string
          _ref_id?: string
        }
        Returns: void
      }
      deduct_credits: {
        Args: {
          _merchant_id: string
          _amount: number
          _reason: string
          _ref_id?: string
        }
        Returns: boolean
      }
      get_user_merchant_id: {
        Args: {
          _user_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "merchant"
      job_status: "queued" | "processing" | "optimizing" | "ready" | "failed"
      merchant_role: "admin" | "member" | "owner"
      product_status: "draft" | "active" | "archived"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "merchant"],
      job_status: ["queued", "processing", "optimizing", "ready", "failed"],
      merchant_role: ["admin", "member", "owner"],
      product_status: ["draft", "active", "archived"],
    },
  },
} as const
