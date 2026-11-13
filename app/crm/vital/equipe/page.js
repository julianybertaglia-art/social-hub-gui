'use client';
import VitalCRMTeam from '../../../VitalCRMTeam';
import {useWorkspace} from '../../../WorkspaceSwitcher';
export default function TeamPage(){
 const [workspace]=useWorkspace();
 if(workspace.id!=='vital-decor')return <main style={{padding:32}}><h1>Equipe Vital Decor</h1><p>Selecione Vital Decor no menu superior para continuar.</p></main>;
 return <VitalCRMTeam/>;
}
