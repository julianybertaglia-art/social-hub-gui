// Inputs must come from the authenticated server session and trusted server
// configuration/database, never from a browser request body.
export function canReadVitalStore({userId, organization, member, guilhermeUserId} = {}) {
  if (!userId || !organization?.id || organization.workspace_code !== 'vital-decor' ||
      !organization.owner_user_id || member?.status !== 'active' ||
      member.user_id !== userId || member.organization_id !== organization.id) return false;
  if (userId === organization.owner_user_id) return member.role === 'owner';
  // Staff access is restricted to the one explicitly verified individual.
  // If the real login has not been provisioned, no staff member is allowed.
  return Boolean(guilhermeUserId && guilhermeUserId !== organization.owner_user_id &&
    userId === guilhermeUserId && ['agent','supervisor'].includes(member.role));
}
