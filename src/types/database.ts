// Viết tay tạm thời, khớp với supabase/migrations/20260719000000_initial_schema.sql.
// Sau khi link project Supabase thật, chạy lệnh sau để thay bằng bản generate chính xác:
//   npx supabase gen types typescript --linked > src/types/database.ts

export type UserRole = "giam_doc" | "admin" | "ke_toan" | "cua_hang_truong" | "ky_thuat_sales";

export type CustomerType = "individual" | "company";

export type ProductType = "rental" | "sale" | "service";
export type TrackingType = "individual" | "quantity";
export type PricingMethod = "flat_fee" | "pricing_structure";
export type RentalPeriodUnit = "hour" | "day" | "week" | "month" | "year";
export type EquipmentInstanceStatus = "available" | "rented" | "maintenance" | "disposed";
export type PaymentMethod = "tien_mat" | "chuyen_khoan" | "the" | "vi_dien_tu" | "khac";
export type OrderPaymentType = "invoice" | "deposit_collect" | "deposit_refund";
export type RfidTagStatus = "in_stock" | "with_customer";
export type RfidScanType = "giao_hang" | "thu_hoi";
export type DeliveryMethod = "self_ride" | "external_service";
export type RecurringFrequency = "monthly" | "quarterly" | "yearly";

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
          // Thứ tự hiển thị cố định (Hà Nội > TP HCM > Đà Nẵng > HQ) — null
          // nghĩa là chưa gán, xếp cuối cùng (NULLS LAST mặc định của
          // ORDER BY ... ASC).
          position: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          min_wage_region?: string | null;
          is_active?: boolean;
          position?: number | null;
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
          deposit_percentage: number;
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
          deposit_percentage?: number;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          table_name: string;
          record_id: string | null;
          action: "insert" | "update" | "delete";
          actor_id: string | null;
          old_data: Record<string, unknown> | null;
          new_data: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      equipment_categories: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_categories"]["Insert"]>;
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
          image_url: string | null;
          // Chỉ có giá trị với product_type='service' — % doanh số dòng này
          // trả thẳng cho nhân viên thực hiện (vd Lắp đặt=100, Hỗ trợ kỹ
          // thuật=50), tách khỏi quỹ khoán theo khâu. null = vẫn tính theo
          // quỹ khoán chung như cũ.
          payout_percentage: number | null;
          // Danh mục PHẲNG (1 sản phẩm = 1 category) — null = chưa phân loại.
          category_id: string | null;
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
          image_url?: string | null;
          payout_percentage?: number | null;
          category_id?: string | null;
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
          // Biến thể TUỲ CHỌN — null nghĩa là loại hàng này chưa cần phân
          // biến thể, mỗi serial vẫn độc lập như trước (xem migration
          // 20260802040000).
          equipment_unit_id: string | null;
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
          equipment_unit_id?: string | null;
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
          image_url: string | null;
          // Giá thuê riêng cho biến thể này — null = dùng equipment_types.price.
          price: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_type_id: string;
          brand_model: string;
          condition_notes?: string | null;
          image_url?: string | null;
          price?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_units"]["Insert"]>;
        Relationships: [];
      };
      equipment_stock: {
        Row: {
          id: string;
          equipment_unit_id: string;
          branch_id: string;
          quantity_in_stock: number;
          quantity_picked_up: number;
          quantity_downtime: number;
          // Cột generated = tổng 3 trạng thái, chỉ đọc.
          quantity_total: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_unit_id: string;
          branch_id: string;
          quantity_in_stock?: number;
          quantity_picked_up?: number;
          quantity_downtime?: number;
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
          pickup_branch_id: string;
          return_branch_id: string;
          customer_id: string;
          // Người trực tiếp đặt đơn này — độc lập với khách hàng (customer_id)
          // trên hợp đồng, vì khách agency có thể có nhiều nhân sự khác nhau
          // gọi đặt cho từng đơn.
          orderer_name: string | null;
          orderer_phone: string | null;
          orderer_email: string | null;
          order_date: string;
          total_value: number;
          status: TaskType;
          completed_at: string | null;
          cancelled_at: string | null;
          rental_start_at: string | null;
          rental_end_at: string | null;
          delivery_stock_moved_at: string | null;
          return_stock_transferred_at: string | null;
          // Ghi đè cọc dự kiến cho riêng đơn này (bỏ qua deposit_amount catalog
          // x % cọc khách hàng) — null nghĩa là tính bình thường như trước giờ.
          // Dùng cho các trường hợp hiếm: đơn cũ bị đổi sang sản phẩm khác có
          // cọc khác lúc dọn danh mục, nhưng khách chưa từng được yêu cầu cọc.
          deposit_override_amount: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_code: string;
          pickup_branch_id: string;
          return_branch_id: string;
          customer_id: string;
          orderer_name?: string | null;
          orderer_phone?: string | null;
          orderer_email?: string | null;
          order_date?: string;
          total_value?: number;
          status?: TaskType;
          completed_at?: string | null;
          cancelled_at?: string | null;
          rental_start_at?: string | null;
          rental_end_at?: string | null;
          delivery_stock_moved_at?: string | null;
          return_stock_transferred_at?: string | null;
          deposit_override_amount?: number | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      order_equipment: {
        Row: {
          id: string;
          order_id: string;
          equipment_type_id: string | null;
          custom_name: string | null;
          equipment_unit_id: string | null;
          equipment_instance_id: string | null;
          quantity: number;
          unit_price: number;
          line_total: number;
          // Chỉ có ý nghĩa với dòng dịch vụ có payout_percentage (equipment_type)
          // — ai thực hiện + ngày hoàn thành, dùng để trả khoán trực tiếp.
          employee_id: string | null;
          completed_date: string | null;
          // Chỉ có ý nghĩa với 2 SKU vận chuyển (giao/thu hồi bằng xe máy) —
          // tự chạy hay đặt xe dịch vụ, cùng giờ hẹn trên đơn quyết định %payout
          // (xem computeTransportPayoutPercentage() trong commission.ts).
          delivery_method: DeliveryMethod | null;
          // Ghi chú tự do — hiện dùng cho 4 dòng phí vận chuyển (giao/thu hồi
          // bằng xe máy hoặc ô tô) để ghi địa chỉ + SĐT nhận/trả hàng.
          note: string | null;
          // Thứ tự hiển thị trong "Danh sách thiết bị" — kéo thả để sắp xếp
          // lại; dòng mới tự nối cuối danh sách nếu không truyền (xem trigger
          // set_order_equipment_position).
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          equipment_type_id?: string | null;
          custom_name?: string | null;
          equipment_unit_id?: string | null;
          equipment_instance_id?: string | null;
          quantity?: number;
          unit_price?: number;
          line_total?: number;
          employee_id?: string | null;
          completed_date?: string | null;
          delivery_method?: DeliveryMethod | null;
          note?: string | null;
          position?: number;
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
          payment_type: OrderPaymentType;
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
          payment_type?: OrderPaymentType;
          paid_at?: string;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["order_payments"]["Insert"]>;
        Relationships: [];
      };
      expense_categories: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["expense_categories"]["Insert"]>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          branch_id: string;
          category_id: string;
          amount: number;
          expense_date: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          category_id: string;
          amount: number;
          expense_date: string;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>;
        Relationships: [];
      };
      recurring_expenses: {
        Row: {
          id: string;
          branch_id: string;
          category_id: string;
          amount: number;
          frequency: RecurringFrequency;
          start_date: string;
          end_date: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          category_id: string;
          amount: number;
          frequency?: RecurringFrequency;
          start_date: string;
          end_date?: string | null;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["recurring_expenses"]["Insert"]>;
        Relationships: [];
      };
      overtime_entries: {
        Row: {
          id: string;
          employee_id: string;
          order_id: string | null;
          entry_date: string;
          hours: number | null;
          amount: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          order_id?: string | null;
          entry_date?: string;
          hours?: number | null;
          amount: number;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["overtime_entries"]["Insert"]>;
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
      rfid_tags: {
        Row: {
          id: string;
          tag_code: string;
          equipment_type_id: string;
          equipment_unit_id: string | null;
          equipment_instance_id: string | null;
          branch_id: string | null;
          status: RfidTagStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tag_code: string;
          equipment_type_id: string;
          equipment_unit_id?: string | null;
          equipment_instance_id?: string | null;
          branch_id?: string | null;
          status?: RfidTagStatus;
        };
        Update: Partial<Database["public"]["Tables"]["rfid_tags"]["Insert"]>;
        Relationships: [];
      };
      rfid_scan_log: {
        Row: {
          id: string;
          tag_id: string;
          scan_type: RfidScanType;
          order_id: string | null;
          branch_id: string;
          employee_id: string | null;
          scanned_at: string;
        };
        Insert: {
          id?: string;
          tag_id: string;
          scan_type: RfidScanType;
          order_id?: string | null;
          branch_id: string;
          employee_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["rfid_scan_log"]["Insert"]>;
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
      deliver_order_stock: {
        Args: {
          p_order_id: string;
        };
        Returns: void;
      };
      return_order_stock: {
        Args: {
          p_order_id: string;
        };
        Returns: void;
      };
      undo_deliver_order_stock: {
        Args: {
          p_order_id: string;
        };
        Returns: void;
      };
      undo_return_order_stock: {
        Args: {
          p_order_id: string;
        };
        Returns: void;
      };
      // Hai RPC tổng hợp cho trang /customers — trả jsonb (typed lỏng, page
      // tự ép kiểu sang CustomerReportData/khối danh sách).
      customer_page_report: {
        Args: { p_branch_id?: string | null };
        Returns: unknown;
      };
      customer_page_list: {
        Args: {
          p_branch_id?: string | null;
          p_search?: string | null;
          p_sort?: string;
          p_dir?: string;
          p_page?: number;
          p_page_size?: number;
        };
        Returns: unknown;
      };
      // Lọc/tìm kiếm (join customers)/sắp xếp/phân trang + thẻ tổng kết cho
      // /orders — trả jsonb (typed lỏng, page tự ép kiểu), thay cho việc kéo
      // toàn bộ orders + customers thô về JS (xem migration 20260806120000).
      orders_page_list: {
        Args: {
          p_branch_id?: string | null;
          p_status?: string;
          p_range_start?: string | null;
          p_range_end?: string | null;
          p_search?: string | null;
          p_sort?: string | null;
          p_dir?: string;
          p_page?: number;
          p_page_size?: number;
          p_unpaid_only?: boolean;
        };
        Returns: unknown;
      };
      // Doanh thu/lượt thuê/tồn kho/giá trị tồn kho gộp sẵn theo từng loại
      // hàng — dùng cho /equipment và /branches/[id], thay cho việc kéo
      // order_equipment thô về JS rồi cộng dồn (xem migration 20260806100000).
      equipment_page_report: {
        Args: {
          p_branch_id?: string | null;
          p_start?: string | null;
          p_end?: string | null;
        };
        Returns: {
          equipment_type_id: string;
          revenue: number;
          rental_count: number;
          current_stock_qty: number;
          current_inventory_value: number;
          purchase_cost: number;
          disposal_proceeds: number;
          profit: number;
          profit_ratio: number | null;
        }[];
      };
      ensure_default_equipment_unit: {
        Args: { p_equipment_type_id: string };
        Returns: string;
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
      record_equipment_cost_adjustment: {
        Args: {
          p_equipment_unit_id: string;
          p_branch_id: string;
          p_unit_cost: number;
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
