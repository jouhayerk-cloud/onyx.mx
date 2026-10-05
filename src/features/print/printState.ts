import { atom } from 'jotai';

export const isPrintCenterOpenAtom = atom<boolean>(false);

export type PrintCenterTab = 'queue' | 'history' | 'verify' | 'printers' | 'templates';
export const printCenterTabAtom = atom<PrintCenterTab>('queue');
