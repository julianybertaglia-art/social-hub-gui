export const GUI_INSTAGRAM_ACCOUNT_ID = '17841401155694295';
export const GUI_INSTAGRAM_USERNAME = 'gui_nonato';

export function matchesGuiInstagramProfile(profile) {
  return String(profile?.id || '') === GUI_INSTAGRAM_ACCOUNT_ID
    && String(profile?.username || '').trim().replace(/^@/, '').toLowerCase() === GUI_INSTAGRAM_USERNAME;
}

export function hasVerifiedGuiConnection(profile) {
  return profile?.connected === true && matchesGuiInstagramProfile(profile);
}
