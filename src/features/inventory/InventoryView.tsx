import React from 'react';
import { UnifiedInventoryView } from './UnifiedInventoryView';

export { ItemDetailsModal } from './ItemDetailsModal';
export type { ItemDetailsModalProps } from './ItemDetailsModal';

export const InventoryView: React.FC = () => {
    return <UnifiedInventoryView />;
};
