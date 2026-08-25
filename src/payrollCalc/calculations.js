import { getInsuranceRates, isNewRateMonth } from "./insurance";
import { calcWithholdingTax } from "./tax";

export function defaultWorkingPeriod(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${m}/1〜${m}/${lastDay}`;
}

export function calcTotalPayment(p) {
  return (
    p.baseSalary +
    p.overtimeAllowance +
    p.communicationAllowance +
    p.transportAllowance +
    p.housingAllowance +
    p.advanceExpense +
    p.yearEndAdjustment
  );
}

export function calcTotalDeduction(p) {
  return (
    p.employmentInsurance +
    p.healthInsurance +
    p.longTermCareInsurance +
    p.childcareSupport +
    p.welfarePension +
    p.incomeTax +
    p.municipalTax +
    p.prepayment
  );
}

export function calcNetPay(p) {
  return calcTotalPayment(p) - calcTotalDeduction(p);
}

// 自動計算して控除額を更新（手動入力済みフィールドは上書きしない）
export function autoCalcDeductions(employee, payroll) {
  const p = payroll;
  const totalPayment = calcTotalPayment(p);
  const insuranceBase = totalPayment - p.advanceExpense;

  const employmentInsurance = employee.isOfficer ? 0 : Math.floor(Math.max(0, insuranceBase) * 0.006);

  const rates = getInsuranceRates(employee, payroll.yearMonth);
  const newRate = isNewRateMonth(payroll.yearMonth);

  const allSocialInsurance =
    employmentInsurance +
    rates.healthInsurance +
    rates.longTermCareInsurance +
    (newRate ? rates.childcareSupport : 0) +
    rates.welfarePension;

  const taxBase = Math.max(0, totalPayment - p.advanceExpense - allSocialInsurance);
  const incomeTax = calcWithholdingTax(taxBase, employee.dependents);

  return {
    employmentInsurance,
    healthInsurance: rates.healthInsurance,
    longTermCareInsurance: rates.longTermCareInsurance,
    childcareSupport: newRate ? rates.childcareSupport : 0,
    welfarePension: rates.welfarePension,
    incomeTax,
    municipalTax: (parseInt(payroll.yearMonth.split("-")[1]) === 5 && employee.juneMunicipalTax)
      ? employee.juneMunicipalTax
      : employee.municipalTax,
  };
}

// 従業員の固定値から給与明細の初期値を生成
export function buildInitialPayroll(employee, yearMonth) {
  const base = {
    id: crypto.randomUUID(),
    employeeId: employee.id,
    yearMonth,
    isBonus: false,
    bonusName: null,
    baseSalary: employee.baseSalary,
    overtimeAllowance: 0,
    communicationAllowance: employee.communicationAllowance,
    transportAllowance: employee.transportAllowance,
    housingAllowance: employee.housingAllowance,
    advanceExpense: 0,
    prepayment: 0,
    yearEndAdjustment: 0,
    employmentInsurance: 0,
    healthInsurance: 0,
    longTermCareInsurance: 0,
    childcareSupport: 0,
    welfarePension: 0,
    incomeTax: 0,
    municipalTax: 0,
    workingPeriod: defaultWorkingPeriod(yearMonth),
    workingDays: null,
    remarks: "",
  };

  const deductions = autoCalcDeductions(employee, base);
  return { ...base, ...deductions };
}
