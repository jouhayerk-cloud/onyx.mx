declare const __APP_VERSION__: string;

/** The version the UI shows. package.json carries semver (2.0.0); a zero patch is dropped, so it reads 2.0. */
export const APP_VERSION_LABEL: string = String(__APP_VERSION__).replace(/\.0$/, '');
