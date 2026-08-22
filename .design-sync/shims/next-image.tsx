// Stands in for `next/image` when the DS is bundled outside a Next runtime.
//
// Why this exists: next/image's module init reads process.env
// (NEXT_DEPLOYMENT_ID, __NEXT_IMAGE_OPTS, …). In the single-IIFE design-system
// bundle there is no `process`, so importing it threw
// "ReferenceError: process is not defined" at load — which took down all 48
// components, not just the 6 that use <Image>. It also emits /_next/image?url=
// URLs that no design-system host can serve.
//
// A plain <img> is the honest equivalent here: same box, same src, no Next
// server. Next-only props are accepted and dropped so callers need no edits.
import React from 'react';

type StaticLike = { src: string; height?: number; width?: number };
type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'placeholder'> & {
  src: string | StaticLike;
  width?: number | string;
  height?: number | string;
  // Accepted and ignored — they only mean something to the Next image server.
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  sizes?: string;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
  unoptimized?: boolean;
  onLoadingComplete?: unknown;
};

export default function Image({
  src, alt = '', width, height, fill, style,
  priority, quality, sizes, placeholder, blurDataURL, loader, unoptimized, onLoadingComplete,
  ...rest
}: Props) {
  const resolved = typeof src === 'string' ? src : src?.src;
  // `fill` in Next means "absolutely fill the positioned parent".
  const fillStyle: React.CSSProperties = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
    : {};
  return (
    <img
      src={resolved}
      alt={alt}
      width={fill ? undefined : (width as number | undefined)}
      height={fill ? undefined : (height as number | undefined)}
      style={{ ...fillStyle, ...style }}
      {...rest}
    />
  );
}
