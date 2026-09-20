"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, Copy, Heart, RotateCcw, Sparkles, X } from "lucide-react";
import Matter from "matter-js";
import { movies } from "@/lib/movies";
import type { HardFilters, Movie, MovieEvaluation, MoodSnapshot } from "@/lib/types";

type Position = { x: number; y: number; a: number };
type PosterMode = "heap" | "lifted";
type PosterProps = { movie: Movie; x: number; y: number; angle: number; pinned: boolean; mode: PosterMode; onPin: () => void; onSeen: () => void; onInfo: () => void; onDragStart: (id: number, x: number, y: number) => void; onDragMove: (x: number, y: number) => void; onDragEnd: () => void };

const initialIds = movies.map(movie => movie.id);
const emptySession = { preferences: [] as string[], secondPreferences: [] as string[], mode: "solo" as "solo" | "duo", filters: {} as HardFilters, evaluations: {} as Record<number, MovieEvaluation>, shortlistedIds: [] as number[], pinnedIds: [] as number[], dismissedIds: [] as number[] };
const POSTER_WIDTH = 44;
const POSTER_HEIGHT = 66;
const STEP_MS = 1000 / 60;

function parseRuntime(text: string): HardFilters {
  const max = text.match(/(?:under|below|at most)\s*(\d+)\s*(?:min|minutes)?/i)?.[1];
  const between = text.match(/between\s*(\d+)\s*(?:and|-)\s*(\d+)\s*minutes?/i);
  return between ? { runtimeMin: Number(between[1]), runtimeMax: Number(between[2]) } : max ? { runtimeMax: Number(max) } : {};
}

function Poster({ movie, x, y, angle, pinned, mode, onPin, onSeen, onInfo, onDragStart, onDragMove, onDragEnd }: PosterProps) {
  const [broken, setBroken] = useState(false);
  const pointerId = useRef<number | null>(null);
  const draggable = mode === "heap";
  return <article className={`poster ${mode === "lifted" ? "lifted-poster" : ""}`} data-movie-id={movie.id} tabIndex={0} onDoubleClick={onInfo} onKeyDown={event => { if (event.key === "Enter") onInfo(); }} aria-label={`${movie.title}, ${movie.year}`} style={draggable ? { left: 0, top: 0, transform: `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)` } : undefined}
    onPointerDown={event => { if (!draggable || (event.target as HTMLElement).closest("button")) return; pointerId.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); onDragStart(movie.id, event.clientX, event.clientY); }}
    onPointerMove={event => { if (pointerId.current === event.pointerId) onDragMove(event.clientX, event.clientY); }}
    onPointerUp={() => { if (pointerId.current !== null) { pointerId.current = null; onDragEnd(); } }}
    onPointerCancel={() => { pointerId.current = null; onDragEnd(); }}>
    <div className="poster-actions"><button className="icon-btn" aria-label={pinned ? "Unpin movie" : "Pin movie"} onClick={onPin}>{pinned ? <Heart size={13} fill="currentColor" /> : <Bookmark size={13} />}</button><button className="icon-btn" aria-label="Seen it" onClick={onSeen}><Check size={13} /></button><button className="icon-btn" aria-label="Movie details" onClick={onInfo}><Sparkles size={13} /></button></div>
    {pinned && <span className="pinned-ribbon">PINNED</span>}
    {movie.posterPath && !broken ? <img src={movie.posterPath} alt="" onError={() => setBroken(true)} /> : <div className="poster-fallback"><strong>{movie.title}</strong><small>{movie.year} · {movie.runtime} min</small></div>}
    <div className="poster-info"><strong>{movie.title}</strong><span>{movie.year} · {movie.runtime} min</span></div>
  </article>;
}

export default function Home() {
  const [session, setSession] = useState(emptySession);
  const [prompt, setPrompt] = useState("");
  const [second, setSecond] = useState("");
  const [suggestions, setSuggestions] = useState<Movie[]>([]);
  const [filters, setFilters] = useState<HardFilters>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<Movie | null>(null);
  const [surprise, setSurprise] = useState<Movie | null>(null);
  const [undo, setUndo] = useState<{ id: number; wasPinned: boolean; wasShortlisted: boolean } | null>(null);
  const [positions, setPositions] = useState<Record<number, Position>>({});
  const [reduced, setReduced] = useState(false);
  const heapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const bodiesRef = useRef(new Map<number, Matter.Body>());
  const boundsRef = useRef<Matter.Body[]>([]);
  const dragRef = useRef<{ constraint: Matter.Constraint; lastX: number; lastY: number; lastTime: number; vx: number; vy: number } | null>(null);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, { evaluations: Record<number, MovieEvaluation>; ids: number[] }>());

  const activeMovies = useMemo(() => movies.filter(movie => !session.dismissedIds.includes(movie.id)), [session.dismissedIds]);
  const liftedIds = useMemo(() => session.shortlistedIds.filter(id => activeMovies.some(movie => movie.id === id)), [activeMovies, session.shortlistedIds]);
  const heapIds = useMemo(() => activeMovies.map(movie => movie.id).filter(id => !liftedIds.includes(id)), [activeMovies, liftedIds]);
  const heapKey = heapIds.join(",");

  useEffect(() => {
    const saved = localStorage.getItem("reel-gravity-session");
    const hash = location.hash.slice(1);
    try {
      const source = hash ? JSON.parse(decodeURIComponent(atob(hash))) as MoodSnapshot : saved ? JSON.parse(saved) : null;
      if (source) {
        const valid = (ids: number[]) => ids.filter(id => movies.some(movie => movie.id === id));
        const restored = { ...emptySession, ...source, shortlistedIds: valid(source.shortlistedIds ?? []), pinnedIds: valid(source.pinnedIds ?? []), dismissedIds: valid(source.dismissedIds ?? []) };
        setSession(restored);
        setFilters(restored.filters ?? {});
      }
    } catch { setStatus("Saved mood could not be restored. The catalog is ready."); }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => { localStorage.setItem("reel-gravity-session", JSON.stringify(session)); }, [session]);

  // Suggestions are local title lookup only. Jev is never called from this effect.
  useEffect(() => {
    const query = prompt.trim().toLowerCase();
    setSuggestions([]);
    if (query.length < 2) return;
    const timer = window.setTimeout(() => setSuggestions(movies.filter(movie => movie.title.toLowerCase().includes(query)).sort((a, b) => (a.title.toLowerCase().startsWith(query) ? -1 : 1) - (b.title.toLowerCase().startsWith(query) ? -1 : 1)).slice(0, 8)), 350);
    return () => window.clearTimeout(timer);
  }, [prompt]);

  useEffect(() => {
    const heap = heapRef.current;
    if (!heap) return;
    const rect = heap.getBoundingClientRect();
    const width = rect.width;
    let height = rect.height;
    let POSTER_WIDTH = Math.max(24, Math.min(44, Math.sqrt(width / 1200) * 44));
    let POSTER_HEIGHT = POSTER_WIDTH * 1.5;
    heap.style.setProperty("--poster-width", `${POSTER_WIDTH}px`);
    heap.style.setProperty("--poster-height", `${POSTER_HEIGHT}px`);
    const seed = (id: number, index: number) => {
      const spacing = Math.hypot(POSTER_WIDTH, POSTER_HEIGHT) + 6;
      const columns = Math.max(1, Math.floor((width - 16) / spacing));
      return { x: 8 + (index % columns) * spacing + (spacing - POSTER_WIDTH) / 2, y: -POSTER_HEIGHT - Math.floor(index / columns) * spacing, a: ((id * 13 + index * 17) % 150) - 75 };
    };
    setPositions(previous => {
      const next = { ...previous };
      heapIds.forEach((id, index) => { if (!next[id]) next[id] = seed(id, index); });
      return next;
    });
    if (reduced) {
      setPositions(previous => { const next = { ...previous }; heapIds.forEach((id, index) => { const p = seed(id, index); next[id] = { x: p.x, y: Math.max(0, height - POSTER_HEIGHT - (index % 3) * 18), a: p.a }; }); return next; });
      return;
    }

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.1 }, enableSleeping: true, positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
    engineRef.current = engine;
    const bodies = new Map<number, Matter.Body>();
    const floor = Matter.Bodies.rectangle(width / 2, height + 12, 5000, 24, { isStatic: true, label: "floor" });
    const left = Matter.Bodies.rectangle(-28, height / 2, 56, 3000, { isStatic: true, label: "left-wall" });
    const right = Matter.Bodies.rectangle(width + 28, height / 2, 56, 3000, { isStatic: true, label: "right-wall" });
    boundsRef.current = [floor, left, right];
    heapIds.forEach((id, index) => {
      const p = positions[id] ?? seed(id, index);
      const body = Matter.Bodies.rectangle(Math.max(POSTER_WIDTH / 2, Math.min(width - POSTER_WIDTH / 2, p.x + POSTER_WIDTH / 2)), p.y + POSTER_HEIGHT / 2, POSTER_WIDTH, POSTER_HEIGHT, { label: String(id), friction: 0.48, frictionStatic: 0.7, restitution: 0.12, frictionAir: 0.018, density: 0.0012, slop: 0.04, chamfer: { radius: 2 } });
      Matter.Body.setAngle(body, p.a * Math.PI / 180);
      Matter.Body.setAngularVelocity(body, ((index % 9) - 4) * 0.012);
      bodies.set(id, body);
    });
    bodiesRef.current = bodies;
    Matter.World.add(engine.world, [...bodies.values(), floor, left, right]);

    let previousWidth = width;
    const updateBounds = () => {
      const bounds = heap.getBoundingClientRect();
      const w = bounds.width;
      const nextWidth = Math.max(24, Math.min(44, Math.sqrt(w / 1200) * 44));
      const scale = nextWidth / POSTER_WIDTH;
      bodies.forEach(body => {
        Matter.Body.scale(body, scale, scale);
        const radius = Math.hypot(nextWidth, nextWidth * 1.5) / 2;
        Matter.Body.setPosition(body, {
          x: Math.max(radius, Math.min(w - radius, body.position.x * w / previousWidth)),
          y: Math.min(bounds.height - radius, body.position.y + bounds.height - height),
        });
        Matter.Sleeping.set(body, false);
      });
      POSTER_WIDTH = nextWidth;
      POSTER_HEIGHT = nextWidth * 1.5;
      heap.style.setProperty("--poster-width", `${POSTER_WIDTH}px`);
      heap.style.setProperty("--poster-height", `${POSTER_HEIGHT}px`);
      previousWidth = w;
      height = bounds.height;
      Matter.Body.setPosition(left, { x: -28, y: height / 2 });
      Matter.Body.setPosition(right, { x: w + 28, y: height / 2 });
      Matter.Body.setPosition(floor, { x: w / 2, y: height + 12 });
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(heap);
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    const elements = new Map(Array.from(heap.querySelectorAll<HTMLElement>("[data-movie-id]")).map(element => [Number(element.dataset.movieId), element]));
    elements.forEach(element => { element.style.left = "0"; element.style.top = "0"; });
    const tick = (now: number) => {
      const elapsed = Math.min(50, now - last);
      last = now;
      accumulator = Math.min(accumulator + elapsed, STEP_MS * 5);
      let steps = 0;
      while (accumulator >= STEP_MS && steps < 5) { Matter.Engine.update(engine, STEP_MS); accumulator -= STEP_MS; steps += 1; }
      bodies.forEach((body, id) => {
        const element = elements.get(id);
        if (element) element.style.transform = `translate3d(${body.position.x - POSTER_WIDTH / 2}px, ${body.position.y - POSTER_HEIGHT / 2}px, 0) rotate(${body.angle}rad)`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); if (dragRef.current) Matter.World.remove(engine.world, dragRef.current.constraint); Matter.Engine.clear(engine); bodiesRef.current.clear(); boundsRef.current = []; engineRef.current = null; };
    // The heap key intentionally rebuilds only when the membership changes; typing does not touch it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heapKey, reduced]);

  const startDrag = useCallback((id: number, clientX: number, clientY: number) => {
    const body = bodiesRef.current.get(id);
    const heap = heapRef.current;
    const engine = engineRef.current;
    if (!body || !heap || !engine) return;
    const rect = heap.getBoundingClientRect();
    const point = { x: clientX - rect.left, y: clientY - rect.top };
    const constraint = Matter.Constraint.create({ bodyA: body, pointA: Matter.Vector.sub(point, body.position), pointB: point, stiffness: 0.18, damping: 0.22, length: 0 });
    Matter.World.add(engine.world, constraint);
    Matter.Sleeping.set(body, false);
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    dragRef.current = { constraint, lastX: point.x, lastY: point.y, lastTime: performance.now(), vx: 0, vy: 0 };
  }, []);

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const heap = heapRef.current;
    const drag = dragRef.current;
    if (!heap || !drag) return;
    const rect = heap.getBoundingClientRect();
    const point = { x: clientX - rect.left, y: clientY - rect.top };
    const now = performance.now();
    const dt = Math.max(8, now - drag.lastTime);
    const cap = 18;
    drag.vx = Math.max(-cap, Math.min(cap, ((point.x - drag.lastX) / dt) * 16.67));
    drag.vy = Math.max(-cap, Math.min(cap, ((point.y - drag.lastY) / dt) * 16.67));
    drag.constraint.pointB = point;
    drag.lastX = point.x;
    drag.lastY = point.y;
    drag.lastTime = now;
  }, []);

  const endDrag = useCallback(() => {
    const engine = engineRef.current;
    const drag = dragRef.current;
    if (!engine || !drag) return;
    const body = drag.constraint.bodyA;
    if (body) Matter.Body.setVelocity(body, { x: drag.vx, y: drag.vy });
    Matter.World.remove(engine.world, drag.constraint);
    dragRef.current = null;
  }, []);

  const evaluate = useCallback(async () => {
    if (loading) return;
    const query = prompt.trim();
    const other = second.trim();
    if (query.length < 5 && other.length < 5) { setStatus("Type at least five characters, then press Enter to search."); return; }
    const nextFilters = { ...filters, ...parseRuntime(query) };
    const cacheKey = JSON.stringify({ query, other, mode: session.mode, filters: nextFilters, excluded: session.dismissedIds });
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) { setSession(previous => ({ ...previous, preferences: query ? [query] : [], secondPreferences: other ? [other] : [], filters: nextFilters, evaluations: cached.evaluations, shortlistedIds: cached.ids })); setStatus(`${cached.ids.length} films rose to the surface.`); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setFilters(nextFilters);
    setStatus("Jev is weighing the heap…");
    try {
      const response = await fetch("/api/evaluate", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]), body: JSON.stringify({ preferences: query ? [query] : [], secondPreferences: other ? [other] : [], mode: session.mode, filters: nextFilters, excludedIds: session.dismissedIds }) });
      const data = await response.json();
      if (requestId !== requestRef.current) return;
      if (!response.ok) throw new Error(data.error || "The evaluation failed.");
      const evaluations = Object.fromEntries((data.evaluations as MovieEvaluation[]).map(evaluation => [evaluation.movieId, evaluation]));
      const ids = data.rankedEligibleIds as number[];
      cacheRef.current.set(cacheKey, { evaluations, ids });
      setSession(previous => ({ ...previous, preferences: query ? [query] : [], secondPreferences: other ? [other] : [], filters: nextFilters, evaluations, shortlistedIds: ids }));
      setStatus(ids.length ? `${ids.length} films rose to the surface.` : "Jev found no films that match those constraints.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof DOMException && error.name === "TimeoutError") { if (requestId === requestRef.current) setStatus("Search timed out. Please try again."); return; }
      if (requestId === requestRef.current) setStatus(error instanceof Error ? error.message : "The evaluation failed. Try again.");
    } finally { if (requestId === requestRef.current) setLoading(false); }
  }, [filters, prompt, second, session.dismissedIds, session.mode, loading]);

  const clear = () => { requestRef.current += 1; abortRef.current?.abort(); setLoading(false); setSession(previous => ({ ...emptySession, dismissedIds: previous.dismissedIds })); setFilters({}); setPrompt(""); setSecond(""); setSuggestions([]); setStatus(""); };
  const pin = (id: number) => setSession(previous => ({ ...previous, pinnedIds: previous.pinnedIds.includes(id) ? previous.pinnedIds.filter(value => value !== id) : [...previous.pinnedIds, id] }));
  const seen = (id: number) => { setSession(previous => ({ ...previous, dismissedIds: [...previous.dismissedIds, id], pinnedIds: previous.pinnedIds.filter(value => value !== id), shortlistedIds: previous.shortlistedIds.filter(value => value !== id) })); setUndo({ id, wasPinned: session.pinnedIds.includes(id), wasShortlisted: session.shortlistedIds.includes(id) }); window.setTimeout(() => setUndo(null), 5000); };
  const restore = () => { if (!undo) return; const item = undo; setSession(previous => ({ ...previous, dismissedIds: previous.dismissedIds.filter(value => value !== item.id), pinnedIds: item.wasPinned ? [...previous.pinnedIds, item.id] : previous.pinnedIds, shortlistedIds: item.wasShortlisted ? [...previous.shortlistedIds, item.id] : previous.shortlistedIds })); setUndo(null); };
  const share = async () => { const snap: MoodSnapshot = { v: 1, preferences: session.preferences, secondPreferences: session.secondPreferences, mode: session.mode, filters: session.filters, shortlistedIds: session.shortlistedIds, pinnedIds: session.pinnedIds, dismissedIds: session.dismissedIds }; const value = btoa(encodeURIComponent(JSON.stringify(snap))); history.replaceState(null, "", `#${value}`); try { await navigator.clipboard.writeText(location.href); setStatus("Mood link copied to your clipboard."); } catch { setStatus("Mood link ready in the address bar; clipboard access was unavailable."); } };
  const surpriseMe = () => { const pool = activeMovies.filter(movie => session.shortlistedIds.includes(movie.id) && !session.pinnedIds.includes(movie.id)); setSurprise(pool[Math.floor(Math.random() * pool.length)] ?? null); };

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="ReelGravity home">reel<span>gravity</span></a>
      <details className="options"><summary>Options</summary><div className="options-panel">
        <button className="btn" onClick={() => setSession(previous => ({ ...previous, mode: previous.mode === "solo" ? "duo" : "solo" }))}>{session.mode === "solo" ? "Add a second mood" : "One-person search"}</button>
        <label>Maximum minutes<input type="number" min="1" value={filters.runtimeMax ?? ""} onChange={event => setFilters(previous => ({ ...previous, runtimeMax: event.target.value ? Number(event.target.value) : undefined }))} /></label>
        <label>Genre<select value={filters.genre ?? ""} onChange={event => setFilters(previous => ({ ...previous, genre: event.target.value || undefined }))}><option value="">Any genre</option>{["Animation", "Drama", "Comedy", "Action", "Adventure", "Science Fiction", "Romance", "Thriller", "Family", "Horror"].map(genre => <option key={genre}>{genre}</option>)}</select></label>
        <button className="btn" onClick={share}><Copy size={14} /> Share this mood</button>
        <button className="btn" disabled={!liftedIds.length} onClick={surpriseMe}><Sparkles size={14} /> Pick a match for me</button>
        <p className="credits">Movie data and images by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>. Not endorsed or certified by TMDB.</p>
      </div></details>
    </header>
    <div className="content">
      <section className="search-area" aria-label="Find a film">
        <h1 className="sr-only">Find your next film</h1>
        <form className="search-box" onSubmit={event => { event.preventDefault(); setSuggestions([]); void evaluate(); }}>
          <label className="sr-only" htmlFor="prompt">What would you like to watch?</label>
          <input id="prompt" type="text" value={prompt} autoComplete="off" onChange={event => setPrompt(event.target.value)} placeholder="What are you in the mood for?" />
          {prompt && <button type="button" className="search-clear" aria-label="Clear search" onClick={clear}><X size={15} /></button>}
          <button className="search-submit" type="submit" aria-label="Find my films" disabled={loading}>{loading ? <span className="loading-dot" /> : <span aria-hidden="true">↵</span>}</button>
          {suggestions.length > 0 && <div className="suggestions" aria-label="Movie title suggestions">{suggestions.map(movie => <button key={movie.id} type="button" onClick={() => { setPrompt(movie.title); setSuggestions([]); }}><img src={movie.posterPath} alt="" /><span><strong>{movie.title}</strong><small>{movie.year}</small></span></button>)}</div>}
        </form>
        {session.mode === "duo" && <div className="second-mood"><label className="sr-only" htmlFor="second">Their mood</label><input id="second" value={second} onChange={event => setSecond(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void evaluate(); }} placeholder="And their mood…" /></div>}
        <p className={`status ${/failed|unavailable|billing/i.test(status) ? "error" : ""}`} role="status">{status || "A mood, a story, a feeling. Press Enter."}</p>
      </section>
      {liftedIds.length > 0 && <section className="lifted-zone" aria-label="Matching movies">{liftedIds.map(id => { const movie = movies.find(item => item.id === id)!; return <Poster key={id} movie={movie} x={0} y={0} angle={0} pinned={session.pinnedIds.includes(id)} mode="lifted" onDragStart={() => {}} onDragMove={() => {}} onDragEnd={() => {}} onPin={() => pin(id)} onSeen={() => seen(id)} onInfo={() => setDetail(movie)} />; })}</section>}
      <div className="heap-zone" ref={heapRef} aria-label="Movie poster heap">{heapIds.map(id => { const movie = movies.find(item => item.id === id)!; const position = positions[id] ?? { x: -200, y: -200, a: 0 }; return <Poster key={id} movie={movie} x={position.x} y={position.y} angle={position.a} pinned={session.pinnedIds.includes(id)} mode="heap" onDragStart={startDrag} onDragMove={moveDrag} onDragEnd={endDrag} onPin={() => pin(id)} onSeen={() => seen(id)} onInfo={() => setDetail(movie)} />; })}</div>
    </div>
    {detail && <div role="dialog" aria-modal="true" className="detail-overlay" onClick={() => setDetail(null)}><div className="detail-card" onClick={event => event.stopPropagation()}><button className="icon-btn close-detail" aria-label="Close details" onClick={() => setDetail(null)}><X size={16} /></button><div className="eyebrow">Movie detail</div><h2>{detail.title}</h2><p className="sans">{detail.overview}</p><p className="sans detail-meta">{detail.year} · {detail.runtime} minutes · {detail.genres.join(" · ")}</p>{session.evaluations[detail.id] && <div className="breakdown">{([['Mood', session.evaluations[detail.id].mood], ['Pace', session.evaluations[detail.id].pace], ['Theme', session.evaluations[detail.id].theme]] as [string, number][]).map(([label, value]) => <label key={label}><span>{label} fit</span><span>{Math.round(value * 100)}%</span><div className="bar"><i style={{ width: `${value * 100}%` }} /></div></label>)}</div>}</div></div>}
    {surprise && <div role="dialog" aria-modal="true" className="detail-overlay" onClick={() => setSurprise(null)}><div className="surprise-card" onClick={event => event.stopPropagation()}><div className="eyebrow">Tonight’s spotlight</div><h2>{surprise.title}</h2><p>{surprise.year} · {surprise.runtime} minutes</p><button className="btn primary" onClick={() => setSurprise(null)}>Keep exploring</button></div></div>}
    {undo && <button className="btn primary undo-button" onClick={restore}><RotateCcw size={14} /> Undo seen it</button>}
  </main>;
}
