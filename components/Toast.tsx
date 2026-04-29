'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const bg = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#0054A6';

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        background: bg,
        color: 'white',
        padding: '12px 20px',
        borderRadius: 10,
        fontSize: '0.875rem',
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-12px)',
        transition: 'opacity 0.3s, transform 0.3s',
        maxWidth: 400,
      }}
    >
      {message}
    </div>
  );
}
