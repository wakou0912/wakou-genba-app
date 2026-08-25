import { calcTotalPayment, calcTotalDeduction, calcNetPay } from "./calculations";

function fmt(n) {
  if (n === 0) return "";
  return n.toLocaleString("ja-JP");
}

function fmtRequired(n) {
  return n.toLocaleString("ja-JP");
}

async function loadJapaneseFont(doc) {
  const res = await fetch(import.meta.env.BASE_URL + "fonts/NotoSansJP-Regular.ttf");
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  doc.addFileToVFS("NotoSansJP-Regular.ttf", base64);
  doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
  doc.setFont("NotoSansJP", "normal");
}

async function tryAddLogo(doc, x, y, w, h) {
  try {
    const res = await fetch(import.meta.env.BASE_URL + "payroll-logo.jpg");
    if (!res.ok) return;
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    doc.addImage(dataUrl, "JPEG", x, y, w, h);
  } catch {
    // ロゴが読めなくてもPDF生成は続行する
  }
}

export async function generatePayrollPDF(employee, payroll, mode = "download", previewWindow = null) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  await loadJapaneseFont(doc);

  const FONT = "NotoSansJP";

  const title = payroll.isBonus ? "賞与支払明細書" : "給料支払明細書";
  const [year, month] = payroll.yearMonth.split("-");
  const dateLabel = `${year}年${parseInt(month)}月分`;

  const totalPayment = calcTotalPayment(payroll);
  const totalDeduction = calcTotalDeduction(payroll);
  const netPay = calcNetPay(payroll);

  // 課税対象額（立替経費・社会保険料を差し引いた額）
  const socialInsurance =
    payroll.employmentInsurance +
    payroll.healthInsurance +
    payroll.longTermCareInsurance +
    payroll.childcareSupport +
    payroll.welfarePension;
  const taxBase = Math.max(0, totalPayment - payroll.advanceExpense - socialInsurance);

  // 標準報酬月額（千円単位）
  const stdRemunKSen = Math.floor(employee.standardMonthlyRemuneration / 1000);

  // ─── ヘッダー ───────────────────────────────────────────
  doc.setFont(FONT, "normal");
  doc.setFontSize(18);
  doc.text(title, 105, 20, { align: "center" });

  // ロゴ（15,25 に 17×8mm、比率564:269≈2.1:1）
  await tryAddLogo(doc, 15, 25, 17, 8);

  doc.setFontSize(11);
  doc.text("株式会社 ワコウ", 34, 30);
  doc.text(dateLabel, 195, 30, { align: "right" });

  doc.setFontSize(12);
  doc.text(`${employee.name} 殿`, 15, 40);

  // 課税対象額・標準報酬月額・扶養人数（右エリア）
  doc.setFontSize(9);
  doc.text(`課税対象額：${taxBase.toLocaleString("ja-JP")} 円`, 125, 36);
  doc.text(`標準報酬月額：${stdRemunKSen.toLocaleString("ja-JP")} 千円`, 125, 42);
  doc.text(`扶養親族等の数：${employee.dependents} 人`, 125, 48);

  // 労働期間・日数
  doc.setFontSize(10);
  if (payroll.workingPeriod) {
    doc.text(`労働期間: ${payroll.workingPeriod}`, 15, 47);
  }
  if (payroll.workingDays !== null && payroll.workingDays !== undefined) {
    doc.text(`労働日数: ${payroll.workingDays} 日`, 80, 47);
  }

  // ─── 支給・控除テーブル ─────────────────────────────────
  const kyuyo = [];
  const kojo = [];

  if (payroll.baseSalary > 0) kyuyo.push(["基本給", fmt(payroll.baseSalary)]);
  if (payroll.overtimeAllowance > 0) kyuyo.push(["残業手当", fmt(payroll.overtimeAllowance)]);
  if (payroll.communicationAllowance > 0) kyuyo.push(["通信費", fmt(payroll.communicationAllowance)]);
  if (payroll.transportAllowance > 0) kyuyo.push(["交通手当", fmt(payroll.transportAllowance)]);
  if (payroll.housingAllowance > 0) kyuyo.push(["家賃補助", fmt(payroll.housingAllowance)]);
  if (payroll.advanceExpense > 0) kyuyo.push(["立替経費(非課税)", fmt(payroll.advanceExpense)]);
  if (payroll.yearEndAdjustment !== 0) kyuyo.push(["年末調整", fmt(payroll.yearEndAdjustment)]);

  if (payroll.employmentInsurance > 0) kojo.push(["雇用保険料", fmt(payroll.employmentInsurance)]);
  if (payroll.healthInsurance > 0) kojo.push(["健康保険料", fmt(payroll.healthInsurance)]);
  if (payroll.longTermCareInsurance > 0) kojo.push(["介護保険料", fmt(payroll.longTermCareInsurance)]);
  if (payroll.childcareSupport > 0) kojo.push(["子育て支援金", fmt(payroll.childcareSupport)]);
  if (payroll.welfarePension > 0) kojo.push(["厚生年金保険料", fmt(payroll.welfarePension)]);
  if (payroll.incomeTax > 0) kojo.push(["源泉税", fmt(payroll.incomeTax)]);
  if (payroll.municipalTax > 0) kojo.push(["住民税", fmt(payroll.municipalTax)]);
  if (payroll.prepayment > 0) kojo.push(["前払金", fmt(payroll.prepayment)]);

  const maxRows = Math.max(kyuyo.length, kojo.length);
  const rows = [];
  for (let i = 0; i < maxRows; i++) {
    const left = kyuyo[i] ?? ["", ""];
    const right = kojo[i] ?? ["", ""];
    rows.push([left[0], left[1], right[0], right[1]]);
  }
  rows.push(["支給合計", fmtRequired(totalPayment), "控除合計", fmtRequired(totalDeduction)]);

  autoTable(doc, {
    startY: 52,
    head: [["支給項目", "金額（円）", "控除項目", "金額（円）"]],
    body: rows,
    theme: "grid",
    // styles が全セル（ヘッダー含む）に適用される
    styles: { font: FONT, fontStyle: "normal", fontSize: 10 },
    headStyles: { fillColor: [50, 50, 50], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 35, halign: "right" },
      2: { cellWidth: 45 },
      3: { cellWidth: 35, halign: "right" },
    },
    // セル描画直前にフォントを強制適用（autotable がフォントをリセットする場合の保険）
    willDrawCell: () => {
      doc.setFont(FONT, "normal");
    },
    margin: { left: 15, right: 15 },
  });

  const finalY = doc.lastAutoTable.finalY + 8;

  // ─── 差引支給額 ─────────────────────────────────────────
  doc.setFont(FONT, "normal");
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.5);
  doc.rect(15, finalY, 180, 18);
  doc.setFontSize(12);
  doc.text("差引支給額", 20, finalY + 7);
  doc.setFontSize(22);
  doc.text(`${netPay.toLocaleString("ja-JP")} 円`, 190, finalY + 13, { align: "right" });

  // ─── 備考欄 ─────────────────────────────────────────────
  const remarkY = finalY + 26;
  const remarkH = 30;
  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.rect(15, remarkY, 180, remarkH);
  doc.text("備考", 17, remarkY + 5);
  // 罫線（3本）
  const lineCount = 3;
  for (let i = 1; i <= lineCount; i++) {
    const ly = remarkY + (remarkH / (lineCount + 1)) * i;
    doc.line(20, ly, 192, ly);
  }
  // 備考テキスト（入力があれば印刷）
  if (payroll.remarks) {
    doc.setFontSize(9);
    doc.setFont(FONT, "normal");
    const lines = doc.splitTextToSize(payroll.remarks, 168);
    doc.text(lines, 20, remarkY + 10);
  }

  const fileName = `${employee.name}_${payroll.yearMonth}_${payroll.isBonus ? "賞与" : "給与"}.pdf`;
  if (mode === "preview") {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    if (previewWindow) {
      previewWindow.location.href = url;
    } else {
      window.open(url, "_blank");
    }
  } else {
    doc.save(fileName);
  }
}
