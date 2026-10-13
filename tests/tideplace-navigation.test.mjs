import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleNavGroups, matchesNavigation, searchNavigation } from '../app/ui/navigation.js';

const flatten = (workspace) => visibleNavGroups(workspace).flatMap((group) => group.items);

test('navigation keeps Gui and Vital tools isolated', () => {
  const gui = flatten('gui-nonato').map((item) => item.href);
  const vital = flatten('vital-decor').map((item) => item.href);
  assert.ok(gui.includes('/whatsapp'));
  assert.ok(vital.includes('/whatsapp'));
  assert.ok(gui.includes('/whatsapp/campanha'));
  assert.ok(!vital.includes('/whatsapp/campanha'));
  assert.ok(vital.includes('/whatsapp/integracao-argo'));
  assert.ok(!gui.includes('/whatsapp/integracao-argo'));
  assert.ok(vital.includes('/conexoes/vital-decor'));
  assert.ok(!gui.includes('/conexoes/vital-decor'));
});

test('all navigation destinations are unique in each workspace', () => {
  for (const workspace of ['gui-nonato', 'vital-decor']) {
    const paths = flatten(workspace).map((item) => item.href);
    assert.equal(new Set(paths).size, paths.length);
  }
});

test('search is accent insensitive and respects workspace', () => {
  assert.ok(searchNavigation('metricas', 'gui-nonato').some((item) => item.label === 'Métricas'));
  assert.ok(searchNavigation('conexoes vital', 'vital-decor').some((item) => item.href === '/conexoes/vital-decor'));
  assert.equal(searchNavigation('integracao argo', 'gui-nonato').length, 0);
});

test('dashboard sections match only the currently active tab', () => {
  const tasks = flatten('gui-nonato').find((item) => item.section === 'tasks');
  assert.equal(matchesNavigation(tasks, '/', 'tasks'), true);
  assert.equal(matchesNavigation(tasks, '/', 'dashboard'), false);
  assert.equal(matchesNavigation(tasks, '/whatsapp', 'tasks'), false);
  const crm = flatten('gui-nonato').find((item) => item.href === '/whatsapp');
  assert.equal(matchesNavigation(crm, '/whatsapp'), true);
  assert.equal(matchesNavigation(crm, '/whatsapp/gato'), false);
});
