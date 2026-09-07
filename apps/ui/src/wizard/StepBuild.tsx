import React, { useState } from "react";
import { api } from "../api/client";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Badge, Progress } from "../components/ui";
import type { Manifest } from "@toskintaller/config";

interface Props {
  manifest: Manifest;
  onDone: () => void;
}

export default function StepBuild({ manifest, onDone }: Props) {
  const [outDir, setOutDir] = useState(manifest.artifact?.outDir ?? "./release");
  const [fileName, setFileName] = useState(manifest.artifact?.fileName ?? `${manifest.app?.name ?? "App"}-${manifest.app?.version ?? "1.0.0"}`);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ artifactPath: string; hash: string } | null>(null);

  const handleBuild = async () => {
    setBuilding(true);
    setStatus("Preparando build...");
    setError(null);
    setResult(null);

    try {
      const payload = {
        ...manifest,
        artifact: {
          ...(manifest.artifact ?? {}),
          outDir,
          fileName,
        },
      };

      setStatus("Solicitando build ao CLI...");
      const res = await api.build(payload);
      setResult({ artifactPath: res.artifactPath, hash: res.hash });
      setStatus(`✔ Build concluído!`);
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("Erro na build");
    } finally {
      setBuilding(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    const res = await fetch(`/api/artifact?path=${encodeURIComponent(result.artifactPath)}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.artifactPath.split("/").pop() ?? "app.exe";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Artefato final</CardTitle>
          <CardDescription>Configure o nome e local de saída do .exe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Diretório de saída"
            value={outDir}
            onChange={(e) => setOutDir(e.target.value)}
            placeholder="./release"
          />
          <Input
            label="Nome do arquivo (sem extensão)"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="MeuApp-Setup-1.0.0"
          />
          <div className="text-sm text-muted-foreground">
            Modo: <Badge variant="secondary">{manifest.mode}</Badge>
            {" · "}Arquivo: <Badge variant="outline">{fileName}.exe</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Executar build</CardTitle>
          <CardDescription>Gera o .exe usando o pipeline do CLI (input → normalize → stage → stamp → render → bundle → verify → output).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && (
            <div className="text-sm">
              {error ? (
                <span className="text-destructive">{status}: {error}</span>
              ) : (
                <span className="text-slate-200">{status}</span>
              )}
            </div>
          )}
          {progress > 0 && <Progress value={progress} className="h-2" />}
          <Button
            onClick={handleBuild}
            disabled={building || !manifest.input?.path}
            className="w-full"
            size="lg"
          >
            {building ? "Gerando .exe..." : "Gerar .exe"}
          </Button>
          {result && (
            <div className="flex gap-2">
              <Badge variant="default" className="flex-1">
                Hash: {result.hash.slice(0, 16)}...
              </Badge>
              <Button variant="outline" onClick={handleDownload}>
                Baixar .exe
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onDone} className="flex-1">
          Concluir (sem build)
        </Button>
      </div>
    </div>
  );
}
