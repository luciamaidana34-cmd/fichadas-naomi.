const pathParts = location.pathname.split("/").filter(Boolean);
const accessKey = pathParts[0] || "";
const isAdmin = new URLSearchParams(location.search).has("admin");
const headers = {"Content-Type":"application/json","x-app-key":accessKey};
const $ = id => document.getElementById(id);
let historyData = {records:[],days:{},openShift:null};
let month = new Date(); month.setDate(1);
let selected = new Date(); selected.setHours(0,0,0,0);

function fmtHours(ms){const mins=Math.round((ms||0)/60000);return `${Math.floor(mins/60)} h ${String(mins%60).padStart(2,"0")} min`;}
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function prettyDate(d){return new Intl.DateTimeFormat("es-AR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d);}
function monthName(d){return new Intl.DateTimeFormat("es-AR",{month:"long",year:"numeric"}).format(d);}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{...headers,...(opts.headers||{})}});const data=await r.json();if(!r.ok)throw new Error(data.error||"No se pudo completar la operación.");return data;}
function updateClock(){const now=new Date();$("clock").textContent=new Intl.DateTimeFormat("es-AR",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(now);$("today").textContent=prettyDate(now);}
setInterval(updateClock,1000);updateClock();

async function refresh(){
  const data=await api("/api/history");historyData=data;
  $("shiftState").textContent=data.openShift?`Jornada abierta desde ${new Date(data.openShift.entrada).toLocaleString("es-AR")}`:"No hay una jornada abierta.";
  $("inBtn").disabled=!!data.openShift;$("outBtn").disabled=!data.openShift;
  renderCalendar();renderDay();renderMonth();
}
function renderCalendar(){
  $("monthLabel").textContent=monthName(month);$("summaryMonth").textContent=monthName(month);
  const first=new Date(month.getFullYear(),month.getMonth(),1);
  const offset=(first.getDay()+6)%7;const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  let html="";for(let i=0;i<offset;i++)html+='<div class="day empty"></div>';
  for(let n=1;n<=count;n++){const d=new Date(month.getFullYear(),month.getMonth(),n);const key=dateKey(d);const has=!!historyData.days[key];html+=`<button class="day ${has?"has-data":""} ${key===dateKey(selected)?"selected":""}" data-date="${key}">${n}</button>`;}
  $("calendar").innerHTML=html;
  $("calendar").querySelectorAll("[data-date]").forEach(b=>b.addEventListener("click",()=>{selected=new Date(`${b.dataset.date}T12:00:00`);renderCalendar();renderDay();}));
}
function renderDay(){
  const key=dateKey(selected),d=historyData.days[key];
  $("selectedDate").textContent=prettyDate(selected);
  const shifts=historyData.records.filter(r=>r.entrada&&dateKey(new Date(r.entrada))===key);
  let html="";
  if(shifts.length){for(const s of shifts){html+=`<div class="detail-row"><span>Entrada</span><strong>${new Date(s.entrada).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</strong></div><div class="detail-row"><span>Salida</span><strong>${s.salida?new Date(s.salida).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}):"Pendiente"}</strong></div>`;}}
  if(d){html+=`<div class="detail-row"><span>Horas nocturnas</span><strong>${fmtHours(d.nocturnasMs)}</strong></div><div class="detail-row"><span>Horas diurnas</span><strong>${fmtHours(d.diurnasMs)}</strong></div><div class="detail-row"><span>Total del día</span><strong>${fmtHours(d.totalMs)}</strong></div>`;}
  $("dayDetail").innerHTML=html||'<p class="muted">No hay fichadas registradas para esta fecha.</p>';
}
function renderMonth(){
  const prefix=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}`;
  const days=Object.values(historyData.days).filter(d=>d.date.startsWith(prefix));
  const sums=days.reduce((a,d)=>({n:a.n+d.nocturnasMs,day:a.day+d.diurnasMs,total:a.total+d.totalMs}),{n:0,day:0,total:0});
  $("monthNight").textContent=fmtHours(sums.n);$("monthDay").textContent=fmtHours(sums.day);$("monthTotal").textContent=fmtHours(sums.total);
}
$("prevMonth").onclick=()=>{month.setMonth(month.getMonth()-1);renderCalendar();renderMonth();};
$("nextMonth").onclick=()=>{month.setMonth(month.getMonth()+1);renderCalendar();renderMonth();};
$("inBtn").onclick=async()=>{try{$("inBtn").disabled=true;await api("/api/clock/in",{method:"POST"});$("feedback").textContent="Entrada registrada.";await refresh();}catch(e){$("feedback").textContent=e.message;$("inBtn").disabled=false;}};
$("outBtn").onclick=async()=>{try{$("outBtn").disabled=true;await api("/api/clock/out",{method:"POST"});$("feedback").textContent="Salida registrada.";await refresh();}catch(e){$("feedback").textContent=e.message;$("outBtn").disabled=false;}};

async function loadAdmin(){
  $("employee").hidden=true;$("admin").hidden=false;
  const data=await api("/api/admin/history");
  $("adminList").innerHTML=data.records.map(r=>`<div class="record"><strong>${r.entrada?new Date(r.entrada).toLocaleString("es-AR"):"Sin entrada"}</strong> → <strong>${r.salida?new Date(r.salida).toLocaleString("es-AR"):"Abierta"}</strong><div>${escapeHtml(r.estado)} · ${escapeHtml(r.tipo)}</div>
  <details><summary>Corregir este registro</summary><label>Entrada<input type="datetime-local" id="in-${r.id}" value="${r.entrada?new Date(new Date(r.entrada).getTime()-new Date(r.entrada).getTimezoneOffset()*60000).toISOString().slice(0,16):""}"></label><label>Salida<input type="datetime-local" id="out-${r.id}" value="${r.salida?new Date(new Date(r.salida).getTime()-new Date(r.salida).getTimezoneOffset()*60000).toISOString().slice(0,16):""}"></label><label>Motivo<textarea id="why-${r.id}" placeholder="Motivo de la corrección"></textarea></label><button data-fix="${r.id}">Guardar corrección</button></details></div>`).join("")||'<p class="muted">Todavía no hay registros.</p>';
  $("adminList").querySelectorAll("[data-fix]").forEach(b=>b.onclick=async()=>{const id=b.dataset.fix;try{await api(`/api/admin/records/${id}`,{method:"PATCH",body:JSON.stringify({entrada:$(`in-${id}`).value,salida:$(`out-${id}`).value,motivo:$(`why-${id}`).value})});alert("Corrección guardada.");loadAdmin();}catch(e){alert(e.message);}});
}
(async()=>{try{if(isAdmin)await loadAdmin();else await refresh();}catch(e){$("feedback").textContent=e.message||"No se pudo conectar.";}})();