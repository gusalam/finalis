import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import logo from '@/assets/logo-masjid.webp';

const HADIS_LIST = [
  {
    arabic: 'بُنِيَ الإِسْلاَمُ عَلَى خَمْسٍ: شَهَادَةِ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ، وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ، وَإِقَامِ الصَّلاَةِ، وَإِيتَاءِ الزَّكَاةِ، وَصَوْمِ رَمَضَانَ، وَحَجِّ الْبَيْتِ',
    text: '"Islam dibangun atas lima perkara: bersaksi tiada tuhan selain Allah, mendirikan shalat, menunaikan zakat, puasa Ramadan, dan haji."',
    source: '(HR. Bukhari & Muslim)',
  },
  {
    arabic: 'خُذْ مِنْ أَمْوَالِهِمْ صَدَقَةً تُطَهِّرُهُمْ وَتُزَكِّيهِمْ بِهَا',
    text: '"Ambillah zakat dari sebagian harta mereka, dengan zakat itu kamu membersihkan dan menyucikan mereka."',
    source: '(QS. At-Taubah: 103)',
  },
  {
    arabic: 'مَا نَقَصَتْ صَدَقَةٌ مِنْ مَالٍ',
    text: '"Sedekah tidak akan mengurangi harta."',
    source: '(HR. Muslim)',
  },
  {
    arabic: 'اتَّقُوا النَّارَ وَلَوْ بِشِقِّ تَمْرَةٍ',
    text: '"Lindungilah dirimu dari api neraka walau hanya dengan bersedekah sebutir kurma."',
    source: '(HR. Bukhari)',
  },
  {
    arabic: 'مَا مَنَعَ قَوْمٌ الزَّكَاةَ إِلَّا ابْتَلَاهُمُ اللَّهُ بِالسِّنِينَ',
    text: '"Tidaklah suatu kaum menahan zakat, melainkan mereka akan diuji oleh Allah dengan kekeringan."',
    source: '(HR. Thabrani)',
  },
];

const INTERVAL_MS = 6000;

export default function HadisSlider() {
  const [current, setCurrent] = useState(0);

  const goNext = useCallback(() => {
    setCurrent((prev) => (prev + 1) % HADIS_LIST.length);
  }, []);

  const goPrev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + HADIS_LIST.length) % HADIS_LIST.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(goNext, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [goNext]);

  const hadis = HADIS_LIST[current];

  return (
    <div className="relative overflow-hidden rounded-xl bg-primary/5 border border-primary/15 p-4 sm:p-5">
      <div className="flex gap-4">
        {/* Logo */}
        <div className="flex-shrink-0">
          <img
            src={logo}
            alt="Logo Masjid Al-Ikhlas"
            className="w-[60px] h-[60px] rounded-full object-cover border-2 border-primary/20"
            loading="lazy"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
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

          {/* Hadis content */}
          <div key={current} className="animate-fade-in space-y-2">
            <p
              className="text-[20px] font-medium leading-[1.8] text-foreground/85 font-serif"
              style={{ direction: 'rtl', textAlign: 'right' }}
            >
              {hadis.arabic}
            </p>
            <p className="text-sm sm:text-base leading-relaxed text-foreground/80 italic">
              {hadis.text}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">
              {hadis.source}
            </p>
          </div>
        </div>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {HADIS_LIST.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
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
