import {notFound} from 'next/navigation';
import VisualCRM from './VisualCRM';

export const dynamic='force-dynamic';
export const metadata={title:'Prévia visual | TidePlace CRM + MIA'};

export default function PreviewCRMPage(){
  // Never serve the unauthed design-only visual tour from production.
  if(process.env.VERCEL_ENV==='production') notFound();
  return <VisualCRM/>;
}
