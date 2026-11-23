import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "./firebase";
import { isoDate, normDate, hm, pad, newId, WD, shiftYm, calc, fmtHM, fmtH, isLive, isInTrash, saveRecord, useAttendanceMonth, devicesOf, pendingOf, allowOf, unbindDevice, approveDevice, rejectDevice, allowNextDevice, cancelAllow, ADMIN_DEV_DOC, myDeviceId, registerAdminDevice, unbindAdminDevice } from "./attendanceData";

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

// ─── 日報の日付・カードに出す、その日の出退勤（表示だけ。ボタンなし）─────────────
// date は日報の日付（"2026/11/23" など）。同じ日の打刻を「最初の出勤〜最後の退勤」でまとめて出す。
export function AttendanceDayChip({ records, worker, date, style }) {
  const iso = normDate(date);
  const rs = (records || []).filter(r => r.worker === worker && r.date === iso && isLive(r)).sort((a, b) => a.inAt.localeCompare(b.inAt));
  if (rs.length === 0) return null;
  const first = rs[0];
  const last = rs[rs.length - 1];
  const open = rs.some(r => !r.outAt);
  const work = rs.reduce((a, r) => a + calc(r).work, 0);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0a1f0a", color: "#a5d6a7", border: "1px solid #1a3a1a", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700, ...style }}>
      ⏱ {first.inAt}〜{open ? "勤務中" : last.outAt}{!open && <span style={{ color: C.sub, fontWeight: 400 }}>（実働 {fmtHM(work)}）</span>}
    </span>
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
      const base = rec || { id: newId(), inGeo: null, outGeo: null, deletedAt: null, createdAt: now };
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
      <label style={lab}>メモ（任意）</label>
      <input type="text" value={f.note} onChange={e => set("note", e.target.value)} style={{ ...inp, width: "100%" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={save} style={{ ...btn, background: C.pri, color: "#080e14" }}>保存</button>
        <button onClick={onClose} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>キャンセル</button>
      </div>
    </Modal>
  );
}

// ─── 作業員の「出退勤」タブ ─────────────────────────
export function AttendanceWorkerTab({ userName, att, onMsg }) {
  const [clock, setClock] = useState(new Date());
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null); // 出勤・退勤の確認ダイアログ（"in" | "out"）
  const [editing, setEditing] = useState(undefined); // undefined=閉, null=新規, rec=修正
  const [month, setMonth] = useState(isoDate().slice(0, 7));
  const hist = useAttendanceMonth(month);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const run = async fn => { setBusy(true); try { await fn(); } catch (e) { onMsg?.("⚠ " + (e.message || e)); } setBusy(false); };
  const today = isoDate();
  const todayRecs = att.records.filter(r => r.date === today).sort((a, b) => a.inAt.localeCompare(b.inAt));
  const mineMonth = hist.records.filter(r => r.worker === userName && isLive(r)).sort((a, b) => b.date.localeCompare(a.date) || b.inAt.localeCompare(a.inAt));
  const tot = mineMonth.reduce((a, r) => { const c = calc(r); a.w += c.work; a.o += c.ot; a.n += c.night; return a; }, { w: 0, o: 0, n: 0 });
  const days = new Set(mineMonth.map(r => r.date)).size;
  const done = m => { setEditing(undefined); onMsg?.(m); };
  const fail = e => onMsg?.("⚠ " + (e.message || e));

  const delRec = r => run(async () => { await saveRecord({ ...r, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); onMsg?.("ゴミ箱へ移動しました"); });

  return (
    <div style={{ padding: 16, maxWidth: 640, margin: "0 auto", fontFamily: "'Noto Sans JP',sans-serif", color: C.ink }}>
      {att.error && <div style={{ ...card, borderColor: C.ng, color: C.ng, fontSize: 12 }}>読み込みエラー: {att.error}<br />（Firestoreルールで attendance / attendance_devices の読み書きが許可されているか確認）</div>}

      <div style={card}>
        <div style={{ textAlign: "center", color: C.sub, fontSize: 12 }}>{clock.getFullYear()}年{clock.getMonth() + 1}月{clock.getDate()}日（{WD[clock.getDay()]}）</div>
        <div style={{ textAlign: "center", fontSize: 44, fontWeight: 800, letterSpacing: 2, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{hm(clock)}:{pad(clock.getSeconds())}</div>
        {att.open && <div style={{ textAlign: "center", marginTop: 4, fontSize: 13 }}><span style={{ color: C.ok, fontWeight: 700 }}>勤務中</span> {att.open.inAt}〜</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <button disabled={busy || !!att.open || att.status !== "ok"} onClick={() => setAsk("in")}
            style={{ ...btn, padding: "24px 8px", fontSize: 22, fontWeight: 800, background: "#14894f", color: "#fff", borderRadius: 14, opacity: busy || att.open || att.status !== "ok" ? 0.35 : 1 }}>
            出勤
          </button>
          <button disabled={busy || !att.open || att.status !== "ok"} onClick={() => setAsk("out")}
            style={{ ...btn, padding: "24px 8px", fontSize: 22, fontWeight: 800, background: "#d33a3a", color: "#fff", borderRadius: 14, opacity: busy || !att.open || att.status !== "ok" ? 0.35 : 1 }}>退勤</button>
        </div>
        <input value={memo} onChange={e => setMemo(e.target.value)} disabled={!!att.open} placeholder="メモ（任意）" style={{ ...inp, width: "100%", marginTop: 10 }} />
        <div style={{ color: C.sub, fontSize: 11, marginTop: 8 }}>1日1回、出勤と退勤を押すだけ。現場ごとに押す必要はないよ。</div>
      </div>

      {ask && (
        <Modal onClose={() => setAsk(null)}>
          <div style={{ textAlign: "center", padding: "6px 0 14px" }}>
            <div style={{ color: C.sub, fontSize: 12 }}>{clock.getMonth() + 1}月{clock.getDate()}日（{WD[clock.getDay()]}）</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{hm(clock)}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6, color: ask === "in" ? "#66bb6a" : "#ef5350" }}>{ask === "in" ? "出勤" : "退勤"}しますか？</div>
            {ask === "in" && memo && <div style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>メモ：{memo}</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => setAsk(null)} style={{ ...btn, padding: "14px 8px", fontSize: 15, background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>やめる</button>
            <button disabled={busy} onClick={() => { const k = ask; setAsk(null); run(async () => {
              if (k === "in") { const r = await att.punch("in", memo); setMemo(""); onMsg?.(`出勤 ${r.inAt}`); }
              else { const r = await att.punch("out"); onMsg?.(`退勤 ${r.outAt}`); }
            }); }} style={{ ...btn, padding: "14px 8px", fontSize: 15, fontWeight: 800, background: ask === "in" ? "#14894f" : "#d33a3a", color: "#fff" }}>{ask === "in" ? "出勤する" : "退勤する"}</button>
          </div>
        </Modal>
      )}

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>端末の登録</div>
        {att.status === "loading" && <div style={{ color: C.sub, fontSize: 12 }}>確認中…</div>}
        {att.status === "ok" && <div style={{ color: C.ok, fontSize: 12 }}>✓ この端末は {userName} の端末として登録済み（{att.devices.length}台登録中）</div>}
        {att.status === "full" && (
          <>
            <div style={{ color: C.ng, fontSize: 12, marginBottom: 8 }}>すでに別の端末が登録されています。この端末を使うには、管理者に追加を依頼してね（機種変更のときは、古い端末の解除を頼んでもOK）。</div>
            <button onClick={() => run(async () => { await att.requestAdd(); onMsg?.("管理者に追加を依頼しました"); })} style={{ ...btn, background: C.pri, color: "#080e14" }}>管理者にこの端末の追加を依頼</button>
          </>
        )}
        {att.status === "requested" && (
          <>
            <div style={{ color: C.warn || C.sub, fontSize: 12, marginBottom: 8 }}>⏳ 管理者の承認待ちです。承認されたら打刻できるようになります（承認後は下のボタンで確認）。</div>
            <button onClick={() => { att.refreshDevice(); onMsg?.("状態を確認しています"); }} style={{ ...btn, background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>承認されたか確認</button>
          </>
        )}
        {att.status === "error" && <div style={{ color: C.ng, fontSize: 12 }}>端末情報を読めませんでした: {att.devError}</div>}
        {att.status === "unbound" && (
          <>
            <div style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>打刻する前に、この端末を {userName} の端末として登録します（なりすまし防止。1台目は自分で登録できる。2台目以降は管理者の承認が必要）。</div>
            <button onClick={() => run(async () => { await att.bind(); onMsg?.("端末を登録しました"); })} style={{ ...btn, background: C.pri, color: "#080e14" }}>この端末を {userName} に登録</button>
          </>
        )}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>今日の記録</div>
        {todayRecs.length === 0 && <div style={{ color: C.sub, fontSize: 12 }}>まだ記録なし</div>}
        {todayRecs.map(r => (
          <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "5px 0" }}>
            <span style={{ flex: 1 }}>{r.inAt}〜{r.outAt || <span style={{ color: C.ok }}>勤務中</span>}{r.note ? <span style={{ color: C.sub }}>&emsp;{r.note}</span> : null}</span>
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
            <thead><tr><th style={th}>日</th><th style={th}>出退勤</th><th style={{ ...th, ...num }}>実働</th><th style={th}>メモ</th><th style={th}></th></tr></thead>
            <tbody>
              {mineMonth.map(r => (
                <tr key={r.id}>
                  <td style={td}>{dayLabel(r.date)}</td>
                  <td style={td}>{r.inAt}〜{r.outAt || "勤務中"}{r.manual && <span style={{ color: C.warn, fontSize: 10 }}> 手入力</span>}{r.inGeo && " 📍"}</td>
                  <td style={{ ...td, ...num }}>{r.outAt ? fmtHM(calc(r).work) : ""}</td>
                  <td style={{ ...td, color: C.sub }}>{r.note}</td>
                  <td style={td}>
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

      {editing !== undefined && <EditModal rec={editing} workers={[userName]} isAdmin={false} defaultWorker={userName} onClose={() => setEditing(undefined)} onDone={done} onError={fail} />}
    </div>
  );
}

// ─── 管理者の「出退勤」タブ ─────────────────────────
export function AttendanceAdminTab({ workers, onMsg }) {
  const [month, setMonth] = useState(isoDate().slice(0, 7));
  const [who, setWho] = useState("全員");
  const [editing, setEditing] = useState(undefined);
  const st = useAttendanceMonth(month);
  const [copy, setCopy] = useState(null);

  const all = st.records;
  const live = all.filter(isLive);
  const trash = all.filter(isInTrash);
  const sorted = live.filter(r => who === "全員" || r.worker === who).sort((a, b) => a.date.localeCompare(b.date) || a.inAt.localeCompare(b.inAt));
  const summary = workers.map(w => {
    const rs = live.filter(r => r.worker === w);
    const t = rs.reduce((a, r) => { const c = calc(r); a.work += c.work; a.ot += c.ot; a.night += c.night; return a; }, { work: 0, ot: 0, night: 0 });
    return { worker: w, days: new Set(rs.map(r => r.date)).size, ...t, open: rs.filter(r => !r.outAt).length };
  });
  const done = m => { setEditing(undefined); onMsg?.(m); };
  const fail = e => onMsg?.("⚠ " + (e.message || e));
  const del = async r => { try { await saveRecord({ ...r, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); onMsg?.("ゴミ箱へ移動しました"); } catch (e) { fail(e); } };
  const restore = async r => { try { await saveRecord({ ...r, deletedAt: null, updatedAt: new Date().toISOString() }); onMsg?.("戻しました"); } catch (e) { fail(e); } };

  const showText = (title, text) => {
    try { navigator.clipboard.writeText(text).then(() => onMsg?.(title + "をコピーしました"), () => setCopy({ title, text })); } catch { setCopy({ title, text }); }
  };
  const csv = () => {
    const l = ["日付,作業員,出勤,退勤,休憩分,実働h,残業h,深夜h,メモ"];
    sorted.forEach(r => { const c = calc(r); l.push([r.date, r.worker, r.inAt, r.outAt || "", r.breakMin || 0, fmtH(c.work), fmtH(c.ot), fmtH(c.night), (r.note || "").replace(/,/g, " ")].join(",")); });
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

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{month} 月間集計</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>名前</th><th style={{ ...th, ...num }}>日数</th><th style={{ ...th, ...num }}>実働</th><th style={{ ...th, ...num }}>残業</th><th style={{ ...th, ...num }}>深夜</th><th style={th}></th></tr></thead>
          <tbody>
            {summary.map(x => (
              <tr key={x.worker}>
                <td style={td}>{x.worker}</td><td style={{ ...td, ...num }}>{x.days}</td><td style={{ ...td, ...num }}>{fmtHM(x.work)}</td>
                <td style={{ ...td, ...num, color: C.warn }}>{fmtHM(x.ot)}</td><td style={{ ...td, ...num, color: C.night }}>{fmtHM(x.night)}</td>
                <td style={td}>{x.open > 0 && <span style={{ color: C.ok, fontSize: 11 }}>勤務中/退勤の打刻漏れ {x.open}</span>}</td>
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
          <thead><tr><th style={th}>日</th><th style={th}>名前</th><th style={th}>出退勤</th><th style={{ ...th, ...num }}>実働</th><th style={{ ...th, ...num }}>残業</th><th style={{ ...th, ...num }}>深夜</th><th style={th}>メモ</th><th style={th}></th></tr></thead>
          <tbody>
            {sorted.map(r => { const c = calc(r); return (
              <tr key={r.id}>
                <td style={td}>{dayLabel(r.date)}</td><td style={td}>{r.worker}</td>
                <td style={td}>{r.inAt}〜{r.outAt || "勤務中"}{r.manual && <span style={{ color: C.warn, fontSize: 10 }}> 手入力</span>}{r.inGeo && " 📍"}</td>
                <td style={{ ...td, ...num }}>{c.open ? "" : fmtHM(c.work)}</td>
                <td style={{ ...td, ...num, color: C.warn }}>{c.ot ? fmtHM(c.ot) : ""}</td>
                <td style={{ ...td, ...num, color: C.night }}>{c.night ? fmtHM(c.night) : ""}</td>
                <td style={{ ...td, color: C.sub }}>{r.note}</td>
                <td style={td}>
                  <button onClick={() => setEditing(r)} style={{ ...btn, padding: "4px 8px", background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>✏️</button>{" "}
                  <button onClick={() => del(r)} style={{ ...btn, padding: "4px 8px", background: "transparent", color: C.ng, border: `1px solid ${C.line}` }}>🗑</button>
                </td>
              </tr>
            ); })}
            {sorted.length === 0 && <tr><td colSpan={8} style={{ ...td, color: C.sub }}>記録なし</td></tr>}
          </tbody>
        </table>
      </div>

      {trash.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>ゴミ箱（{trash.length}件・30日を過ぎると表示されなくなる）</div>
          {trash.map(r => (
            <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
              <span style={{ flex: 1 }}>{dayLabel(r.date)} {r.worker} {r.inAt}〜{r.outAt || ""}</span>
              <button onClick={() => restore(r)} style={{ ...btn, padding: "4px 10px", background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>戻す</button>
            </div>
          ))}
        </div>
      )}

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

// 管理者タブ「端末管理」：管理者端末の登録、作業員ごとの端末（許可・承認・解除）
export function DeviceAdminTab({ workers, onMsg }) {
  const [devs, setDevs] = useState({});
  const [devTick, setDevTick] = useState(0);
  const [pend, setPend] = useState({});
  const [allow, setAllow] = useState({});
  const [adminDevs, setAdminDevs] = useState(undefined);
  const [adminAllow, setAdminAllow] = useState(null);
  const fail = e => onMsg?.("⚠ " + (e.message || e));

  useEffect(() => {
    let alive = true;
    getDoc(doc(firestore, "attendance_devices", ADMIN_DEV_DOC)).then(s => { if (!alive) return; setAdminDevs(devicesOf(s.exists() ? s.data() : null)); setAdminAllow(allowOf(s.exists() ? s.data() : null)); }).catch(() => alive && setAdminDevs(null));
    Promise.all(workers.map(w => getDoc(doc(firestore, "attendance_devices", w)).then(s => [w, devicesOf(s.exists() ? s.data() : null), pendingOf(s.exists() ? s.data() : null), allowOf(s.exists() ? s.data() : null)]).catch(() => [w, null, [], null])))
      .then(a => { if (!alive) return; setDevs(Object.fromEntries(a.map(x => [x[0], x[1]]))); setPend(Object.fromEntries(a.map(x => [x[0], x[2]]))); setAllow(Object.fromEntries(a.map(x => [x[0], x[3]]))); });
    return () => { alive = false; };
  }, [workers, devTick]);


  const approve = async (w, deviceId) => { try { await approveDevice(w, deviceId); setDevTick(x => x + 1); onMsg?.(`${w} の端末を承認しました`); } catch (e) { fail(e); setDevTick(x => x + 1); } };
  const allowNext = async w => { try { await allowNextDevice(w, 30); setDevTick(x => x + 1); onMsg?.(`${w} の次の1台を30分だけ許可しました`); } catch (e) { fail(e); } };
  const cancelAllowing = async w => { try { await cancelAllow(w); setDevTick(x => x + 1); onMsg?.(`${w} の許可を取り消しました`); } catch (e) { fail(e); } };
  const addAdminDev = async () => { try { await registerAdminDevice(); setDevTick(x => x + 1); onMsg?.("この端末を管理者端末に登録しました"); } catch (e) { fail(e); } };
  const allowAdminNext = async () => { try { await allowNextDevice(ADMIN_DEV_DOC, 30); setDevTick(x => x + 1); onMsg?.("管理者端末の次の1台を30分だけ許可しました"); } catch (e) { fail(e); } };
  const cancelAdminAllow = async () => { try { await cancelAllow(ADMIN_DEV_DOC); setDevTick(x => x + 1); onMsg?.("許可を取り消しました"); } catch (e) { fail(e); } };
  const delAdminDev = async id => { try { await unbindAdminDevice(id); setDevTick(x => x + 1); onMsg?.("管理者端末を1台解除しました"); } catch (e) { fail(e); } };
  const reject = async (w, deviceId) => { try { await rejectDevice(w, deviceId); setDevTick(x => x + 1); onMsg?.(`${w} の依頼を却下しました`); } catch (e) { fail(e); } };
  const unbind = async (w, deviceId) => { try { await unbindDevice(w, deviceId); setDevTick(x => x + 1); onMsg?.(`${w} の端末を1台解除しました`); } catch (e) { fail(e); } };

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto", color: C.ink }}>
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>端末の登録状況</div>
        <div style={{ padding: "6px 0 10px", marginBottom: 6, borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 90, fontWeight: 700 }}>管理者端末</span>
            <span style={{ color: adminDevs && adminDevs.length ? C.ok : C.sub, flex: 1 }}>{adminDevs === null ? "確認できません" : adminDevs === undefined ? "確認中…" : adminDevs.length ? `${adminDevs.length}台（どの作業員にもログインできる）` : "未登録"}</span>
            {adminDevs && !adminDevs.some(d => d.deviceId === myDeviceId()) && <button onClick={addAdminDev} style={{ ...btn, padding: "3px 10px", background: C.pri, color: "#080e14" }}>この端末を登録</button>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0 4px 98px", fontSize: 12 }}>
            {adminAllow
              ? <><span style={{ flex: 1, color: C.warn }}>🔓 許可中（{new Date(adminAllow).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}まで・新しい端末で管理者ログインすると、その1台が管理者端末になる）</span>
                <button onClick={cancelAdminAllow} style={{ ...btn, padding: "3px 10px", background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>取消</button></>
              : <button onClick={allowAdminNext} style={{ ...btn, padding: "3px 10px", background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>＋ 次の1台を許可（30分）</button>}
          </div>
          {(adminDevs || []).map(d => (
            <div key={d.deviceId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0 3px 98px", fontSize: 12 }}>
              <span style={{ flex: 1, color: C.sub }}>{d.label || "端末"}{d.boundAt ? `\u3000${dayLabel(d.boundAt.slice(0, 10))}に登録` : ""}{d.deviceId === myDeviceId() ? "\u3000（この端末）" : ""}&emsp;<span style={{ fontSize: 10 }}>…{d.deviceId.slice(-5)}</span></span>
              <button onClick={() => delAdminDev(d.deviceId)} style={{ ...btn, padding: "3px 10px", background: "transparent", color: C.ng, border: `1px solid ${C.line}` }}>解除</button>
            </div>
          ))}
        </div>
        {workers.map(w => (
          <div key={w} style={{ padding: "5px 0", fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 90 }}>{w}</span>
              <span style={{ color: devs[w] && devs[w].length ? C.ok : C.sub }}>{devs[w] === null ? "確認できません" : devs[w] === undefined ? "確認中…" : devs[w].length ? `${devs[w].length}台 登録済み` : `未登録`}</span>
            </div>
            {(devs[w] || []).map(d => (
              <div key={d.deviceId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0 3px 98px", fontSize: 12 }}>
                <span style={{ flex: 1, color: C.sub }}>{d.label || "端末"}{d.boundAt ? `\u3000${dayLabel(d.boundAt.slice(0, 10))}に登録` : ""}&emsp;<span style={{ fontSize: 10 }}>…{d.deviceId.slice(-5)}</span></span>
                <button onClick={() => unbind(w, d.deviceId)} style={{ ...btn, padding: "3px 10px", background: "transparent", color: C.ng, border: `1px solid ${C.line}` }}>解除</button>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0 3px 98px", fontSize: 12 }}>
              {allow[w]
                ? <><span style={{ flex: 1, color: C.warn }}>🔓 許可中（{new Date(allow[w]).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}まで・次にログインした1台が登録される）</span>
                  <button onClick={() => cancelAllowing(w)} style={{ ...btn, padding: "3px 10px", background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>取消</button></>
                : <button onClick={() => allowNext(w)} style={{ ...btn, padding: "3px 10px", background: "transparent", color: C.pri, border: `1px solid ${C.line}` }}>＋ 次の1台を許可（30分）</button>}
            </div>
            {(pend[w] || []).map(d => (
              <div key={d.deviceId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0 3px 98px", fontSize: 12 }}>
                <span style={{ flex: 1, color: C.ng }}>🙋 追加依頼：{d.label || "端末"}{d.requestedAt ? `\u3000${dayLabel(d.requestedAt.slice(0, 10))}` : ""}&emsp;<span style={{ fontSize: 10 }}>…{d.deviceId.slice(-5)}</span></span>
                <button onClick={() => approve(w, d.deviceId)} style={{ ...btn, padding: "3px 10px", background: C.ok, color: "#080e14" }}>承認</button>
                <button onClick={() => reject(w, d.deviceId)} style={{ ...btn, padding: "3px 10px", background: "transparent", color: C.sub, border: `1px solid ${C.line}` }}>却下</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
