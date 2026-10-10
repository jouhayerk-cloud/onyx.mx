import React from 'react';
import { useAtomValue } from 'jotai/react';
import { userAtom } from '../../lib/atoms';
import type { TypeEntry } from '../../lib/typeLibrary';
import { ShapeTypePicker, type TypePickerValue } from './hairline/ShapeTypePicker';

/**
 * The hairline Type selector of Add Entry. It is presentational: the library comes from the form (useTypeLibrary),
 * and it writes only the Type field through onChange. The Shape input next to it stays as it is.
 * Only the role is read here, from userAtom, to say who may save a Type to the library.
 */
export const ShapeLibraryField: React.FC<{
    value: TypePickerValue;
    onChange: (patch: TypePickerValue) => void;
    library: readonly TypeEntry[];
    loading: boolean;
    onSave: (type: string) => void | Promise<void>;
    disabled?: boolean;
}> = ({ value, onChange, library, loading, onSave, disabled }) => {
    const user = useAtomValue(userAtom) as { role?: string } | null;
    const canSave = user?.role === 'Developer' || user?.role === 'Admin';

    return (
        <ShapeTypePicker
            value={value}
            onChange={onChange}
            library={library}
            canSave={canSave}
            onSave={onSave}
            disabled={disabled}
            loading={loading}
        />
    );
};
