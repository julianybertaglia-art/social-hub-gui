// TidePlace CRM access rules; default deny for all unrecognized roles.
// This module is shared by future per-sector API guards and tests.
export const CRM_ROLES = ['owner','supervisor','agent','installer'];
export const CRM_ACTIVITIES = ['read_conversation','reply_conversation','assign_conversation','view_appointments'];

export function crmMemberAccess({role,status='active',sectors=[]}={}) {
  if (status!=='active' || !CRM_ROLES.includes(role)) return null;
  return {role, sectors: [...new Set(sectors.filter(v=>typeof v==='string' && v.length>0))]};
}

export function canCrmAccess(member, activity, sector) {
  const access=crmMemberAccess(member);
  if (!access || !CRM_ACTIVITIES.includes(activity)) return false;
  if (access.role==='owner') return true;
  // Future installers can receive individual appointment grants, never
  // general CRM conversations or arbitrary customer histories.
  if (access.role==='installer') return false;
  if (!['read_conversation','reply_conversation','assign_conversation'].includes(activity)) return false;
  if (typeof sector!=='string' || !sector) return false;
  if (!access.sectors.includes(sector)) return false;
  // Only owners and supervisors can transfer a conversation.
  return activity!=='assign_conversation' || access.role==='supervisor';
}
