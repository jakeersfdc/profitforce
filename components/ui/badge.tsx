import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className = '', variant = 'default', ...props }, ref) => {
    const variantClasses = {
      default: 'border-transparent bg-blue-600 text-white',
      destructive: 'border-transparent bg-red-600 text-white',
      outline: 'border border-gray-300 bg-transparent text-gray-900',
      secondary: 'border-transparent bg-gray-200 text-gray-900',
    };

    return (
      <div
        ref={ref}
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
          variantClasses[variant]
        } ${className}`}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
