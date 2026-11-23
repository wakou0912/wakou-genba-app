// 出退勤管理のデータ層（現場日報アプリ内機能）。UI は Attendance.jsx
// プロト「出退勤管理 プロト v2」から移植。
//
// ■ 保存先（現場日報の db/main には一切書かない。別コレクション）
//   attendance/{yyyy-mm}/records/{id}  … 打刻1件ずつ（1件=1ドキュメント。配列ごと上書きしない）
//   attendance_devices/{作業員名}       … 端末の紐付け {worker, devices:[{deviceId, boundAt, label}], pending:[{deviceId, label, requestedAt}]}
//                                         自分で登録できるのは MAX_DEVICES 台まで。それ以上は pending に依頼 → 管理者が承認
//
// ■ 打刻レコード
//   { id, worker, date:'YYYY-MM-DD', inAt:'HH:MM', outAt:'HH:MM'|null,
//   ※現場（日報）とは紐付けない。1日1回の出勤・退勤を記録する。
//     breakMin, inGeo:{lat,lng,acc}|null, outGeo, manual, note, deletedAt:ISO|null, createdAt, updatedAt }
//
// ■ 注意
//   Firestore への書き込みは、打刻・修正・端末登録などユーザーの明示操作のときだけ。
//   「無ければ作る」系の自動書き込みはしない（CLAUDE.md のデータ消失事故の教訓）。
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, setDoc, runTransaction } from "firebase/firestore";
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
  if (b < a) b += 1440; // 退勤が出勤より前のときだけ日またぎ（夜勤）。同じ分なら 0 分
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

// 1人あたり登録できる端末の数
export const MAX_DEVICES = 1; // 自分で登録できるのは1台目だけ。2台目以降は管理者の承認
// 端末ドキュメント → 端末の配列。昔の形式（deviceId が1つだけ）も読める
export const devicesOf = data => !data ? [] : Array.isArray(data.devices) ? data.devices : data.deviceId ? [{ deviceId: data.deviceId, boundAt: data.boundAt || null, label: "" }] : [];
function deviceLabel() {
  const u = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  return /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows" : /Mac/.test(u) ? "Mac" : "端末";
}
// 承認待ちの端末（4台目以降の追加依頼）
// 管理者が「次の1台を許可」した期限（まだ有効なときだけ値を返す）
export const allowOf = data => (data && data.allowUntil && new Date(data.allowUntil).getTime() > Date.now() ? data.allowUntil : null);
export const pendingOf = data => (data && Array.isArray(data.pending) ? data.pending : []);
const devRef = worker => doc(firestore, "attendance_devices", worker);
// 端末ドキュメントを書く（devices と pending は必ずセットで書いて、片方を消さない）
// merge:true … 管理者が出した「次の1台を許可」（allowUntil）を消さないため
const writeDev = (tx, worker, devices, pending) => tx.set(devRef(worker), { worker, devices, pending }, { merge: true });
const readDev = async (tx, worker) => { const s = await tx.get(devRef(worker)); const d = s.exists() ? s.data() : null; return { devices: devicesOf(d), pending: pendingOf(d), allow: allowOf(d) }; };

// 管理者用：端末を1台だけ解除する
export const unbindDevice = (worker, deviceId) => runTransaction(firestore, async tx => {
  const { devices, pending } = await readDev(tx, worker);
  writeDev(tx, worker, devices.filter(d => d.deviceId !== deviceId), pending);
});
// 管理者用：追加依頼を承認する（自動登録の上限を超えても登録できる）
export const approveDevice = (worker, deviceId) => runTransaction(firestore, async tx => {
  const { devices, pending } = await readDev(tx, worker);
  const req = pending.find(d => d.deviceId === deviceId);
  if (!req) throw new Error("この依頼はもうありません（本人が取り下げたか、別の管理者が処理済み）");
  const next = devices.some(d => d.deviceId === deviceId) ? devices : [...devices, { deviceId, boundAt: new Date().toISOString(), label: req.label || "" }];
  writeDev(tx, worker, next, pending.filter(d => d.deviceId !== deviceId));
});
// 管理者用：依頼がなくても「次にログインした1台」を登録できるようにする（期限つき・1回だけ）
export const allowNextDevice = (worker, minutes = 30) => runTransaction(firestore, async tx => {
  const { devices, pending } = await readDev(tx, worker);
  tx.set(devRef(worker), { worker, devices, pending, allowUntil: new Date(Date.now() + minutes * 60000).toISOString() }, { merge: true });
});
export const cancelAllow = worker => runTransaction(firestore, async tx => {
  const { devices, pending } = await readDev(tx, worker);
  tx.set(devRef(worker), { worker, devices, pending, allowUntil: null }, { merge: true });
});
// 管理者用：追加依頼を却下する
export const rejectDevice = (worker, deviceId) => runTransaction(firestore, async tx => {
  const { devices, pending } = await readDev(tx, worker);
  writeDev(tx, worker, devices, pending.filter(d => d.deviceId !== deviceId));
});

// ログイン時の端末チェック（作業員ログイン用）
//  ok        … この端末は登録済み、または1台目として今登録した
//  requested … 管理者の承認待ち
//  blocked   … 別の端末が登録済み（追加の依頼が必要）
export const checkLoginDevice = worker => runTransaction(firestore, async tx => {
  const id = getDeviceId();
  const { devices, pending, allow } = await readDev(tx, worker);
  if (devices.some(d => d.deviceId === id)) return "ok";
  // 管理者が「次の1台を許可」していれば、この端末を登録して許可は使い切り
  if (allow) { tx.set(devRef(worker), { worker, devices: [...devices, { deviceId: id, boundAt: new Date().toISOString(), label: deviceLabel() }], pending: pending.filter(d => d.deviceId !== id), allowUntil: null }, { merge: true }); return "ok"; }
  if (devices.length === 0) { writeDev(tx, worker, [{ deviceId: id, boundAt: new Date().toISOString(), label: deviceLabel() }], pending.filter(d => d.deviceId !== id)); return "ok"; }
  return pending.some(d => d.deviceId === id) ? "requested" : "blocked";
});
// ログイン画面から、この端末の追加を管理者に依頼する
export const requestLoginDevice = worker => runTransaction(firestore, async tx => {
  const id = getDeviceId();
  const { devices, pending } = await readDev(tx, worker);
  if (devices.some(d => d.deviceId === id) || pending.some(d => d.deviceId === id)) return;
  writeDev(tx, worker, devices, [...pending, { deviceId: id, label: deviceLabel(), requestedAt: new Date().toISOString() }]);
});

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
  const [devTick, setDevTick] = useState(0);
  const devId = getDeviceId();
  useEffect(() => {
    let alive = true;
    getDoc(doc(firestore, "attendance_devices", userName))
      .then(s => alive && setDev({ loading: false, data: s.exists() ? s.data() : null, error: null }))
      .catch(e => alive && setDev({ loading: false, data: null, error: e.message || String(e) }));
    return () => { alive = false; };
  }, [userName, devTick]);
  const devices = devicesOf(dev.data);
  const pending = pendingOf(dev.data);
  // ok=この端末は登録済み / unbound=まだ登録できる / full=自動登録の枠いっぱい（追加は管理者に依頼） / requested=管理者の承認待ち
  const status = dev.loading ? "loading" : dev.error ? "error"
    : devices.some(d => d.deviceId === devId) ? "ok"
    : pending.some(d => d.deviceId === devId) ? "requested"
    : devices.length < MAX_DEVICES ? "unbound" : "full";

  const bind = async () => {
    // 同時に2台が登録しても上限を超えないように、トランザクションで読んで書く
    const merged = await runTransaction(firestore, async tx => {
      const { devices: cur, pending: pen } = await readDev(tx, userName);
      if (cur.some(d => d.deviceId === devId)) return { devices: cur, pending: pen };
      if (cur.length >= MAX_DEVICES) throw new Error(`すでに${MAX_DEVICES}台が登録されています。「管理者に追加を依頼」を押してね`);
      const next = [...cur, { deviceId: devId, boundAt: new Date().toISOString(), label: deviceLabel() }];
      const pen2 = pen.filter(d => d.deviceId !== devId);
      writeDev(tx, userName, next, pen2);
      return { devices: next, pending: pen2 };
    });
    setDev({ loading: false, data: merged, error: null });
  };

  // 4台目以降：管理者に追加を依頼する（承認されるまで、この端末では打刻できない）
  const requestAdd = async () => {
    const merged = await runTransaction(firestore, async tx => {
      const { devices: cur, pending: pen } = await readDev(tx, userName);
      if (cur.some(d => d.deviceId === devId) || pen.some(d => d.deviceId === devId)) return { devices: cur, pending: pen };
      const next = [...pen, { deviceId: devId, label: deviceLabel(), requestedAt: new Date().toISOString() }];
      writeDev(tx, userName, cur, next);
      return { devices: cur, pending: next };
    });
    setDev({ loading: false, data: merged, error: null });
  };

  // kind: "in" | "out" / memo: 任意のメモ
  const punch = async (kind, memo) => {
    if (status !== "ok") throw new Error("この端末は登録されていません");
    const now = new Date();
    const geo = await getGeo();
    if (kind === "in") {
      if (open) throw new Error("すでに勤務中です");
      const rec = {
        id: newId(), worker: userName, date: isoDate(now), inAt: hm(now), outAt: null,
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

  return { records, open, status, devices, devError: dev.error, bind, requestAdd, refreshDevice: () => setDevTick(x => x + 1), punch, error: a.error || b.error };
}

