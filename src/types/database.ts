// Viết tay tạm thời, khớp với supabase/migrations/20260719000000_initial_schema.sql.
// Sau khi link project Supabase thật, chạy lệnh sau để thay bằng bản generate chính xác:
//   npx supabase gen types typescript --linked > src/types/database.ts

export type UserRole = "admin" | "ke_toan" | "ky_thuat_sales" | "quan_ly_chi_nhanh";

export type CustomerType = "individual" | "company";

export type ProductType = "rental" | "sale" | "service";
export type TrackingType = "individual" | "quantity";
export type PricingMethod = "flat_fee" | "pricing_structure";
export type RentalPeriodUnit = "hour" | "day" | "week" | "month" | "year";
export type EquipmentInstanceStatus = "available" | "rented" | "maintenance" | "disposed";
export type PaymentMethod = "tien_mat" | "chuyen_khoan" | "the" | "vi_dien_tu" | "khac";

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
          deposit_amount: number;
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
          deposit_amount?: number;
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
          purchase_price: number | null;
          purchase_date: string | null;
          disposal_price: number | null;
          disposal_date: string | null;
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
          purchase_price?: number | null;
          purchase_date?: string | null;
          disposal_price?: number | null;
          disposal_date?: string | null;
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
      equipment_purchases: {
        Row: {
          id: string;
          equipment_unit_id: string;
          branch_id: string;
          quantity: number;
          unit_cost: number;
          purchase_date: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          equipment_unit_id: string;
          branch_id: string;
          quantity: number;
          unit_cost: number;
          purchase_date?: string;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_purchases"]["Insert"]>;
        Relationships: [];
      };
      equipment_disposals: {
        Row: {
          id: string;
          equipment_unit_id: string;
          branch_id: string;
          quantity: number;
          unit_price: number;
          disposal_date: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          equipment_unit_id: string;
          branch_id: string;
          quantity: number;
          unit_price: number;
          disposal_date?: string;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_disposals"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_code: string;
          branch_id: string;
          customer_id: string;
          order_date: string;
          total_value: number;
          status: TaskType;
          completed_at: string | null;
          cancelled_at: string | null;
          rental_start_at: string | null;
          rental_end_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_code: string;
          branch_id: string;
          customer_id: string;
          order_date?: string;
          total_value?: number;
          status?: TaskType;
          completed_at?: string | null;
          cancelled_at?: string | null;
          rental_start_at?: string | null;
          rental_end_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      order_equipment: {
        Row: {
          id: string;
          order_id: string;
          equipment_type_id: string;
          equipment_unit_id: string | null;
          equipment_instance_id: string | null;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          equipment_type_id: string;
          equipment_unit_id?: string | null;
          equipment_instance_id?: string | null;
          quantity?: number;
          unit_price?: number;
          line_total?: number;
        };
        Update: Partial<Database["public"]["Tables"]["order_equipment"]["Insert"]>;
        Relationships: [];
      };
      order_tasks: {
        Row: {
          id: string;
          order_id: string;
          task_type: TaskType;
          employee_id: string | null;
          completed_date: string | null;
          note: string | null;
          has_issue: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          task_type: TaskType;
          employee_id?: string | null;
          completed_date?: string | null;
          note?: string | null;
          has_issue?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["order_tasks"]["Insert"]>;
        Relationships: [];
      };
      order_payments: {
        Row: {
          id: string;
          order_id: string;
          amount: number;
          method: PaymentMethod;
          paid_at: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          amount: number;
          method: PaymentMethod;
          paid_at?: string;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["order_payments"]["Insert"]>;
        Relationships: [];
      };
      commission_tiers: {
        Row: {
          id: string;
          branch_id: string;
          tier_number: number;
          min_value: number;
          max_value: number | null;
          percentage: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          tier_number: number;
          min_value: number;
          max_value?: number | null;
          percentage: number;
        };
        Update: Partial<Database["public"]["Tables"]["commission_tiers"]["Insert"]>;
        Relationships: [];
      };
      task_weights: {
        Row: {
          id: string;
          task_type: TaskType;
          weight_percentage: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_type: TaskType;
          weight_percentage: number;
        };
        Update: Partial<Database["public"]["Tables"]["task_weights"]["Insert"]>;
        Relationships: [];
      };
      bonus_tiers: {
        Row: {
          id: string;
          branch_id: string;
          tier_number: number;
          threshold_amount: number;
          bonus_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          tier_number: number;
          threshold_amount: number;
          bonus_amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["bonus_tiers"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      employees_public: {
        Row: {
          id: string;
          name: string;
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
      record_equipment_purchase: {
        Args: {
          p_equipment_unit_id: string;
          p_branch_id: string;
          p_quantity: number;
          p_unit_cost: number;
          p_purchase_date: string;
          p_note?: string | null;
        };
        Returns: void;
      };
      record_equipment_disposal: {
        Args: {
          p_equipment_unit_id: string;
          p_branch_id: string;
          p_quantity: number;
          p_unit_price: number;
          p_disposal_date: string;
          p_note?: string | null;
        };
        Returns: void;
      };
    };
  };
}
