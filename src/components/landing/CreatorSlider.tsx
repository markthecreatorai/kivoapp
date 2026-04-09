import { useState, useEffect, useCallback, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Star, Music } from "lucide-react";

import creatorFitness from "@/assets/gallery/creator-fitness.jpg";
import creatorSpiritual from "@/assets/gallery/creator-spiritual.jpg";
import creatorBusiness from "@/assets/gallery/creator-business.jpg";
import creatorFashion from "@/assets/gallery/creator-fashion.jpg";
import creatorEducation from "@/assets/gallery/creator-education.jpg";

interface CreatorSlide {
  id: string;
  name: string;
  handle: string;
  followers: string;
  niche: string;
  nicheEmoji: string;
  imageUrl: string;
  storefrontName: string;
  storefrontBio: string;
}

const CREATORS: CreatorSlide[] = [
  {
    id: "1",
    name: "Marina Costa",
    handle: "@marinafitpro",
    followers: "1.2M",
    niche: "Fitness Creator",
    nicheEmoji: "💪",
    imageUrl: creatorFitness,
    storefrontName: "marinafitpro",
    storefrontBio: "Treinos e planos alimentares para transformar seu corpo e mente.",
  },
  {
    id: "2",
    name: "Sarah Perl",
    handle: "@hothighpriestess",
    followers: "2.4M",
    niche: "Spirituality Creator",
    nicheEmoji: "✨",
    imageUrl: creatorSpiritual,
    storefrontName: "priestess",
    storefrontBio: "follow my ig @hothighpriestess — grab my iconic workshop below 🔮",
  },
  {
    id: "3",
    name: "Lucas Andrade",
    handle: "@lucasbizcoach",
    followers: "890K",
    niche: "Business Coach",
    nicheEmoji: "📈",
    imageUrl: creatorBusiness,
    storefrontName: "lucasbiz",
    storefrontBio: "Mentorias e cursos para escalar seu negócio digital.",
  },
  {
    id: "4",
    name: "Isabella Menezes",
    handle: "@bellamoda",
    followers: "3.1M",
    niche: "Fashion Creator",
    nicheEmoji: "👗",
    imageUrl: creatorFashion,
    storefrontName: "bellamoda",
    storefrontBio: "Curadoria de moda e estilo de vida para mulheres autênticas.",
  },
  {
    id: "5",
    name: "Rafael Souza",
    handle: "@rafeducador",
    followers: "560K",
    niche: "Education Creator",
    nicheEmoji: "📚",
    imageUrl: creatorEducation,
    storefrontName: "rafeducador",
    storefrontBio: "Cursos online e mentorias para passar em concursos.",
  },
];

function PhoneMockup({ creator }: { creator: CreatorSlide }) {
  return (
    <div className="w-[160px] h-[320px] md:w-[180px] md:h-[360px] bg-background rounded-[28px] border-[3px] border-foreground/80 shadow-2xl shadow-black/30 overflow-hidden flex flex-col relative">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-foreground/80 rounded-full z-10" />
      <div className="pt-7 px-3 pb-1 flex items-center justify-center gap-1">
        <div className="flex gap-[3px]">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-[3px] h-[3px] rounded-full bg-foreground/40" />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-2.5 pb-2">
        <div className="text-center mb-2">
          <div className="w-10 h-10 mx-auto rounded-full overflow-hidden border-2 border-border mb-1">
            <img src={creator.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <p className="text-[9px] font-bold text-foreground truncate">{creator.storefrontName}</p>
          <p className="text-[7px] text-muted-foreground leading-tight line-clamp-2 px-1">{creator.storefrontBio}</p>
        </div>
        <div className="space-y-1.5">
          <div className="bg-muted/60 rounded-lg p-1.5">
            <div className="w-full h-12 bg-muted rounded-md mb-1 overflow-hidden">
              <img src={creator.imageUrl} alt="" className="w-full h-full object-cover opacity-70" />
            </div>
            <p className="text-[7px] font-bold text-foreground truncate">HOT HIGH RETREAT</p>
            <p className="text-[6px] text-muted-foreground line-clamp-2">The one week that will completely change your life forever.</p>
            <div className="flex items-center gap-1 mt-1">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-[6px] h-[6px] text-primary fill-primary" />
                ))}
              </div>
              <span className="text-[5px] text-muted-foreground">9999</span>
            </div>
            <div className="mt-1 bg-foreground text-background text-[6px] font-bold text-center py-0.5 rounded">
              Quantum Leap HERE
            </div>
          </div>
          <div className="bg-muted/60 rounded-lg p-1.5">
            <p className="text-[7px] font-bold text-foreground truncate">Manifest Magic Work...</p>
            <p className="text-[6px] text-muted-foreground line-clamp-2">More than something! You are a dream and Dreams die?</p>
            <div className="flex items-center gap-1 mt-1">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-[6px] h-[6px] text-primary fill-primary" />
                ))}
              </div>
              <span className="text-[5px] text-muted-foreground">9999</span>
            </div>
            <div className="mt-1 bg-foreground text-background text-[6px] font-bold text-center py-0.5 rounded">
              CHANGE YOUR LIFE NOW
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideCard({ creator, isActive }: { creator: CreatorSlide; isActive: boolean }) {
  return (
    <div
      className="relative select-none transition-all duration-[450ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{
        transform: isActive ? "scale(1)" : "scale(0.92)",
        opacity: isActive ? 1 : 0.6,
      }}
    >
      <div className="relative rounded-[24px] overflow-hidden bg-card group cursor-pointer">
        <div className="relative h-[360px] md:h-[440px] overflow-hidden">
          <img
            src={creator.imageUrl}
            alt={creator.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
            width={480}
            height={440}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-5 left-5 z-10">
            <h3 className="text-xl md:text-2xl font-bold text-white">{creator.name}</h3>
            <p className="text-white/70 text-sm">{creator.handle}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Music className="w-3.5 h-3.5 text-white/60" />
              <span className="text-white/80 text-sm font-medium">{creator.followers} Followers</span>
            </div>
          </div>
          <div
            className="absolute -right-3 md:right-2 top-4 z-20 transition-transform duration-[450ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ transform: isActive ? "translateY(0)" : "translateY(8px)" }}
          >
            <PhoneMockup creator={creator} />
          </div>
        </div>
      </div>
      <Badge className="absolute bottom-[-10px] left-5 bg-background/95 backdrop-blur text-foreground border-0 px-3 py-1.5 text-xs font-semibold gap-1.5 shadow-lg z-10">
        <span>{creator.nicheEmoji}</span>
        {creator.niche}
      </Badge>
    </div>
  );
}

export default function CreatorSlider() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    slidesToScroll: 1,
    containScroll: false,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Autoplay
  useEffect(() => {
    if (isPaused || !emblaApi) return;
    intervalRef.current = setInterval(() => {
      emblaApi.scrollNext();
    }, 4000);
    return () => clearInterval(intervalRef.current);
  }, [isPaused, emblaApi]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") emblaApi?.scrollNext();
      if (e.key === "ArrowLeft") emblaApi?.scrollPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [emblaApi]);

  return (
    <section
      className="py-20 md:py-28 overflow-hidden pb-0"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="text-center mb-14 px-4">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-3">
          Os melhores criadores já usam Kivo
        </h2>
        <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
          Veja como eles usam pra melhorar seus negócios!
        </p>
      </div>

      <div className="relative">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-6">
            {CREATORS.map((creator, i) => (
              <div
                key={creator.id}
                className="flex-shrink-0 flex-grow-0 basis-[320px] md:basis-[420px] lg:basis-[480px]"
                onClick={() => emblaApi?.scrollTo(i)}
              >
                <SlideCard creator={creator} isActive={i === selectedIndex} />
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => emblaApi?.scrollPrev()}
          className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full bg-background/90 backdrop-blur border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-background transition-colors"
          aria-label="Anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => emblaApi?.scrollNext()}
          className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full bg-background/90 backdrop-blur border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-background transition-colors"
          aria-label="Próximo"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex justify-center gap-2 mt-8">
        {CREATORS.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i === selectedIndex ? "bg-destructive w-6" : "bg-foreground/20 hover:bg-foreground/40"
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
