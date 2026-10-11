/**
 * Onyx-mx v2 navigation map: which sidebar entries each role sees, and which view each entry opens.
 *
 * One table, read by the sidebar (IslandSidebar), by the Home tiles (WelcomeView) and by the view guard
 * (MainAppView), so the three can never drift apart. Owner direction, 11 Oct 2026:
 *
 *   Admin            Home, Dashboard, Finances, Inventory (Add entry, Print Center), Warehouse, Trucking, Viewer
 *   Developer        everything Admin has, plus Admin Control Center, Archived, Devices
 *   Client Boss      Dashboard, Finances, Inventory
 *   Client Accounting Dashboard, Finances, Inventory
 *   Client           Home (limited), Inventory, Viewer
 *   Vendor           Home, Add entry (limited to its own vendor), Inventory
 *
 * Labs (Process, 3D and AR) is no longer in the sidebar: those views stay in the code as legacy examples only.
 * This table is visibility, not data access: what a role can read is still decided by its own rules (RLS, FINANCE_ROLES).
 */
export type NavId =
    | 'home' | 'dashboard' | 'finance' | 'inventory' | 'add-entry' | 'print-center'
    | 'warehouse' | 'trucking' | 'viewer'
    | 'control' | 'archived' | 'devices';

/** The view each entry opens (print-center is a panel, not a view). */
export const NAV_VIEW: Record<NavId, string | null> = {
    home: 'welcome',
    dashboard: 'dashboard',
    finance: 'finance',
    inventory: 'inventory',
    'add-entry': 'upload',
    'print-center': null,
    warehouse: 'warehouse',
    trucking: 'trucking',
    viewer: 'viewer',
    control: 'control',
    archived: 'workbook',
    devices: 'devices',
};

const ADMIN_NAV: readonly NavId[] = ['home', 'dashboard', 'finance', 'inventory', 'add-entry', 'print-center', 'warehouse', 'trucking', 'viewer'];
const DEV_ONLY_NAV: readonly NavId[] = ['control', 'archived', 'devices'];
const CLIENT_FINANCE_NAV: readonly NavId[] = ['dashboard', 'finance', 'inventory'];
const CLIENT_NAV: readonly NavId[] = ['home', 'inventory', 'viewer'];

export const NAV_BY_ROLE: Readonly<Record<string, readonly NavId[]>> = {
    Developer: [...ADMIN_NAV, ...DEV_ONLY_NAV],
    Admin: ADMIN_NAV,
    ClientBoss: CLIENT_FINANCE_NAV,
    ClientAccounting: CLIENT_FINANCE_NAV,
    ClientViewer: CLIENT_NAV,
    // The offline fallback tier ('Client') sees what a limited client sees.
    Client: CLIENT_NAV,
    Vendor: ['home', 'add-entry', 'inventory'],
};

/** Does this role see this sidebar entry? An unknown or missing role sees nothing. */
export const canSee = (role: string | null | undefined, id: NavId): boolean =>
    !!role && (NAV_BY_ROLE[role] ?? []).includes(id);

/** The views that belong to a sidebar entry and so are only open to the roles that see it. */
const GUARDED: Record<string, NavId> = {
    welcome: 'home',
    dashboard: 'dashboard',
    overview: 'dashboard',
    finance: 'finance',
    inventory: 'inventory',
    warehouse: 'warehouse',
    logistics: 'warehouse',
    trucking: 'trucking',
    viewer: 'viewer',
    control: 'control',
    workbook: 'archived',
    devices: 'devices',
};

/** False when the view has a sidebar entry the role does not see. Views with no entry (Add entry flows, tags...) stay open as before. */
export const viewAllowed = (role: string | null | undefined, view: string): boolean => {
    if (!role) return true; // the role is not known yet: do not redirect
    const nav = GUARDED[view];
    return !nav || canSee(role, nav);
};

/** Where a role lands: Home when it has one, else the first entry it sees. */
export const homeViewFor = (role: string | null | undefined): string => {
    const list = (role && NAV_BY_ROLE[role]) || [];
    for (const id of list) {
        const v = NAV_VIEW[id];
        if (v) return v;
    }
    return 'welcome';
};
