// Viết tay tạm thời, khớp với supabase/migrations/20260719000000_initial_schema.sql.
// Sau khi link project Supabase thật, chạy lệnh sau để thay bằng bản generate chính xác:
//   npx supabase gen types typescript --linked > src/types/database.ts

export type UserRole = "admin" | "ke_toan" | "ky_thuat_sales" | "quan_ly_chi_nhanh";

export type CustomerType = "individual" | "company";

export type ProductType = "rental" | "sale" | "service";
export type TrackingType = "individual" | "quantity";
export type PricingMethod = "flat_fee" | "pricing_structure";
export type RentalPeriodUnit = "hour" | "day" | "week" | "month" | "year";
export type EquipmentInstanceStatus = "available" | "rented" | "maintenance";

export type TaskType =
  | "tiep_nhan_yeu_cau"
  | "bao_gia"
  | "chot_don"
  | "ky_hop_dong_thu_coc"
  | "chuan_bi"
  | "giao_hang_ban_giao"
  | "van_hanh_xu_ly_su_co"
  | "thu_hoi"
  | "nghiem_thu"
  | "nhap_kho_bao_tri";

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
          customer_type: CustomerType;
          tax_code: string | null;
          address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          customer_type?: CustomerType;
          tax_code?: string | null;
          address?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      equipment_types: {
        Row: {
          id: string;
          name: string;
          product_type: ProductType;
          tracking_type: TrackingType | null;
          pricing_method: PricingMethod | null;
          price: number;
          rental_period_unit: RentalPeriodUnit | null;
          pricing_template_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          product_type?: ProductType;
          tracking_type?: TrackingType | null;
          pricing_method?: PricingMethod | null;
          price: number;
          rental_period_unit?: RentalPeriodUnit | null;
          pricing_template_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_types"]["Insert"]>;
        Relationships: [];
      };
      pricing_templates: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["pricing_templates"]["Insert"]>;
        Relationships: [];
      };
      pricing_template_tiers: {
        Row: {
          id: string;
          template_id: string;
          min_duration: number;
          duration_unit: RentalPeriodUnit;
          discount_percentage: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          min_duration: number;
          duration_unit: RentalPeriodUnit;
          discount_percentage: number;
        };
        Update: Partial<Database["public"]["Tables"]["pricing_template_tiers"]["Insert"]>;
        Relationships: [];
      };
      equipment_instances: {
        Row: {
          id: string;
          equipment_type_id: string;
          identifier_code: string;
          branch_id: string | null;
          status: EquipmentInstanceStatus;
          condition_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_type_id: string;
          identifier_code: string;
          branch_id?: string | null;
          status?: EquipmentInstanceStatus;
          condition_notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_instances"]["Insert"]>;
        Relationships: [];
      };
      equipment_units: {
        Row: {
          id: string;
          equipment_type_id: string;
          brand_model: string;
          condition_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_type_id: string;
          brand_model: string;
          condition_notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_units"]["Insert"]>;
        Relationships: [];
      };
      equipment_stock: {
        Row: {
          id: string;
          equipment_unit_id: string;
          branch_id: string;
          quantity_total: number;
          quantity_available: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_unit_id: string;
          branch_id: string;
          quantity_total?: number;
          quantity_available?: number;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_stock"]["Insert"]>;
        Relationships: [];
      };
      equipment_transfers: {
        Row: {
          id: string;
          equipment_unit_id: string;
          from_branch_id: string;
          to_branch_id: string;
          quantity: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          equipment_unit_id: string;
          from_branch_id: string;
          to_branch_id: string;
          quantity: number;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_transfers"]["Insert"]>;
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
      transfer_equipment_stock: {
        Args: {
          p_equipment_unit_id: string;
          p_from_branch_id: string;
          p_to_branch_id: string;
          p_quantity: number;
          p_note?: string | null;
        };
        Returns: void;
      };
    };
  };
}
