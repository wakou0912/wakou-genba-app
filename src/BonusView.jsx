import { useState, useEffect, useMemo, useRef } from "react";
import { loadBonuses, saveBonus, deleteBonus, loadBonusSettings, saveBonusSettings } from "./payrollCalc/firestoreData";
import {
  calcBonusAuto, buildBonusDoc, finalDeductions, employeeUnits, fiscalYearOf, migrateBonusSettings, calcEmployerCost,
  BONUS_DED, BONUS_NAMES,
} from "./payrollCalc/bonus";

/* ===================== スコープ済みCSS（賞与明細プロトのデザインを移植） =====================
 * 鉄板の灰青＋鉄紺。帳票（伝票）の見た目を画面に持ってきた実務ツール。数字を読みやすく。 */
const BN_CSS = `
  .bn-root{
    --bg:#edf0f3; --surface:#ffffff; --surface-2:#e3e8ed; --line:#c9d1da;
    --fg:#18222e; --fg-2:#566372; --accent:#1f4e79; --accent-ink:#ffffff; --accent-soft:#d9e5f1;
    --ok:#1d7a4a; --ok-soft:#ddf1e6; --warn:#7a4e00; --warn-soft:#ffefcc; --danger:#ae2a22; --danger-soft:#fbe3e0;
    --radius:6px;
    background:var(--bg); color:var(--fg); border-radius:10px; padding:16px;
    font-family:"BIZ UDPGothic","Hiragino Sans","Yu Gothic",Meiryo,sans-serif; font-size:15px; line-height:1.6;
  }
  .bn-root *{ box-sizing:border-box; }
  .bn-root button,.bn-root input,.bn-root select,.bn-root textarea{ font:inherit; color:inherit; }
  .bn-root h2{ font-size:17px; margin:0 0 10px; letter-spacing:.03em; }
  .bn-root h3{ font-size:14px; margin:0 0 8px; color:var(--fg-2); letter-spacing:.06em; }
  .bn-root p{ margin:0 0 10px; }
  .bn-tabs{ display:grid; grid-template-columns:repeat(2,1fr); margin:0 0 16px; border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; background:var(--surface); }
  .bn-tabs button{ border:0; background:transparent; padding:10px 4px; cursor:pointer; min-width:0; border-right:1px solid var(--line); font-weight:700; }
  .bn-tabs button:last-child{ border-right:0; }
  .bn-tabs button[aria-selected="true"]{ background:var(--accent); color:var(--accent-ink); }
  .bn-root button:focus-visible,.bn-root input:focus-visible,.bn-root select:focus-visible,.bn-root textarea:focus-visible{ outline:3px solid var(--accent); outline-offset:2px; }
  .bn-card{ background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; margin-bottom:14px; }
  .bn-row{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
  .bn-row.between{ justify-content:space-between; }
  .bn-muted{ color:var(--fg-2); font-size:13px; }
  .bn-btn{ border:1px solid var(--accent); background:var(--accent); color:var(--accent-ink); padding:9px 16px; border-radius:var(--radius); cursor:pointer; font-weight:700; }
  .bn-btn.ghost{ background:transparent; color:var(--accent); }
  .bn-btn.danger{ border-color:var(--danger); color:var(--danger); background:transparent; }
  .bn-btn.danger.on{ background:var(--danger); color:var(--surface); }
  .bn-btn.small{ padding:5px 10px; font-size:13px; }
  .bn-btn:disabled{ opacity:.5; cursor:not-allowed; }
  .bn-link{ border:0; background:none; color:var(--accent); text-decoration:underline; cursor:pointer; padding:0; font-size:13px; }
  .bn-field{ display:grid; gap:4px; margin-bottom:12px; min-width:0; }
  .bn-field > label{ font-size:13px; color:var(--fg-2); }
  .bn-root input[type=text],.bn-root input[type=number],.bn-root input[type=date],.bn-root input[type=month],.bn-root select,.bn-root textarea{
    width:100%; min-width:0; padding:9px 10px; background:var(--bg); border:1px solid var(--line); border-radius:var(--radius);
  }
  .bn-root textarea{ min-height:72px; resize:vertical; }
  .bn-grid2{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 12px; }
  @media (max-width:520px){ .bn-grid2{ grid-template-columns:minmax(0,1fr); } }
  .bn-tag{ display:inline-block; font-size:11px; padding:1px 7px; border-radius:3px; background:var(--surface-2); color:var(--fg-2); white-space:nowrap; }
  .bn-tag.warn{ background:var(--warn-soft); color:var(--warn); }
  .bn-tag.manual{ background:var(--accent-soft); color:var(--accent); }
  .bn-fy{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
  .bn-fy strong{ font-size:18px; letter-spacing:.04em; }
  .bn-stats{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); margin-bottom:14px; }
  .bn-stats > div{ padding:10px 12px; border-right:1px solid var(--line); min-width:0; }
  .bn-stats > div:last-child{ border-right:0; }
  .bn-stats > div.company{ background:var(--accent-soft); }
  .bn-stats > div.company .v{ color:var(--accent); }
  @media (max-width:520px){
    .bn-stats{ grid-template-columns:repeat(2,minmax(0,1fr)); }
    .bn-stats > div:nth-child(2){ border-right:0; }
    .bn-stats > div:nth-child(-n+2){ border-bottom:1px solid var(--line); }
  }
  .bn-bonus .company{ margin-top:6px; font-size:12px; color:var(--fg-2); }
  .bn-bonus .company b{ color:var(--accent); font-variant-numeric:tabular-nums; }
  .bn-stats .k{ font-size:12px; color:var(--fg-2); }
  .bn-stats .v{ font-size:18px; font-weight:700; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .bn-tablewrap{ overflow-x:auto; }
  .bn-root table{ width:100%; border-collapse:collapse; font-size:14px; }
  .bn-root th,.bn-root td{ padding:7px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
  .bn-root th{ font-size:12px; color:var(--fg-2); font-weight:400; white-space:nowrap; }
  .bn-root td.num,.bn-root th.num{ text-align:right; font-variant-numeric:tabular-nums; }
  .bn-bonus{ display:block; width:100%; text-align:left; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:12px 14px; margin-bottom:10px; cursor:pointer; }
  .bn-bonus:hover{ border-color:var(--accent); }
  .bn-bonus .top{ display:flex; justify-content:space-between; gap:10px; align-items:baseline; flex-wrap:wrap; }
  .bn-bonus .who{ font-weight:700; }
  .bn-bonus .figs{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-top:8px; }
  .bn-bonus .figs span{ display:block; font-size:12px; color:var(--fg-2); }
  .bn-bonus .figs b{ font-variant-numeric:tabular-nums; font-size:15px; }
  .bn-empty{ text-align:center; padding:28px 12px; color:var(--fg-2); border:1px dashed var(--line); border-radius:var(--radius); background:var(--surface); margin-bottom:14px; }
  .bn-ded{ display:grid; grid-template-columns:minmax(0,1fr) 150px; gap:2px 12px; padding:10px 0; border-bottom:1px solid var(--line); align-items:center; }
  .bn-ded:last-child{ border-bottom:0; }
  .bn-ded label{ font-weight:700; }
  .bn-ded .in{ display:flex; align-items:center; gap:6px; }
  .bn-ded input{ text-align:right; font-variant-numeric:tabular-nums; }
  .bn-ded .meta{ grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:4px 10px; align-items:center; font-size:12px; color:var(--fg-2); }
  .bn-notice{ padding:9px 12px; border-radius:var(--radius); font-size:13px; margin-bottom:10px; }
  .bn-notice.warn{ background:var(--warn-soft); color:var(--warn); }
  .bn-notice.info{ background:var(--accent-soft); color:var(--accent); }
  .bn-result{ position:sticky; bottom:0; background:var(--surface); border:1px solid var(--accent); border-radius:var(--radius); padding:10px 14px; margin-bottom:14px;
    display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; box-shadow:0 -4px 12px rgba(0,0,0,.08); z-index:2; }
  .bn-result .k{ font-size:12px; color:var(--fg-2); }
  .bn-result .v{ font-size:17px; font-weight:700; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .bn-result .net .v{ color:var(--accent); font-size:20px; }
  .bn-actions{ display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
  .bn-unit{ color:var(--fg-2); font-size:13px; }
  .bn-slip{ background:#fff; color:#111; border:1px solid var(--line); padding:22px 20px 26px; margin-bottom:8px; max-width:560px; margin-inline:auto; box-shadow:0 2px 10px rgba(0,0,0,.12); }
  .bn-slip h2{ font-family:"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif; text-align:center; font-size:22px; letter-spacing:.35em; margin:0 0 14px; color:#111; }
  .bn-slip .co{ display:flex; align-items:center; gap:10px; margin-bottom:12px; }
  .bn-slip .logo{ height:46px; width:auto; flex:none; display:block; }
  .bn-slip .co b{ font-size:16px; letter-spacing:.08em; }
  .bn-slip .co .ym{ margin-left:auto; font-size:14px; white-space:nowrap; }
  .bn-slip .name{ font-size:18px; font-weight:700; border-bottom:1px solid #111; padding-bottom:3px; margin:8px 0; }
  .bn-slip .info{ display:flex; flex-wrap:wrap; gap:2px 18px; font-size:13px; margin-bottom:12px; }
  .bn-slip .cols{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  @media (max-width:520px){ .bn-slip .cols{ grid-template-columns:minmax(0,1fr); } }
  .bn-slip table{ font-size:13px; }
  .bn-slip th{ color:#111; background:#e8e8e8; font-weight:700; border:1px solid #111; padding:4px 6px; }
  .bn-slip td{ color:#111; border:1px solid #111; padding:4px 6px; }
  .bn-slip .sum td{ font-weight:700; background:#f1f1f1; }
  .bn-slip .net{ margin-top:14px; border:2px solid #111; padding:8px 12px; display:flex; justify-content:space-between; align-items:baseline; font-weight:700; }
  .bn-slip .net b{ font-size:22px; font-variant-numeric:tabular-nums; }
  .bn-slip .memo{ margin-top:14px; font-size:12px; }
  .bn-slip .memo .ln{ border-bottom:1px solid #111; min-height:24px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .bn-rate-table input{ padding:6px 6px; text-align:right; font-variant-numeric:tabular-nums; min-width:78px; }
  .bn-rate-table input[type=month]{ text-align:left; min-width:130px; }
  .bn-toast{ position:fixed; left:50%; transform:translateX(-50%); bottom:calc(18px + env(safe-area-inset-bottom,0px)); max-width:calc(100% - 32px);
    background:var(--fg); color:var(--bg); padding:10px 16px; border-radius:var(--radius); font-size:14px; z-index:1100; }
`;

/* ---------- 小道具 ---------- */
const yen = (n) => (Math.round(Number(n)) || 0).toLocaleString("ja-JP");
const pad2 = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
const nowIso = () => new Date().toISOString();
const toHalf = (s) => String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,，\s]/g, "");
const parseInt0 = (s) => { const t = toHalf(s).replace(/[^\d]/g, ""); return t === "" ? 0 : Math.floor(Number(t)); };
const parseDec = (s) => { const t = toHalf(s).replace(/[^\d.]/g, ""); const n = Number(t); return t === "" || !isFinite(n) ? 0 : n; };
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const ymLabel = (ym) => ym.slice(0, 4) + "年" + Number(ym.slice(5, 7)) + "月";
const dateLabel = (d) => (validDate(d) ? Number(d.slice(0, 4)) + "年" + Number(d.slice(5, 7)) + "月" + Number(d.slice(8, 10)) + "日" : "日付なし");
const pct = (n) => String(Math.round(n * 1000) / 1000) + "%";
const TRASH_DAYS = 30;
const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);
const unitsText = (r) => [r.health, r.care, r.support, r.pension].map((v) => pct(employeeUnits(v) / 1000)).join(" / ");

/** 金額入力。フォーカス中は生の数字、外れたら3桁カンマ。入力のたびに onText に文字列を渡す */
function YenInput({ id, value, emptyWhenZero = true, focusZero = false, onText, placeholder }) {
  const [text, setText] = useState(null); // null = フォーカスしていない
  const shown = text !== null ? text : (value == null || (emptyWhenZero && !value) ? "" : yen(value));
  return (
    <input
      type="text" id={id} inputMode="numeric" autoComplete="off" placeholder={placeholder} value={shown}
      onFocus={(e) => { const n = value || 0; setText(n ? String(n) : (focusZero ? "0" : "")); const el = e.target; setTimeout(() => el.select(), 0); }}
      onChange={(e) => { setText(e.target.value); onText(e.target.value); }}
      onBlur={() => setText(null)}
    />
  );
}

function newForm(employees) {
  const emp = employees[0];
  return { id: crypto.randomUUID(), createdAt: nowIso(), employeeId: emp ? emp.id : "", bonusName: "", payDate: todayStr(), bonusAmount: 0,
    dependents: emp ? emp.dependents : 0, prevOverride: null, taxPeriodOver6: false, manual: {}, remarks: "" };
}
function formFromDoc(b) {
  return { id: b.id, createdAt: b.createdAt, employeeId: b.employeeId, bonusName: b.bonusName, payDate: b.payDate, bonusAmount: b.bonusAmount,
    dependents: b.dependents, prevOverride: typeof b.prevOverride === "number" ? b.prevOverride : null, taxPeriodOver6: !!b.taxPeriodOver6,
    manual: { ...b.manual }, remarks: b.remarks || "" };
}

/* ===================== 明細プレビュー（PDFと同じ並び） ===================== */
function BonusSlip({ doc, emp }) {
  const ins = doc.employmentInsurance + doc.healthInsurance + doc.longTermCareInsurance + doc.childcareSupport + doc.welfarePension;
  const taxable = doc.bonusAmount - ins;
  const payRows = [[doc.bonusName || "賞与", doc.bonusAmount]];
  const dedRows = BONUS_DED.filter((x) => doc[x.k] > 0).map((x) => [x.label, doc[x.k]]);
  const n = Math.max(payRows.length, dedRows.length, 1);
  const rows = (list) => Array.from({ length: n }, (_, i) => (
    list[i]
      ? <tr key={i}><td>{list[i][0]}</td><td className="num">{yen(list[i][1])}</td></tr>
      : <tr key={i}><td>&nbsp;</td><td></td></tr>
  ));
  const lines = String(doc.remarks || "").split("\n");
  return (
    <>
      <div className="bn-slip">
        <h2>賞与支払明細書</h2>
        <div className="co"><img className="logo" alt="" src={import.meta.env.BASE_URL + "payroll-logo.jpg"} /><b>株式会社 ワコウ</b><span className="ym">{dateLabel(doc.payDate)}</span></div>
        <div className="name">{emp.name} 殿</div>
        <div className="info"><span>課税対象額 {yen(taxable)}円</span><span>標準賞与額 {yen(doc.standardBonus)}円</span><span>扶養親族等の数 {doc.dependents}人</span></div>
        <div className="cols">
          <div><table><thead><tr><th>支給</th><th className="num">金額（円）</th></tr></thead><tbody>{rows(payRows)}</tbody><tfoot><tr className="sum"><td>支給合計</td><td className="num">{yen(doc.bonusAmount)}</td></tr></tfoot></table></div>
          <div><table><thead><tr><th>控除</th><th className="num">金額（円）</th></tr></thead><tbody>{rows(dedRows)}</tbody><tfoot><tr className="sum"><td>控除合計</td><td className="num">{yen(doc.totalDeduction)}</td></tr></tfoot></table></div>
        </div>
        <div className="net"><span>差引支給額</span><b>{yen(doc.netPay)} 円</b></div>
        <div className="memo"><div>備考</div>{[0, 1, 2].map((i) => <div key={i} className="ln">{lines[i] || ""}</div>)}</div>
      </div>
      <p className="bn-muted">画面での確認用です。「PDF出力」で給与明細と同じ並びの「賞与支払明細書」を出します。</p>
    </>
  );
}

/* ===================== 賞与の編集 ===================== */
function BonusEditor({ initial, isNew, employees, payrolls, bonuses, settings, onBack, onSave, onDelete, say }) {
  const [form, setForm] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [prevKey, setPrevKey] = useState(0); // 前月給与の入力欄を空に戻すとき用

  const emp = employees.find((x) => x.id === form.employeeId);
  const auto = useMemo(() => {
    if (!emp || !validDate(form.payDate)) return null;
    return calcBonusAuto(
      { employee: emp, bonusAmount: form.bonusAmount, payDate: form.payDate, dependents: form.dependents, prevOverride: form.prevOverride,
        taxPeriodOver6: form.taxPeriodOver6, selfId: form.id, createdAt: form.createdAt },
      { bonuses, payrolls, settings },
    );
  }, [emp, form, bonuses, payrolls, settings]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setManual = (k, text) => setForm((f) => {
    const manual = { ...f.manual };
    if (toHalf(text) === "") delete manual[k]; else manual[k] = parseInt0(text);
    return { ...f, manual };
  });
  const resetDed = (k) => setForm((f) => { const manual = { ...f.manual }; delete manual[k]; return { ...f, manual }; });
  const changeEmployee = (id) => {
    const next = employees.find((x) => x.id === id);
    setForm((f) => ({ ...f, employeeId: id, dependents: next ? next.dependents : f.dependents, manual: {}, prevOverride: null }));
    setPrevKey((k) => k + 1);
  };

  if (!employees.length) {
    return (
      <>
        <div className="bn-empty">先に「月給」の画面で従業員を追加してください。</div>
        <div className="bn-actions"><button className="bn-btn ghost" onClick={onBack}>戻る</button></div>
      </>
    );
  }

  const handleSave = async () => {
    if (!emp) return say("従業員を選んでください。");
    if (!validDate(form.payDate)) return say("支給日を入れてください。");
    if (!(form.bonusAmount > 0)) return say("賞与額を入れてください。");
    setBusy(true);
    try {
      await onSave(buildBonusDoc(form, auto, emp));
    } finally {
      setBusy(false);
    }
  };
  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setBusy(true);
    try { await onDelete(form.id); } finally { setBusy(false); }
  };
  const handlePDF = async (mode) => {
    if (!emp || !auto) return;
    const previewWindow = mode === "preview" ? window.open("", "_blank") : null;
    setPdfLoading(true);
    try {
      const { generateBonusPDF } = await import("./payrollCalc/pdf");
      await generateBonusPDF(emp, buildBonusDoc(form, auto, emp), mode, previewWindow);
    } catch (e) {
      console.error(e);
      previewWindow?.close();
      say("PDF生成に失敗しました。");
    } finally {
      setPdfLoading(false);
    }
  };

  const header = (
    <>
      <div className="bn-row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{isNew ? "賞与を作成" : "賞与を編集"}</h2>
        <button className="bn-link" onClick={onBack}>← 一覧に戻る</button>
      </div>
      <div className="bn-card"><div className="bn-grid2">
        <div className="bn-field"><label htmlFor="bn-emp">従業員</label>
          <select id="bn-emp" value={form.employeeId} onChange={(e) => changeEmployee(e.target.value)}>
            {employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></div>
        <div className="bn-field"><label htmlFor="bn-date">支給日</label>
          <input type="date" id="bn-date" value={form.payDate} onChange={(e) => set("payDate", e.target.value)} /></div>
        <div className="bn-field"><label htmlFor="bn-name">賞与の名前</label>
          <input type="text" id="bn-name" list="bn-bonus-names" value={form.bonusName} onChange={(e) => set("bonusName", e.target.value)} placeholder="例 夏季賞与" />
          <datalist id="bn-bonus-names">{BONUS_NAMES.map((n) => <option key={n} value={n} />)}</datalist></div>
        <div className="bn-field"><label htmlFor="bn-amount">賞与額（円）</label>
          <YenInput id="bn-amount" value={form.bonusAmount} placeholder="例 500,000" onText={(t) => set("bonusAmount", parseInt0(t))} /></div>
        <div className="bn-field"><label htmlFor="bn-dep">扶養親族等の数</label>
          <input type="number" id="bn-dep" min={0} max={20} value={form.dependents} onChange={(e) => set("dependents", Math.max(0, Math.min(20, parseInt0(e.target.value))))} /></div>
      </div></div>
    </>
  );

  if (!auto) {
    return <>{header}<div className="bn-notice warn">従業員と支給日を選んでください。</div></>;
  }

  const ded = finalDeductions(form, auto);
  const total = BONUS_DED.reduce((s, x) => s + ded[x.k], 0);
  const amount = Math.max(0, Math.floor(form.bonusAmount || 0));
  const taxManual = typeof form.manual.incomeTax === "number";

  const notices = auto.notes.map((n) => ({ level: n.level === "warn" ? "warn" : "info", text: n.text }));
  if (auto.taxStatus === "noPrev") notices.push({ level: "info", text: ymLabel(auto.prev.yearMonth) + "の給与明細が見つからないため、源泉所得税は月額表を使う方法で計算しています。前月の給与があった人なら、下の「前月給与」に入れると算出率の表で計算します。" });
  else if (auto.taxStatus === "over10x") notices.push({ level: "info", text: "賞与が前月給与（社会保険料を引いたあと）の10倍を超えているため、源泉所得税は月額表を使う方法で計算しています。" });
  else if (auto.taxStatus === "tooLarge") notices.push({ level: "warn", text: "金額が月額表の範囲を超えるため、源泉所得税を自動で計算できません。手で入力してください。" + (taxManual ? "" : "（いまは0円です）") });
  else if (auto.taxStatus === "noTable") notices.push({ level: "warn", text: form.payDate.slice(0, 4) + "年分の算出率の表が入っていません。源泉所得税を手で入力してください。" });
  if (auto.taxNeedsManual && taxManual) notices.push({ level: "info", text: "源泉所得税は手で入れた金額を使っています。" });

  let prevInfo;
  if (auto.prev.source === "payroll") prevInfo = ymLabel(auto.prev.yearMonth) + "の給与明細から、社会保険料を引いたあとの金額は " + yen(auto.prev.amount) + "円。";
  else if (auto.prev.source === "manual") prevInfo = "手で入れた金額 " + yen(auto.prev.amount) + "円を使っています。";
  else prevInfo = ymLabel(auto.prev.yearMonth) + "の給与明細がありません。";

  const P = auto.employeePercents;
  const basis = {
    employmentInsurance: emp.isOfficer ? "役員は対象外" : "賞与額 × " + pct(P.employment),
    healthInsurance: "標準賞与額 " + yen(auto.healthBase) + " × " + pct(P.health),
    longTermCareInsurance: emp.needsLongTermCareInsurance ? "標準賞与額 " + yen(auto.healthBase) + " × " + pct(P.care) : "介護保険の対象外（40歳未満）",
    childcareSupport: P.support > 0 ? "標準賞与額 " + yen(auto.healthBase) + " × " + pct(P.support) : "この月は対象外（令和8年4月分から）",
    welfarePension: "標準賞与額 " + yen(auto.pensionBase) + " × " + pct(P.pension),
    incomeTax: auto.taxStatus === "ok"
      ? "(賞与 − 社会保険料等) " + yen(auto.bonusAfterInsurance) + " × " + pct(auto.taxRate)
      : auto.taxSpecial
        ? "月額表: (賞与 − 社会保険料等) " + yen(auto.bonusAfterInsurance) + " ÷ " + auto.taxMonths + " ＝ " + yen(auto.taxPerMonth) +
          (auto.taxStatus === "over10x" ? " に前月給与 " + yen(auto.prev.amount) + " を足した税額 − 前月給与の税額" : " の税額") +
          " " + yen(auto.taxPerMonthTax) + " × " + auto.taxMonths
        : "手入力が必要です",
  };
  const healthAfter = auto.healthYearUsedBefore + auto.healthBase;

  return (
    <>
      {header}
      {notices.map((n, i) => <div key={i} className={"bn-notice " + n.level}>{n.text}</div>)}

      <div className="bn-card">
        <h2>前月の給与</h2>
        <p className="bn-muted" style={{ marginBottom: 8 }}>{prevInfo}</p>
        <div className="bn-field" style={{ maxWidth: 300, marginBottom: 6 }}>
          <label htmlFor="bn-prev">前月給与（社会保険料を引いたあと）を手で入れる</label>
          <YenInput key={prevKey} id="bn-prev" value={form.prevOverride} emptyWhenZero={false} placeholder="空欄なら明細から取ります"
            onText={(t) => set("prevOverride", toHalf(t) === "" ? null : parseInt0(t))} />
        </div>
        {form.prevOverride != null && <button className="bn-link" onClick={() => { set("prevOverride", null); setPrevKey((k) => k + 1); }}>明細の値に戻す</button>}
      </div>

      {auto.taxSpecial && (
        <div className="bn-card">
          <h2>賞与の計算期間</h2>
          <p className="bn-muted" style={{ marginBottom: 8 }}>月額表を使う計算では、賞与の計算の対象になった期間で割る数が変わります。</p>
          <label style={{ display: "block", marginBottom: 4 }}><input type="radio" name="bn-period" checked={!form.taxPeriodOver6} onChange={() => set("taxPeriodOver6", false)} /> 6か月以下（÷6、×6）</label>
          <label style={{ display: "block" }}><input type="radio" name="bn-period" checked={!!form.taxPeriodOver6} onChange={() => set("taxPeriodOver6", true)} /> 6か月を超える（÷12、×12）</label>
        </div>
      )}

      <div className="bn-card">
        <h2>控除</h2>
        {BONUS_DED.map((x) => {
          const manual = typeof form.manual[x.k] === "number";
          const needs = x.k === "incomeTax" && auto.taxNeedsManual && !manual;
          return (
            <div key={x.k} className="bn-ded">
              <label htmlFor={"bn-d-" + x.k}>{x.label}</label>
              <div className="in"><YenInput id={"bn-d-" + x.k} value={ded[x.k]} emptyWhenZero={false} focusZero onText={(t) => setManual(x.k, t)} /><span className="bn-unit">円</span></div>
              <div className="meta">
                <span className={"bn-tag" + (manual ? " manual" : "") + (needs ? " warn" : "")}>{needs ? "要入力" : manual ? "手入力" : "自動"}</span>
                <span>{basis[x.k]}</span>
                {manual && <button className="bn-link" onClick={() => resetDed(x.k)}>自動に戻す</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bn-card">
        <h2>この年度の上限</h2>
        <p className="bn-muted" style={{ margin: 0 }}>
          健康保険・介護・子ども・子育て支援金（年度）: これまで {yen(auto.healthYearUsedBefore)}円 ＋ 今回 {yen(auto.healthBase)}円 ＝ {yen(healthAfter)}円（上限 {yen(settings.healthYearCap)}円、残り {yen(Math.max(0, settings.healthYearCap - healthAfter))}円）<br />
          厚生年金（この月）: これまで {yen(auto.pensionMonthUsedBefore)}円 ＋ 今回 {yen(auto.pensionBase)}円（上限 {yen(settings.pensionMonthCap)}円）<br />
          標準賞与額 ＝ 賞与額の1,000円未満を切り捨てた額
        </p>
      </div>

      {(() => {
        const ec = calcEmployerCost(buildBonusDoc(form, auto, emp), settings);
        return (
          <div className="bn-card">
            <h2>会社の負担</h2>
            <div className="bn-tablewrap"><table><tbody>
              <tr><td>賞与額</td><td className="num">{yen(amount)}円</td></tr>
              {ec.items.filter((x) => x.v > 0).map((x) => <tr key={x.k}><td>{x.label}（会社負担）</td><td className="num">{yen(x.v)}円</td></tr>)}
              <tr><td><b>会社の総額</b></td><td className="num"><b>{yen(ec.companyCost)}円</b></td></tr>
            </tbody></table></div>
            <p className="bn-muted" style={{ margin: "8px 0 0" }}>会社負担の社会保険料などは、料率タブの設定で計算した目安です。</p>
          </div>
        );
      })()}

      <div className="bn-card">
        <div className="bn-field" style={{ margin: 0 }}>
          <label htmlFor="bn-remarks">備考（明細に印字）</label>
          <textarea id="bn-remarks" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
        </div>
      </div>

      <div className="bn-result">
        <div><div className="k">賞与額</div><div className="v">{yen(amount)}円</div></div>
        <div><div className="k">控除計</div><div className="v">{yen(total)}円</div></div>
        <div className="net"><div className="k">差引支給額</div><div className="v">{yen(amount - total)}円</div></div>
      </div>

      <div className="bn-actions">
        <button className="bn-btn" onClick={handleSave} disabled={busy}>{busy ? "保存中..." : "保存"}</button>
        <button className="bn-btn ghost" onClick={() => setPreview((p) => !p)}>{preview ? "明細を閉じる" : "明細を見る"}</button>
        <button className="bn-btn ghost" onClick={() => handlePDF("preview")} disabled={pdfLoading}>{pdfLoading ? "生成中..." : "PDFプレビュー"}</button>
        <button className="bn-btn ghost" onClick={() => handlePDF("download")} disabled={pdfLoading}>{pdfLoading ? "生成中..." : "PDF出力"}</button>
        {!isNew && <button className={"bn-btn danger" + (confirmDel ? " on" : "")} onClick={handleDelete} disabled={busy}>{confirmDel ? "本当にゴミ箱へ" : "削除"}</button>}
      </div>
      {preview && <BonusSlip doc={buildBonusDoc(form, auto, emp)} emp={emp} />}
    </>
  );
}

/* ===================== 料率 ===================== */
function RatesPanel({ settings, onSaved, say }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(settings)));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const setRate = (i, k, raw) => setDraft((d) => {
    const rates = d.rates.map((r, j) => (j === i ? { ...r, [k]: k === "from" ? raw : parseDec(raw) } : r));
    return { ...d, rates };
  });
  const addRate = () => setDraft((d) => {
    const last = d.rates[d.rates.length - 1] || { health: 0, care: 0, support: 0, pension: 18.3 };
    return { ...d, rates: [...d.rates, { from: todayStr().slice(0, 7), health: last.health, care: last.care, support: last.support, pension: last.pension }] };
  });
  const delRate = (i) => {
    if (draft.rates.length <= 1) return say("料率の行は1つ以上必要です。");
    setDraft((d) => ({ ...d, rates: d.rates.filter((_, j) => j !== i) }));
  };
  const DEC_KEYS = ["employmentRate", "employerEmploymentRate", "childContributionRate", "workersCompRate"];
  const setS = (k, raw) => setDraft((d) => ({ ...d, [k]: DEC_KEYS.includes(k) ? parseDec(raw) : parseInt0(raw) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const clean = migrateBonusSettings(draft);
      await saveBonusSettings(clean);
      onSaved(clean);
      setDraft(JSON.parse(JSON.stringify(clean)));
      say("料率を保存しました。");
    } catch (e) {
      say("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bn-card">
        <h2>社会保険料の料率（全体）</h2>
        <p className="bn-muted">協会けんぽ 埼玉支部。本人負担は全体の半分です。賞与の支給月に当てはまる行を使います。年度が変わったら行を足してください。</p>
        <div className="bn-tablewrap bn-rate-table"><table>
          <thead><tr><th>適用開始</th><th className="num">健保 %</th><th className="num">介護 %</th><th className="num">支援金 %</th><th className="num">厚年 %</th><th>本人負担</th><th></th></tr></thead>
          <tbody>{draft.rates.map((r, i) => (
            <tr key={i}>
              <td><input type="month" value={r.from} onChange={(e) => setRate(i, "from", e.target.value)} aria-label="適用開始の月" /></td>
              {["health", "care", "support", "pension"].map((k) => (
                <td key={k}><RateInput value={r[k]} onCommit={(raw) => setRate(i, k, raw)} label={k} /></td>
              ))}
              <td className="bn-muted">{unitsText(r)}</td>
              <td><button className="bn-link" onClick={() => delRate(i)}>削除</button></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="bn-actions" style={{ margin: "10px 0 0" }}><button className="bn-btn ghost small" onClick={addRate}>＋ 行を追加</button></div>
      </div>
      <div className="bn-card">
        <h2>雇用保険・上限</h2>
        <div className="bn-grid2">
          <div className="bn-field"><label htmlFor="bn-s-emp">雇用保険 本人負担（%）</label><RateInput id="bn-s-emp" value={draft.employmentRate} onCommit={(raw) => setS("employmentRate", raw)} /></div><div></div>
          <div className="bn-field"><label htmlFor="bn-s-hc">標準賞与額の上限・健保/介護/支援金（年度）</label><input type="text" id="bn-s-hc" inputMode="numeric" value={draft.healthYearCap} onChange={(e) => setS("healthYearCap", e.target.value)} /></div>
          <div className="bn-field"><label htmlFor="bn-s-pc">標準賞与額の上限・厚生年金（1か月）</label><input type="text" id="bn-s-pc" inputMode="numeric" value={draft.pensionMonthCap} onChange={(e) => setS("pensionMonthCap", e.target.value)} /></div>
        </div>
        <p className="bn-muted" style={{ margin: 0 }}>雇用保険は、令和8年度が一般の事業 0.5%、建設の事業 0.6%です。ワコウの届出の区分が分かるまで、月給の計算に合わせて0.6%にしています。</p>
      </div>
      <div className="bn-card">
        <h2>会社負担（会社の総額の計算用）</h2>
        <div className="bn-grid2">
          <div className="bn-field"><label htmlFor="bn-s-eemp">雇用保険 事業主負担（%）</label><RateInput id="bn-s-eemp" value={draft.employerEmploymentRate} onCommit={(raw) => setS("employerEmploymentRate", raw)} /></div>
          <div className="bn-field"><label htmlFor="bn-s-cc">子ども・子育て拠出金（%）</label><RateInput id="bn-s-cc" value={draft.childContributionRate} onCommit={(raw) => setS("childContributionRate", raw)} /></div>
          <div className="bn-field"><label htmlFor="bn-s-wc">労災保険（%）</label><RateInput id="bn-s-wc" value={draft.workersCompRate} onCommit={(raw) => setS("workersCompRate", raw)} /></div>
        </div>
        <p className="bn-muted" style={{ margin: 0 }}>健康保険・介護・子育て支援金・厚生年金の会社負担は、上の料率表から自動で出します（本人と折半）。雇用保険の事業主負担は令和8年度、一般の事業 0.85%、建設の事業 1.05%。子ども・子育て拠出金は会社だけが払うもので 0.36%。労災保険は現場分を元請で入っている前提で0%にしています。自社で入っているなら料率を入れてください。</p>
      </div>
      <div className="bn-card">
        <h2>源泉所得税</h2>
        <p className="bn-muted" style={{ margin: 0 }}>国税庁の令和8年分「賞与に対する源泉徴収税額の算出率の表（甲欄）」を内蔵しています。令和9年分は公表後に表の更新が必要です（それまでは税額を手入力にします）。</p>
      </div>
      <div className="bn-actions">
        <button className="bn-btn" onClick={handleSave} disabled={saving || !dirty}>{saving ? "保存中..." : "料率を保存"}</button>
        {dirty && <button className="bn-btn ghost" onClick={() => setDraft(JSON.parse(JSON.stringify(settings)))}>変更を取り消す</button>}
      </div>
    </>
  );
}

/** 小数の料率入力（"9." の途中状態を壊さないよう、入力中は文字列のまま持つ） */
function RateInput({ id, value, onCommit, label }) {
  const [text, setText] = useState(null);
  return (
    <input type="text" id={id} inputMode="decimal" aria-label={label} value={text !== null ? text : String(value)}
      onFocus={() => setText(String(value))}
      onChange={(e) => { setText(e.target.value); onCommit(e.target.value); }}
      onBlur={() => setText(null)} />
  );
}

/* ===================== メイン（賞与） ===================== */
export default function BonusView({ employees, payrolls }) {
  const [bonuses, setBonuses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("bonus");
  const [fy, setFy] = useState(fiscalYearOf(todayStr()));
  const [editing, setEditing] = useState(null); // { form, isNew }
  const [showTrash, setShowTrash] = useState(false);
  const [confirmKey, setConfirmKey] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const say = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  };

  useEffect(() => {
    Promise.all([loadBonuses(), loadBonusSettings()])
      .then(([bs, s]) => { setBonuses(bs); setSettings(s); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
    return () => clearTimeout(toastTimer.current);
  }, []);

  const withTimeout = (p) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("タイムアウト（15秒）: Firestoreに接続できません")), 15000))]);
  const upsertLocal = (doc) => setBonuses((list) => (list.some((b) => b.id === doc.id) ? list.map((b) => (b.id === doc.id ? doc : b)) : [...list, doc]));

  const handleSave = async (doc) => {
    const existing = bonuses.find((b) => b.id === doc.id);
    if (existing) doc.createdAt = existing.createdAt || doc.createdAt;
    try {
      await withTimeout(saveBonus(doc));
    } catch (e) {
      say("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    upsertLocal(doc);
    setFy(doc.fiscalYear); setEditing(null); setConfirmKey(null);
    say(doc.needsReview ? "保存しました。源泉所得税は要入力のままです。" : "保存しました。");
  };
  const softDelete = async (id) => {
    const b = bonuses.find((x) => x.id === id);
    if (!b) { setEditing(null); return; }
    const doc = { ...b, deletedAt: nowIso() };
    try { await withTimeout(saveBonus(doc)); } catch (e) { say("削除に失敗しました: " + (e instanceof Error ? e.message : String(e))); return; }
    upsertLocal(doc); setEditing(null); setConfirmKey(null);
    say("ゴミ箱に入れました。" + TRASH_DAYS + "日は戻せます。");
  };
  const restore = async (id) => {
    const b = bonuses.find((x) => x.id === id);
    if (!b) return;
    const doc = { ...b, deletedAt: null };
    try { await withTimeout(saveBonus(doc)); } catch (e) { say("戻せませんでした: " + (e instanceof Error ? e.message : String(e))); return; }
    upsertLocal(doc); say("戻しました。");
  };
  const purge = async (id) => {
    const key = "purge:" + id;
    if (confirmKey !== key) { setConfirmKey(key); return; }
    try { await withTimeout(deleteBonus(id)); } catch (e) { say("削除に失敗しました: " + (e instanceof Error ? e.message : String(e))); return; }
    setBonuses((list) => list.filter((x) => x.id !== id)); setConfirmKey(null);
    say("完全に削除しました。");
  };

  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? e.name : "（従業員なし）"; };
  const live = bonuses.filter((b) => !b.deletedAt);

  let body;
  if (loadError) {
    body = <div className="bn-notice warn">賞与のデータを読み込めませんでした: {loadError}</div>;
  } else if (!settings) {
    body = <p className="bn-muted">読み込み中...</p>;
  } else if (tab === "rates") {
    body = <RatesPanel settings={settings} onSaved={setSettings} say={say} />;
  } else if (editing) {
    body = (
      <BonusEditor
        key={editing.form.id}
        initial={editing.form} isNew={editing.isNew}
        employees={employees} payrolls={payrolls} bonuses={live} settings={settings}
        onBack={() => { setEditing(null); setConfirmKey(null); }}
        onSave={handleSave} onDelete={softDelete} say={say}
      />
    );
  } else {
    const rows = live.filter((b) => fiscalYearOf(b.payDate) === fy).sort((a, b) => (a.payDate < b.payDate ? 1 : a.payDate > b.payDate ? -1 : 0));
    const costOf = Object.fromEntries(rows.map((b) => [b.id, calcEmployerCost(b, settings)]));
    const tot = rows.reduce((s, b) => ({
      amount: s.amount + b.bonusAmount, ded: s.ded + b.totalDeduction, net: s.net + b.netPay,
      employer: s.employer + costOf[b.id].total, company: s.company + costOf[b.id].companyCost,
    }), { amount: 0, ded: 0, net: 0, employer: 0, company: 0 });
    const cap = settings.healthYearCap;
    const perEmp = employees.map((e) => {
      const mine = rows.filter((b) => b.employeeId === e.id);
      const base = mine.reduce((s, b) => s + (b.healthBase || 0), 0);
      return { e, n: mine.length, amount: mine.reduce((s, b) => s + b.bonusAmount, 0), company: mine.reduce((s, b) => s + costOf[b.id].companyCost, 0), base, room: Math.max(0, cap - base) };
    }).filter((x) => x.n > 0);
    // ゴミ箱は30日を過ぎたものを表示しないだけ（Firestoreから自動で消すことはしない）
    const trash = bonuses.filter((b) => b.deletedAt && daysSince(b.deletedAt) < TRASH_DAYS);

    body = (
      <>
        <div className="bn-fy">
          <button className="bn-btn ghost small" onClick={() => setFy(fy - 1)} aria-label="前の年度">◀</button>
          <strong>{fy}年度 <span className="bn-muted">（{fy}年4月〜{fy + 1}年3月）</span></strong>
          <button className="bn-btn ghost small" onClick={() => setFy(fy + 1)} aria-label="次の年度">▶</button>
        </div>
        <div className="bn-stats">
          <div><div className="k">賞与支給額</div><div className="v">{yen(tot.amount)}</div></div>
          <div><div className="k">控除合計</div><div className="v">{yen(tot.ded)}</div></div>
          <div><div className="k">差引支給額</div><div className="v">{yen(tot.net)}</div></div>
          <div className="company"><div className="k">会社の総額</div><div className="v">{yen(tot.company)}</div></div>
        </div>
        {rows.length > 0 && <p className="bn-muted" style={{ marginTop: -6 }}>会社の総額 ＝ 賞与支給額 {yen(tot.amount)} ＋ 会社負担の社会保険料など {yen(tot.employer)}</p>}
        <div className="bn-actions"><button className="bn-btn" onClick={() => { setEditing({ form: newForm(employees), isNew: true }); setConfirmKey(null); }}>＋ 賞与を作成</button></div>

        {!rows.length ? (
          <div className="bn-empty">{fy}年度の賞与はまだありません。<br />「＋ 賞与を作成」から、従業員と賞与額を入れてください。</div>
        ) : rows.map((b) => (
          <button key={b.id} className="bn-bonus" onClick={() => { setEditing({ form: formFromDoc(b), isNew: false }); setConfirmKey(null); }}>
            <div className="top">
              <span className="who">{empName(b.employeeId)}
                {b.needsReview && <> <span className="bn-tag warn">税額 要入力</span></>}
                {b.manual && Object.keys(b.manual).length > 0 && <> <span className="bn-tag manual">手入力あり</span></>}
              </span>
              <span className="bn-muted">{b.bonusName || "賞与"} ・ {dateLabel(b.payDate)}</span>
            </div>
            <div className="figs">
              <div><span>賞与額</span><b>{yen(b.bonusAmount)}円</b></div>
              <div><span>控除計</span><b>{yen(b.totalDeduction)}円</b></div>
              <div><span>差引支給額</span><b>{yen(b.netPay)}円</b></div>
            </div>
            <div className="company">会社の総額 <b>{yen(costOf[b.id].companyCost)}円</b>（会社負担 {yen(costOf[b.id].total)}円）</div>
          </button>
        ))}

        {perEmp.length > 0 && (
          <div className="bn-card">
            <h3>従業員ごとの年度累計</h3>
            <div className="bn-tablewrap"><table>
              <thead><tr><th>氏名</th><th className="num">回数</th><th className="num">賞与額</th><th className="num">会社の総額</th><th className="num">標準賞与額（健保）</th><th className="num">上限まで</th></tr></thead>
              <tbody>{perEmp.map((x) => (
                <tr key={x.e.id}><td>{x.e.name}</td><td className="num">{x.n}</td><td className="num">{yen(x.amount)}</td><td className="num">{yen(x.company)}</td><td className="num">{yen(x.base)}</td><td className="num">{yen(x.room)}</td></tr>
              ))}</tbody>
            </table></div>
            <p className="bn-muted" style={{ margin: "8px 0 0" }}>健康保険・介護・子ども・子育て支援金の上限は年度で {yen(cap)}円です。</p>
          </div>
        )}

        <div className="bn-card">
          <div className="bn-row between">
            <h3 style={{ margin: 0 }}>ゴミ箱（{TRASH_DAYS}日たつと表示されなくなります）</h3>
            <button className="bn-btn ghost small" onClick={() => { setShowTrash(!showTrash); setConfirmKey(null); }}>{showTrash ? "閉じる" : `開く（${trash.length}）`}</button>
          </div>
          {showTrash && (trash.length ? trash.map((b) => {
            const asking = confirmKey === "purge:" + b.id;
            return (
              <div key={b.id} className="bn-row between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", marginTop: 8 }}>
                <span>{empName(b.employeeId)} ・ {b.bonusName || "賞与"} ・ {dateLabel(b.payDate)}<br /><span className="bn-muted">あと{Math.max(0, TRASH_DAYS - daysSince(b.deletedAt))}日</span></span>
                <span className="bn-row">
                  <button className="bn-btn ghost small" onClick={() => restore(b.id)}>戻す</button>
                  <button className={"bn-btn danger small" + (asking ? " on" : "")} onClick={() => purge(b.id)}>{asking ? "本当に完全削除" : "完全に削除"}</button>
                </span>
              </div>
            );
          }) : <p className="bn-muted" style={{ margin: "10px 0 0" }}>ゴミ箱は空です。</p>)}
        </div>
      </>
    );
  }

  return (
    <div className="bn-root">
      <style>{BN_CSS}</style>
      <nav className="bn-tabs" role="tablist" aria-label="賞与の画面切り替え">
        {[["bonus", "賞与"], ["rates", "料率"]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setConfirmKey(null); }}>{label}</button>
        ))}
      </nav>
      {body}
      {toast && <div className="bn-toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
