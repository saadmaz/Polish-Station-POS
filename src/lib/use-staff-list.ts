import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import type { StaffProfile } from "./auth";

// Module-level cache — fetched once per page load, shared across all consumers.
let cache: StaffProfile[] | null = null;
let inFlight: Promise<StaffProfile[]> | null = null;

async function fetchStaffList(): Promise<StaffProfile[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = getDocs(collection(db, "staff_public")).then(snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffProfile));
    cache = list;
    inFlight = null;
    return list;
  });

  return inFlight;
}

export function useStaffList(): { staffList: StaffProfile[]; staffLoading: boolean } {
  const [staffList,    setStaffList]    = useState<StaffProfile[]>(cache ?? []);
  const [staffLoading, setStaffLoading] = useState(cache === null);

  useEffect(() => {
    if (cache !== null) return;
    fetchStaffList()
      .then(list => {
        setStaffList(list);
        setStaffLoading(false);
      })
      .catch(() => setStaffLoading(false));
  }, []);

  return { staffList, staffLoading };
}
