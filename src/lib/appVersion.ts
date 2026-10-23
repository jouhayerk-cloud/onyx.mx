declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

/** The version the UI shows: 2.0.<7-char commit>, the key of its BUILDLOG.md entry; without git, semver minus a zero patch. */
export const APP_VERSION_LABEL: string = __APP_COMMIT__
    ? String(__APP_VERSION__).split('.').slice(0, 2).join('.') + '.' + __APP_COMMIT__
    : String(__APP_VERSION__).replace(/\.0$/, '');
