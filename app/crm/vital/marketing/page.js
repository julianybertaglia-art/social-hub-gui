'use client';
import VitalInsightsCRM from '../../../VitalInsightsCRM';
import {useWorkspace} from '../../../WorkspaceSwitcher';

export default function VitalMarketingPage(){
 const [workspace]=useWorkspace();
 if(workspace.id!=='vital-decor')return <main style={{padding:30}}>
  <h1>Marketing Vital Decor</h1><p>Selecione a conta Vital Decor no menu superior para continuar.</p>
 </main>;
 return <main><VitalInsightsCRM/></main>;
}
