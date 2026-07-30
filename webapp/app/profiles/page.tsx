import PageHead from "@/components/PageHead";
import ProfileManager from "@/components/ProfileManager";
import { pointerWarning, readRegistry } from "@/lib/profileRegistry";
import {
  activateProfile,
  archiveProfile,
  createProfile,
  forceSwitchProfile,
  restoreProfile,
} from "@/lib/profileOps";

export default function ProfilesPage() {
  let registry;
  try {
    registry = readRegistry();
  } catch (err) {
    return (
      <>
        <PageHead title="Profiles" search={false} />
        <div className="alert err">
          <b>Could not read the profile registry</b>
          <pre>{(err as Error).message}</pre>
        </div>
      </>
    );
  }

  const live = registry.profiles.filter((p) => !p.archived).length;
  const archived = registry.profiles.filter((p) => p.archived).length;

  return (
    <>
      <PageHead
        title="Profiles"
        crumb={`${live} active · ${archived} archived`}
        active={registry.active}
        placeholder="Search profiles…"
      />

      <ProfileManager
        profiles={registry.profiles}
        warning={pointerWarning(registry)}
        actions={{
          activate: activateProfile,
          archive: archiveProfile,
          restore: restoreProfile,
          create: createProfile,
          forceSwitch: forceSwitchProfile,
        }}
      />

      <footer className="pvfoot">
        Claude Code owns every mutation · this screen only calls profile_manager.py
      </footer>
    </>
  );
}
