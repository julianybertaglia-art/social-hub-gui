// The Meta SDK validates callbacks as [object Function], rejecting native
// AsyncFunction callbacks before opening its login dialog.
export function launchMetaLogin(sdk, options, onResponse, onFailure, timeoutMs = 5 * 60 * 1000) {
  let active = true;
  let timer;
  const cancel = () => { active = false; clearTimeout(timer); };
  const fail = (error) => {
    if (!active) return;
    cancel();
    onFailure(error);
  };
  timer = setTimeout(() => fail(new Error('meta_login_timeout')), timeoutMs);
  try {
    if (typeof sdk?.login !== 'function') throw new Error('meta_sdk_unavailable');
    sdk.login(function handleMetaResponse(response) {
      if (!active) return;
      cancel();
      Promise.resolve().then(() => onResponse(response)).catch(onFailure);
    }, options);
  } catch (error) { fail(error); }
  return cancel;
}
