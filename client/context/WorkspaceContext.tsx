"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api } from "@/lib/api";
import { getSocket, joinWorkspace } from "@/lib/socket";
import { useAuth } from "./AuthContext";
import type { Workspace } from "@/lib/types";

const CURRENT_KEY = "fulfilio.currentWorkspaceId";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  current: Workspace | null;
  isLoading: boolean;
  onlineCount: number;
  selectWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState(1);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const list = await api.get<Workspace[]>("/api/v1/workspaces");
      setWorkspaces(list);

      const savedId = typeof window !== "undefined" ? localStorage.getItem(CURRENT_KEY) : null;
      const match = list.find((w) => w.id === savedId) ?? list[0] ?? null;
      setCurrent(match);
      if (match) localStorage.setItem(CURRENT_KEY, match.id);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Join the workspace's socket room whenever the selection changes, and
  // track live presence for the header indicator.
  useEffect(() => {
    if (!current) return;
    joinWorkspace(current.id);

    const socket = getSocket();
    if (!socket) return;

    const onSnapshot = (payload: { onlineCount: number }) => setOnlineCount(payload.onlineCount);
    const onOnline = () => setOnlineCount((c) => c + 1);
    const onOffline = () => setOnlineCount((c) => Math.max(1, c - 1));

    socket.on("presence:snapshot", onSnapshot);
    socket.on("presence:online", onOnline);
    socket.on("presence:offline", onOffline);

    return () => {
      socket.off("presence:snapshot", onSnapshot);
      socket.off("presence:online", onOnline);
      socket.off("presence:offline", onOffline);
    };
  }, [current]);

  function selectWorkspace(workspaceId: string) {
    const match = workspaces.find((w) => w.id === workspaceId);
    if (!match) return;
    setCurrent(match);
    localStorage.setItem(CURRENT_KEY, match.id);
  }

  async function createWorkspace(name: string) {
    const workspace = await api.post<Workspace>("/api/v1/workspaces", { name });
    await refresh();
    selectWorkspace(workspace.id);
    return workspace;
  }

  return (
    <WorkspaceContext.Provider
      value={{ workspaces, current, isLoading, onlineCount, selectWorkspace, createWorkspace, refresh }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
