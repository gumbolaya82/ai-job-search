import DocumentBrowser from "@/components/DocumentBrowser";
import PageHead from "@/components/PageHead";
import { documentsFor } from "@/lib/documents";
import { activeProfileId, readRegistry, resolveProfileId } from "@/lib/profileRegistry";

/**
 * Read-only document browser.
 *
 * v1 never creates a document: that is `/apply`'s job (LaTeX compilation, the
 * reviewer sub-agent, the verification checklist). Empty categories therefore
 * carry the command that fills them.
 *
 * The filesystem read and the profile-id resolution stay here, on the server;
 * DocumentBrowser is the client half, and exists only so the page header's
 * global search field can filter the list.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string }>;
}) {
  const params = await searchParams;

  let registry;
  try {
    registry = readRegistry();
  } catch (err) {
    return (
      <>
        <PageHead title="Documents" search={false} />
        <div className="alert err">
          <b>Could not read the profile registry</b>
          <pre>{(err as Error).message}</pre>
        </div>
      </>
    );
  }

  // A profile id from the query string is resolved against the registry
  // allowlist, never trusted as a path segment.
  //
  // An unresolvable ?profile= must NOT fall back to the active profile: showing
  // one person's documents under another's id is the exact confusion the
  // profiles/<id>/ split exists to prevent. Absent param -> active profile;
  // present but bad -> refuse.
  const asked = params.profile !== undefined && params.profile !== "";
  const profileId = asked ? resolveProfileId(params.profile) : activeProfileId();

  if (!profileId) {
    return (
      <>
        <PageHead title="Documents" search={false} />
        <div className="alert err">
          <b>No such profile</b>
          {params.profile
            ? `'${params.profile}' is not a live profile in this repo.`
            : "No active profile is set. Pick one on the Profiles screen."}
        </div>
      </>
    );
  }

  const categories = documentsFor(profileId);
  const total = categories.reduce((n, c) => n + c.files.length, 0);

  return (
    <>
      <PageHead
        title="Documents"
        crumb={`${total} files · profiles/${profileId}/`}
        active={registry.active}
        placeholder="Search documents…"
      />

      <div className="alert">
        <b>Read-only in v1</b>
        New CVs and cover letters come from <code>/apply</code> in Claude Code — LaTeX compilation,
        the reviewer sub-agent and the full verification checklist. This screen is where you find
        them, open them, and copy the command that makes the next one.
      </div>

      <DocumentBrowser categories={categories} profileId={profileId} />

      <footer className="pvfoot">served from localhost · never bind 0.0.0.0</footer>
    </>
  );
}
