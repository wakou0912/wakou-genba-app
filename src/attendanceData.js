// 出退勤管理のデータ層（現場日報アプリ内機能）。UI は Attendance.jsx
// プロト「出退勤管理 プロト v2」から移植。
//
// ■ 保存先（現場日報の db/main には一切書かない。別コレクション）
//   attendance/{yyyy-mm}/records/{id}  … 打刻1件ずつ（1件=1ドキュメント。配列ごと上書きしない）
//   attendance_devices/{作業員名}       … 端末の紐付け
//
// ■ 打刻レコード
//   { id, worker, date:'YYYY-MM-DD', inAt:'HH:MM', outAt:'HH:MM'|null,
//     rowId: 日報row.id | null(=現場未紐付け), genba: 紐付け時の現場名スナップショット,
//     breakMin, inGeo:{lat,lng,acc}|null, outGeo, manual, note, deletedAt:ISO|null, createdAt, updatedAt }
//
// ■ 注意
//   Firestore への書き込みは、打刻・紐付け・修正・端末登録などユーザーの明示操作のときだけ。
//   「無ければ作る」系の自動書き込みはしない（CLAUDE.md のデータ消失事故の教訓）。
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { firestore } from "./firebase";

// ─── ユーティリティ ───────────────────────────────
export const pad = n => String(n).padStart(2, "0");
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 日報の日付（"2026/11/23" など）→ "2026-11-23"
export const normDate = s => {
  if (!s) return "";
  const p = String(s).replace(/\//g, "-").split("-");
  if (p.length !== 3 || p.some(x => isNaN(+x))) return "";
  return `${p[0]}-${pad(+p[1])}-${pad(+p[2])}`;
};
export const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const WD = ["日", "月", "火", "水", "木", "金", "土"];
const prevYm = ym => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// 休憩の自動控除（6時間超なら60分）。会社ルールが決まったらここだけ直す。
export const AUTO_BREAK = { overMin: 360, breakMin: 60 };
// 残業＝1日8時間超 / 深夜＝22:00〜5:00（休憩控除後）。会社ルールが決まったらここだけ直す。
export const RULES = { dailyMin: 480, nightFrom: 22 * 60, nightTo: 5 * 60 };

export function calc(r) {
  if (!r.outAt) return { span: 0, work: 0, ot: 0, night: 0, open: true };
  const a = toMin(r.inAt);
  let b = toMin(r.outAt);
  if (b <= a) b += 1440;
  const span = b - a;
  const work = Math.max(0, span - (r.breakMin || 0));
  let night = 0;
  for (let m = a; m < b; m++) { const x = m % 1440; if (x >= RULES.nightFrom || x < RULES.nightTo) night++; }
  night = Math.min(night, work);
  return { span, work, ot: Math.max(0, work - RULES.dailyMin), night, open: false };
}
export const fmtHM = m => `${Math.floor(m / 60)}:${pad(m % 60)}`;
export const fmtH = m => (m / 60).toFixed(2);

// 30日を過ぎたゴミ箱の打刻は表示しない（自動では消さない）
const TRASH_MS = 30 * 86400000;
export const isLive = r => !r.deletedAt;
export const isInTrash = r => r.deletedAt && Date.now() - new Date(r.deletedAt).getTime() <= TRASH_MS;

// ─── Firestore ───────────────────────────────────
const recDoc = (date, id) => doc(firestore, "attendance", date.slice(0, 7), "records", id);
export const saveRecord = rec => setDoc(recDoc(rec.date, rec.id), rec);

export function useAttendanceMonth(ym) {
  const [st, setSt] = useState({ ym: null, records: [], error: null });
  useEffect(() => {
    const unsub = onSnapshot(
      collection(firestore, "attendance", ym, "records"),
      snap => setSt({ ym, records: snap.docs.map(d => d.data()), error: null }),
      err => setSt({ ym, records: [], error: err.message || String(err) })
    );
    return unsub;
  }, [ym]);
  return st.ym === ym ? st : { ym, records: [], error: null, loading: true };
}

const DEV_KEY = "wakou-attendance-device";
function getDeviceId() {
  try {
    let d = localStorage.getItem(DEV_KEY);
    if (!d) { d = "dev-" + newId(); localStorage.setItem(DEV_KEY, d); }
    return d;
  } catch { return "dev-temp"; }
}

function getGeo() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    try {
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }),
        () => res(null),
        { timeout: 5000, maximumAge: 30000, enableHighAccuracy: true }
      );
    } catch { res(null); }
  });
}

// 作業員本人の打刻状態と操作（WorkerView で1回だけ呼んで、カードとタブに渡す）
export function useMyAttendance(userName) {
  const cur = isoDate().slice(0, 7);
  const a = useAttendanceMonth(cur);
  const b = useAttendanceMonth(prevYm(cur)); // 月またぎの夜勤で「勤務中」を拾うため
  const records = useMemo(
    () => [...a.records, ...b.records].filter(r => r.worker === userName && isLive(r)),
    [a.records, b.records, userName]
  );
  const open = records.find(r => !r.outAt) || null;

  const [dev, setDev] = useState({ loading: true, data: null, error: null });
  const devId = getDeviceId();
  useEffect(() => {
    let alive = true;
    getDoc(doc(firestore, "attendance_devices", userName))
      .then(s => alive && setDev({ loading: false, data: s.exists() ? s.data() : null, error: null }))
      .catch(e => alive && setDev({ loading: false, data: null, error: e.message || String(e) }));
    return () => { alive = false; };
  }, [userName]);
  const status = dev.loading ? "loading" : dev.error ? "error" : !dev.data ? "unbound" : dev.data.deviceId === devId ? "ok" : "other";

  const bind = async () => {
    await setDoc(doc(firestore, "attendance_devices", userName), { worker: userName, deviceId: devId, boundAt: new Date().toISOString() });
    setDev({ loading: false, data: { deviceId: devId }, error: null });
  };

  // kind: "in" | "out" / row: 日報カード（無ければ現場未定）/ memo: 緊急時メモ
  const punch = async (kind, row, memo) => {
    if (status !== "ok") throw new Error("この端末は登録されていません");
    const now = new Date();
    const geo = await getGeo();
    if (kind === "in") {
      if (open) throw new Error("すでに勤務中です");
      const rec = {
        id: newId(), worker: userName, date: isoDate(now), inAt: hm(now), outAt: null,
        rowId: row ? row.id : null, genba: row ? row.genba || "" : "",
        breakMin: 0, inGeo: geo, outGeo: null, manual: false, note: (memo || "").trim(),
        deletedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      await saveRecord(rec);
      return rec;
    }
    if (!open) throw new Error("勤務中の打刻がありません");
    const next = { ...open, outAt: hm(now), outGeo: geo, updatedAt: now.toISOString() };
    next.breakMin = calc(next).span > AUTO_BREAK.overMin ? AUTO_BREAK.breakMin : 0;
    await saveRecord(next);
    return next;
  };

  return { records, open, status, devError: dev.error, bind, punch, error: a.error || b.error };
}

