'use client';

import { useRouter } from 'next/navigation';
import { useWorkspace } from '../../WorkspaceSwitcher';
import ContactRecord from '../ContactRecord';

export default function CRMExample() {
  const router = useRouter();
  const [workspace] = useWorkspace();
  const example = {
    id: 'crm-demo-contact',
    profile_name: 'Contato de exemplo',
    phone: '11 90000-0000',
    stage: 'Interessado',
    sector: 'comercial_vital',
    assigned_to: 'Equipe comercial',
    tags: ['Exemplo', workspace.id === 'gui-nonato' ? 'Mentoria' : 'Jardim vertical'],
    last_message_at: '2026-10-28T12:45:00-03:00',
  };
  return (
    <ContactRecord
      key={workspace.id}
      workspace={workspace}
      contact={example}
      demo
      onBack={() => router.push('/crm')}
      onMove={() => {}}
      busy={null}
    />
  );
}
