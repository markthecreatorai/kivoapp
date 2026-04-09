import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GalleryItem } from "./types";

interface AccordionCardProps {
  item: GalleryItem;
  isActive: boolean;
  onActivate: () => void;
  index: number;
}

function AccordionCardInner({ item, isActive, onActivate, index }: AccordionCardProps) {
  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-selected={isActive}
      onClick={onActivate}
      onMouseEnter={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className="relative overflow-hidden cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{ height: "100%" }}
      animate={{
        flex: isActive ? 5 : 1,
      }}
      transition={{
        duration: 0.45,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {/* Background image */}
      <img
        src={item.imageUrl}
        alt={item.title}
        loading={index === 0 ? "eager" : "lazy"}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Active content */}
      <AnimatePresence mode="wait">
        {isActive ? (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="absolute inset-0 flex flex-col justify-end p-6 md:p-8"
          >
            {item.quote && (
              <div className="mb-4">
                <span className="text-2xl text-white/60 font-serif leading-none">"</span>
                <p className="text-white text-sm md:text-base leading-relaxed mt-1">
                  {item.quote}
                </p>
              </div>
            )}
            <div>
              <p className="text-white font-semibold text-base md:text-lg">{item.title}</p>
              {item.role && (
                <p className="text-white/70 text-sm">{item.role}</p>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="inactive"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-end justify-center pb-6"
          >
            <p
              className="text-white font-medium text-sm"
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
              }}
            >
              {item.title}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const AccordionCard = memo(AccordionCardInner);
