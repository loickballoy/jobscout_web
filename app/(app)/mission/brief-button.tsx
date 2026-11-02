"use client";
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SimpleMarkdown } from "@/components/app/simple-markdown";

/** Bouton « Brief » : affiche ou masque le brief de la Mission. */
export function BriefButton({ brief }: { brief: string }) {
  const [open, setOpen] = useState(false);
  if (!brief.trim()) return null;
  return (
    <>
      <Button variant="secondary" aria-expanded={open} aria-controls="mission-brief" onClick={() => setOpen((v) => !v)}>
        <BookOpen className="h-4 w-4" /> {open ? "Masquer le brief" : "Brief"}
      </Button>
      {open && (
        <Card id="mission-brief" className="mt-4 w-full basis-full text-small leading-relaxed">
          <SimpleMarkdown source={brief} />
        </Card>
      )}
    </>
  );
}
