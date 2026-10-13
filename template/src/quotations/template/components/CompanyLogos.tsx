import solarflowLogoBlue from '../../../assets/solarflow-logo-blue.svg?inline';

interface LogoProps { customLogoUrl?: string; className?: string; }

export const SolarFlowLogo: React.FC<LogoProps> = ({ customLogoUrl, className = 'h-[75px]' }) => (
  <img src={customLogoUrl || solarflowLogoBlue} alt="SolarFlow Solar Energy" className={`object-contain ${className}`} />
);

// Render supplied artwork in both preview and PDF; never substitute duplicate text badges.
export const DemoQualityBadge: React.FC<LogoProps> = ({ customLogoUrl, className = 'h-12' }) => customLogoUrl ? (
  <img src={customLogoUrl} alt="GEDA symbol" className={`object-contain ${className}`} />
) : null;
export const DemoEnergyBadge: React.FC<LogoProps> = ({ customLogoUrl, className = 'h-12' }) => customLogoUrl ? (
  <img src={customLogoUrl} alt="Energy emblem" className={`object-contain ${className}`} />
) : null;
export const DemoPartnerLogo: React.FC<LogoProps> = ({ customLogoUrl, className = 'h-12' }) => (
  <img src={customLogoUrl || solarflowLogoBlue} alt="Partner logo" className={`object-contain ${className}`} />
);
export const DemoQuoteBanner: React.FC<LogoProps> = ({ customLogoUrl, className = '' }) => (
  <img src={customLogoUrl || `${import.meta.env.BASE_URL}banner.png`} alt="Solar energy banner" className={`w-full object-contain ${className}`} />
);
