import { Fragment } from "react";

/**
 * Renders WhatsApp message text, turning any http(s) URL into a real clickable
 * link. Shared by the coach thread and the admin simulator so a template's
 * `{link}` is tappable (and long-press → "copy link address" yields the clean
 * URL) instead of plain text a mobile browser mangles when it soft-wraps.
 */
const URL_RE = /(https?:\/\/\S+)/g;

export function MessageText({ text }: { text: string }) {
  // `split` with a capturing group interleaves [text, url, text, url, …], so the
  // odd indices are the matched URLs.
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
