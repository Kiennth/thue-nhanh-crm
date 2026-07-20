// Viết tay tạm thời, khớp với supabase/migrations/20260719000000_initial_schema.sql.
// Sau khi link project Supabase thật, chạy lệnh sau để thay bằng bản generate chính xác:
//   npx supabase gen types typescript --linked > src/types/database.ts

export type UserRole = "admin" | "ke_toan" | "ky_thuat_sales" | "quan_ly_chi_nhanh";

export type TaskType =
  | "tiep_nhan_bao_gia"
  | "chot_don"
  | "ky_hop_dong"
  | "chuan_bi"
  | "giao_hang"
  | "van_hanh"
  | "thu_hoi"
  | "nhap_kho";

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          name: string;
          min_wage_region: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          min_wage_region?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          name: string;
          department: string | null;
          branch_id: string | null;
          base_salary: number;
          role: UserRole;
          email: string | null;
          user_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          department?: string | null;
          branch_id?: string | null;
          base_salary?: number;
          role?: UserRole;
          email?: string | null;
          user_id?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      equipment_types: {
        Row: {
          id: string;
          name: string;
          branch_id: string;
          rental_price_per_day: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          branch_id: string;
          rental_price_per_day: number;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_types"]["Insert"]>;
        Relationships: [];
      };
      equipment_units: {
        Row: {
          id: string;
          equipment_type_id: string;
          brand_model: string;
          quantity_total: number;
          quantity_available: number;
          condition_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_type_id: string;
          brand_model: string;
          quantity_total?: number;
          quantity_available?: number;
          condition_notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_units"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      employees_public: {
        Row: {
          id: string;
          name: string;
          department: string | null;
          branch_id: string | null;
          role: UserRole;
          is_active: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      auth_role: {
        Args: Record<string, never>;
        Returns: UserRole;
      };
      auth_employee_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_employee: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
  };
}
