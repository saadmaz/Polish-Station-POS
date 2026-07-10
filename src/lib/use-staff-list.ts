import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import type { StaffRole } from "./permissions";

// The roster as seen from the public collection. Permissions live only on the
// private staff docs, so this shape carries an empty list — consumers that need
// real module access read it from the auth claims, not from here.
export interface PublicStaff {
  id: string;
  name: string;
  role: StaffRole;
  color: string;
  active: boolean;
  username: string;
}

// Module-level cache — fetched once per page load, shared across all consumers.
let cache: PublicStaff[] | null = null;
let inFlight: Promise<PublicStaff[]> | null = null;

async function fetchStaffList(): Promise<PublicStaff[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = getDocs(collection(db, "staff_public")).then((snap) => {
    const list = snap.docs
      .map((d) => {
        const v = d.data();
        return {
          id: d.id,
          name: v.name as string,
          role: v.role as StaffRole,
          color: v.color as string,
          active: v.active !== false,
          username: (v.username as string) ?? "",
        } satisfies PublicStaff;
      })
      // Deactivated staff never appear in pickers or the staff grid.
      .filter((s) => s.active);
    cache = list;
    inFlight = null;
    return list;
  });

  return inFlight;
}

export function useStaffList(): { staffList: PublicStaff[]; staffLoading: boolean } {
  const [staffList, setStaffList] = useState<PublicStaff[]>(cache ?? []);
  const [staffLoading, setStaffLoading] = useState(cache === null);

  useEffect(() => {
    if (cache !== null) return;
    fetchStaffList()
      .then((list) => {
        setStaffList(list);
        setStaffLoading(false);
      })
      .catch(() => setStaffLoading(false));
  }, []);

  return { staffList, staffLoading };
}
