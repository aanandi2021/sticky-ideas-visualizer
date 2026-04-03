import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { TreeNode } from '@shared/types';

interface MindMapProps {
  treeData: TreeNode;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface D3Node {
  data: TreeNode;
  x: number;
  y: number;
  x0?: number;
  y0?: number;
  depth: number;
  children?: D3Node[] | null;
  _children?: D3Node[] | null;
  parent?: D3Node | null;
  id?: number;
}

export default function MindMap({ treeData }: MindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const rootRef = useRef<D3Node | null>(null);
  const idCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const margin = { top: 30, right: 220, bottom: 30, left: 120 };
  const nodeHeight = 28;
  const duration = 500;

  // ── Audio helpers ──
  const themeNotes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

  function ensureAudio() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
  }

  function playBing(themeIndex: number) {
    ensureAudio();
    const ctx = audioCtxRef.current!;
    const freq = themeNotes[themeIndex % themeNotes.length];
    const now = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(freq, now);
    const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.setValueAtTime(freq * 2.5, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, now); gain2.gain.linearRampToValueAtTime(0.06, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain).connect(ctx.destination); osc2.connect(gain2).connect(ctx.destination);
    osc.start(now); osc.stop(now + 1); osc2.start(now); osc2.stop(now + 0.6);
  }

  function playTick() {
    ensureAudio();
    const ctx = audioCtxRef.current!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(1800 + Math.random() * 400, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.04, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now + 0.2);
  }

  // ── D3 tree helpers ──
  function diagonal(s: { x: number; y: number }, d: { x: number; y: number }) {
    return `M ${s.y} ${s.x} C ${(s.y + d.y) / 2} ${s.x}, ${(s.y + d.y) / 2} ${d.x}, ${d.y} ${d.x}`;
  }

  function collapse(d: D3Node) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
      d._children.forEach(collapse);
    }
  }

  function expandAll(d: D3Node) {
    if (d._children) {
      d.children = d._children;
      d._children = null;
      d.children.forEach(expandAll);
    }
  }

  const updateTree = useCallback((source: D3Node) => {
    const root = rootRef.current!;
    const g = d3.select(gRef.current);
    const svgEl = d3.select(svgRef.current);
    const containerEl = containerRef.current!;
    const tooltipEl = tooltipRef.current!;
    const fullWidth = Math.min(containerEl.clientWidth - 20, 1460);

    const treemap = d3.tree<TreeNode>().nodeSize([nodeHeight, 260]);
    treemap(root as any);
    const nodes = (root as any).descendants() as D3Node[];
    const links = (root as any).descendants().slice(1) as D3Node[];
    nodes.forEach((d) => { (d as any).y = d.depth * 280; });

    let minX = Infinity, maxX = -Infinity;
    nodes.forEach((d) => { if (d.x < minX) minX = d.x; if (d.x > maxX) maxX = d.x; });
    const treeH = maxX - minX + margin.top + margin.bottom + 60;

    svgEl.transition().duration(duration)
      .attr('height', Math.max(treeH, 120))
      .attr('viewBox', `0 ${minX - 30} ${fullWidth} ${treeH}`);

    // Links
    const link = g.selectAll<SVGPathElement, D3Node>('path.link')
      .data(links, (d: any) => String(d.id || (d.id = ++idCountRef.current)));

    const linkEnter = link.enter().insert('path', 'g')
      .attr('class', 'link')
      .attr('d', () => { const o = { x: source.x0 || 0, y: source.y0 || 0 }; return diagonal(o, o); })
      .style('fill', 'none')
      .style('stroke', '#334155')
      .style('stroke-width', '1.8px')
      .style('stroke-opacity', '0');

    const linkUpdate = linkEnter.merge(link);
    linkUpdate.transition().duration(duration)
      .attr('d', (d: any) => diagonal(d, d.parent))
      .style('stroke-opacity', '0.6');

    link.exit().transition().duration(duration)
      .attr('d', () => { const o = { x: source.x, y: source.y }; return diagonal(o, o); })
      .remove();

    // Nodes
    const node = g.selectAll<SVGGElement, D3Node>('g.node')
      .data(nodes, (d: any) => String(d.id || (d.id = ++idCountRef.current)));

    const nodeEnter = node.enter().append('g')
      .attr('class', 'node')
      .attr('transform', () => `translate(${source.y0 || 0},${source.x0 || 0})`)
      .style('opacity', '0')
      .style('cursor', 'pointer')
      .on('click', (_event: any, d: any) => {
        if (d.data.type === 'idea') return;
        if (d.children) { d._children = d.children; d.children = null; }
        else if (d._children) { d.children = d._children; d._children = null; }
        updateTree(d);
      })
      .on('mouseenter', (_event: any, d: any) => {
        if (!d.data.desc) return;
        tooltipEl.innerHTML = `<div class="tt-title">${d.data.name}</div><div class="tt-desc">${d.data.desc}</div>`;
        tooltipEl.classList.add('show');
      })
      .on('mousemove', (event: any) => {
        const rect = containerEl.getBoundingClientRect();
        tooltipEl.style.left = (event.clientX - rect.left + 14) + 'px';
        tooltipEl.style.top = (event.clientY - rect.top - 10) + 'px';
      })
      .on('mouseleave', () => {
        tooltipEl.classList.remove('show');
      });

    nodeEnter.append('circle')
      .attr('r', 1e-6)
      .attr('fill', (d: any) => {
        if (d.data.type === 'root') return '#667eea';
        if (d.data.type === 'theme') return d.data.color || '#667eea';
        return d.parent?.data.color || '#667eea';
      })
      .attr('stroke', (d: any) => {
        if (d.data.type === 'root') return '#8b5cf6';
        if (d.data.type === 'theme') return d.data.color || '#667eea';
        return 'transparent';
      })
      .attr('fill-opacity', (d: any) => d.data.type === 'idea' ? 0.35 : 1)
      .attr('stroke-opacity', (d: any) => d.data.type === 'idea' ? 0.6 : 1);

    nodeEnter.filter((d: any) => !!d.data.emoji).append('text')
      .attr('dy', 5).attr('text-anchor', 'middle').style('font-size', '14px')
      .text((d: any) => d.data.emoji || '');

    nodeEnter.append('text')
      .attr('dy', 4)
      .attr('x', (d: any) => d.data.type === 'root' ? -20 : d.data.type === 'theme' ? 22 : 14)
      .attr('text-anchor', (d: any) => d.data.type === 'root' ? 'end' : 'start')
      .attr('class', (d: any) => d.data.type === 'root' ? 'label-root' : d.data.type === 'theme' ? 'label-theme' : 'label-idea')
      .style('fill', '#ffffff')
      .text((d: any) => d.data.name);

    nodeEnter.filter((d: any) => d.data.type === 'theme').append('text')
      .attr('class', 'badge').attr('dy', 4).attr('text-anchor', 'start');

    const nodeUpdate = nodeEnter.merge(node);
    nodeUpdate.transition().duration(duration)
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`).style('opacity', '1');
    nodeUpdate.select('circle').attr('r', (d: any) => d.data.type === 'root' ? 14 : d.data.type === 'theme' ? 12 : 5);
    nodeUpdate.select('.badge').text((d: any) => (d._children ? `+${d._children.length}` : '')).attr('x', 22);

    nodeUpdate.each(function (this: SVGGElement, d: any) {
      if (d.data.type !== 'theme') return;
      const labelNode = d3.select(this).select('.label-theme').node() as SVGTextElement | null;
      const badgeNode = d3.select(this).select('.badge');
      if (labelNode) {
        const bbox = labelNode.getBBox();
        badgeNode.attr('x', bbox.x + bbox.width + 8);
      }
    });

    node.exit().transition().duration(duration)
      .attr('transform', () => `translate(${source.y},${source.x})`).style('opacity', '0').remove()
      .select('circle').attr('r', 1e-6);

    nodes.forEach((d) => { d.x0 = d.x; d.y0 = (d as any).y; });
  }, []);

  // ── Initialize + react to treeData changes ──
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const fullWidth = Math.min(containerRef.current.clientWidth - 20, 1460);
    const svgEl = d3.select(svgRef.current);
    svgEl.attr('width', fullWidth).attr('preserveAspectRatio', 'xMidYMid meet');

    // Clear previous tree
    svgEl.selectAll('g').remove();

    const g = svgEl.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    gRef.current = g.node();

    const root = d3.hierarchy(treeData) as unknown as D3Node;
    root.x0 = 0;
    root.y0 = 0;
    if (root.children) root.children.forEach(collapse);
    rootRef.current = root;
    idCountRef.current = 0;
    updateTree(root);
  }, [treeData, updateTree]);

  // ── Animation ──
  function stopAnimation() {
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = null;
    isPlayingRef.current = false;
  }

  function playAnimation() {
    const root = rootRef.current;
    if (!root) return;

    if ((root as any)._children) {
      (root as any).children = (root as any)._children;
      (root as any)._children = null;
    }
    if (root.children) root.children.forEach(collapse);
    updateTree(root);
    isPlayingRef.current = true;

    const queue: Array<{ type: string; fn: () => void }> = [];
    const themes = (root.children || []) as D3Node[];
    themes.forEach((theme, ti) => {
      const allKids = ((theme._children || []) as D3Node[]).slice();
      queue.push({
        type: 'theme',
        fn() {
          theme._children = null;
          theme.children = [allKids[0]];
          playBing(ti);
          updateTree(theme);
        },
      });
      for (let k = 1; k < allKids.length; k++) {
        const kid = allKids[k];
        queue.push({
          type: 'leaf',
          fn() {
            theme.children!.push(kid);
            playTick();
            updateTree(theme);
          },
        });
      }
    });

    let step = 0;
    function next() {
      if (!isPlayingRef.current || step >= queue.length) { stopAnimation(); return; }
      queue[step].fn();
      step++;
      animTimerRef.current = setTimeout(next, queue[step - 1]?.type === 'theme' ? 1400 : 750);
    }
    animTimerRef.current = setTimeout(next, 800);
  }

  return (
    <section className="tree-section">
      <h2>Interactive Idea Tree</h2>
      <div className="tree-controls">
        <button onClick={() => {
          if (isPlayingRef.current) stopAnimation();
          else playAnimation();
        }}>
          ▶ Play Animation
        </button>
        <button onClick={() => {
          stopAnimation();
          if (rootRef.current) { expandAll(rootRef.current); updateTree(rootRef.current); }
        }}>
          Expand All
        </button>
        <button onClick={() => {
          stopAnimation();
          if (rootRef.current?.children) {
            (rootRef.current.children as D3Node[]).forEach(collapse);
            updateTree(rootRef.current);
          }
        }}>
          Collapse All
        </button>
        <button onClick={() => {
          stopAnimation();
          if (rootRef.current?.children) {
            (rootRef.current.children as D3Node[]).forEach(collapse);
            updateTree(rootRef.current);
          }
        }}>
          Reset
        </button>
      </div>
      <div className="tree-container" ref={containerRef}>
        <div className="tooltip" ref={tooltipRef} />
        <svg ref={svgRef} id="tree-svg" />
      </div>
    </section>
  );
}
