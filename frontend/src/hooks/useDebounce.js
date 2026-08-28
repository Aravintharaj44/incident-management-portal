import { useEffect, useState } from "react";

/**
 * Delays a rapidly-changing value.
 * Used by the incident search box so typing does not fire a request per
 * keystroke.
 */
export const useDebounce = (value, delay = 400) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};
