import { SocketEvents } from '@/shared/socket-events';
import { ITask } from '@/types/task/taskViewModel.types';
import { Socket } from 'socket.io-client';
import logger from '@/utils/errorLogger';
import { store } from '@/app/store';
import {
  updateTaskProgress,
  setManualProgress,
  updateSubtaskProgress,
} from '@/features/tasks/tasks.slice';
import { updateTaskProgress as updateBoardTaskProgress } from '@/features/board/board-slice';

export interface TaskProgressInfo {
  id: string;
  complete_ratio: number;
  completed_count: number;
  total_tasks_count: number;
  is_manual?: boolean;
  parent_task?: string;
}

class TaskProgressService {
  private socket: Socket | null = null;

  /**
   * Initialize the service with a socket connection
   */
  public init(socket: Socket): void {
    this.socket = socket;
    this.registerSocketListeners();
  }

  /**
   * Set up socket event listeners for task progress updates
   */
  private registerSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on(SocketEvents.GET_TASK_PROGRESS.toString(), this.handleTaskProgressUpdate);
    this.socket.on(SocketEvents.SET_MANUAL_PROGRESS.toString(), this.handleManualProgressUpdate);
  }

  /**
   * Request progress information for a task
   * @param taskId - The ID of the task to get progress for
   */
  public getTaskProgress(taskId: string): void {
    if (!this.socket || !taskId) return;

    try {
      this.socket.emit(SocketEvents.GET_TASK_PROGRESS.toString(), taskId);
    } catch (error) {
      logger.error('Error getting task progress', error);
    }
  }

  /**
   * Set manual progress for a task
   * @param taskId - The ID of the task
   * @param enableManual - Whether to enable manual progress
   * @param progressValue - The progress value to set (0-100), or -1 to recalculate based on subtasks
   * @param teamId - The ID of the current team
   * @param hasSubtasks - Optional flag indicating if this is a parent task with subtasks
   * @param parentTaskId - Optional parent task ID for subtasks
   */
  public setManualProgress(
    taskId: string,
    enableManual: boolean,
    progressValue: number,
    teamId?: string,
    hasSubtasks?: boolean,
    parentTaskId?: string
  ): Promise<boolean> {
    return new Promise(resolve => {
      if (!this.socket || !taskId) {
        resolve(false);
        return;
      }

      try {
        // If progressValue is -1, we're requesting a recalculation for a parent task
        const isRecalculationRequest = progressValue === -1;

        // If this is a parent task with subtasks, always disable manual progress
        // unless it's a recalculation request
        const finalEnableManual = hasSubtasks ? false : enableManual;

        this.socket.emit(SocketEvents.SET_MANUAL_PROGRESS.toString(), {
          task_id: taskId,
          enable_manual: isRecalculationRequest ? false : finalEnableManual,
          progress_value: isRecalculationRequest ? undefined : Math.round(progressValue),
          recalculate: isRecalculationRequest, // Add a flag to indicate recalculation
          team_id: teamId,
          parent_task_id: parentTaskId, // Include parent task ID for subtasks
        });

        // Listen for the response once
        this.socket.once(SocketEvents.SET_MANUAL_PROGRESS.toString(), (response: any) => {
          if (response?.success) {
            // For recalculation requests, immediately get fresh progress
            if (isRecalculationRequest) {
              this.getTaskProgress(taskId);
            }
          }
          resolve(response?.success || false);
        });
      } catch (error) {
        logger.error('Error setting manual progress', error);
        resolve(false);
      }
    });
  }

  /**
   * Request progress information for multiple tasks (useful for task lists)
   * @param tasks - Array of tasks to get progress for
   */
  public bulkGetTaskProgress(tasks: ITask[]): void {
    if (!this.socket) return;

    // Process all tasks, including both parent tasks and subtasks
    const parentTasks = tasks.filter(task => !task.parent_task_id);
    const subtasks = tasks.filter(task => task.parent_task_id);

    // Request progress for each parent task
    parentTasks.forEach(task => {
      if (task.id) {
        this.getTaskProgress(task.id);
      }
    });

    // Also get individual progress for subtasks
    subtasks.forEach(task => {
      if (task.id) {
        this.getTaskProgress(task.id);
      }
    });
  }

  /**
   * Handle task progress update from socket
   */
  private handleTaskProgressUpdate = (data: TaskProgressInfo): void => {
    if (!data) return;

    const taskId = data.parent_task || data.id;

    if (taskId) {
      // Update task progress in different stores based on the data
      store.dispatch(
        updateTaskProgress({
          taskId,
          progress: data.complete_ratio,
          totalTasksCount: data.total_tasks_count,
          completedCount: data.completed_count,
          isManual: data.is_manual,
        })
      );

      // Also update board if needed
      store.dispatch(
        updateBoardTaskProgress({
          id: data.id,
          complete_ratio: data.complete_ratio,
          completed_count: data.completed_count,
          total_tasks_count: data.total_tasks_count,
          parent_task: data.parent_task || '',
        })
      );

      // If this is a subtask update, also dispatch a subtask-specific update
      if (data.parent_task) {
        store.dispatch(
          updateSubtaskProgress({
            subtaskId: data.id,
            parentTaskId: data.parent_task,
            progress: data.complete_ratio,
            totalTasksCount: data.total_tasks_count || 1,
            completedCount: data.completed_count || 0,
          })
        );
      }
    }
  };

  /**
   * Handle manual progress update from socket
   */
  private handleManualProgressUpdate = (data: {
    success: boolean;
    task_id: string;
    manual_progress: boolean;
    complete_ratio: number;
    is_manual: boolean;
    parent_task_id?: string;
  }): void => {
    if (data?.success) {
      // First dispatch the manual progress update action
      store.dispatch(
        setManualProgress({
          taskId: data.task_id,
          enableManual: data.manual_progress,
          progressValue: data.complete_ratio,
        })
      );

      // Get fresh progress information after setting manual progress
      if (this.socket) {
        // Immediately get task progress to update the UI
        this.getTaskProgress(data.task_id);

        // If this is a subtask (it has a parent task ID), also get the parent's progress
        if (data.parent_task_id) {
          this.getTaskProgress(data.parent_task_id);
        }
      }
    }
  };

  /**
   * Clean up event listeners
   */
  public cleanup(): void {
    if (!this.socket) return;

    this.socket.off(SocketEvents.GET_TASK_PROGRESS.toString(), this.handleTaskProgressUpdate);
    this.socket.off(SocketEvents.SET_MANUAL_PROGRESS.toString(), this.handleManualProgressUpdate);
  }

  /**
   * Update the weight of a task
   * @param taskId - The ID of the task
   * @param weight - The weight value to set
   * @returns Promise resolving to success status
   */
  public updateTaskWeight(taskId: string, weight: number): Promise<boolean> {
    return new Promise(resolve => {
      if (!this.socket || !taskId) {
        resolve(false);
        return;
      }

      try {
        this.socket.emit(SocketEvents.UPDATE_TASK_WEIGHT.toString(), {
          task_id: taskId,
          weight: Math.max(1, Math.round(weight)), // Ensure weight is at least 1 and an integer
        });

        // Listen for the response once
        this.socket.once(SocketEvents.UPDATE_TASK_WEIGHT.toString(), (response: any) => {
          if (response?.success) {
            // Get fresh task data after updating weight
            this.getTaskProgress(taskId);
          }
          resolve(response?.success || false);
        });
      } catch (error) {
        logger.error('Error updating task weight', error);
        resolve(false);
      }
    });
  }
}

// Create singleton instance
const taskProgressService = new TaskProgressService();
export default taskProgressService;
