import React from 'react';

interface HighlightWrapperProps {
  isChanged: boolean;
  active: boolean;
  children: React.ReactNode;
  fieldLabel?: string;
  onClick?: () => void;
  className?: string;
}

export const HighlightWrapper: React.FC<HighlightWrapperProps> = ({
  isChanged,
  active,
  children,
  fieldLabel,
  onClick,
  className = '',
}) => {
  if (!active || !isChanged) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span
      onClick={onClick}
      title={fieldLabel ? `Modified: ${fieldLabel} (Click to edit)` : 'Modified value'}
      className={`inline-flex items-center relative group bg-amber-100/90 text-amber-950 px-1 py-0.5 rounded ring-1 ring-amber-400/60 shadow-2xs cursor-pointer hover:bg-amber-200 transition-colors print:bg-transparent print:text-inherit print:ring-0 print:p-0 print:shadow-none ${className}`}
    >
      {children}
      {/* Indicator dot */}
      <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full ml-1 print:hidden" />
    </span>
  );
};
