export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      messages: {
        Row: {
          auteur_id: string | null
          contenu: string
          cree_le: string
          id: string
          maj_le: string
          projet_id: string | null
          ticket_id: string | null
        }
        Insert: {
          auteur_id?: string | null
          contenu: string
          cree_le?: string
          id?: string
          maj_le?: string
          projet_id?: string | null
          ticket_id?: string | null
        }
        Update: {
          auteur_id?: string | null
          contenu?: string
          cree_le?: string
          id?: string
          maj_le?: string
          projet_id?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_auteur_id_fkey"
            columns: ["auteur_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_projet_id_fkey"
            columns: ["projet_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          cree_le: string
          date_cible: string | null
          id: string
          maj_le: string
          projet_id: string
          sante: Database["public"]["Enums"]["jalon_sante"]
          theme: string
        }
        Insert: {
          cree_le?: string
          date_cible?: string | null
          id?: string
          maj_le?: string
          projet_id: string
          sante?: Database["public"]["Enums"]["jalon_sante"]
          theme: string
        }
        Update: {
          cree_le?: string
          date_cible?: string | null
          id?: string
          maj_le?: string
          projet_id?: string
          sante?: Database["public"]["Enums"]["jalon_sante"]
          theme?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_projet_id_fkey"
            columns: ["projet_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      patterns: {
        Row: {
          cas_usage: string | null
          categorie: string
          cree_le: string
          id: string
          maj_le: string
          nom: string
          principe: string | null
        }
        Insert: {
          cas_usage?: string | null
          categorie: string
          cree_le?: string
          id?: string
          maj_le?: string
          nom: string
          principe?: string | null
        }
        Update: {
          cas_usage?: string | null
          categorie?: string
          cree_le?: string
          id?: string
          maj_le?: string
          nom?: string
          principe?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          cree_le: string
          id: string
          maj_le: string
          nom: string
          proprietaire_id: string
          repo_url: string | null
          statut: Database["public"]["Enums"]["projet_statut"]
        }
        Insert: {
          cree_le?: string
          id?: string
          maj_le?: string
          nom: string
          proprietaire_id: string
          repo_url?: string | null
          statut?: Database["public"]["Enums"]["projet_statut"]
        }
        Update: {
          cree_le?: string
          id?: string
          maj_le?: string
          nom?: string
          proprietaire_id?: string
          repo_url?: string | null
          statut?: Database["public"]["Enums"]["projet_statut"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          auteur_id: string | null
          cree_le: string
          diff_url: string | null
          id: string
          maj_le: string
          preview_url: string | null
          resultat_qualite: Database["public"]["Enums"]["soumission_resultat"]
          resume_md: string | null
          ticket_id: string
        }
        Insert: {
          auteur_id?: string | null
          cree_le?: string
          diff_url?: string | null
          id?: string
          maj_le?: string
          preview_url?: string | null
          resultat_qualite?: Database["public"]["Enums"]["soumission_resultat"]
          resume_md?: string | null
          ticket_id: string
        }
        Update: {
          auteur_id?: string | null
          cree_le?: string
          diff_url?: string | null
          id?: string
          maj_le?: string
          preview_url?: string | null
          resultat_qualite?: Database["public"]["Enums"]["soumission_resultat"]
          resume_md?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_auteur_id_fkey"
            columns: ["auteur_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_patterns: {
        Row: {
          cree_le: string
          pattern_id: string
          role: Database["public"]["Enums"]["ticket_pattern_role"]
          ticket_id: string
        }
        Insert: {
          cree_le?: string
          pattern_id: string
          role?: Database["public"]["Enums"]["ticket_pattern_role"]
          ticket_id: string
        }
        Update: {
          cree_le?: string
          pattern_id?: string
          role?: Database["public"]["Enums"]["ticket_pattern_role"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_patterns_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_patterns_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          complexite: Database["public"]["Enums"]["ticket_complexite"] | null
          contexte: string | null
          cree_le: string
          critere_test: string | null
          criteres_acceptation: string | null
          id: string
          jalon_id: string | null
          maj_le: string
          priorite: Database["public"]["Enums"]["ticket_priorite"]
          projet_id: string
          reclame_le: string | null
          reclame_par: string | null
          score_confiance: number | null
          source: Database["public"]["Enums"]["ticket_source"]
          statut: Database["public"]["Enums"]["ticket_statut"]
          titre: string
        }
        Insert: {
          complexite?: Database["public"]["Enums"]["ticket_complexite"] | null
          contexte?: string | null
          cree_le?: string
          critere_test?: string | null
          criteres_acceptation?: string | null
          id?: string
          jalon_id?: string | null
          maj_le?: string
          priorite?: Database["public"]["Enums"]["ticket_priorite"]
          projet_id: string
          reclame_le?: string | null
          reclame_par?: string | null
          score_confiance?: number | null
          source?: Database["public"]["Enums"]["ticket_source"]
          statut?: Database["public"]["Enums"]["ticket_statut"]
          titre: string
        }
        Update: {
          complexite?: Database["public"]["Enums"]["ticket_complexite"] | null
          contexte?: string | null
          cree_le?: string
          critere_test?: string | null
          criteres_acceptation?: string | null
          id?: string
          jalon_id?: string | null
          maj_le?: string
          priorite?: Database["public"]["Enums"]["ticket_priorite"]
          projet_id?: string
          reclame_le?: string | null
          reclame_par?: string | null
          score_confiance?: number | null
          source?: Database["public"]["Enums"]["ticket_source"]
          statut?: Database["public"]["Enums"]["ticket_statut"]
          titre?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_jalon_id_fkey"
            columns: ["jalon_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_projet_id_fkey"
            columns: ["projet_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_reclame_par_fkey"
            columns: ["reclame_par"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          cree_le: string
          id: string
          maj_le: string
          nom: string
          vibe_score: number | null
          xp: number
        }
        Insert: {
          cree_le?: string
          id: string
          maj_le?: string
          nom: string
          vibe_score?: number | null
          xp?: number
        }
        Update: {
          cree_le?: string
          id?: string
          maj_le?: string
          nom?: string
          vibe_score?: number | null
          xp?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      est_proprietaire_du_projet: { Args: { projet: string }; Returns: boolean }
      projet_est_public: { Args: { projet: string }; Returns: boolean }
      reclamer_ticket: {
        Args: { ticket: string }
        Returns: {
          complexite: Database["public"]["Enums"]["ticket_complexite"] | null
          contexte: string | null
          cree_le: string
          critere_test: string | null
          criteres_acceptation: string | null
          id: string
          jalon_id: string | null
          maj_le: string
          priorite: Database["public"]["Enums"]["ticket_priorite"]
          projet_id: string
          reclame_le: string | null
          reclame_par: string | null
          score_confiance: number | null
          source: Database["public"]["Enums"]["ticket_source"]
          statut: Database["public"]["Enums"]["ticket_statut"]
          titre: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      relacher_ticket: {
        Args: { ticket: string }
        Returns: {
          complexite: Database["public"]["Enums"]["ticket_complexite"] | null
          contexte: string | null
          cree_le: string
          critere_test: string | null
          criteres_acceptation: string | null
          id: string
          jalon_id: string | null
          maj_le: string
          priorite: Database["public"]["Enums"]["ticket_priorite"]
          projet_id: string
          reclame_le: string | null
          reclame_par: string | null
          score_confiance: number | null
          source: Database["public"]["Enums"]["ticket_source"]
          statut: Database["public"]["Enums"]["ticket_statut"]
          titre: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      soumettre_solution: {
        Args: {
          diff_url: string
          preview_url: string
          resume_md?: string
          ticket: string
        }
        Returns: {
          auteur_id: string | null
          cree_le: string
          diff_url: string | null
          id: string
          maj_le: string
          preview_url: string | null
          resultat_qualite: Database["public"]["Enums"]["soumission_resultat"]
          resume_md: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      jalon_sante: "a_jour" | "a_risque" | "bloque"
      projet_statut: "brouillon" | "actif" | "en_pause" | "archive"
      soumission_resultat: "en_attente" | "succes" | "echec"
      ticket_complexite: "S" | "M" | "L"
      ticket_pattern_role: "suggere" | "utilise"
      ticket_priorite: "basse" | "normale" | "haute" | "critique"
      ticket_source: "manuel" | "scan_mcp" | "decouverte_github" | "genere_ia"
      ticket_statut:
        | "brouillon"
        | "ouvert"
        | "reclame"
        | "soumis"
        | "en_revue"
        | "fusionne"
        | "ferme"
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
      jalon_sante: ["a_jour", "a_risque", "bloque"],
      projet_statut: ["brouillon", "actif", "en_pause", "archive"],
      soumission_resultat: ["en_attente", "succes", "echec"],
      ticket_complexite: ["S", "M", "L"],
      ticket_pattern_role: ["suggere", "utilise"],
      ticket_priorite: ["basse", "normale", "haute", "critique"],
      ticket_source: ["manuel", "scan_mcp", "decouverte_github", "genere_ia"],
      ticket_statut: [
        "brouillon",
        "ouvert",
        "reclame",
        "soumis",
        "en_revue",
        "fusionne",
        "ferme",
      ],
    },
  },
} as const

