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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      acquisition_leads: {
        Row: {
          channel: string
          converted_at: string | null
          cost: number | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          owner: string | null
          phone: string | null
          revenue_attributed: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          converted_at?: string | null
          cost?: number | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner?: string | null
          phone?: string | null
          revenue_attributed?: number | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          converted_at?: string | null
          cost?: number | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner?: string | null
          phone?: string | null
          revenue_attributed?: number | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      acquisition_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string
          id: string
          lead_id: string | null
          notes: string | null
          status: string
          task_type: string
          title: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          status?: string
          task_type?: string
          title: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          status?: string
          task_type?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "acquisition_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acquisition_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_attributions: {
        Row: {
          affiliate_link_id: string
          converted_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          ip_address: string | null
          session_id: string | null
        }
        Insert: {
          affiliate_link_id: string
          converted_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          session_id?: string | null
        }
        Update: {
          affiliate_link_id?: string
          converted_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_attributions_affiliate_link_id_fkey"
            columns: ["affiliate_link_id"]
            isOneToOne: false
            referencedRelation: "affiliate_links"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_links: {
        Row: {
          affiliate_id: string
          click_count: number
          code: string
          created_at: string
          id: string
          product_id: string | null
        }
        Insert: {
          affiliate_id: string
          click_count?: number
          code: string
          created_at?: string
          id?: string
          product_id?: string | null
        }
        Update: {
          affiliate_id?: string
          click_count?: number
          code?: string
          created_at?: string
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_links_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_programs: {
        Row: {
          attribution_model: string
          auto_approve: boolean
          cookie_duration_days: number
          created_at: string
          default_commission_percent: number
          hold_days: number
          id: string
          is_enabled: boolean
          min_payout_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attribution_model?: string
          auto_approve?: boolean
          cookie_duration_days?: number
          created_at?: string
          default_commission_percent?: number
          hold_days?: number
          id?: string
          is_enabled?: boolean
          min_payout_amount?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attribution_model?: string
          auto_approve?: boolean
          cookie_duration_days?: number
          created_at?: string
          default_commission_percent?: number
          hold_days?: number
          id?: string
          is_enabled?: boolean
          min_payout_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_programs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          application_note: string | null
          approved_at: string | null
          bank_account: Json | null
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          pix_key: string | null
          status: string
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          application_note?: string | null
          approved_at?: string | null
          bank_account?: Json | null
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          pix_key?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          application_note?: string | null
          approved_at?: string | null
          bank_account?: Json | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          pix_key?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          page_path: string | null
          product_id: string | null
          referrer: string | null
          storefront_id: string | null
          user_agent: string | null
          visitor_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          page_path?: string | null
          product_id?: string | null
          referrer?: string | null
          storefront_id?: string | null
          user_agent?: string | null
          visitor_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          page_path?: string | null
          product_id?: string | null
          referrer?: string | null
          storefront_id?: string | null
          user_agent?: string | null
          visitor_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          customer_email: string
          customer_id: string | null
          customer_name: string
          end_time: string
          id: string
          meeting_provider: string | null
          meeting_url: string | null
          notes: string | null
          product_id: string
          scheduled_date: string
          start_time: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_email: string
          customer_id?: string | null
          customer_name: string
          end_time: string
          id?: string
          meeting_provider?: string | null
          meeting_url?: string | null
          notes?: string | null
          product_id: string
          scheduled_date: string
          start_time: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_email?: string
          customer_id?: string | null
          customer_name?: string
          end_time?: string
          id?: string
          meeting_provider?: string | null
          meeting_url?: string | null
          notes?: string | null
          product_id?: string
          scheduled_date?: string
          start_time?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          created_at: string
          day_of_week: number
          duration_minutes: number
          end_time: string
          id: string
          is_active: boolean
          product_id: string
          start_time: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          duration_minutes?: number
          end_time: string
          id?: string
          is_active?: boolean
          product_id: string
          start_time: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          duration_minutes?: number
          end_time?: string
          id?: string
          is_active?: boolean
          product_id?: string
          start_time?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string
          account_type: string
          agency: string
          bank_code: string
          bank_name: string | null
          created_at: string
          holder_document: string
          holder_name: string
          id: string
          is_default: boolean
          pix_key: string | null
          pix_key_type: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_number: string
          account_type?: string
          agency: string
          bank_code: string
          bank_name?: string | null
          created_at?: string
          holder_document: string
          holder_name: string
          id?: string
          is_default?: boolean
          pix_key?: string | null
          pix_key_type?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_number?: string
          account_type?: string
          agency?: string
          bank_code?: string
          bank_name?: string | null
          created_at?: string
          holder_document?: string
          holder_name?: string
          id?: string
          is_default?: boolean
          pix_key?: string | null
          pix_key_type?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_cohort_log: {
        Row: {
          action_type: string | null
          actioned_at: string | null
          created_at: string
          id: string
          opened_at: string | null
          sent_at: string | null
          status: string
          step: string
          user_email: string
          workspace_id: string
        }
        Insert: {
          action_type?: string | null
          actioned_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          step: string
          user_email: string
          workspace_id: string
        }
        Update: {
          action_type?: string | null
          actioned_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          step?: string
          user_email?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_cohort_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          error_message: string | null
          id: string
          lead_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          lead_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          lead_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          course_name: string
          created_at: string
          creator_name: string | null
          customer_id: string
          id: string
          issued_at: string
          pdf_url: string | null
          product_id: string
          student_name: string
        }
        Insert: {
          course_name: string
          created_at?: string
          creator_name?: string | null
          customer_id: string
          id?: string
          issued_at?: string
          pdf_url?: string | null
          product_id: string
          student_name: string
        }
        Update: {
          course_name?: string
          created_at?: string
          creator_name?: string | null
          customer_id?: string
          id?: string
          issued_at?: string
          pdf_url?: string | null
          product_id?: string
          student_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      chargeback_cases: {
        Row: {
          amount: number
          assigned_to: string | null
          created_at: string
          currency: string
          financial_impact: number | null
          gateway_dispute_id: string | null
          id: string
          order_id: string
          payment_id: string | null
          reason: string | null
          resolved_at: string | null
          sla_deadline_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          assigned_to?: string | null
          created_at?: string
          currency?: string
          financial_impact?: number | null
          gateway_dispute_id?: string | null
          id?: string
          order_id: string
          payment_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          sla_deadline_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          assigned_to?: string | null
          created_at?: string
          currency?: string
          financial_impact?: number | null
          gateway_dispute_id?: string | null
          id?: string
          order_id?: string
          payment_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          sla_deadline_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chargeback_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_cases_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chargeback_evidences: {
        Row: {
          case_id: string
          created_at: string
          description: string | null
          file_name: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargeback_evidences_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "chargeback_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      chargeback_timeline: {
        Row: {
          action: string
          actor_id: string | null
          case_id: string
          created_at: string
          id: string
          metadata: Json | null
          note: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          case_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          note?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          case_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargeback_timeline_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "chargeback_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_line_items: {
        Row: {
          checkout_session_id: string
          created_at: string
          id: string
          is_order_bump: boolean
          price_id: string
          product_id: string
          quantity: number
          unit_amount: number
        }
        Insert: {
          checkout_session_id: string
          created_at?: string
          id?: string
          is_order_bump?: boolean
          price_id: string
          product_id: string
          quantity?: number
          unit_amount?: number
        }
        Update: {
          checkout_session_id?: string
          created_at?: string
          id?: string
          is_order_bump?: boolean
          price_id?: string
          product_id?: string
          quantity?: number
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkout_line_items_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_line_items_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          abandoned_at: string | null
          affiliate_link_id: string | null
          completed_at: string | null
          coupon_code: string | null
          created_at: string
          currency: string
          customer_id: string | null
          discount_amount: number
          email: string | null
          expires_at: string | null
          id: string
          ip_address: string | null
          recovered_checkout: boolean | null
          status: string
          subtotal_amount: number
          total_amount: number
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          workspace_id: string
        }
        Insert: {
          abandoned_at?: string | null
          affiliate_link_id?: string | null
          completed_at?: string | null
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_amount?: number
          email?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          recovered_checkout?: boolean | null
          status?: string
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          workspace_id: string
        }
        Update: {
          abandoned_at?: string | null
          affiliate_link_id?: string | null
          completed_at?: string | null
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_amount?: number
          email?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          recovered_checkout?: boolean | null
          status?: string
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_courses: {
        Row: {
          access_rule: string
          access_type: string
          billing_period: string
          community_id: string
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          name: string
          position: number
          price_cents: number
          updated_at: string
        }
        Insert: {
          access_rule?: string
          access_type?: string
          billing_period?: string
          community_id: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name: string
          position?: number
          price_cents?: number
          updated_at?: string
        }
        Update: {
          access_rule?: string
          access_type?: string
          billing_period?: string
          community_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name?: string
          position?: number
          price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_courses_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_lesson_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          lesson_id: string
          member_id: string
          progress_pct: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          member_id: string
          progress_pct?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          member_id?: string
          progress_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "circle_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_lesson_progress_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_lessons: {
        Row: {
          content: string | null
          course_id: string
          created_at: string
          id: string
          is_published: boolean
          parent_id: string | null
          position: number
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          course_id: string
          created_at?: string
          id?: string
          is_published?: boolean
          parent_id?: string | null
          position?: number
          title?: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          course_id?: string
          created_at?: string
          id?: string
          is_published?: boolean
          parent_id?: string | null
          position?: number
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "circle_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_lessons_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "circle_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_plans: {
        Row: {
          community_id: string
          created_at: string
          currency: string
          description: string | null
          id: string
          interval: string
          is_active: boolean
          name: string
          price_cents: number
          provider_plan_id: string | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          provider_plan_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          provider_plan_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_plans_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_subscriptions: {
        Row: {
          canceled_at: string | null
          community_id: string
          created_at: string
          dunning_attempts: number
          id: string
          last_dunning_at: string | null
          next_billing_at: string | null
          payment_method: string | null
          plan_id: string
          provider: string | null
          provider_customer_id: string | null
          provider_plan_id: string | null
          provider_subscription_id: string | null
          started_at: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          community_id: string
          created_at?: string
          dunning_attempts?: number
          id?: string
          last_dunning_at?: string | null
          next_billing_at?: string | null
          payment_method?: string | null
          plan_id: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_plan_id?: string | null
          provider_subscription_id?: string | null
          started_at?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          community_id?: string
          created_at?: string
          dunning_attempts?: number
          id?: string
          last_dunning_at?: string | null
          next_billing_at?: string | null
          payment_method?: string | null
          plan_id?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_plan_id?: string | null
          provider_subscription_id?: string | null
          started_at?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_subscriptions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "circle_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          created_at: string
          fixed_amount: number | null
          id: string
          is_active: boolean
          percent: number
          product_id: string
        }
        Insert: {
          created_at?: string
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          percent?: number
          product_id: string
        }
        Update: {
          created_at?: string
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          percent?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          affiliate_id: string
          amount: number
          approved_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          hold_until: string | null
          id: string
          order_id: string
          paid_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          amount?: number
          approved_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          hold_until?: string | null
          id?: string
          order_id: string
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          approved_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          hold_until?: string | null
          id?: string
          order_id?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          about_video_url: string | null
          access_type: Database["public"]["Enums"]["community_access_type"]
          allow_member_events: boolean
          allow_member_posts: boolean
          billing_period: string
          category: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          is_listed: boolean
          linked_product_id: string | null
          long_description: string | null
          member_count: number
          name: string
          points_per_comment: number
          points_per_course_completed: number
          points_per_daily_login: number
          points_per_like_received: number
          points_per_post: number
          post_count: number
          price_cents: number
          require_approval: boolean
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          about_video_url?: string | null
          access_type?: Database["public"]["Enums"]["community_access_type"]
          allow_member_events?: boolean
          allow_member_posts?: boolean
          billing_period?: string
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_listed?: boolean
          linked_product_id?: string | null
          long_description?: string | null
          member_count?: number
          name: string
          points_per_comment?: number
          points_per_course_completed?: number
          points_per_daily_login?: number
          points_per_like_received?: number
          points_per_post?: number
          post_count?: number
          price_cents?: number
          require_approval?: boolean
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          about_video_url?: string | null
          access_type?: Database["public"]["Enums"]["community_access_type"]
          allow_member_events?: boolean
          allow_member_posts?: boolean
          billing_period?: string
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_listed?: boolean
          linked_product_id?: string | null
          long_description?: string | null
          member_count?: number
          name?: string
          points_per_comment?: number
          points_per_course_completed?: number
          points_per_daily_login?: number
          points_per_like_received?: number
          points_per_post?: number
          post_count?: number
          price_cents?: number
          require_approval?: boolean
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_linked_product_id_fkey"
            columns: ["linked_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          images: string[] | null
          is_best_answer: boolean
          like_count: number
          parent_id: string | null
          post_id: string
          reply_count: number
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          images?: string[] | null
          is_best_answer?: boolean
          like_count?: number
          parent_id?: string | null
          post_id: string
          reply_count?: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          images?: string[] | null
          is_best_answer?: boolean
          like_count?: number
          parent_id?: string | null
          post_id?: string
          reply_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_conversation_members: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          member_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          member_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "community_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_conversation_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_conversations: {
        Row: {
          community_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_conversations_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          member_id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          member_id: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          member_id?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_event_rsvps_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_events: {
        Row: {
          community_id: string
          cover_image_url: string | null
          created_at: string
          created_by: string
          description: string | null
          ends_at: string | null
          id: string
          is_all_day: boolean
          is_recurring: boolean
          max_attendees: number | null
          meeting_platform: string | null
          meeting_url: string | null
          recurrence_rule: string | null
          rsvp_count: number
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          community_id: string
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_all_day?: boolean
          is_recurring?: boolean
          max_attendees?: number | null
          meeting_platform?: string | null
          meeting_url?: string | null
          recurrence_rule?: string | null
          rsvp_count?: number
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_all_day?: boolean
          is_recurring?: boolean
          max_attendees?: number | null
          meeting_platform?: string | null
          meeting_url?: string | null
          recurrence_rule?: string | null
          rsvp_count?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_invite_links: {
        Row: {
          code: string
          community_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          uses_count: number
        }
        Insert: {
          code?: string
          community_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          uses_count?: number
        }
        Update: {
          code?: string
          community_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_invite_links_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invite_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          bio: string | null
          community_id: string
          created_at: string
          current_streak: number
          customer_id: string | null
          display_name: string | null
          id: string
          joined_at: string
          last_active_at: string | null
          level: number
          longest_streak: number
          muted_at: string | null
          muted_until: string | null
          notification_preferences: Json
          role: Database["public"]["Enums"]["community_member_role"]
          status: Database["public"]["Enums"]["community_member_status"]
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          bio?: string | null
          community_id: string
          created_at?: string
          current_streak?: number
          customer_id?: string | null
          display_name?: string | null
          id?: string
          joined_at?: string
          last_active_at?: string | null
          level?: number
          longest_streak?: number
          muted_at?: string | null
          muted_until?: string | null
          notification_preferences?: Json
          role?: Database["public"]["Enums"]["community_member_role"]
          status?: Database["public"]["Enums"]["community_member_status"]
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          bio?: string | null
          community_id?: string
          created_at?: string
          current_streak?: number
          customer_id?: string | null
          display_name?: string | null
          id?: string
          joined_at?: string
          last_active_at?: string | null
          level?: number
          longest_streak?: number
          muted_at?: string | null
          muted_until?: string | null
          notification_preferences?: Json
          role?: Database["public"]["Enums"]["community_member_role"]
          status?: Database["public"]["Enums"]["community_member_status"]
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "community_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_moderation_logs: {
        Row: {
          action: string
          comment_id: string | null
          community_id: string
          created_at: string
          id: string
          metadata: Json | null
          moderator_id: string
          post_id: string | null
          reason: string | null
          target_member_id: string | null
        }
        Insert: {
          action: string
          comment_id?: string | null
          community_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          moderator_id: string
          post_id?: string | null
          reason?: string | null
          target_member_id?: string | null
        }
        Update: {
          action?: string
          comment_id?: string | null
          community_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          moderator_id?: string
          post_id?: string | null
          reason?: string | null
          target_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_moderation_logs_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_logs_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_logs_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_logs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_logs_target_member_id_fkey"
            columns: ["target_member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          comment_id: string | null
          community_id: string
          created_at: string
          event_id: string | null
          id: string
          is_read: boolean
          post_id: string | null
          read_at: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          comment_id?: string | null
          community_id: string
          created_at?: string
          event_id?: string | null
          id?: string
          is_read?: boolean
          post_id?: string | null
          read_at?: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          comment_id?: string | null
          community_id?: string
          created_at?: string
          event_id?: string | null
          id?: string
          is_read?: boolean
          post_id?: string | null
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "community_notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_points_log: {
        Row: {
          action: Database["public"]["Enums"]["point_action"]
          community_id: string
          created_at: string
          description: string | null
          id: string
          member_id: string
          points: number
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["point_action"]
          community_id: string
          created_at?: string
          description?: string | null
          id?: string
          member_id: string
          points: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["point_action"]
          community_id?: string
          created_at?: string
          description?: string | null
          id?: string
          member_id?: string
          points?: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_points_log_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_points_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_votes: {
        Row: {
          created_at: string
          id: string
          member_id: string
          option_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          option_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          option_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          best_answer_id: string | null
          body: string | null
          comment_count: number
          community_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          images: string[] | null
          is_answered: boolean | null
          is_locked: boolean
          is_pinned: boolean
          like_count: number
          link_preview_data: Json | null
          link_url: string | null
          poll_allow_multiple: boolean | null
          poll_ends_at: string | null
          poll_options: Json | null
          post_type: Database["public"]["Enums"]["post_type"]
          space_id: string
          title: string
          updated_at: string
          video_url: string | null
          view_count: number
        }
        Insert: {
          author_id: string
          best_answer_id?: string | null
          body?: string | null
          comment_count?: number
          community_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          images?: string[] | null
          is_answered?: boolean | null
          is_locked?: boolean
          is_pinned?: boolean
          like_count?: number
          link_preview_data?: Json | null
          link_url?: string | null
          poll_allow_multiple?: boolean | null
          poll_ends_at?: string | null
          poll_options?: Json | null
          post_type?: Database["public"]["Enums"]["post_type"]
          space_id: string
          title: string
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Update: {
          author_id?: string
          best_answer_id?: string | null
          body?: string | null
          comment_count?: number
          community_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          images?: string[] | null
          is_answered?: boolean | null
          is_locked?: boolean
          is_pinned?: boolean
          like_count?: number
          link_preview_data?: Json | null
          link_url?: string | null
          poll_allow_multiple?: boolean | null
          poll_ends_at?: string | null
          poll_options?: Json | null
          post_type?: Database["public"]["Enums"]["post_type"]
          space_id?: string
          title?: string
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "community_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          emoji: string
          id: string
          member_id: string
          post_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          member_id: string
          post_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          member_id?: string
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          comment_id: string | null
          community_id: string
          created_at: string
          details: string | null
          id: string
          post_id: string | null
          reason: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_member_id: string | null
        }
        Insert: {
          comment_id?: string | null
          community_id: string
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string | null
          reason?: string
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_member_id?: string | null
        }
        Update: {
          comment_id?: string | null
          community_id?: string
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string | null
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_target_member_id_fkey"
            columns: ["target_member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_space_subscriptions: {
        Row: {
          created_at: string
          member_id: string
          notify_new_posts: boolean
          space_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          notify_new_posts?: boolean
          space_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          notify_new_posts?: boolean
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_space_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_space_subscriptions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "community_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      community_spaces: {
        Row: {
          color: string | null
          community_id: string
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          is_default: boolean
          is_visible: boolean
          name: string
          only_admins_can_post: boolean
          position: number
          post_count: number
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          community_id: string
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_default?: boolean
          is_visible?: boolean
          name: string
          only_admins_can_post?: boolean
          position?: number
          post_count?: number
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          community_id?: string
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_default?: boolean
          is_visible?: boolean
          name?: string
          only_admins_can_post?: boolean
          position?: number
          post_count?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_spaces_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_spam_log: {
        Row: {
          action_type: string
          community_id: string
          content_hash: string | null
          created_at: string
          id: string
          member_id: string
        }
        Insert: {
          action_type?: string
          community_id: string
          content_hash?: string | null
          created_at?: string
          id?: string
          member_id: string
        }
        Update: {
          action_type?: string
          community_id?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_spam_log_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_spam_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usages: {
        Row: {
          coupon_id: string
          created_at: string
          customer_email: string
          discount_amount: number
          id: string
          order_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          customer_email: string
          discount_amount?: number
          id?: string
          order_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          customer_email?: string
          discount_amount?: number
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usages_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          id: string
          is_active: boolean
          max_uses: number | null
          max_uses_per_customer: number
          min_order_amount: number | null
          type: string
          updated_at: string
          valid_from: string
          valid_until: string | null
          value: number
          workspace_id: string
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_customer?: number
          min_order_amount?: number | null
          type?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          value?: number
          workspace_id: string
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_customer?: number
          min_order_amount?: number | null
          type?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupons_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          cpf: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_assets: {
        Row: {
          created_at: string
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          mime_type: string | null
          product_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          product_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          amount: number
          created_at: string
          evidence: Json | null
          gateway_dispute_id: string | null
          id: string
          order_id: string
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          evidence?: Json | null
          gateway_dispute_id?: string | null
          id?: string
          order_id: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          evidence?: Json | null
          gateway_dispute_id?: string | null
          id?: string
          order_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          body_html: string
          created_at: string
          failed_count: number
          id: string
          name: string
          scheduled_at: string | null
          segment_id: string | null
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          total_recipients: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body_html?: string
          created_at?: string
          failed_count?: number
          id?: string
          name: string
          scheduled_at?: string | null
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          total_recipients?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body_html?: string
          created_at?: string
          failed_count?: number
          id?: string
          name?: string
          scheduled_at?: string | null
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          total_recipients?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "email_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          email: string
          event_type: string
          id: string
          lead_id: string | null
          message_id: string | null
          metadata: Json | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          email: string
          event_type: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          metadata?: Json | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          email?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          metadata?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_flow_settings: {
        Row: {
          created_at: string
          delay_minutes: number | null
          flow_key: string
          id: string
          is_enabled: boolean
          metadata: Json | null
          support_email: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number | null
          flow_key: string
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          support_email?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number | null
          flow_key?: string
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          support_email?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_flow_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          checkout_session_id: string | null
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          order_id: string | null
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string | null
          template_key: string
          workspace_id: string
        }
        Insert: {
          checkout_session_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          order_id?: string | null
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key: string
          workspace_id: string
        }
        Update: {
          checkout_session_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          order_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_segments: {
        Row: {
          created_at: string | null
          description: string | null
          filter_rules: Json | null
          id: string
          is_dynamic: boolean
          member_count: number | null
          name: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          filter_rules?: Json | null
          id?: string
          is_dynamic?: boolean
          member_count?: number | null
          name: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          filter_rules?: Json | null
          id?: string
          is_dynamic?: boolean
          member_count?: number | null
          name?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_segments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_enrollments: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          enrolled_at: string
          id: string
          lead_id: string
          next_send_at: string | null
          sequence_id: string
          unsubscribed_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          lead_id: string
          next_send_at?: string | null
          sequence_id: string
          unsubscribed_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          lead_id?: string
          next_send_at?: string | null
          sequence_id?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_steps: {
        Row: {
          body: string
          created_at: string
          delay_hours: number
          id: string
          position: number
          sequence_id: string
          subject: string
        }
        Insert: {
          body?: string
          created_at?: string
          delay_hours?: number
          id?: string
          position?: number
          sequence_id: string
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          delay_hours?: number
          id?: string
          position?: number
          sequence_id?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          trigger_product_id: string | null
          trigger_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          trigger_product_id?: string | null
          trigger_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          trigger_product_id?: string | null
          trigger_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_trigger_product_id_fkey"
            columns: ["trigger_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          customer_id: string
          expires_at: string | null
          granted_at: string
          id: string
          order_id: string
          product_id: string
          revoked_at: string | null
        }
        Insert: {
          customer_id: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          order_id: string
          product_id: string
          revoked_at?: string | null
        }
        Update: {
          customer_id?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          order_id?: string
          product_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_assignments: {
        Row: {
          created_at: string
          experiment_key: string
          id: string
          session_id: string | null
          variant: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          experiment_key: string
          id?: string
          session_id?: string | null
          variant: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          experiment_key?: string
          id?: string
          session_id?: string | null
          variant?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          created_at: string
          ended_at: string | null
          experiment_key: string
          id: string
          is_active: boolean
          min_sample: number
          name: string
          variants: Json
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          experiment_key: string
          id?: string
          is_active?: boolean
          min_sample?: number
          name: string
          variants?: Json
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          experiment_key?: string
          id?: string
          is_active?: boolean
          min_sample?: number
          name?: string
          variants?: Json
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          key: string
          label: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key: string
          label: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_invoices: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          external_id: string | null
          id: string
          invoice_number: string | null
          issued_at: string | null
          last_attempt_at: string | null
          order_id: string
          pdf_url: string | null
          provider: string | null
          service_amount: number
          status: string
          tax_amount: number
          updated_at: string
          verification_code: string | null
          workspace_id: string
          xml_url: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          last_attempt_at?: string | null
          order_id: string
          pdf_url?: string | null
          provider?: string | null
          service_amount?: number
          status?: string
          tax_amount?: number
          updated_at?: string
          verification_code?: string | null
          workspace_id: string
          xml_url?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          last_attempt_at?: string | null
          order_id?: string
          pdf_url?: string | null
          provider?: string | null
          service_amount?: number
          status?: string
          tax_amount?: number
          updated_at?: string
          verification_code?: string | null
          workspace_id?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_settings: {
        Row: {
          address_city: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          company_name: string | null
          created_at: string
          default_tax_rate: number | null
          document: string | null
          id: string
          is_auto_emission: boolean
          municipal_registration: string | null
          nfse_provider: string | null
          tax_regime: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address_city?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          company_name?: string | null
          created_at?: string
          default_tax_rate?: number | null
          document?: string | null
          id?: string
          is_auto_emission?: boolean
          municipal_registration?: string | null
          nfse_provider?: string | null
          tax_regime?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address_city?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          company_name?: string | null
          created_at?: string
          default_tax_rate?: number | null
          document?: string | null
          id?: string
          is_auto_emission?: boolean
          municipal_registration?: string | null
          nfse_provider?: string | null
          tax_regime?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_accounts: {
        Row: {
          created_at: string
          credentials_enc: Json | null
          id: string
          is_active: boolean
          is_primary: boolean
          provider: string
          recipient_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          credentials_enc?: Json | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          provider?: string
          recipient_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          credentials_enc?: Json | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          provider?: string
          recipient_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          due_date: string
          id: string
          paid_at: string | null
          payment_id: string | null
          status: string
          subscription_id: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          paid_at?: string | null
          payment_id?: string | null
          status?: string
          subscription_id: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          payment_id?: string | null
          status?: string
          subscription_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_segment_members: {
        Row: {
          added_at: string | null
          lead_id: string
          segment_id: string
        }
        Insert: {
          added_at?: string | null
          lead_id: string
          segment_id: string
        }
        Update: {
          added_at?: string | null
          lead_id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_segment_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "email_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          customer_id: string | null
          email: string
          id: string
          metadata: Json | null
          name: string | null
          opt_in_at: string | null
          opt_in_ip: string | null
          phone: string | null
          product_id: string | null
          source: string | null
          source_detail: string | null
          status: string
          tags: string[] | null
          unsubscribed_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          email: string
          id?: string
          metadata?: Json | null
          name?: string | null
          opt_in_at?: string | null
          opt_in_ip?: string | null
          phone?: string | null
          product_id?: string | null
          source?: string | null
          source_detail?: string | null
          status?: string
          tags?: string[] | null
          unsubscribed_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          email?: string
          id?: string
          metadata?: Json | null
          name?: string | null
          opt_in_at?: string | null
          opt_in_ip?: string | null
          phone?: string | null
          product_id?: string | null
          source?: string | null
          source_detail?: string | null
          status?: string
          tags?: string[] | null
          unsubscribed_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          customer_id: string
          id: string
          last_accessed_at: string | null
          member_content_id: string
          progress_percent: number
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          customer_id: string
          id?: string
          last_accessed_at?: string | null
          member_content_id: string
          progress_percent?: number
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          last_accessed_at?: string | null
          member_content_id?: string
          progress_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_member_content_id_fkey"
            columns: ["member_content_id"]
            isOneToOne: false
            referencedRelation: "member_content"
            referencedColumns: ["id"]
          },
        ]
      }
      member_content: {
        Row: {
          created_at: string
          description: string | null
          duration: number | null
          id: string
          is_free: boolean | null
          is_published: boolean | null
          media_type: string | null
          media_url: string | null
          parent_id: string | null
          position: number | null
          product_id: string
          text_content: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration?: number | null
          id?: string
          is_free?: boolean | null
          is_published?: boolean | null
          media_type?: string | null
          media_url?: string | null
          parent_id?: string | null
          position?: number | null
          product_id: string
          text_content?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration?: number | null
          id?: string
          is_free?: boolean | null
          is_published?: boolean | null
          media_type?: string | null
          media_url?: string | null
          parent_id?: string | null
          position?: number | null
          product_id?: string
          text_content?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_member_content_parent"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "member_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_member_content_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          step_key: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          step_key: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          step_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_alert_log: {
        Row: {
          alert_key: string
          alert_type: string
          created_at: string
          external_channel: string | null
          id: string
          message: string
          notified_externally: boolean | null
          resolved_at: string | null
          severity: string
        }
        Insert: {
          alert_key: string
          alert_type: string
          created_at?: string
          external_channel?: string | null
          id?: string
          message: string
          notified_externally?: boolean | null
          resolved_at?: string | null
          severity?: string
        }
        Update: {
          alert_key?: string
          alert_type?: string
          created_at?: string
          external_channel?: string | null
          id?: string
          message?: string
          notified_externally?: boolean | null
          resolved_at?: string | null
          severity?: string
        }
        Relationships: []
      }
      ops_checklist: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_done: boolean
          task: string
          time_window: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_done?: boolean
          task: string
          time_window: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_done?: boolean
          task?: string
          time_window?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_checklist_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      order_bumps: {
        Row: {
          bump_product_id: string
          created_at: string
          description: string | null
          headline: string | null
          id: string
          is_active: boolean
          main_product_id: string
          position: number
        }
        Insert: {
          bump_product_id: string
          created_at?: string
          description?: string | null
          headline?: string | null
          id?: string
          is_active?: boolean
          main_product_id: string
          position?: number
        }
        Update: {
          bump_product_id?: string
          created_at?: string
          description?: string | null
          headline?: string | null
          id?: string
          is_active?: boolean
          main_product_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_bumps_bump_product_id_fkey"
            columns: ["bump_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_bumps_main_product_id_fkey"
            columns: ["main_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          is_order_bump: boolean
          is_upsell: boolean
          order_id: string
          price_id: string
          product_id: string
          quantity: number
          total_amount: number
          unit_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_order_bump?: boolean
          is_upsell?: boolean
          order_id: string
          price_id: string
          product_id: string
          quantity?: number
          total_amount?: number
          unit_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_order_bump?: boolean
          is_upsell?: boolean
          order_id?: string
          price_id?: string
          product_id?: string
          quantity?: number
          total_amount?: number
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          affiliate_link_id: string | null
          checkout_session_id: string | null
          created_at: string
          currency: string
          customer_avatar_url: string | null
          customer_email: string
          customer_id: string | null
          customer_name: string | null
          discount_amount: number | null
          id: string
          idempotency_key: string | null
          notes: string | null
          order_number: string | null
          paid_at: string | null
          payment_method: string | null
          product_id: string | null
          source: string | null
          status: string
          subtotal_amount: number | null
          total_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          affiliate_link_id?: string | null
          checkout_session_id?: string | null
          created_at?: string
          currency?: string
          customer_avatar_url?: string | null
          customer_email: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_number?: string | null
          paid_at?: string | null
          payment_method?: string | null
          product_id?: string | null
          source?: string | null
          status?: string
          subtotal_amount?: number | null
          total_amount?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          affiliate_link_id?: string | null
          checkout_session_id?: string | null
          created_at?: string
          currency?: string
          customer_avatar_url?: string | null
          customer_email?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_number?: string | null
          paid_at?: string | null
          payment_method?: string | null
          product_id?: string | null
          source?: string | null
          status?: string
          subtotal_amount?: number | null
          total_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          card_brand: string | null
          card_last4: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_reason: string | null
          gateway_account_id: string | null
          gateway_fee: number | null
          gateway_payment_id: string | null
          id: string
          idempotency_key: string | null
          installments: number
          metadata: Json | null
          method: string
          net_amount: number | null
          order_id: string
          processed_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          gateway_account_id?: string | null
          gateway_fee?: number | null
          gateway_payment_id?: string | null
          id?: string
          idempotency_key?: string | null
          installments?: number
          metadata?: Json | null
          method: string
          net_amount?: number | null
          order_id: string
          processed_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          gateway_account_id?: string | null
          gateway_fee?: number | null
          gateway_payment_id?: string | null
          id?: string
          idempotency_key?: string | null
          installments?: number
          metadata?: Json | null
          method?: string
          net_amount?: number | null
          order_id?: string
          processed_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_gateway_account_id_fkey"
            columns: ["gateway_account_id"]
            isOneToOne: false
            referencedRelation: "gateway_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_items: {
        Row: {
          affiliate_id: string
          amount: number
          commission_id: string
          created_at: string
          id: string
          payout_id: string
        }
        Insert: {
          affiliate_id: string
          amount?: number
          commission_id: string
          created_at?: string
          id?: string
          payout_id: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          commission_id?: string
          created_at?: string
          id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: true
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string
          failed_reason: string | null
          fee: number
          id: string
          idempotency_key: string | null
          net_amount: number
          processed_at: string | null
          requested_by: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          created_at?: string
          failed_reason?: string | null
          fee?: number
          id?: string
          idempotency_key?: string | null
          net_amount: number
          processed_at?: string | null
          requested_by: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          failed_reason?: string | null
          fee?: number
          id?: string
          idempotency_key?: string | null
          net_amount?: number
          processed_at?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          affiliate_id: string
          created_at: string
          id: string
          method: string | null
          processed_at: string | null
          status: string
          total_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          id?: string
          method?: string | null
          processed_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          id?: string
          method?: string | null
          processed_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_payment_data: {
        Row: {
          copy_paste_code: string | null
          created_at: string
          expires_at: string | null
          id: string
          paid_at: string | null
          payment_id: string
          qr_code: string | null
          qr_code_url: string | null
          tx_id: string | null
        }
        Insert: {
          copy_paste_code?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          payment_id: string
          qr_code?: string | null
          qr_code_url?: string | null
          tx_id?: string | null
        }
        Update: {
          copy_paste_code?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          payment_id?: string
          qr_code?: string | null
          qr_code_url?: string | null
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pix_payment_data_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_checklist: {
        Row: {
          completed_at: string | null
          created_at: string
          day_number: number
          id: string
          is_done: boolean
          item_key: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          day_number: number
          id?: string
          is_done?: boolean
          item_key: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          day_number?: number
          id?: string
          is_done?: boolean
          item_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_checklist_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          amount: number
          compare_at_amount: number | null
          created_at: string | null
          currency: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          max_installments: number | null
          name: string | null
          pix_discount_percent: number | null
          product_id: string
          type: Database["public"]["Enums"]["price_type"] | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          compare_at_amount?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_installments?: number | null
          name?: string | null
          pix_discount_percent?: number | null
          product_id: string
          type?: Database["public"]["Enums"]["price_type"] | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          compare_at_amount?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_installments?: number | null
          name?: string | null
          pix_discount_percent?: number | null
          product_id?: string
          type?: Database["public"]["Enums"]["price_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          mime_type: string | null
          position: number | null
          product_id: string
          size_bytes: number | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          position?: number | null
          product_id: string
          size_bytes?: number | null
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          position?: number | null
          product_id?: string
          size_bytes?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          author_avatar_url: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          is_approved: boolean | null
          product_id: string
          rating: number
        }
        Insert: {
          author_avatar_url?: string | null
          author_name: string
          content: string
          created_at?: string
          id?: string
          is_approved?: boolean | null
          product_id: string
          rating: number
        }
        Update: {
          author_avatar_url?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          is_approved?: boolean | null
          product_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_storefront_visible: boolean | null
          name: string
          sales_count: number | null
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"] | null
          stock_limit: number | null
          storefront_order: number | null
          thumbnail_url: string | null
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_storefront_visible?: boolean | null
          name: string
          sales_count?: number | null
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"] | null
          stock_limit?: number | null
          storefront_order?: number | null
          thumbnail_url?: string | null
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_storefront_visible?: boolean | null
          name?: string
          sales_count?: number | null
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"] | null
          stock_limit?: number | null
          storefront_order?: number | null
          thumbnail_url?: string | null
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip_address: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip_address: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string
        }
        Relationships: []
      }
      recovery_emails: {
        Row: {
          checkout_session_id: string
          clicked_at: string | null
          converted_at: string | null
          created_at: string
          email_number: number
          id: string
          opened_at: string | null
          scheduled_for: string
          sent_at: string | null
          workspace_id: string
        }
        Insert: {
          checkout_session_id: string
          clicked_at?: string | null
          converted_at?: string | null
          created_at?: string
          email_number: number
          id?: string
          opened_at?: string | null
          scheduled_for: string
          sent_at?: string | null
          workspace_id: string
        }
        Update: {
          checkout_session_id?: string
          clicked_at?: string | null
          converted_at?: string | null
          created_at?: string
          email_number?: number
          id?: string
          opened_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_emails_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_attributions: {
        Row: {
          attribution_status: string | null
          clicked_at: string | null
          created_at: string | null
          first_paid_at: string | null
          id: string
          lock_status: string | null
          referral_code: string
          referred_user_id: string | null
          referrer_user_id: string | null
          signed_up_at: string | null
          source: string | null
          trial_started_at: string | null
        }
        Insert: {
          attribution_status?: string | null
          clicked_at?: string | null
          created_at?: string | null
          first_paid_at?: string | null
          id?: string
          lock_status?: string | null
          referral_code: string
          referred_user_id?: string | null
          referrer_user_id?: string | null
          signed_up_at?: string | null
          source?: string | null
          trial_started_at?: string | null
        }
        Update: {
          attribution_status?: string | null
          clicked_at?: string | null
          created_at?: string | null
          first_paid_at?: string | null
          id?: string
          lock_status?: string | null
          referral_code?: string
          referred_user_id?: string | null
          referrer_user_id?: string | null
          signed_up_at?: string | null
          source?: string | null
          trial_started_at?: string | null
        }
        Relationships: []
      }
      referral_commissions: {
        Row: {
          available_at: string | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          currency: string | null
          event_type: string | null
          gross_base_amount: number | null
          id: string
          payment_id: string | null
          payout_id: string | null
          referred_user_id: string | null
          referrer_user_id: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          available_at?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          currency?: string | null
          event_type?: string | null
          gross_base_amount?: number | null
          id?: string
          payment_id?: string | null
          payout_id?: string | null
          referred_user_id?: string | null
          referrer_user_id?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          available_at?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          currency?: string | null
          event_type?: string | null
          gross_base_amount?: number | null
          id?: string
          payment_id?: string | null
          payout_id?: string | null
          referred_user_id?: string | null
          referrer_user_id?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      referral_payout_profiles: {
        Row: {
          created_at: string | null
          id: string
          payout_details: Json | null
          payout_method: string | null
          status: string | null
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          payout_details?: Json | null
          payout_method?: string | null
          status?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          payout_details?: Json | null
          payout_method?: string | null
          status?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      referral_payouts: {
        Row: {
          created_at: string | null
          id: string
          items_count: number | null
          paid_at: string | null
          payout_method: string | null
          payout_status: string | null
          provider_reference: string | null
          referrer_user_id: string | null
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          items_count?: number | null
          paid_at?: string | null
          payout_method?: string | null
          payout_status?: string | null
          provider_reference?: string | null
          referrer_user_id?: string | null
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          items_count?: number | null
          paid_at?: string | null
          payout_method?: string | null
          payout_status?: string | null
          provider_reference?: string | null
          referrer_user_id?: string | null
          total_amount?: number | null
        }
        Relationships: []
      }
      referral_profiles: {
        Row: {
          created_at: string | null
          id: string
          referral_code: string
          referral_link: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          referral_code: string
          referral_link: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          referral_code?: string
          referral_link?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          currency: string
          gateway_refund_id: string | null
          id: string
          order_id: string
          payment_id: string
          processed_at: string | null
          reason: string | null
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          gateway_refund_id?: string | null
          id?: string
          order_id: string
          payment_id: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          gateway_refund_id?: string | null
          id?: string
          order_id?: string
          payment_id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reserve_entries: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string | null
          release_at: string
          released_at: string | null
          reserve_percent: number
          split_entry_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          release_at: string
          released_at?: string | null
          reserve_percent?: number
          split_entry_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          release_at?: string
          released_at?: string | null
          reserve_percent?: number
          split_entry_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserve_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserve_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reserve_policies: {
        Row: {
          auto_adjust_by_risk: boolean
          created_at: string
          id: string
          release_window_days: number
          reserve_percent: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_adjust_by_risk?: boolean
          created_at?: string
          id?: string
          release_window_days?: number
          reserve_percent?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_adjust_by_risk?: boolean
          created_at?: string
          id?: string
          release_window_days?: number
          reserve_percent?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserve_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          expires_at: string
          id: string
          ip_address: string | null
          token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      split_entries: {
        Row: {
          affiliate_fee: number
          available_at: string | null
          created_at: string
          creator_net: number
          gateway_fee: number
          gross_amount: number
          id: string
          order_id: string | null
          platform_fee: number
          refunded_at: string | null
          settled_at: string | null
          split_rule_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          affiliate_fee?: number
          available_at?: string | null
          created_at?: string
          creator_net?: number
          gateway_fee?: number
          gross_amount: number
          id?: string
          order_id?: string | null
          platform_fee?: number
          refunded_at?: string | null
          settled_at?: string | null
          split_rule_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          affiliate_fee?: number
          available_at?: string | null
          created_at?: string
          creator_net?: number
          gateway_fee?: number
          gross_amount?: number
          id?: string
          order_id?: string | null
          platform_fee?: number
          refunded_at?: string | null
          settled_at?: string | null
          split_rule_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_entries_split_rule_id_fkey"
            columns: ["split_rule_id"]
            isOneToOne: false
            referencedRelation: "split_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      split_rules: {
        Row: {
          affiliate_percent: number
          community_id: string | null
          created_at: string
          creator_percent: number
          hold_days: number
          id: string
          is_default: boolean
          platform_percent: number
          product_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          affiliate_percent?: number
          community_id?: string | null
          created_at?: string
          creator_percent?: number
          hold_days?: number
          id?: string
          is_default?: boolean
          platform_percent?: number
          product_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          affiliate_percent?: number
          community_id?: string | null
          created_at?: string
          creator_percent?: number
          hold_days?: number
          id?: string
          is_default?: boolean
          platform_percent?: number
          product_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_rules_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_blocks: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_visible: boolean
          position: number
          storefront_id: string
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_visible?: boolean
          position?: number
          storefront_id: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_visible?: boolean
          position?: number
          storefront_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_blocks_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_themes: {
        Row: {
          background_color: string | null
          button_style: string | null
          created_at: string | null
          custom_css: string | null
          font_body: string | null
          font_heading: string | null
          id: string
          primary_color: string | null
          secondary_color: string | null
          storefront_id: string
          template_key: string | null
          text_color: string | null
          updated_at: string | null
        }
        Insert: {
          background_color?: string | null
          button_style?: string | null
          created_at?: string | null
          custom_css?: string | null
          font_body?: string | null
          font_heading?: string | null
          id?: string
          primary_color?: string | null
          secondary_color?: string | null
          storefront_id: string
          template_key?: string | null
          text_color?: string | null
          updated_at?: string | null
        }
        Update: {
          background_color?: string | null
          button_style?: string | null
          created_at?: string | null
          custom_css?: string | null
          font_body?: string | null
          font_heading?: string | null
          id?: string
          primary_color?: string | null
          secondary_color?: string | null
          storefront_id?: string
          template_key?: string | null
          text_color?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_themes_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      storefronts: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          id: string
          is_published: boolean | null
          slug: string
          social_links: Json | null
          title: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          slug: string
          social_links?: Json | null
          title?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          slug?: string
          social_links?: Json | null
          title?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefronts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_id: string | null
          product_id: string
          trial_days: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_id?: string | null
          product_id: string
          trial_days?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          billing_interval?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_id?: string | null
          product_id?: string
          trial_days?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plans_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          card_token: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          customer_id: string
          dunning_attempts: number
          id: string
          last_dunning_at: string | null
          status: string
          subscription_plan_id: string
          trial_end: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          card_token?: string | null
          created_at?: string
          current_period_end: string
          current_period_start?: string
          customer_id: string
          dunning_attempts?: number
          id?: string
          last_dunning_at?: string | null
          status?: string
          subscription_plan_id: string
          trial_end?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          card_token?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          customer_id?: string
          dunning_attempts?: number
          id?: string
          last_dunning_at?: string | null
          status?: string
          subscription_plan_id?: string
          trial_end?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      upsell_offers: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          headline: string | null
          id: string
          is_active: boolean
          position: number
          special_price: number
          trigger_product_id: string
          type: string
          updated_at: string
          upsell_product_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          headline?: string | null
          id?: string
          is_active?: boolean
          position?: number
          special_price?: number
          trigger_product_id: string
          type?: string
          updated_at?: string
          upsell_product_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          headline?: string | null
          id?: string
          is_active?: boolean
          position?: number
          special_price?: number
          trigger_product_id?: string
          type?: string
          updated_at?: string
          upsell_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upsell_offers_trigger_product_id_fkey"
            columns: ["trigger_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_offers_upsell_product_id_fkey"
            columns: ["upsell_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount: number
          available_at: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          order_id: string | null
          status: string
          type: string
          withdrawal_id: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          available_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          order_id?: string | null
          status?: string
          type: string
          withdrawal_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          available_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          order_id?: string | null
          status?: string
          type?: string
          withdrawal_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_withdrawal_fk"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_delivery_log: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          payload_hash: string | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload_hash?: string | null
          status?: string
          workspace_id?: string | null
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload_hash?: string | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          event_type: string
          external_event_id: string
          headers: Json | null
          id: string
          last_attempt_at: string | null
          next_retry_at: string | null
          order_id: string | null
          payload: Json
          processed_at: string | null
          provider: string
          status: string
          status_after: string | null
          status_before: string | null
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          event_type: string
          external_event_id: string
          headers?: Json | null
          id?: string
          last_attempt_at?: string | null
          next_retry_at?: string | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider: string
          status?: string
          status_after?: string | null
          status_before?: string | null
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          event_type?: string
          external_event_id?: string
          headers?: Json | null
          id?: string
          last_attempt_at?: string | null
          next_retry_at?: string | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string
          status_after?: string | null
          status_before?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      week1_plan: {
        Row: {
          category: string
          created_at: string
          due_date: string | null
          id: string
          owner: string | null
          priority: number
          status: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          due_date?: string | null
          id?: string
          owner?: string | null
          priority?: number
          status?: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          due_date?: string | null
          id?: string
          owner?: string | null
          priority?: number
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "week1_plan_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          api_url: string | null
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string | null
          phone_number: string | null
          qr_code: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          api_url?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          api_url?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          message_template: string
          trigger_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          message_template: string
          trigger_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          message_template?: string
          trigger_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          currency: string
          failed_at: string | null
          failure_reason: string | null
          fee: number
          gateway_transfer_id: string | null
          id: string
          idempotency_key: string | null
          net_amount: number
          paid_at: string | null
          processed_at: string | null
          requested_at: string
          requested_by: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          fee?: number
          gateway_transfer_id?: string | null
          id?: string
          idempotency_key?: string | null
          net_amount: number
          paid_at?: string | null
          processed_at?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          fee?: number
          gateway_transfer_id?: string | null
          id?: string
          idempotency_key?: string | null
          net_amount?: number
          paid_at?: string | null
          processed_at?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          billing_cycle: string
          canceled_at: string | null
          change_effective_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          last_event_at: string | null
          last_event_id: string | null
          next_plan_code: string | null
          plan_code: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          billing_cycle?: string
          canceled_at?: string | null
          change_effective_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_event_at?: string | null
          last_event_id?: string | null
          next_plan_code?: string | null
          plan_code: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          billing_cycle?: string
          canceled_at?: string | null
          change_effective_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_event_at?: string | null
          last_event_id?: string | null
          next_plan_code?: string | null
          plan_code?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          activated_at: string | null
          created_at: string
          currency: string
          id: string
          logo_url: string | null
          metadata: Json | null
          name: string
          plan: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          logo_url?: string | null
          metadata?: Json | null
          name: string
          plan?: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          plan?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      data_consistency_check: {
        Row: {
          check_name: string | null
          issue_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_payout_risk: {
        Args: { p_workspace_id: string }
        Returns: {
          payout_count_today: number
          payout_total_today: number
          recent_chargebacks: number
          refund_ratio: number
          risk_flags: Json
          risk_score: number
        }[]
      }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      generate_unique_slug: { Args: { base_name: string }; Returns: string }
      get_community_ids_for_user: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_community_member_id: {
        Args: { _community_id: string; _user_id: string }
        Returns: string
      }
      get_community_member_ids_for_user: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_creator_balance: {
        Args: { p_workspace_id: string }
        Returns: {
          available_balance: number
          pending_balance: number
          total_fees: number
          total_gross: number
          total_net: number
          total_payouts: number
        }[]
      }
      get_reserve_balance: {
        Args: { p_workspace_id: string }
        Returns: {
          total_held: number
          total_released: number
          upcoming_releases: number
        }[]
      }
      get_split_rule: {
        Args: { p_product_id?: string; p_workspace_id: string }
        Returns: {
          affiliate_percent: number
          creator_percent: number
          hold_days: number
          id: string
          platform_percent: number
        }[]
      }
      get_wallet_balance: {
        Args: { p_workspace_id: string }
        Returns: {
          available_balance: number
          pending_balance: number
          total_balance: number
        }[]
      }
      get_workspace_plan: { Args: { p_workspace_id: string }; Returns: string }
      has_active_circle_subscription: {
        Args: { _community_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_community_member: {
        Args: { _community_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      community_access_type: "FREE_WITH_PRODUCT" | "PAID_SUBSCRIPTION" | "OPEN"
      community_member_role: "OWNER" | "ADMIN" | "MODERATOR" | "MEMBER"
      community_member_status:
        | "PENDING"
        | "ACTIVE"
        | "MUTED"
        | "BANNED"
        | "LEFT"
      event_status: "UPCOMING" | "LIVE" | "COMPLETED" | "CANCELLED"
      notification_type:
        | "POST_REPLY"
        | "COMMENT_REPLY"
        | "POST_LIKE"
        | "COMMENT_LIKE"
        | "MENTION"
        | "NEW_EVENT"
        | "NEW_POST_IN_SPACE"
        | "MEMBER_JOINED"
        | "LEVEL_UP"
        | "POST_PINNED"
        | "EVENT_REMINDER"
      point_action:
        | "POST_CREATED"
        | "COMMENT_CREATED"
        | "LIKE_RECEIVED"
        | "POST_LIKED"
        | "COURSE_COMPLETED"
        | "EVENT_ATTENDED"
        | "DAILY_LOGIN"
        | "STREAK_BONUS"
        | "ADMIN_BONUS"
        | "ADMIN_PENALTY"
      post_type: "DISCUSSION" | "QUESTION" | "POLL" | "ANNOUNCEMENT" | "WIN"
      price_type: "ONE_TIME" | "RECURRING"
      product_status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
      product_type:
        | "DIGITAL"
        | "COURSE"
        | "SERVICE"
        | "PHYSICAL"
        | "LEAD_MAGNET"
      rsvp_status: "GOING" | "MAYBE" | "NOT_GOING"
      workspace_role: "OWNER" | "ADMIN" | "MEMBER"
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
      community_access_type: ["FREE_WITH_PRODUCT", "PAID_SUBSCRIPTION", "OPEN"],
      community_member_role: ["OWNER", "ADMIN", "MODERATOR", "MEMBER"],
      community_member_status: ["PENDING", "ACTIVE", "MUTED", "BANNED", "LEFT"],
      event_status: ["UPCOMING", "LIVE", "COMPLETED", "CANCELLED"],
      notification_type: [
        "POST_REPLY",
        "COMMENT_REPLY",
        "POST_LIKE",
        "COMMENT_LIKE",
        "MENTION",
        "NEW_EVENT",
        "NEW_POST_IN_SPACE",
        "MEMBER_JOINED",
        "LEVEL_UP",
        "POST_PINNED",
        "EVENT_REMINDER",
      ],
      point_action: [
        "POST_CREATED",
        "COMMENT_CREATED",
        "LIKE_RECEIVED",
        "POST_LIKED",
        "COURSE_COMPLETED",
        "EVENT_ATTENDED",
        "DAILY_LOGIN",
        "STREAK_BONUS",
        "ADMIN_BONUS",
        "ADMIN_PENALTY",
      ],
      post_type: ["DISCUSSION", "QUESTION", "POLL", "ANNOUNCEMENT", "WIN"],
      price_type: ["ONE_TIME", "RECURRING"],
      product_status: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      product_type: ["DIGITAL", "COURSE", "SERVICE", "PHYSICAL", "LEAD_MAGNET"],
      rsvp_status: ["GOING", "MAYBE", "NOT_GOING"],
      workspace_role: ["OWNER", "ADMIN", "MEMBER"],
    },
  },
} as const
