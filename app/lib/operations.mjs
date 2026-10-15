export const STAGES = ['Novo lead','Conversando','Interessado','Agendar com Gui','Link enviado','Venda','Perdido'];
export function numberOrNull(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
export function dateKey(value){if(!value||!Number.isFinite(Date.parse(value)))return null;return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export function periodRange(days=30,now=new Date()){
 days=[7,14,30].includes(Number(days))?Number(days):30;
 const end=Date.parse(dateKey(now.toISOString())+'T00:00:00-03:00');const start=end-days*86400000;
 return {days,start:new Date(start).toISOString(),end:new Date(end).toISOString(),previousStart:new Date(start-days*86400000).toISOString(),startDate:dateKey(new Date(start).toISOString()),endDate:dateKey(new Date(end-1).toISOString())};
}
export function inPeriod(value,start,end){const n=Date.parse(value);return Number.isFinite(n)&&n>=Date.parse(start)&&n<Date.parse(end);}
export function delta(current,previous){if(current===null||previous===null||!Number.isFinite(current)||!Number.isFinite(previous)||previous===0)return null;return Math.round((current-previous)/previous*1000)/10;}
export function aggregateMessages(rows,range){
 const current=rows.filter(r=>inPeriod(r.sent_at,range.start,range.end)),previous=rows.filter(r=>inPeriod(r.sent_at,range.previousStart,range.start));
 const daily=Array.from({length:range.days},(_,i)=>({date:dateKey(new Date(Date.parse(range.start)+i*86400000).toISOString()),inbound:0,outbound:0}));
 for(const row of current){const day=daily.find(d=>d.date===dateKey(row.sent_at));if(day&&['inbound','outbound'].includes(row.direction))day[row.direction]++;}
 const count=(list,key)=>list.filter(r=>r.direction===key).length;
 return {inbound:count(current,'inbound'),outbound:count(current,'outbound'),previousInbound:count(previous,'inbound'),previousOutbound:count(previous,'outbound'),daily};
}
export function crmMetrics(contacts,range){
 const current=contacts.filter(c=>inPeriod(c.created_at,range.start,range.end)),previous=contacts.filter(c=>inPeriod(c.created_at,range.previousStart,range.start));
 const won=contacts.filter(c=>c.stage==='Venda').length,lost=contacts.filter(c=>c.stage==='Perdido').length;
 return {total:contacts.length,newLeads:current.length,previousNewLeads:previous.length,won,lost,open:contacts.length-won-lost,closedWinRate:won+lost?Math.round(won/(won+lost)*1000)/10:null,stages:STAGES.map(stage=>({stage,count:contacts.filter(c=>c.stage===stage).length}))};
}
export function csvCell(value){const s=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}

export async function readRows(makeQuery,cap){let data=[];for(let offset=0;offset<cap;offset+=500){const page=await makeQuery().range(offset,Math.min(offset+499,cap-1));if(page.error)return {error:page.error};data.push(...(page.data||[]));if((page.data||[]).length<500)break;}return {data};}
