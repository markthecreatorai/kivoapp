import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Star, ChevronDown } from "lucide-react";
import creatorHero from "@/assets/gallery/creator-hero.jpg";
import kivoSymbol from "@/assets/kivo-symbol.svg";
import creator1 from "@/assets/gallery/creator-1.jpg";
import creator2 from "@/assets/gallery/creator-2.jpg";
import creator3 from "@/assets/gallery/creator-3.jpg";

export default function CreatorShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Parallax transforms for floating elements
  const badgeX = useTransform(mouseX, [-1, 1], [-6, 6]);
  const badgeY = useTransform(mouseY, [-1, 1], [-6, 6]);
  const chipX = useTransform(mouseX, [-1, 1], [5, -5]);
  const chipY = useTransform(mouseY, [-1, 1], [4, -4]);
  const barX = useTransform(mouseX, [-1, 1], [3, -3]);
  const barY = useTransform(mouseY, [-1, 1], [6, -6]);
  const logoX = useTransform(mouseX, [-1, 1], [-4, 4]);
  const logoY = useTransform(mouseY, [-1, 1], [-5, 5]);
  const imageY = useTransform(mouseY, [-1, 1], [3, -3]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section className="py-16 md:py-24 px-4 bg-destructive">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        className="max-w-[1280px] mx-auto bg-background rounded-[28px] md:rounded-[32px] shadow-2xl shadow-black/10 overflow-hidden"
      >
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-0 items-center p-8 md:p-12 lg:p-16">
          {/* Left — Copy */}
          <div className="space-y-6 z-10">
            <Badge
              variant="outline"
              className="rounded-full border-border/60 text-foreground/80 bg-muted/50 px-4 py-1.5 text-sm font-medium gap-1.5"
            >
              <Star className="w-3.5 h-3.5 text-destructive fill-destructive" />
              Feito para quem cria
            </Badge>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-[1.1] tracking-tight">
              Creators escolhem{" "}
              <br className="hidden md:block" />
              Kivo por um motivo
            </h2>

            <p className="text-base md:text-lg text-muted-foreground max-w-md leading-relaxed">
              Mais controle, menos ferramentas, maior margem. Quem opera com Kivo não volta atrás.
            </p>

            <a
              href="#features"
              className="inline-flex items-center gap-2 text-sm font-semibold text-foreground group"
            >
              Ver mais
              <motion.span
                animate={{ y: [0, 3, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              >
                <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
              </motion.span>
            </a>
          </div>

          {/* Right — Visual Composition */}
          <div className="relative flex items-center justify-center min-h-[360px] md:min-h-[440px] lg:min-h-[480px]">
            {/* Black organic frame */}
            <div className="absolute inset-4 md:inset-6 bg-foreground/90 rounded-[24px] transform rotate-2" />

            {/* Main creator image */}
            <motion.div
              style={{ y: imageY }}
              className="relative z-10 w-[240px] h-[300px] md:w-[280px] md:h-[350px] lg:w-[300px] lg:h-[380px] rounded-[20px] overflow-hidden shadow-2xl shadow-black/30"
            >
              <img
                src={creatorHero}
                alt="Creator usando Kivo"
                className="w-full h-full object-cover"
                width={300}
                height={380}
              />
            </motion.div>

            {/* Floating Kivo logo — top left of image */}
            <motion.div
              style={{ x: logoX, y: logoY }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="absolute top-2 right-[55%] md:top-4 md:right-[50%] z-20"
            >
              <div className="w-12 h-12 md:w-14 md:h-14 bg-destructive rounded-full flex items-center justify-center shadow-lg shadow-destructive/30">
                <img src={kivoSymbol} alt="Kivo" className="w-7 h-7 md:w-8 md:h-8 brightness-0 invert" />
              </div>
            </motion.div>

            {/* Floating red badge — right side */}
            <motion.div
              style={{ x: badgeX, y: badgeY }}
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="absolute top-8 -right-2 md:top-12 md:right-0 z-20"
            >
              <div className="bg-destructive text-destructive-foreground px-5 py-3 rounded-2xl shadow-lg shadow-destructive/25 text-sm font-semibold leading-tight text-center max-w-[140px]">
                Sua comunidade.
                <br />
                Suas regras.
              </div>
            </motion.div>

            {/* Activity chip — left bottom of image */}
            <motion.div
              style={{ x: chipX, y: chipY }}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="absolute bottom-24 md:bottom-28 -left-2 md:left-0 z-20"
            >
              <div className="flex items-center gap-2.5 bg-background/95 backdrop-blur-sm rounded-full pl-2 pr-4 py-1.5 shadow-lg border border-border/50">
                <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                  <img src={kivoSymbol} alt="" className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Circles</p>
                  <p className="text-xs font-bold text-foreground">Feed ativo</p>
                </div>
                <img src={creator2} alt="" className="w-6 h-6 rounded-full object-cover border-2 border-background" />
              </div>
            </motion.div>

            {/* Social bar — bottom right */}
            <motion.div
              style={{ x: barX, y: barY }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="absolute -bottom-2 md:bottom-2 right-0 md:right-2 z-20"
            >
              <div className="flex items-center gap-3 bg-foreground text-background rounded-full pl-4 pr-5 py-2 shadow-xl">
                <div>
                  <p className="text-[10px] font-semibold text-background/60 uppercase tracking-wider">Membros</p>
                  <p className="text-xs font-bold text-background">Comunidade Pro</p>
                </div>
                <div className="flex -space-x-2">
                  {[creator1, creator2, creator3].map((src, i) => (
                    <img key={i} src={src} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-foreground" />
                  ))}
                  <div className="w-7 h-7 rounded-full bg-foreground/70 border-2 border-foreground flex items-center justify-center text-[9px] font-bold text-background/80">
                    +184
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
