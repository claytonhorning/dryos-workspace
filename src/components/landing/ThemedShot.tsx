import Image from "next/image";
import { cx } from "@/components/ui";

/**
 * A screenshot of the product that follows the page's theme.
 *
 * Every capture under `public/landing/` exists twice, `-dark` and `-light`,
 * taken from the same generated page on the same data. Showing a dark
 * dashboard on a light page would say the product has one look; it has two,
 * and the one on screen should be the one the visitor chose. Dark is the
 * ground state — no attribute — so it is the image that renders by default and
 * the light one takes over only when the toggle says so.
 *
 * `ratio` is the crop's own width/height so the box is the right size before
 * the image lands and nothing below it moves.
 */
export function ThemedShot({
  name,
  alt,
  ratio,
  sizes = "(min-width: 1024px) 60vw, 100vw",
  className,
  priority,
}: {
  name: string;
  alt: string;
  ratio: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={cx("relative overflow-hidden", className)} style={{ aspectRatio: ratio }}>
      <Image
        src={`/landing/${name}-dark.jpg`}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover dr-when-light:hidden"
      />
      <Image
        src={`/landing/${name}-light.jpg`}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        className="hidden object-cover dr-when-light:block"
      />
    </div>
  );
}
