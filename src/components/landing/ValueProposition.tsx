import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import kivo3d from "@/assets/kivo-3d-symbol.png";

export default function ValueProposition() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useTransform(mouseY, [-1, 1], [5, -5]);
  const rotateY = useTransform(mouseX, [-1, 1], [-8, 8]);
  const shadowX = useTransform(mouseX, [-1, 1], [12, -12]);
  const shadowY = useTransform(mouseY, [-1, 1], [8, 20]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
    mouseY.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="py-24 md:py-32"
      style={{ perspective: 1200 }}
    >
      <div className="max-w-[1280px] mx-auto px-4 md:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left — 3D visual */}
          <div className="flex items-center justify-center">
            <motion.div
              style={{ rotateX, rotateY }}
              className="relative"
            >
              <motion.img
                src={kivo3d}
                alt="Kivo — ecossistema integrado"
                className="w-[280px] h-[280px] md:w-[380px] md:h-[380px] lg:w-[420px] lg:h-[420px] object-contain drop-shadow-2xl"
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                width={420}
                height={420}
              />
              {/* Dynamic shadow */}
              <motion.div
                className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[60%] h-6 rounded-[50%] bg-black/10 blur-xl"
                style={{ x: shadowX, y: shadowY }}
              />
            </motion.div>
          </div>

          {/* Right — Copy */}
          <div className="space-y-6 lg:space-y-8 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-[2.8rem] font-bold text-foreground leading-[1.15] tracking-tight text-center">
              Tudo que você precisa{" "}
              <br className="hidden md:block" />
              para vender no digital{" "}
              <br className="hidden md:block" />
              em um só lugar.
            </h2>

            <p className="text-base md:text-lg text-muted-foreground max-w-md leading-relaxed text-center mx-auto">
              Storefront, checkout, comunidade, cursos, email e afiliados, sem pagar por 5 ferramentas separadas.
            </p>

            <Button
              size="lg"
              className="pill-radius bg-destructive hover:bg-destructive/90 text-destructive-foreground text-base font-semibold px-10 py-6 shadow-lg shadow-destructive/20 hover:shadow-xl hover:shadow-destructive/30 hover:scale-[1.02] transition-all duration-300"
              onClick={() => navigate("/signup?utm_source=landing&utm_medium=value_prop")}
            >
              Solicitar informações
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
