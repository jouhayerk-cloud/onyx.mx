/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import React from 'react';
import { useAtom } from 'jotai/react';
import { dashboardActiveTabAtom } from '../../lib/atoms';
import { PaymentsView } from './PaymentsView';
import { ShippingView } from './ShippingView';
import { AcquisitionsView } from './AcquisitionsView';


export function Dashboard() {
    const [activeTab] = useAtom(dashboardActiveTabAtom);

    const renderContent = () => {
        // Dashboard acts as a Live Feed for items in progress
        switch (activeTab) {
            case 'acquisitions':
                return <AcquisitionsView mode="live" />;
            case 'payments':
                return <PaymentsView mode="live" />;
            case 'shipping':
                return <ShippingView mode="live" />;
            default:
                return <AcquisitionsView mode="live" />;
        }
    };

    return (
        <div className="dashboard">
            {renderContent()}
        </div>
    );
}