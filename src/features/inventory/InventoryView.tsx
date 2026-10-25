import React from 'react';
import { UnifiedInventoryView } from './UnifiedInventoryView';
import { ErrorBoundary } from '../../components/ErrorBoundary';

export { ItemDetailsModal } from './ItemDetailsModal';
export type { ItemDetailsModalProps } from './ItemDetailsModal';

export const InventoryView: React.FC = () => {
    return (
        <ErrorBoundary fallbackTitle="Inventory View Error">
            <UnifiedInventoryView />
        </ErrorBoundary>
    );
};
