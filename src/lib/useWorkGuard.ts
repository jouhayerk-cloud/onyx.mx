import { useEffect, useRef } from 'react';
import { setWorkHeld } from './workGuard';

/** Report `held` to the work guard while the calling component is mounted. */
export function useWorkGuard(held: boolean): void {
    const key = useRef<symbol>();
    if (!key.current) key.current = Symbol('work');
    useEffect(() => {
        const k = key.current!;
        setWorkHeld(k, held);
        return () => setWorkHeld(k, false);
    }, [held]);
}
