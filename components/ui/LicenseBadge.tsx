import ExternalLink, { ExternalIcon } from "./ExternalLink";

export default function LicenseBadge({
  short,
  url,
}: {
  short: string | null;
  url: string | null;
}) {
  if (!short) return <span className="text-sm text-slate-400">—</span>;

  const className =
    "inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700";

  if (url) {
    return (
      <ExternalLink href={url} className={`${className} hover:bg-slate-200`}>
        {short}
        <ExternalIcon className="opacity-60" />
      </ExternalLink>
    );
  }
  return <span className={className}>{short}</span>;
}
