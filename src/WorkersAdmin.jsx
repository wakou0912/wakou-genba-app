import { useState } from "react";
import { useWorkerList, saveWorkerList, checkName, OTHER } from "./workersData";

const C = { bg: "#0d1520", line: "#1a2634", sub: "#546e7a", ink: "#cfd8dc", pri: "#4fc3f7", ok: "#66bb6a", ng: "#ef5350" };
const btn = { padding: "6px 12px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const card = { background: C.bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 14 };

// 管理者タブ「作業員」：追加・並び順・非表示（退職など）。過去の日報や出退勤のデータは消さない
export default function WorkersAdmin({ onMsg }) {
  const { loading, list, saved, error } = useWorkerList();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const commit = async (next, msg) => {
    setBusy(true);
    try { await saveWorkerList(next); onMsg?.(msg); } catch (e) { onMsg?.("⚠ " + (e.message || e)); }
    setBusy(false);
  };
  const add = async () => {
    const e = checkName(name, list);
    if (e) { setErr(e); return; }
    setErr("");
    await commit([...list, { name: name.trim(), hidden: false, addedAt: new Date().toISOString() }], `${name.trim()} を追加しました`);
    setName("");
  };
  const toggle = i => commit(list.map((w, k) => k === i ? { ...w, hidden: !w.hidden } : w), list[i].hidden ? `${list[i].name} を戻しました` : `${list[i].name} を非表示にしました`);
  const move = (i, d) => {
    const j = i + d; if (j < 0 || j >= list.length) return;
    const n = [...list]; [n[i], n[j]] = [n[j], n[i]];
    commit(n, "並び順を変えました");
  };
  const shown = list.filter(w => !w.hidden).length;

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "0 auto", color: C.ink }}>
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>作業員を追加</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={e => { setName(e.target.value); setErr(""); }} onKeyDown={e => { if (e.key === "Enter" && !busy) add(); }} placeholder="名前（例：山田太郎）"
            style={{ flex: 1, background: "#0a1018", border: `1px solid ${C.line}`, borderRadius: 7, padding: "9px 10px", fontSize: 14, color: C.ink, outline: "none", fontFamily: "inherit" }} />
          <button disabled={busy || loading} onClick={add} style={{ ...btn, background: C.pri, color: "#080e14", opacity: busy || loading ? 0.5 : 1 }}>追加</button>
        </div>
        {err && <div style={{ color: C.ng, fontSize: 12, marginTop: 6 }}>{err}</div>}
        <div style={{ color: C.sub, fontSize: 11, marginTop: 8, lineHeight: 1.7 }}>
          追加した人は、ログイン画面・日報・出退勤・集計などにすぐ出る。最初にログインした端末が、その人の1台目として登録される。
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>作業員の一覧（{shown}人）</div>
        {loading && <div style={{ color: C.sub, fontSize: 12 }}>読み込み中…</div>}
        {error && <div style={{ color: C.ng, fontSize: 12 }}>読み込めませんでした：{error}</div>}
        {!loading && !saved && <div style={{ color: C.sub, fontSize: 11, marginBottom: 8 }}>※ まだ保存されていません。いまの4人が初期値です（追加や変更をした時点で保存されます）。</div>}
        {list.map((w, i) => (
          <div key={w.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${C.line}`, opacity: w.hidden ? 0.5 : 1 }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, textDecoration: w.hidden ? "line-through" : "none" }}>{w.name}{w.hidden && <span style={{ fontSize: 11, color: C.sub, fontWeight: 400 }}>&emsp;非表示中</span>}</span>
            <button disabled={busy || i === 0} onClick={() => move(i, -1)} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}`, padding: "4px 9px" }}>↑</button>
            <button disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} style={{ ...btn, background: "transparent", color: C.sub, border: `1px solid ${C.line}`, padding: "4px 9px" }}>↓</button>
            <button disabled={busy || (!w.hidden && shown <= 1)} onClick={() => toggle(i)} style={{ ...btn, background: "transparent", color: w.hidden ? C.ok : C.ng, border: `1px solid ${C.line}` }}>{w.hidden ? "戻す" : "非表示"}</button>
          </div>
        ))}
        <div style={{ padding: "7px 0", fontSize: 13, color: C.sub }}>{OTHER}（固定・いつも一番最後）</div>
        <div style={{ color: C.sub, fontSize: 11, marginTop: 8, lineHeight: 1.7 }}>
          退職した人は「非表示」にする。ログイン画面などから消えるだけで、過去の日報・出退勤・給与のデータは残る。「戻す」でいつでも元に戻せる。
        </div>
      </div>
    </div>
  );
}
