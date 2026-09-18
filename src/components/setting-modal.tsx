"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon, KeyIcon, SparkleIcon, TrashIcon, UserIcon } from "@phosphor-icons/react";
import { FaXTwitter } from "react-icons/fa6";
import { RiGeminiFill } from "react-icons/ri";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GalaxyButton } from "@/components/galaxy-button";

type Provider = "gemini" | "xai";
type Config = { provider: Provider; configured: true; keyHint: string; model: string; updatedAt: string };

export function SettingsModal({ isOpen, onClose, onProfileSaved, user }: { isOpen: boolean; onClose: () => void; onProfileSaved?: (name: string) => void; user?: { name: string; avatar?: string } }) {
  const [name, setName] = useState(user?.name ?? "");
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [keys, setKeys] = useState<Record<Provider, string>>({ gemini: "", xai: "" });
  const [models, setModels] = useState<Record<Provider, string[]>>({ gemini: [], xai: [] });
  const [selectedModels, setSelectedModels] = useState<Record<Provider, string>>({ gemini: "", xai: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [encryptionReady, setEncryptionReady] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setName(user?.name ?? "");
    setMessage(null);
    fetch("/api/settings/ai", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load AI settings");
      return response.json();
    }).then((data) => {
      setActiveProvider(data.activeProvider);
      setEncryptionReady(data.encryptionConfigured !== false);
      setConfigs(data.providers);
      setSelectedModels((current) => ({ ...current, ...Object.fromEntries(data.providers.map((item: Config) => [item.provider, item.model])) }));
    }).catch((error) => setMessage(error.message));
  }, [isOpen, user?.name]);

  async function saveProfile() {
    setBusy("profile"); setMessage(null);
    try {
      const response = await fetch("/api/auth/user-details", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      if (!response.ok) throw new Error("Could not update your profile.");
      onProfileSaved?.(name.trim());
      setMessage("Profile updated.");
    } catch { setMessage("Could not update your profile."); }
    finally { setBusy(null); }
  }

  async function saveProvider(provider: Provider) {
    setBusy(provider); setMessage(null);
    const response = await fetch("/api/settings/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey: keys[provider], model: selectedModels[provider] }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Could not validate that key."); setBusy(null); return; }
    setConfigs((items) => [...items.filter((item) => item.provider !== provider), { provider, configured: true, keyHint: data.keyHint, model: data.model, updatedAt: new Date().toISOString() }]);
    setModels((current) => ({ ...current, [provider]: data.models ?? [data.model] }));
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-[28px] border-[#e3ddd4] bg-[#fcfbf8] p-0 shadow-[0_30px_100px_rgba(45,38,31,0.18)] sm:max-w-[680px]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#e9defa]/60 blur-3xl" aria-hidden="true" />
        <DialogHeader className="relative border-b border-[#e9e3da] px-6 pb-6 pt-7 sm:px-8">
          <span className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#846e9d]">Workspace</span>
          <DialogTitle className="font-[var(--font-instrument)] text-[2.15rem] font-normal tracking-[-0.02em] text-[#29251f]">Settings</DialogTitle>
          <DialogDescription className="max-w-[36rem] text-[13px] leading-5 text-[#817a70]">Personalize your profile and connect the AI providers you trust.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="profile" className="relative px-5 pb-6 sm:px-8 sm:pb-8">
          <TabsList className="mt-5 h-11 w-full justify-start gap-1 rounded-full bg-[#eeeae2] p-1 sm:w-fit">
            <TabsTrigger value="profile" className="h-9 rounded-full px-4 text-xs text-[#827b71] data-[state=active]:bg-white data-[state=active]:text-[#3f345b] data-[state=active]:shadow-[0_2px_8px_rgba(45,38,31,0.08)]"><UserIcon /> Profile</TabsTrigger>
            <TabsTrigger value="ai" className="h-9 rounded-full px-4 text-xs text-[#827b71] data-[state=active]:bg-white data-[state=active]:text-[#3f345b] data-[state=active]:shadow-[0_2px_8px_rgba(45,38,31,0.08)]"><SparkleIcon /> AI providers</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-6 space-y-5">
            <section className="rounded-2xl border border-[#e5dfd6] bg-white p-4 shadow-[0_8px_24px_rgba(45,38,31,0.04)] sm:p-5">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(145deg,#34264d,#9d7cc3)] text-sm font-semibold text-white shadow-[0_8px_18px_rgba(75,51,111,0.2)]">{user?.avatar?.startsWith("http") ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : (name || "O").slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[#302a25]">Google profile</p><span className="rounded-full bg-[#f0e8fa] px-2 py-1 text-[10px] font-medium text-[#6e4c94]">Connected</span></div><p className="mt-1 text-xs leading-5 text-[#837c72]">Your avatar and name are used for collaboration presence.</p></div>
              </div>
            </section>
            <section className="rounded-2xl border border-[#e5dfd6] bg-[#f8f6f1] p-4 sm:p-5">
              <div className="mb-3"><Label htmlFor="settings-name" className="text-xs font-semibold text-[#4c443c]">Display name</Label><p className="mt-1 text-[11px] text-[#948c81]">This is how teammates will see you in documents.</p></div>
              <Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-xl border-[#ded7cd] bg-white px-4 text-sm shadow-none focus-visible:ring-[#b8a4d0]" />
            </section>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5">{message && <p role="status" className="text-xs font-medium text-[#6940ab]">{message}</p>}</div>
              <GalaxyButton onClick={saveProfile} disabled={busy === "profile"} variant="violet" size="sm" label={busy === "profile" ? "Saving…" : "Save profile"} />
            </div>
          </TabsContent>
          <TabsContent value="ai" className="mt-6 space-y-4">
            {!encryptionReady && <div role="alert" className="rounded-2xl border border-[#efc3bc] bg-[#fff0ed] p-4 text-xs leading-5 text-[#963b32]">This server cannot store API keys yet. Set <code>AI_CREDENTIALS_ENCRYPTION_KEY</code> to 32 random bytes encoded as base64, then restart Omnidoc.</div>}
            <div className="rounded-2xl border border-[#e4ddd2] bg-[#f3efe7] p-4 text-xs leading-5 text-[#6d665c] sm:p-5">
              <div className="flex gap-3"><div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[#735493] shadow-sm"><KeyIcon size={14} /></div><p>Keys are encrypted with AES-256-GCM and never returned to the browser. Document excerpts are sent only to the provider you select when you request an edit.</p></div>
            </div>
            {(["gemini", "xai"] as Provider[]).map((provider) => {
              const configured = configs.find((item) => item.provider === provider);
              const label = provider === "gemini" ? "Google Gemini" : "xAI Grok";
              return <section key={provider} className={`rounded-2xl border p-4 transition-colors sm:p-5 ${activeProvider === provider ? "border-[#a178d0] bg-[#fbf8ff] shadow-[0_8px_26px_rgba(115,77,157,0.08)]" : "border-[#e1dbd2] bg-white"}`}>
                <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${provider === "gemini" ? "bg-[#eee8fb] text-[#7451bd]" : "bg-[#efeeec] text-[#302d2a]"}`} aria-hidden="true">{provider === "gemini" ? <RiGeminiFill size={18} /> : <FaXTwitter size={16} />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-[#302a25]">{label}</h3>{configured && <span className="inline-flex items-center gap-1 rounded-full bg-[#e9e0f9] px-2 py-1 text-[10px] font-medium text-[#6940ab]"><CheckCircleIcon weight="fill" /> {activeProvider === provider ? "Active" : "Configured"}</span>}</div><p className="mt-1 truncate text-xs text-[#837c72]">{configured ? `Key ending in ${configured.keyHint} · ${configured.model}` : "Use your own provider key."}</p></div></div>{configured && <button onClick={() => removeProvider(provider)} disabled={busy === `delete-${provider}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#9b4a43] transition-colors hover:bg-[#fff0ed]" aria-label={`Remove ${label}`}><TrashIcon size={16} /></button>}</div>
                <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <div className="relative"><KeyIcon className="absolute left-3.5 top-3 text-[#8c8378]" size={15} /><Input type="password" aria-label={`${label} API key`} value={keys[provider]} onChange={(event) => setKeys((current) => ({ ...current, [provider]: event.target.value }))} placeholder={configured ? "Replace API key" : "Paste API key"} className="h-11 rounded-xl border-[#ded7cd] bg-[#fcfbf8] pl-10 text-sm shadow-none focus-visible:ring-[#b8a4d0]" /></div>
                  {models[provider].length ? <select aria-label={`${label} model`} value={selectedModels[provider]} onChange={(event) => setSelectedModels((current) => ({ ...current, [provider]: event.target.value }))} className="h-11 min-w-0 rounded-xl border border-[#ded7cd] bg-[#fcfbf8] px-3 text-xs text-[#51493f] outline-none focus:border-[#b8a4d0] focus:ring-2 focus:ring-[#b8a4d0]/30">{models[provider].map((model) => <option key={model}>{model}</option>)}</select> : <Input value={selectedModels[provider]} onChange={(event) => setSelectedModels((current) => ({ ...current, [provider]: event.target.value }))} placeholder="Model (auto)" className="h-11 rounded-xl border-[#ded7cd] bg-[#fcfbf8] text-sm shadow-none focus-visible:ring-[#b8a4d0]" />}
                  <Button size="lg" onClick={() => saveProvider(provider)} disabled={!encryptionReady || busy === provider || !keys[provider].trim()} className="h-11 rounded-full bg-[#332c3b] px-5 text-sm text-white hover:bg-[#51435e]">{busy === provider ? "Checking…" : configured ? "Update" : "Connect"}</Button>
                </div>
              </section>;
            })}
            {message && <p role="status" className="text-xs text-[#6940ab]">{message}</p>}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
