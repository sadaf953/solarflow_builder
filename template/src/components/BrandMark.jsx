// App wordmark for the sidebar, login and portal headers: a sun mark and the
// client's app name.
import { BRANDING } from '../config/index.js';

const SIZES = {
    sm: { mark: 'h-6 w-6', text: 'text-base' },     // compact portal headers
    md: { mark: 'h-8 w-8', text: 'text-lg' },       // sidebar
    lg: { mark: 'h-11 w-11', text: 'text-2xl' },    // login screen
};

function SunMark({ className }) {
    return (
        <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
            <g fill="none" stroke="#ff8a00" strokeWidth="9" strokeLinecap="round">
                <circle cx="60" cy="60" r="23" />
                <path d="M60 17V7M60 113V103M17 60H7M113 60H103M30 30L23 23M97 97L90 90M30 90L23 97M97 23L90 30" />
            </g>
        </svg>
    );
}

export default function BrandMark({
    label = null,          // e.g. "Vendor Portal" - shown beside the mark
    variant = 'blue',      // 'blue' on light surfaces, 'white' on dark
    size = 'sm',
    className = '',
}) {
    const onDark = variant === 'white';
    const { mark, text } = SIZES[size] || SIZES.sm;

    return (
        <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
            <span className="flex min-w-0 items-center gap-1.5 select-none">
                <SunMark className={`${mark} shrink-0`} />
                <span className={`${text} truncate font-bold tracking-tight ${onDark ? 'text-white' : 'text-[#153b50]'}`}>
                    {BRANDING.appName}
                </span>
            </span>
            {label && (
                <>
                    <span className={`w-px self-stretch my-0.5 shrink-0 ${onDark ? 'bg-white/25' : 'bg-stone-200'}`} />
                    <span
                        className={`text-[9px] font-bold uppercase tracking-widest leading-tight truncate ${
                            onDark ? 'text-amber-300' : 'text-amber-600'
                        }`}
                    >
                        {label}
                    </span>
                </>
            )}
        </div>
    );
}
