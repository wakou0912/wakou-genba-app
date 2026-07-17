import { useState, useEffect } from "react";
import { firestore } from "./firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

// ← ここにClaudeのAPIキーを入れる（またはViteの場合 import.meta.env.VITE_CLAUDE_API_KEY）
const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY || "";

const CATEGORIES = ["ガソリン代", "三和駐車場", "その他駐車場", "工具代", "倉庫代", "その他"];

function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function prevYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function nextYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
function ymLabel(ym) {
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m)}月`;
}
function newItem() {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    category: CATEGORIES[0],
    amount: "",
    note: "",
    aiText: "",
  };
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- スタイル定数 ---
const S = {
  bg: "#080e14",
  bg2: "#0a1018",
  bg3: "#0d1520",
  border: "#1a2634",
  text: "#cfd8dc",
  muted: "#546e7a",
  sub: "#78909c",
  accent: "#4fc3f7",
  green: "#a5d6a7",
  yellow: "#ffcc80",
  red: "#ef5350",
};
const navBtn = {
  padding: "5px 10px",
  background: "transparent",
  border: `1px solid ${S.border}`,
  borderRadius: 5,
  color: S.muted,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
const inp = {
  background: S.bg3,
  border: `1px solid ${S.border}`,
  borderRadius: 5,
  padding: "5px 8px",
  fontSize: 12,
  color: S.text,
  outline: "none",
  fontFamily: "inherit",
};
const sel = { ...inp, cursor: "pointer" };
const actionBtn = {
  padding: "8px 14px",
  borderRadius: 7,
  border: "none",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

// --- AI読み取り ---
async function callClaudeVision(file) {
  if (!CLAUDE_API_KEY) {
    throw new Error("APIキーが設定されていません。.envにVITE_CLAUDE_API_KEYを設定してください。");
  }
  const b64 = await fileToBase64(file);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type, data: b64 } },
            {
              type: "text",
              text: "このレシートから合計金額と内容を読み取ってください。必ず以下の形式で答えてください。\n金額：数字のみ（例: 3500）\n内容：一言で（例: ガソリン給油）",
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API Error ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// =====================
// WorkerKeihi
// =====================
function WorkerKeihi({ userName }) {
  const [ym, setYm] = useState(currentYM());
  const [items, setItems] = useState([newItem()]);
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(null);

  const docRef = doc(firestore, "keihi", ym, "entries", userName);

  useEffect(() => {
    loadData();
  }, [ym, userName]);

  async function loadData() {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const d = snap.data();
      setItems(d.items?.length ? d.items : [newItem()]);
      setStatus(d.status || "draft");
    } else {
      setItems([newItem()]);
      setStatus("draft");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await setDoc(docRef, {
        items,
        status: "draft",
        updatedAt: new Date().toISOString(),
        userName,
      });
      alert("一時保存しました");
    } catch (e) {
      alert("保存エラー: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    const validItems = items.filter(i => i.amount);
    if (validItems.length === 0) {
      alert("金額を入力してから提出してください");
      return;
    }
    if (!confirm("提出します。提出後は管理者が差し戻すまで編集できません。よろしいですか？")) return;
    setSubmitting(true);
    try {
      await setDoc(docRef, {
        items,
        status: "submitted",
        updatedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        userName,
      });
      setStatus("submitted");
      alert("提出しました！");
    } catch (e) {
      alert("提出エラー: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function addItem() {
    setItems(prev => [...prev, newItem()]);
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id, key, value) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, [key]: value } : i)));
  }

  async function readReceipt(itemId, file) {
    setAiLoading(itemId);
    try {
      const text = await callClaudeVision(file);
      const amountMatch = text.match(/金額[：:]\s*(\d[\d,]*)/);
      const noteMatch = text.match(/内容[：:]\s*(.+)/);
      const amount = amountMatch ? amountMatch[1].replace(/,/g, "") : "";
      const note = noteMatch ? noteMatch[1].trim() : "";
      updateItem(itemId, "aiText", text);
      if (amount) updateItem(itemId, "amount", amount);
      if (note) updateItem(itemId, "note", note);
    } catch (e) {
      alert("AI読み取りエラー: " + e.message);
    } finally {
      setAiLoading(null);
    }
  }

  const isSubmitted = status === "submitted";
  const total = items.reduce((s, i) => s + (parseInt(i.amount) || 0), 0);
  const catTotals = {};
  CATEGORIES.forEach(c => (catTotals[c] = 0));
  items.forEach(i => {
    catTotals[i.category] = (catTotals[i.category] || 0) + (parseInt(i.amount) || 0);
  });

  return (
    <div style={{ background: S.bg, minHeight: "calc(100vh - 80px)", padding: 16 }}>
      {/* 月選択 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYm(prevYM(ym))} style={navBtn}>◀</button>
        <span style={{ color: S.accent, fontWeight: 700, fontSize: 15, minWidth: 90, textAlign: "center" }}>
          {ymLabel(ym)}
        </span>
        <button onClick={() => setYm(nextYM(ym))} style={navBtn}>▶</button>
        <span style={{ flex: 1 }} />
        {isSubmitted ? (
          <span style={{ background: "#1a3a1a", color: S.green, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>提出済み</span>
        ) : (
          <span style={{ background: S.bg2, color: S.muted, borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>下書き</span>
        )}
      </div>

      {/* 合計サマリー */}
      <div style={{ background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
        <div style={{ color: S.accent, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
          合計: ¥{total.toLocaleString()}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {CATEGORIES.filter(c => catTotals[c] > 0).map(c => (
            <div key={c} style={{ fontSize: 11, color: S.sub }}>
              {c}:{" "}
              <span style={{ color: S.text, fontWeight: 600 }}>¥{catTotals[c].toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 経費行 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {items.map(item => (
          <div key={item.id} style={{ background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="date"
                value={item.date}
                onChange={e => updateItem(item.id, "date", e.target.value)}
                disabled={isSubmitted}
                style={inp}
              />
              <select
                value={item.category}
                onChange={e => updateItem(item.id, "category", e.target.value)}
                disabled={isSubmitted}
                style={sel}
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="number"
                  value={item.amount}
                  onChange={e => updateItem(item.id, "amount", e.target.value)}
                  disabled={isSubmitted}
                  placeholder="金額"
                  style={{ ...inp, width: 85 }}
                />
                <span style={{ color: S.muted, fontSize: 12 }}>円</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={item.note}
                onChange={e => updateItem(item.id, "note", e.target.value)}
                disabled={isSubmitted}
                placeholder="メモ（任意）"
                style={{ ...inp, flex: 1, minWidth: 120 }}
              />
              {!isSubmitted && (
                <>
                  <label style={{ cursor: "pointer", padding: "4px 9px", background: "#0d1a2a", border: `1px solid ${S.border}`, borderRadius: 5, color: S.sub, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {aiLoading === item.id ? "読み取り中…" : "📷 AI読み取り"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: "none" }}
                      onChange={e => e.target.files[0] && readReceipt(item.id, e.target.files[0])}
                    />
                  </label>
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{ padding: "4px 9px", background: "#3a0a0a", border: "1px solid #6a1a1a", borderRadius: 5, color: S.red, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    削除
                  </button>
                </>
              )}
            </div>

            {item.aiText && (
              <div style={{ marginTop: 6, padding: "4px 8px", background: S.bg3, borderRadius: 4, fontSize: 10, color: S.muted }}>
                AI: {item.aiText}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ボタン */}
      {!isSubmitted && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={addItem}
            style={{ ...actionBtn, background: S.bg2, border: `1px solid ${S.border}`, color: S.sub }}
          >
            ＋ 追加
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ ...actionBtn, background: "#1a2a1a", border: "1px solid #2a4a2a", color: S.green }}
          >
            {saving ? "保存中…" : "一時保存"}
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            style={{ ...actionBtn, background: "#0d1a2a", border: `1px solid ${S.accent}`, color: S.accent, fontWeight: 700 }}
          >
            {submitting ? "提出中…" : "提出する"}
          </button>
        </div>
      )}
    </div>
  );
}

// =====================
// AdminKeihi
// =====================
function AdminKeihi() {
  const [ym, setYm] = useState(currentYM());
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(false);
  const [adminTab, setAdminTab] = useState("list");

  useEffect(() => {
    loadAll();
  }, [ym]);

  async function loadAll() {
    setLoading(true);
    try {
      const colRef = collection(firestore, "keihi", ym, "entries");
      const snap = await getDocs(colRef);
      const result = {};
      snap.forEach(d => (result[d.id] = d.data()));
      setEntries(result);
    } finally {
      setLoading(false);
    }
  }

  async function unlockEntry(userName) {
    if (!confirm(`${userName}の提出を差し戻しますか？`)) return;
    const docRef = doc(firestore, "keihi", ym, "entries", userName);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    await setDoc(docRef, { ...snap.data(), status: "draft" });
    await loadAll();
    alert(`${userName}の提出を差し戻しました`);
  }

  // 集計
  const catTotals = {};
  CATEGORIES.forEach(c => (catTotals[c] = 0));
  let grandTotal = 0;
  Object.values(entries).forEach(e => {
    (e.items || []).forEach(i => {
      const amt = parseInt(i.amount) || 0;
      catTotals[i.category] = (catTotals[i.category] || 0) + amt;
      grandTotal += amt;
    });
  });

  return (
    <div style={{ background: S.bg, minHeight: "calc(100vh - 80px)", padding: 16 }}>
      {/* 月選択 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYm(prevYM(ym))} style={navBtn}>◀</button>
        <span style={{ color: S.accent, fontWeight: 700, fontSize: 15, minWidth: 90, textAlign: "center" }}>
          {ymLabel(ym)}
        </span>
        <button onClick={() => setYm(nextYM(ym))} style={navBtn}>▶</button>
        <button onClick={loadAll} style={{ ...navBtn, marginLeft: "auto", fontSize: 11 }}>更新</button>
      </div>

      {/* サブタブ */}
      <div style={{ display: "flex", borderBottom: `1px solid ${S.border}`, marginBottom: 14 }}>
        {[["list", "📋 提出一覧"], ["stats", "📊 統計"]].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setAdminTab(k)}
            style={{
              padding: "8px 16px",
              border: "none",
              background: "transparent",
              color: adminTab === k ? S.accent : "#37474f",
              fontWeight: adminTab === k ? 700 : 400,
              fontSize: 12,
              cursor: "pointer",
              borderBottom: adminTab === k ? `2px solid ${S.accent}` : "2px solid transparent",
              fontFamily: "inherit",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: S.muted, textAlign: "center", padding: 40 }}>読み込み中…</div>}

      {/* 提出一覧 */}
      {!loading && adminTab === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.keys(entries).length === 0 && (
            <div style={{ color: S.border, textAlign: "center", padding: 40, fontSize: 13 }}>提出データなし</div>
          )}
          {Object.entries(entries).map(([name, data]) => {
            const total = (data.items || []).reduce((s, i) => s + (parseInt(i.amount) || 0), 0);
            return (
              <div key={name} style={{ background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <span style={{ color: S.text, fontWeight: 700, fontSize: 14 }}>{name}</span>
                    <span style={{ marginLeft: 10, color: S.accent, fontWeight: 700 }}>¥{total.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {data.status === "submitted" ? (
                      <span style={{ background: "#1a3a1a", color: S.green, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>提出済み</span>
                    ) : (
                      <span style={{ background: S.bg2, color: S.muted, borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>下書き</span>
                    )}
                    {data.status === "submitted" && (
                      <button
                        onClick={() => unlockEntry(name)}
                        style={{ padding: "3px 8px", background: "#3a2a0a", border: "1px solid #6a4a1a", borderRadius: 5, color: S.yellow, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        差し戻し
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {(data.items || []).map(item => (
                    <div key={item.id} style={{ display: "flex", gap: 8, fontSize: 11, color: S.sub }}>
                      <span style={{ minWidth: 75 }}>{item.date}</span>
                      <span style={{ minWidth: 90, color: "#90a4ae" }}>{item.category}</span>
                      <span style={{ minWidth: 70, color: S.text, fontWeight: 600 }}>
                        ¥{(parseInt(item.amount) || 0).toLocaleString()}
                      </span>
                      {item.note && <span style={{ color: S.muted }}>{item.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 統計 */}
      {!loading && adminTab === "stats" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* カテゴリ別合計 */}
          <div style={{ background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ color: S.accent, fontWeight: 700, fontSize: 17, marginBottom: 10 }}>
              合計: ¥{grandTotal.toLocaleString()}
            </div>
            {CATEGORIES.filter(c => catTotals[c] > 0).map(c => {
              const pct = grandTotal > 0 ? Math.round((catTotals[c] / grandTotal) * 100) : 0;
              return (
                <div key={c} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ color: S.sub, fontSize: 12 }}>{c}</span>
                    <span style={{ color: S.text, fontWeight: 600, fontSize: 12 }}>
                      ¥{catTotals[c].toLocaleString()} ({pct}%)
                    </span>
                  </div>
                  <div style={{ background: S.bg3, borderRadius: 3, height: 5 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: S.accent, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* スタッフ×カテゴリ集計表 */}
          {Object.keys(entries).length > 0 && (
            <div style={{ background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 8, padding: "12px 16px", overflowX: "auto" }}>
              <div style={{ color: S.muted, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>スタッフ別集計</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", color: S.muted, padding: "4px 8px", borderBottom: `1px solid ${S.border}` }}>名前</th>
                    {CATEGORIES.map(c => (
                      <th key={c} style={{ textAlign: "right", color: S.muted, padding: "4px 8px", borderBottom: `1px solid ${S.border}`, whiteSpace: "nowrap" }}>{c}</th>
                    ))}
                    <th style={{ textAlign: "right", color: S.accent, padding: "4px 8px", borderBottom: `1px solid ${S.border}` }}>合計</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(entries).map(([name, data]) => {
                    const uc = {};
                    CATEGORIES.forEach(c => (uc[c] = 0));
                    let ut = 0;
                    (data.items || []).forEach(i => {
                      const amt = parseInt(i.amount) || 0;
                      uc[i.category] = (uc[i.category] || 0) + amt;
                      ut += amt;
                    });
                    return (
                      <tr key={name}>
                        <td style={{ color: S.text, padding: "4px 8px", borderBottom: `1px solid ${S.bg3}` }}>{name}</td>
                        {CATEGORIES.map(c => (
                          <td key={c} style={{ textAlign: "right", color: S.sub, padding: "4px 8px", borderBottom: `1px solid ${S.bg3}` }}>
                            {uc[c] > 0 ? `¥${uc[c].toLocaleString()}` : "-"}
                          </td>
                        ))}
                        <td style={{ textAlign: "right", color: S.accent, fontWeight: 700, padding: "4px 8px", borderBottom: `1px solid ${S.bg3}` }}>
                          ¥{ut.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =====================
// メインエクスポート
// =====================
export default function KeihiSeisan({ userName, isAdmin }) {
  if (isAdmin) return <AdminKeihi />;
  return <WorkerKeihi userName={userName} />;
}
