import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "../components/ui";
import type { Manifest } from "@toskintaller/config";

interface Props {
  manifest: Manifest;
  onNext: (m: Manifest) => void;
}

export default function StepMode({ manifest, onNext }: Props) {
  const isInstaller = manifest.mode === "installer";

  const handleNext = () => onNext(manifest);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Modo de entrega</CardTitle>
        <CardDescription>Escolha como o app será entregue ao usuário final.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onNext({ ...manifest, mode: "standalone" } as Manifest)}
            className={`text-left rounded-lg border p-4 transition-all ${
              manifest.mode === "standalone"
                ? "border-primary ring-2 ring-ring"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="text-lg font-semibold">Executável standalone</div>
            <div className="mt-2 text-sm text-muted-foreground">
              .exe portátil que roda sem instalação. Extrai para %TEMP% e executa imediatamente.
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Ideal para distribuição rápida, sem necessidade de instalação.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onNext({ ...manifest, mode: "installer" } as Manifest)}
            className={`text-left rounded-lg border p-4 transition-all ${
              isInstaller
                ? "border-primary ring-2 ring-ring"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="text-lg font-semibold">Instalador Windows</div>
            <div className="mt-2 text-sm text-muted-foreground">
              .exe instalador com tela customizada, atalhos, desinstalador e complementos opcionais.
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Recomendado para distribuição formal com instalação controlada.
            </div>
          </button>
        </div>
        <Button onClick={handleNext} className="w-full">
          Continuar para configuração da tela
        </Button>
      </CardContent>
    </Card>
  );
}
