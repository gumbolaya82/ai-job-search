"use client";

import { useMemo, useState, useTransition } from "react";
import type { ProfileRecord } from "@/lib/profileRegistry";
import type { OpResult } from "@/lib/profileOps";
import EmptyState from "./EmptyState";
import { useQueryTerm } from "./UiState";

type Actions = {
  activate: (id: string) => Promise<OpResult>;
  archive: (id: string) => Promise<OpResult>;
  restore: (id: string) => Promise<OpResult>;
  create: (id: string, switchTo: boolean) => Promise<OpResult>;
  forceSwitch: (lockedId: string, targetId: string) => Promise<OpResult>;
};

type Props = {
  profiles: ProfileRecord[];
  warning: string | null;
  actions: Actions;
};

export default function ProfileManager({ profiles, warning, actions }: Props) {
  const [result, setResult] = useState<OpResult | null>(null);
  /** The switch that was refused by a lock, so Force switch knows its target. */
  const [blockedTarget, setBlockedTarget] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [switchTo, setSwitchTo] = useState(true);
  const [pending, startTransition] = useTransition();

  // The page header's search field is app-wide; on this screen it narrows the
  // profile list. Filtering never hides the lock banner or the create form.
  const term = useQueryTerm();
  const shown = useMemo(
    () => (term ? profiles.filter((p) => p.id.toLowerCase().includes(term)) : profiles),
    [profiles, term],
  );

  const lockedProfile = profiles.find((p) => p.lock);

  function run(fn: () => Promise<OpResult>, target?: string) {
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      setBlockedTarget(res.locked && target ? target : null);
    });
  }

  return (
    <>
      {warning && (
        <div className="alert">
          <b>Pointer warning</b>
          {warning}
        </div>
      )}

      {result && (
        <div className={`alert ${result.ok ? "ok" : "err"}`}>
          <b>{result.ok ? "Done" : "Failed"}</b>
          <pre>{result.message}</pre>
          {result.locked && blockedTarget && lockedProfile && (
            <div className="acts">
              <button
                type="button"
                className="btn sm"
                disabled={pending}
                onClick={() => run(() => actions.activate(blockedTarget), blockedTarget)}
              >
                Retry switch
              </button>
              <button
                type="button"
                className="btn sm danger"
                disabled={pending}
                onClick={() => run(() => actions.forceSwitch(lockedProfile.id, blockedTarget))}
              >
                Force switch (clears stale lock)
              </button>
            </div>
          )}
        </div>
      )}

      <section className="card">
        <div className="cardhead">
          <h2>All profiles</h2>
          <span className="spacer" />
          <span className="note">
            every action shells out to <code>tools/profile_manager.py</code>
          </span>
        </div>

        {profiles.length === 0 && (
          <EmptyState
            title="No profiles yet"
            body={
              <>
                A profile is where one candidate&apos;s CVs, queries and job history live. The form
                below seeds one from <code>profiles/_scaffold/</code>.
              </>
            }
          />
        )}

        {profiles.length > 0 && shown.length === 0 && (
          <EmptyState
            title={`No profile matches “${term}”`}
            body={`This repo has ${profiles.length} profile${profiles.length === 1 ? "" : "s"}. Clear the search field in the header to see them all.`}
          />
        )}

        {shown.map((p) => (
          <div key={p.id} className={`prow ${p.archived ? "is-archived" : ""}`}>
            <div>
              <div className="id">
                {p.id}
                {p.active && (
                  <span className="pill" style={{ ["--pc" as string]: "var(--high)" }}>
                    active
                  </span>
                )}
                {p.archived && (
                  <span className="pill" style={{ ["--pc" as string]: "var(--st-none)" }}>
                    archived
                  </span>
                )}
                {p.lock && (
                  <span className="pill" style={{ ["--pc" as string]: "var(--medium)" }}>
                    locked
                  </span>
                )}
              </div>
              <div className="facts">
                {p.lock ? `in-progress command started ${p.lock}` : `profiles/${p.id}/`}
              </div>
            </div>
            <div className="acts">
              {p.archived ? (
                <button
                  type="button"
                  className="btn sm"
                  disabled={pending}
                  onClick={() => run(() => actions.restore(p.id))}
                >
                  Restore
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn sm primary"
                    disabled={pending || p.active}
                    onClick={() => run(() => actions.activate(p.id), p.id)}
                  >
                    {p.active ? "Active" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    disabled={pending}
                    onClick={() => run(() => actions.archive(p.id))}
                  >
                    Archive
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>New profile</h2>
        <div className="form">
          <div className="f">
            <label htmlFor="newId">Profile id</label>
            <input
              id="newId"
              type="text"
              placeholder="e.g. casey"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
            />
          </div>
          <label className="chk">
            <input
              type="checkbox"
              checked={switchTo}
              onChange={(e) => setSwitchTo(e.target.checked)}
            />
            switch to it after creating
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={pending || newId.trim().length === 0}
            onClick={() => {
              const id = newId.trim();
              run(() => actions.create(id, switchTo));
              setNewId("");
            }}
          >
            Create profile
          </button>
        </div>
        <div
          className="note"
          style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}
        >
          <span>runs</span>
          <span className="cmd">python tools/profile_manager.py create &lt;id&gt;</span>
          <span>seeding from profiles/_scaffold/</span>
        </div>
      </section>
    </>
  );
}
