import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const HADIS_LIST = [
  {
    text: '"Islam dibangun atas lima perkara: bersaksi tiada tuhan selain Allah, mendirikan shalat, menunaikan zakat, puasa Ramadan, dan haji."',
    source: '(HR. Bukhari & Muslim)',
  },
  {
    text: '"Ambillah zakat dari sebagian harta mereka, dengan zakat itu kamu membersihkan dan menyucikan mereka."',
    source: '(QS. At-Taubah: 103)',
  },
  {
    text: '"Sedekah tidak akan mengurangi harta."',
    source: '(HR. Muslim)',
  },
  {
    text: '"Lindungilah dirimu dari api neraka walau hanya dengan bersedekah sebutir kurma."',
    source: '(HR. Bukhari)',
  },
  {
    text: '"Tidaklah suatu kaum menahan zakat, melainkan mereka akan diuji oleh Allah dengan kekeringan."',
    source: '(HR. Thabrani)',
  },
];

const INTERVAL_MS = 6000;

export default function HadisSlider() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const goNext = useCallback(() => {
    setDirection('next');
    setCurrent((prev) => (prev + 1) % HADIS_LIST.length);
  }, []);

  const goPrev = useCallback(() => {
    setDirection('prev');
    setCurrent((prev) => (prev - 1 + HADIS_LIST.length) % HADIS_LIST.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(goNext, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [goNext]);

  const hadis = HADIS_LIST[current];

  return (
    <div className="relative overflow-hidden rounded-xl bg-primary/5 border border-primary/15 p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-primary tracking-wide uppercase">
          Hadis Tentang Zakat
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="p-1 rounded-full hover:bg-primary/10 transition-colors text-primary/60 hover:text-primary"
            aria-label="Hadis sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goNext}
            className="p-1 rounded-full hover:bg-primary/10 transition-colors text-primary/60 hover:text-primary"
            aria-label="Hadis berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content with fade animation */}
      <div
        key={current}
        className="animate-fade-in"
      >
        <p className="text-base sm:text-lg leading-relaxed text-foreground/90 italic mb-2">
          {hadis.text}
        </p>
        <p className="text-sm text-muted-foreground font-medium">
          {hadis.source}
        </p>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {HADIS_LIST.map((_, i) => (
          <button
            key={i}
            onClick={() => { setDirection(i > current ? 'next' : 'prev'); setCurrent(i); }}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i === current ? 'bg-primary w-4' : 'bg-primary/25 hover:bg-primary/40'
            }`}
            aria-label={`Hadis ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
