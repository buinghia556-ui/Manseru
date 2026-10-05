"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setBacklogSort } from "@/app/actions";
import { SORTS, type SortKey } from "@/lib/types";


export function SortSelect({ value }: { value: SortKey }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="sortsel">
      Sắp xếp
      <select
        id="bl-sort"
        value={value}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setBacklogSort(e.target.value);
            router.refresh();
          })
        }
      >
        {Object.entries(SORTS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
