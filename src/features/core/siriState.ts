import { atom } from 'jotai';

/** True while the Siri panel shows a freshly created token that has not been dismissed. The Settings dialog refuses to close meanwhile, because the token is shown only once. */
export const siriTokenPendingAtom = atom<boolean>(false);
