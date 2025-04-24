import { IProjectTask } from '@/types/project/projectTasksViewModel.types';
import { ITask } from '@/types/task/taskViewModel.types';

/**
 * Calculate the average progress of subtasks
 * @param parentTask - The parent task
 * @param subtasks - Array of subtasks
 * @param useWeightedProgress - Whether to use weighted progress calculation
 * @returns The calculated average progress (0-100)
 */
export const calculateAverageSubtaskProgress = (
  parentTask: IProjectTask | ITask,
  subtasks: Array<IProjectTask | ITask>,
  useWeightedProgress: boolean = false
): number => {
  // If there are no subtasks, return the parent's progress
  if (!subtasks || subtasks.length === 0) {
    return parentTask.complete_ratio || 0;
  }

  // If weighted progress is enabled, use task weights in calculation
  if (useWeightedProgress) {
    let totalWeight = 0;
    let weightedProgress = 0;

    subtasks.forEach(subtask => {
      const weight = subtask.weight || 1; // Default weight is 1
      const progress = subtask.complete_ratio || 0;

      totalWeight += weight;
      weightedProgress += progress * weight;
    });

    // Avoid division by zero
    if (totalWeight === 0) {
      return 0;
    }

    // Calculate the weighted average (rounded to nearest integer)
    return Math.round(weightedProgress / totalWeight);
  } else {
    // Calculate standard average (non-weighted)
    const totalProgress = subtasks.reduce((sum, subtask) => {
      return sum + (subtask.complete_ratio || 0);
    }, 0);

    // Calculate the average (rounded to nearest integer)
    return Math.round(totalProgress / subtasks.length);
  }
};

/**
 * Find all subtasks for a given parent task
 * @param parentTaskId - The ID of the parent task
 * @param allTasks - Array of all tasks in the current view
 * @returns Array of subtasks
 */
export const findSubtasks = (
  parentTaskId: string,
  allTasks: Array<IProjectTask | ITask>
): Array<IProjectTask | ITask> => {
  return allTasks.filter(
    task =>
      task.parent_task_id === parentTaskId ||
      // Some task objects might have parent_task instead of parent_task_id
      (task as any).parent_task === parentTaskId
  );
};
