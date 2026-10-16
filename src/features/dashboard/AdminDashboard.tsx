import React from 'react';
import { useAtomValue } from 'jotai';
import { userAtom } from '../../lib/atoms';
import DashboardView from './DashboardView';
import { AdminControlCenter } from './AdminControlCenter';

/**
 * Developer and Admin get the Admin Control Center (operators, edge fleet, financials).
 * ClientBoss and ClientAccounting keep the financial dashboard they had before the Control Center existed:
 * they must never land on the operator / fleet administration screens.
 */
export function AdminDashboard() {
    const user = useAtomValue(userAtom);
    const isStaff = user?.role === 'Developer' || user?.role === 'Admin';
    return isStaff ? <AdminControlCenter /> : <DashboardView />;
}

export default AdminDashboard;
