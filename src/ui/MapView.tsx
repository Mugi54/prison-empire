// Carte interactive : caméra (déplacement, zoom), sélection, outils de construction avec aperçu.
import { useEffect, useRef } from 'react';
import * as E from '../engine';
import { ViewState, pickAgent, render, screenToTile, toWorld } from '../render/renderer';
import { ctl } from './controller';

const money = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`;

export function MapView() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const c = canvas.getContext('2d')!;
    let W = 0, H = 0, dpr = 1, raf = 0;
    const view: ViewState = { tool: 'none', hover: null, hoverSide: 'N', drag: null, valid: true, label: '', ghost: null, selKind: '', selId: 0, alpha: 1, now: 0, showGrid: false };
    const keys = new Set<string>();
    let pan: { sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
    let mouse = { x: 0, y: 0, inside: false };
    let painting = false;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const tileAt = (sx: number, sy: number) => {
      const [fx, fy] = screenToTile(ctl.cam, W, H, sx, sy);
      return { x: Math.floor(fx), y: Math.floor(fy), fx: fx - Math.floor(fx), fy: fy - Math.floor(fy) };
    };

    /** Met à jour l'aperçu (validité + coût) de l'outil courant. */
    const updatePreview = () => {
      const s = ctl.state;
      const tool = ctl.tool;
      view.tool = tool.kind; view.ghost = null; view.label = ''; view.valid = true;
      if (!s || !mouse.inside) { view.hover = null; return; }
      const t = tileAt(mouse.x, mouse.y);
      view.hover = { x: t.x, y: t.y };
      const d = Math.min(t.fy, 1 - t.fy, t.fx, 1 - t.fx);
      view.hoverSide = d === t.fy ? 'N' : d === 1 - t.fy ? 'S' : d === t.fx ? 'W' : 'E';
      let err: string | null = null;
      switch (tool.kind) {
        case 'room': {
          const def = E.ROOMS[tool.type];
          if (view.drag) {
            view.drag.x1 = t.x; view.drag.y1 = t.y;
            const x = Math.min(view.drag.x0, t.x), y = Math.min(view.drag.y0, t.y), w = Math.abs(t.x - view.drag.x0) + 1, h = Math.abs(t.y - view.drag.y0) + 1;
            err = E.checkRoom(s, tool.type, x, y, w, h);
            const cost = E.roomCost(tool.type, w, h);
            if (!err && !E.canAfford(s, cost)) err = 'Fonds insuffisants';
            view.label = err ? `${w}×${h} — ${err}` : `${def.name} ${w}×${h} — ${money(cost)}`;
          } else view.label = `${def.name} : cliquez-glissez (min. ${def.minW}×${def.minH}) — ${def.cost} €/case`;
          break;
        }
        case 'furn': err = E.checkFurn(s, tool.type, t.x, t.y); if (!err && !E.canAfford(s, E.FURN[tool.type].cost)) err = 'Fonds insuffisants'; view.ghost = tool.type; view.label = err ?? `${E.FURN[tool.type].name} — ${money(E.FURN[tool.type].cost)}`; break;
        case 'move': { const f = s.furn.find((q) => q.id === tool.id); if (f) { err = E.checkFurn(s, f.type, t.x, t.y, f.id); view.ghost = f.type; view.label = err ?? `Déplacer : ${E.FURN[f.type].name}`; } break; }
        case 'door': err = E.checkDoor(s, t.x, t.y, view.hoverSide); view.label = err ?? `Porte — ${money(E.DOOR_COST)}`; break;
        case 'wall': err = E.checkWall(s, t.x, t.y); view.label = err ?? `Mur d'enceinte — ${money(E.WALL_COST)}`; break;
        case 'erase': view.label = 'Supprimer (porte, mobilier, mur) — remboursement 30 %'; break;
      }
      view.valid = !err;
    };

    const applyTool = (sx: number, sy: number) => {
      const s = ctl.state;
      if (!s) return;
      const t = tileAt(sx, sy);
      const tool = ctl.tool;
      const d = Math.min(t.fy, 1 - t.fy, t.fx, 1 - t.fx);
      const side: E.Side = d === t.fy ? 'N' : d === 1 - t.fy ? 'S' : d === t.fx ? 'W' : 'E';
      switch (tool.kind) {
        case 'furn': ctl.act((g) => E.addFurn(g, tool.type, t.x, t.y)); break;
        case 'move': if (ctl.act((g) => E.moveFurn(g, tool.id, t.x, t.y))) ctl.setTool({ kind: 'none' }); break;
        case 'door': ctl.act((g) => E.addDoor(g, t.x, t.y, side)); break;
        case 'wall': if (!E.checkWall(s, t.x, t.y)) ctl.act((g) => E.addWall(g, t.x, t.y)); break;
        case 'erase': {
          const rt = E.getRuntime(s);
          const i = t.y * s.map.w + t.x;
          const f = rt.furnAt.get(i);
          if (E.findDoor(s, t.x, t.y, side) && d < 0.28) ctl.act((g) => E.removeDoor(g, t.x, t.y, side));
          else if (f) ctl.act((g) => E.removeFurn(g, f.id));
          else if (s.walls.includes(i)) ctl.act((g) => E.removeWall(g, t.x, t.y));
          else if (rt.roomAt[i]) { ctl.select({ kind: 'room', id: rt.roomAt[i] }); ctl.toast('info', 'Pour démolir une salle entière, utilisez le bouton « Démolir » de sa fiche.'); }
          break;
        }
      }
    };

    const selectAt = (sx: number, sy: number) => {
      const s = ctl.state;
      if (!s) return;
      const a = pickAgent(s, ctl.cam, W, H, sx, sy);
      if (a) return ctl.select(a);
      const t = tileAt(sx, sy);
      if (t.x < 0 || t.y < 0 || t.x >= s.map.w || t.y >= s.map.h) return ctl.select(null);
      const rt = E.getRuntime(s);
      const i = t.y * s.map.w + t.x;
      const f = rt.furnAt.get(i);
      if (f) return ctl.select({ kind: 'furn', id: f.id });
      if (rt.roomAt[i]) return ctl.select({ kind: 'room', id: rt.roomAt[i] });
      ctl.select(null);
    };

    const pos = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e: MouseEvent) => {
      const p = pos(e);
      const tool = ctl.tool.kind;
      if (e.button === 0 && tool === 'room') { const t = tileAt(p.x, p.y); view.drag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y }; return; }
      if (e.button === 0 && tool === 'wall') { painting = true; applyTool(p.x, p.y); return; }
      if (e.button === 0 && tool !== 'none') { applyTool(p.x, p.y); return; }
      pan = { sx: e.clientX, sy: e.clientY, cx: ctl.cam.x, cy: ctl.cam.y, moved: false };
    };
    const move = (e: MouseEvent) => {
      const p = pos(e);
      mouse = { x: p.x, y: p.y, inside: e.target === canvas || !!pan || !!view.drag };
      if (pan) {
        const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) pan.moved = true;
        if (pan.moved) { ctl.cam.x = pan.cx - dx / ctl.cam.zoom; ctl.cam.y = pan.cy - dy / ctl.cam.zoom; ctl.follow = false; }
      }
      if (painting) applyTool(p.x, p.y);
    };
    const up = (e: MouseEvent) => {
      const p = pos(e);
      if (view.drag && ctl.tool.kind === 'room') {
        const dr = view.drag, type = ctl.tool.type;
        view.drag = null;
        const x = Math.min(dr.x0, dr.x1), y = Math.min(dr.y0, dr.y1), w = Math.abs(dr.x1 - dr.x0) + 1, h = Math.abs(dr.y1 - dr.y0) + 1;
        if (w > 1 || h > 1) ctl.act((g) => E.buildRoom(g, type, x, y, w, h));
      }
      painting = false;
      if (pan) {
        if (!pan.moved) { if (e.button === 2 || ctl.tool.kind !== 'none') ctl.setTool({ kind: 'none' }); else if (e.button === 0) selectAt(p.x, p.y); }
        pan = null;
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = pos(e);
      const cam = ctl.cam;
      const z0 = cam.zoom, z1 = Math.max(0.25, Math.min(2.4, z0 * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      // zoom centré sur le curseur
      cam.x += (p.x - W / 2) * (1 / z0 - 1 / z1); cam.y += (p.y - H / 2) * (1 / z0 - 1 / z1);
      cam.zoom = z1;
    };
    const leave = () => { mouse.inside = false; };
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      keys.add(e.key.toLowerCase());
      if (e.key === 'Escape') { view.drag = null; ctl.setTool({ kind: 'none' }); }
      if (e.key === ' ') { e.preventDefault(); const s = ctl.state; if (s) ctl.setSpeed(s.speed ? 0 : 1); }
      if (e.key === '1' || e.key === '2' || e.key === '3') ctl.setSpeed(+e.key);
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const ctx = (e: Event) => e.preventDefault();

    canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('mouseleave', leave);
    canvas.addEventListener('contextmenu', ctx);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    let lastT = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const s = ctl.state;
      if (!s || !W) return;
      const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
      const sp = (520 * dt) / ctl.cam.zoom;
      if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) ctl.cam.x -= sp;
      if (keys.has('arrowright') || keys.has('d')) ctl.cam.x += sp;
      if (keys.has('arrowup') || keys.has('z') || keys.has('w')) ctl.cam.y -= sp;
      if (keys.has('arrowdown') || keys.has('s')) ctl.cam.y += sp;
      // la caméra reste à portée du terrain
      const [mx, my] = toWorld(s.map.w, s.map.h);
      ctl.cam.x = Math.max(-s.map.h * 32 - 200, Math.min(s.map.w * 32 + 200, ctl.cam.x));
      ctl.cam.y = Math.max(-200, Math.min(my + 200 + mx * 0, ctl.cam.y));
      if (ctl.follow && ctl.sel && (ctl.sel.kind === 'inmate' || ctl.sel.kind === 'staff')) {
        const a = ctl.sel.kind === 'inmate' ? s.inmates.find((i) => i.id === ctl.sel!.id) : s.staff.find((i) => i.id === ctl.sel!.id);
        if (a) { const [wx, wy] = toWorld(a.px + (a.x - a.px) * ctl.alpha, a.py + (a.y - a.py) * ctl.alpha); ctl.cam.x += (wx - ctl.cam.x) * 0.12; ctl.cam.y += (wy - ctl.cam.y) * 0.12; }
      }
      updatePreview();
      view.selKind = ctl.sel?.kind ?? ''; view.selId = ctl.sel?.id ?? 0;
      view.alpha = s.speed > 0 ? Math.min(1, ctl.alpha) : 1;
      view.now = t / 1000;
      view.showGrid = ctl.tool.kind !== 'none' || ctl.panel === 'build';
      canvas.style.cursor = pan?.moved ? 'grabbing' : ctl.tool.kind !== 'none' ? 'crosshair' : 'default';
      try { render(c, s, ctl.cam, W, H, dpr, view); } catch (err) { console.error(err); }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('mouseleave', leave); canvas.removeEventListener('contextmenu', ctx);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    };
  }, []);

  return <canvas ref={ref} className="map" />;
}
