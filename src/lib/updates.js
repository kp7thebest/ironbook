// Set by MainApp while a past session is open for editing (that state isn't saved on the phone),
// so the update banner (App.jsx) won't auto-reload over it.
let reloadBlocked = false;
export const setReloadBlocked = (v) => { reloadBlocked = v; };
export const isReloadBlocked = () => reloadBlocked;
