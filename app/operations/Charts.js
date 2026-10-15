'use client';
import styles from './operations.module.css';
import { numberOrNull } from '../lib/operations.mjs';
export const fmt=v=>numberOrNull(v)===null?'—':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(Number(v));
export function DailyChart({rows=[],series=[{key:'value',name:'Alcance',color:'#8f2945'}],empty='Ainda não há uma série diária disponível para este período.'}){
 const valid=rows.some(r=>series.some(s=>numberOrNull(r[s.key])!==null));if(!valid)return <div className={styles.empty}>{empty}</div>;
 const max=Math.max(1,...rows.flatMap(r=>series.map(s=>numberOrNull(r[s.key])??0))),step=600/rows.length;
 return <><svg className={styles.chart} viewBox="0 0 680 220" role="img" aria-label={series.map(s=>s.name).join(' e ')+'. Consulte os valores na tabela abaixo.'}>
 {[0,.5,1].map(v=><g key={v}><line x1="54" x2="660" y1={180-v*150} y2={180-v*150} stroke="#e7e3e6"/><text x="47" y={184-v*150} textAnchor="end">{fmt(Math.round(v*max))}</text></g>)}
 {rows.map((r,i)=><g key={r.date||i}>{series.map((s,j)=>{const value=numberOrNull(r[s.key]);return value===null?null:<rect key={s.key} x={57+i*step+j*step/series.length} y={180-value/max*150} width={Math.max(2,step/series.length-3)} height={Math.max(0,value/max*150)} fill={s.color} rx="2"><title>{r.date}: {s.name} {fmt(value)}</title></rect>;})}{(i===0||i===rows.length-1||i===Math.floor(rows.length/2))&&<text x={57+i*step} y="205" textAnchor={i===rows.length-1?'end':'start'}>{r.date?.slice(5).split('-').reverse().join('/')}</text>}</g>)}
 </svg><div className={styles.legend}>{series.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.name}</span>)}</div><details><summary>Ver valores por dia</summary><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Data</th>{series.map(s=><th key={s.key}>{s.name}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.date}><td>{r.date}</td>{series.map(s=><td key={s.key}>{fmt(r[s.key])}</td>)}</tr>)}</tbody></table></div></details></>;
}
export function KPI({label,value,comparison,note,suffix=''}){return <article className={styles.kpi}><span>{label}</span><strong>{fmt(value)}{numberOrNull(value)!==null?suffix:''}</strong><small>{comparison!==null&&comparison!==undefined?<><b className={comparison>0?styles.good:undefined}>{comparison>0?'+':''}{fmt(comparison)}%</b> vs. período anterior</>:note||'Comparação indisponível'}</small></article>;}
export function Panel({title,description,action,children}){return <section className={styles.panel}><div className={styles.panelHead}><div><h2>{title}</h2>{description&&<p className={styles.muted}>{description}</p>}</div>{action}</div>{children}</section>;}
