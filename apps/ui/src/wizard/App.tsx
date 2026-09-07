import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { STEPS, WizardStep } from "./steps";
import StepInput from "./StepInput";
import StepMode from "./StepMode";
import StepInstallScreen from "./StepInstallScreen";
import StepSupplemental from "./StepSupplemental";
import StepBuild from "./StepBuild";
import { Card, CardHeader, CardTitle, CardContent, Button } from "../components/ui";
import type { Manifest } from "@toskintaller/config";

const DEFAULT_MANIFEST: Manifest = {
  schemaVersion: 1,
  app: { id: "br.lab.app", name: "Meu App", version: "1.0.0", publisher: "ToskeraLAB" },
  input: { type: "folder", path: "", entry: "index.html" },
  mode: "installer",
  artifact: { outDir: "./release", fileName: "App-1.0.0" },
};

export default function App() {
  const [step, setStep] = useState<WizardStep>("input");
  const [manifest, setManifest] = useState<Manifest>(DEFAULT_MANIFEST);
  const [loadingManifest, setLoadingManifest] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const goNext = useCallback((next: WizardStep) => {
    const idx = STEPS.findIndex((s) => s.key === next);
    if (idx >= 0) setStep(next);
  }, []);

  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].key);
  };

  const handleManifestDone = useCallback(() => {
    // Wizard completed without building — just finish
  }, []);

  const saveManifestLocally = async (m: Manifest) => {
    try {
      await api.saveManifest("./toskintaller.json", m);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}        <div className="border-b border-border bg-slate-950 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              T
            </div>
            <div>
              <h1 className="text-lg font-semibold">Toskinstaller</h1>
              <p className="text-xs text-muted-foreground">Wizard de empacotamento · Freebuff</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            v0.1.0 · {manifest.mode}
          </div>          </div>

        {/* Progress steps */}
        <div className="max-w-2xl mx-auto px-6 mt-6">
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                      i <= stepIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-slate-800 text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-sm font-medium">{s.label}</div>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      i < stepIndex ? "bg-primary" : "bg-slate-700"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* Step: Input */}
          {step === "input" && (
            <StepInput
              manifest={manifest}
              onNext={(m) => {
                setManifest(m);
                saveManifestLocally(m);
                goNext("mode");
              }}
            />
          )}

          {/* Step: Mode */}
          {step === "mode" && (
            <>
              <StepMode
                manifest={manifest}
                onNext={(m) => {
                  setManifest(m);
                  saveManifestLocally(m);
                  goNext("installScreen");
                }}
              />
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => goBack()}>Voltar</Button>
              </div>
            </>
          )}

          {/* Step: Install Screen */}
          {step === "installScreen" && (
            <>
              <StepInstallScreen
                manifest={manifest}
                onNext={(m) => {
                  setManifest(m);
                  saveManifestLocally(m);
                  goNext("supplemental");
                }}
              />
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => goBack()}>Voltar</Button>
              </div>
            </>
          )}

          {/* Step: Supplemental */}
          {step === "supplemental" && (
            <StepSupplemental
              manifest={manifest}
              onNext={(m) => {
                setManifest(m);
                saveManifestLocally(m);
                goNext("build");
              }}
              onBack={() => goBack()}
            />
          )}

          {/* Step: Build */}
          {step === "build" && (
            <>
              <StepBuild
                manifest={manifest}
                onDone={() => {
                  handleManifestDone();
                }}
              />
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => goBack()}>Voltar</Button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-border bg-slate-950 px-6 py-4 mt-8">
          <div className="max-w-2xl mx-auto text-xs text-muted-foreground text-center">
            Toskinstaller · Ferramenta interna do ToskeraLAB · Use o Freebuff para gerar os arquivos do app
          </div>
        </footer>
      </div>
    </div>
  );
}
