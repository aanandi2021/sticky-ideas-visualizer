import { useState, useEffect, useCallback } from 'react';
import { useSignalR } from './useSignalR';
import type { TreeNode, ClusterSnapshot } from '@shared/types';

interface ClustersState {
  treeData: TreeNode;
  snapshot: ClusterSnapshot | null;
  loading: boolean;
  connected: boolean;
}

const emptyTree: TreeNode = {
  name: 'Ideas',
  type: 'root',
  desc: 'No ideas yet',
  children: [],
};

export function useClusters(): ClustersState {
  const [treeData, setTreeData] = useState<TreeNode>(emptyTree);
  const [snapshot, setSnapshot] = useState<ClusterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const { connected, onUpdate } = useSignalR();

  // Initial fetch
  useEffect(() => {
    fetch('/api/clusters')
      .then((res) => res.json())
      .then((data) => {
        if (data.treeData) setTreeData(data.treeData);
        if (data.snapshot) setSnapshot(data.snapshot);
      })
      .catch((err) => console.error('Failed to fetch clusters:', err))
      .finally(() => setLoading(false));
  }, []);

  // Real-time updates
  const handleUpdate = useCallback((data: { treeData: TreeNode; snapshot: ClusterSnapshot | null }) => {
    setTreeData(data.treeData);
    setSnapshot(data.snapshot);
  }, []);

  useEffect(() => {
    onUpdate(handleUpdate);
  }, [onUpdate, handleUpdate]);

  return { treeData, snapshot, loading, connected };
}
