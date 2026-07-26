import React, { useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { picoRealtimePayloadAtom, picoWorkflowStateAtom, picoRssiThresholdAtom, PicoScanEvent } from '../../../lib/picoAtoms';
import { activeViewAtom } from '../../../lib/atoms';
import { supabase } from '../../../lib/supabase';

interface PicoRealtimeControllerProps {
  onLogScan?: (log: PicoScanEvent & { actionTaken?: string }) => void;
}

export const PicoRealtimeController: React.FC<PicoRealtimeControllerProps> = ({ onLogScan }) => {
  const [realtimePayload, setRealtimePayload] = useAtom(picoRealtimePayloadAtom);
  const [activeWorkflow] = useAtom(picoWorkflowStateAtom);
  const [rssiThreshold] = useAtom(picoRssiThresholdAtom);
  const setActiveView = useSetAtom(activeViewAtom);

  useEffect(() => {
    // 1. Subscribe to Supabase Realtime WebSocket broadcast for live M5Stack terminals
    const channel = supabase
      .channel('pico-bridge-global')
      .on('broadcast', { event: 'SCAN_EVENT' }, ({ payload }) => {
        if (payload && payload.tagId) {
          handleIncomingScan(payload as PicoScanEvent);
        }
      })
      .on('broadcast', { event: 'STATUS_HEARTBEAT' }, ({ payload }) => {
        // Update device session status in console/logs
        console.log('[PicoBridge Telemetry] Heartbeat:', payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeWorkflow, rssiThreshold]);

  // Handle local simulated scan payloads or incoming broadcast payloads
  useEffect(() => {
    if (realtimePayload) {
      handleIncomingScan(realtimePayload);
      // Clear payload after processing
      setRealtimePayload(null);
    }
  }, [realtimePayload]);

  const handleIncomingScan = (event: PicoScanEvent) => {
    // 1. Enforce RSSI cutoff for UHF RFID scans to prevent distant tag bleed
    if (event.scanType === 'UHF_RFID' && event.rssi !== undefined && event.rssi < rssiThreshold) {
      console.warn(`[PicoBridge] Ignored UHF RFID scan ${event.tagId} (RSSI ${event.rssi} dBm below threshold ${rssiThreshold} dBm)`);
      if (onLogScan) {
        onLogScan({ ...event, actionTaken: `IGNORED_LOW_RSSI (${event.rssi} dBm)` });
      }
      return;
    }

    let actionTaken = 'LOGGED_TO_AUDIT';

    // 2. Dispatch dynamic action based on active workflow
    switch (activeWorkflow) {
      case 'idle':
        // Auto-navigate to inventory and focus scanned tag
        setActiveView('inventory');
        actionTaken = `NAVIGATED_TO_ITEM (${event.tagId})`;
        break;

      case 'packing':
        // Append item to target crate manifest
        actionTaken = `APPENDED_TO_CRATE (${event.tagId})`;
        break;

      case 'labeling':
        // Trigger thermal BLE label spooler
        actionTaken = `QUEUED_FOR_THERMAL_PRINT (${event.tagId})`;
        break;

      case 'cataloging':
        // Trigger photo/voice capture sync
        actionTaken = `METADATA_BOUND (${event.tagId})`;
        break;

      case 'tracking':
        actionTaken = `LOCATION_LOGGED (${event.tagId})`;
        break;

      default:
        actionTaken = `INTERCEPTED (${event.tagId})`;
        break;
    }

    console.log(`[PicoBridge Realtime] Processed scan ${event.tagId} -> Action: ${actionTaken}`);

    if (onLogScan) {
      onLogScan({ ...event, actionTaken });
    }
  };

  // This component renders silently in the background
  return null;
};
