import { useState, useCallback } from "react";
import { AccordionCard } from "./AccordionCard";
import type { GalleryItem } from "./types";

interface AccordionGalleryProps {
  items: GalleryItem[];
  height?: string;
}

export function AccordionGallery({ items, height = "480px" }: AccordionGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % items.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      }
    },
    [items.length]
  );

  return (
    <div
      className="flex gap-3 md:gap-3 w-full"
      style={{ height }}
      role="tablist"
      aria-label="Galeria de depoimentos"
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => (
        <AccordionCard
          key={item.id}
          item={item}
          isActive={index === activeIndex}
          onActivate={() => setActiveIndex(index)}
          index={index}
        />
      ))}
    </div>
  );
}
