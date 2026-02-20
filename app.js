// Yazboz • Tekli Motor (v5-single)
// Kurallar: En düşük toplam kazanır. Ceza +101, Kafa -101.
// Siler/Okey/Elden/Cift = el biter; bitiren taş yazmaz. El bitince diğerleri taş yazar, sonra otomatik yeni el (1. oyuncudan).

const NAMES_POOL = ["Ahmet","Halitcan","Kübra","Zekos","Mert","Elif","Bora","Sude","Emre","Aybike"];

const $ = (id)=>document.getElementById(id);

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(()=>t.classList.remove("on"), 1600);
}
function shuffle(arr){ return [...arr].sort(()=>Math.random()-0.5); }

let S = {
  names: shuffle(NAMES_POOL).slice(0,4),
  hands: [],
  focus: {hand:0, p:0},
  history: [],
  sheetCtx: null, // {hand, p, allowWhenFinished:boolean}
};

function newPlayer(){
  return {
    tas: null,
    ceza: false,
    kafa: false,
    finisher: null, // 'siler'|'okey'|'elden'|'cift'
    lockTas: false,
  };
}
function newHand(){
  return {
    players: Array.from({length:4}, ()=>newPlayer()),
    override800: null,      // p index or null
    overrideCache: null,    // snapshot to restore when 800 toggled off
    finished: false,
    finisherP: null,
    finisherType: null,
  };
}

function snapshot(){
  S.history.push(JSON.stringify(S));
  if(S.history.length>60) S.history.shift();
}
function undo(){
  const snap = S.history.pop();
  if(!snap){ toast("Geri alınacak yok."); return; }
  S = JSON.parse(snap);
  renderAll();
  toast("Geri alındı ✅");
}

function currentHand(){ return S.hands[S.focus.hand]; }

function go(screen){
  $("home").classList.toggle("hidden", screen!=="home");
  $("game").classList.toggle("hidden", screen!=="game");
  $("blur").classList.toggle("on", screen!=="home");
  closeSheet();
}

function baseCell(hand, p){
  // If 800 override, fixed values
  if(hand.override800!==null) return (p===hand.override800)?800:400;

  const pl = hand.players[p];
  let v = 0;

  // TAS (stone) — may be multiplied if opponent did cift
  let tas = (pl.tas===null||pl.tas===undefined) ? 0 : Number(pl.tas)||0;
  const mult = (hand.finished && hand.finisherType==="cift" && hand.finisherP!==p) ? 2 : 1;
  v += tas * mult;

  // CEZA / KAFA toggles
  if(pl.ceza) v += 101;
  if(pl.kafa) v += -101;

  // Finisher auto values
  if(pl.finisher==="siler") v += -101;
  if(pl.finisher==="okey")  v += -202;
  if(pl.finisher==="elden") v += -303;
  if(pl.finisher==="cift")  v += -202;

  // Elden penalty: all others +800
  if(hand.finished && hand.finisherType==="elden" && hand.finisherP!==p){
    v += 800;
  }

  return v;
}

function totals(){
  const sums = [0,0,0,0];
  for(let hi=0;hi<S.hands.length;hi++){
    const hand = S.hands[hi];
    for(let p=0;p<4;p++){
      sums[p] += baseCell(hand,p);
    }
  }
  const min = Math.min(...sums);
  const max = Math.max(...sums);
  return {
    sums,
    leader: sums.findIndex(x=>x===min),
    trailer: sums.findIndex(x=>x===max),
  };
}

function canUseFinisher(hand, p){
  const pl = hand.players[p];
  // If 800 override active, no finisher allowed
  if(hand.override800!==null && pl.finisher===null) return false;
  // only one finisher per hand; allow toggling off your own
  if(hand.finished && pl.finisher===null) return false;
  return true;
}

function setLock(pl, lock){
  pl.lockTas = lock;
  if(lock) pl.tas = null;
}

function toggleCeza(p){
  snapshot();
  const hand = currentHand();
  // CEZA can be toggled even after finished
  hand.players[p].ceza = !hand.players[p].ceza;
  renderAll();
}
function toggleKafa(p){
  snapshot();
  const hand = currentHand();
  hand.players[p].kafa = !hand.players[p].kafa;
  renderAll();
}

function toggle800(p){
  snapshot();
  const hand = currentHand();
  if(hand.finished){
    toast("El bitti. 800 olmaz.");
    return;
  }
  if(hand.override800===null){
    // save snapshot to restore later
    hand.overrideCache = JSON.parse(JSON.stringify(hand.players));
    hand.override800 = p;
    toast("800 aktif → diğerleri 400");
  } else if(hand.override800===p){
    // restore
    if(hand.overrideCache) hand.players = hand.overrideCache;
    hand.overrideCache = null;
    hand.override800 = null;
    toast("800 geri alındı");
  } else {
    toast("Bu elde 800 zaten var.");
  }
  renderAll();
}

function toggleFinisher(p, kind){
  snapshot();
  const hand = currentHand();
  const pl = hand.players[p];

  if(!canUseFinisher(hand,p)){
    toast("Bu elde Siler grubu olmaz.");
    return;
  }

  // Toggle off if same
  if(pl.finisher===kind){
    pl.finisher = null;
    if(hand.finished && hand.finisherP===p){
      hand.finished = false;
      hand.finisherP = null;
      hand.finisherType = null;
    }
    // unlock tas if no finisher
    setLock(pl,false);
    renderAll();
    toast(kind.toUpperCase()+" geri alındı");
    return;
  }

  // Turning on: clear any finisher on all players (since only one per hand)
  for(let i=0;i<4;i++){
    hand.players[i].finisher = null;
  }
  // apply
  pl.finisher = kind;
  setLock(pl,true); // stone not allowed for finisher
  hand.finished = true;
  hand.finisherP = p;
  hand.finisherType = kind;

  // For siler/okey/elden/cift: others must enter stones (unless 800 override)
  renderAll();
  toast("El bitti ✅ Taşları yazın");
  // Start opponent stone entry flow
  setTimeout(()=>promptNextRequiredStone(), 200);
}

function requiredStonePlayers(hand){
  if(!hand.finished) return [];
  const fin = hand.finisherP;
  const res = [];
  for(let p=0;p<4;p++){
    if(p===fin) continue;
    // others should write stone (even if ceza/kafa toggled)
    if(hand.override800!==null) continue;
    if(hand.players[p].tas===null) res.push(p);
  }
  return res;
}

function promptNextRequiredStone(){
  const hand = currentHand();
  if(!hand.finished) return;

  const req = requiredStonePlayers(hand);
  if(req.length===0){
    // All stones entered -> auto new hand
    toast("Yeni el…");
    setTimeout(()=>autoNewHand(), 250);
    return;
  }
  // open sheet for first missing
  openStoneSheet(S.focus.hand, req[0], /*allowWhenFinished*/ true, hand.finisherType==="cift" ? 2 : 1);
}

function autoNewHand(){
  S.hands.push(newHand());
  S.focus = {hand:S.hands.length-1, p:0};
  renderAll();
  // Start fast entry: open stone sheet for player 1
  openStoneSheet(S.focus.hand, 0, /*allowWhenFinished*/ false, 1);
}

function openStoneSheet(handIdx, p, allowWhenFinished, mult){
  const hand = S.hands[handIdx];
  const pl = hand.players[p];

  if(hand.override800!==null){
    toast("800 varken taş yazılmaz.");
    return;
  }
  if(pl.lockTas && !allowWhenFinished){
    toast("Bu oyuncu taş yazamaz 🔒");
    return;
  }

  S.sheetCtx = {hand:handIdx, p, allowWhenFinished, mult};
  $("sheetTitle").textContent = `${S.names[p]} • Taş yaz`;
  $("sheetNote").textContent = (mult===2) ? "Çift Siler: taş ×2 (sadece taş kısmı)." : "";
  $("tasInput").value = "";
  $("backdrop").classList.add("on");
  $("sheet").classList.add("on");
  setTimeout(()=>$("tasInput").focus(), 0);
}

function closeSheet(){
  $("backdrop").classList.remove("on");
  $("sheet").classList.remove("on");
  S.sheetCtx = null;
}

function saveStone(){
  const ctx = S.sheetCtx;
  if(!ctx) return closeSheet();
  snapshot();
  const hand = S.hands[ctx.hand];
  const pl = hand.players[ctx.p];

  const v = Number($("tasInput").value||0);
  // if player has lockTas (finisher), ignore
  if(pl.lockTas && !ctx.allowWhenFinished){
    toast("Taş yazılamaz 🔒");
    closeSheet();
    return;
  }
  pl.tas = v;

  closeSheet();
  renderAll();

  // If hand finished, continue required stones flow
  if(hand.finished){
    promptNextRequiredStone();
    return;
  }

  // Auto-advance to next player's stone entry
  if(ctx.p < 3){
    S.focus = {hand: ctx.hand, p: ctx.p+1};
    renderAll();
    openStoneSheet(ctx.hand, ctx.p+1, false, 1);
  } else {
    // end row -> next hand
    autoNewHand();
  }
}

/*** Rendering ***/
function actionBtn(label, cls, on, handler){
  return `<button class="action ${cls} ${on?'on':''}" onclick="${handler}">${label}</button>`;
}

function renderTable(){
  const tbl = $("tbl");
  const handCount = S.hands.length;

  // Header
  const headerCells = S.names.map((n,p)=>{
    const hand = currentHand();
    const pl = hand.players[p];
    const lockIcon = pl.lockTas ? " 🔒" : "";
    return `
      <th style="min-width:260px">
        <div class="headerName"><span>${n}${lockIcon}</span><span style="opacity:.75;font-size:12px">#${p+1}</span></div>
        <div class="actions">
          ${actionBtn("CEZA","+ceza".slice(1), pl.ceza, `toggleCeza(${p})`)}
          ${actionBtn("KAFA","+kafa".slice(1), pl.kafa, `toggleKafa(${p})`)}
          ${actionBtn("800","+e800".slice(1), (currentHand().override800===p), `toggle800(${p})`)}
          ${actionBtn("SİLER","+siler".slice(1), pl.finisher==="siler", `toggleFinisher(${p},'siler')`)}
          ${actionBtn("OKEY","+okey".slice(1), pl.finisher==="okey", `toggleFinisher(${p},'okey')`)}
          ${actionBtn("ELDEN","+elden".slice(1), pl.finisher==="elden", `toggleFinisher(${p},'elden')`)}
          ${actionBtn("ÇİFT","+cift".slice(1), pl.finisher==="cift", `toggleFinisher(${p},'cift')`)}
        </div>
      </th>
    `;
  }).join("");

  const rows = [];
  for(let hi=0;hi<handCount;hi++){
    const hand = S.hands[hi];
    const tds = [];
    for(let p=0;p<4;p++){
      const v = baseCell(hand,p);
      const isFocus = (hi===S.focus.hand && p===S.focus.p);
      const pl = hand.players[p];
      const empty = (pl.tas===null && !pl.ceza && !pl.kafa && pl.finisher===null && !(hand.override800!==null));
      const cellCls = empty ? "cell muted" : "cell";
      const tdCls = [
        "clickable",
        isFocus ? "focus" : "",
        pl.lockTas ? "locked" : ""
      ].filter(Boolean).join(" ");
      tds.push(`<td class="${tdCls}" onclick="openStoneSheet(${hi},${p},false,1)"><div class="${cellCls}">${v}</div></td>`);
    }
    rows.push(`<tr><td><b>${hi+1}</b></td>${tds.join("")}</tr>`);
  }

  const t = totals().sums;
  const totalsRow = `<tr><td><b>Top.</b></td>${t.map(x=>`<td><div class="cell"><b>${x}</b></div></td>`).join("")}</tr>`;

  tbl.innerHTML = `<tr><th style="min-width:72px">El</th>${headerCells}</tr>` + rows.join("") + totalsRow;
}

function renderTotals(){
  const t = totals();
  const box = $("totals");
  let html = "";
  for(let p=0;p<4;p++){
    const cls = ["box"];
    if(p===t.leader) cls.push("leader");
    if(p===t.trailer) cls.push("trailer");
    html += `
      <div class="${cls.join(" ")}">
        <div class="boxTitle">${S.names[p]}</div>
        <div class="boxVal">${t.sums[p]}</div>
        <div class="boxHint">${p===t.leader?"Önde":(p===t.trailer?"Geride":"")}</div>
      </div>
    `;
  }
  box.innerHTML = html;
}

function renderAll(){
  renderTable();
  renderTotals();
}

/*** Wire UI ***/
function wire(){
  $("btnStart").onclick = ()=>{
    snapshot();
    S.hands = [newHand()];
    S.focus = {hand:0, p:0};
    go("game");
    renderAll();
    // start fast entry
    openStoneSheet(0,0,false,1);
  };
  $("btnUndo").onclick = ()=>undo();
  $("btnMenu").onclick = ()=>go("home");
  $("btnNewHand").onclick = ()=>{
    snapshot();
    autoNewHand();
  };

  $("backdrop").onclick = ()=>closeSheet();
  $("btnCancelTas").onclick = ()=>closeSheet();
  $("btnSaveTas").onclick = ()=>saveStone();
  $("tasInput").addEventListener("keydown", (e)=>{
    if(e.key==="Enter"){ e.preventDefault(); saveStone(); }
  });
}

/*** Boot ***/
(function(){
  S.hands = [newHand()];
  go("home");
  wire();
})();


// === Icon Click Fix ===
document.addEventListener("DOMContentLoaded", function() {
  document.querySelectorAll(".icon-btn").forEach(btn => {
    btn.addEventListener("click", function(e){
      e.stopPropagation();
    });
  });
});

