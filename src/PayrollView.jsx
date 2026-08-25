import { useState, useEffect, useCallback } from "react";
import {
  loadEmployees, loadEmployee, saveEmployee, deleteEmployee,
  loadPayrolls, loadPayroll, loadPrevPayroll, savePayroll,
} from "./payrollCalc/firestoreData";
import {
  buildInitialPayroll, autoCalcDeductions, calcTotalPayment, calcTotalDeduction, calcNetPay, defaultWorkingPeriod,
} from "./payrollCalc/calculations";
import { PAYROLL_OWNER_UID } from "./firebasePayroll";

/* ===================== スコープ済みCSS（プロトタイプのTailwindデザインをほぼそのまま移植） ===================== */
const PR_CSS = `
  .pr-root{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Hiragino Sans,sans-serif; color:#1f2937; }
  .pr-root *{ box-sizing:border-box; }
  .pr-card{ background:#fff; border-radius:10px; border:1px solid #e5e7eb; box-shadow:0 1px 2px rgba(0,0,0,0.04); }
  .pr-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:8px; }
  .pr-title{ font-size:20px; font-weight:700; color:#1f2937; margin:0; }
  .pr-sub{ font-size:13px; color:#6b7280; margin:2px 0 0; }
  .pr-month-nav{ display:flex; align-items:center; gap:8px; }
  .pr-icon-btn{ padding:6px 12px; border-radius:6px; border:1px solid #d1d5db; background:#fff; cursor:pointer; font-size:13px; }
  .pr-icon-btn:hover{ background:#f3f4f6; }
  .pr-month-label{ font-size:15px; font-weight:600; width:96px; text-align:center; }
  .pr-emp-card{ padding:14px 16px; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
  .pr-emp-name{ font-weight:600; color:#1f2937; }
  .pr-emp-sub{ font-size:13px; color:#6b7280; margin-top:2px; }
  .pr-badge{ font-size:11px; padding:4px 8px; border-radius:5px; }
  .pr-badge-done{ background:#dcfce7; color:#15803d; }
  .pr-badge-todo{ background:#f3f4f6; color:#9ca3af; }
  .pr-btn{ padding:7px 14px; border-radius:6px; font-size:13px; font-weight:500; cursor:pointer; border:1px solid transparent; }
  .pr-btn:disabled{ opacity:0.5; cursor:default; }
  .pr-btn-primary{ background:#2563eb; color:#fff; }
  .pr-btn-primary:hover{ background:#1d4ed8; }
  .pr-btn-green{ background:#16a34a; color:#fff; }
  .pr-btn-green:hover{ background:#15803d; }
  .pr-btn-dark{ background:#374151; color:#fff; }
  .pr-btn-dark:hover{ background:#1f2937; }
  .pr-btn-outline{ background:#fff; border:1px solid #d1d5db; color:#4b5563; }
  .pr-btn-outline:hover{ background:#f9fafb; }
  .pr-btn-danger-outline{ background:#fff; border:1px solid #f87171; color:#ef4444; }
  .pr-btn-danger-outline:hover{ background:#fef2f2; }
  .pr-empty{ text-align:center; padding:48px 0; color:#9ca3af; }
  .pr-empty-title{ font-size:16px; margin-bottom:6px; }
  .pr-actions{ margin-top:20px; display:flex; gap:10px; flex-wrap:wrap; }
  .pr-field{ margin-bottom:14px; }
  .pr-label{ display:block; font-size:12px; color:#6b7280; margin-bottom:4px; font-weight:500; }
  .pr-input{ width:100%; border:1px solid #d1d5db; border-radius:6px; padding:8px 10px; font-size:14px; font-family:inherit; }
  .pr-input:focus{ outline:none; box-shadow:0 0 0 2px #93c5fd; }
  .pr-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .pr-num-wrap{ display:flex; align-items:center; gap:6px; }
  .pr-num-input{ width:100%; text-align:right; padding:6px 8px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; font-family:inherit; }
  .pr-num-input:disabled{ background:#f3f4f6; color:#9ca3af; }
  .pr-num-input:focus{ outline:none; box-shadow:0 0 0 2px #93c5fd; }
  .pr-check-row{ display:flex; align-items:center; gap:8px; margin-top:10px; }
  .pr-check-row label{ font-size:13px; color:#374151; }
  .pr-section-note{ font-size:11px; color:#9ca3af; margin-bottom:10px; }
  .pr-divider{ border-top:1px solid #e5e7eb; padding-top:16px; margin-top:16px; }
  .pr-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px; }
  .pr-modal{ background:#fff; border-radius:12px; padding:20px; width:100%; max-width:560px; max-height:90vh; overflow-y:auto; }
  .pr-sheet{ background:#f3f4f6; border-radius:12px; padding:20px; width:100%; max-width:640px; max-height:92vh; overflow-y:auto; }
  .pr-row-line{ display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:6px; }
  .pr-row-line.highlight{ background:#eff6ff; }
  .pr-row-label{ flex:1; font-size:13px; color:#374151; }
  .pr-row-tag{ margin-left:4px; font-size:10px; color:#9ca3af; background:#f3f4f6; padding:1px 5px; border-radius:4px; }
  .pr-row-value{ width:128px; }
  .pr-section-head{ padding:8px 16px; border-bottom:1px solid #f3f4f6; border-radius:10px 10px 0 0; }
  .pr-section-head.pay{ background:#eff6ff; }
  .pr-section-head.deduct{ background:#fff7ed; }
  .pr-section-head-text{ font-size:13px; font-weight:600; }
  .pr-section-head.pay .pr-section-head-text{ color:#1e40af; }
  .pr-section-head.deduct .pr-section-head-text{ color:#9a3412; }
  .pr-section-total{ padding:8px 16px; border-top:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center; background:#f9fafb; border-radius:0 0 10px 10px; }
  .pr-section-total-label{ font-size:13px; font-weight:600; color:#374151; }
  .pr-section-total-value{ font-size:15px; font-weight:700; color:#111827; }
  .pr-netpay{ background:#2563eb; color:#fff; border-radius:10px; padding:16px; display:flex; justify-content:space-between; align-items:center; margin:16px 0; }
  .pr-netpay-value{ font-size:28px; font-weight:800; }
  .pr-close{ background:none; border:none; cursor:pointer; color:#9ca3af; font-size:18px; }
  .pr-modal-title{ font-size:16px; font-weight:700; color:#1f2937; margin:0 0 14px; }
`;

function currentYearMonth() {
  const now = new Date();
  const m = now.getMonth(); // 0=1月なので、これがそのまま前月の月番号
  const y = now.getFullYear();
  if (m === 0) return `${y - 1}-12`;
  return `${y}-${String(m).padStart(2, "0")}`;
}
function monthLabel(ym) {
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m)}月`;
}
function tenureMonths(hireDate, atDate) {
  const hire = new Date(hireDate + "T00:00:00");
  if (isNaN(hire.getTime())) return null;
  let months = (atDate.getFullYear() - hire.getFullYear()) * 12 + (atDate.getMonth() - hire.getMonth());
  if (atDate.getDate() < hire.getDate()) months -= 1;
  if (months < 0) return null;
  return months;
}
function formatTenure(months) {
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return `勤続${years}年${remMonths}ヶ月`;
}
function tenureLabel(hireDate) {
  if (!hireDate) return "";
  const m = tenureMonths(hireDate, new Date());
  return m === null ? "" : formatTenure(m);
}
function tenureAtLabel(hireDate, yearMonth) {
  if (!hireDate || !yearMonth) return "";
  const [y, mo] = yearMonth.split("-").map(Number);
  if (!y || !mo) return "";
  const m = tenureMonths(hireDate, new Date(y, mo - 1, 1));
  return m === null ? "" : formatTenure(m);
}
function prevYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function nextYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function NumberInput({ value, onChange, placeholder = "0", allowNegative = false, disabled = false }) {
  const [focused, setFocused] = useState(false);
  const display = focused
    ? (value === 0 ? "" : String(value))
    : (value === 0 ? "" : value.toLocaleString("ja-JP"));
  return (
    <input
      type="text" inputMode="numeric" value={display} placeholder={placeholder} disabled={disabled}
      className="pr-num-input"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        setFocused(false);
        const raw = e.target.value.replace(/,/g, "");
        const n = parseInt(raw, 10);
        if (!isNaN(n) && (allowNegative || n >= 0)) onChange(n);
        else if (raw === "" || raw === "-") onChange(0);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        if (allowNegative ? /^-?\d*$/.test(raw) : /^\d*$/.test(raw)) {
          const n = parseInt(raw, 10);
          if (!isNaN(n)) onChange(n);
          else if (raw === "" || raw === "-") onChange(0);
        }
      }}
    />
  );
}

function PayrollRow({ label, value, onChange, readOnly = false, highlight = false, allowNegative = false, tag }) {
  return (
    <div className={`pr-row-line${highlight ? " highlight" : ""}`}>
      <span className="pr-row-label">{label}{tag && <span className="pr-row-tag">{tag}</span>}</span>
      {readOnly ? (
        <span className="pr-row-value" style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: highlight ? "#1d4ed8" : "#1f2937" }}>
          {value === 0 ? "—" : `${value.toLocaleString("ja-JP")} 円`}
        </span>
      ) : (
        <div className="pr-row-value pr-num-wrap">
          <NumberInput value={value} onChange={onChange} allowNegative={allowNegative} />
          <span style={{ fontSize: 13, color: "#6b7280" }}>円</span>
        </div>
      )}
    </div>
  );
}

const BLANK_EMPLOYEE = {
  name: "", hireDate: "", baseSalary: 0, communicationAllowance: 0, transportAllowance: 0, housingAllowance: 0,
  standardMonthlyRemuneration: 0, needsLongTermCareInsurance: false, municipalTax: 0, juneMunicipalTax: 0,
  isOfficer: false, dependents: 0, salaryHistory: [],
};

const INITIAL_EMPLOYEES = [
  { name: "高橋 凌", baseSalary: 350000, communicationAllowance: 0, transportAllowance: 0, housingAllowance: 0, standardMonthlyRemuneration: 380000, needsLongTermCareInsurance: false, municipalTax: 0, juneMunicipalTax: 0, isOfficer: false, dependents: 0 },
  { name: "安藤 薫", baseSalary: 280000, communicationAllowance: 0, transportAllowance: 0, housingAllowance: 0, standardMonthlyRemuneration: 280000, needsLongTermCareInsurance: false, municipalTax: 0, juneMunicipalTax: 0, isOfficer: false, dependents: 0 },
  { name: "羽田野 了", baseSalary: 500000, communicationAllowance: 0, transportAllowance: 0, housingAllowance: 0, standardMonthlyRemuneration: 560000, needsLongTermCareInsurance: true, municipalTax: 0, juneMunicipalTax: 0, isOfficer: false, dependents: 0 },
  { name: "高橋 奏", baseSalary: 180000, communicationAllowance: 0, transportAllowance: 0, housingAllowance: 0, standardMonthlyRemuneration: 180000, needsLongTermCareInsurance: false, municipalTax: 0, juneMunicipalTax: 0, isOfficer: false, dependents: 0 },
  { name: "落合 和磨", baseSalary: 260000, communicationAllowance: 0, transportAllowance: 0, housingAllowance: 0, standardMonthlyRemuneration: 260000, needsLongTermCareInsurance: false, municipalTax: 0, juneMunicipalTax: 0, isOfficer: false, dependents: 0 },
];

/* ===================== 従業員フォーム（モーダル） ===================== */
function EmployeeFormModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState({ ...BLANK_EMPLOYEE, ...initial });
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const addHistoryEntry = () => set("salaryHistory", [...(form.salaryHistory || []), { id: crypto.randomUUID(), date: "", amount: 0, note: "" }]);
  const updateHistoryEntry = (id, key, value) => set("salaryHistory", (form.salaryHistory || []).map((h) => (h.id === id ? { ...h, [key]: value } : h)));
  const removeHistoryEntry = (id) => set("salaryHistory", (form.salaryHistory || []).filter((h) => h.id !== id));

  const handleSave = async () => {
    if (!form.name.trim()) { alert("氏名を入力してください"); return; }
    setSaving(true);
    const employee = { id: initial?.id ?? crypto.randomUUID(), ...form };
    await saveEmployee(employee);
    setSaving(false);
    onSaved(employee);
  };
  const handleDelete = async () => {
    if (!initial) return;
    if (!confirm(`「${initial.name}」を削除しますか？`)) return;
    await deleteEmployee(initial.id);
    onSaved(null, initial.id);
  };

  return (
    <div className="pr-overlay" onClick={onClose}>
      <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="pr-modal-title">{initial ? "従業員編集" : "従業員を追加"}</h3>
          <button className="pr-close" onClick={onClose}>✕</button>
        </div>
        <div className="pr-field">
          <label className="pr-label">氏名 *</label>
          <input type="text" className="pr-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例: 山田 太郎" />
        </div>
        <div className="pr-field">
          <label className="pr-label">入社日</label>
          <input type="date" className="pr-input" value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
        </div>
        <div className="pr-grid2">
          <div className="pr-field"><label className="pr-label">基本給（円）</label><NumberInput value={form.baseSalary} onChange={(v) => set("baseSalary", v)} /></div>
          <div className="pr-field"><label className="pr-label">通信費（円）</label><NumberInput value={form.communicationAllowance} onChange={(v) => set("communicationAllowance", v)} /></div>
          <div className="pr-field"><label className="pr-label">交通手当（円）</label><NumberInput value={form.transportAllowance} onChange={(v) => set("transportAllowance", v)} /></div>
          <div className="pr-field"><label className="pr-label">家賃補助（円）</label><NumberInput value={form.housingAllowance} onChange={(v) => set("housingAllowance", v)} /></div>
          <div className="pr-field"><label className="pr-label">住民税・月額（円）</label><NumberInput value={form.municipalTax} onChange={(v) => set("municipalTax", v)} /></div>
          <div className="pr-field"><label className="pr-label">住民税・6月（円）</label><NumberInput value={form.juneMunicipalTax} onChange={(v) => set("juneMunicipalTax", v)} /></div>
          <div className="pr-field">
            <label className="pr-label">扶養人数（人）</label>
            <input type="number" min={0} max={10} className="pr-input" value={form.dependents} onChange={(e) => set("dependents", parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <div className="pr-divider">
          <p className="pr-section-note">※ 以下は登録済み5名以外の新規従業員に使用します（既存5名は料率テーブルが優先されます）</p>
          <div className="pr-field">
            <label className="pr-label">標準報酬月額（円）</label>
            <NumberInput value={form.standardMonthlyRemuneration} onChange={(v) => set("standardMonthlyRemuneration", v)} />
          </div>
          <div className="pr-check-row">
            <input type="checkbox" id="pr-care" checked={form.needsLongTermCareInsurance} onChange={(e) => set("needsLongTermCareInsurance", e.target.checked)} />
            <label htmlFor="pr-care">介護保険対象（40歳以上）</label>
          </div>
          <div className="pr-check-row">
            <input type="checkbox" id="pr-officer" checked={form.isOfficer} onChange={(e) => set("isOfficer", e.target.checked)} />
            <label htmlFor="pr-officer">役員（雇用保険なし）</label>
          </div>
        </div>

        <div className="pr-divider">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="pr-label" style={{ marginBottom: 0 }}>給与推移</span>
            <button className="pr-btn pr-btn-outline" onClick={addHistoryEntry}>＋ 追加</button>
          </div>
          {(form.salaryHistory || []).length === 0 ? (
            <p style={{ fontSize: 12, color: "#9ca3af" }}>まだ記録がありません。基本給を変更したタイミングで追加していくと推移がわかります</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...form.salaryHistory].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((h) => (
                <div key={h.id} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="month" className="pr-input" style={{ width: 132 }} value={h.date} onChange={(e) => updateHistoryEntry(h.id, "date", e.target.value)} />
                    <div style={{ flex: 1 }}><NumberInput value={h.amount} onChange={(v) => updateHistoryEntry(h.id, "amount", v)} /></div>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>円</span>
                    <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 88, textAlign: "right" }}>{form.hireDate && h.date ? tenureAtLabel(form.hireDate, h.date) : ""}</span>
                    <button className="pr-close" onClick={() => removeHistoryEntry(h.id)}>✕</button>
                  </div>
                  <input type="text" className="pr-input" style={{ marginTop: 6 }} value={h.note || ""} onChange={(e) => updateHistoryEntry(h.id, "note", e.target.value)} placeholder="メモ（昇給理由など）" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pr-actions">
          <button className="pr-btn pr-btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</button>
          {initial && <button className="pr-btn pr-btn-danger-outline" onClick={handleDelete}>削除</button>}
          <button className="pr-btn pr-btn-outline" onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== 給与明細編集（シート） ===================== */
function PayrollEditorSheet({ employeeId, yearMonth, onClose, onSaved }) {
  const [employee, setEmployee] = useState(null);
  const [payroll, setPayroll] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const emp = await loadEmployee(employeeId);
      if (!emp) return;
      setEmployee(emp);
      const existing = await loadPayroll(employeeId, yearMonth);
      setPayroll(existing || buildInitialPayroll(emp, yearMonth));
    })();
  }, [employeeId, yearMonth]);

  const recalcDeductions = useCallback((p, emp) => ({ ...p, ...autoCalcDeductions(emp, p) }), []);

  const setField = (key, value) => {
    setPayroll((prev) => {
      if (!prev || !employee) return prev;
      const next = { ...prev, [key]: value };
      const paymentKeys = ["baseSalary", "overtimeAllowance", "communicationAllowance", "transportAllowance", "housingAllowance", "advanceExpense", "yearEndAdjustment"];
      return paymentKeys.includes(key) ? recalcDeductions(next, employee) : next;
    });
  };

  const setEmployeeField = (key, value) => {
    setEmployee((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleCopyPrev = async () => {
    if (!employee) return;
    const prev = await loadPrevPayroll(employeeId, yearMonth);
    if (!prev) { alert("前月の明細が見つかりません"); return; }
    const copied = { ...prev, id: payroll?.id ?? crypto.randomUUID(), yearMonth, advanceExpense: 0, workingPeriod: defaultWorkingPeriod(yearMonth), workingDays: null };
    setPayroll({ ...copied, ...autoCalcDeductions(employee, copied) });
  };

  const handleSave = async () => {
    if (!payroll || !employee) return;
    setSaving(true);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("タイムアウト（15秒）: Firestoreに接続できません")), 15000));
      await Promise.race([Promise.all([savePayroll(payroll), saveEmployee(employee)]), timeout]);
      alert("保存しました");
      onSaved();
    } catch (e) {
      alert("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const handlePDF = async (mode = "download") => {
    if (!payroll || !employee) return;
    const previewWindow = mode === "preview" ? window.open("", "_blank") : null;
    setPdfLoading(true);
    try {
      const { generatePayrollPDF } = await import("./payrollCalc/pdf");
      await generatePayrollPDF(employee, payroll, mode, previewWindow);
    } catch (e) {
      console.error(e);
      previewWindow?.close();
      alert("PDF生成に失敗しました");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="pr-overlay" onClick={onClose}>
      <div className="pr-sheet" onClick={(e) => e.stopPropagation()}>
        {!employee || !payroll ? <p style={{ color: "#9ca3af" }}>読み込み中...</p> : (() => {
          const totalPayment = calcTotalPayment(payroll);
          const totalDeduction = calcTotalDeduction(payroll);
          const netPay = calcNetPay(payroll);
          return (
            <>
              <div className="pr-header">
                <div>
                  <h3 className="pr-title" style={{ fontSize: 18 }}>{employee.name}</h3>
                  <p className="pr-sub">{monthLabel(yearMonth)} 給与明細</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="pr-btn pr-btn-outline" onClick={handleCopyPrev}>前月コピー</button>
                  <button className="pr-close" onClick={onClose}>✕</button>
                </div>
              </div>

              <div className="pr-card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="pr-grid2">
                  <div>
                    <label className="pr-label">労働期間</label>
                    <input type="text" className="pr-input" value={payroll.workingPeriod} onChange={(e) => setField("workingPeriod", e.target.value)} placeholder="例: 5/1〜5/31" />
                  </div>
                  <div>
                    <label className="pr-label">労働日数</label>
                    <div className="pr-num-wrap">
                      <NumberInput value={payroll.workingDays ?? 0} onChange={(v) => setField("workingDays", v || null)} />
                      <span style={{ fontSize: 13, color: "#6b7280" }}>日</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pr-card" style={{ marginBottom: 16 }}>
                <div className="pr-section-head pay"><span className="pr-section-head-text">支給</span></div>
                <div style={{ padding: "4px 8px" }}>
                  <PayrollRow label="基本給" value={payroll.baseSalary} onChange={(v) => setField("baseSalary", v)} />
                  <PayrollRow label="残業手当" value={payroll.overtimeAllowance} onChange={(v) => setField("overtimeAllowance", v)} />
                  <PayrollRow label="通信費" value={payroll.communicationAllowance} onChange={(v) => setField("communicationAllowance", v)} />
                  <PayrollRow label="交通手当" value={payroll.transportAllowance} onChange={(v) => setField("transportAllowance", v)} />
                  <PayrollRow label="家賃補助" value={payroll.housingAllowance} onChange={(v) => setField("housingAllowance", v)} />
                  <PayrollRow label="立替経費" value={payroll.advanceExpense} onChange={(v) => setField("advanceExpense", v)} tag="非課税" />
                  <PayrollRow label="年末調整" value={payroll.yearEndAdjustment} onChange={(v) => setField("yearEndAdjustment", v)} allowNegative />
                </div>
                <div className="pr-section-total"><span className="pr-section-total-label">支給合計</span><span className="pr-section-total-value">{totalPayment.toLocaleString("ja-JP")} 円</span></div>
              </div>

              <div className="pr-card" style={{ marginBottom: 16 }}>
                <div className="pr-section-head deduct"><span className="pr-section-head-text">控除</span><span style={{ fontSize: 11, color: "#c2410c", marginLeft: 8 }}>（自動計算・手動修正可）</span></div>
                <div style={{ padding: "4px 8px" }}>
                  <PayrollRow label="雇用保険料" value={payroll.employmentInsurance} onChange={(v) => setField("employmentInsurance", v)} />
                  <PayrollRow label="健康保険料" value={payroll.healthInsurance} onChange={(v) => setField("healthInsurance", v)} />
                  <PayrollRow label="介護保険料" value={payroll.longTermCareInsurance} onChange={(v) => setField("longTermCareInsurance", v)} />
                  <PayrollRow label="子育て支援金" value={payroll.childcareSupport} onChange={(v) => setField("childcareSupport", v)} />
                  <PayrollRow label="厚生年金保険料" value={payroll.welfarePension} onChange={(v) => setField("welfarePension", v)} />
                  <PayrollRow label="源泉税" value={payroll.incomeTax} onChange={(v) => setField("incomeTax", v)} />
                  <PayrollRow label="住民税" value={payroll.municipalTax} onChange={(v) => setField("municipalTax", v)} />
                  <PayrollRow label="前払金" value={payroll.prepayment} onChange={(v) => setField("prepayment", v)} />
                </div>
                <div className="pr-section-total"><span className="pr-section-total-label">控除合計</span><span className="pr-section-total-value">{totalDeduction.toLocaleString("ja-JP")} 円</span></div>
              </div>

              <div className="pr-card" style={{ padding: 16, marginBottom: 16 }}>
                <label className="pr-label">備考</label>
                <textarea className="pr-input" rows={3} style={{ resize: "none" }} value={payroll.remarks ?? ""} onChange={(e) => setField("remarks", e.target.value)} placeholder="PDFの備考欄に印刷されます" />
              </div>

              <div className="pr-card" style={{ padding: 16, marginBottom: 16, background: "#fffbeb" }}>
                <label className="pr-label">引き継ぎメモ（PDFには印刷されません・どの月でも共通で表示されます）</label>
                <textarea className="pr-input" rows={3} style={{ resize: "none" }} value={employee.internalNote ?? ""} onChange={(e) => setEmployeeField("internalNote", e.target.value)} placeholder="社内用のメモ・次回引き継ぎ事項など" />
              </div>

              <div className="pr-netpay">
                <span style={{ fontSize: 15, fontWeight: 600 }}>差引支給額</span>
                <span className="pr-netpay-value">{netPay.toLocaleString("ja-JP")} 円</span>
              </div>

              <div className="pr-actions">
                <button className="pr-btn pr-btn-green" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</button>
                <button className="pr-btn pr-btn-primary" style={{ flex: 1 }} onClick={() => handlePDF("preview")} disabled={pdfLoading}>{pdfLoading ? "生成中..." : "プレビュー"}</button>
                <button className="pr-btn pr-btn-dark" style={{ flex: 1 }} onClick={() => handlePDF("download")} disabled={pdfLoading}>{pdfLoading ? "生成中..." : "PDF出力"}</button>
                <button className="pr-btn pr-btn-outline" onClick={onClose}>戻る</button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

/* ===================== メイン ===================== */
export default function PayrollView() {
  const [employees, setEmployees] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(null); // {type:"employeeForm", employee} | {type:"payrollEditor", employeeId}

  const reload = useCallback(() => {
    Promise.all([loadEmployees(), loadPayrolls()]).then(([emps, prs]) => {
      setEmployees(emps); setPayrolls(prs); setLoading(false);
    });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (!PAYROLL_OWNER_UID) {
    return (
      <div className="pr-root" style={{ padding: 24 }}>
        <style>{PR_CSS}</style>
        <div className="pr-card" style={{ padding: 20, maxWidth: 480 }}>
          給与データの接続先が未設定です（開発者に連絡してください）。
        </div>
      </div>
    );
  }

  const getPayroll = (empId) => payrolls.find((p) => p.employeeId === empId && p.yearMonth === yearMonth && !p.isBonus);

  const handleSetup = async () => {
    await Promise.all(INITIAL_EMPLOYEES.map((emp) => saveEmployee({ id: crypto.randomUUID(), ...emp })));
    alert("5名の従業員を登録しました");
    reload();
  };

  return (
    <div className="pr-root" style={{ padding: 20, maxWidth: 720 }}>
      <style>{PR_CSS}</style>

      <div className="pr-header">
        <h1 className="pr-title">給与明細一覧</h1>
        <div className="pr-month-nav">
          <button className="pr-icon-btn" onClick={() => setYearMonth(prevYM(yearMonth))}>◀</button>
          <span className="pr-month-label">{monthLabel(yearMonth)}</span>
          <button className="pr-icon-btn" onClick={() => setYearMonth(nextYM(yearMonth))}>▶</button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "#9ca3af" }}>読み込み中...</p>
      ) : employees.length === 0 ? (
        <div className="pr-empty">
          <p className="pr-empty-title">従業員が登録されていません</p>
          <p style={{ fontSize: 13 }}>下の「＋従業員を追加」から登録してください</p>
        </div>
      ) : (
        employees.map((emp) => {
          const payroll = getPayroll(emp.id);
          return (
            <div key={emp.id} className="pr-card pr-emp-card">
              <div>
                <div className="pr-emp-name">{emp.name}</div>
                <div className="pr-emp-sub">基本給 {emp.baseSalary.toLocaleString("ja-JP")} 円{emp.hireDate ? `　入社日 ${emp.hireDate}（${tenureLabel(emp.hireDate)}）` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`pr-badge ${payroll ? "pr-badge-done" : "pr-badge-todo"}`}>{payroll ? "作成済み" : "未作成"}</span>
                <button className="pr-btn pr-btn-primary" onClick={() => setSheet({ type: "payrollEditor", employeeId: emp.id })}>{payroll ? "編集" : "作成"}</button>
                <button className="pr-btn pr-btn-outline" onClick={() => setSheet({ type: "employeeForm", employee: emp })}>従業員編集</button>
              </div>
            </div>
          );
        })
      )}

      <div className="pr-actions">
        <button className="pr-btn pr-btn-dark" onClick={() => setSheet({ type: "employeeForm", employee: null })}>＋ 従業員を追加</button>
        {!loading && employees.length === 0 && (
          <button className="pr-btn pr-btn-primary" onClick={handleSetup}>初期セットアップ（5名一括登録）</button>
        )}
      </div>

      {sheet?.type === "employeeForm" && (
        <EmployeeFormModal
          initial={sheet.employee}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); reload(); }}
        />
      )}
      {sheet?.type === "payrollEditor" && (
        <PayrollEditorSheet
          employeeId={sheet.employeeId}
          yearMonth={yearMonth}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); reload(); }}
        />
      )}
    </div>
  );
}
