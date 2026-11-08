import React, { useState } from 'react';

/**
 * Obálka knihy. Když má kniha obrázek obálky, zobrazí ho. Když ne (nebo se
 * nenačte), vykreslí „plátěnou vazbu“ v barvě odvozené z názvu – každá kniha
 * tak má vlastní, pořád stejnou barvu.
 */

interface BookCoverProps {
  title: string;
  authors?: string[];
  coverUrl?: string;
  /** compact = jen iniciála (malé náhledy), full = název a autor. */
  variant?: 'compact' | 'full';
  className?: string;
}

// Barvy plátěných vazeb: [vazba, text]
const CLOTH_COLORS: Array<[string, string]> = [
  ['#7a2f2f', '#f3e3c7'], // vínová
  ['#2f4f3f', '#efe6cc'], // lahvově zelená
  ['#2c3c5a', '#ece2c8'], // námořnická modrá
  ['#8c6a2c', '#fbf1d8'], // okrová
  ['#5b3654', '#f1e2d2'], // švestková
  ['#2f5f63', '#ece6cf'], // petrolejová
  ['#6d4c36', '#f5e8cf'], // hnědá kůže
  ['#43465f', '#ebe4d0'], // břidlicová
  ['#9a4b2b', '#fbead2'], // cihlová
];

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export const BookCover: React.FC<BookCoverProps> = ({
  title,
  authors = [],
  coverUrl,
  variant = 'full',
  className = '',
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [cloth, ink] = CLOTH_COLORS[hashString(title) % CLOTH_COLORS.length];
  const author = authors.filter((a) => a && a !== 'Neznámý autor').join(', ');
  const initial = title.trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className={`relative overflow-hidden rounded-[3px] rounded-r-md shadow-[0_1px_2px_rgba(40,25,10,0.25),0_4px_10px_-4px_rgba(40,25,10,0.35)] ${className}`}
      style={{ backgroundColor: cloth, color: ink, containerType: 'inline-size' }}
      aria-hidden="true"
    >
      {/* Hřbet a textura plátna */}
      <div className="absolute inset-y-0 left-0 w-[9%] bg-black/25" />
      <div className="absolute inset-y-0 left-[9%] w-px bg-white/15" />
      <div
        className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, #000 0 1px, transparent 1px 3px)',
        }}
      />

      {variant === 'compact' ? (
        <div className="absolute inset-0 pl-[9%] flex items-center justify-center">
          <span className="font-display font-semibold leading-none" style={{ fontSize: 'clamp(12px, 45cqw, 40px)' }}>
            {initial}
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 pl-[14%] pr-[8%] py-[12%] flex flex-col">
          <div className="h-px w-full opacity-60" style={{ backgroundColor: ink }} />
          <p
            className="mt-[10%] font-display font-semibold leading-[1.1] line-clamp-4 break-words"
            style={{ fontSize: 'clamp(9px, 13cqw, 22px)' }}
          >
            {title}
          </p>
          {author && (
            <p
              className="mt-auto uppercase tracking-wider opacity-80 line-clamp-2 leading-tight"
              style={{ fontSize: 'clamp(6px, 7cqw, 11px)' }}
            >
              {author}
            </p>
          )}
          <div className="mt-[8%] h-px w-full opacity-60" style={{ backgroundColor: ink }} />
        </div>
      )}

      {coverUrl && !imageFailed && (
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          onLoad={(e) => {
            // Některé služby místo chybějící obálky vrátí obrázek 1×1 px.
            if (e.currentTarget.naturalWidth < 10) setImageFailed(true);
            else setImageLoaded(true);
          }}
          onError={() => setImageFailed(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
};
