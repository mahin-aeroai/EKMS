"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";

// New Site form "dropdown wherever possible" combo fields (Format,
// Material, Region, Mat Code, City, ASM Name) -- none of these have a
// dedicated master table the way Partner/Program do, so rather than build
// one, this surfaces the distinct values already typed into lfg_sites as
// <datalist> suggestions. The field stays a plain text input underneath,
// so a genuinely new value can always still be typed -- this is
// autocomplete over real history, not a closed enum.
//
// Paginated via fetchAllRows rather than a plain `.limit()` -- PostgREST
// silently overrides a client `.limit()` above its own server-side row cap
// (1000 by default), so without this a field's rarer values (whatever
// fell past row 1000) would just never show up as suggestions. Same class
// of bug fixed on the Site Master (task #69).
export function useLfgDistinctValues(column: string): string[] {
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("lfg_sites")
        .select(column)
        .not(column, "is", null)
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>
    ).then((rows) => {
      if (cancelled) return;
      const set = new Set<string>();
      for (const row of rows) {
        const v = row[column];
        if (typeof v === "string" && v.trim()) set.add(v.trim());
      }
      setValues(Array.from(set).sort((a, b) => a.localeCompare(b)));
    });
    return () => {
      cancelled = true;
    };
  }, [column]);

  return values;
}
