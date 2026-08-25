import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 給与明細アプリ（wako-payroll）と同じFirebaseプロジェクト。
// 現場日報とは別プロジェクトなので、セカンダリのFirebaseアプリとして初期化する。
const payrollFirebaseConfig = {
  apiKey: "AIzaSyDodKhfeIupTNpZOZBfnIWgwrGqMiGgPro",
  authDomain: "kabusikigaisya-wakou.firebaseapp.com",
  projectId: "kabusikigaisya-wakou",
  storageBucket: "kabusikigaisya-wakou.firebasestorage.app",
  messagingSenderId: "729487067137",
  appId: "1:729487067137:web:ab3cddf7311d4fb28a9800",
};

const payrollApp = getApps().some(a => a.name === "payroll")
  ? getApp("payroll")
  : initializeApp(payrollFirebaseConfig, "payroll");

export const payrollFirestore = getFirestore(payrollApp);

// wako-payrollのデータは users/{ownerUid}/employees, users/{ownerUid}/payrolls に
// 保存されている（wakou0912@gmail.com のFirebase Auth UID、シングルテナント運用）。
// 現場日報アプリからはFirebase Authを使わず、Firestoreルールで
// このUID配下だけを公開する形で直接読み書きする。
export const PAYROLL_OWNER_UID = "PHnAJhmqP0eyzRWmPj8FdznAc8x2";
