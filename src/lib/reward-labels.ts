import type { RewardCategory } from "@/types/database";

export const REWARD_CATEGORY_LABELS: Record<RewardCategory, string> = {
  bat_chot: "Bất chợt",
  doanh_so: "Doanh số",
  dinh_ky: "Định kỳ",
  tet: "Tết",
  sinh_nhat: "Sinh nhật",
  khac: "Khác",
};

export const REWARD_CATEGORY_OPTIONS = Object.entries(REWARD_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as RewardCategory, label }),
);
