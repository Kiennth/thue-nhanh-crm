import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import fs from "fs";

config({ path: ".env.local" });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PRODUCT_TYPE_BY_LABEL = { "Cho thuê": "rental", Bán: "sale", "Dịch vụ": "service" };
const TRACKING_TYPE_BY_LABEL = { "Theo số lượng": "quantity", "Theo từng sản phẩm": "individual" };
const PERIOD_BY_LABEL = { giờ: "hour", ngày: "day", tuần: "week", tháng: "month", năm: "year" };
const PRICING_TEMPLATE_ID_BY_NAME = { "80% Tháng": "88a44846-ec1d-46bb-b508-09d5c5f60a78" };
const STOCK_QTY_PER_BRANCH = 10;

function slug(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)
    .toUpperCase();
}

async function main() {
  const inputPath =
    process.argv[2] ||
    "/private/tmp/claude-503/-Users-trungkien-Library-Mobile-Documents-com-apple-CloudDocs-Project-THU--NHANH-Thu--Nhanh-CRM/504cdc52-1869-4e90-9309-0cb680f037d4/scratchpad/sheet-real-rows.json";
  const rows = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

  const { data: branches } = await db.from("branches").select("id,name");
  const branchIds = branches.map((b) => b.id);

  const { data: existingTypes } = await db.from("equipment_types").select("name");
  const existingNames = new Set(existingTypes.map((e) => e.name.trim().toLowerCase()));

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row["Tên hàng hoá"].trim();
    if (existingNames.has(name.toLowerCase())) {
      console.log(`⏭️  ${name} (đã tồn tại)`);
      skipped++;
      continue;
    }

    const productType = PRODUCT_TYPE_BY_LABEL[row["Loại"]];
    if (!productType) {
      console.error(`❌ ${name}: Loại không hợp lệ "${row["Loại"]}"`);
      continue;
    }

    const price = Number(row["Giá"]) || 0;
    const depositAmount = Number(row["Tiền cọc / đơn vị"]) || 0;

    const insertPayload = { name, product_type: productType, price };

    if (productType === "rental") {
      const trackingType = TRACKING_TYPE_BY_LABEL[row["Kiểu theo dõi"]];
      const periodUnit = PERIOD_BY_LABEL[row["Đơn vị thời gian"]];
      if (!trackingType || !periodUnit) {
        console.error(`❌ ${name}: thiếu Kiểu theo dõi/Đơn vị thời gian`);
        continue;
      }
      const cachTinhGia = row["Cách Tính Giá"];
      const pricingMethod = cachTinhGia === "Giá cố định" ? "flat_fee" : "pricing_structure";
      const pricingTemplateId = pricingMethod === "pricing_structure" ? PRICING_TEMPLATE_ID_BY_NAME[cachTinhGia] : null;
      if (pricingMethod === "pricing_structure" && !pricingTemplateId) {
        console.error(`❌ ${name}: không tìm thấy bảng giá mẫu "${cachTinhGia}"`);
        continue;
      }
      Object.assign(insertPayload, {
        tracking_type: trackingType,
        pricing_method: pricingMethod,
        rental_period_unit: periodUnit,
        pricing_template_id: pricingTemplateId,
        deposit_amount: depositAmount,
      });
    }

    const { data: inserted, error } = await db.from("equipment_types").insert(insertPayload).select("id").single();
    if (error) {
      console.error(`❌ ${name}: ${error.message}`);
      continue;
    }

    if (productType === "rental") {
      const trackingType = insertPayload.tracking_type;
      if (trackingType === "quantity") {
        const { data: unit, error: unitErr } = await db
          .from("equipment_units")
          .insert({ equipment_type_id: inserted.id, brand_model: name })
          .select("id")
          .single();
        if (unitErr) {
          console.error(`❌ ${name}: tạo equipment_unit thất bại — ${unitErr.message}`);
          continue;
        }
        const stockRows = branchIds.map((branchId) => ({
          equipment_unit_id: unit.id,
          branch_id: branchId,
          quantity_in_stock: STOCK_QTY_PER_BRANCH,
        }));
        const { error: stockErr } = await db.from("equipment_stock").insert(stockRows);
        if (stockErr) console.error(`❌ ${name}: tạo equipment_stock thất bại — ${stockErr.message}`);
      } else if (trackingType === "individual") {
        const instanceRows = [];
        for (const branchId of branchIds) {
          for (let i = 0; i < STOCK_QTY_PER_BRANCH; i++) {
            instanceRows.push({
              equipment_type_id: inserted.id,
              identifier_code: `AUTO-${slug(name)}-${randomUUID().slice(0, 8)}`,
              branch_id: branchId,
              status: "available",
            });
          }
        }
        const { error: instErr } = await db.from("equipment_instances").insert(instanceRows);
        if (instErr) console.error(`❌ ${name}: tạo equipment_instances thất bại — ${instErr.message}`);
      }
    }

    console.log(`✅ ${name} (${productType})`);
    created++;
  }

  console.log(`\n=== Tổng kết ===`);
  console.log("Tạo mới:", created);
  console.log("Đã có sẵn (bỏ qua):", skipped);
}

main().catch((err) => {
  console.error("Script lỗi:", err);
  process.exit(1);
});
