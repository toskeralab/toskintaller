import React, { useState, useEffect } from "react";
import { api } from "../api/client";
import { Input, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "../components/ui";
import type { Manifest } from "@toskintaller/config";

interface Props {
  manifest: Manifest;
  onNext: (m: Manifest) => void;
}

export default function StepInput({ manifest, onNext }: Props) {
  const [dir, setDir] = useState(manifest.input?.path ?? "");
  const [files, setFiles] = useState<string[]>([]);
  const [entry, setEntry] = useState(manifest.input?.entry ?? "index.html");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dir) return;
    setLoading(true);
    setError(null);
    api
      .scan(dir)
      .then((res) => {
        setFiles(res.files.slice(0, 50));
        if (res.entry) setEntry(res.entry);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dir]);

  const handleBrowse = async () => {
    const input = document.createElement("input");
    input.type = "file-system-directory";
    input.webkitdirectory = true;
    input.onchange = () => {
      if (input.files?.[0]) {
        setDir(input.files[0].webkitRelativePath.split("/")[0] || "");
      }
    };
    input.click();
  };

  const handleNext = () => {
    const updated = {
      ...manifest,
      input: { ...manifest.input, path: dir, entry },
    } as Manifest;
    onNext(updated);
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Origem do build</CardTitle>
        <CardDescription>Selecione a pasta com os arquivos gerados pelo Freebuff (ex.: dist/ ou build/).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          label="Pasta da build"
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          placeholder="./meu-app/dist"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBrowse}>Procurar pasta</Button>
          <Button onClick={handleNext} disabled={!dir || loading}>
            {loading ? "Scan..." : "Continuar"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {files.length > 0 && (
          <div className="max-h-40 overflow-auto border border-border rounded-md bg-background">
            <p className="text-xs text-muted-foreground p-2 border-b border-border">Arquivos encontrados ({files.length})</p>
            {files.map((f) => (
              <div key={f} className="text-xs px-2 py-1 border-b border-border text-muted-foreground truncate">
                {f}
              </div>
            ))}
          </div>
        )}
        {entry && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Página de entrada detectada:</span>
            <Badge>{entry}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
