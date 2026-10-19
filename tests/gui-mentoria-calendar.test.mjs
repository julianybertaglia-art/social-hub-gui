import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUI_MENTORIA_OCT2026_KEY,
  GUI_MENTORIA_OCT2026_POSTS,
  addGuiMentoriaCalendarOnce,
  mergeGuiMentoriaCalendar
} from '../app/lib/gui-mentoria-calendar-20261019.mjs';

test('five distinct post ideas for Gui are placed in the October editorial calendar',()=>{
  assert.equal(GUI_MENTORIA_OCT2026_POSTS.length,5);
  assert.equal(new Set(GUI_MENTORIA_OCT2026_POSTS.map(x=>x.id)).size,5);
  assert.deepEqual(GUI_MENTORIA_OCT2026_POSTS.map(x=>x.date),[
    '2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-26'
  ]);
  for(const post of GUI_MENTORIA_OCT2026_POSTS){
    assert.equal(post.status,'Ideia');
    assert.equal(post.time,'');
    assert.match(post.brief.cta,/MENTORIA/);
    assert.ok(post.brief.steps.length>=4);
    assert.ok(['Reel','Carrossel'].includes(post.format));
  }
});
test('migration preserves all existing user posts and original edits',()=>{
  const original=[
    {id:123,title:'Minha ideia antiga',date:'2026-11-01',status:'Em criação',time:'12:30'},
    {...GUI_MENTORIA_OCT2026_POSTS[0],date:'2026-11-05',status:'Roteiro'}
  ];
  const merged=mergeGuiMentoriaCalendar(original);
  assert.equal(merged.length,6);
  assert.strictEqual(merged[0],original[0]);
  assert.strictEqual(merged[1],original[1]);
  assert.equal(merged[1].date,'2026-11-05');
  assert.equal(merged[1].status,'Roteiro');
  assert.deepEqual(mergeGuiMentoriaCalendar(merged),merged);
});
test('browser migration imports only once; it cannot resurrect deleted posts',()=>{
  const store=new Map();
  const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  const first=addGuiMentoriaCalendarOnce([{id:1,title:'Roteiro existente'}],storage);
  assert.equal(first.length,6);
  assert.equal(JSON.parse(store.get('guihub-posts')).length,6);
  assert.equal(store.get(GUI_MENTORIA_OCT2026_KEY),'1');
  const afterDeletion=first.filter(p=>p.id!==GUI_MENTORIA_OCT2026_POSTS[0].id);
  const next=addGuiMentoriaCalendarOnce(afterDeletion,storage);
  assert.strictEqual(next,afterDeletion);
  assert.equal(next.length,5);
});
