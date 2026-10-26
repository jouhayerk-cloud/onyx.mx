// Chunk loaders for the sidebar views. The same import() paths MainAppView uses for React.lazy,
// so a pointer or touch on a nav item starts downloading the view before the click lands.
const viewLoaders: Record<string, () => Promise<unknown>> = {
    welcome: () => import('../welcome/WelcomeView'),
    dashboard: () => import('../dashboard/AdminDashboard'),
    finance: () => import('../finance/FinanceView'),
    upload: () => import('../upload/UploadView'),
    inventory: () => import('../inventory/InventoryView'),
    warehouse: () => import('../logistics/LogisticsView'),
    trucking: () => import('../logistics/LogisticsView'),
    viewer: () => import('../viewer/ViewerView'),
    control: () => import('../control/ControlView'),
    workbook: () => import('../archived/ArchivedView'),
    devices: () => import('../pico/devices/DevicesView'),
    'image-canvas': () => import('../imageCanvas/ImageCanvasView'),
};

const prefetched = new Set<string>();

// Each view is requested at most once; a failed load is retried on the next prefetch.
export function prefetchView(view: string) {
    const load = viewLoaders[view];
    if (!load || prefetched.has(view)) return;
    prefetched.add(view);
    load().catch(() => prefetched.delete(view));
}
