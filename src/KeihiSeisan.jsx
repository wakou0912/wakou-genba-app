import { useState, useEffect, useRef } from "react";
import { firestore } from "./firebase";
import { doc, getDoc, setDoc, getDocs, collection } from "firebase/firestore";

const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY || "";

const CATEGORIES = [
  { name: "ガソリン代",   icon: "⛽" },
  { name: "三和駐車場",   icon: "🅿️" },
  { name: "その他駐車場", icon: "🚗" },
  { name: "工具代",       icon: "🔧" },
  { name: "倉庫代",       icon: "🏭" },
  { name: "その他",       icon: "📋" },
];
const CAT_COLORS = { "ガソリン代":"#FB8C00","三和駐車場":"#1E88E5","その他駐車場":"#3949AB","工具代":"#43A047","倉庫代":"#AD1457","その他":"#8E24AA" };
const STAFF_COLORS = ["#1A3A5C","#4A90D9","#66BB6A","#FFA726","#AB47BC","#EF5350","#26A69A","#8D6E63"];

const NAVY = "#1A3A5C";
const BORDER = "#D0D7E3";
const BG = "#F2F4F7";
const MUTED = "#666";
const SUB = "#AAB4C0";
const GREEN = "#2E7D32";
const ORANGE = "#E65100";
const RED = "#E53935";

function catIcon(name) { const c = CATEGORIES.find(c => c.name === name); return c ? c.icon : "📋"; }
function currentYM() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; }

function cardSubtotal(card) { return (card.receipts||[]).reduce((s,r)=>s+(parseInt(r.amount)||0),0); }
function sortByDate(receipts) { return [...receipts].sort((a,b)=>!a.date?1:!b.date?-1:a.date.localeCompare(b.date)); }
function findDupIds(card) {
  const seen={}, dupIds=new Set();
  (card.receipts||[]).forEach(r=>{
    if(!r.date||!r.amount) return;
    const k=`${r.date}_${r.amount}`;
    seen[k]?seen[k].push(String(r.id)):seen[k]=[String(r.id)];
  });
  Object.values(seen).forEach(ids=>{if(ids.length>1)ids.forEach(id=>dupIds.add(id));});
  return dupIds;
}
function fileToBase64(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
}
async function recognizeReceipt(base64,mediaType) {
  if(!CLAUDE_API_KEY) throw new Error("APIキーが未設定です");
  const resp = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":CLAUDE_API_KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({
      model:"claude-sonnet-4-6", max_tokens:1500,
      messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:mediaType,data:base64}},
        {type:"text",text:'この画像のレシートをすべて検出し、日付(YYYY-MM-DD)と合計金額(数字のみ)をJSON配列で返してください。他の文章は一切不要。フォーマット:[{"date":"YYYY-MM-DD","amount":1234}]'},
      ]}],
    }),
  });
  if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.error?.message||`API Error ${resp.status}`);}
  const data=await resp.json();
  const text=(data.content.find(b=>b.type==="text")||{}).text||"";
  const clean=text.replace(/```json|```/g,"").trim();
  const parsed=JSON.parse(clean);
  return Array.isArray(parsed)?parsed:[parsed];
}

// Firestore
function stripPhoto(cards) {
  return (cards||[]).map(c=>({...c,receipts:(c.receipts||[]).map(r=>({...r,photoDataUrl:null}))}));
}
async function fsLoad(ym,userName) {
  const snap=await getDoc(doc(firestore,"keihi",ym,"entries",userName));
  return snap.exists()?snap.data():null;
}
async function fsSave(ym,userName,cards) {
  await setDoc(doc(firestore,"keihi",ym,"entries",userName),{cards:stripPhoto(cards),status:"draft",updatedAt:new Date().toISOString(),userName});
}
async function fsSubmit(ym,userName,cards) {
  const stripped=stripPhoto(cards);
  const total=stripped.reduce((s,c)=>s+cardSubtotal(c),0);
  await setDoc(doc(firestore,"keihi",ym,"entries",userName),{cards:stripped,status:"submitted",updatedAt:new Date().toISOString(),submittedAt:new Date().toISOString(),userName,total});
}
async function fsUnlock(ym,userName) {
  const snap=await getDoc(doc(firestore,"keihi",ym,"entries",userName));
  if(!snap.exists())return;
  await setDoc(doc(firestore,"keihi",ym,"entries",userName),{...snap.data(),status:"draft"});
}
async function fsLoadMonth(ym) {
  const snap=await getDocs(collection(firestore,"keihi",ym,"entries"));
  const r={}; snap.forEach(d=>r[d.id]=d.data()); return r;
}
async function fsLoadMemo(ym) {
  const snap=await getDoc(doc(firestore,"keihi_memos",ym));
  return snap.exists()?snap.data().text||"":"";
}
async function fsSaveMemo(ym,text) {
  await setDoc(doc(firestore,"keihi_memos",ym),{text,updatedAt:new Date().toISOString()});
}

// ─── スタイルヘルパー ───
const slideUp = `@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`;
const inp = {border:`1.5px solid ${BORDER}`,borderRadius:6,padding:"6px 8px",fontSize:13,color:"#1A1A2E",background:"#F8FAFC",width:"100%",outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
const inpDis = {...inp,background:"#F2F4F7",color:"#888",borderColor:"#E0E6EF"};

// ─── ModalOverlay ───
function ModalOverlay({show,onClose,children}) {
  if(!show) return null;
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <style>{slideUp}</style>
      <div onClick={e=>e.stopPropagation()}
        style={{background:"white",width:"100%",maxWidth:680,borderRadius:"18px 18px 0 0",padding:"20px 16px 36px",animation:"slideUp 0.2s ease"}}>
        {children}
      </div>
    </div>
  );
}

// ─── CatModal ───
function CatModal({show,onClose,usedCats,onSelect}) {
  return (
    <ModalOverlay show={show} onClose={onClose}>
      <div style={{fontSize:15,fontWeight:700,color:"#1A1A2E",marginBottom:16,textAlign:"center"}}>経費の種類を選んでください</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {CATEGORIES.map(c=>{
          const used=usedCats.includes(c.name);
          return(
            <button key={c.name} onClick={()=>{if(!used){onSelect(c.name);onClose();}}}
              style={{padding:"16px 10px",border:`2px solid ${BORDER}`,borderRadius:12,background:"white",fontSize:14,fontWeight:700,color:"#1A1A2E",cursor:used?"not-allowed":"pointer",textAlign:"center",opacity:used?0.4:1,fontFamily:"inherit"}}>
              <span style={{fontSize:22,display:"block",marginBottom:5}}>{c.icon}</span>
              {c.name}
              {used&&<span style={{fontSize:10,color:RED,display:"block"}}>追加済</span>}
            </button>
          );
        })}
      </div>
      <button onClick={onClose} style={{width:"100%",marginTop:12,padding:12,border:"none",background:"#F2F4F7",borderRadius:8,fontSize:14,color:"#888",cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button>
    </ModalOverlay>
  );
}

// ─── ConfirmModal ───
function ConfirmModal({show,onClose,onConfirm,total,ym}) {
  return (
    <ModalOverlay show={show} onClose={onClose}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>📤</div>
        <div style={{fontSize:17,fontWeight:700,marginBottom:8}}>経費を提出しますか？</div>
        <div style={{fontSize:13,color:MUTED,lineHeight:1.6,marginBottom:16}}>提出後は内容を変更できません。<br/>管理者に送信されます。</div>
        <div style={{fontSize:26,fontWeight:700,color:NAVY,marginBottom:4}}>¥{total.toLocaleString()}</div>
        <div style={{fontSize:13,color:"#888",marginBottom:24}}>{ym.replace("-","年")}月分</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:13,border:"none",background:"#F2F4F7",borderRadius:8,fontSize:14,color:MUTED,cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>キャンセル</button>
          <button onClick={onConfirm} style={{flex:2,padding:13,border:"none",background:NAVY,borderRadius:8,fontSize:15,color:"white",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>提出する</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── DeleteModal ───
function DeleteModal({show,msg,onClose,onConfirm}) {
  return (
    <ModalOverlay show={show} onClose={onClose}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>削除の確認</div>
        <div style={{fontSize:13,color:MUTED,lineHeight:1.6,marginBottom:24}}>{msg}</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:13,border:"none",background:"#F2F4F7",borderRadius:8,fontSize:14,color:MUTED,cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>キャンセル</button>
          <button onClick={onConfirm} style={{flex:2,padding:13,border:"none",background:RED,borderRadius:8,fontSize:15,color:"white",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>削除する</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── AmountModal ───
function AmountModal({show,msg,onClose,onConfirm}) {
  return (
    <ModalOverlay show={show} onClose={onClose}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}}>💰</div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>金額を変更しますか？</div>
        <div style={{fontSize:13,color:MUTED,lineHeight:1.6,marginBottom:24}}>{msg}</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:13,border:"none",background:"#F2F4F7",borderRadius:8,fontSize:14,color:MUTED,cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>やめる</button>
          <button onClick={onConfirm} style={{flex:2,padding:13,border:"none",background:NAVY,borderRadius:8,fontSize:15,color:"white",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>変更する</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── PhotoModal ───
function PhotoModal({show,src,onClose}) {
  if(!show) return null;
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <button onClick={onClose} style={{position:"absolute",top:20,right:20,background:"rgba(255,255,255,0.9)",border:"none",width:36,height:36,borderRadius:"50%",fontSize:18,cursor:"pointer"}}>✕</button>
      <img src={src} alt="レシート" style={{maxWidth:"100%",maxHeight:"80vh",borderRadius:8,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}} onClick={e=>e.stopPropagation()} />
    </div>
  );
}

// ─── UnlockModal ───
function UnlockModal({show,target,onClose,onConfirm}) {
  return (
    <ModalOverlay show={show} onClose={onClose}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>🔓</div>
        <div style={{fontSize:17,fontWeight:700,marginBottom:8}}>ロックを解除しますか？</div>
        <div style={{fontSize:13,color:MUTED,lineHeight:1.6,marginBottom:24}}>解除するとスタッフが再編集できるようになります。<br/>対象：{target||""}</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:13,border:"none",background:"#F2F4F7",borderRadius:8,fontSize:14,color:MUTED,cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>キャンセル</button>
          <button onClick={onConfirm} style={{flex:2,padding:13,border:"none",background:ORANGE,borderRadius:8,fontSize:15,color:"white",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>解除する</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── Toast ───
function Toast({msg}) {
  return (
    <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#2E7D32",color:"white",padding:"10px 20px",borderRadius:20,fontSize:14,fontWeight:600,pointerEvents:"none",whiteSpace:"nowrap",zIndex:200,opacity:msg?1:0,transition:"opacity 0.3s"}}>
      {msg||"　"}
    </div>
  );
}

// ─── ReceiptRow ───
function ReceiptRow({receipt,locked,onUpdate,onDelete,onPhotoPreview}) {
  const prevAmtRef = useRef(null);
  const [pending, setPending] = useState(null); // {oldNum,newNum}

  function handleFocus(e) { prevAmtRef.current = e.target.value; }
  function handleBlur(e) {
    const oldNum = parseInt(prevAmtRef.current)||0;
    const newNum = parseInt(e.target.value)||0;
    if(oldNum>0 && oldNum!==newNum) {
      setPending({oldNum,newNum});
    } else {
      prevAmtRef.current = e.target.value;
    }
  }
  function confirmAmt() { setPending(null); onUpdate("date",receipt.date); /* force needsCheck clear */ }
  function cancelAmt() { onUpdate("amount", pending.oldNum); setPending(null); }

  return (
    <>
      <AmountModal show={!!pending} msg={pending?`¥${pending.oldNum.toLocaleString()} → ¥${pending.newNum.toLocaleString()} に変更します。よろしいですか？`:""} onClose={cancelAmt} onConfirm={confirmAmt}/>
      <div style={{display:"grid",gridTemplateColumns:"110px 1fr 90px 28px",gap:6,alignItems:"center",padding:"5px 14px",borderTop:"1px solid #F0F3F8"}}>
        <input type="date" value={receipt.date||""} onChange={e=>{onUpdate("date",e.target.value);}} disabled={locked} style={locked?inpDis:inp}/>
        <input type="text" value={receipt.memo||""} onChange={e=>onUpdate("memo",e.target.value)} disabled={locked} placeholder="報告事項" style={locked?inpDis:inp}/>
        <input type="number" value={receipt.amount||""} onChange={e=>onUpdate("amount",parseInt(e.target.value)||0)} onFocus={handleFocus} onBlur={handleBlur} disabled={locked} placeholder="0" min="0" step="10" style={{...(locked?inpDis:inp),textAlign:"right"}}/>
        {locked?<span/>:<button onClick={onDelete} style={{background:"none",border:"none",color:SUB,fontSize:15,cursor:"pointer",padding:2,borderRadius:4,lineHeight:1,textAlign:"center",fontFamily:"inherit"}}>✕</button>}
      </div>
      {receipt.needsCheck&&(
        <div style={{fontSize:11,color:ORANGE,padding:"0 14px 6px",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
          ※日付、金額確認してください
          {receipt.photoDataUrl&&<button onClick={()=>onPhotoPreview(receipt.photoDataUrl)} style={{background:"#FFE0B2",border:"none",color:ORANGE,fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>🖼 写真を見る</button>}
        </div>
      )}
    </>
  );
}

// ─── KeihiCard ───
function KeihiCard({card,locked,index,onUpdateR,onDeleteR,onAddR,onDeleteCard,onBulkCamera,onBulkDrop,onPhotoPreview}) {
  const sorted = sortByDate(card.receipts||[]);
  const sub = cardSubtotal(card);
  const dupIds = findDupIds(card);
  const [dragOver,setDragOver]=useState(false);
  function handleDrag(over){return e=>{e.preventDefault();e.stopPropagation();setDragOver(over);};}
  function handleDrop(e){
    e.preventDefault();e.stopPropagation();setDragOver(false);
    if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length)onBulkDrop(card.id,e.dataTransfer.files);
  }
  return (
    <div style={{background:"white",borderRadius:10,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",borderBottom:"1px solid #EEF1F6"}}>
        <div style={{background:"#E8EFF7",color:NAVY,fontSize:11,fontWeight:700,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{index+1}</div>
        <div style={{fontSize:14,fontWeight:700,color:NAVY,flex:1}}>{catIcon(card.category)} {card.category}</div>
        <div style={{fontSize:15,fontWeight:700,color:NAVY,whiteSpace:"nowrap"}}>¥{sub.toLocaleString()}</div>
        {!locked&&<button onClick={()=>onDeleteCard(card.id)} style={{background:"none",border:"none",color:SUB,fontSize:16,cursor:"pointer",padding:"2px 4px",borderRadius:4,lineHeight:1,flexShrink:0,fontFamily:"inherit"}}>✕</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"110px 1fr 90px 28px",gap:6,padding:"4px 14px",fontSize:10,color:SUB,fontWeight:600}}>
        <span>日付</span><span>報告事項</span><span style={{textAlign:"right"}}>金額（円）</span><span/>
      </div>
      {sorted.map(r=>(
        <div key={r.id}>
          <ReceiptRow receipt={r} locked={locked}
            onUpdate={(k,v)=>onUpdateR(card.id,r.id,k,v)}
            onDelete={()=>onDeleteR(card.id,r.id)}
            onPhotoPreview={onPhotoPreview}
          />
          {dupIds.has(String(r.id))&&(
            <div style={{fontSize:11,color:"#C62828",background:"#FFEBEE",padding:"5px 14px",margin:"0 14px 6px",borderRadius:6,fontWeight:600,border:"1px solid #FFCDD2"}}>
              ⚠️ 同じ日付・金額のレシートが他にもあります。別のレシートか確認してください
            </div>
          )}
        </div>
      ))}
      {!locked&&(
        <div style={{display:"flex",gap:8,margin:"8px 14px 12px"}}>
          <button onClick={()=>onAddR(card.id)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:9,background:"#E8F4FF",border:"1.5px dashed #4A90D9",borderRadius:8,color:"#1A6BB5",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>＋ レシートを追加</button>
          <button onClick={()=>onBulkCamera(card.id)}
            onDragEnter={handleDrag(true)} onDragOver={handleDrag(true)} onDragLeave={handleDrag(false)} onDragEnd={handleDrag(false)} onDrop={handleDrop}
            style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:9,background:dragOver?"#FFE0B2":"#FFF3E0",border:`1.5px dashed ${dragOver?ORANGE:"#FFB74D"}`,borderRadius:8,color:ORANGE,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📷 まとめて撮影(AI)<span style={{fontWeight:400,fontSize:10}}>／ドロップ可</span></button>
        </div>
      )}
    </div>
  );
}

// ─── WorkerKeihi ───
function WorkerKeihi({userName}) {
  const [ym, setYm] = useState(currentYM());
  const [cards, setCards] = useState([]);
  const [status, setStatus] = useState("draft");
  const [aiCount, setAiCount] = useState(0);
  const [catModal, setCatModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null); // {msg,onConfirm}
  const [photoSrc, setPhotoSrc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const fileRef = useRef(null);
  const bulkCardId = useRef(null);

  useEffect(()=>{ loadData(); },[ym,userName]);

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(""),2500);}

  async function loadData() {
    const data = await fsLoad(ym,userName);
    if(data){setCards(Array.isArray(data.cards)?data.cards:[]);setStatus(data.status||"draft");}
    else{setCards([]);setStatus("draft");}
    const usage=JSON.parse(localStorage.getItem("wakou_ai_usage")||"{}");
    setAiCount(usage[ym]||0);
  }
  function incAi(){const u=JSON.parse(localStorage.getItem("wakou_ai_usage")||"{}");u[ym]=(u[ym]||0)+1;localStorage.setItem("wakou_ai_usage",JSON.stringify(u));setAiCount(u[ym]);}

  async function handleSave(){
    if(status==="submitted")return;
    setSaving(true);
    try{await fsSave(ym,userName,cards);showToast("一時保存しました ✓");}
    catch(e){showToast("⚠️ 保存エラー: "+e.message);}
    finally{setSaving(false);}
  }
  async function handleSubmit(){
    setConfirmModal(false);
    try{await fsSubmit(ym,userName,cards);setStatus("submitted");showToast("提出しました ✓");}
    catch(e){showToast("⚠️ 提出エラー: "+e.message);}
  }

  function addCard(cat){
    const date=ym?`${ym}-01`:"";
    setCards(p=>[...p,{id:Date.now(),category:cat,receipts:[{id:Date.now()+1,date,memo:"",amount:0,needsCheck:false,photoDataUrl:null}]}]);
  }
  function deleteCard(cardId){
    const card=cards.find(c=>c.id===cardId);
    setDeleteModal({msg:`${catIcon(card?.category)} ${card?.category} のレシートをすべて削除しますか？`,onConfirm:()=>{setCards(p=>p.filter(c=>c.id!==cardId));setDeleteModal(null);}});
  }
  function deleteReceipt(cardId,rid){
    setDeleteModal({msg:"このレシートを削除しますか？",onConfirm:()=>{
      setCards(p=>p.map(card=>{
        if(card.id!==cardId)return card;
        if((card.receipts||[]).length<=1)return null;
        return{...card,receipts:card.receipts.filter(r=>r.id!==rid)};
      }).filter(Boolean));
      setDeleteModal(null);
    }});
  }
  function addReceipt(cardId){
    const date=ym?`${ym}-01`:"";
    setCards(p=>p.map(c=>c.id!==cardId?c:{...c,receipts:[...c.receipts,{id:Date.now(),date,memo:"",amount:0,needsCheck:false,photoDataUrl:null}]}));
  }
  function updateReceipt(cardId,rid,key,val){
    setCards(p=>p.map(c=>c.id!==cardId?c:{...c,receipts:c.receipts.map(r=>r.id!==rid?r:{...r,[key]:val,needsCheck:key==="date"?false:r.needsCheck})}));
  }

  function handleBulkCamera(cardId){bulkCardId.current=cardId;fileRef.current.value="";fileRef.current.click();}
  function handleBulkDrop(cardId,files){
    if(!files||!files.length)return;
    bulkCardId.current=cardId;
    const dt=new DataTransfer();
    Array.from(files).forEach(f=>dt.items.add(f));
    fileRef.current.files=dt.files;
    fileRef.current.dispatchEvent(new Event("change",{bubbles:true}));
  }
  async function onBulkChange(e){
    const files=Array.from(e.target.files||[]);
    if(!files.length||!bulkCardId.current)return;
    const cardId=bulkCardId.current;
    showToast(`📷 ${files.length}枚を読み取り中...`);
    const placeholders=[];
    for(const file of files){
      const rid=Date.now()+Math.random();
      const base64=await fileToBase64(file);
      const photoDataUrl=`data:${file.type};base64,${base64}`;
      setCards(p=>p.map(c=>c.id!==cardId?c:{...c,receipts:[...c.receipts,{id:rid,date:ym?`${ym}-01`:"",memo:"読み取り中...",amount:0,needsCheck:true,photoDataUrl}]}));
      placeholders.push({rid,base64,mediaType:file.type,photoDataUrl});
    }
    let found=0;
    for(const ph of placeholders){
      try{
        const results=await recognizeReceipt(ph.base64,ph.mediaType);
        incAi();
        if(!results||!results.length){
          setCards(p=>p.map(c=>c.id!==cardId?c:{...c,receipts:c.receipts.map(r=>r.id===ph.rid?{...r,memo:"⚠️読み取れませんでした（手入力して）"}:r)}));
          continue;
        }
        const newRows=results.map((res,idx)=>({id:idx===0?ph.rid:Date.now()+Math.random()+idx,date:res.date||(ym?`${ym}-01`:""),memo:"",amount:res.amount||0,needsCheck:true,photoDataUrl:ph.photoDataUrl}));
        setCards(p=>p.map(c=>{
          if(c.id!==cardId)return c;
          const idx=c.receipts.findIndex(r=>r.id===ph.rid);
          if(idx===-1)return c;
          const rs=[...c.receipts]; rs.splice(idx,1,...newRows); return{...c,receipts:rs};
        }));
        found+=newRows.length;
      }catch{
        setCards(p=>p.map(c=>c.id!==cardId?c:{...c,receipts:c.receipts.map(r=>r.id===ph.rid?{...r,memo:"⚠️読取失敗（手入力して）"}:r)}));
      }
    }
    bulkCardId.current=null;
    showToast(`✅ ${files.length}枚から${found||files.length}件読み取りました`);
  }

  const submitted=status==="submitted";
  const total=cards.reduce((s,c)=>s+cardSubtotal(c),0);
  const usedCats=cards.map(c=>c.category);

  return (
    <div style={{fontFamily:"'Hiragino Sans','Noto Sans JP',sans-serif",background:BG,minHeight:"calc(100vh - 80px)",paddingBottom:90}}>
      <style>{slideUp}</style>
      <div style={{padding:16,maxWidth:680,margin:"0 auto"}}>
        {/* 月選択 */}
        <div style={{background:"white",borderRadius:10,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
          <label style={{fontSize:13,color:MUTED,whiteSpace:"nowrap"}}>対象月</label>
          <input type="month" value={ym} onChange={e=>setYm(e.target.value)} style={{border:`1.5px solid ${BORDER}`,borderRadius:6,padding:"6px 10px",fontSize:15,color:"#1A1A2E",background:"#F8FAFC",flex:1,outline:"none",fontFamily:"inherit"}}/>
        </div>
        {submitted&&<div style={{background:"#E8F5E9",border:"1.5px solid #A5D6A7",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8,fontSize:13,color:GREEN,fontWeight:600}}>✅ この月は提出済みです。内容は変更できません。</div>}
        <div style={{background:"#EDE7F6",border:"1.5px solid #B39DDB",borderRadius:8,padding:"9px 14px",marginBottom:14,fontSize:12,color:"#5E35B1",fontWeight:600}}>
          📷 今月のAI読み取り回数：{aiCount}回
        </div>
        {/* 合計バナー */}
        <div style={{background:NAVY,color:"white",borderRadius:10,padding:"14px 18px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 2px 8px rgba(26,58,92,0.2)"}}>
          <div>
            <div style={{fontSize:13,opacity:.8}}>今月の経費合計</div>
            <div style={{fontSize:12,opacity:.6,marginTop:2}}>{cards.length}件</div>
          </div>
          <div style={{fontSize:26,fontWeight:700}}>¥{total.toLocaleString()}</div>
        </div>
        {/* カードリスト */}
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:14}}>
          {cards.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:SUB}}>
              <div style={{fontSize:36,marginBottom:10}}>🧾</div>
              <p style={{fontSize:14}}>経費がありません<br/>「経費を追加」から入力してください</p>
            </div>
          )}
          {cards.map((card,i)=>(
            <KeihiCard key={card.id} card={card} locked={submitted} index={i}
              onUpdateR={updateReceipt} onDeleteR={deleteReceipt} onAddR={addReceipt}
              onDeleteCard={deleteCard} onBulkCamera={handleBulkCamera} onBulkDrop={handleBulkDrop} onPhotoPreview={setPhotoSrc}
            />
          ))}
        </div>
        {!submitted&&(
          <button onClick={()=>setCatModal(true)} style={{width:"100%",padding:13,border:"2px dashed #B0C4D8",borderRadius:10,background:"none",color:"#4A7099",fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontFamily:"inherit"}}>
            ＋ 経費を追加
          </button>
        )}
      </div>

      {/* 固定保存バー */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"white",borderTop:"1px solid #E0E6EF",padding:"12px 16px",boxShadow:"0 -2px 8px rgba(0,0,0,0.08)",display:"flex",gap:10,zIndex:50}}>
        <button onClick={handleSave} disabled={saving||submitted} style={{flex:1,background:"#E8EFF7",color:NAVY,border:"none",borderRadius:8,padding:12,fontSize:14,fontWeight:700,cursor:(saving||submitted)?"default":"pointer",opacity:submitted?.5:1,fontFamily:"inherit"}}>
          {saving?"保存中...":"一時保存"}
        </button>
        <button onClick={()=>setConfirmModal(true)} disabled={submitted} style={{flex:2,background:submitted?"#B0B8C8":NAVY,color:"white",border:"none",borderRadius:8,padding:12,fontSize:15,fontWeight:700,cursor:submitted?"default":"pointer",fontFamily:"inherit"}}>
          {submitted?"提出済み ✓":"提出する →"}
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={onBulkChange}/>
      <CatModal show={catModal} onClose={()=>setCatModal(false)} usedCats={usedCats} onSelect={addCard}/>
      <ConfirmModal show={confirmModal} onClose={()=>setConfirmModal(false)} onConfirm={handleSubmit} total={total} ym={ym}/>
      <DeleteModal show={!!deleteModal} msg={deleteModal?.msg||""} onClose={()=>setDeleteModal(null)} onConfirm={deleteModal?.onConfirm}/>
      <PhotoModal show={!!photoSrc} src={photoSrc||""} onClose={()=>setPhotoSrc(null)}/>
      <Toast msg={toast}/>
    </div>
  );
}

// ─── 統計グラフ ───
function CatChart({entries}) {
  if(!entries.length) return <div style={{textAlign:"center",color:SUB,fontSize:13,padding:"20px 0"}}>この月の提出データがありません</div>;
  const tots={};
  entries.forEach(e=>(e.cards||[]).forEach(c=>{const s=cardSubtotal(c);tots[c.category]=(tots[c.category]||0)+s;}));
  const grand=Object.values(tots).reduce((a,b)=>a+b,0);
  return Object.entries(tots).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>{
    const pct=grand>0?Math.round(amt/grand*100):0;
    return(
      <div key={cat} style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4,color:"#444"}}>
          <span>{catIcon(cat)} {cat}</span>
          <span style={{fontWeight:700,color:NAVY}}>¥{amt.toLocaleString()}（{pct}%）</span>
        </div>
        <div style={{background:"#F0F3F8",borderRadius:6,height:10,overflow:"hidden"}}>
          <div style={{width:`${pct}%`,height:"100%",borderRadius:6,background:CAT_COLORS[cat]||"#999",transition:"width 0.3s"}}/>
        </div>
      </div>
    );
  });
}

function TrendChart({allSubs,centerYM}) {
  const [cy,cm]=centerYM.split("-").map(Number);
  const months=[]; for(let i=5;i>=0;i--){let y=cy,m=cm-i;while(m<=0){m+=12;y--;}months.push(`${y}-${String(m).padStart(2,"0")}`);}
  const tots=months.map(m=>(allSubs[m]||[]).filter(e=>e.status==="submitted").reduce((s,e)=>s+(e.total||0),0));
  const maxV=Math.max(...tots,1);
  const w=320,h=140,pL=36,pB=24,pT=10,pR=10,cW=w-pL-pR,cH=h-pT-pB,bW=cW/months.length*.6,gap=cW/months.length;
  let bars="",labels="";
  months.forEach((m,i)=>{
    const v=tots[i],bH=maxV>0?(v/maxV)*cH:0,x=pL+i*gap+(gap-bW)/2,y=pT+cH-bH,isC=m===centerYM;
    const bFill=isC?"#1A3A5C":"#B0C4D8";
    bars+=`<rect x="${x}" y="${y}" width="${bW}" height="${bH}" rx="3" fill="${bFill}"/>`;
    if(v>0)bars+=`<text x="${x+bW/2}" y="${y-4}" font-size="9" fill="#555" text-anchor="middle">¥${Math.round(v/1000)}k</text>`;
    labels+=`<text x="${x+bW/2}" y="${h-6}" font-size="9" fill="#888" text-anchor="middle">${parseInt(m.split("-")[1])}月</text>`;
  });
  return <div style={{overflowX:"auto"}}><svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} dangerouslySetInnerHTML={{__html:`<line x1="${pL}" y1="${pT+cH}" x2="${w-pR}" y2="${pT+cH}" stroke="#E0E6EF" stroke-width="1"/>${bars}${labels}`}}/></div>;
}

function YearChart({allSubs,centerYM}) {
  const cY=parseInt(centerYM.split("-")[0]);
  const years=[]; for(let i=4;i>=0;i--)years.push(cY-i);
  const tots=years.map(y=>{let t=0;Object.entries(allSubs).forEach(([m,arr])=>{if(parseInt(m.split("-")[0])===y)(arr||[]).filter(e=>e.status==="submitted").forEach(e=>{t+=e.total||0;});});return t;});
  const maxV=Math.max(...tots,1);
  const w=320,h=150,pL=44,pB=26,pT=14,pR=10,cW=w-pL-pR,cH=h-pT-pB,bW=cW/years.length*.55,gap=cW/years.length;
  let bars="",labels="";
  years.forEach((y,i)=>{
    const v=tots[i],bH=maxV>0?(v/maxV)*cH:0,x=pL+i*gap+(gap-bW)/2,yP=pT+cH-bH,isC=y===cY;
    const yFill=isC?"#1A3A5C":"#B0C4D8";
    bars+=`<rect x="${x}" y="${yP}" width="${bW}" height="${bH}" rx="4" fill="${yFill}"/>`;
    if(v>0)bars+=`<text x="${x+bW/2}" y="${yP-5}" font-size="10" fill="#555" text-anchor="middle">¥${Math.round(v/1000)}k</text>`;
    labels+=`<text x="${x+bW/2}" y="${h-8}" font-size="11" fill="#888" text-anchor="middle">${y}年</text>`;
  });
  return <div style={{overflowX:"auto"}}><svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} dangerouslySetInnerHTML={{__html:`<line x1="${pL}" y1="${pT+cH}" x2="${w-pR}" y2="${pT+cH}" stroke="#E0E6EF" stroke-width="1"/>${bars}${labels}`}}/></div>;
}

function CrossTab({allSubs,centerYM}) {
  const [range,setRange]=useState(1);
  const [cy,cm]=centerYM.split("-").map(Number);
  const monthKeys=[]; for(let i=range-1;i>=0;i--){let y=cy,m=cm-i;while(m<=0){m+=12;y--;}monthKeys.push(`${y}-${String(m).padStart(2,"0")}`);}
  const entries=monthKeys.flatMap(m=>(allSubs[m]||[]).filter(e=>e.status==="submitted"));
  const allCats=CATEGORIES.map(c=>c.name);
  const usedCats=allCats.filter(cat=>entries.some(e=>(e.cards||[]).some(c=>c.category===cat)));
  const sCT={},sT={},cGT={};
  usedCats.forEach(c=>cGT[c]=0);
  let grand=0;
  entries.forEach(e=>{
    const n=e.userName;
    if(!sCT[n]){sCT[n]={};usedCats.forEach(c=>sCT[n][c]=0);}
    if(!sT[n])sT[n]=0;
    (e.cards||[]).forEach(c=>{const s=cardSubtotal(c);sCT[n][c.category]=(sCT[n][c.category]||0)+s;sT[n]+=s;cGT[c.category]=(cGT[c.category]||0)+s;grand+=s;});
  });
  const staffs=Object.keys(sT).sort((a,b)=>sT[b]-sT[a]);
  if(!entries.length) return <div style={{textAlign:"center",color:SUB,fontSize:13,padding:"20px 0"}}>この期間の提出データがありません</div>;

  // 積み上げ棒グラフ
  const maxV=Math.max(...Object.values(cGT),1);
  const bAW=60,cHg=180,pT=16,pB=34,pL2=10,pR2=10,iH=cHg-pT-pB,svgW=pL2+pR2+usedCats.length*bAW;
  let chartBars="";
  usedCats.forEach((cat,ci)=>{
    const x=pL2+ci*bAW,bW=bAW*.6,bx=x+(bAW-bW)/2;
    let yC=pT+iH;
    staffs.forEach((n,si)=>{
      const amt=(sCT[n]&&sCT[n][cat])||0;
      if(amt<=0)return;
      const sH=(amt/maxV)*iH;yC-=sH;
      chartBars+=`<rect x="${bx}" y="${yC}" width="${bW}" height="${sH}" fill="${STAFF_COLORS[si%STAFF_COLORS.length]}"><title>${n}: ¥${amt.toLocaleString()}</title></rect>`;
    });
    const t=cGT[cat]||0;
    if(t>0){const tY=pT+iH-(t/maxV)*iH;chartBars+=`<text x="${bx+bW/2}" y="${tY-4}" font-size="9" fill="#555" text-anchor="middle">¥${Math.round(t/1000)}k</text>`;}
    chartBars+=`<text x="${bx+bW/2}" y="${cHg-pB+16}" font-size="9" fill="#888" text-anchor="middle">${catIcon(cat)}</text>`;
    chartBars+=`<text x="${bx+bW/2}" y="${cHg-pB+28}" font-size="8" fill="#888" text-anchor="middle">${cat.length>5?cat.slice(0,5):cat}</text>`;
  });

  return(
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <select value={range} onChange={e=>setRange(Number(e.target.value))} style={{border:`1.5px solid ${BORDER}`,borderRadius:6,padding:"6px 8px",fontSize:12,color:NAVY,background:"#F8FAFC",fontWeight:600,fontFamily:"inherit"}}>
          <option value={1}>直近1ヶ月</option><option value={2}>直近2ヶ月</option><option value={3}>直近3ヶ月</option><option value={6}>直近6ヶ月</option><option value={12}>直近1年</option>
        </select>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:12,whiteSpace:"nowrap"}}>
          <thead><tr>
            <th style={{textAlign:"left",color:"#5A7A9A",padding:"8px 10px",borderBottom:"2px solid #E0E6EF",background:"#F5F8FC",position:"sticky",left:0,zIndex:1}}>スタッフ</th>
            <th style={{textAlign:"right",color:"#5A7A9A",padding:"8px 10px",borderBottom:"2px solid #E0E6EF",background:"#F5F8FC"}}>合計</th>
            {usedCats.map(c=><th key={c} style={{textAlign:"right",color:"#5A7A9A",padding:"8px 10px",borderBottom:"2px solid #E0E6EF",background:"#F5F8FC"}}>{catIcon(c)} {c}</th>)}
          </tr></thead>
          <tbody>
            {staffs.map(n=><tr key={n}>
              <td style={{textAlign:"left",padding:"8px 10px",borderBottom:"1px solid #F0F3F8",position:"sticky",left:0,background:"white",zIndex:1}}>👤 {n}</td>
              <td style={{textAlign:"right",fontWeight:700,color:NAVY,padding:"8px 10px",borderBottom:"1px solid #F0F3F8"}}>¥{sT[n].toLocaleString()}</td>
              {usedCats.map(c=><td key={c} style={{textAlign:"right",padding:"8px 10px",borderBottom:"1px solid #F0F3F8"}}>¥{(sCT[n][c]||0).toLocaleString()}</td>)}
            </tr>)}
            <tr style={{fontWeight:700,background:"#EEF3FA"}}>
              <td style={{padding:"8px 10px",position:"sticky",left:0,background:"#EEF3FA",zIndex:1}}>合計</td>
              <td style={{textAlign:"right",fontWeight:700,color:NAVY,padding:"8px 10px"}}>¥{grand.toLocaleString()}</td>
              {usedCats.map(c=><td key={c} style={{textAlign:"right",padding:"8px 10px"}}>¥{cGT[c].toLocaleString()}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {usedCats.length>0&&(
        <div style={{marginTop:18,paddingTop:16,borderTop:"1px solid #F0F3F8"}}>
          <div style={{overflowX:"auto"}}><svg width={svgW} height={cHg} viewBox={`0 0 ${svgW} ${cHg}`} dangerouslySetInnerHTML={{__html:`<line x1="${pL2}" y1="${pT+iH}" x2="${svgW-pR2}" y2="${pT+iH}" stroke="#E0E6EF" stroke-width="1"/>${chartBars}`}}/></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"10px 16px",marginTop:10}}>
            {staffs.map((n,i)=><div key={n} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#555"}}><span style={{width:10,height:10,borderRadius:3,display:"inline-block",background:STAFF_COLORS[i%STAFF_COLORS.length]}}/>{n}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SubmissionCard（管理者用）───
function SubmissionCard({entry,onUnlock}) {
  const [open,setOpen]=useState(false);
  const total=(entry.cards||[]).reduce((s,c)=>s+cardSubtotal(c),0);
  const at=entry.submittedAt?new Date(entry.submittedAt):null;
  const atStr=at?`${at.getMonth()+1}/${at.getDate()} ${at.getHours()}:${String(at.getMinutes()).padStart(2,"0")} 提出`:"";
  return(
    <div style={{background:"white",borderRadius:10,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",marginBottom:12,overflow:"hidden"}}>
      <div onClick={()=>setOpen(p=>!p)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:open?"1px solid #EEF1F6":"none",cursor:"pointer"}}>
        <div>
          <div style={{fontSize:15,fontWeight:700}}>👤 {entry.userName}</div>
          <div style={{fontSize:11,color:SUB,marginTop:2}}>{atStr}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:18,fontWeight:700,color:NAVY}}>¥{total.toLocaleString()}</div>
          <span style={{fontSize:11,color:SUB,display:"inline-block",transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
        </div>
      </div>
      {open&&(
        <div>
          <div style={{padding:"12px 16px"}}>
            {(entry.cards||[]).map(card=>{
              const sub=cardSubtotal(card);
              return(
                <div key={card.id} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:700,color:NAVY,padding:"4px 0",borderBottom:"1.5px solid #E8EFF7",marginBottom:4}}>
                    <span>{catIcon(card.category)} {card.category}</span><span>¥{sub.toLocaleString()}</span>
                  </div>
                  {(card.receipts||[]).map(r=>(
                    <div key={r.id} style={{display:"grid",gridTemplateColumns:"90px 1fr 80px",gap:8,fontSize:12,color:"#555",padding:"4px",alignItems:"center"}}>
                      <span style={{color:"#888"}}>{r.date||"(日付未入力)"}</span>
                      <span style={{wordBreak:"break-word"}}>{r.memo||<span style={{color:"#CCC"}}>（報告事項なし）</span>}</span>
                      <span style={{textAlign:"right",fontWeight:600,color:NAVY}}>¥{(parseInt(r.amount)||0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div style={{padding:"10px 16px 14px",display:"flex",justifyContent:"flex-end"}}>
            <button onClick={onUnlock} style={{background:"#FFF3E0",color:ORANGE,border:"1.5px solid #FFCC80",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🔓 ロックを解除する</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AdminKeihi ───
function AdminKeihi() {
  const [ym, setYm]=useState(currentYM());
  const [statsYm, setStatsYm]=useState(currentYM());
  const [entries, setEntries]=useState({});
  const [allSubs, setAllSubs]=useState({});
  const [loading, setLoading]=useState(false);
  const [tab, setTab]=useState("list");
  const [unlockTarget, setUnlockTarget]=useState(null);
  const [toast, setToast]=useState("");
  const [memo, setMemo]=useState("");
  const [memoStatus, setMemoStatus]=useState("");
  const memoTimer=useRef(null);

  useEffect(()=>{loadEntries();},[ym]);
  useEffect(()=>{if(tab==="stats")loadStats();},[tab,statsYm]);

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(""),2500);}

  async function loadEntries(){
    setLoading(true);
    try{setEntries(await fsLoadMonth(ym));}finally{setLoading(false);}
  }
  async function loadStats(){
    setLoading(true);
    try{
      const [cy,cm]=statsYm.split("-").map(Number);
      const months=[]; for(let i=11;i>=0;i--){let y=cy,m=cm-i;while(m<=0){m+=12;y--;}months.push(`${y}-${String(m).padStart(2,"0")}`);}
      const results=await Promise.all(months.map(async m=>{
        const snap=await getDocs(collection(firestore,"keihi",m,"entries"));
        const arr=[]; snap.forEach(d=>arr.push(d.data())); return [m,arr];
      }));
      const combined={}; results.forEach(([m,arr])=>combined[m]=arr);
      setAllSubs(combined);
      setMemo(await fsLoadMemo(statsYm));
      setMemoStatus("");
    }finally{setLoading(false);}
  }
  async function handleUnlock(){
    if(!unlockTarget)return;
    await fsUnlock(unlockTarget.ym,unlockTarget.userName);
    setUnlockTarget(null);showToast("ロックを解除しました");loadEntries();
  }
  function onMemoInput(e){
    const text=e.target.value; setMemo(text); setMemoStatus("入力中...");
    clearTimeout(memoTimer.current);
    memoTimer.current=setTimeout(async()=>{await fsSaveMemo(statsYm,text);setMemoStatus("✓ 保存しました");},600);
  }

  const subEntries=Object.values(entries).filter(e=>e.status==="submitted");
  const grand=subEntries.reduce((s,e)=>s+(e.total||0),0);

  return(
    <div style={{fontFamily:"'Hiragino Sans','Noto Sans JP',sans-serif",background:BG,minHeight:"calc(100vh - 80px)"}}>
      <style>{slideUp}</style>
      <div style={{padding:16,maxWidth:680,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <h2 style={{fontSize:15,fontWeight:700,margin:0}}>📊 経費精算 管理</h2>
        </div>
        {/* サブタブ */}
        <div style={{display:"flex",gap:6,marginBottom:14,background:"#E8EFF7",borderRadius:10,padding:4}}>
          {[["list","提出一覧"],["stats","統計"]].map(([k,l])=>(
            <div key={k} onClick={()=>setTab(k)} style={{flex:1,textAlign:"center",padding:9,fontSize:13,fontWeight:700,color:tab===k?"white":"#5A7A9A",borderRadius:8,cursor:"pointer",background:tab===k?NAVY:"transparent"}}>
              {l}
            </div>
          ))}
        </div>

        {/* ─ 提出一覧 ─ */}
        {tab==="list"&&(
          <>
            <div style={{background:"white",borderRadius:10,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
              <label style={{fontSize:13,color:MUTED,whiteSpace:"nowrap"}}>対象月</label>
              <input type="month" value={ym} onChange={e=>setYm(e.target.value)} style={{border:`1.5px solid ${BORDER}`,borderRadius:6,padding:"6px 10px",fontSize:15,color:"#1A1A2E",background:"#F8FAFC",flex:1,outline:"none",fontFamily:"inherit"}}/>
            </div>
            {subEntries.length>0&&(
              <div style={{background:NAVY,color:"white",borderRadius:10,padding:"14px 18px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 2px 8px rgba(26,58,92,0.2)"}}>
                <div><div style={{fontSize:13,opacity:.8}}>提出済み合計</div><div style={{fontSize:12,opacity:.6}}>{subEntries.length}件の提出</div></div>
                <div style={{fontSize:26,fontWeight:700}}>¥{grand.toLocaleString()}</div>
              </div>
            )}
            {loading&&<div style={{textAlign:"center",padding:40,color:SUB}}>読み込み中...</div>}
            {!loading&&Object.keys(entries).length===0&&(
              <div style={{textAlign:"center",padding:"40px 20px",color:SUB}}>
                <div style={{fontSize:36,marginBottom:10}}>📭</div>
                <p>{ym.replace("-","年")}月の提出はまだありません</p>
              </div>
            )}
            {!loading&&Object.entries(entries).map(([uname,entry])=>(
              <SubmissionCard key={uname} entry={entry}
                onUnlock={()=>setUnlockTarget({ym,userName:uname,label:`${ym.replace("-","年")}月分 / ${uname}`})}
              />
            ))}
          </>
        )}

        {/* ─ 統計 ─ */}
        {tab==="stats"&&(
          <>
            <div style={{background:"white",borderRadius:10,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
              <label style={{fontSize:13,color:MUTED,whiteSpace:"nowrap"}}>対象月</label>
              <input type="month" value={statsYm} onChange={e=>setStatsYm(e.target.value)} style={{border:`1.5px solid ${BORDER}`,borderRadius:6,padding:"6px 10px",fontSize:15,color:"#1A1A2E",background:"#F8FAFC",flex:1,outline:"none",fontFamily:"inherit"}}/>
            </div>
            {loading&&<div style={{textAlign:"center",padding:40,color:SUB}}>読み込み中...</div>}
            {!loading&&<>
              {/* メモ */}
              <div style={{background:"white",borderRadius:10,padding:16,marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:14}}>📝 この月のメモ</div>
                <textarea value={memo} onChange={onMemoInput} placeholder="例：今月は工具代が多め。" style={{width:"100%",minHeight:80,border:`1.5px solid ${BORDER}`,borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1A1A2E",background:"#F8FAFC",resize:"vertical",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                <div style={{fontSize:11,color:memoStatus.includes("✓")?GREEN:"#A0A8B8",marginTop:6,textAlign:"right",minHeight:14}}>{memoStatus}</div>
              </div>
              {/* カテゴリ別 */}
              <div style={{background:"white",borderRadius:10,padding:16,marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:14}}>🏷️ カテゴリ別合計（全スタッフ）</div>
                <CatChart entries={(allSubs[statsYm]||[]).filter(e=>e.status==="submitted")}/>
              </div>
              {/* 月次推移 */}
              <div style={{background:"white",borderRadius:10,padding:16,marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:14}}>📈 月ごとの推移（直近6ヶ月）</div>
                <TrendChart allSubs={allSubs} centerYM={statsYm}/>
              </div>
              {/* 年次推移 */}
              <div style={{background:"white",borderRadius:10,padding:16,marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:14}}>📅 年ごとの推移</div>
                <YearChart allSubs={allSubs} centerYM={statsYm}/>
              </div>
              {/* 集計表 */}
              <div style={{background:"white",borderRadius:10,padding:16,marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:14}}>📋 スタッフ × カテゴリ 集計表</div>
                <CrossTab allSubs={allSubs} centerYM={statsYm}/>
              </div>
            </>}
          </>
        )}
      </div>

      <UnlockModal show={!!unlockTarget} target={unlockTarget?.label} onClose={()=>setUnlockTarget(null)} onConfirm={handleUnlock}/>
      <Toast msg={toast}/>
    </div>
  );
}

export default function KeihiSeisan({userName,isAdmin}) {
  if(isAdmin) return <AdminKeihi/>;
  return <WorkerKeihi userName={userName}/>;
}
