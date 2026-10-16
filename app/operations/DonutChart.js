'use client';
import styles from './operations.module.css';

const colors = ['#8f2945','#bb7187','#d3a68b','#687587','#8f839b','#a88e66','#586c65','#c1aeb7'];
const number = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const display = value => new Intl.NumberFormat('pt-BR').format(value);

export default function DonutChart({ title, items = [], empty = 'Ainda não há dados para montar este gráfico.', note }) {
  const visible = items.filter(item => number(item.count) > 0);
  const total = visible.reduce((sum, item) => sum + number(item.count), 0);
  if (!total) return <div className={styles.donutEmpty}><p>{empty}</p>{note && <small>{note}</small>}</div>;
  const circumference = 2 * Math.PI * 54;
  let progress = 0;
  const slices = visible.map((item, index) => {
    const fraction = number(item.count) / total;
    const start = progress;
    progress += fraction;
    return {...item, color: colors[index % colors.length], fraction, start};
  });
  return <div className={styles.donutLayout}>
    <div className={styles.donutVisual}>
      <svg viewBox="0 0 150 150" role="img" aria-label={title + ': ' + display(total) + ' registros distribuídos por ' + visible.length + ' categorias'}>
        <circle cx="75" cy="75" r="54" fill="none" stroke="#efebed" strokeWidth="22" />
        {slices.map((item, index) => <circle key={item.label + index} cx="75" cy="75" r="54" fill="none" stroke={item.color} strokeWidth="22" strokeDasharray={String(item.fraction * circumference) + ' ' + String((1 - item.fraction) * circumference)} strokeDashoffset={-item.start * circumference} transform="rotate(-90 75 75)"><title>{item.label + ': ' + display(item.count)}</title></circle>)}
        <text x="75" y="72" textAnchor="middle" className={styles.donutValue}>{display(total)}</text>
        <text x="75" y="90" textAnchor="middle" className={styles.donutCenterCaption}>registros</text>
      </svg>
    </div>
    <div className={styles.donutLegend}>
      {slices.map(item => <div className={styles.donutLine} key={item.label}><i style={{backgroundColor:item.color}} aria-hidden="true"/><span>{item.label}</span><strong>{display(item.count)}</strong><small>{Math.round(item.fraction * 100)}%</small></div>)}
    </div>
    {note && <p className={styles.donutNote}>{note}</p>}
  </div>;
}
