
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "club_friend_list": {
                  Row: {
                    "created_at": string,"friend_user_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"friend_user_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"friend_user_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "club_friend_list_friend_user_id_fkey"
      columns: ["friend_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "club_friend_list_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"dev_virtual_clock": {
                  Row: {
                    "id": number,"updated_at": string,"virtual_now": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id": number,"updated_at"?: string,"virtual_now"?: string | null
                  }
                  Update: {
                    "id"?: number,"updated_at"?: string,"virtual_now"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "can_choose_professional": boolean,"committee_auto_signup": boolean,"created_at": string,"display_name": string,"id": string,"is_committee": boolean,"is_committee_admin": boolean,"last_played_at": string | null,"player_level": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_choose_professional"?: boolean,"committee_auto_signup"?: boolean,"created_at"?: string,"display_name": string,"id": string,"is_committee"?: boolean,"is_committee_admin"?: boolean,"last_played_at"?: string | null,"player_level"?: string
                  }
                  Update: {
                    "can_choose_professional"?: boolean,"committee_auto_signup"?: boolean,"created_at"?: string,"display_name"?: string,"id"?: string,"is_committee"?: boolean,"is_committee_admin"?: boolean,"last_played_at"?: string | null,"player_level"?: string
                  }
                  Relationships: [
                    
                  ]
                },"session_friend_preferences": {
                  Row: {
                    "created_at": string,"friend_user_id": string,"session_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"friend_user_id": string,"session_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"friend_user_id"?: string,"session_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_friend_preferences_friend_user_id_fkey"
      columns: ["friend_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_friend_preferences_session_id_user_id_fkey"
      columns: ["session_id","user_id"]
isOneToOne: false
      referencedRelation: "session_signups"
      referencedColumns: ["session_id","user_id"]
    }
                  ]
                },"session_signups": {
                  Row: {
                    "session_id": string,"signed_up_at": string,"slot_number": number | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "session_id": string,"signed_up_at"?: string,"slot_number"?: number | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "session_id"?: string,"signed_up_at"?: string,"slot_number"?: number | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_signups_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_signups_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"session_templates": {
                  Row: {
                    "allocation_mode": string,"capacity": number,"committee_auto_signup": boolean,"confirmation_at": string,"confirmation_lead_days": number,"created_at": string,"duration_minutes": number,"fee_cents": number,"id": string,"is_active": boolean,"name": string,"signup_opens_at": string,"signup_opens_lead_days": number,"starts_at": string,"updated_at": string,"valid_from": string | null,"valid_until": string | null,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allocation_mode"?: string,"capacity": number,"committee_auto_signup"?: boolean,"confirmation_at"?: string,"confirmation_lead_days"?: number,"created_at"?: string,"duration_minutes": number,"fee_cents"?: number,"id"?: string,"is_active"?: boolean,"name": string,"signup_opens_at"?: string,"signup_opens_lead_days"?: number,"starts_at": string,"updated_at"?: string,"valid_from"?: string | null,"valid_until"?: string | null,"weekday": number
                  }
                  Update: {
                    "allocation_mode"?: string,"capacity"?: number,"committee_auto_signup"?: boolean,"confirmation_at"?: string,"confirmation_lead_days"?: number,"created_at"?: string,"duration_minutes"?: number,"fee_cents"?: number,"id"?: string,"is_active"?: boolean,"name"?: string,"signup_opens_at"?: string,"signup_opens_lead_days"?: number,"starts_at"?: string,"updated_at"?: string,"valid_from"?: string | null,"valid_until"?: string | null,"weekday"?: number
                  }
                  Relationships: [
                    
                  ]
                },"sessions": {
                  Row: {
                    "allocation_mode": string,"capacity": number,"committee_auto_signup": boolean,"confirmation_at": string,"created_at": string,"duration_minutes": number,"event_date": string,"fee_cents": number,"id": string,"signup_opens_at": string,"starts_at": string,"status": string,"template_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allocation_mode"?: string,"capacity"?: number,"committee_auto_signup"?: boolean,"confirmation_at": string,"created_at"?: string,"duration_minutes"?: number,"event_date": string,"fee_cents"?: number,"id"?: string,"signup_opens_at": string,"starts_at"?: string,"status"?: string,"template_id"?: string | null
                  }
                  Update: {
                    "allocation_mode"?: string,"capacity"?: number,"committee_auto_signup"?: boolean,"confirmation_at"?: string,"created_at"?: string,"duration_minutes"?: number,"event_date"?: string,"fee_cents"?: number,"id"?: string,"signup_opens_at"?: string,"starts_at"?: string,"status"?: string,"template_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "session_templates"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_my_friend":
{ Args: { "p_friend_user_id": string }; Returns: undefined
                           },
"admin_list_club_players":
{ Args: Record<PropertyKey, never>; Returns: {
              "can_choose_professional": boolean,"display_name": string,"is_committee": boolean,"player_level": string,"user_id": string
            }[]
                           },
"admin_list_session_templates":
{ Args: Record<PropertyKey, never>; Returns: {
              "allocation_mode": string,"capacity": number,"committee_auto_signup": boolean,"confirmation_at": string,"confirmation_lead_days": number,"created_at": string,"duration_minutes": number,"fee_cents": number,"id": string,"is_active": boolean,"name": string,"signup_opens_at": string,"signup_opens_lead_days": number,"starts_at": string,"updated_at": string,"valid_from": string,"valid_until": string,"weekday": number
            }[]
                           },
"admin_publish_scheduled_sessions":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_count": number,"removed_count": number,"updated_count": number
            }[]
                           },
"admin_set_committee_status":
{ Args: { "p_is_committee": boolean,"p_user_id": string }; Returns: undefined
                           },
"admin_set_professional_choice":
{ Args: { "p_enabled": boolean,"p_user_id": string }; Returns: undefined
                           },
"admin_set_session_happening":
{ Args: { "p_happening": boolean,"p_session_id": string }; Returns: undefined
                           },
"admin_set_session_template_active":
{ Args: { "p_is_active": boolean,"p_template_id": string | null }; Returns: undefined
                           },
"admin_update_player_access":
{ Args: { "p_is_committee": boolean,"p_player_level": string,"p_user_id": string }; Returns: undefined
                           },
"admin_upsert_session_template":
{ Args: { "p_allocation_mode": string,"p_capacity": number,"p_committee_auto_signup": boolean,"p_confirmation_at": string,"p_confirmation_lead_days": number,"p_duration_minutes": number,"p_fee_cents": number,"p_is_active": boolean,"p_name": string,"p_signup_opens_at": string,"p_signup_opens_lead_days": number,"p_starts_at": string,"p_template_id": string | null,"p_valid_from": string | null,"p_valid_until": string | null,"p_weekday": number }; Returns: string
                           },
"cancel_session_signup":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"check_in_to_session":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"ensure_next_week_sessions":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"ensure_scheduled_sessions":
{ Args: { "p_weeks_ahead"?: number }; Returns: number
                           },
"finalize_due_sessions":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"find_club_member_by_student_id":
{ Args: { "p_student_id": string }; Returns: {
              "display_name": string,"is_selected": boolean,"player_level": string,"student_id": string,"user_id": string
            }[]
                           },
"find_club_members":
{ Args: { "p_query": string,"p_session_id"?: string }; Returns: {
              "display_name": string,"is_selected": boolean,"is_signed_up": boolean,"player_level": string,"student_id": string,"user_id": string
            }[]
                           },
"get_dashboard_sessions":
{ Args: { "p_from_date": string,"p_through_date": string }; Returns: {
              "allocation_mode": string,"capacity": number,"confirmation_at": string,"current_user_slot": number,"current_user_status": string,"day_name": string,"duration_minutes": number,"event_date": string,"fee_cents": number,"id": string,"registered_count": number,"signup_opens_at": string,"starts_at": string,"status": string
            }[]
                           },
"get_dashboard_window":
{ Args: Record<PropertyKey, never>; Returns: {
              "from_date": string,"next_change_at": string,"through_date": string
            }[]
                           },
"get_my_friend_list":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"player_level": string,"student_id": string,"user_id": string
            }[]
                           },
"get_session_friend_preferences":
{ Args: { "p_session_id": string }; Returns: {
              "display_name": string,"is_selected": boolean,"is_signed_up": boolean,"player_level": string,"student_id": string,"user_id": string
            }[]
                           },
"get_session_roster":
{ Args: { "p_session_id": string }; Returns: {
              "display_name": string,"session_id": string,"slot_number": number,"user_id": string
            }[]
                           },
"get_virtual_now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"hook_restrict_club_email":
{ Args: { "event": Json }; Returns: Json
                           },
"join_confirmed_session":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"list_dev_test_users":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"email": string,"friend_count": number,"id": string,"is_committee": boolean,"is_committee_admin": boolean,"player_level": string
            }[]
                           },
"now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"remove_my_friend":
{ Args: { "p_friend_user_id": string }; Returns: undefined
                           },
"request_session_signup":
{ Args: { "p_friend_ids"?: (string)[],"p_session_id": string }; Returns: undefined
                           },
"reset_virtual_now":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"set_my_committee_auto_signup":
{ Args: { "p_enabled": boolean }; Returns: undefined
                           },
"set_virtual_now":
{ Args: { "p_virtual_now": string }; Returns: undefined
                           },
"update_my_player_level":
{ Args: { "p_player_level": string }; Returns: undefined
                           },
"update_session_friend_preferences":
{ Args: { "p_friend_ids"?: (string)[],"p_session_id": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
