import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Progress, Badge, Button } from "../components/ui";
import type { Manifest } from "@toskintaller/config";

interface Props {
  manifest: Manifest;
  nsiPreview?: string;
  bannerPreview?: string | null;
}

const STYLES = [
  { value: "smooth", label: "Smooth (barra determinada)" },
  { value: "marquee", label: "Marquee (rolagem contínua)" },
  { value: "pulse", label: "Pulse (oscila 0→100→0)" },
  { value: "bars", label: "Bars (3 segmentos)" },
  { value: "dots", label: "Dots (animado)" },
];

export default function InstallPreview({ manifest, nsiPreview, bannerPreview }: Props) {
  const [simProgress, setSimProgress] = useState(0);
  const [simPhase, setSimPhase] = useState<"idle" | "installing" | "done">("idle");
  const [supplementalStates, setSupplementalStates] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (simPhase !== "idle") {
      const iv = setInterval(() => {
        setSimProgress((p) => {
          if (p >= 100) {
            setSimPhase("done");
            clearInterval(iv);
            return 100;
          }
          return p + 2;
        });
      }, 60);
      return () => clearInterval(iv);
    }
  }, [simPhase]);

  const startInstall = () => {
    if (simPhase === "idle") {
      setSimPhase("installing");
      setSimProgress(0);
    }
  };

  const supplemental = manifest.installScreen?.supplemental ?? [];
  const style = manifest.installScreen?.progress?.style ?? "smooth";
  const styleInfo = STYLES.find((s) => s.value === style);

  return (
    <div className="mt-6 space-y-4">
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        {/* Banner gradient simulation */}
        <div className="h-8 w-full bg-gradient-to-r from-emerald-700 to-blue-900" />

        {/* Title */}
        <div className="px-6 pt-4 pb-1">
          <div className="text-lg font-semibold text-slate-100">
            {manifest.installScreen?.title ?? "Instalando App"}
          </div>
        </div>

        {/* Subtitle */}
        {(manifest.installScreen?.subtitle ?? "").length > 0 && (
          <div className="px-6 py-1 text-sm text-slate-400">
            {manifest.installScreen?.subtitle}
          </div>
        )}

        {/* Simulated progress area */}
        <div className="px-6 pb-2">
          <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-100"
              style={{
                width: `${simProgress}%`,
                background:
                  style === "marquee"
                    ? "linear-gradient(90deg, transparent, #4ade80, transparent)"
                    : "hsl(var(--primary))",
              }}
            />
          </div>
          {styleInfo && (
            <p className="mt-1 text-xs text-slate-500">
              Estilo: <Badge variant="secondary">{styleInfo.label}</Badge>
            </p>
          )}
        </div>

        {/* Supplemental checkboxes (preview) */}
        {supplemental.length > 0 && (
          <div className="px-6 pb-3 space-y-2">
            {supplemental.map((s, i) => (
              <label
                key={s.id}
                className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={supplementalStates[i] ?? s.defaultChecked}
                  onChange={(e) =>
                    setSupplementalStates((prev) => ({ ...prev, [i]: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-600 text-primary"
                />
                {s.label}
                {s.required && <Badge variant="destructive" className="ml-1">obrigatório</Badge>}
              </label>
            ))}
          </div>
        )}

        {/* Footer */}
        {(manifest.installScreen?.footer ?? "").length > 0 && (
          <div className="px-6 py-2 text-xs text-slate-500 border-t border-border">
            {manifest.installScreen?.footer}
          </div>
        )}

        {/* Action button */}
        <div className="px-6 py-3 flex justify-end">
          <Button
            size="sm"
            variant={simPhase === "idle" ? "default" : "secondary"}
            onClick={startInstall}
            disabled={simPhase === "done"}
          >
            {simPhase === "idle" ? "Iniciar instalação" : simPhase === "installing" ? "Instalando..." : "Concluído"}
          </Button>
        </div>

        {/* Phase indicator */}
        {simPhase !== "idle" && (
          <div className="px-6 pb-4">
            <Progress value={simProgress} className="h-1" />
            {simPhase === "done" && (
              <p className="mt-2 text-sm text-emerald-400">
                {manifest.installScreen?.finish?.message ?? "Instalação concluída!"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* NSIS script preview (collapsed) */}
      {nsiPreview && (
        <details className="mt-2">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-slate-200">
            Visualizar script NSIS gerado
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto bg-slate-950 text-xs p-4 rounded border border-border font-mono">
            <code>{nsiPreview}</code>
          </pre>
        </details>
      )}

      {/* Banner preview */}
      {bannerPreview && (
        <div className="mt-2">
          <p className="text-sm text-muted-foreground mb-1">Banner BMP (preview):</p>
          <img src={bannerPreview} alt="Banner preview" className="max-h-10 rounded border border-border" />
        </div>
      )}
    </div>
  );
}
