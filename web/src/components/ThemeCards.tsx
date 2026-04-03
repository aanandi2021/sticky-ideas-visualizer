import type { TreeNode } from '@shared/types';

interface ThemeCardsProps {
  treeData: TreeNode;
}

export default function ThemeCards({ treeData }: ThemeCardsProps) {
  const themes = treeData.children || [];

  if (themes.length === 0) return null;

  return (
    <section className="cards-section">
      <h2>Detailed Breakdown by Theme</h2>
      <div className="theme-grid">
        {themes.map((theme, i) => (
          <div key={i} className="theme-card">
            <div className="theme-header">
              <div className="theme-icon" style={{ background: `${theme.color}22` }}>
                {theme.emoji}
              </div>
              <div className="theme-title" style={{ color: '#ffffff' }}>
                {theme.name}
              </div>
              <span
                className="theme-badge"
                style={{ background: `${theme.color}30`, color: '#ffffff' }}
              >
                {theme.children?.length || 0} ideas
              </span>
            </div>
            <ul className="idea-list">
              {(theme.children || []).map((idea, j) => (
                <li key={j}>
                  <strong>{idea.name}</strong>
                  {idea.desc && <span className="desc">{idea.desc}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
