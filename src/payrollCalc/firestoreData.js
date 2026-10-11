import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { payrollFirestore, PAYROLL_OWNER_UID } from "../firebasePayroll";
import { migrateBonus, migrateBonusSettings } from "./bonus";

function empCol() {
  return collection(payrollFirestore, "users", PAYROLL_OWNER_UID, "employees");
}
function payCol() {
  return collection(payrollFirestore, "users", PAYROLL_OWNER_UID, "payrolls");
}
function bonusCol() {
  return collection(payrollFirestore, "users", PAYROLL_OWNER_UID, "bonuses");
}
function bonusSettingsRef() {
  return doc(payrollFirestore, "users", PAYROLL_OWNER_UID, "settings", "bonus");
}

// ─── Employees ───────────────────────────────────────────────

export async function loadEmployees() {
  const snap = await getDocs(empCol());
  return snap.docs.map((d) => d.data());
}

export async function loadEmployee(id) {
  const snap = await getDoc(doc(empCol(), id));
  return snap.exists() ? snap.data() : null;
}

export async function saveEmployee(employee) {
  await setDoc(doc(empCol(), employee.id), employee);
}

export async function deleteEmployee(id) {
  await deleteDoc(doc(empCol(), id));
}

// ─── Payrolls ────────────────────────────────────────────────

export async function loadPayrolls() {
  const snap = await getDocs(payCol());
  return snap.docs.map((d) => d.data());
}

export async function savePayroll(payroll) {
  await setDoc(doc(payCol(), payroll.id), payroll);
}

export async function loadPayroll(employeeId, yearMonth) {
  const q = query(
    payCol(),
    where("employeeId", "==", employeeId),
    where("yearMonth", "==", yearMonth),
    where("isBonus", "==", false)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].data();
}

export async function loadPrevPayroll(employeeId, yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevYM = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  return loadPayroll(employeeId, prevYM);
}

export async function deletePayroll(id) {
  await deleteDoc(doc(payCol(), id));
}

// ─── Bonuses（賞与。payrolls とは別コレクション） ─────────────

export async function loadBonuses() {
  const snap = await getDocs(bonusCol());
  return snap.docs.map((d) => migrateBonus(d.data()));
}

export async function saveBonus(bonus) {
  await setDoc(doc(bonusCol(), bonus.id), bonus);
}

export async function deleteBonus(id) {
  await deleteDoc(doc(bonusCol(), id));
}

// 賞与の料率・上限の設定。ドキュメントが無いときは内蔵の初期値を返すだけで、書き込みはしない。
export async function loadBonusSettings() {
  const snap = await getDoc(bonusSettingsRef());
  return migrateBonusSettings(snap.exists() ? snap.data() : null);
}

export async function saveBonusSettings(settings) {
  await setDoc(bonusSettingsRef(), settings);
}
