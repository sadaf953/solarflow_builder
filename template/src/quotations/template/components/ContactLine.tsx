import React from 'react';

interface ContactLineProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A layout-only contact row shared by the on-screen preview and PDF export. */
export const ContactLine: React.FC<ContactLineProps> = ({ icon, children, className = '' }) => (
  <div className={`q-contact-line ${className}`}>
    <div className="q-contact-content" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, lineHeight: 1.15 }}>
      <span className="q-contact-icon" aria-hidden="true" style={{ display: 'inline-flex', flex: '0 0 auto', alignItems: 'center', justifyContent: 'center', width: '1.15em', height: '1.15em', lineHeight: 0 }}>{icon}</span>
      <span className="q-contact-value" style={{ minWidth: 0 }}>{children}</span>
    </div>
  </div>
);
