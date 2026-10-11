/* ============================================================
 * 賞与計算ロジック（賞与明細プロトから移植した純関数）
 *  - DOMにもFirestoreにも触らない。入力→出力だけ。
 *  - 金額は整数円。料率は「千分の一%」ではなく「十万分の一」の整数で持ち、
 *    浮動小数点の誤差を出さない（4.835% → 4835）。
 * ============================================================ */

import { calcWithholdingTax } from "./tax";

/* ---------- 端数処理 ---------- */

/** num/den を整数に丸める。端数が50銭以下は切り捨て、50銭超は切り上げ（社保・雇用保険の本人負担）。 */
export function roundHalfDown(num, den) {
  const q = Math.floor(num / den);
  const r = num - q * den;
  return r * 2 > den ? q + 1 : q;
}

/** 1円未満切り捨て（源泉所得税） */
export function floorDiv(num, den) {
  return Math.floor(num / den);
}

/* ---------- 年度・月 ---------- */

/** "2026-07-10" → 2026（4月始まりの年度） */
export function fiscalYearOf(dateStr) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

export function ymOf(dateStr) {
  return dateStr.slice(0, 7);
}

/** "2026-07" → "2026-06" */
export function prevYm(ym) {
  let y = Number(ym.slice(0, 4));
  let m = Number(ym.slice(5, 7)) - 1;
  if (m === 0) { y -= 1; m = 12; }
  return y + "-" + String(m).padStart(2, "0");
}

/* ---------- 料率表（全体の料率 %。本人負担は半分） ----------
 * from: この年月分から適用。協会けんぽ埼玉支部。
 * 出典: 協会けんぽ 令和8年度 埼玉支部 保険料額表（令和8年3月分〜）
 *   健保 9.67% / 介護 1.62% / 子ども・子育て支援金 0.23%（令和8年4月分〜）/ 厚年 18.3%
 */
export const DEFAULT_RATE_TABLE = [
  { from: "2025-03", health: 9.76, care: 1.59, support: 0, pension: 18.3 },
  { from: "2026-03", health: 9.67, care: 1.62, support: 0, pension: 18.3 },
  { from: "2026-04", health: 9.67, care: 1.62, support: 0.23, pension: 18.3 },
];

export const DEFAULT_SETTINGS = {
  rates: DEFAULT_RATE_TABLE,
  /** 標準賞与額の上限: 健保・介護・子育て支援金は年度累計 */
  healthYearCap: 5730000,
  /** 厚生年金は1か月（支給月）あたり */
  pensionMonthCap: 1500000,
  /** 雇用保険 本人負担 %。一般の事業 0.5 / 建設の事業 0.6（要確認。初期値は今のアプリに合わせて0.6） */
  employmentRate: 0.6,
  /** 雇用保険 事業主負担 %。令和8年度 一般の事業 0.85 / 建設の事業 1.05（本人負担と同じ区分で要確認） */
  employerEmploymentRate: 1.05,
  /** 子ども・子育て拠出金 %（事業主のみ。厚生年金と同じ標準賞与額にかかる）。令和8年度 0.36 */
  childContributionRate: 0.36,
  /** 労災保険 %（事業主のみ。賞与額にかかる）。現場の労災は元請で入るため初期値は0 */
  workersCompRate: 0,
};

export function pickRates(table, ym) {
  const sorted = table.slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  let hit = null;
  for (const r of sorted) if (r.from <= ym) hit = r;
  return hit; // 該当なしは null
}

/** 全体の料率(%) → 本人負担の十万分率（9.67 → 4835） */
export function employeeUnits(totalPercent) {
  return Math.round(totalPercent * 1000 / 2);
}

/* ---------- 社会保険（賞与） ---------- */

/** 標準賞与額: 1,000円未満切り捨て */
export function standardBonusAmount(bonus) {
  return Math.floor(Math.max(0, bonus) / 1000) * 1000;
}

export function bonusOrderKey(b) {
  return [b.payDate || "", b.createdAt || "", b.id || ""].join("|");
}

/**
 * input: { bonusAmount, payDate, employee:{isOfficer, needsLongTermCareInsurance}, selfId }
 * ctx:   { bonuses:[...], settings }
 * 同じ年度の「先に支給された」賞与の標準賞与額を数えて上限を当てる。
 */
export function calcBonusInsurance(input, ctx) {
  const { bonusAmount, payDate, employee, selfId } = input;
  const settings = ctx.settings;
  const ym = ymOf(payDate);
  const fy = fiscalYearOf(payDate);
  const notes = [];
  const rates = pickRates(settings.rates, ym);
  if (!rates) notes.push({ level: "warn", text: ym + " に当てはまる料率がありません。設定の料率表を確認してください。" });
  const r = rates || { health: 0, care: 0, support: 0, pension: 0 };

  const std = standardBonusAmount(bonusAmount);
  const selfKey = bonusOrderKey({ payDate, createdAt: input.createdAt, id: selfId });
  const prior = (ctx.bonuses || []).filter(
    (b) => !b.deletedAt && b.employeeId === employee.id && b.id !== selfId &&
      fiscalYearOf(b.payDate) === fy && bonusOrderKey(b) < selfKey
  );
  const usedHealth = prior.reduce((s, b) => s + (b.healthBase || 0), 0);
  const priorSameMonth = prior.filter((b) => ymOf(b.payDate) === ym);
  const usedPension = priorSameMonth.reduce((s, b) => s + (b.pensionBase || 0), 0);

  const healthRoom = Math.max(0, settings.healthYearCap - usedHealth);
  const pensionRoom = Math.max(0, settings.pensionMonthCap - usedPension);
  const healthBase = Math.min(std, healthRoom);
  const pensionBase = Math.min(std, pensionRoom);
  if (std > 0 && healthBase < std) {
    notes.push({
      level: "info",
      text: "健康保険・介護・子育て支援金は、年度の上限 " + settings.healthYearCap.toLocaleString("ja-JP") +
        "円に届くため、標準賞与額 " + healthBase.toLocaleString("ja-JP") + "円で計算しています。",
    });
  }
  if (std > 0 && pensionBase < std) {
    notes.push({
      level: "info",
      text: "厚生年金は、1か月の上限 " + settings.pensionMonthCap.toLocaleString("ja-JP") +
        "円までで計算しています。",
    });
  }

  const uHealth = employeeUnits(r.health);
  const uCare = employeeUnits(r.care);
  const uSupport = employeeUnits(r.support);
  const uPension = employeeUnits(r.pension);

  const health = roundHalfDown(healthBase * uHealth, 100000);
  const care = employee.needsLongTermCareInsurance ? roundHalfDown(healthBase * uCare, 100000) : 0;
  const support = roundHalfDown(healthBase * uSupport, 100000);
  const pension = roundHalfDown(pensionBase * uPension, 100000);
  const uEmp = Math.round(settings.employmentRate * 1000);
  const employment = employee.isOfficer ? 0 : roundHalfDown(Math.max(0, bonusAmount) * uEmp, 100000);

  return {
    standardBonus: std,
    healthBase,
    pensionBase,
    healthYearUsedBefore: usedHealth,
    pensionMonthUsedBefore: usedPension,
    employmentInsurance: employment,
    healthInsurance: health,
    longTermCareInsurance: care,
    childcareSupport: support,
    welfarePension: pension,
    employeePercents: {
      health: uHealth / 1000, care: uCare / 1000, support: uSupport / 1000,
      pension: uPension / 1000, employment: settings.employmentRate,
    },
    ratesFrom: rates ? rates.from : null,
    notes,
  };
}

/* ---------- 賞与の源泉所得税（令和8年分 算出率の表・甲欄） ----------
 * 出典: 国税庁 令和8年分 源泉徴収税額表「賞与に対する源泉徴収税額の算出率の表」
 * 行 = [率(%), 扶養0〜3人 [以上,未満](千円) ×4, 扶養4〜7人 [以上,未満](千円) ×4]
 * null は「下限なし」「上限なし」。
 */
export const BONUS_TAX_TABLE_R8 = [
  [0.000, [null, 82], [null, 107], [null, 143], [null, 181], [null, 218], [null, 251], [null, 284], [null, 317]],
  [2.042, [82, 94], [107, 250], [143, 276], [181, 300], [218, 300], [251, 304], [284, 343], [317, 383]],
  [4.084, [94, 260], [250, 289], [276, 321], [300, 354], [300, 387], [304, 412], [343, 438], [383, 463]],
  [6.126, [260, 309], [289, 346], [321, 377], [354, 405], [387, 431], [412, 457], [438, 483], [463, 508]],
  [8.168, [309, 342], [346, 373], [377, 400], [405, 424], [431, 452], [457, 479], [483, 505], [508, 529]],
  [10.210, [342, 372], [373, 401], [400, 426], [424, 452], [452, 477], [479, 503], [505, 527], [529, 552]],
  [12.252, [372, 402], [401, 430], [426, 457], [452, 484], [477, 509], [503, 531], [527, 553], [552, 578]],
  [14.294, [402, 433], [430, 463], [457, 492], [484, 517], [509, 540], [531, 564], [553, 589], [578, 614]],
  [16.336, [433, 520], [463, 520], [492, 525], [517, 550], [540, 577], [564, 604], [589, 630], [614, 657]],
  [18.378, [520, 605], [520, 621], [525, 636], [550, 651], [577, 666], [604, 681], [630, 697], [657, 708]],
  [20.420, [605, 684], [621, 705], [636, 728], [651, 751], [666, 774], [681, 798], [697, 821], [708, 845]],
  [22.462, [684, 715], [705, 739], [728, 764], [751, 788], [774, 813], [798, 838], [821, 862], [845, 887]],
  [24.504, [715, 752], [739, 778], [764, 804], [788, 830], [813, 856], [838, 881], [862, 907], [887, 933]],
  [26.546, [752, 795], [778, 821], [804, 848], [830, 876], [856, 903], [881, 930], [907, 957], [933, 985]],
  [28.588, [795, 854], [821, 882], [848, 910], [876, 938], [903, 966], [930, 994], [957, 1022], [985, 1051]],
  [30.630, [854, 922], [882, 952], [910, 983], [938, 1013], [966, 1044], [994, 1074], [1022, 1104], [1051, 1135]],
  [32.672, [922, 1318], [952, 1342], [983, 1367], [1013, 1391], [1044, 1416], [1074, 1440], [1104, 1464], [1135, 1489]],
  [35.735, [1318, 1521], [1342, 1526], [1367, 1526], [1391, 1538], [1416, 1555], [1440, 1555], [1464, 1555], [1489, 1583]],
  [38.798, [1521, 2621], [1526, 2645], [1526, 2669], [1538, 2693], [1555, 2716], [1555, 2740], [1555, 2764], [1583, 2788]],
  [41.861, [2621, 3495], [2645, 3527], [2669, 3559], [2693, 3590], [2716, 3622], [2740, 3654], [2764, 3685], [2788, 3717]],
  [45.945, [3495, null], [3527, null], [3559, null], [3590, null], [3622, null], [3654, null], [3685, null], [3717, null]],
];

export const BONUS_TAX_TABLES = { 2026: BONUS_TAX_TABLE_R8 };

/** 前月給与（社保控除後）と扶養人数から率(%)を引く。見つからなければ null */
export function lookupBonusTaxRate(table, prevAfterInsurance, dependents) {
  const col = Math.min(7, Math.max(0, Math.floor(dependents || 0)));
  const yen = prevAfterInsurance;
  for (const row of table) {
    const [lo, hi] = row[1 + col];
    if ((lo === null || yen >= lo * 1000) && (hi === null || yen < hi * 1000)) return row[0];
  }
  return null;
}

/** 月額表（甲欄）で引ける上限。これ以上は月額表が電算機計算の特例になるため手入力にする */
const MONTHLY_TABLE_LIMIT = 3500000;

/**
 * 前月の給与がない／賞与が前月給与の10倍を超えるときの、月額表を使った計算（所得税法施行令の特例）。
 *  前月給与なし: (賞与 − 社保) ÷ 6 の月額表の税額 × 6
 *  10倍超     : {(賞与 − 社保) ÷ 6 + 前月給与} の税額 − 前月給与の税額 を × 6
 *  賞与の計算期間が6か月を超えるときは 6 → 12。
 *  ÷6・÷12 の1円未満は切り捨て。
 */
function calcBonusWithholdingMonthly({ bonusAfterInsurance, prevAfterInsurance, dependents, payDate, months }) {
  const ym = ymOf(payDate);
  const perMonth = Math.floor(bonusAfterInsurance / months);
  const prev = prevAfterInsurance > 0 ? prevAfterInsurance : 0;
  if (perMonth + prev >= MONTHLY_TABLE_LIMIT) return null;
  const perMonthTax = prev > 0
    ? calcWithholdingTax(perMonth + prev, dependents, ym) - calcWithholdingTax(prev, dependents, ym)
    : calcWithholdingTax(perMonth, dependents, ym);
  return { tax: Math.max(0, perMonthTax) * months, perMonth, perMonthTax: Math.max(0, perMonthTax) };
}

/**
 * status:
 *  "ok"         算出率の表で計算できた
 *  "noPrev"     前月の給与がない（または社保以下）→ 月額表の特例で自動計算した
 *  "over10x"    賞与が前月給与（社保後）の10倍を超える → 月額表の特例で自動計算した
 *  "tooLarge"   月額表の範囲（350万円）を超える → 手入力にする
 *  "noTable"    その年分の算出率表がない → 手入力にする
 * months: 賞与の計算期間が6か月以下なら 6、超えるなら 12（特例のときだけ使う）
 */
export function calcBonusWithholding({ bonusAfterInsurance, prevAfterInsurance, dependents, payDate, months = 6 }) {
  const year = Number(payDate.slice(0, 4));
  const table = BONUS_TAX_TABLES[year];
  if (bonusAfterInsurance <= 0) return { tax: 0, rate: 0, status: "ok" };
  if (!table) return { tax: 0, rate: null, status: "noTable", year };
  const noPrev = !(prevAfterInsurance > 0);
  if (noPrev || bonusAfterInsurance > prevAfterInsurance * 10) {
    const status = noPrev ? "noPrev" : "over10x";
    const m = calcBonusWithholdingMonthly({ bonusAfterInsurance, prevAfterInsurance, dependents, payDate, months });
    if (!m) return { tax: 0, rate: null, status: "tooLarge", special: status };
    return { tax: m.tax, rate: null, status, months, perMonth: m.perMonth, perMonthTax: m.perMonthTax };
  }
  const rate = lookupBonusTaxRate(table, prevAfterInsurance, dependents);
  if (rate === null) return { tax: 0, rate: null, status: "noTable", year };
  const tax = floorDiv(bonusAfterInsurance * Math.round(rate * 1000), 100000);
  return { tax, rate, status: "ok" };
}

/* ---------- 前月給与（社保控除後） ---------- */

/** 給与明細（payroll）から。立替経費は非課税なので除く。 */
export function payrollAfterInsurance(p) {
  const n = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
  const total = n(p.baseSalary) + n(p.overtimeAllowance) + n(p.communicationAllowance) +
    n(p.transportAllowance) + n(p.housingAllowance) + n(p.yearEndAdjustment);
  const ins = n(p.employmentInsurance) + n(p.healthInsurance) + n(p.longTermCareInsurance) +
    n(p.childcareSupport) + n(p.welfarePension);
  return total - ins;
}

export function findPrevPayroll(payrolls, employeeId, payDate) {
  const ym = prevYm(ymOf(payDate));
  const hit = (payrolls || []).find((p) => p.employeeId === employeeId && p.yearMonth === ym && !p.isBonus);
  return { yearMonth: ym, payroll: hit || null };
}

/* ---------- まとめ: 賞与1件の自動計算 ---------- */

export const DEDUCTION_KEYS = [
  "employmentInsurance", "healthInsurance", "longTermCareInsurance",
  "childcareSupport", "welfarePension", "incomeTax",
];

/**
 * input: { employee, bonusAmount, payDate, dependents, prevOverride(number|null), taxPeriodOver6(boolean), selfId, createdAt }
 * ctx:   { bonuses, payrolls, settings }
 */
export function calcBonusAuto(input, ctx) {
  const bonusAmount = Math.max(0, Math.floor(input.bonusAmount || 0));
  const ins = calcBonusInsurance({ ...input, bonusAmount }, ctx);
  const socialTotal = ins.employmentInsurance + ins.healthInsurance + ins.longTermCareInsurance +
    ins.childcareSupport + ins.welfarePension;
  const bonusAfterInsurance = bonusAmount - socialTotal;

  const found = findPrevPayroll(ctx.payrolls, input.employee.id, input.payDate);
  let prev;
  if (typeof input.prevOverride === "number") {
    prev = { amount: input.prevOverride, source: "manual", yearMonth: found.yearMonth };
  } else if (found.payroll) {
    prev = { amount: payrollAfterInsurance(found.payroll), source: "payroll", yearMonth: found.yearMonth };
  } else {
    prev = { amount: 0, source: "none", yearMonth: found.yearMonth };
  }

  const tax = calcBonusWithholding({
    bonusAfterInsurance, prevAfterInsurance: prev.amount, dependents: input.dependents, payDate: input.payDate,
    months: input.taxPeriodOver6 ? 12 : 6,
  });

  return {
    ...ins,
    incomeTax: tax.tax,
    bonusAfterInsurance,
    prev,
    taxRate: tax.rate,
    taxStatus: tax.status,
    taxSpecial: tax.status === "noPrev" || tax.status === "over10x",
    taxMonths: tax.months || null,
    taxPerMonth: tax.perMonth ?? null,
    taxPerMonthTax: tax.perMonthTax ?? null,
    taxNeedsManual: tax.status === "noTable" || tax.status === "tooLarge",
  };
}

/* ---------- 賞与ドキュメント（Firestoreに保存する形） ----------
 * users/{オーナーUID}/bonuses/{id}。月給の payrolls とは別コレクション。
 */

export const BONUS_DED = [
  { k: "employmentInsurance", label: "雇用保険料" },
  { k: "healthInsurance", label: "健康保険料" },
  { k: "longTermCareInsurance", label: "介護保険料" },
  { k: "childcareSupport", label: "子ども・子育て支援金" },
  { k: "welfarePension", label: "厚生年金保険料" },
  { k: "incomeTax", label: "源泉所得税" },
];

export const BONUS_NAMES = ["夏季賞与", "冬季賞与", "決算賞与", "特別賞与"];

export function finalDeductions(form, auto) {
  const out = {};
  BONUS_DED.forEach((x) => { out[x.k] = typeof form.manual[x.k] === "number" ? form.manual[x.k] : auto[x.k]; });
  return out;
}

export function buildBonusDoc(form, auto, emp) {
  const ded = finalDeductions(form, auto);
  const totalDeduction = BONUS_DED.reduce((s, x) => s + ded[x.k], 0);
  const amount = Math.max(0, Math.floor(form.bonusAmount || 0));
  const taxManual = typeof form.manual.incomeTax === "number";
  const now = new Date().toISOString();
  return {
    id: form.id, employeeId: emp.id, employeeName: emp.name,
    yearMonth: ymOf(form.payDate), isBonus: true, bonusName: form.bonusName || "", payDate: form.payDate, fiscalYear: fiscalYearOf(form.payDate),
    bonusAmount: amount, standardBonus: auto.standardBonus, healthBase: auto.healthBase, pensionBase: auto.pensionBase,
    ...ded,
    municipalTax: 0, prepayment: 0,
    totalDeduction, netPay: amount - totalDeduction,
    dependents: form.dependents, prevSalaryAfterInsurance: auto.prev.amount, prevSalarySource: auto.prev.source, prevOverride: form.prevOverride,
    taxRate: auto.taxRate, taxStatus: auto.taxStatus, taxPeriodOver6: !!form.taxPeriodOver6, manual: { ...form.manual },
    needsReview: auto.taxNeedsManual && !taxManual,
    employeePercents: auto.employeePercents, ratesFrom: auto.ratesFrom,
    remarks: form.remarks || "", createdAt: form.createdAt || now, updatedAt: now, deletedAt: null, schemaVersion: 1,
  };
}

/** Firestoreから読んだ賞与を、足りないフィールドを埋めた形にする（書き込みはしない） */
export function migrateBonus(b) {
  const out = { ...b };
  if (!out.manual || typeof out.manual !== "object") out.manual = {};
  if (out.deletedAt === undefined) out.deletedAt = null;
  if (typeof out.prevOverride !== "number") out.prevOverride = null;
  if (typeof out.remarks !== "string") out.remarks = "";
  out.taxPeriodOver6 = !!out.taxPeriodOver6;
  BONUS_DED.forEach((x) => { if (typeof out[x.k] !== "number") out[x.k] = 0; });
  ["bonusAmount", "healthBase", "pensionBase", "standardBonus", "totalDeduction", "netPay", "dependents"].forEach((k) => {
    if (typeof out[k] !== "number") out[k] = 0;
  });
  out.isBonus = true;
  return out;
}

/** 保存済みの設定に、内蔵の料率表を足し合わせる（同じ from は保存側を優先） */
export function migrateBonusSettings(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  const byFrom = {};
  DEFAULT_RATE_TABLE.forEach((r) => { byFrom[r.from] = { ...r }; });
  (Array.isArray(s.rates) ? s.rates : []).forEach((r) => {
    if (r && typeof r.from === "string") byFrom[r.from] = { health: 0, care: 0, support: 0, pension: 0, ...r };
  });
  const out = { ...DEFAULT_SETTINGS, ...s, rates: Object.keys(byFrom).sort().map((k) => byFrom[k]) };
  ["healthYearCap", "pensionMonthCap", "employmentRate", "employerEmploymentRate", "childContributionRate", "workersCompRate"].forEach((k) => {
    if (typeof out[k] !== "number" || !isFinite(out[k])) out[k] = DEFAULT_SETTINGS[k];
  });
  return out;
}

/* ---------- 会社負担（事業主負担） ----------
 * 保存済みの賞与から、そのとき使った標準賞与額と支給日の料率で計算する。
 * 健保・介護・支援金・厚年は「全体の保険料（1円未満切り捨て）− 本人負担（自動計算の額）」。
 * 介護は本人に介護保険料がかかっている人だけ、雇用保険は本人に雇用保険料がかかっている人（役員以外）だけ。
 */
export function calcEmployerCost(b, settings) {
  const r = pickRates(settings.rates, ymOf(b.payDate)) || { health: 0, care: 0, support: 0, pension: 0 };
  const share = (base, totalPercent) => {
    const total = Math.floor(base * Math.round(totalPercent * 1000) / 100000);
    return total - roundHalfDown(base * employeeUnits(totalPercent), 100000);
  };
  const healthBase = b.healthBase || 0;
  const pensionBase = b.pensionBase || 0;
  const amount = b.bonusAmount || 0;
  const pctOf = (base, percent) => roundHalfDown(base * Math.round(percent * 1000), 100000);
  const items = [
    { k: "health", label: "健康保険料", v: share(healthBase, r.health) },
    { k: "care", label: "介護保険料", v: b.longTermCareInsurance > 0 ? share(healthBase, r.care) : 0 },
    { k: "support", label: "子ども・子育て支援金", v: share(healthBase, r.support) },
    { k: "pension", label: "厚生年金保険料", v: share(pensionBase, r.pension) },
    { k: "childContribution", label: "子ども・子育て拠出金", v: pctOf(pensionBase, settings.childContributionRate) },
    { k: "employment", label: "雇用保険料", v: b.employmentInsurance > 0 ? pctOf(amount, settings.employerEmploymentRate) : 0 },
    { k: "workersComp", label: "労災保険料", v: pctOf(amount, settings.workersCompRate) },
  ];
  const total = items.reduce((sum, x) => sum + x.v, 0);
  return { items, total, companyCost: amount + total };
}
