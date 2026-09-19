"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon, KeyIcon, SparkleIcon, TrashIcon, UserIcon } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Provider = "gemini" | "xai";
type Config = { provider: Provider; configured: true; keyHint: string; model: string; updatedAt: string };
type ModelOption = { id: string; imageInput: boolean; imageOutput: boolean };

export function SettingsPanel({ active = true, user, className = "" }: { active?: boolean; user?: { name: string; avatar?: string }; className?: string }) {
  const [name, setName] = useState(user?.name ?? "");
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [keys, setKeys] = useState<Record<Provider, string>>({ gemini: "", xai: "" });
  const [models, setModels] = useState<Record<Provider, ModelOption[]>>({ gemini: [], xai: [] });
  const [selectedModels, setSelectedModels] = useState<Record<Provider, string>>({ gemini: "", xai: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [encryptionReady, setEncryptionReady] = useState(true);

  useEffect(() => {
    if (!active) return;
    setName(user?.name ?? "");
    setMessage(null);
    fetch("/api/settings/ai", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load AI settings");
      return response.json();
    }).then((data) => {
      setActiveProvider(data.activeProvider);
      setEncryptionReady(data.encryptionConfigured === true);
      setConfigs(data.providers);
      setSelectedModels((current) => ({ ...current, ...Object.fromEntries(data.providers.map((item: Config) => [item.provider, item.model])) }));
    }).catch((error) => setMessage(error.message));
  }, [active, user?.name]);

  async function saveProfile() {
    setBusy("profile"); setMessage(null);
    const response = await fetch("/api/auth/user-details", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setMessage(response.ok ? "Profile updated." : "Could not update your profile.");
    setBusy(null);
  }

  async function saveProvider(provider: Provider) {
    setBusy(provider); setMessage(null);
    const response = await fetch("/api/settings/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey: keys[provider], model: selectedModels[provider] }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Could not validate that key."); setBusy(null); return; }
    setConfigs((items) => [...items.filter((item) => item.provider !== provider), { provider, configured: true, keyHint: data.keyHint, model: data.model, updatedAt: new Date().toISOString() }]);
    setModels((current) => ({ ...current, [provider]: data.models ?? [{ id:data.model, imageInput:false, imageOutput:false }] }));
    setSelectedModels((current) => ({ ...current, [provider]: data.model }));
    setKeys((current) => ({ ...current, [provider]: "" }));
    setActiveProvider(provider);
    setMessage(`${provider === "gemini" ? "Gemini" : "Grok"} is ready.`);
    setBusy(null);
  }

  async function removeProvider(provider: Provider) {
    setBusy(`delete-${provider}`); setMessage(null);
    const response = await fetch(`/api/settings/ai?provider=${provider}`, { method: "DELETE" });
    if (response.ok) {
      setConfigs((items) => items.filter((item) => item.provider !== provider));
      if (activeProvider === provider) setActiveProvider(null);
      setMessage("Credential removed.");
    } else setMessage("Could not remove that credential.");
    setBusy(null);
  }

  return (
    <div className={`bg-[#fffdf8] ${className}`}>
        <div className="border-b border-[#e1dbd0] px-7 pb-5 pt-7">
          <h2 className="font-[var(--font-instrument)] text-3xl font-normal">Workspace settings</h2>
          <p className="mt-2 text-sm text-[#837c72]">Profile details and private AI provider credentials.</p>
        </div>
        <Tabs defaultValue="profile" className="px-7 pb-7">
          <TabsList className="mt-5 bg-[#eee9df]">
            <TabsTrigger value="profile"><UserIcon /> Profile</TabsTrigger>
            <TabsTrigger value="ai"><SparkleIcon /> AI providers</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-6 space-y-5">
            <div className="flex items-center gap-4 rounded-xl border border-[#e1dbd0] bg-white p-4">
              <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-[#2d2924] text-sm text-white">{user?.avatar?.startsWith("http") ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : (name || "O").slice(0, 2).toUpperCase()}</div>
              <div><p className="text-sm font-semibold">Google profile</p><p className="mt-1 text-xs text-[#837c72]">Your Google avatar is used for collaboration presence.</p></div>
            </div>
            <div className="space-y-2"><Label htmlFor="settings-name">Display name</Label><Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} className="border-[#d8d1c5] bg-white" /></div>
            <Button onClick={saveProfile} disabled={busy === "profile"} className="text-white bg-[#7140cd] hover:bg-[#6033b7]">{busy === "profile" ? "Saving…" : "Save profile"}</Button>
          </TabsContent>
          <TabsContent value="ai" className="mt-6 space-y-4">
            {!encryptionReady && <div role="alert" className="rounded-xl border border-[#efc3bc] bg-[#fff0ed] p-4 text-xs leading-5 text-[#963b32]">This server cannot store API keys yet. Set <code>AI_CREDENTIALS_ENCRYPTION_KEY</code> to a Base64 or Base64URL value that decodes to exactly 32 bytes, then restart Omnidoc. Generate one with <code>node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"</code>.</div>}
            <div className="rounded-xl border border-[#ded6c9] bg-[#f5f1e8] p-4 text-xs leading-5 text-[#6d665c]">
              Keys are encrypted with AES-256-GCM and never returned to the browser. Document excerpts and explicitly attached images are sent only to the provider you select when you request an edit.
            </div>
            {(["gemini", "xai"] as Provider[]).map((provider) => {
              const configured = configs.find((item) => item.provider === provider);
              const label = provider === "gemini" ? "Google Gemini" : "xAI Grok";
              return <section key={provider} className={`rounded-xl border p-4 ${activeProvider === provider ? "border-[#9165d4] bg-[#faf7ff]" : "border-[#ded8cd] bg-white"}`}>
                <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{label}</h3>{configured && <span className="inline-flex items-center gap-1 rounded-full bg-[#e9e0f9] px-2 py-1 text-[10px] text-[#6940ab]"><CheckCircleIcon weight="fill" /> {activeProvider === provider ? "Active" : "Configured"}</span>}</div><p className="mt-1 text-xs text-[#837c72]">{configured ? `Key ending in ${configured.keyHint} · ${configured.model}` : "Use your own provider key."}</p></div>{configured && <button onClick={() => removeProvider(provider)} disabled={busy === `delete-${provider}`} className="rounded-lg p-2 text-[#9b4a43] hover:bg-[#fff0ed]" aria-label={`Remove ${label}`}><TrashIcon /></button>}</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
                  <div className="relative"><KeyIcon className="absolute left-3 top-2.5 text-[#8c8378]" /><Input type="password" aria-label={`${label} API key`} value={keys[provider]} onChange={(event) => setKeys((current) => ({ ...current, [provider]: event.target.value }))} placeholder={configured ? "Replace API key" : "Paste API key"} className="border-[#d8d1c5] bg-white pl-9" /></div>
                  {models[provider].length ? <select aria-label={`${label} model`} value={selectedModels[provider]} onChange={(event) => setSelectedModels((current) => ({ ...current, [provider]: event.target.value }))} className="h-9 rounded-md border border-[#d8d1c5] bg-white px-2 text-xs">{models[provider].map((model) => <option key={model.id} value={model.id}>{model.id}{model.imageInput ? " · vision" : ""}</option>)}</select> : <Input value={selectedModels[provider]} onChange={(event) => setSelectedModels((current) => ({ ...current, [provider]: event.target.value }))} placeholder="Model (auto)" className="border-[#d8d1c5] bg-white text-xs" />}
                  <Button onClick={() => saveProvider(provider)} disabled={!encryptionReady || busy === provider || !keys[provider].trim()} className="bg-[#2d2924] text-white hover:bg-[#4b443b]">{busy === provider ? "Checking…" : configured ? "Update" : "Connect"}</Button>
                </div>
              </section>;
            })}
            {message && <p role="status" className="text-xs text-[#6940ab]">{message}</p>}
          </TabsContent>
        </Tabs>
    </div>
  );
}

export function SettingsModal({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user?: { name: string; avatar?: string } }) {
  return <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}><DialogContent className="settings-dialog max-h-[88vh] overflow-y-auto border-[#d8d1c5] bg-[#fffdf8] p-0 sm:max-w-[680px]"><DialogHeader className="sr-only"><DialogTitle>Workspace settings</DialogTitle><DialogDescription>Profile details and private AI provider credentials.</DialogDescription></DialogHeader><SettingsPanel active={isOpen} user={user}/></DialogContent></Dialog>;
}
