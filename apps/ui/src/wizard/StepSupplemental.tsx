import React, { useState } from "react";
import { api } from "../api/client";
import { Input, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Checkbox } from "../components/ui";
import { InstallPreview } from "../preview/InstallPreview";
import type { Manifest, Supplemental } from "@toskintaller/config";

interface Props {
  manifest: Manifest;
  onNext: (m: Manifest) => void;
  onBack: (m: Manifest) => void;
}

export default function StepSupplemental({ manifest, onNext, onBack }: Props) {
  const [supplementals, setSupplementals] = useState<Supplemental[]>(manifest.installScreen?.supplemental ?? []);
  const [nsiPreview, setNsiPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const rebuildPreview = async () => {
    try {
      const payload = {
        ...manifest,
        installScreen: {
          ...(manifest.installScreen ?? {}),
          supplemental: supplementals,
        },
      };
      const res = await api.preview(payload);
      setNsiPreview(res.nsi);
      setBannerPreview(res.bannerPng);
    } catch {}
  };

  const addSupplemental = () => {
    const id = `supplemental-${Date.now()}`;
    setSupplementals((prev) => [
      ...prev,
      { id, label: "", file: "", silentArgs: "/S", required: false, defaultChecked: true },
    ]);
  };

  const updateSupplemental = (index: number, field: keyof Supplemental, value: string | boolean) => {
    setSupplementals((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  };

  const removeSupplemental = (index: number) => {
    setSupplementals((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    onNext({
      ...manifest,
      installScreen: { ...(manifest.installScreen ?? {}), supplemental: supplementals },
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Instalações complementares</CardTitle>
          <CardDescription>
            Componentes opcionais que o instalador pode instalar junto (ex.: VC++ Redist).
            O usuário escolhe no instalador; se marcado como obrigatório e falhar, a instalação é abortada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {supplementals.map((s, i) => (
            <div key={s.id} className="border border-border rounded-lg p-4 space-y-2 bg-background">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Complemento #{i + 1}</span>
                <Button variant="ghost" size="sm" onClick={() => removeSupplemental(i)}>Remover</Button>
              </div>
              <Input
                label="Rótulo (o que o usuário vê)"
                value={s.label}
                onChange={(e) => updateSupplemental(i, "label", e.target.value)}
                placeholder="Instalar VC++ Redistributable"
              />
              <Input
                label="Arquivo (.exe)"
                value={s.file}
                onChange={(e) => updateSupplemental(i, "file", e.target.value)}
                placeholder="redist/vcredist_x64.exe"
              />
              <Input
                label="Args silenciosos"
                value={s.silentArgs}
                onChange={(e) => updateSupplemental(i, "silentArgs", e.target.value)}
                placeholder="/quiet /norestart"
              />
              <div className="flex gap-4">
                <Checkbox
                  label="Obrigatório (falha aborta instalação)"
                  checked={s.required}
                  onChange={(e) => updateSupplemental(i, "required", e.target.checked)}
                />
                <Checkbox
                  label="Marcado por padrão"
                  checked={s.defaultChecked}
                  onChange={(e) => updateSupplemental(i, "defaultChecked", e.target.checked)}
                />
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addSupplemental} className="w-full">
            + Adicionar complemento
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atalhos e diretório</CardTitle>
          <CardDescription>Onde o app será instalado e onde criar atalhos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="Diretório de instalação"
            value={manifest.installer?.targetDir ?? "%LOCALAPPDATA%"}
            onChange={(e) =>
              onNext({
                ...manifest,
                installer: { ...(manifest.installer ?? {}), targetDir: e.target.value },
              })
            }
            options={[
              { value: "%LOCALAPPDATA%", label: "Local AppData (por usuário)" },
              { value: "%ProgramFiles%", label: "Program Files (por máquina)" },
            ]}
          />
          <div className="flex gap-4">
            <Checkbox
              label="Atalho no menu Iniciar"
              checked={(manifest.installer?.shortcuts ?? []).includes("startMenu")}
              onChange={(e) => {
                const current = new Set(manifest.installer?.shortcuts ?? []);
                if (e.target.checked) current.add("startMenu");
                else current.delete("startMenu");
                onNext({ ...manifest, installer: { ...(manifest.installer ?? {}), shortcuts: [...current] } });
              }}
            />
            <Checkbox
              label="Atalho na área de trabalho"
              checked={(manifest.installer?.shortcuts ?? []).includes("desktop")}
              onChange={(e) => {
                const current = new Set(manifest.installer?.shortcuts ?? []);
                if (e.target.checked) current.add("desktop");
                else current.delete("desktop");
                onNext({ ...manifest, installer: { ...(manifest.installer ?? {}), shortcuts: [...current] } });
              }}
            />
          </div>
          <Checkbox
            label="Criar desinstalador"
            checked={manifest.installer?.uninstaller ?? true}
            onChange={(e) =>
              onNext({
                ...manifest,
                installer: { ...(manifest.installer ?? {}), uninstaller: e.target.checked },
              })
            }
          />
          <Input
            label="Args de desinstalação silenciosa"
            value={manifest.installer?.silentFlags?.uninstall ?? "/S"}
            onChange={(e) =>
              onNext({
                ...manifest,
                installer: {
                  ...(manifest.installer ?? {}),
                  silentFlags: { ...(manifest.installer?.silentFlags ?? {}), uninstall: e.target.value },
                },
              })
            }
            className="w-full"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview ao vivo</CardTitle>
          <CardDescription>Atualiza conforme você configura os complementos.</CardDescription>
        </CardHeader>
        <CardContent>
          <InstallPreview
            manifest={{
              ...manifest,
              installScreen: {
                ...(manifest.installScreen ?? {}),
                supplemental: supplementals,
              },
            }}
            nsiPreview={nsiPreview ?? undefined}
            bannerPreview={bannerPreview ?? undefined}
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => onBack(manifest)}>Voltar</Button>
        <Button onClick={handleNext} className="flex-1">
          Continuar para build
        </Button>
      </div>
    </div>
  );
}
