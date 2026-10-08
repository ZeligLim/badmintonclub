
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };

  "public": {
          Tables: {
            "profiles": {
                  Row: {
                    "committee_auto_signup": boolean,"created_at": string,"display_name": string,"id": string,"is_committee": boolean,"is_committee_admin": boolean,"last_played_at": string | null,"player_level": string
                  }
                  ComputedFields: never
                  Insert: {
                    "committee_auto_signup"?: boolean,"created_at"?: string,"display_name": string,"id": string,"is_committee"?: boolean,"is_committee_admin"?: boolean,"last_played_at"?: string | null,"player_level"?: string
                  }
                  Update: {
                    "committee_auto_signup"?: boolean,"created_at"?: string,"display_name"?: string,"id"?: string,"is_committee"?: boolean,"is_committee_admin"?: boolean,"last_played_at"?: string | null,"player_level"?: string
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
                },"sessions": {
                  Row: {
                    "capacity": number,"confirmation_at": string,"created_at": string,"duration_minutes": number,"event_date": string,"id": string,"signup_opens_at": string,"starts_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number,"confirmation_at": string,"created_at"?: string,"duration_minutes"?: number,"event_date": string,"id"?: string,"signup_opens_at": string,"starts_at"?: string,"status"?: string
                  }
                  Update: {
                    "capacity"?: number,"confirmation_at"?: string,"created_at"?: string,"duration_minutes"?: number,"event_date"?: string,"id"?: string,"signup_opens_at"?: string,"starts_at"?: string,"status"?: string
                  }
                  Relationships: [

                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_list_club_players":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"is_committee": boolean,"player_level": string,"user_id": string
            }[]
                           },
"admin_update_player_access":
{ Args: { "p_is_committee": boolean,"p_player_level": string,"p_user_id": string }; Returns: undefined
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
"finalize_due_sessions":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"get_dashboard_sessions":
{ Args: { "p_from_date": string,"p_through_date": string }; Returns: {
              "capacity": number,"confirmation_at": string,"current_user_slot": number,"current_user_status": string,"day_name": string,"duration_minutes": number,"event_date": string,"id": string,"registered_count": number,"signup_opens_at": string,"starts_at": string,"status": string
            }[]
                           },
"find_club_member_by_student_id":
{ Args: { "p_student_id": string }; Returns: {
              "display_name": string,"is_selected": boolean,"player_level": string,"student_id": string,"user_id": string
            }[]
                           },
"get_session_friend_preferences":
{ Args: { "p_session_id": string }; Returns: {
              "display_name": string,"is_selected": boolean,"player_level": string,"student_id": string,"user_id": string
            }[]
                           },
"get_session_roster":
{ Args: { "p_session_id": string }; Returns: {
              "display_name": string,"session_id": string,"slot_number": number,"user_id": string
            }[]
                           },
"hook_restrict_club_email":
{ Args: { "event": Json }; Returns: Json
                           },
"join_confirmed_session":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"request_session_signup":
{ Args: { "p_friend_ids"?: (string)[],"p_session_id": string }; Returns: undefined
                           },
"set_my_committee_auto_signup":
{ Args: { "p_enabled": boolean }; Returns: undefined
                           },
"update_my_player_level":
{ Args: { "p_player_level": string }; Returns: undefined
                           }
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
  graphql_public: {
    Enums: {},
  },
  "public": {
          Enums: {

          }
        }
} as const
