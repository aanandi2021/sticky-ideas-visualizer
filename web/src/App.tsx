import MindMap from './components/MindMap';
import IdeaForm from './components/IdeaForm';
import ThemeCards from './components/ThemeCards';
import { useClusters } from './hooks/useClusters';

export default function App() {
  const { treeData, snapshot, loading, connected } = useClusters();

  const ideaCount = snapshot?.ideaCount ?? 0;
  const themeCount = snapshot?.clusters.length ?? 0;

  return (
    <>
      <section className="hero">
        <h1>Sticky Ideas</h1>
        <p>
          Real-time brainstorming hub — ideas flow in from text messages, emails, and scanned sticky
          notes, clustered into themes automatically.
        </p>
        <span className="count">
          {loading ? 'Loading…' : `${ideaCount} ideas · ${themeCount} themes`}
        </span>
        <span className={`status-badge ${connected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot" />
          {connected ? 'Live' : 'Offline'}
        </span>
      </section>

      <IdeaForm />
      <MindMap treeData={treeData} />
      <ThemeCards treeData={treeData} />

      <footer>Sticky Ideas Visualizer — Real-Time Edition</footer>
    </>
  );
}
