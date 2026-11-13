import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast } from '../components/primitives/Toast';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'danger', title = null) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    const normalizedType = type === 'error' ? 'danger' : type;
    setToasts(prev => [...prev, { id, message, type: normalizedType, title }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Toast container - aria-live polite */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-24 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto animate-fadeInUp">
            <Toast
              id={toast.id}
              type={toast.type}
              title={toast.title}
              message={toast.message}
              onDismiss={dismissToast}
              duration={4000}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { showToast: () => {}, dismissToast: () => {} };
  return ctx;
}
