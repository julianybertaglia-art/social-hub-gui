import test from 'node:test';
import assert from 'node:assert/strict';
import {routingDestination,sameVitalAssignment,VITAL_SECTOR_NAMES} from '../app/lib/vital-routing.mjs';

test('Tide remains an available local sector even without Argo enabled',()=>{
 assert.deepEqual(routingDestination({sector:'comercial_vital',assignee:'tide',enabled:false}),{active:true,assignee:'tide',title:'TidePlace'});
});
test('external Argo transfer requires that exact destination to be enabled',()=>{
 assert.deepEqual(routingDestination({sector:'atacado',assignee:'andrey',enabled:false}),{active:false,assignee:null,title:'Argo não habilitado'});
 assert.deepEqual(routingDestination({sector:'atacado',assignee:'andrey',enabled:true}),{active:true,assignee:'andrey',title:'Andrey · Argo'});
 assert.equal(routingDestination({sector:'vtx',assignee:'unknown',enabled:true}).active,false);
 assert.equal(routingDestination(null).active,false);
});
test('duplicate assignment is not repeated; closed assignments can be reopened',()=>{
 const destination=routingDestination({assignee:'vitor',enabled:true});
 assert.equal(sameVitalAssignment({sector:'bluetti',assigned_to:'vitor',status:'open'},'bluetti',destination),true);
 assert.equal(sameVitalAssignment({sector:'bluetti',assigned_to:'vitor',status:'closed'},'bluetti',destination),false);
 assert.equal(sameVitalAssignment({sector:'pos_venda',assigned_to:'vitor',status:'open'},'bluetti',destination),false);
 assert.equal(sameVitalAssignment(undefined,'bluetti',destination),false);
});
test('all six configured Vital sectors remain independently addressable',()=>{
 assert.deepEqual(Object.keys(VITAL_SECTOR_NAMES).sort(),['atacado','afiliados','bluetti','comercial_vital','pos_venda','vtx']);
});
