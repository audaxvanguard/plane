import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBRL, normalizeCustomInput } from '../../apps/web/helpers/custom-fields.ts';
const field=(type)=>({type,options:[]});

test('exact BRL cents beyond binary-float safe integers',()=>{
  assert.equal(formatBRL('0.10'),'R$\u00a00,10');
  assert.equal(formatBRL('-1250.01'),'-R$\u00a01.250,01');
  assert.equal(formatBRL('9007199254740992.01'),'R$\u00a09.007.199.254.740.992,01');
});
test('pt-BR input normalization is decimal-safe',()=>{
  assert.equal(normalizeCustomInput(field('currency'),'R$ 1.250,10'),'1250.10');
  assert.equal(normalizeCustomInput(field('currency'),'9.007.199.254.740.992,01'),'9007199254740992.01');
  assert.equal(normalizeCustomInput(field('currency'),'-0,10'),'-0.10');
  assert.equal(normalizeCustomInput(field('number'),'1,250001'),'1.250001');
  assert.throws(()=>normalizeCustomInput(field('currency'),'1,001'));
  assert.throws(()=>normalizeCustomInput(field('number'),'NaN'));
});
test('unset false and zero are distinct',()=>{
  assert.equal(normalizeCustomInput(field('checkbox'),false),false);
  assert.equal(normalizeCustomInput(field('currency'),'0'),'0.00');
  assert.equal(normalizeCustomInput(field('text'),''),null);
  assert.equal(normalizeCustomInput(field('text'),'0'),'0');
});
test('date inputs do not undergo timezone conversion',()=>{
  assert.equal(normalizeCustomInput(field('date'),'2024-02-29'),'2024-02-29');
  assert.throws(()=>normalizeCustomInput(field('date'),'2025-02-29'));
});
