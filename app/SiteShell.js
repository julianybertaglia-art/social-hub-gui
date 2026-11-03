'use client';

import {usePathname} from 'next/navigation';
import CloudGate from './CloudGate';
import HubFrame from './HubFrame';
import MiaAssistant from './MiaAssistant';
import VisualCRM from './preview/crm/VisualCRM';

// Only a server-confirmed Preview may show the offline fictitious CRM on '/'.
// Live routes still require CloudGate and server-side membership verification.
export default function SiteShell({children,isPreview=false}) {
  const pathname=usePathname();
  if(pathname==='/preview/crm') return children;
  if(isPreview&&pathname==='/') return <VisualCRM/>;
  return <CloudGate><HubFrame>{children}</HubFrame><MiaAssistant/></CloudGate>;
}
