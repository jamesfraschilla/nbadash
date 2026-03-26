import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createManagedUser, createUserInvite, fetchPendingInvites, fetchVisibleProfiles, updateProfile } from "../accountData.js";
import { ACCOUNT_ROLES, ACCOUNT_TEAM_SCOPES } from "../authConfig.js";
import { useAuth } from "../auth/useAuth.js";
import {
  fetchRemotePregamePlayers,
  loadPregamePlayersPayload,
  normalizePregamePlayers,
  persistPregamePlayers,
  resolveSharedPregamePlayersPayload,
  saveRemotePregamePlayers,
} from "../pregamePlayers.js";
import styles from "./Admin.module.css";

function formatTimestamp(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function ProfileCard({ profile, actorId, onSave }) {
  const [draftRole, setDraftRole] = useState(profile.role || "coach");
  const [draftStatus, setDraftStatus] = useState(profile.status || "active");
  const [draftScopes, setDraftScopes] = useState(profile.team_scopes || []);
  const [saving, setSaving] = useState(false);

  const toggleScope = (scope) => {
    setDraftScopes((prev) => (
      prev.includes(scope)
        ? prev.filter((value) => value !== scope)
        : [...prev, scope]
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(profile.id, {
      role: draftRole,
      status: draftStatus,
      team_scopes: draftScopes,
    }, actorId);
    setSaving(false);
  };

  return (
    <div className={styles.profileCard}>
      <div className={styles.profileHeader}>
        <div>
          <div className={styles.profileName}>{profile.display_name || profile.email}</div>
          <div className={styles.profileEmail}>{profile.email}</div>
        </div>
        <div className={styles.profileMeta}>
          <span>Last login: {formatTimestamp(profile.last_login_at)}</span>
          <span>Created: {formatTimestamp(profile.created_at)}</span>
        </div>
      </div>

      <div className={styles.profileGrid}>
        <label className={styles.field}>
          <span>Role</span>
          <select value={draftRole} onChange={(event) => setDraftRole(event.target.value)}>
            {ACCOUNT_ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Status</span>
          <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="archived">archived</option>
          </select>
        </label>
      </div>

      <div className={styles.scopeGroup}>
        <div className={styles.scopeLabel}>Team scopes</div>
        <div className={styles.scopeOptions}>
          {ACCOUNT_TEAM_SCOPES.map((scope) => (
            <label key={scope} className={styles.scopeOption}>
              <input
                type="checkbox"
                checked={draftScopes.includes(scope)}
                onChange={() => toggleScope(scope)}
              />
              <span>{scope}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.profileActions}>
        <button type="button" className={styles.saveButton} disabled={saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save User"}
        </button>
      </div>
    </div>
  );
}

function TeamRosterCard({ teamScope, title }) {
  const queryClient = useQueryClient();
  const [draftPlayers, setDraftPlayers] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [localRosterVersion, setLocalRosterVersion] = useState(0);

  const { data: remoteRoster, isLoading } = useQuery({
    queryKey: ["admin-team-roster", teamScope],
    queryFn: () => fetchRemotePregamePlayers(teamScope),
  });

  const localRoster = useMemo(() => loadPregamePlayersPayload(teamScope), [teamScope, localRosterVersion]);
  const roster = useMemo(
    () => resolveSharedPregamePlayersPayload(localRoster, remoteRoster).players,
    [localRoster, remoteRoster]
  );

  useEffect(() => {
    setDraftPlayers(roster.map((player) => ({
      id: player.id,
      name: player.name,
      display: player.display,
      personId: player.personId || "",
      cap: player.cap === "" ? "" : Number(player.cap || 48),
    })));
  }, [roster]);

  const updatePlayer = (playerId, field, value) => {
    setDraftPlayers((current) => current.map((player) => {
      if (player.id !== playerId) return player;
      if (field === "cap") {
        if (value === "") return { ...player, cap: "" };
        const parsed = Number.parseInt(value, 10);
        return { ...player, cap: Number.isFinite(parsed) ? parsed : player.cap };
      }
      return { ...player, [field]: value };
    }));
  };

  const handleAdd = () => {
    setDraftPlayers((current) => [
      ...current,
      { id: crypto.randomUUID(), name: "", display: "", personId: "", cap: 48 },
    ]);
  };

  const handleDelete = (playerId) => {
    setDraftPlayers((current) => current.filter((player) => player.id !== playerId));
  };

  const handleSave = async () => {
    const normalized = normalizePregamePlayers(
      draftPlayers.filter((player) => String(player.name || "").trim() && String(player.display || "").trim())
    );
    const updatedAt = Date.now();
    setSaveMessage("");
    setIsSaving(true);
    try {
      persistPregamePlayers(teamScope, normalized, updatedAt);
      setLocalRosterVersion(updatedAt);
      await saveRemotePregamePlayers(teamScope, normalized, updatedAt);
      await queryClient.invalidateQueries({ queryKey: ["admin-team-roster", teamScope] });
      setSaveMessage("Roster saved.");
    } catch (error) {
      setSaveMessage(error?.message || "Unable to save roster.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.rosterCard}>
      <div className={styles.rosterHeader}>
        <h3 className={styles.subTitle}>{title}</h3>
        <button type="button" className={styles.secondaryButton} onClick={handleAdd}>Add Player</button>
      </div>
      {isLoading ? (
        <div className={styles.noticeCard}>Loading roster...</div>
      ) : (
        <>
          <div className={styles.rosterGridHeader}>
            <span>Name</span>
            <span>Display</span>
            <span>Player ID</span>
            <span>Cap</span>
            <span>Actions</span>
          </div>
          <div className={styles.rosterRows}>
            {draftPlayers.map((player) => (
              <div key={player.id} className={styles.rosterRow}>
                <input value={player.name} onChange={(event) => updatePlayer(player.id, "name", event.target.value)} />
                <input value={player.display} onChange={(event) => updatePlayer(player.id, "display", event.target.value)} />
                <input value={player.personId || ""} onChange={(event) => updatePlayer(player.id, "personId", event.target.value)} />
                <input value={player.cap === "" ? "" : String(player.cap)} onChange={(event) => updatePlayer(player.id, "cap", event.target.value)} />
                <button type="button" className={styles.dangerButton} onClick={() => handleDelete(player.id)}>Delete</button>
              </div>
            ))}
          </div>
          <div className={styles.profileActions}>
            <button type="button" className={styles.saveButton} disabled={isSaving} onClick={handleSave}>
              {isSaving ? "Saving..." : "Save Roster"}
            </button>
          </div>
          {saveMessage ? <div className={styles.message}>{saveMessage}</div> : null}
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, session, profile } = useAuth();
  const queryClient = useQueryClient();
  const [inviteForm, setInviteForm] = useState({
    email: "",
    displayName: "",
    password: "",
    role: "coach",
    teamScopes: [...ACCOUNT_TEAM_SCOPES],
  });
  const [inviteMessage, setInviteMessage] = useState("");

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["visible-profiles"],
    queryFn: fetchVisibleProfiles,
    enabled: Boolean(user?.id),
  });

  const { data: invites = [], isLoading: loadingInvites } = useQuery({
    queryKey: ["account-invites"],
    queryFn: fetchPendingInvites,
    enabled: Boolean(user?.id),
  });

  const saveProfileMutation = useMutation({
    mutationFn: ({ profileId, updates }) => updateProfile(profileId, updates, user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visible-profiles"] });
    },
  });

  const sortedInvites = useMemo(() => invites, [invites]);

  if (profile?.role !== "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.noticeCard}>Admin access is required to view this page.</div>
      </div>
    );
  }

  const toggleInviteScope = (scope) => {
    setInviteForm((prev) => ({
      ...prev,
      teamScopes: prev.teamScopes.includes(scope)
        ? prev.teamScopes.filter((value) => value !== scope)
        : [...prev.teamScopes, scope],
    }));
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    setInviteMessage("");
    try {
      await createUserInvite({
        accessToken: session?.access_token,
        email: inviteForm.email,
        displayName: inviteForm.displayName,
        role: inviteForm.role,
        teamScopes: inviteForm.teamScopes,
      });
      setInviteMessage("Invite sent.");
      setInviteForm({
        email: "",
        displayName: "",
        password: "",
        role: "coach",
        teamScopes: [...ACCOUNT_TEAM_SCOPES],
      });
      queryClient.invalidateQueries({ queryKey: ["account-invites"] });
    } catch (error) {
      setInviteMessage(error?.message || "Unable to send invite.");
    }
  };

  const handleCreateUser = async () => {
    setInviteMessage("");
    try {
      await createManagedUser({
        accessToken: session?.access_token,
        email: inviteForm.email,
        password: inviteForm.password,
        displayName: inviteForm.displayName,
        role: inviteForm.role,
        teamScopes: inviteForm.teamScopes,
      });
      setInviteMessage("User account created.");
      setInviteForm({
        email: "",
        displayName: "",
        password: "",
        role: "coach",
        teamScopes: [...ACCOUNT_TEAM_SCOPES],
      });
      queryClient.invalidateQueries({ queryKey: ["visible-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["account-invites"] });
    } catch (error) {
      setInviteMessage(error?.message || "Unable to create user.");
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.kicker}>Accounts</div>
            <h2 className={styles.title}>User administration</h2>
          </div>
        </div>

        <form className={styles.inviteCard} onSubmit={handleInvite}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Email</span>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="name@monumentalsports.com"
              />
            </label>
            <label className={styles.field}>
              <span>Display name</span>
              <input
                type="text"
                value={inviteForm.displayName}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, displayName: event.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className={styles.field}>
              <span>Password</span>
              <input
                type="password"
                value={inviteForm.password}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Required for direct account creation"
              />
            </label>
            <label className={styles.field}>
              <span>Role</span>
              <select
                value={inviteForm.role}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value }))}
              >
                {ACCOUNT_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.scopeGroup}>
            <div className={styles.scopeLabel}>Team scopes</div>
            <div className={styles.scopeOptions}>
              {ACCOUNT_TEAM_SCOPES.map((scope) => (
                <label key={scope} className={styles.scopeOption}>
                  <input
                    type="checkbox"
                    checked={inviteForm.teamScopes.includes(scope)}
                    onChange={() => toggleInviteScope(scope)}
                  />
                  <span>{scope}</span>
                </label>
              ))}
            </div>
          </div>

          {inviteMessage ? <div className={styles.message}>{inviteMessage}</div> : null}

          <div className={styles.inviteActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleCreateUser}
              disabled={!inviteForm.email.trim() || inviteForm.password.length < 8}
            >
              Create User
            </button>
            <button type="submit" className={styles.primaryButton}>
              Send Invite
            </button>
          </div>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.subTitle}>Pending invites</h3>
        </div>
        <div className={styles.list}>
          {loadingInvites ? (
            <div className={styles.noticeCard}>Loading invites...</div>
          ) : sortedInvites.length === 0 ? (
            <div className={styles.noticeCard}>No pending invites.</div>
          ) : (
            sortedInvites.map((invite) => (
              <div key={invite.id} className={styles.inviteRow}>
                <div>
                  <div className={styles.inviteEmail}>{invite.email}</div>
                  <div className={styles.inviteMeta}>
                    {invite.role} · {invite.team_scopes?.join(", ") || "No team scopes"}
                  </div>
                </div>
                <div className={styles.inviteStatus}>
                  {invite.status} · {formatTimestamp(invite.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.subTitle}>Users</h3>
        </div>
        <div className={styles.list}>
          {loadingProfiles ? (
            <div className={styles.noticeCard}>Loading users...</div>
          ) : (
            profiles.map((item) => (
              <ProfileCard
                key={item.id}
                profile={item}
                actorId={user?.id}
                onSave={async (profileId, updates) => {
                  await saveProfileMutation.mutateAsync({ profileId, updates });
                }}
              />
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.subTitle}>Shared Team Rosters</h3>
        </div>
        <div className={styles.list}>
          <TeamRosterCard teamScope="washington" title="Washington" />
          <TeamRosterCard teamScope="capital_city" title="Capital City" />
        </div>
      </section>
    </div>
  );
}
