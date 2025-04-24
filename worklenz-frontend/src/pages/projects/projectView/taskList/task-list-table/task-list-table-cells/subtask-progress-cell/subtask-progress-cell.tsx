import { Progress, Tooltip } from 'antd';
import { IProjectTask } from '@/types/project/projectTasksViewModel.types';
import { useState, useEffect, Suspense, lazy } from 'react';
import { useTaskProgress } from '@/hooks/useTaskProgress';
import { useAppSelector } from '@/hooks/useAppSelector';
import './subtask-progress-cell.css';
import { useTranslation } from 'react-i18next';
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

// Loading overlay for suspense
const LoadingOverlay = () => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}
  >
    <div
      style={{
        padding: '20px',
        borderRadius: '4px',
        backgroundColor: 'white',
      }}
    >
      Loading...
    </div>
  </div>
);

type SubtaskProgressCellProps = {
  task: IProjectTask;
  parentTask?: IProjectTask;
};

const SubtaskProgressCell = ({ task, parentTask }: SubtaskProgressCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { getTaskProgress } = useTaskProgress();
  const isParentManual = parentTask?.is_manual || false;
  const isDarkMode = useAppSelector(state => state.themeReducer.mode) === 'dark';
  const { t } = useTranslation('task-progress');

  // Get the current project from the Redux store to check if manual progress is enabled
  const { project: currentProject } = useAppSelector(state => state.projectReducer);
  const useManualProgress = currentProject?.use_manual_progress || false;

  // Request the latest progress when the component mounts
  useEffect(() => {
    if (task.id) {
      getTaskProgress(task.id);
    }

    // Preload the editor component if manual progress is enabled
    if (useManualProgress) {
      preloadTaskProgressEditor();
    }
  }, [task.id, getTaskProgress, useManualProgress]);

  // Simple tooltip title
  const getTooltipTitle = () => {
    if (!useManualProgress) {
      return t('manualProgressDisabled');
    }

    if (task.is_manual) {
      return `${task.complete_ratio || 0}%`;
    }
    return `${task.completed_count || 0} / ${task.total_tasks_count || 0}`;
  };

  // Determine styling based on manual progress setting and parent mode
  const progressStyle = {
    opacity: !useManualProgress ? 0.4 : isParentManual ? 1 : 0.7,
    cursor: useManualProgress ? 'pointer' : 'default',
  };

  // Determine stroke color based on mode and theme
  const getStrokeColor = () => {
    if (!useManualProgress) {
      return isDarkMode ? '#444' : '#ddd';
    }

    if (!isParentManual) {
      return isDarkMode ? '#555' : '#ccc';
    }

    return undefined; // Use default color
  };

  // Handle click only if manual progress is enabled
  const handleClick = () => {
    if (useManualProgress) {
      setIsEditing(true);
    }
  };

  return (
    <>
      <Tooltip title={getTooltipTitle()} placement="top">
        <div
          style={progressStyle}
          onClick={handleClick}
          onMouseEnter={useManualProgress ? preloadTaskProgressEditor : undefined}
        >
          <Progress
            percent={task.complete_ratio || 0}
            type="circle"
            size={24}
            strokeWidth={(task.complete_ratio || 0) >= 100 ? 8 : 6}
            className={
              useManualProgress && task.is_manual ? 'subtask-progress-manual' : 'subtask-progress'
            }
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

export default SubtaskProgressCell;
