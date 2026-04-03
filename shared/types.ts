// ── Core domain types shared between API and Web ──

export interface Idea {
  id: string;
  title: string;
  description: string;
  source: 'sms' | 'email' | 'pdf' | 'manual';
  sourceId?: string;       // phone number, email address, PDF filename
  createdAt: string;       // ISO 8601
}

export interface ThemeCluster {
  theme: string;
  emoji: string;
  color: string;
  ideaIds: string[];       // references to Idea.id
}

export interface ClusterSnapshot {
  id: string;
  clusters: ThemeCluster[];
  ideaCount: number;
  updatedAt: string;       // ISO 8601
}

export interface TreeNode {
  name: string;
  desc?: string;
  emoji?: string;
  type: 'root' | 'theme' | 'idea';
  color?: string;
  children?: TreeNode[];
}

// Queue message shapes
export interface NewIdeaMessage {
  text: string;
  source: Idea['source'];
  sourceId?: string;
}

export interface ReclusterMessage {
  triggeredBy: string;     // idea id that caused this
  timestamp: string;
}
