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

function empCol() {
  return collection(payrollFirestore, "users", PAYROLL_OWNER_UID, "employees");
}
function payCol() {
  return collection(payrollFirestore, "users", PAYROLL_OWNER_UID, "payrolls");
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
