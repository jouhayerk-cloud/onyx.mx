import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai/react';
import { userAtom } from '../../lib/atoms';
import { useShapeTypeLibrary } from '../../lib/shapeTypeLibraryStore';
import type { LibraryRow } from '../../lib/shapeTypeLibrary';
import { ShapeTypePicker } from './hairline/ShapeTypePicker';
import type { PickerValue } from './hairline/types';

/**
 * The hairline shape + type selector of Add Entry. It reads the same rows as the datalist suggestions (the synced
 * inventory) plus the pairs saved by hand (table shape_type_library, Developer and Admin write), and it writes only
 * the two form fields through onChange: the Shape and Type inputs next to it stay as they are and stay in sync.
 * Mounted only when the library is wanted (Add Entry), so Edit Entry makes no extra request.
 */
export const ShapeLibraryField: React.FC<{
    value: PickerValue;
    onChange: (v: PickerValue) => void;
    rows: readonly any[] | undefined;
    disabled?: boolean;
}> = ({ value, onChange, rows, disabled }) => {
    const user = useAtomValue(userAtom) as { role?: string } | null;
    const canSave = user?.role === 'Developer' || user?.role === 'Admin';

    const libraryRows = useMemo<LibraryRow[]>(() => (rows || []).map(r => {
        const d = r?.data && typeof r.data === 'object' ? r.data : (r || {});
        return {
            shape: d.shape,
            shortDescription: d.shortDescription,
            short_description: d.short_description,
            widthCm: d.widthCm, width_cm: d.width_cm,
            heightCm: d.heightCm, height_cm: d.height_cm,
            lengthCm: d.lengthCm, length_cm: d.length_cm,
            depthCm: d.depthCm, depth_cm: d.depth_cm,
            is_hidden: d.is_hidden,
        };
    }), [rows]);

    const { library, loading, save } = useShapeTypeLibrary(libraryRows);

    return (
        <ShapeTypePicker
            value={value}
            onChange={onChange}
            library={library}
            canSave={canSave}
            onSave={save}
            disabled={disabled}
            loading={loading}
        />
    );
};
