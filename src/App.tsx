import { useEffect, useState } from "react";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { ProfileGate } from "@/components/dashboard/ProfileGate";
import { normalizeMeta } from "@/lib/streak";
import { releaseCoverImage } from "@/lib/coverStore";
import type { ProfileBackup } from "@/lib/backup";
import {
  loadBooks,
  hydrateState,
  saveBooks,
  saveCharacters,
  saveCoverPresets,
  saveFacts,
  saveIdeas,
  saveMeta,
  saveNotifications,
  savePlot,
  saveRelations,
  saveResearch,
  saveSeries,
  saveWorld,
} from "@/lib/persistence";
import {
  clearProfileData,
  createProfile,
  ensureProfiles,
  loadCurrentProfileId,
  saveCurrentProfileId,
  saveProfiles,
} from "@/lib/profile";
import type { Profile } from "@/lib/profile";
import { setStorageErrorHandler } from "@/lib/persistence";
import { showToast } from "@/lib/toast";
import "./index.css";

/**
 * Ein voller Browserspeicher darf nicht still bleiben: Die App zeigt die Änderung, nach dem
 * Reload wäre sie weg. Deshalb hier einmalig einen Melder registrieren (mit Handlungsanweisung).
 */
setStorageErrorHandler(({ name, bytes, message }) => {
  showToast(
    `⚠️ Speichern fehlgeschlagen („${name}", ${Math.round(bytes / 1024)} KB): ${message} — ` +
      `Bitte Backup exportieren und alte Projekte löschen.`,
    "error",
  );
});

export function App() {
  const [profiles, setProfiles] = useState<Profile[]>(() => ensureProfiles());
  const [currentId, setCurrentId] = useState<string | null>(() => loadCurrentProfileId());
  /** Erst wenn die Datenbank geladen ist, darf die App rendern (synchrone Lese-Aufrufe). */
  const [ready, setReady] = useState(false);

  const current = currentId ? profiles.find((profile) => profile.id === currentId) ?? null : null;

  useEffect(() => {
    if (!current) {
      setReady(false);
      return;
    }
    let alive = true;
    setReady(false);
    hydrateState(current.id)
      .then(({ migrated }) => {
        if (!alive) return;
        setReady(true);
        if (migrated) {
          showToast(
            "Deine bisherigen Daten wurden in die Datenbank übernommen (kein localStorage-Limit mehr).",
            "ok",
          );
        }
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
        showToast(`Daten konnten nicht geladen werden: ${message}`, "error");
        // Trotzdem rendern — Seeds/localStorage dienen als Notnagel.
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [current?.id]);

  const select = (id: string) => {
    setCurrentId(id);
    saveCurrentProfileId(id);
  };

  const create = (profile: Profile) => {
    const next = [...profiles, profile];
    setProfiles(next);
    saveProfiles(next);
    select(profile.id);
  };

  const remove = (id: string) => {
    // Cover dieses Profils freigeben, sofern sie nirgends sonst referenziert werden.
    for (const book of loadBooks(id) ?? []) {
      for (const url of [book.coverUrl, book.coverBackUrl, ...(book.coverVariants ?? [])]) {
        if (url) void releaseCoverImage(url, { ignoreProfile: id });
      }
    }
    clearProfileData(id);
    const next = profiles.filter((profile) => profile.id !== id);
    setProfiles(next);
    saveProfiles(next);
    if (currentId === id) {
      setCurrentId(null);
      saveCurrentProfileId(null);
    }
  };

  /** Importiert ein Backup als **neues** Profil (statt den aktuellen Stand zu ersetzen). */
  const importAsProfile = (backup: ProfileBackup) => {
    const nameTaken = profiles.some((profile) => profile.name === backup.profileName);
    const profile = createProfile(nameTaken ? `${backup.profileName} (Import)` : backup.profileName);

    saveBooks(profile.id, backup.books);
    saveCharacters(profile.id, backup.characters);
    saveWorld(profile.id, backup.world);
    savePlot(profile.id, backup.plot);
    saveResearch(profile.id, backup.research);
    saveIdeas(profile.id, backup.ideas);
    saveNotifications(profile.id, backup.notifications);
    saveFacts(profile.id, backup.facts);
    saveRelations(profile.id, backup.relations);
    saveSeries(profile.id, backup.series);
    saveMeta(profile.id, normalizeMeta(backup.meta ?? null));
    saveCoverPresets(profile.id, []);

    create(profile);
  };

  const switchProfile = () => {
    setCurrentId(null);
    saveCurrentProfileId(null);
  };

  if (!current) {
    return (
      <ProfileGate
        profiles={profiles}
        onSelect={select}
        onCreate={create}
        onDelete={remove}
      />
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Lade Datenbank…
      </div>
    );
  }

  return (
    <Dashboard
      key={current.id}
      profileId={current.id}
      profileName={current.name}
      onSwitchProfile={switchProfile}
      onImportProfile={importAsProfile}
    />
  );
}

export default App;
