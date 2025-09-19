"use client";

import { useEffect, useState } from "react";
import { DEFAULT_AUTHOR_ID } from "@/lib/constants";

type Author = {
  id?: string;
  name: string;
  slug: string;
  gravatar_email?: string;
  avatar_url?: string;
  bio_md?: string;
  twitter?: string;
  youtube?: string;
  website?: string;
};

type Game = {
  id?: string;
  name: string;
  slug: string;
  author_id?: string | null;
  source_url?: string;
  cover_image?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  intro_md?: string;
  redeem_md?: string;
  redeem_img_1?: string;
  redeem_img_2?: string;
  redeem_img_3?: string;
  description_md?: string;
  is_published?: boolean;
};

const empty: Game = { name: "", slug: "", author_id: DEFAULT_AUTHOR_ID, is_published: false };
const emptyAuthor: Author = { name: "", slug: "" };

export default function AdminPage() {
  const [token, setToken] = useState<string>("");
  const [games, setGames] = useState<Game[]>([]);
  const [draft, setDraft] = useState<Game>(empty);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [authorDraft, setAuthorDraft] = useState<Author>(emptyAuthor);
  const [msg, setMsg] = useState<string>("");
  const inputClass = "w-full rounded-[var(--radius-sm)] border border-border/50 bg-surface px-3 py-2 text-sm text-foreground shadow-soft placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
  const buttonPrimary = "inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark";
  const buttonSurface = "inline-flex items-center justify-center gap-2 rounded-full border border-border/50 bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-border/40 hover:bg-surface-muted";

  useEffect(() => {
    const t = localStorage.getItem("ADMIN_TOKEN") || "";
    setToken(t);
    if (t) loadAll();
  }, []);

  async function loadAll() {
    setMsg("Loading data...");
    const headers = { "x-admin-token": token } as const;
    const [gamesRes, authorsRes] = await Promise.all([
      fetch("/api/admin/games", { headers }),
      fetch("/api/admin/authors", { headers }),
    ]);
    setMsg("");
    if (!gamesRes.ok) return setMsg("Failed to load games");
    if (!authorsRes.ok) return setMsg("Failed to load authors");
    const gamesData = await gamesRes.json();
    setGames(
      gamesData.map((g: Game) => ({
        ...g,
        author_id: g.author_id ?? DEFAULT_AUTHOR_ID,
      }))
    );
    setAuthors(await authorsRes.json());
  }

  async function save() {
    setMsg("Saving...");
    const payload = { ...draft, author_id: draft.author_id || DEFAULT_AUTHOR_ID };
    const res = await fetch("/api/admin/games", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { setMsg("Save failed"); return; }
    setDraft({ ...empty });
    await loadAll();
    setMsg("Saved");
  }

  async function publish(id: string, publish: boolean) {
    setMsg(publish ? "Publishing..." : "Unpublishing...");
    const res = await fetch(`/api/admin/games/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ is_published: publish })
    });
    await loadAll();
    setMsg(publish ? "Published" : "Unpublished");
  }

  async function scrape(id: string) {
    setMsg("Scraping...");
    const res = await fetch(`/api/admin/scrape/${id}`, { method: "POST", headers: { "x-admin-token": token } });
    if (!res.ok) { setMsg("Scrape failed"); return; }
    setMsg("Scraped & updated codes");
  }

  async function saveAuthor() {
    setMsg("Saving author...");
    const res = await fetch("/api/admin/authors", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(authorDraft)
    });
    if (!res.ok) { setMsg("Author save failed"); return; }
    setAuthorDraft(emptyAuthor);
    await loadAll();
    setMsg("Author saved");
  }

  function setKey(k: keyof Game, v: any) { setDraft(prev => ({ ...prev, [k]: v })); }
  function setAuthorKey(k: keyof Author, v: any) { setAuthorDraft(prev => ({ ...prev, [k]: v })); }

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
          <button className={buttonPrimary} onClick={() => { localStorage.setItem("ADMIN_TOKEN", token); loadAll(); }}>Save & Load</button>
        </div>
        {msg ? <p className="text-sm text-muted mt-2">{msg}</p> : null}
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">Add / Edit Game</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className={inputClass} placeholder="Name" value={draft.name} onChange={e=>setKey("name", e.target.value)} />
          <input className={inputClass} placeholder="Slug (lowercase, hyphens)" value={draft.slug} onChange={e=>setKey("slug", e.target.value)} />
          <select
            className={inputClass}
            value={draft.author_id || ""}
            onChange={e => setKey("author_id", e.target.value ? e.target.value : null)}
          >
            <option value="">Select author (optional)</option>
            {authors.map(author => (
              <option key={author.id} value={author.id}>{author.name}</option>
            ))}
          </select>
          <input className={inputClass} placeholder="Source URL (Robloxden)" value={draft.source_url||""} onChange={e=>setKey("source_url", e.target.value)} />
          <input className={inputClass} placeholder="Cover image URL" value={draft.cover_image||""} onChange={e=>setKey("cover_image", e.target.value)} />
          <input className={inputClass} placeholder="SEO Title" value={draft.seo_title||""} onChange={e=>setKey("seo_title", e.target.value)} />
          <input className={inputClass} placeholder="Meta Description" value={draft.seo_description||""} onChange={e=>setKey("seo_description", e.target.value)} />
          <input className={inputClass} placeholder="SEO Keywords (comma separated)" value={draft.seo_keywords||""} onChange={e=>setKey("seo_keywords", e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-foreground/80"><input type="checkbox" checked={!!draft.is_published} onChange={e=>setKey("is_published", e.target.checked)} /> Publish</label>
          <textarea className={`${inputClass} min-h-[120px] md:col-span-2`} placeholder="Intro copy (Markdown supported)"
            value={draft.intro_md||""} onChange={e=>setKey("intro_md", e.target.value)} />
          <textarea className={`${inputClass} min-h-[120px] md:col-span-2`} placeholder="Redeem instructions (Markdown supported)"
            value={draft.redeem_md||""} onChange={e=>setKey("redeem_md", e.target.value)} />
          <input className={inputClass} placeholder="Redeem image URL #1" value={draft.redeem_img_1||""} onChange={e=>setKey("redeem_img_1", e.target.value)} />
          <input className={inputClass} placeholder="Redeem image URL #2" value={draft.redeem_img_2||""} onChange={e=>setKey("redeem_img_2", e.target.value)} />
          <input className={inputClass} placeholder="Redeem image URL #3" value={draft.redeem_img_3||""} onChange={e=>setKey("redeem_img_3", e.target.value)} />
          <textarea className={`${inputClass} min-h-[160px] md:col-span-2`} placeholder="Description (Markdown supported)"
            value={draft.description_md||""} onChange={e=>setKey("description_md", e.target.value)} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className={buttonPrimary} onClick={save}>Save</button>
          <button className={buttonSurface} onClick={()=>setDraft(empty)}>Reset</button>
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">Add / Edit Author</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className={inputClass} placeholder="Name" value={authorDraft.name} onChange={e=>setAuthorKey("name", e.target.value)} />
          <input className={inputClass} placeholder="Slug (lowercase, hyphens)" value={authorDraft.slug} onChange={e=>setAuthorKey("slug", e.target.value)} />
          <input className={inputClass} placeholder="Gravatar email" value={authorDraft.gravatar_email||""} onChange={e=>setAuthorKey("gravatar_email", e.target.value)} />
          <input className={inputClass} placeholder="Avatar URL override" value={authorDraft.avatar_url||""} onChange={e=>setAuthorKey("avatar_url", e.target.value)} />
          <input className={inputClass} placeholder="Twitter (handle or URL)" value={authorDraft.twitter||""} onChange={e=>setAuthorKey("twitter", e.target.value)} />
          <input className={inputClass} placeholder="YouTube URL" value={authorDraft.youtube||""} onChange={e=>setAuthorKey("youtube", e.target.value)} />
          <input className={inputClass} placeholder="Website URL" value={authorDraft.website||""} onChange={e=>setAuthorKey("website", e.target.value)} />
          <textarea className={`${inputClass} min-h-[140px] md:col-span-2`} placeholder="Bio (Markdown supported)" value={authorDraft.bio_md||""} onChange={e=>setAuthorKey("bio_md", e.target.value)} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className={buttonPrimary} onClick={saveAuthor}>Save Author</button>
          <button className={buttonSurface} onClick={()=>setAuthorDraft(emptyAuthor)}>Reset</button>
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">Authors</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {authors.map(author => (
            <div key={author.id} className="rounded-[var(--radius-sm)] border border-border/60 bg-surface-muted/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{author.name}</div>
                  <div className="text-xs text-muted">{author.slug}</div>
                </div>
                <button
                  className={buttonSurface}
                  onClick={() => setAuthorDraft({ ...author })}
                >
                  Edit
                </button>
              </div>
              {author.twitter ? <div className="mt-3 text-xs text-muted">Twitter: {author.twitter}</div> : null}
              {author.website ? <div className="text-xs text-muted">Website: {author.website}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">Games</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {games.map((g) => {
            const author = authors.find((a) => a.id === (g.author_id ?? DEFAULT_AUTHOR_ID)) || authors.find((a) => a.id === DEFAULT_AUTHOR_ID);
            return (
              <div key={g.id} className="rounded-[var(--radius-sm)] border border-border/60 bg-surface-muted/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">{g.name}</div>
                    <div className="text-xs text-muted">{g.slug}</div>
                    {author ? <div className="text-xs text-muted">By {author.name}</div> : null}
                  </div>
                  <div className="text-xs text-muted">
                    {g.is_published ? <span className="chip bg-accent/15 text-accent">Published</span> : <span className="chip">Draft</span>}
                  </div>
                </div>
                {g.source_url ? <div className="mt-3 break-all text-xs text-muted">{g.source_url}</div> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={buttonSurface} onClick={() => publish(g.id!, !g.is_published)}>{g.is_published ? "Unpublish" : "Publish"}</button>
                  <button className={buttonSurface} onClick={() => scrape(g.id!)}>Refresh Codes</button>
                  <a className={buttonSurface} href={`/${g.slug}`} target="_blank" rel="noreferrer">Open</a>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
