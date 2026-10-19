import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarToday, isCalendarDate, patchEditorialPost, requireWorkspace, validateLegacyPosts, validatePost } from '../app/lib/editorial-calendar.mjs';
import { GUI_EDITORIAL_ADDITIONS, GUI_EDITORIAL_OCTOBER_POSTS } from '../app/lib/gui-editorial-october-2026.mjs';
import { GUI_MENTORIA_OCT2026_POSTS } from '../app/lib/gui-mentoria-calendar-20261019.mjs';

test('October completion preserves the five original briefs and has exactly five new ideas', () => {
  assert.deepEqual(GUI_EDITORIAL_OCTOBER_POSTS.slice(0, 5), GUI_MENTORIA_OCT2026_POSTS);
  assert.equal(new Set(GUI_EDITORIAL_OCTOBER_POSTS.map(p => p.id)).size, 10);
  assert.deepEqual(GUI_EDITORIAL_ADDITIONS.map(p => [p.date, p.format, p.objective]), [
    ['2026-10-27', 'Reel', 'Autoridade'], ['2026-10-28', 'Carrossel', 'Autoridade'],
    ['2026-10-29', 'Reel', 'Conversão'], ['2026-10-30', 'Carrossel', 'Conversão'], ['2026-10-31', 'Reel', 'Autoridade'],
  ]);
  for (const p of GUI_EDITORIAL_ADDITIONS) {
    validatePost(p);
    assert.equal(p.status, 'Ideia'); assert.equal(p.time, '');
    assert.ok(p.brief.hook && p.brief.creativeDirection && p.brief.cta && p.brief.steps.length >= 4);
  }
});

test('legacy migration retains original dates, status, numeric IDs, brief and unknown fields', () => {
  const old = [{ id: 123, title: 'Meu roteiro', date: 'Quinta', status: 'Roteiro', brief: { script: 'Texto original' }, attachments: ['foto.png'] }];
  assert.strictEqual(validateLegacyPosts(old), old);
  const edited = patchEditorialPost(old[0], { status: 'Em criação' });
  assert.equal(edited.id, 123); assert.equal(edited.date, 'Quinta');
  assert.strictEqual(edited.brief, old[0].brief); assert.deepEqual(edited.attachments, ['foto.png']);
  assert.equal(old[0].status, 'Roteiro');
});

test('corrupt legacy data is rejected rather than silently converted to an empty list', () => {
  for (const input of [null, {}, [{ title: 'Sem ID' }], [{ id: 1, title: '' }]]) assert.throws(() => validateLegacyPosts(input));
  assert.deepEqual(validateLegacyPosts([]), []);
});

test('edits cannot change identity, owner or workspace; only actual calendar dates are accepted', () => {
  const post = GUI_EDITORIAL_ADDITIONS[0];
  for (const patch of [{ id: 'other' }, { workspace: 'vital-decor' }, { owner_user_id: 'other' }, { date: '2026-02-30' }, { status: 'Agendado automaticamente' }]) assert.throws(() => patchEditorialPost(post, patch));
  assert.equal(isCalendarDate('2026-02-30'), false); assert.equal(isCalendarDate('2028-02-29'), true);
  assert.equal(isCalendarDate('2026-10-31'), true); assert.equal(isCalendarDate('0026-10-19'), true);
  assert.throws(() => requireWorkspace('vital')); assert.equal(requireWorkspace('gui-nonato'), 'gui-nonato');
});

test('today follows Brazil time across UTC midnight', () => {
  assert.equal(calendarToday(new Date('2026-10-20T01:00:00Z')), '2026-10-19');
  assert.equal(calendarToday(new Date('2026-10-20T03:00:00Z')), '2026-10-20');
});
