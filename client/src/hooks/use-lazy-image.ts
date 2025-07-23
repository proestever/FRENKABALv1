import { useState, useEffect, useRef } from 'react';

interface UseLazyImageProps {
  src: string;
  fallbackSrc?: string;
  threshold?: number;
}

export function useLazyImage({ src, fallbackSrc, threshold = 0.1 }: UseLazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string | undefined>(undefined);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isIntersecting) {
            setIsIntersecting(true);
            observer.disconnect();
          }
        });
      },
      { threshold }
    );
    
    const currentRef = imgRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }
    
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [threshold, isIntersecting]);
  
  useEffect(() => {
    if (isIntersecting && !hasError) {
      setImageSrc(src);
    }
  }, [isIntersecting, src, hasError]);
  
  const handleError = () => {
    setHasError(true);
    if (fallbackSrc) {
      setImageSrc(fallbackSrc);
    }
  };
  
  return {
    imgRef,
    imageSrc,
    handleError,
    isLoading: isIntersecting && !imageSrc && !hasError
  };
}