import { useCallback, useEffect, useMemo, useState } from "react";

interface ImageGalleryProps {
  images: string[];
  max?: number;
}

const ImageGallery = ({ images, max = 12 }: ImageGalleryProps) => {
  const urls = useMemo(() => images.filter(Boolean).slice(0, max), [images, max]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const open = useCallback((index: number) => setLightboxIndex(index), []);
  const close = useCallback(() => setLightboxIndex(null), []);
  const next = useCallback(
    () =>
      setLightboxIndex((idx) => {
        if (idx == null) return idx;
        return (idx + 1) % urls.length;
      }),
    [urls.length]
  );
  const prev = useCallback(
    () =>
      setLightboxIndex((idx) => {
        if (idx == null) return idx;
        return (idx - 1 + urls.length) % urls.length;
      }),
    [urls.length]
  );

  useEffect(() => {
    if (lightboxIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, close, next, prev]);

  if (!urls.length) return null;

  return (
    <div className="gallery" aria-label="Related images">
      <div className="gallery__grid">
        {urls.map((url, idx) => (
          <button
            key={`${url}-${idx}`}
            type="button"
            className="gallery__item"
            onClick={() => open(idx)}
            aria-label={`Open image ${idx + 1} of ${urls.length}`}
          >
            <img
              className="gallery__img"
              src={url}
              alt="Related step"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const el = e.currentTarget;
                el.classList.add("is-error");
              }}
            />
          </button>
        ))}
      </div>

      {lightboxIndex != null ? (
        <div className="lightbox" role="dialog" aria-modal="true">
          <div className="lightbox__backdrop" onClick={close} />
          <div className="lightbox__content">
            <img
              className="lightbox__img"
              src={urls[lightboxIndex]}
              alt={`Image ${lightboxIndex + 1} of ${urls.length}`}
              decoding="async"
            />
            {urls.length > 1 ? (
              <div className="lightbox__controls">
                <button
                  type="button"
                  className="lightbox__btn"
                  onClick={prev}
                  aria-label="Previous image"
                >
                  ❮
                </button>
                <button
                  type="button"
                  className="lightbox__btn"
                  onClick={next}
                  aria-label="Next image"
                >
                  ❯
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="lightbox__close"
              onClick={close}
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ImageGallery;


