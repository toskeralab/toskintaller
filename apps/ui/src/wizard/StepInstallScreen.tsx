import React, { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import {
  Input, Textarea, Select, Button, Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "../components/ui";
import { InstallPreview } from "../preview/InstallPreview";
import type { Manifest } from "@toskintaller/config";
import { PROGRESS_STYLES } from "@toskintaller/config";

interface Props {
  manifest: Manifest;
  onNext: (m: Manifest) => void;
}

export default function StepInstallScreen({ manifest, onNext }: Props) {
  const [title, setTitle] = useState(manifest.installScreen?.title ?? "Instalação");
  const [subtitle, setSubtitle] = useState(manifest.installScreen?.subtitle ?? "");
  const [footer, setFooter] = useState(manifest.installScreen?.footer ?? "");
  const [style, setStyle] = useState(manifest.installScreen?.progress?.style ?? "smooth");
  const [installingLabel, setInstallingLabel] = useState(manifest.installScreen?.progress?.labels?.installing ?? "Instalando arquivos...");
  const [doneLabel, setDoneLabel] = useState(manifest.installScreen?.progress?.labels?.done ?? "Concluído!");
  const [finishTitle, setFinishTitle] = useState(manifest.installScreen?.finish?.title ?? "Instalação concluída");
  const [finishMessage, setFinishMessage] = useState(manifest.installScreen?.finish?.message ?? "Obrigado por instalar!");
  const [runAfterInstall, setRunAfterInstall] = useState(manifest.installScreen?.finish?.runAfterInstall ?? true);
  const [nsiPreview, setNsiPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const rebuildPreview = useCallback(async () => {
    setPreviewError(null);
    try {
      const payload = {
        ...manifest,
        installScreen: {
          ...(manifest.installScreen ?? {}),
          title,
          subtitle,
          footer,
          progress: {
            ...(manifest.installScreen?.progress ?? {}),
            style,
            labels: {
              ...(manifest.installScreen?.progress?.labels ?? {}),
              installing: installingLabel,
              done: doneLabel,
            },
          },
          finish: {
            ...(manifest.installScreen?.finish ?? {}),
            title: finishTitle,
            message: finishMessage,
            runAfterInstall,
          },
        },
      };
      const res = await api.preview(payload);
      setNsiPreview(res.nsi);
      setBannerPreview(res.bannerPng);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
      setNsiPreview(null);
      setBannerPreview(null);
    }
  }, [title, subtitle, footer, style, installingLabel, doneLabel, finishTitle, finishMessage, runAfterInstall, manifest]);

  useEffect(() => {
    rebuildPreview();
  }, [rebuildPreview]);

  const mode = manifest.mode;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Textos da tela de instalação</CardTitle>
          <CardDescription>O que o usuário vê durante a instalação (aparece no instalador NSIS).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Instalando Meu App" />
          <Input label="Subtítulo (opcional)" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Feito com Freebuff · ToskeraLAB" />
          <Input label="Rodapé (opcional)" value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="© 2026 ToskeraLAB" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progresso animado (RF4 — S0.4)</CardTitle>
          <CardDescription>Escolha um dos 2 a 5 estilos simples. O preview ao vivo mostra como fica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="Estilo de progresso"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            options={PROGRESS_STYLES.map((s) => ({ value: s, label: s }))}
          />
          {mode === "installer" && (
            <>
              <Input
                label="Rótulo: instalando"
                value={installingLabel}
                onChange={(e) => setInstallingLabel(e.target.value)}
              />
              <Input
                label="Rótulo: pronto"
                value={doneLabel}
                onChange={(e) => setDoneLabel(e.target.value)}
              />
            </>
          )}
          {mode === "standalone" && (
            <p className="text-sm text-muted-foreground">O progresso aparece durante o carregamento do app standalone.</p>
          )}
        </CardContent>
      </Card>

      {mode === "installer" && (
        <Card>
          <CardHeader>
            <CardTitle>Tela final (finish)</CardTitle>
            <CardDescription>O que aparece quando a instalação termina.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="Título" value={finishTitle} onChange={(e) => setFinishTitle(e.target.value)} />
            <Textarea label="Mensagem" value={finishMessage} onChange={(e) => setFinishMessage(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={runAfterInstall}
                onChange={(e) => setRunAfterInstall(e.target.checked)}
                className="h-4 w-4"
              />
              Abrir o app automaticamente após a instalação
            </label>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Preview ao vivo</CardTitle>
          <CardDescription>O que o usuário verá no instalador (fiel ao NSIS).</CardDescription>
        </CardHeader>
        <CardContent>
          {previewError && (
            <p className="text-sm text-destructive mb-2">{previewError}</p>
          )}
          <InstallPreview manifest={{ ...manifest, installScreen: { title, subtitle, footer, progress: { style, labels: { installing: installingLabel, done: doneLabel } }, finish: { title: finishTitle, message: finishMessage, runAfterInstall }, supplemental: manifest.installScreen?.supplemental ?? [] } }} nsiPreview={nsiPreview ?? undefined} bannerPreview={bannerPreview ?? undefined} />
        </CardContent>
      </Card>

      <Button
        onClick={() =>
          onNext({
            ...manifest,
            installScreen: {
              ...(manifest.installScreen ?? {}),
              title,
              subtitle,
              footer,
              progress: {
                ...(manifest.installScreen?.progress ?? {}),
                style,
                labels: { ...(manifest.installScreen?.progress?.labels ?? {}), installing: installingLabel, done: doneLabel },
              },
              finish: {
                ...(manifest.installScreen?.finish ?? {}),
                title: finishTitle,
                message: finishMessage,
                runAfterInstall,
              },
            },
          })
        }
        className="w-full"
      >
        Continuar para complementos
      </Button>
    </div>
  );
}
