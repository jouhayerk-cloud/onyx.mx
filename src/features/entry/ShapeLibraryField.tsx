import React from 'react';
import { useAtomValue } from 'jotai/react';
import { userAtom } from '../../lib/atoms';
import type { TypeEntry } from '../../lib/typeLibrary';
import type { Dims } from './hairline/types';
import { ShapeTypePicker, type TypePickerValue, type ShapeTypePickerProps } from './hairline/ShapeTypePicker';

export interface ShapeLibraryFieldProps {
    value: TypePickerValue;
    onChange: (patch: Partial<TypePickerValue>) => void;
    library: readonly TypeEntry[];
    loading?: boolean;
    onSave: (type: string) => void | Promise<void>;
    disabled?: boolean;
    dims?: Dims | null;
    canSave?: boolean;
}

/**
 * The hairline Type selector of Add Entry. It is presentational: the library comes from the form (useTypeLibrary),
 * and it writes Type and Shape fields through onChange.
 * Only the role is read here, from userAtom, to say who may save a Type to the library if not explicitly provided.
 */
export const ShapeLibraryField: React.FC<ShapeLibraryFieldProps> = ({
    value,
    onChange,
    library,
    loading = false,
    onSave,
    disabled = false,
    dims = null,
    canSave: canSaveProp,
}) => {
    const user = useAtomValue(userAtom) as { role?: string } | null;
    const canSave = canSaveProp ?? (user?.role === 'Developer' || user?.role === 'Admin');

    return (
        <ShapeTypePicker
            value={value}
            onChange={onChange}
            library={library}
            canSave={canSave}
            onSave={onSave}
            disabled={disabled}
            loading={loading}
            dims={dims}
        />
    );
};

export type { TypePickerValue, ShapeTypePickerProps };
