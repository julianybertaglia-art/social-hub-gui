'use client';

import {usePathname} from 'next/navigation';
import CloudGate from './CloudGate';
import HubFrame from './HubFrame';
import MiaAssistant from './MiaAssistant';

// Visual-only preview route: bypass login solely for its isolated fictitious UI.
// Production API and the CRM never use this path, and the server route 404s in production.
export default function SiteShell({children}) {
  const pathname=usePathname();
  if(pathname==='/preview/crm') return children;
  return <CloudGate><HubFrame>{children}</HubFrame><MiaAssistant/></CloudGate>;
}
