import { useState } from "react";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { ProfileGate } from "@/components/dashboard/ProfileGate";
import { releaseCoverImage } from "@/lib/coverStore";
import { loadBooks } from "@/lib/persistence";
import {
  clearProfileData,
  ensureProfiles,
  loadCurrentProfileId,
  saveCurrentProfileId,
  saveProfiles,
} from "@/lib/profile";
import type { Profile } from "@/lib/profile";
import "./index.css";

export function App() {
  const [profiles, setProfiles] = useState<Profile[]>(() => ensureProfiles());
  const [currentId, setCurrentId] = useState<string | null>(() => loadCurrentProfileId());

  const current = currentId ? profiles.find((profile) => profile.id === currentId) ?? null : null;

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
    // Release this profile's generated covers before clearing its data.
    const books = loadBooks(id) ?? [];
    for (const book of books) {
      if (book.coverUrl) void releaseCoverImage(book.coverUrl, { ignoreProfile: id });
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

  return (
    <Dashboard
      key={current.id}
      profileId={current.id}
      profileName={current.name}
      onSwitchProfile={switchProfile}
    />
  );
}

export default App;
