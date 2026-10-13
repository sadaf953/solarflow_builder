// Shared SolarFlow demo wordmark for login and portal headers.
import logoBlue from '../assets/solarflow-logo-blue.svg';
import logoWhite from '../assets/solarflow-logo-white.svg';

const HEIGHTS = {
    sm: 'h-6',    // compact portal headers
    md: 'h-8',    // sidebar
    lg: 'h-11',   // login screen
};

export default function BrandMark({
    label = null,          // e.g. "Vendor Portal" - shown beside the mark
    variant = 'blue',      // 'blue' on light surfaces, 'white' on dark
    size = 'sm',
    className = '',
}) {
    const onDark = variant === 'white';

    return (
        <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
            <img
                src={onDark ? logoWhite : logoBlue}
                alt="SolarFlow Solar Energy"
                className={`${HEIGHTS[size] || HEIGHTS.sm} w-auto shrink-0 select-none`}
                draggable="false"
            />
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
