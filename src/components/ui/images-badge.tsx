"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

export function ImagesBadge({
  images,
  text,
  className,
}: {
  images: string[];
  text: string;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "flex items-center gap-2 rounded-full border border-black/10 bg-white/80 backdrop-blur-sm px-4 py-2 shadow-sm cursor-pointer transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="flex items-center -space-x-2">
        {images.map((image, idx) => (
          <motion.div
            key={idx}
            className="relative h-7 w-7 rounded-full border-2 border-white overflow-hidden"
            animate={{
              x: hovered ? idx * 5 : 0,
            }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Image
              src={image}
              alt={`Avatar ${idx + 1}`}
              fill
              className="object-cover"
              unoptimized
            />
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="text-[13px] font-medium text-[#57534E] whitespace-nowrap overflow-hidden"
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
