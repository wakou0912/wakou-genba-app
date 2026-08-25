// 2026年3月以前の料率（旧料率）
const OLD_RATES = {
  "高橋 凌":    { healthInsurance: 22095, longTermCareInsurance: 0,    childcareSupport: 0,   welfarePension: 41175 },
  "安藤 薫":    { healthInsurance: 15958, longTermCareInsurance: 0,    childcareSupport: 0,   welfarePension: 29738 },
  "羽田野 了":  { healthInsurance: 31915, longTermCareInsurance: 5915, childcareSupport: 0,   welfarePension: 59475 },
  "高橋 奏":    { healthInsurance: 9820,  longTermCareInsurance: 0,    childcareSupport: 0,   welfarePension: 18300 },
  "落合 和磨":  { healthInsurance: 14730, longTermCareInsurance: 0,    childcareSupport: 0,   welfarePension: 27450 },
};

// 2026年4月以降の料率（新料率）
const NEW_RATES = {
  "高橋 凌":    { healthInsurance: 19823, longTermCareInsurance: 0,    childcareSupport: 471, welfarePension: 37515 },
  "安藤 薫":    { healthInsurance: 15472, longTermCareInsurance: 0,    childcareSupport: 368, welfarePension: 29280 },
  "羽田野 了":  { healthInsurance: 31427, longTermCareInsurance: 5265, childcareSupport: 747, welfarePension: 59475 },
  "高橋 奏":    { healthInsurance: 9670,  longTermCareInsurance: 0,    childcareSupport: 230, welfarePension: 18300 },
  "落合 和磨":  { healthInsurance: 15472, longTermCareInsurance: 0,    childcareSupport: 368, welfarePension: 29280 },
};

// 全国健康保険協会 東京支部 料率（2026年4月〜）
// 健康保険: 9.98% / 介護保険: 1.60% / 子育て支援金: 0.116%
// 厚生年金: 18.3%（折半）
function calcFromStandardRemuneration(employee, isNewRate) {
  const s = employee.standardMonthlyRemuneration;
  if (isNewRate) {
    const health = Math.round(s * 0.0499);
    const care = employee.needsLongTermCareInsurance ? Math.round(s * 0.008) : 0;
    const childcare = Math.round(s * 0.00058);
    const pension = Math.round(s * 0.0915);
    return { healthInsurance: health, longTermCareInsurance: care, childcareSupport: childcare, welfarePension: pension };
  } else {
    const health = Math.round(s * 0.05125);
    const care = employee.needsLongTermCareInsurance ? Math.round(s * 0.009) : 0;
    const pension = Math.round(s * 0.0915);
    return { healthInsurance: health, longTermCareInsurance: care, childcareSupport: 0, welfarePension: pension };
  }
}

export function getInsuranceRates(employee, yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const isNewRate = year > 2026 || (year === 2026 && month >= 4);

  const table = isNewRate ? NEW_RATES : OLD_RATES;
  if (table[employee.name]) {
    return table[employee.name];
  }
  return calcFromStandardRemuneration(employee, isNewRate);
}

export function isNewRateMonth(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  return year > 2026 || (year === 2026 && month >= 4);
}
