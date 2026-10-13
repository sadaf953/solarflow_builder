interface LogoProps { url?: string; className?: string; }

/** The company's logo, or its name in the logo's place when no logo was supplied. */
export const CompanyLogo: React.FC<LogoProps & { name: string }> = ({ url, name, className = 'h-[75px]' }) => (url ? (
  <img src={url} alt={name} className={`object-contain ${className}`} />
) : (
  <span className="block max-w-[320px] text-[24px] font-extrabold uppercase leading-tight tracking-tight text-[#0c3882]">{name}</span>
));

// Supplied artwork only, in both preview and PDF; nothing is drawn without it.
export const Emblem: React.FC<LogoProps & { alt: string }> = ({ url, alt, className = 'h-12' }) => (url ? (
  <img src={url} alt={alt} className={`object-contain ${className}`} />
) : null);

export const QuoteBanner: React.FC<LogoProps> = ({ url, className = '' }) => (url ? (
  <img src={url} alt="PM Surya Ghar solar scheme banner" className={`w-full object-contain ${className}`} />
) : null);
