import { useEffect, useCallback } from 'react';
import { useSocket } from '@/socket/socketContext';
import taskProgressService from '@/services/tasks/task-progress.service';
import { ITask } from '@/types/task/taskViewModel.types';
import { getUserSession } from '@/utils/session-helper';

/**
 * Custom hook for task progress functionality
 * Provides methods for getting and setting task progress
 */
export const useTaskProgress = () => {
  const { socket, connected } = useSocket();
  const currentSession = getUserSession();

  // Initialize the service when socket connection changes
  useEffect(() => {
    if (socket && connected) {
      taskProgressService.init(socket);
    }

    return () => {
      taskProgressService.cleanup();
    };
  }, [socket, connected]);

  /**
   * Get progress for a single task
   */
  const getTaskProgress = useCallback((taskId: string) => {
    taskProgressService.getTaskProgress(taskId);
  }, []);

  /**
   * Get progress for multiple tasks at once
   */
  const bulkGetTaskProgress = useCallback((tasks: ITask[]) => {
    taskProgressService.bulkGetTaskProgress(tasks);
  }, []);

  /**
   * Set manual progress for a task
   */
  const setManualProgress = useCallback(
    (taskId: string, enableManual: boolean, progressValue: number, hasSubtasks?: boolean) => {
      return taskProgressService.setManualProgress(
        taskId,
        enableManual,
        progressValue,
        currentSession?.team_id,
        hasSubtasks
      );
    },
    [currentSession?.team_id]
  );

  return {
    getTaskProgress,
    bulkGetTaskProgress,
    setManualProgress,
  };
};
