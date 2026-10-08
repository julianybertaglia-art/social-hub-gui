// Refreshing an access token is not a change of the signed-in account.
export function sameAuthenticatedUser(currentSession, nextSession) {
  const currentId = currentSession?.user?.id ?? null;
  const nextId = nextSession?.user?.id ?? null;
  return Boolean(currentId && nextId && currentId === nextId);
}

export function hasAuthIdentityChanged(previousUserId, nextSession) {
  return (previousUserId ?? null) !== (nextSession?.user?.id ?? null);
}
