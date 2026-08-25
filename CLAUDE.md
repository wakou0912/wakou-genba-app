# wakou-genba-app 開発メモ

このファイルは、クロちゃん（Claude）がこのアプリを触るときに自動で読み込む。
りょうも読んでOK。今後同じ事故・同じ手戻りをしないためのメモ。

## 必ず守ること

1. **コード変更後は `npm run dev` で実際に動かしてから push する。** ビルドが通るだけでは不十分。
2. **本番Firestore（`db/main`, `estimateBilling/main`）は本物のデータ。** ローカル開発サーバーも同じ本番Firebaseプロジェクト（`wakou-genba`）につながっている。テストのつもりで保存ボタンを押すと本番データが書き換わるので注意。テストで保存した場合は、テスト用の値だと分かるようにりょうに報告する。
3. **開発サーバー（vite）は動作確認が終わってもすぐには止めない。** りょうが並行してブラウザで見てることがあるので、止める前に一声かけるか、止めたら「止めた」と伝える。
4. **git push で認証エラーが出たら**、`gh auth setup-git` をりょうに実行してもらう（gitのcredential helperが古いトークンを掴んでいるだけで、`gh auth status` 自体は生きていることが多い）。

## デプロイの仕組み

- `git push origin main` → GitHub Actionsが自動でビルド＆デプロイ
- 本番URL: `https://wakou0912.github.io/wakou-genba-app/`
- 手動での `npm run build` は不要

## 点検集計タブ（App.jsx）の按分ロジック

現場日報1件ごとに、点検金額を「自社」「他社」の作業員に分配する仕組みが3層ある。混同しやすいので整理:

1. **点検按分（7割・3割）**: `count7`/`count3`/`count7other`/`count3other`（人数）に応じて、点検金額（管理費を除く）を 7:3 の重み付けで人数按分する。
2. **管理費按分**: 防火設備点検の管理費（電動・手動600円/台、ドア200円/台）は上記7:3の按分とは別に、`kanrihiOwn`/`kanrihiOther`（人数）で均等按分する。**未入力なら自社が全額**。
3. **防火設備点検の最低金額**: 平日日中以外（`calcMult`が「なし」以外＝夜間/日祝/日祝夜間）は、7割・3割それぞれの1人あたり金額が¥23,000未満なら¥23,000に切り上げる。管理費はこの最低金額の対象外。

この3つの計算は `calcOwnOtherSplit` / `calcKanrihiSplit` / `applyBokaMin` （App.jsx冒頭）に集約されている。点検集計タブの表示・PDF出力・編集画面のプレビューが、それぞれこのロジックを個別に再計算している箇所があるので、按分ロジックを変えるときは以下を全部揃えて直す：

- `calcOwnOtherSplit`（集計・PDFで使用）
- 編集画面の「割合計算」プレビュー（App.jsx内、EditModal内のインライン計算）
- 点検集計タブの詳細表示（InspectionSummary内のインライン計算）
- `buildRatioHtml`（PDF出力用）

## 見積・請求タブ（EstimateBilling.jsx）― データ消失事故の教訓

**2026-08-25、見積・請求データ（案件・見積・請求）が全部消える事故が発生し、Firestoreの Point-in-time recovery で復元した。**

原因: Firestoreのドキュメント読み込み時、`snap.exists()` が何らかの理由で一時的に `false` を返すと、自動で空の初期データ（`seedData()`）を書き込んで実データを上書きするコードがあった。

修正済み: `exists()` が `false` でも、Firestoreへの書き込みは一切しないように変更（表示だけ初期状態にして、警告を出す）。

**教訓・今後の方針**:
- **Firestoreへの自動書き込み（特に「存在しないなら作る」系の処理）は絶対に「配列を空にする／既存フィールドを消す」形にしない。** 存在しない場合はエラー表示に留め、実際の作成はユーザーの明示的な操作（保存ボタンなど）に任せる。
- `save()` 系の関数はローカルの `db` state をまるごと `setDoc` で上書きする設計。ローカルstateが何かの理由で不完全な状態のときに保存操作をすると、その不完全な状態がそのまま本番に書き込まれてしまう。今後この手のFirestore書き込みを新しく作るときは、この危険性を意識すること。
- 本番Firestoreで直近の状態を確認したいときは、REST APIに `readTime` パラメータを付けると数分〜十数分前のスナップショットが読める（PITRが有効なプロジェクトの場合）。事故発生時はまずこれで直前データが残っていないか確認する。

## プロトタイプがある機能は忠実に再現する

りょうがプロトタイプ（HTMLやJSXのモックアップファイルなど）を渡してきた場合、UI・機能仕様はそのプロトタイプに忠実に再実装する。勝手にデザインや挙動を簡略化・変更しない。

- 実例: 経費精算機能（`KeihiSeisan`）は2026-07-18にプロトタイプ通りに再実装した（ライトテーマUI、カテゴリ別カード、まとめて撮影→AI認識で複数レシート展開、重複検出、統計グラフなど）
- 実例: 見積・請求機能（`EstimateBilling.jsx`）も `~/Downloads/現場管理アプリ_v4.jsx` というプロトタイプから本番へ移植したもの
- プロトタイプにない仕様（指示書機能など）を新規に足す場合は、その旨を明示してから実装する

## ログイン情報

- ゲートパスワード（全員）: `Wakou850`
- 管理者パスワード: `rmhc229159`
- Firebaseプロジェクト: `wakou-genba`（本番・開発共通）

## 給与明細タブ（PayrollView.jsx）― 別Firebaseプロジェクトとの連携

2026-08-26、独立していた給与明細アプリ（`~/wako-payroll`, Next.js, Firebaseプロジェクト`kabusikigaisya-wakou`）を「🧾 給与明細」タブとして管理者タブに追加した。`見積・請求`と違い、**現場日報とは別のFirebaseプロジェクトに接続している**点に注意。

- `src/firebasePayroll.js`: `kabusikigaisya-wakou`用のセカンダリFirebaseアプリ（`initializeApp(config, "payroll")`）。`PAYROLL_OWNER_UID`にオーナー（`wakou0912@gmail.com`）のFirebase Auth UIDをハードコードしている。
- データパスは`users/{PAYROLL_OWNER_UID}/employees`と`/payrolls`（wako-payroll側と完全に同じ場所を直接読み書きしている。データのコピーではない）。
- `kabusikigaisya-wakou`側のFirestoreルールに、このUID配下だけ`allow read, write: if true;`という特例を追加済み（Firebase Authを使わず現場日報アプリの管理者ログインだけでアクセスできるようにするため）。**Firestoreルールで`true`と書くときは必ず`if true`。`if`を省略すると構文エラーになる**（この実装時にハマった）。
- 計算ロジック（`src/payrollCalc/`: calculations/insurance/tax/pdf/firestoreData）はwako-payrollのTypeScriptコードをほぼそのままJSに移植したもの。保険料率テーブルや源泉徴収税額表を更新する際は、元のwako-payroll側（`~/wako-payroll/lib/`）も両方直す必要がある（今のところ自動同期の仕組みはない）。
- PDF出力は`jspdf`+`jspdf-autotable`を新規追加して使用（他のタブはwindow.print()方式だが、給与明細は書式の正確さ重視でプロトタイプ通りjsPDF方式を踏襲）。フォント(`public/fonts/NotoSansJP-Regular.ttf`)とロゴ(`public/payroll-logo.jpg`)が必要。
- スタンドアロン版wako-payrollアプリ（Netlify）は今まで通りFirebase Authログインが必要なまま。同じデータを2つの入口（現場日報アプリのタブ／wako-payroll単体）から見に行く構成。
