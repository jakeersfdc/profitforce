import React from 'react';

type Props = {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

export default function Button({ children, onClick, className = '' }: Props) {
  return (
    <button onClick={onClick} className={`px-3 py-2 rounded ${className}`}>
      {children}
    </button>
  );
}
