import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadVitalStore} from '../app/lib/server/vital-store-access.mjs';

const organization={id:'org',workspace_code:'vital-decor',owner_user_id:'ju-id'};
const member=(id,role='agent',status='active',org='org')=>({user_id:id,role,status,organization_id:org});
const check=(userId,record,extra={})=>canReadVitalStore({userId,organization,member:record,guilhermeUserId:'gui-id',...extra});
test('only the verified owner and explicitly identified Guilherme are allowed',()=>{
  assert.equal(check('ju-id',member('ju-id','owner')),true);
  assert.equal(check('gui-id',member('gui-id','supervisor')),true);
  assert.equal(check('vitor-id',member('vitor-id','agent')),false);
  assert.equal(check('andrey-id',member('andrey-id','agent')),false);
  assert.equal(check('other-supervisor',member('other-supervisor','supervisor')),false);
});
test('inactive, mismatched organization, forged owner, and missing identity fail closed',()=>{
  assert.equal(check('gui-id',member('gui-id','supervisor','inactive')),false);
  assert.equal(check('gui-id',member('gui-id','supervisor','active','other')),false);
  assert.equal(check('gui-id',member('other','supervisor')),false);
  assert.equal(check('gui-id',member('gui-id','owner')),false);
  assert.equal(check('ju-id',member('ju-id','agent')),false);
  assert.equal(check('gui-id',member('gui-id','supervisor'),{guilhermeUserId:null}),false);
  assert.equal(check('gui-id',member('gui-id','supervisor'),{organization:{...organization,workspace_code:'gui'}}),false);
});
