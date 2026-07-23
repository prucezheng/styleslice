"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  imageId: string;
};

export function AuthenticatedImage({ imageId, alt, ...props }: Props) {
  const { authFetch } = useAuth();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    authFetch(`/api/images/${imageId}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("图片读取失败");
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authFetch, imageId]);

  if (!src) return <div className="slice-source-image" aria-label="图片加载中" />;
  return <img {...props} src={src} alt={alt} />;
}
