export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          last_played_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          last_played_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          last_played_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          event_date: string;
          starts_at: string;
          duration_minutes: number;
          capacity: number;
          signup_opens_at: string;
          confirmation_at: string;
          status: "open" | "confirmed" | "closed";
          created_at: string;
        };
        Insert: {
          id?: string;
          event_date: string;
          starts_at?: string;
          duration_minutes?: number;
          capacity?: number;
          signup_opens_at: string;
          confirmation_at: string;
          status?: "open" | "confirmed" | "closed";
          created_at?: string;
        };
        Update: {
          id?: string;
          event_date?: string;
          starts_at?: string;
          duration_minutes?: number;
          capacity?: number;
          signup_opens_at?: string;
          confirmation_at?: string;
          status?: "open" | "confirmed" | "closed";
          created_at?: string;
        };
        Relationships: [];
      };
      session_signups: {
        Row: {
          session_id: string;
          user_id: string;
          status: "requested" | "selected" | "waitlisted" | "played" | "cancelled";
          signed_up_at: string;
          slot_number: number | null;
        };
        Insert: {
          session_id: string;
          user_id: string;
          status?: "requested" | "selected" | "waitlisted" | "played" | "cancelled";
          signed_up_at?: string;
          slot_number?: number | null;
        };
        Update: {
          session_id?: string;
          user_id?: string;
          status?: "requested" | "selected" | "waitlisted" | "played" | "cancelled";
          signed_up_at?: string;
          slot_number?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_next_week_sessions: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      request_session_signup: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      cancel_session_signup: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      get_dashboard_sessions: {
        Args: { p_from_date: string; p_through_date: string };
        Returns: {
          id: string;
          event_date: string;
          day_name: string;
          starts_at: string;
          duration_minutes: number;
          capacity: number;
          registered_count: number;
          signup_opens_at: string;
          confirmation_at: string;
          status: string;
          current_user_status: string | null;
          current_user_slot: number | null;
        }[];
      };
      get_session_roster: {
        Args: { p_session_id: string };
        Returns: {
          session_id: string;
          slot_number: number;
          user_id: string;
          display_name: string;
        }[];
      };
      check_in_to_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      finalize_due_sessions: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
