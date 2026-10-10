import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { getDefaultStore } from 'jotai';

import {
  userAtom,
  activeViewAtom,
  inventorySearchTermAtom
} from '../../../lib/atoms';
import { allToolsAtom } from '../../../lib/toolRegistry';
import { onyxRobotDeviceIdAtom } from '../agentState';

export interface AppContextSnapshot {
  activeView: string;
  role: string;
  seasonInScope: '825' | '826' | 'TODO_season_atom';
  readout: {
    inventory: 'TODO_inventory_readout';
    archived: 'TODO_archived_readout';
  };
  selectionCount: 'TODO_selection_count';
  activeFilters: 'TODO_active_filters';
  searchText: string;
  sidebarState: 'TODO_sidebar_state';
  unreadNotifications: 'TODO_unread_notifications';
  tools: Array<{ id: string; pressed?: boolean }>;
  robotStatus: { id: string | null; online: 'TODO_robot_online_status' };
}

/** Hook returning the current app context snapshot (view, role, search, tools, robot), memoized. */
export function useAppContext(): AppContextSnapshot {
  const user = useAtomValue(userAtom);
  const activeView = useAtomValue(activeViewAtom);
  const searchText = useAtomValue(inventorySearchTermAtom);
  const allTools = useAtomValue(allToolsAtom);
  const robotId = useAtomValue(onyxRobotDeviceIdAtom);

  return useMemo(() => ({
    activeView,
    role: user?.role || 'Client',
    seasonInScope: 'TODO_season_atom',
    readout: {
      inventory: 'TODO_inventory_readout',
      archived: 'TODO_archived_readout'
    },
    selectionCount: 'TODO_selection_count',
    activeFilters: 'TODO_active_filters',
    searchText: searchText || '',
    sidebarState: 'TODO_sidebar_state',
    unreadNotifications: 'TODO_unread_notifications',
    tools: allTools.map(t => ({ id: t.id, pressed: t.pressed })),
    robotStatus: { id: robotId, online: 'TODO_robot_online_status' }
  }), [activeView, user?.role, searchText, allTools, robotId]);
}

export function getAppContextSnapshot(store: ReturnType<typeof getDefaultStore>): AppContextSnapshot {
  const user = store.get(userAtom);
  const activeView = store.get(activeViewAtom);
  const searchText = store.get(inventorySearchTermAtom);
  const allTools = store.get(allToolsAtom);
  const robotId = store.get(onyxRobotDeviceIdAtom);

  return {
    activeView,
    role: user?.role || 'Client',
    seasonInScope: 'TODO_season_atom',
    readout: {
      inventory: 'TODO_inventory_readout',
      archived: 'TODO_archived_readout'
    },
    selectionCount: 'TODO_selection_count',
    activeFilters: 'TODO_active_filters',
    searchText: searchText || '',
    sidebarState: 'TODO_sidebar_state',
    unreadNotifications: 'TODO_unread_notifications',
    tools: allTools.map(t => ({ id: t.id, pressed: t.pressed })),
    robotStatus: { id: robotId, online: 'TODO_robot_online_status' }
  };
}
