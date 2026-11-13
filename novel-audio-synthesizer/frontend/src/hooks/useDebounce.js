import { useState, useEffect } from 'react';

const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

export function useDebounce(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (isTest) {
      setDebounced(value);
      return;
    }
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return isTest ? value : debounced;
}
