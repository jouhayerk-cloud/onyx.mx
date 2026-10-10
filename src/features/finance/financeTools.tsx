import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { Search, Filter, SlidersHorizontal, Hourglass, DollarSign } from 'lucide-react';
import { tr } from '../../lib/i18n';
import {
    financeSearchTermAtom,
    isPaymentsSearchOpenAtom,
    isPaymentFiltersOpenAtom,
    isPaymentActionPanelOpenAtom,
    isPaymentUpcomingOpenAtom,
    currencyModeAtom
} from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

/** Builds the finance view tool entries, wired to its search, filter, action and upcoming state. */

export function useFinanceTools(): ToolDescriptor[] {
    const [search, setSearch] = useAtom(financeSearchTermAtom);
    const [isSearchOpen, setIsSearchOpen] = useAtom(isPaymentsSearchOpenAtom);
    const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPaymentFiltersOpenAtom);
    const [isActionOpen, setIsActionOpen] = useAtom(isPaymentActionPanelOpenAtom);
    const [isUpcomingOpen, setIsUpcomingOpen] = useAtom(isPaymentUpcomingOpenAtom);
    const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);

    const tools: ToolDescriptor[] = [];

    tools.push({
        id: 'finance.search',
        moduleId: 'finance',
        label: tr('Search Payments'),
        icon: Search,
        kind: 'toggle',
        group: tr('Find'),
        order: 10,
        pinned: true,
        pressed: isSearchOpen || !!search,
        run: () => setIsSearchOpen(!isSearchOpen)
    });

    tools.push({
        id: 'finance.filters',
        moduleId: 'finance',
        label: tr('Filter Payments'),
        icon: Filter,
        kind: 'toggle',
        group: tr('Filters'),
        order: 20,
        pinned: true,
        pressed: isFiltersOpen,
        run: () => setIsFiltersOpen(!isFiltersOpen)
    });

    tools.push({
        id: 'finance.settings',
        moduleId: 'finance',
        label: tr('Settings & Logic'),
        icon: SlidersHorizontal,
        kind: 'toggle',
        group: tr('Tools'),
        order: 30,
        pinned: true,
        pressed: isActionOpen,
        run: () => setIsActionOpen(!isActionOpen)
    });

    tools.push({
        id: 'finance.upcoming',
        moduleId: 'finance',
        label: tr('Upcoming Payments'),
        icon: Hourglass,
        kind: 'toggle',
        group: tr('View'),
        order: 40,
        pinned: true,
        pressed: isUpcomingOpen,
        run: () => setIsUpcomingOpen(!isUpcomingOpen)
    });

    tools.push({
        id: 'finance.currency',
        moduleId: 'finance',
        label: currencyMode === 'MXN' ? tr('Switch to USD') : tr('Switch to MXN'),
        title: `${tr('Switch to')} ${currencyMode === 'MXN' ? 'USD' : 'MXN'}`,
        icon: DollarSign,
        kind: 'action',
        group: tr('Settings'),
        order: 50,
        pinned: true,
        run: () => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')
    });

    return tools;
}

export const FinanceToolsRegistrar: React.FC = () => {
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const tools = useFinanceTools();

    useRegisterTools('finance', tools, islandEnabled);

    return null;
};
