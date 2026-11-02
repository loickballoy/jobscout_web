"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { categoryLabel } from "@/lib/mission/pack";
import type { Item } from "@/lib/mission/today";

/** Ligne cochable d'un élément du jour (tâche ou habitude). */
export function ItemRow({ item, onToggle, disabled }: { item: Item; onToggle?: (done: boolean) => void; disabled?: boolean }) {
  const id = `item-${item.id}`;
  // Affichage immédiat du clic ; l'état du serveur reprend la main au rafraîchissement.
  const [checked, setChecked] = useState(item.done);
  useEffect(() => setChecked(item.done), [item.done]);
  return (
    <li className="flex items-start gap-3 py-3">
      {onToggle ? (
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => {
            setChecked(e.target.checked);
            onToggle(e.target.checked);
          }}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      ) : (
        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-textSecondary" />
      )}
      <label htmlFor={onToggle ? id : undefined} className="min-w-0 flex-1 cursor-pointer">
        <span className={`block text-small leading-snug ${checked ? "text-textSecondary line-through" : "font-medium"}`}>{item.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-textSecondary">
          <span className="tabular-nums">{item.minutes} min</span>
          <Badge>{item.source === "habit" ? "Habitude" : categoryLabel(item.category)}</Badge>
          {item.priority === 1 && <Badge variant="info">Priorité 1</Badge>}
          {item.overdueDays ? <Badge variant="warning">En retard de {item.overdueDays} j</Badge> : null}
        </span>
      </label>
    </li>
  );
}
