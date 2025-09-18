"use client";

import { useEffect, useState } from "react";

type Game = {
  id?: string;
  name: string;
  slug: string;
  source_url?: string;
  cover_image?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  description_md?: string;
  is_published?: boolean;
};

const empty: Game = { name: "", slug: "", is_published: false };

export default function AdminPage() {
  const [token, setToken] = useState<string>("");
  const [games, setGames] = useState<Game[]>([]);
  const [draft, setDraft] = useState<Game>(empty);
  const [msg, setMsg] = useState<string>("");
  const inputClass = "w-full rounded-[var(--radius-sm)] border border-border/50 bg-surface px-3 py-2 text-sm text-foreground shadow-soft placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
  const buttonPrimary = "inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark";
  const buttonSurface = "inline-flex items-center justify-center gap-2 rounded-full border border-border/50 bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted";

  useEffect(() => {
    const t = localStorage.getItem("ADMIN_TOKEN") || "";
    setToken(t);
    if (t) load();
  }, []);

  async function load() {
    setMsg("Loading games...");
    const res = await fetch("/api/admin/games", { headers: { "x-admin-token": token } });
    setMsg("");
    if (!res.ok) return setMsg("Failed to load games");
    const data = await res.json();
    setGames(data);
  }

  async function save() {
    setMsg("Saving...");
    const res = await fetch("/api/admin/games", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(draft)
    });
    if (!res.ok) { setMsg("Save failed"); return; }
    setDraft(empty);
    await load();
    setMsg("Saved");
  }

  async function publish(id: string, publish: boolean) {
    setMsg(publish ? "Publishing..." : "Unpublishing...");
    const res = await fetch(`/api/admin/games/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ is_published: publish })
    });
    await load();
    setMsg(publish ? "Published" : "Unpublished");
  }

  async function scrape(id: string) {
    setMsg("Scraping...");
    const res = await fetch(`/api/admin/scrape/${id}`, { method: "POST", headers: { "x-admin-token": token } });
    if (!res.ok) { setMsg("Scrape failed"); return; }
    setMsg("Scraped & updated codes");
  }

  function setKey(k: keyof Game, v: any) { setDraft(prev => ({ ...prev, [k]: v })); }

  return (
    <div className="space-y-8">
      <section className="panel space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Admin</h1>
          <p className="text-sm text-muted">Enter your admin token to manage games.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className={inputClass}
            type="password"
            placeholder="ADMIN_TOKEN"
            value={token}
            onChange={e => setToken(e.target.value)}
          />
          <button className={buttonPrimary} onClick={() => { localStorage.setItem("ADMIN_TOKEN", token); load(); }}>Save & Load</button>
        </div>
        {msg ? <p className="text-sm text-muted mt-2">{msg}</p> : null}
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">Add / Edit Game</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className={inputClass} placeholder="Name" value={draft.name} onChange={e=>setKey("name", e.target.value)} />
          <input className={inputClass} placeholder="Slug (lowercase, hyphens)" value={draft.slug} onChange={e=>setKey("slug", e.target.value)} />
          <input className={inputClass} placeholder="Source URL (Robloxden)" value={draft.source_url||""} onChange={e=>setKey("source_url", e.target.value)} />
          <input className={inputClass} placeholder="Cover image URL" value={draft.cover_image||""} onChange={e=>setKey("cover_image", e.target.value)} />
          <input className={inputClass} placeholder="SEO Title" value={draft.seo_title||""} onChange={e=>setKey("seo_title", e.target.value)} />
          <input className={inputClass} placeholder="Meta Description" value={draft.seo_description||""} onChange={e=>setKey("seo_description", e.target.value)} />
          <input className={inputClass} placeholder="SEO Keywords (comma separated)" value={draft.seo_keywords||""} onChange={e=>setKey("seo_keywords", e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-foreground/80"><input type="checkbox" checked={!!draft.is_published} onChange={e=>setKey("is_published", e.target.checked)} /> Publish</label>
          <textarea className={`${inputClass} min-h-[160px] md:col-span-2`} placeholder="Description (Markdown supported)"
            value={draft.description_md||""} onChange={e=>setKey("description_md", e.target.value)} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className={buttonPrimary} onClick={save}>Save</button>
          <button className={buttonSurface} onClick={()=>setDraft(empty)}>Reset</button>
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">Games</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {games.map(g => (
            <div key={g.id} className="rounded-[var(--radius-sm)] border border-border/60 bg-surface-muted/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{g.name}</div>
                  <div className="text-xs text-muted">{g.slug}</div>
                </div>
                <div className="text-xs text-muted">
                  {g.is_published ? <span className="chip bg-accent/15 text-accent">Published</span> : <span className="chip">Draft</span>}
                </div>
              </div>
              {g.source_url ? <div className="mt-3 break-all text-xs text-muted">{g.source_url}</div> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={buttonSurface} onClick={()=>publish(g.id!, !g.is_published)}>{g.is_published ? "Unpublish" : "Publish"}</button>
                <button className={buttonSurface} onClick={()=>scrape(g.id!)}>Refresh Codes</button>
                <a className={buttonSurface} href={`/${g.slug}`} target="_blank" rel="noreferrer">Open</a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
