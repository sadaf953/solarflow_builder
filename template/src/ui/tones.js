// Colour tones shared by badges, tiles and section icons. Class names are
// written out in full so Tailwind can find them.
export const TONES = {
    stone: { soft: 'bg-stone-100 text-stone-700', border: 'border-stone-200' },
    orange: { soft: 'bg-orange-50 text-orange-700', border: 'border-orange-200' },
    yellow: { soft: 'bg-yellow-50 text-yellow-800', border: 'border-yellow-200' },
    green: { soft: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
    blue: { soft: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
    red: { soft: 'bg-red-50 text-red-700', border: 'border-red-200' },
};

export const tone = name => TONES[name] || TONES.stone;
