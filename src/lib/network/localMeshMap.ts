/**
 * Onyx-mx Local Network Mesh Topology & Device Address Map
 * 
 * Auto-wires local LAN devices on the G7 Wi-Fi network for Colibrì MoE NVMe streaming,
 * LAN mesh relay routing, and cross-device testing.
 * 
 * Device Inventory:
 * - G7 (Host / Primary Colibrì NVMe Server)  : 192.0.2.71   (MAC: 02:00:00:00:00:01)
 * - Second_Laptop (Relay Node / Client)     : 192.0.2.67   (MAC: 02:00:00:00:00:02)
 * - Phone (Ramses iPhone / Mobile Client)   : 192.0.2.100  (MAC: 02:00:00:00:00:03)
 * 
 * Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
 * Co-Authored-By: Antigravity <noreply@google.com>
 */

export interface MeshDeviceNode {
    id: 'g7' | 'second_laptop' | 'phone';
    name: string;
    hostname: string;
    ip: string;
    mac: string;
    role: 'primary_host' | 'relay_node' | 'mobile_client';
    colibriPort: number;
    appPort: number;
    description: string;
    relayCommand?: string;
}

export const ONYX_MESH_TOPOLOGY: Record<'g7' | 'second_laptop' | 'phone', MeshDeviceNode> = {
    g7: {
        id: 'g7',
        name: 'G7 Laptop (Ramses)',
        hostname: 'G7',
        ip: '192.0.2.71',
        mac: '02:00:00:00:00:01',
        role: 'primary_host',
        colibriPort: 8082,
        appPort: 1001,
        description: 'Primary Colibrì MoE NVMe Server & Onyx-mx Web Application Host',
    },
    second_laptop: {
        id: 'second_laptop',
        name: "Second Laptop",
        hostname: 'Second_Laptop',
        ip: '192.0.2.67',
        mac: '02:00:00:00:00:02',
        role: 'relay_node',
        colibriPort: 8082,
        appPort: 1001,
        description: 'Secondary Machine & Local Mesh Relay Server (Bypasses Browser CORS / PNA)',
        relayCommand: 'powershell -ExecutionPolicy Bypass -File .\\scripts\\start-colibri-relay.ps1 -Upstream "http://192.0.2.71:8082"',
    },
    phone: {
        id: 'phone',
        name: "Ramses iPhone",
        hostname: 'Phone',
        ip: '192.0.2.100',
        mac: '02:00:00:00:00:03',
        role: 'mobile_client',
        colibriPort: 8082,
        appPort: 1001,
        description: 'Mobile Companion Client (iOS Web / Safari & LiteRT Native Bridge)',
    },
};

export const MESH_NODES: MeshDeviceNode[] = [
    ONYX_MESH_TOPOLOGY.g7,
    ONYX_MESH_TOPOLOGY.second_laptop,
    ONYX_MESH_TOPOLOGY.phone,
];

export const PRIMARY_COLIBRI_HOST = `http://${ONYX_MESH_TOPOLOGY.g7.ip}:${ONYX_MESH_TOPOLOGY.g7.colibriPort}`;
export const PRIMARY_APP_URL = `https://${ONYX_MESH_TOPOLOGY.g7.ip}:${ONYX_MESH_TOPOLOGY.g7.appPort}/onyx.mx/`;

export interface NetworkPreset {
    id: string;
    label: string;
    url: string;
    badge: string;
    description: string;
}

export const COLIBRI_NETWORK_PRESETS: NetworkPreset[] = [
    {
        id: 'local_loopback',
        label: '🏠 Localhost',
        url: 'http://127.0.0.1:8082',
        badge: 'Loopback',
        description: 'Direct local daemon on this machine',
    },
    {
        id: 'g7_host',
        label: '🌐 G7 Host (192.0.2.71)',
        url: `http://${ONYX_MESH_TOPOLOGY.g7.ip}:8082`,
        badge: 'Ramses Laptop',
        description: 'Primary Colibrì NVMe MoE server across G7 Wi-Fi',
    },
    {
        id: 'martha_relay',
        label: "🔄 Martha's Relay (127.0.0.1:8082)",
        url: 'http://127.0.0.1:8082',
        badge: 'Mesh Relay',
        description: 'Local relay on Martha machine forwarding to 192.0.2.71',
    },
    {
        id: 'martha_direct',
        label: "💻 Martha Direct (192.0.2.67)",
        url: `http://${ONYX_MESH_TOPOLOGY.second_laptop.ip}:8082`,
        badge: '192.0.2.67',
        description: 'Direct call to second laptop relay endpoint',
    },
];

/**
 * Tests connection to a specific mesh node
 */
export async function pingMeshNode(node: MeshDeviceNode): Promise<{ ok: boolean; latencyMs: number; status: string }> {
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
