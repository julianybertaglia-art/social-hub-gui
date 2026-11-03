'use client';
import VitalCRMReal from '../../VitalCRMReal';
import {useWorkspace} from '../../WorkspaceSwitcher';
import {useAccessScope} from '../../CloudGate';

export default function VitalCRMPage(){
  const [workspace]=useWorkspace();
  const accessScope=useAccessScope();
  if(workspace.id!=='vital-decor'&&accessScope?.scope!=='staff')return <main style={{padding:30}}>
    <h1>CRM Vital Decor</h1><p>Selecione a conta Vital Decor no menu superior para visualizar a operação.</p>
  </main>;
  return <VitalCRMReal embedded />;
}
