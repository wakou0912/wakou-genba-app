// 作業員の一覧（ログイン画面・日報・集計などで共通に使う）
//
// 保存先: Firestore の attendance/_workers（出退勤と同じ権限で読み書きできる場所。db/main は触らない）
//   { list: [{ name, hidden, addedAt }], updatedAt }
// ・ドキュメントが無いとき／読めないときは、下の DEFAULT_WORKERS を使うだけ（自動では書き込まない）
// ・書き込むのは、管理者が「作業員管理」で保存を押したときだけ
// ・非表示（退職など）にしても、過去の日報や出退勤のデータは消さない
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firestore } from "./firebase";

export const OTHER = "その他";
export const DEFAULT_LIST = ["高橋凌", "羽田野了", "安藤薫", "落合和磨"].map(name => ({ name, hidden: false, addedAt: null }));

// 画面で使う配列（中身を入れ替えて使う。末尾は必ず「その他」）
export const WORKERS = [...DEFAULT_LIST.map(w => w.name), OTHER];

const workersRef = () => doc(firestore, "attendance", "_workers");
const validList = l => Array.isArray(l) && l.length > 0 && l.every(w => w && typeof w.name === "string" && w.name);
export const applyWorkers = list => {
  const names = list.filter(w => !w.hidden).map(w => w.name).filter(n => n !== OTHER);
  WORKERS.splice(0, WORKERS.length, ...names, OTHER);
};

// 変更を拾って WORKERS を更新する。App の一番上で1回だけ呼ぶ（読むだけ。書き込みはしない）
export function useWorkersSync() {
  const [, setTick] = useState(0);
  useEffect(() => onSnapshot(workersRef(), snap => {
    const l = snap.exists() ? snap.data().list : null;
    if (validList(l)) { applyWorkers(l); setTick(x => x + 1); }
  }, () => {}), []);
}

// 管理画面用：非表示の人も含めた全員の一覧
export function useWorkerList() {
  const [state, setState] = useState({ loading: true, list: DEFAULT_LIST, saved: false, error: null });
  useEffect(() => onSnapshot(workersRef(), snap => {
    const l = snap.exists() ? snap.data().list : null;
    setState({ loading: false, list: validList(l) ? l : DEFAULT_LIST, saved: validList(l), error: null });
  }, e => setState(s => ({ ...s, loading: false, error: e.message || String(e) }))), []);
  return state;
}

// 管理者が保存を押したときだけ書く
export const saveWorkerList = list => {
  if (!validList(list)) throw new Error("作業員が0人になるので保存できません");
  return setDoc(workersRef(), { list, updatedAt: new Date().toISOString() });
};

// 名前のチェック（Firestoreのドキュメント名にも使うので / は禁止）
export const checkName = (name, list) => {
  const n = (name || "").trim();
  if (!n) return "名前を入れてね";
  if (n.length > 20) return "名前が長すぎます（20文字まで）";
  if (/[/\\]/.test(n) || n.startsWith("_")) return "使えない文字が入っています";
  if (n === OTHER) return "「その他」は最初からあります";
  if (list.some(w => w.name.replace(/\s/g, "") === n.replace(/\s/g, ""))) return "同じ名前がすでにあります";
  return null;
};
