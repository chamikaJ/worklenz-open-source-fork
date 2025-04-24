import { Progress, Tooltip, Spin } from 'antd';
import './task-list-progress-cell.css';
import { IProjectTask } from '@/types/project/projectTasksViewModel.types';
import { useState, useEffect, Suspense, lazy } from 'react';
import { useTaskProgress } from '@/hooks/useTaskProgress';
import SubtaskProgressCell from '../subtask-progress-cell/subtask-progress-cell';
import { useAppSelector } from '@/hooks/useAppSelector';
import { createPortal } from 'react-dom';

// Lazy load the TaskProgressEditor component
const TaskProgressEditor = lazy(
  () => import('@/components/task-progress-editor/task-progress-editor')
);

// Preload function to be called before showing the editor
const preloadTaskProgressEditor = () => {
  // Trigger the import but don't wait for it
  import('@/components/task-progress-editor/task-progress-editor');
};

// Improved loading overlay component
const LoadingOverlay = () => (
  <div
    className="task-progress-editor-loading"
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      backdropFilter: 'blur(1px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      opacity: 0.8,
      animation: 'fadeIn 0.2s ease-in-out',
    }}
  >
    <Spin size="large" />
  </div>
);

type TaskListProgressCellProps = {
  task: IProjectTask;
};

const TaskListProgressCell = ({ task }: TaskListProgressCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { getTaskProgress } = useTaskProgress();
  const taskGroups = useAppSelector(state => state.taskReducer.taskGroups);

  // Get the current project from the Redux store to check if manual progress is enabled
  const { project: currentProject } = useAppSelector(state => state.projectReducer);
  const useManualProgress = currentProject?.use_manual_progress || false;

  // Helper to find parent task if this is a subtask
  const findParentTask = (): IProjectTask | undefined => {
    if (!task.parent_task_id) return undefined;

    // Search through all task groups to find the parent
    for (const group of taskGroups) {
      const parent = group.tasks.find(t => t.id === task.parent_task_id);
      if (parent) return parent;
    }

    return undefined;
  };

  // Find parent task if this is a subtask
  const parentTask = task.parent_task_id ? findParentTask() : undefined;

  // Request the latest progress when the component mounts
  // and preload the editor component
  useEffect(() => {
    if (task.id) {
      getTaskProgress(task.id);
    }

    // Preload the editor component if manual progress is enabled
    if (useManualProgress) {
      preloadTaskProgressEditor();
    }
  }, [task.id, getTaskProgress, useManualProgress]);

  // If it's a subtask, use the specialized subtask progress component
  if (task.is_sub_task || task.parent_task_id) {
    return <SubtaskProgressCell task={task} parentTask={parentTask} />;
  }

  // Handle click to open the editor if manual progress is enabled
  const handleClick = () => {
    if (useManualProgress) {
      setIsEditing(true);
    }
  };

  // Tooltip content based on task state and manual progress settings
  const getTooltipTitle = () => {
    if (!useManualProgress) {
      return 'Manual progress disabled';
    }

    return task.is_manual
      ? `${task.complete_ratio || 0}% (Manual)`
      : `${task.completed_count || 0} / ${task.total_tasks_count || 0}`;
  };

  return (
    <>
      <Tooltip title={getTooltipTitle()}>
        <div
          onClick={handleClick}
          onMouseEnter={useManualProgress ? preloadTaskProgressEditor : undefined}
          style={{
            cursor: useManualProgress ? 'pointer' : 'default',
            opacity: useManualProgress ? 1 : 0.7,
          }}
        >
          <Progress
            percent={task.complete_ratio || 0}
            type="circle"
            size={24}
            strokeWidth={(task.complete_ratio || 0) >= 100 ? 9 : 7}
            className={useManualProgress && task.is_manual ? 'task-progress-manual' : ''}
          />
        </div>
      </Tooltip>

      {isEditing &&
        useManualProgress &&
        createPortal(
          <Suspense fallback={<LoadingOverlay />}>
            <TaskProgressEditor task={task} onClose={() => setIsEditing(false)} />
          </Suspense>,
          document.body
        )}
    </>
  );
};

// Add the animation to the global style
const styleElement = document.createElement('style');
styleElement.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 0.8; }
  }
`;
document.head.appendChild(styleElement);

export default TaskListProgressCell;
