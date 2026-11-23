import { useEffect, useState } from "react";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { firestore } from "./firebase";
import { isoDate, normDate, hm, pad, newId, WD, shiftYm, calc, fmtHM, fmtH, isLive, isInTrash, saveRecord, useAttendanceMonth } from "./attendanceData";

// ─── 見た目 ───────────────────────────────────────
const C = { bg: "#0d1520", line: "#1a2634", sub: "#546e7a", ink: "#cfd8dc", pri: "#4fc3f7", ok: "#66bb6a", ng: "#ef5350", warn: "#ffb74d", night: "#b39ddb" };
const btn = { padding: "8px 14px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const inp = { background: "#0a1018", border: `1px solid ${C.line}`, borderRadius: 5, padding: "7px 9px", fontSize: 13, color: C.ink, outline: "none", fontFamily: "inherit" };
const card = { background: C.bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 14 };
const th = { textAlign: "left", color: C.sub, fontSize: 11, padding: "6px 6px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };
const td = { padding: "7px 6px", borderBottom: `1px solid ${C.line}`, fontSize: 13, color: C.ink, whiteSpace: "nowrap" };
const num = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

function Modal({ children, onClose }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
      <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 14, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", padding: 16, fontFamily: "'Noto Sans JP',sans-serif", color: C.ink }}>
        {children}
      </div>
    </div>
  );
}
const dayLabel = iso => { const [y, m, d] = iso.split("-").map(Number); return `${m}/${d}（${WD[new Date(y, m - 1, d).getDay()]}）`; };

// ─── 現場への紐付け ───────────────────────────────
// rows: その作業員の日報（db.rows[worker]）。同じ日の日報から選ぶ。
function LinkModal({ rec, rows, onClose, onDone, onError }) {
  const sameDay = (rows || []).filter(r => normDate(r.date) === rec.date);
  const link = async row => {
    try {
      await saveRecord({ ...rec, rowId: row ? row.id : null, genba: row ? row.genba || "" : "", updatedAt: new Date().toISOString() });
      onDone(row ? "紐付けました" : "紐付けを外しました");
    } catch (e) { onError(e); }
  };
  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>この打刻の現場を選ぶ</div>
      <div style={{ color: C.sub, fontSize: 12, marginBottom: 10 }}>{rec.worker} {dayLabel(rec.date)} {rec.inAt}〜{rec.outAt || "勤務中"} {rec.note}</div>
      {sameDay.length === 0 && (
        <div style={{ color: C.warn, fontSize: 12, marginBottom: 10 }}>この日の日報がありません。先に日報タブで「＋ 現場を追加」してから紐付けてね。</div>
      )}
      {sameDay.map(r => (
        <button key={r.id} onClick={() => link(r)}
          style={{ ...btn, display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: "12px 12px", background: rec.rowId === r.id ? "#0d2030" : "#0a1018", color: C.ink, border: `1px solid ${rec.rowId === r.id ? C.pri : C.line}` }}>
          📋 {r.genba || "(現場名なし)"}{r.startTime ? <span style={{ color: C.sub }}>&emsp;{r.startTime}</span> : null}
        </button>
      ))}
      {rec.rowId && <button onClick={() => link(null)} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}`, marginRight: 8 }}>紐付けを外す</button>}
      <button onClick={onClose} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>閉じる</button>
    </Modal>
  );
}

// ─── 記録の修正／手入力追加 ───────────────────────
function EditModal({ rec, workers, isAdmin, defaultWorker, onClose, onDone, onError }) {
  const isNew = !rec;
  const [f, setF] = useState(() => rec
    ? { worker: rec.worker, date: rec.date, inAt: rec.inAt, outAt: rec.outAt || "", breakMin: rec.breakMin || 0, note: rec.note || "" }
    : { worker: defaultWorker, date: isoDate(), inAt: "08:00", outAt: "17:00", breakMin: 60, note: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.date || !f.inAt) return onError(new Error("日付と出勤時刻は必須です"));
    try {
      const now = new Date().toISOString();
      const base = rec || { id: newId(), rowId: null, genba: "", inGeo: null, outGeo: null, deletedAt: null, createdAt: now };
      await saveRecord({ ...base, worker: f.worker, date: f.date, inAt: f.inAt, outAt: f.outAt || null, breakMin: +f.breakMin || 0, note: f.note, manual: true, updatedAt: now });
      onDone("保存しました");
    } catch (e) { onError(e); }
  };
  const lab = { display: "block", fontSize: 11, color: C.sub, marginTop: 10, marginBottom: 3 };
  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{isNew ? "手入力で追加（押し忘れ）" : "記録を修正"}</div>
      <label style={lab}>作業員</label>
      <select value={f.worker} disabled={!isAdmin || !isNew} onChange={e => set("worker", e.target.value)} style={{ ...inp, width: "100%" }}>{workers.map(w => <option key={w}>{w}</option>)}</select>
      <label style={lab}>日付{!isNew && "（変更不可）"}</label>
      <input type="date" value={f.date} disabled={!isNew} onChange={e => set("date", e.target.value)} style={{ ...inp, width: "100%" }} />
      <label style={lab}>出勤</label>
      <input type="time" value={f.inAt} onChange={e => set("inAt", e.target.value)} style={{ ...inp, width: "100%" }} />
      <label style={lab}>退勤（勤務中なら空）</label>
      <input type="time" value={f.outAt} onChange={e => set("outAt", e.target.value)} style={{ ...inp, width: "100%" }} />
      <label style={lab}>休憩（分）</label>
      <input type="number" min="0" step="5" value={f.breakMin} onChange={e => set("breakMin", e.target.value)} style={{ ...inp, width: "100%" }} />
      <label style={lab}>メモ（現場は保存後に「🔗 紐付け」で選べる）</label>
      <input type="text" value={f.note} onChange={e => set("note", e.target.value)} style={{ ...inp, width: "100%" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={save} style={{ ...btn, background: C.pri, color: "#080e14" }}>保存</button>
        <button onClick={onClose} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>キャンセル</button>
      </div>
    </Modal>
  );
}

// ─── 日報カードに置く出退勤ボタン ───────────────────
// 今日・自分の日報カードだけに出る。押すとその現場の日報に紐付いた打刻になる。
export function AttendanceCardButton({ row, userName, att, onMsg }) {
  const [busy, setBusy] = useState(false);
  if (!att || row.worker !== userName || normDate(row.date) !== isoDate()) return null;
  const mine = att.records.filter(r => r.rowId === row.id).sort((a, b) => a.inAt.localeCompare(b.inAt));
  const openHere = mine.find(r => !r.outAt);
  const otherOpen = att.open && !openHere;
  const go = async kind => {
    setBusy(true);
    try { const r = await att.punch(kind, row, ""); onMsg?.(kind === "in" ? `出勤 ${r.inAt}` : `退勤 ${r.outAt}`); }
    catch (e) { onMsg?.("⚠ " + (e.message || e)); }
    setBusy(false);
  };
  // 端末が未登録のときは、その場で登録できる（登録のあと、もう一度「出勤」を押す）
  const bindHere = async () => {
    setBusy(true);
    try { await att.bind(); onMsg?.("端末を登録しました。もう一度「出勤」を押してね"); }
    catch (e) { onMsg?.("⚠ " + (e.message || e)); }
    setBusy(false);
  };
  // 押せないときは、理由を必ず表示する
  const reason = att.status === "loading" ? "端末を確認中…"
    : att.status === "other" ? "別の端末で登録済み（管理者に端末解除を頼んでね）"
    : att.status === "error" ? "端末情報を読めません（Firestoreルールを確認）"
    : openHere ? "" : otherOpen ? "他の現場で勤務中" : "";
  const ok = att.status === "ok";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      {mine.length > 0 && <div style={{ color: C.sub, fontSize: 10 }}>{mine.map(r => `${r.inAt}〜${r.outAt || "勤務中"}`).join(" / ")}</div>}
      {att.status === "unbound"
        ? <button disabled={busy} onClick={bindHere} style={{ ...btn, background: "#0d2030", color: C.pri, border: `1px solid ${C.pri}`, fontSize: 12 }}>📱 この端末を登録</button>
        : openHere
          ? <button disabled={busy || !ok} onClick={() => go("out")} style={{ ...btn, background: C.ng, color: "#fff", fontSize: 12, opacity: busy || !ok ? 0.4 : 1 }}>⏱ 退勤</button>
          : <button disabled={busy || otherOpen || !ok} onClick={() => go("in")}
              style={{ ...btn, background: "#0a1f0a", color: "#a5d6a7", border: "1px solid #1a3a1a", fontSize: 12, opacity: busy || otherOpen || !ok ? 0.4 : 1 }}>⏱ 出勤</button>}
      {att.status === "unbound" && <div style={{ color: C.warn, fontSize: 10 }}>先に端末の登録が必要</div>}
      {reason && <div style={{ color: C.warn, fontSize: 10, maxWidth: 170, textAlign: "right" }}>{reason}</div>}
    </div>
  );
}

// ─── 作業員の「出退勤」タブ ─────────────────────────
export function AttendanceWorkerTab({ userName, rows, att, onMsg }) {
  const [clock, setClock] = useState(new Date());
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined=閉, null=新規, rec=修正
  const [month, setMonth] = useState(isoDate().slice(0, 7));
  const hist = useAttendanceMonth(month);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const run = async fn => { setBusy(true); try { await fn(); } catch (e) { onMsg?.("⚠ " + (e.message || e)); } setBusy(false); };
  const today = isoDate();
  const todayRecs = att.records.filter(r => r.date === today).sort((a, b) => a.inAt.localeCompare(b.inAt));
  const unlinked = att.records.filter(r => !r.rowId).sort((a, b) => b.date.localeCompare(a.date));
  const mineMonth = hist.records.filter(r => r.worker === userName && isLive(r)).sort((a, b) => b.date.localeCompare(a.date) || b.inAt.localeCompare(a.inAt));
  const tot = mineMonth.reduce((a, r) => { const c = calc(r); a.w += c.work; a.o += c.ot; a.n += c.night; return a; }, { w: 0, o: 0, n: 0 });
  const days = new Set(mineMonth.map(r => r.date)).size;
  const done = m => () => { setLinking(null); setEditing(undefined); onMsg?.(m); };
  const fail = e => onMsg?.("⚠ " + (e.message || e));

  const delRec = r => run(async () => { await saveRecord({ ...r, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); onMsg?.("ゴミ箱へ移動しました"); });

  return (
    <div style={{ padding: 16, maxWidth: 640, margin: "0 auto", fontFamily: "'Noto Sans JP',sans-serif", color: C.ink }}>
      {att.error && <div style={{ ...card, borderColor: C.ng, color: C.ng, fontSize: 12 }}>読み込みエラー: {att.error}<br />（Firestoreルールで attendance / attendance_devices の読み書きが許可されているか確認）</div>}

      <div style={card}>
        <div style={{ textAlign: "center", color: C.sub, fontSize: 12 }}>{clock.getFullYear()}年{clock.getMonth() + 1}月{clock.getDate()}日（{WD[clock.getDay()]}）</div>
        <div style={{ textAlign: "center", fontSize: 44, fontWeight: 800, letterSpacing: 2, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{hm(clock)}:{pad(clock.getSeconds())}</div>
        {att.open && <div style={{ textAlign: "center", marginTop: 4, fontSize: 13 }}><span style={{ color: C.ok, fontWeight: 700 }}>勤務中</span> {att.open.inAt}〜 / {att.open.genba || "現場未定"}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <button disabled={busy || !!att.open || att.status !== "ok"} onClick={() => run(async () => { const r = await att.punch("in", null, memo); setMemo(""); onMsg?.(`出勤 ${r.inAt}（現場は後で紐付け）`); })}
            style={{ ...btn, padding: "24px 8px", fontSize: 22, fontWeight: 800, background: "#14894f", color: "#fff", borderRadius: 14, opacity: busy || att.open || att.status !== "ok" ? 0.35 : 1 }}>
            出勤<div style={{ fontSize: 11, fontWeight: 400 }}>現場は後で紐付け</div>
          </button>
          <button disabled={busy || !att.open || att.status !== "ok"} onClick={() => run(async () => { const r = await att.punch("out"); onMsg?.(`退勤 ${r.outAt}`); })}
            style={{ ...btn, padding: "24px 8px", fontSize: 22, fontWeight: 800, background: "#d33a3a", color: "#fff", borderRadius: 14, opacity: busy || !att.open || att.status !== "ok" ? 0.35 : 1 }}>退勤</button>
        </div>
        <input value={memo} onChange={e => setMemo(e.target.value)} disabled={!!att.open} placeholder="緊急時のメモ（任意：例 ○○ビル緊急）" style={{ ...inp, width: "100%", marginTop: 10 }} />
        <div style={{ color: C.sub, fontSize: 11, marginTop: 8 }}>日報の現場カードの「⏱ 出勤」を押すと、その現場の日報に紐付いた打刻になるよ。</div>
      </div>

      {unlinked.length > 0 && (
        <div style={{ ...card, borderColor: "#8a6a2a", background: "#1a1408" }}>
          <div style={{ fontWeight: 800, marginBottom: 8, color: C.warn }}>🔗 現場が未紐付けの打刻（{unlinked.length}件）</div>
          {unlinked.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ flex: 1, fontSize: 13 }}>{dayLabel(r.date)} {r.inAt}〜{r.outAt || "勤務中"} <span style={{ color: C.sub }}>{r.note}</span></div>
              <button onClick={() => setLinking(r)} style={{ ...btn, background: C.pri, color: "#080e14" }}>現場に紐付け</button>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>端末の登録</div>
        {att.status === "loading" && <div style={{ color: C.sub, fontSize: 12 }}>確認中…</div>}
        {att.status === "ok" && <div style={{ color: C.ok, fontSize: 12 }}>✓ この端末は {userName} の端末として登録済み</div>}
        {att.status === "other" && <div style={{ color: C.ng, fontSize: 12 }}>この端末は {userName} の端末として登録されていません。別の端末で登録済みです。端末を変えた場合は管理者に「端末解除」を頼んでね。</div>}
        {att.status === "error" && <div style={{ color: C.ng, fontSize: 12 }}>端末情報を読めませんでした: {att.devError}</div>}
        {att.status === "unbound" && (
          <>
            <div style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>打刻する前に、この端末を {userName} の端末として登録します（なりすまし防止）。</div>
            <button onClick={() => run(async () => { await att.bind(); onMsg?.("端末を登録しました"); })} style={{ ...btn, background: C.pri, color: "#080e14" }}>この端末を {userName} に登録</button>
          </>
        )}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>今日の記録</div>
        {todayRecs.length === 0 && <div style={{ color: C.sub, fontSize: 12 }}>まだ記録なし</div>}
        {todayRecs.map(r => (
          <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "5px 0" }}>
            <span style={{ flex: 1 }}>{r.inAt}〜{r.outAt || <span style={{ color: C.ok }}>勤務中</span>}&emsp;{r.genba || <span style={{ color: C.warn }}>未紐付け</span>}</span>
            {r.outAt && <span style={{ color: C.sub }}>{fmtHM(calc(r).work)}</span>}
          </div>
        ))}
        <button onClick={() => setEditing(null)} style={{ ...btn, marginTop: 8, background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>押し忘れ・手入力で追加</button>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 800, flex: 1 }}>自分の履歴</div>
          <button onClick={() => setMonth(shiftYm(month, -1))} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>◀</button>
          <span style={{ fontSize: 13 }}>{month}</span>
          <button onClick={() => setMonth(shiftYm(month, 1))} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>▶</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {[["出勤日数", `${days}日`], ["実働", fmtHM(tot.w)], ["残業", fmtHM(tot.o)], ["深夜", fmtHM(tot.n)]].map(([k, v]) => (
            <div key={k} style={{ flex: 1, minWidth: 70, background: "#0a1018", borderRadius: 8, padding: "6px 10px" }}><div style={{ color: C.sub, fontSize: 10 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div></div>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>日</th><th style={th}>現場</th><th style={th}>出退勤</th><th style={{ ...th, ...num }}>実働</th><th style={th}></th></tr></thead>
            <tbody>
              {mineMonth.map(r => (
                <tr key={r.id}>
                  <td style={td}>{dayLabel(r.date)}</td>
                  <td style={td}>{r.genba || <span style={{ color: C.warn }}>未紐付け{r.note ? `（${r.note}）` : ""}</span>}</td>
                  <td style={td}>{r.inAt}〜{r.outAt || "勤務中"}{r.manual && <span style={{ color: C.warn, fontSize: 10 }}> 手入力</span>}</td>
                  <td style={{ ...td, ...num }}>{r.outAt ? fmtHM(calc(r).work) : ""}</td>
                  <td style={td}>
                    <button onClick={() => setLinking(r)} style={{ ...btn, padding: "4px 8px", background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>🔗</button>{" "}
                    <button onClick={() => setEditing(r)} style={{ ...btn, padding: "4px 8px", background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>✏️</button>{" "}
                    <button onClick={() => delRec(r)} style={{ ...btn, padding: "4px 8px", background: "transparent", color: C.ng, border: `1px solid ${C.line}` }}>🗑</button>
                  </td>
                </tr>
              ))}
              {mineMonth.length === 0 && <tr><td colSpan={5} style={{ ...td, color: C.sub }}>記録なし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {linking && <LinkModal rec={linking} rows={rows} onClose={() => setLinking(null)} onDone={done} onError={fail} />}
      {editing !== undefined && <EditModal rec={editing} workers={[userName]} isAdmin={false} defaultWorker={userName} onClose={() => setEditing(undefined)} onDone={done} onError={fail} />}
    </div>
  );
}

// ─── 管理者の「出退勤」タブ ─────────────────────────
export function AttendanceAdminTab({ db, workers, onMsg }) {
  const [month, setMonth] = useState(isoDate().slice(0, 7));
  const [who, setWho] = useState("全員");
  const [linking, setLinking] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [devs, setDevs] = useState({});
  const [devTick, setDevTick] = useState(0);
  const st = useAttendanceMonth(month);
  const [copy, setCopy] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all(workers.map(w => getDoc(doc(firestore, "attendance_devices", w)).then(s => [w, s.exists()]).catch(() => [w, null])))
      .then(a => alive && setDevs(Object.fromEntries(a)));
    return () => { alive = false; };
  }, [workers, devTick]);

  const all = st.records;
  const live = all.filter(isLive);
  const trash = all.filter(isInTrash);
  const sorted = live.filter(r => who === "全員" || r.worker === who).sort((a, b) => a.date.localeCompare(b.date) || a.inAt.localeCompare(b.inAt));
  const unlinked = live.filter(r => !r.rowId).sort((a, b) => a.date.localeCompare(b.date));
  const summary = workers.map(w => {
    const rs = live.filter(r => r.worker === w);
    const t = rs.reduce((a, r) => { const c = calc(r); a.work += c.work; a.ot += c.ot; a.night += c.night; return a; }, { work: 0, ot: 0, night: 0 });
    return { worker: w, days: new Set(rs.map(r => r.date)).size, ...t, open: rs.filter(r => !r.outAt).length, unl: rs.filter(r => !r.rowId).length };
  });
  const done = m => { setLinking(null); setEditing(undefined); onMsg?.(m); };
  const fail = e => onMsg?.("⚠ " + (e.message || e));
  const del = async r => { try { await saveRecord({ ...r, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); onMsg?.("ゴミ箱へ移動しました"); } catch (e) { fail(e); } };
  const restore = async r => { try { await saveRecord({ ...r, deletedAt: null, updatedAt: new Date().toISOString() }); onMsg?.("戻しました"); } catch (e) { fail(e); } };
  const unbind = async w => { try { await deleteDoc(doc(firestore, "attendance_devices", w)); setDevTick(x => x + 1); onMsg?.(`${w} の端末登録を解除しました`); } catch (e) { fail(e); } };

  const showText = (title, text) => {
    try { navigator.clipboard.writeText(text).then(() => onMsg?.(title + "をコピーしました"), () => setCopy({ title, text })); } catch { setCopy({ title, text }); }
  };
  const csv = () => {
    const l = ["日付,作業員,現場,出勤,退勤,休憩分,実働h,残業h,深夜h,メモ"];
    sorted.forEach(r => { const c = calc(r); l.push([r.date, r.worker, r.genba || "未紐付け", r.inAt, r.outAt || "", r.breakMin || 0, fmtH(c.work), fmtH(c.ot), fmtH(c.night), (r.note || "").replace(/,/g, " ")].join(",")); });
    showText("CSV", l.join("\n"));
  };
  const payrollJson = () => showText("給与連携JSON", JSON.stringify({
    schema: "wakou-attendance-payroll/v1", month,
    rows: summary.map(x => ({ worker: x.worker, days: x.days, workMin: x.work, overtimeMin: x.ot, nightMin: x.night })),
  }, null, 1));

  return (
    <div style={{ padding: 16, maxWidth: 920, margin: "0 auto", fontFamily: "'Noto Sans JP',sans-serif", color: C.ink }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setMonth(shiftYm(month, -1))} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>◀</button>
        <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={inp} />
        <button onClick={() => setMonth(shiftYm(month, 1))} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>▶</button>
        <span style={{ marginLeft: "auto" }} />
        <button onClick={() => setEditing(null)} style={{ ...btn, background: "#0a1f0a", color: "#a5d6a7", border: "1px solid #1a3a1a" }}>＋ 追加</button>
        <button onClick={csv} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>CSVコピー</button>
      </div>
      {st.error && <div style={{ ...card, borderColor: C.ng, color: C.ng, fontSize: 12 }}>読み込みエラー: {st.error}</div>}

      {unlinked.length > 0 && (
        <div style={{ ...card, borderColor: "#8a6a2a", background: "#1a1408" }}>
          <div style={{ fontWeight: 800, color: C.warn, marginBottom: 6 }}>⚠ 現場が未紐付けの打刻 {unlinked.length} 件</div>
          <div style={{ color: C.sub, fontSize: 11, marginBottom: 6 }}>勤務時間の集計には入る。日報（現場）との連携からは外れてる。行の「🔗」で紐付け。</div>
          {unlinked.map(r => (
            <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
              <span style={{ flex: 1 }}>{dayLabel(r.date)} {r.worker} {r.inAt}〜{r.outAt || "勤務中"} <span style={{ color: C.sub }}>{r.note}</span></span>
              <button onClick={() => setLinking(r)} style={{ ...btn, padding: "5px 10px", background: C.pri, color: "#080e14" }}>🔗 紐付け</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{month} 月間集計</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>名前</th><th style={{ ...th, ...num }}>日数</th><th style={{ ...th, ...num }}>実働</th><th style={{ ...th, ...num }}>残業</th><th style={{ ...th, ...num }}>深夜</th><th style={th}></th></tr></thead>
          <tbody>
            {summary.map(x => (
              <tr key={x.worker}>
                <td style={td}>{x.worker}</td><td style={{ ...td, ...num }}>{x.days}</td><td style={{ ...td, ...num }}>{fmtHM(x.work)}</td>
                <td style={{ ...td, ...num, color: C.warn }}>{fmtHM(x.ot)}</td><td style={{ ...td, ...num, color: C.night }}>{fmtHM(x.night)}</td>
                <td style={td}>{x.open > 0 && <span style={{ color: C.ok, fontSize: 11 }}>勤務中/打刻漏れ {x.open}&emsp;</span>}{x.unl > 0 && <span style={{ color: C.warn, fontSize: 11 }}>未紐付け {x.unl}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ color: C.sub, fontSize: 11, marginTop: 6 }}>残業＝1日8時間超 / 深夜＝22:00〜5:00（休憩控除後）</div>
        <button onClick={payrollJson} style={{ ...btn, marginTop: 8, background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>給与連携JSONをコピー</button>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 800, flex: 1 }}>明細</div>
          <select value={who} onChange={e => setWho(e.target.value)} style={inp}><option>全員</option>{workers.map(w => <option key={w}>{w}</option>)}</select>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>日</th><th style={th}>名前</th><th style={th}>現場</th><th style={th}>出退勤</th><th style={{ ...th, ...num }}>実働</th><th style={{ ...th, ...num }}>残業</th><th style={{ ...th, ...num }}>深夜</th><th style={th}></th></tr></thead>
          <tbody>
            {sorted.map(r => { const c = calc(r); return (
              <tr key={r.id}>
                <td style={td}>{dayLabel(r.date)}</td><td style={td}>{r.worker}</td>
                <td style={td}>{r.genba || <span style={{ color: C.warn }}>未紐付け{r.note ? `（${r.note}）` : ""}</span>}</td>
                <td style={td}>{r.inAt}〜{r.outAt || "勤務中"}{r.manual && <span style={{ color: C.warn, fontSize: 10 }}> 手入力</span>}{r.inGeo && " 📍"}</td>
                <td style={{ ...td, ...num }}>{c.open ? "" : fmtHM(c.work)}</td>
                <td style={{ ...td, ...num, color: C.warn }}>{c.ot ? fmtHM(c.ot) : ""}</td>
                <td style={{ ...td, ...num, color: C.night }}>{c.night ? fmtHM(c.night) : ""}</td>
                <td style={td}>
                  <button onClick={() => setLinking(r)} style={{ ...btn, padding: "4px 8px", background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>🔗</button>{" "}
                  <button onClick={() => setEditing(r)} style={{ ...btn, padding: "4px 8px", background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>✏️</button>{" "}
                  <button onClick={() => del(r)} style={{ ...btn, padding: "4px 8px", background: "transparent", color: C.ng, border: `1px solid ${C.line}` }}>🗑</button>
                </td>
              </tr>
            ); })}
            {sorted.length === 0 && <tr><td colSpan={8} style={{ ...td, color: C.sub }}>記録なし</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>端末の登録状況</div>
        {workers.map(w => (
          <div key={w} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}>
            <span style={{ width: 90 }}>{w}</span>
            <span style={{ flex: 1, color: devs[w] ? C.ok : C.sub }}>{devs[w] === null ? "確認できません" : devs[w] ? "登録済み" : "未登録"}</span>
            {devs[w] && <button onClick={() => unbind(w)} style={{ ...btn, padding: "4px 10px", background: "transparent", color: C.ng, border: `1px solid ${C.line}` }}>端末解除</button>}
          </div>
        ))}
      </div>

      {trash.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>ゴミ箱（{trash.length}件・30日を過ぎると表示されなくなる）</div>
          {trash.map(r => (
            <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
              <span style={{ flex: 1 }}>{dayLabel(r.date)} {r.worker} {r.inAt}〜{r.outAt || ""} {r.genba}</span>
              <button onClick={() => restore(r)} style={{ ...btn, padding: "4px 10px", background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>戻す</button>
            </div>
          ))}
        </div>
      )}

      {linking && <LinkModal rec={linking} rows={db?.rows?.[linking.worker] || []} onClose={() => setLinking(null)} onDone={done} onError={fail} />}
      {editing !== undefined && <EditModal rec={editing} workers={workers} isAdmin defaultWorker={workers[0]} onClose={() => setEditing(undefined)} onDone={done} onError={fail} />}
      {copy && (
        <Modal onClose={() => setCopy(null)}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{copy.title}（選択してコピー）</div>
          <textarea readOnly value={copy.text} onClick={e => e.target.select()} style={{ ...inp, width: "100%", minHeight: 160, fontFamily: "monospace", fontSize: 11 }} />
          <button onClick={() => setCopy(null)} style={{ ...btn, marginTop: 8, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>閉じる</button>
        </Modal>
      )}
    </div>
  );
}
