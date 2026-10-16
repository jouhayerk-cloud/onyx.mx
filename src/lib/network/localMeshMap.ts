/**
 * Onyx local network map for the Colibrì engine.
 *
 * Nothing about a real network lives in the code any more (it used to ship LAN IPs, MAC addresses and household names in
 * the public bundle). The nodes come from a list the person configures on this device, kept in localStorage and empty
 * by default. With an empty list every node has no address (`ip` is MESH_UNSET), `MESH_NODES` is empty and pings report "Not configured".
 *
 * The three slots (g7, second_laptop, phone) are the legacy keys that other modules still read; they now mean
 * "primary host", "relay node" and "mobile client" and carry no name, address or hardware id until configured.
 * A node is placed in the slot of its role.
 */

export type MeshNodeId = 'g7' | 'second_laptop' | 'phone';
export type MeshNodeRole = 'primary_host' | 'relay_node' | 'mobile_client';

export interface MeshDeviceNode {
    id: MeshNodeId;
    name: string;
    hostname: string;
    /** MESH_UNSET until configured (see isMeshNodeConfigured). */
    ip: string;
    role: MeshNodeRole;
    colibriPort: number;
    appPort: number;
    description: string;
    relayCommand?: string;
}

/** What the person saves for one node (no MAC address is ever stored). */
export interface MeshNodeConfig {
    role: MeshNodeRole;
    name: string;
    hostname?: string;
    ip: string;
    colibriPort?: number;
    appPort?: number;
}

/**
 * What `ip` holds until the person configures a node. Not '': other modules compare a session's (often empty) address
 * with `ip`, and an empty string would match every session without one.
 */
export const MESH_UNSET = '—';

/** True when the node has a real address. */
export const isMeshNodeConfigured = (node: Pick<MeshDeviceNode, 'ip'>): boolean => Boolean(node.ip) && node.ip !== MESH_UNSET;

export const MESH_STORAGE_KEY = 'ONYX_MESH_NODES';
export const MESH_NODES_EVENT = 'onyx-mesh-nodes';

const DEFAULT_COLIBRI_PORT = 8000;
const DEFAULT_APP_PORT = 1001;

const SLOT_OF_ROLE: Record<MeshNodeRole, MeshNodeId> = {
    primary_host: 'g7',
    relay_node: 'second_laptop',
    mobile_client: 'phone',
};

const blankNode = (id: MeshNodeId, role: MeshNodeRole, name: string, description: string): MeshDeviceNode => ({
    id,
    name,
    hostname: '',
    ip: MESH_UNSET,
    role,
    colibriPort: DEFAULT_COLIBRI_PORT,
    appPort: DEFAULT_APP_PORT,
    description,
});

const BLANK: Record<MeshNodeId, () => MeshDeviceNode> = {
    g7: () => blankNode('g7', 'primary_host', 'Colibrì host', 'The PC that runs the Colibrì server'),
    second_laptop: () => blankNode('second_laptop', 'relay_node', 'Relay node', 'A machine that forwards to the Colibrì host'),
    phone: () => blankNode('phone', 'mobile_client', 'Mobile client', 'A phone or tablet that uses the app'),
};

/** A dotted IPv4 address or a plain hostname: no scheme, path, port or credentials. */
const HOST_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/i;
const validPort = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535;

function readConfig(): MeshNodeConfig[] {
    try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(MESH_STORAGE_KEY) : null;
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        const out: MeshNodeConfig[] = [];
        for (const c of parsed) {
            if (!c || typeof c !== 'object') continue;
            const role = (c as any).role as MeshNodeRole;
            const ip = String((c as any).ip ?? '').trim();
            if (!(role in SLOT_OF_ROLE) || !HOST_RE.test(ip)) continue;
            out.push({
                role,
                name: String((c as any).name ?? '').trim().slice(0, 60),
                hostname: String((c as any).hostname ?? '').trim().slice(0, 60),
                ip,
                colibriPort: validPort((c as any).colibriPort) ? (c as any).colibriPort : undefined,
                appPort: validPort((c as any).appPort) ? (c as any).appPort : undefined,
            });
        }
        return out;
    } catch {
        return [];
    }
}

/** The three slots, filled in place so every module that already holds a reference sees the change. */
export const ONYX_MESH_TOPOLOGY: Record<MeshNodeId, MeshDeviceNode> = {
    g7: BLANK.g7(),
    second_laptop: BLANK.second_laptop(),
    phone: BLANK.phone(),
};

/** Only the nodes that have an address (empty by default). Mutated in place by reloadMeshNodes(). */
export const MESH_NODES: MeshDeviceNode[] = [];

export const SUPABASE_RELAY_URL = 'supabase://colibri-relay';

/** Address of the configured primary Colibrì host, or the loopback default when none is configured. */
export let PRIMARY_COLIBRI_HOST = `http://127.0.0.1:${DEFAULT_COLIBRI_PORT}`;
/** The app on the configured host, or '' when none is configured. */
export let PRIMARY_APP_URL = '';

/** Re-reads the configured list from localStorage and updates the exported objects in place. */
export function reloadMeshNodes(): MeshDeviceNode[] {
    const config = readConfig();
    MESH_NODES.length = 0;
    for (const id of Object.keys(ONYX_MESH_TOPOLOGY) as MeshNodeId[]) {
        const blank = BLANK[id]();
        const c = config.find(x => SLOT_OF_ROLE[x.role] === id);
        const node = ONYX_MESH_TOPOLOGY[id];
        if (c) {
            Object.assign(node, {
                name: c.name || blank.name,
                hostname: c.hostname || c.ip,
                ip: c.ip,
                colibriPort: c.colibriPort ?? DEFAULT_COLIBRI_PORT,
                appPort: c.appPort ?? DEFAULT_APP_PORT,
                description: blank.description,
            });
            MESH_NODES.push(node);
        } else {
            Object.assign(node, blank);
        }
    }
    const host = ONYX_MESH_TOPOLOGY.g7;
    PRIMARY_COLIBRI_HOST = isMeshNodeConfigured(host) ? `http://${host.ip}:${host.colibriPort}` : `http://127.0.0.1:${DEFAULT_COLIBRI_PORT}`;
    PRIMARY_APP_URL = isMeshNodeConfigured(host) ? `https://${host.ip}:${host.appPort}/onyx.mx/` : '';
    return MESH_NODES;
}

/** The saved list as configured (for an edit form). */
export function getMeshNodeConfigs(): MeshNodeConfig[] {
    return readConfig();
}

/** Saves the list (one node per role is used; invalid entries are dropped) and refreshes the exported objects. */
export function saveMeshNodeConfigs(nodes: MeshNodeConfig[]): void {
    const clean = nodes.filter(n => n && n.role in SLOT_OF_ROLE && HOST_RE.test(String(n.ip ?? '').trim())).map(n => ({
        role: n.role,
        name: String(n.name ?? '').trim().slice(0, 60),
        hostname: String(n.hostname ?? '').trim().slice(0, 60),
        ip: String(n.ip).trim(),
        colibriPort: validPort(n.colibriPort) ? n.colibriPort : undefined,
        appPort: validPort(n.appPort) ? n.appPort : undefined,
    }));
    try {
        if (clean.length > 0) window.localStorage.setItem(MESH_STORAGE_KEY, JSON.stringify(clean));
        else window.localStorage.removeItem(MESH_STORAGE_KEY);
    } catch { /* storage blocked: the list stays empty */ }
    reloadMeshNodes();
    try { window.dispatchEvent(new Event(MESH_NODES_EVENT)); } catch { /* no window */ }
}

export interface NetworkPreset {
    id: string;
    label: string;
    url: string;
    badge: string;
    description: string;
    recommendedFor?: string;
}

/** Address presets for the Colibrì field: the loopback default, plus the configured host and relay when there are any. */
export function getColibriNetworkPresets(): NetworkPreset[] {
    const presets: NetworkPreset[] = [
        {
            id: 'local_loopback',
            label: 'This PC (127.0.0.1)',
            url: `http://127.0.0.1:${DEFAULT_COLIBRI_PORT}`,
            badge: 'Loopback',
            description: 'The Colibrì server on this machine',
            recommendedFor: 'The PC that runs Colibrì',
        },
    ];
    const host = ONYX_MESH_TOPOLOGY.g7;
    if (isMeshNodeConfigured(host)) {
        presets.push({
            id: 'configured_host',
            label: `${host.name} (${host.ip})`,
            url: `http://${host.ip}:${host.colibriPort}`,
            badge: 'LAN host',
            description: 'Colibrì host from your mesh list. The browser blocks plain HTTP LAN addresses from an HTTPS page',
        });
    }
    const relay = ONYX_MESH_TOPOLOGY.second_laptop;
    if (isMeshNodeConfigured(relay)) {
        presets.push({
            id: 'configured_relay',
            label: `${relay.name} (${relay.ip})`,
            url: `http://${relay.ip}:${relay.colibriPort}`,
            badge: 'Relay',
            description: 'Relay node from your mesh list',
        });
    }
    return presets;
}

/** Same as getColibriNetworkPresets() at load time; call the function for a fresh list. */
export const COLIBRI_NETWORK_PRESETS: NetworkPreset[] = getColibriNetworkPresets();

/**
 * Tests connection to a specific mesh node. A node without an address is "Not configured" and nothing is fetched.
 */
export async function pingMeshNode(node: MeshDeviceNode): Promise<{ ok: boolean; latencyMs: number; status: string }> {
    if (!isMeshNodeConfigured(node)) return { ok: false, latencyMs: 0, status: 'Not configured' };
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
        const res = await fetch(`http://${node.ip}:${node.colibriPort}/health`, {
            method: 'GET',
            signal: controller.signal,
        });
        const latencyMs = Math.round(performance.now() - start);
        if (res.ok) {
            return { ok: true, latencyMs, status: 'Online' };
        }
        return { ok: false, latencyMs, status: `HTTP ${res.status}` };
    } catch (err: any) {
        const latencyMs = Math.round(performance.now() - start);
        return { ok: false, latencyMs, status: err?.name === 'AbortError' ? 'Timeout' : 'Unreachable' };
    } finally {
        clearTimeout(timer);
    }
}

reloadMeshNodes();
