"use client";

import Image from "next/image";
import { useState } from "react";
import { Mountain } from "lucide-react";

export function DestinationImage({
  src,
  alt,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="image-fallback" role="img" aria-label={alt}>
        <Mountain size={40} aria-hidden="true" />
        <span>Destination inspiration</span>
      </div>
    );
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
      className="destination-image"
    />
  );
}
