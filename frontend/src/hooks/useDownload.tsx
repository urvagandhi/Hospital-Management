import React, { createContext, useCallback, useContext, useState } from "react";
import FloatingProgressCard from "../components/FloatingProgressCard";

interface DownloadTask {
  id: string;
  status: "preparing" | "downloading" | "uploading" | "failed";
  progress?: number;
  message?: string;
  speed?: string;
  targetSizeMb?: number;
  title?: string;
}

interface DownloadContextType {
  tasks: DownloadTask[];
  startDownload: (options: {
    status: "preparing" | "downloading" | "uploading" | "failed";
    message?: string;
    speed?: string;
    targetSizeMb?: number;
    title?: string;
  }) => string; // returns id
  updateDownload: (id: string, updates: Partial<DownloadTask>) => void;
  endDownload: (id: string) => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);

  const startDownload = useCallback((options: {
    status: "preparing" | "downloading" | "uploading" | "failed";
    message?: string;
    speed?: string;
    targetSizeMb?: number;
    title?: string;
  }) => {
    const id = Math.random().toString(36).substring(7);
    setTasks((prev) => [
      {
        id,
        status: options.status,
        message: options.message,
        speed: options.speed,
        targetSizeMb: options.targetSizeMb,
        title: options.title,
        progress: 0,
      },
      ...prev,
    ]);
    return id;
  }, []);

  const updateDownload = useCallback((id: string, updates: Partial<DownloadTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  const endDownload = useCallback((id: string) => {
    // Keep it visible for 1s before removing
    setTimeout(() => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }, 1000);
  }, []);

  return (
    <DownloadContext.Provider value={{ tasks, startDownload, updateDownload, endDownload }}>
      {children}
      <div className="fixed top-20 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {tasks.map((task) => (
          <div key={task.id} className="pointer-events-auto">
            <FloatingProgressCard
              isVisible={true}
              status={task.status}
              progress={task.progress}
              message={task.message}
              speed={task.speed}
              targetSizeMb={task.targetSizeMb}
              title={task.title}
            />
          </div>
        ))}
      </div>
    </DownloadContext.Provider>
  );
};

export const useDownload = () => {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error("useDownload must be used within a DownloadProvider");
  }
  return context;
};
