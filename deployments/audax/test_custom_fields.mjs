import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBRL, normalizeCustomInput } from '../../apps/web/helpers/custom-fields.ts';
import * as helpers from '../../apps/web/helpers/custom-fields.ts';
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
test('item update sends only dirty custom keys, retaining false zero and explicit clear',()=>{
  assert.deepEqual(helpers.pickDirtyCustomValues?.({ price:'0.00', qualified:false, note:null, archived:'historical' }, {price:true,qualified:true,note:true}), {price:'0.00',qualified:false,note:null});
  assert.deepEqual(helpers.pickDirtyCustomValues?.({price:'12.00'}, {}), {});
});
test('false and zero require confirmation before changing projects',()=>{
  assert.equal(helpers.hasCustomValues?.({qualified:false}), true);
  assert.equal(helpers.hasCustomValues?.({price:'0.00'}), true);
  assert.equal(helpers.hasCustomValues?.({note:null}), false);
});
test('native group/sort selections produce typed API config without altering legacy views',()=>{
  assert.deepEqual(helpers.nativeCustomView?.('custom_field:stage','custom_field:amount:desc'), {version:1,columns:[],conditions:[],metrics:[],group_by:{field_id:'stage'},sort:{field_id:'amount',direction:'desc'}});
  assert.equal(helpers.nativeCustomView?.('state','-created_at'), undefined);
  assert.deepEqual(helpers.customGroupValue?.({qualified:false},'qualified'), 'false');
  assert.deepEqual(helpers.customGroupValue?.({qualified:null},'qualified'), 'unset');
});
test('one-group pagination emits an ungrouped typed filter and retains exact custom sorting',()=>{
  const config = {version:1,columns:[],conditions:[],metrics:[],group_by:{field_id:'qualified'},sort:{field_id:'amount',direction:'desc'}};
  assert.deepEqual(helpers.customGroupPage?.(config,'false'), {version:1,columns:[],conditions:[{field_id:'qualified',operator:'eq',value:false}],metrics:[],group_by:null,sort:{field_id:'amount',direction:'desc'}});
  assert.deepEqual(helpers.customGroupPage?.(config,'unset')?.conditions, [{field_id:'qualified',operator:'is_unset'}]);
  assert.equal(config.group_by.field_id,'qualified');
  assert.equal(config.conditions.length,0);
});
test('checkbox columns keep false and unset as separate native groups',()=>{
  assert.deepEqual(helpers.customGroupColumns?.({id:'qualified',type:'checkbox',options:[]}, key=>({'yes':'Sim','no':'Não','unset':'Não definido'}[key])), [
    {id:'true',name:'Sim',payload:{custom_values:{qualified:true}}},
    {id:'false',name:'Não',payload:{custom_values:{qualified:false}}},
    {id:'unset',name:'Não definido',payload:{custom_values:{qualified:null}}},
  ]);
});
test('text length uses Unicode characters like backend validation',()=>{
  assert.equal(normalizeCustomInput(field('text'),'😀'.repeat(2000)), '😀'.repeat(2000));
  assert.throws(()=>normalizeCustomInput(field('text'),'😀'.repeat(2001)));
});
test('date inputs do not undergo timezone conversion',()=>{
  assert.equal(normalizeCustomInput(field('date'),'2024-02-29'),'2024-02-29');
  assert.throws(()=>normalizeCustomInput(field('date'),'2025-02-29'));
});
