import { PaymentDestination } from './Types';
import { fastCashIcon, boaCardIcon, bbvaMarthaIcon, bbvaRamsesIcon } from '../features/dashboard/paymentsIcons.svg';

export const destinationsConfig: Record<PaymentDestination, {
    icon: string;
    name: string;
    calculateCommission: (amount: number) => number;
}> = {
    [PaymentDestination.BoA_Employee]: {
        icon: boaCardIcon,
        name: 'Bank of America',
        calculateCommission: () => 100.00 // Placeholder: 100 MXN flat fee
    },
    [PaymentDestination.BBVA_Martha]: {
        icon: bbvaMarthaIcon,
        name: 'BBVA Martha',
        calculateCommission: () => 25.00 // Placeholder: 25 MXN flat fee
    },
    [PaymentDestination.BBVA_Ramses]: {
        icon: bbvaRamsesIcon,
        name: 'BBVA Ramses',
        calculateCommission: () => 25.00 // Placeholder: 25 MXN flat fee
    },
    [PaymentDestination.Fast_Cash_Wire]: {
        icon: fastCashIcon,
        name: 'Direct Wire',
        calculateCommission: (amount: number) => amount * 0.10 // Placeholder: 10%
    },
};
