"use client";

import { useEffect, useState } from "react";

/**
 * Thumbnail for a not-yet-uploaded local file. Owns the object URL's whole
 * lifecycle: it's created and revoked in the same effect (so the pair stays
 * balanced under React StrictMode, where cleanup runs once right after setup)
 * and scoped to this component, so the URL is freed the moment the preview
 * unmounts — e.g. when its file is removed from the upload list.
 */
export default function FilePreview({
  file,
  alt,
  className,
}: {
  file: File;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- surface the URL created for this file
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // A blob: object URL isn't something next/image can optimize or serve, so a
  // plain <img> is correct here.
  if (!url) return <div className={className} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element -- blob: object URL
  return <img src={url} alt={alt} className={className} />;
}
