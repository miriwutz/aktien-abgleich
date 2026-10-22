import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
 apiKey: "AIzaSyDgCVWVi77TfmW8U-_r9tk1qMYQGL_iJx4",

  authDomain: "aktien-abgleich.firebaseapp.com",

  projectId: "aktien-abgleich",

  storageBucket: "aktien-abgleich.firebasestorage.app",

  messagingSenderId: "1042057620402",

  appId: "1:1042057620402:web:8ce592c1f5c745f9aad2ab"

};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const sectors = ["Informationstechnologie","Finanzwesen","Nicht-Basiskonsumgüter","Gesundheitswesen","Industrie","Kommunikation","Basiskonsumgüter","Grundstoffe","Energie","Versorger","Immobilien"];
let stocks = [], messages = [], editingId = null, stopStocks = null, stopMessages = null;
let seenMessageIds = new Set();
const thanks = ["Danke, dass du deine Gedanken mit einbringst.","Danke für deine wertvolle Eingabe.","Schön, dass du dein Wissen teilst.","Danke fürs gemeinsame Weiterdenken."];

function safeText(tag, text, cls="") { const el=document.createElement(tag); el.textContent=text ?? ""; if(cls) el.className=cls; return el; }
function showToast(text) { const t=$("toast"); t.textContent=text; t.classList.remove("hidden"); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>t.classList.add("hidden"),3500); }
function money(value) { const n=Number(value); return Number.isFinite(n) ? new Intl.NumberFormat("de-AT",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(n) : "–"; }
function percent(value, base) { const a=Number(value), b=Number(base); return b>0 ? `${(a/b*100).toFixed(1).replace(".",",")} %` : "–"; }
function dateText(s) { if(!s) return "Datum unbekannt"; const d=s.toDate ? s.toDate() : new Date(s); return Number.isNaN(d.getTime()) ? "Datum unbekannt" : d.toLocaleString("de-AT"); }
function currentUserName() { return auth.currentUser?.email || "Angemeldet"; }

$("filterSector").innerHTML = '<option value="">Alle Branchen</option>' + sectors.map(s=>`<option value="${s.replaceAll("&","&amp;").replaceAll('"',"&quot;")}">${s}</option>`).join("");
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("loginError").textContent="";
  try { await signInWithEmailAndPassword(auth,$("loginEmail").value.trim(),$("loginPassword").value); }
  catch(err) { $("loginError").textContent = err.code ? `Anmeldung fehlgeschlagen (${err.code}). Bitte E-Mail und Passwort prüfen.` : "Anmeldung fehlgeschlagen."; }
});
$("signOutButton").addEventListener("click",()=>signOut(auth));
function setView(view) {
  $("stocksView").classList.toggle("hidden",view!=="stocks");
  $("messagesView").classList.toggle("hidden",view!=="messages");
  $("showStocksButton").classList.toggle("primary",view==="stocks");
  $("showStocksButton").classList.toggle("secondary",view!=="stocks");
  $("showMessagesButton").classList.toggle("primary",view==="messages");
  $("showMessagesButton").classList.toggle("secondary",view!=="messages");
}
$("showStocksButton").addEventListener("click",()=>setView("stocks"));
$("showMessagesButton").addEventListener("click",()=>setView("messages"));
$("backToStocks").addEventListener("click",()=>setView("stocks"));

function updateForecastPreview() {
  const ist=Number($("currentValue").value), low=Number($("forecastLow").value), high=Number($("forecastHigh").value);
  $("forecastPreview").textContent = ist>0 && $("forecastLow").value!=="" && $("forecastHigh").value!=="" ?
    `Prognose relativ zum IST-Wert: ${percent(low,ist)} bis ${percent(high,ist)}` : "Prognose relativ zum IST-Wert: –";
}
["currentValue","forecastLow","forecastHigh"].forEach(id=>$(id).addEventListener("input",updateForecastPreview));
$("noDividend").addEventListener("change",()=>{ $("dividend").disabled=$("noDividend").checked; if($("noDividend").checked) $("dividend").value=""; });
function getSources() {
  return [1,2].map(i=>({title:$(`sourceTitle${i}`).value.trim(),url:$(`sourceUrl${i}`).value.trim()})).filter(s=>s.url);
}
function clearStockForm() {
  $("stockForm").reset(); $("creator").value="Billy"; $("dividend").disabled=false; editingId=null;
  $("saveStockButton").textContent="Aktie speichern"; $("cancelEditButton").classList.add("hidden"); updateForecastPreview();
}
$("cancelEditButton").addEventListener("click",clearStockForm);
$("stockForm").addEventListener("submit",async e=>{
  e.preventDefault(); if(!auth.currentUser) return;
  const low=Number($("forecastLow").value), high=Number($("forecastHigh").value);
  if(high<low) { $("stockStatus").textContent="Der obere Prognosewert muss mindestens so hoch wie der untere sein."; return; }
  const payload={
    creator:$("creator").value, name:$("stockName").value.trim(), sector:$("sector").value,
    fairValue:Number($("fairValue").value), currentValue:Number($("currentValue").value),
    forecastLow:low, forecastHigh:high, dividend:$("noDividend").checked ? null : ($("dividend").value==="" ? null : Number($("dividend").value)),
    noDividend:$("noDividend").checked, importance:$("importance").value, sources:getSources(),
    updatedAt:serverTimestamp()
  };
  try {
    if(editingId) await updateDoc(doc(db,"stocks",editingId),payload);
    else await addDoc(collection(db,"stocks"),{...payload,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});
    $("stockStatus").textContent=thanks[Math.floor(Math.random()*thanks.length)]; clearStockForm();
  } catch(err) { $("stockStatus").textContent=`Speichern fehlgeschlagen: ${err.code || err.message}`; }
});
function startEdit(stock) {
  editingId=stock.id;
  $("creator").value=stock.creator||"Billy"; $("stockName").value=stock.name||""; $("sector").value=stock.sector||sectors[0];
  $("fairValue").value=stock.fairValue??""; $("currentValue").value=stock.currentValue??"";
  $("forecastLow").value=stock.forecastLow??""; $("forecastHigh").value=stock.forecastHigh??"";
  $("noDividend").checked=Boolean(stock.noDividend); $("dividend").disabled=$("noDividend").checked; $("dividend").value=stock.dividend??"";
  $("importance").value=stock.importance||"Normal";
  [1,2].forEach((i)=>{const s=(stock.sources||[])[i-1]||{}; $(`sourceTitle${i}`).value=s.title||""; $(`sourceUrl${i}`).value=s.url||"";});
  $("saveStockButton").textContent="Änderungen speichern"; $("cancelEditButton").classList.remove("hidden"); updateForecastPreview(); window.scrollTo({top:0,behavior:"smooth"});
}
function renderStocks() {
  const q=$("searchStocks").value.trim().toLocaleLowerCase("de"), sector=$("filterSector").value, sort=$("sortStocks").value;
  let list=stocks.filter(s=>(!q||(s.name||"").toLocaleLowerCase("de").includes(q))&&(!sector||s.sector===sector));
  list.sort((a,b)=>{
    if(sort==="sector") return (a.sector||"").localeCompare(b.sector||"");
    if(sort==="creator") return (a.creator||"").localeCompare(b.creator||"");
    if(sort==="name") return (a.name||"").localeCompare(b.name||"");
    const da=a.createdAt?.toMillis?.()||0, dbb=b.createdAt?.toMillis?.()||0;
    return sort==="oldest"?da-dbb:dbb-da;
  });
  const root=$("stockList"); root.replaceChildren();
  if(!list.length) { root.append(safeText("p","Keine passenden Aktien gefunden.","muted")); return; }
  list.forEach(s=>{
    const card=safeText("article","","stock-card "+(s.creator||"").toLowerCase()+(s.importance==="Sehr wichtig"?" very-important":""));
    card.append(safeText("h3",s.name||"Ohne Namen"));
    const meta=safeText("div","","card-meta"); meta.append(safeText("span",s.creator||"Unbekannt","pill"),safeText("span",s.sector||"Keine Branche","pill"));
    if(s.importance==="Sehr wichtig") meta.append(safeText("span","SEHR WICHTIG","pill gold"));
    else if(s.importance==="Wichtig") meta.append(safeText("span","Wichtig","pill"));
    card.append(meta);
    const metrics=safeText("div","","card-details");
    [[ "Fairer Wert",money(s.fairValue) ],["IST-Wert",money(s.currentValue)],["Prognose VK",`${money(s.forecastLow)} – ${money(s.forecastHigh)}`],["Prognose relativ zum IST",`${percent(s.forecastLow,s.currentValue)} – ${percent(s.forecastHigh,s.currentValue)}`],["Dividende",s.noDividend?"Keine Dividende":money(s.dividend)],["Eingetragen",dateText(s.createdAt)]].forEach(([k,v])=>{const m=safeText("div","","metric");m.append(safeText("small",k),safeText("strong",v));metrics.append(m);});
    card.append(metrics);
    if((s.sources||[]).length) { const links=safeText("div","","source-links"); s.sources.forEach(src=>{try{const u=new URL(src.url); if(!["http:","https:"].includes(u.protocol)) return; const a=safeText("a",src.title||u.hostname); a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";links.append(a);}catch{}});card.append(links); }
    const actions=safeText("div","","card-actions");
    const edit=safeText("button","Bearbeiten","button secondary"); edit.type="button"; edit.addEventListener("click",()=>startEdit(s));
    const del=safeText("button","Löschen","button secondary"); del.type="button"; del.addEventListener("click",async()=>{if(confirm(`„${s.name}“ wirklich löschen?`)){try{await deleteDoc(doc(db,"stocks",s.id));showToast("Aktie gelöscht.");}catch(err){showToast("Löschen fehlgeschlagen: "+(err.code||err.message));}}});
    actions.append(edit,del);card.append(actions);root.append(card);
  });
}
["searchStocks","filterSector","sortStocks"].forEach(id=>$(id).addEventListener(id==="searchStocks"?"input":"change",renderStocks));

function showMessagePopup(message) {
  const popup=$("messagePopup"); popup.classList.toggle("important",Boolean(message.important)); popup.classList.remove("hidden"); popup.replaceChildren();
  popup.append(safeText("strong",message.important?"WICHTIGE PINNWAND-NACHRICHT":"Neue Pinnwand-Nachricht"));
  popup.append(safeText("div",message.text||"Du hast eine neue Nachricht."));
  const btn=safeText("button","Pinnwand öffnen"); btn.type="button";btn.addEventListener("click",()=>{setView("messages");popup.classList.add("hidden");});popup.append(btn);
  clearTimeout(window.popupTimer);window.popupTimer=setTimeout(()=>popup.classList.add("hidden"),message.important?10000:6500);
}
let audioCtx;
async function playNotificationSound() {
  try {
    const volume=Math.max(0,Math.min(200,Number($("soundVolume").value)||0))/100;
    localStorage.setItem("notificationVolume",String($("soundVolume").value));
    if(volume<=0) return;
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx) return;
    audioCtx=audioCtx||new Ctx();if(audioCtx.state==="suspended") await audioCtx.resume();
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),now=audioCtx.currentTime;
    osc.type="sine";osc.frequency.setValueAtTime(880,now);osc.frequency.exponentialRampToValueAtTime(1320,now+.12);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.min(.95,.58*Math.pow(volume,.72)),now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+.42);
    osc.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+.44);
  } catch(e) { console.warn("Ton konnte nicht abgespielt werden",e); }
}
const savedVolume=localStorage.getItem("notificationVolume");if(savedVolume!==null)$("soundVolume").value=savedVolume;
function updateVolumeLabel(){$("volumeValue").textContent=$("soundVolume").value+"%";localStorage.setItem("notificationVolume",$("soundVolume").value);}
$("soundVolume").addEventListener("input",updateVolumeLabel);updateVolumeLabel();
$("testSoundButton").addEventListener("click",playNotificationSound);
$("messageForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!auth.currentUser)return;
  const text=$("messageText").value.trim();if(!text)return;
  try { await addDoc(collection(db,"messages"),{text,important:$("messageImportant").checked,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid,author:currentUserName()});
    $("messageText").value="";$("messageImportant").checked=false;$("messageStatus").textContent="Nachricht wurde an die Pinnwand geheftet."; }
  catch(err){$("messageStatus").textContent=`Senden fehlgeschlagen (${err.code||err.message}). Bitte Firestore-Regeln prüfen.`;}
});
function renderMessages() {
  const root=$("messageList");root.replaceChildren();$("messageCount").textContent=String(messages.length);
  if(!messages.length){root.append(safeText("p","Noch keine Nachrichten.","muted"));return;}
  [...messages].sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)).forEach(m=>{
    const card=safeText("article","","message-card"+(m.important?" important":""));
    if(m.important)card.append(safeText("span","WICHTIG","important-badge"));
    card.append(safeText("p",m.text||""));
    card.append(safeText("p",`${m.author||"Mitglied"} · ${dateText(m.createdAt)}`,"muted"));
    const del=safeText("button","Nachricht löschen","button secondary");del.type="button";del.addEventListener("click",async()=>{if(confirm("Diese Nachricht löschen?")){try{await deleteDoc(doc(db,"messages",m.id));}catch(err){showToast("Löschen fehlgeschlagen: "+(err.code||err.message));}}});
    const actions=safeText("div","","card-actions");actions.append(del);card.append(actions);root.append(card);
  });
}
function stopListeners(){if(stopStocks)stopStocks();if(stopMessages)stopMessages();stopStocks=stopMessages=null;}
onAuthStateChanged(auth,user=>{
  stopListeners();
  $("loginPanel").classList.toggle("hidden",Boolean(user));$("appPanel").classList.toggle("hidden",!user);$("signOutButton").classList.toggle("hidden",!user);
  if(!user){stocks=[];messages=[];return;}
  stopStocks=onSnapshot(query(collection(db,"stocks"),orderBy("createdAt","desc")),snap=>{stocks=snap.docs.map(d=>({id:d.id,...d.data()}));renderStocks();},err=>showToast("Aktien konnten nicht geladen werden: "+(err.code||err.message)));
  stopMessages=onSnapshot(query(collection(db,"messages"),orderBy("createdAt","desc")),snap=>{
    const next=snap.docs.map(d=>({id:d.id,...d.data()}));
    next.forEach(m=>{if(!seenMessageIds.has(m.id)){if(seenMessageIds.size>0&&m.createdBy!==user.uid){playNotificationSound();showMessagePopup(m);}seenMessageIds.add(m.id);}});
    messages=next;renderMessages();
  },err=>showToast("Pinnwand konnte nicht geladen werden: "+(err.code||err.message)));
});
