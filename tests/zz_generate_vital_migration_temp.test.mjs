import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

test('generate isolated draft migration using the official Supabase CLI', { timeout: 180000 }, () => {
  execFileSync('npx', ['--yes', 'supabase@latest', 'migration', 'new', '--help'], { encoding: 'utf8', timeout: 120000 });
  const output = execFileSync('npx', ['--yes', 'supabase@latest', 'migration', 'new', 'vital_marmore_atomic_claim'], { encoding: 'utf8', timeout: 120000 });
  const files = readdirSync('supabase/migrations').filter(name => name.endsWith('_vital_marmore_atomic_claim.sql'));
  assert.equal(files.length, 1);
  console.log('GENERATED_MIGRATION=' + files[0]);
  console.log(output.trim());
});
