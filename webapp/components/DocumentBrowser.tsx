"use client";

import { useMemo } from "react";
import type { DocCategory } from "@/lib/documents";
import { fmtSize } from "@/lib/fmtSize";
import CopyCommand from "./CopyCommand";
import EmptyState from "./EmptyState";
import { useQueryTerm } from "./UiState";

/**
 * The document list, split out of app/documents/page.tsx so the one global
 * search field in the page header can reach it.
 *
 * The page stays a server component and still does the filesystem read and the
 * profile-id resolution; this only filters and renders what it is handed. A
 * search that matches a category name keeps that whole category, so "cover"
 * finds the cover letters even before you know a filename.
 */
export default function DocumentBrowser({
  categories,
  profileId,
}: {
  categories: DocCategory[];
  profileId: string;
}) {
  const term = useQueryTerm();

  const shown = useMemo(() => {
    if (!term) return categories;
    return categories
      .map((cat) => {
        if (cat.label.toLowerCase().includes(term) || cat.dir.toLowerCase().includes(term)) {
          return cat;
        }
        return { ...cat, files: cat.files.filter((f) => f.name.toLowerCase().includes(term)) };
      })
      // A search hides the categories it found nothing in; without one, every
      // category shows, because an empty category is itself information.
      .filter((cat) => cat.files.length > 0);
  }, [categories, term]);

  if (term && shown.length === 0) {
    return (
      <section className="card">
        <EmptyState
          title={`No document matches “${term}”`}
          body={
            <>
              Nothing under <code>profiles/{profileId}/</code> has that in its name. Clear the
              search field in the header to see every category, including the empty ones.
            </>
          }
        />
      </section>
    );
  }

  return (
    <section className="card">
      <div className="cardhead">
        <h2>profiles/{profileId}/</h2>
        <span className="spacer" />
        <span className="note">click a file to open it</span>
      </div>

      {shown.map((cat) => (
        <div key={cat.dir} className="doccat">
          <div className="cat">
            <b>{cat.label}</b>
            <span className="n">
              {cat.files.length === 0
                ? "empty"
                : `${cat.files.length} file${cat.files.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {cat.files.length === 0 ? (
            /*
             * One short line per category, not a paragraph: the card can hold
             * seven of these at once, and the "read-only in v1" alert above
             * already explains why this app never writes a document.
             */
            <EmptyState small title={`Nothing in ${cat.dir}/ yet`}>
              <span className="note">fill it with</span>
              <CopyCommand command={cat.hint} />
            </EmptyState>
          ) : (
            <div className="files">
              {cat.files.map((f) => {
                const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
                return (
                  <div key={f.rel} className="file">
                    <span className={`ext ${ext}`}>{ext}</span>
                    <span className="nm">
                      <a
                        href={`/api/documents/${profileId}/${f.rel
                          .split("/")
                          .map(encodeURIComponent)
                          .join("/")}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {f.name}
                      </a>
                    </span>
                    <span className="sz">{f.modified}</span>
                    <span className="sz">{fmtSize(f.size)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
