'use client';
import VitalCRMReal from '../../VitalCRMReal';
import {useWorkspace} from '../../WorkspaceSwitcher';

export default function VitalCRMPage(){
  const [workspace]=useWorkspace();
  if(workspace.id!=='vital-decor')return <main style={{padding:30}}>
    <h1>CRM Vital Decor</h1><p>Selecione a conta Vital Decor no menu superior para visualizar a operação.</p>
  </main>;
  return <VitalCRMReal embedded />;
}
