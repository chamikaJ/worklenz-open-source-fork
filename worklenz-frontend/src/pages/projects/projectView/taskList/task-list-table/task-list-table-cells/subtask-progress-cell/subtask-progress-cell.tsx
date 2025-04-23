import { Progress, Tooltip } from 'antd';
import { IProjectTask } from '@/types/project/projectTasksViewModel.types';
import { useState, useEffect } from 'react';
import { useTaskProgress } from '@/hooks/useTaskProgress';
import { useAppSelector } from '@/hooks/useAppSelector';
import './subtask-progress-cell.css';
import { useTranslation } from 'react-i18next';

type SubtaskProgressCellProps = {
  task: IProjectTask;
  parentTask?: IProjectTask;
};

const SubtaskProgressCell = ({ task, parentTask }: SubtaskProgressCellProps) => {
  const { getTaskProgress } = useTaskProgress();
  const isParentManual = parentTask?.is_manual || false;
  const isDarkMode = useAppSelector(state => state.themeReducer.mode) === 'dark';
  const { t } = useTranslation('task-progress');
  
  // Request the latest progress when the component mounts
  useEffect(() => {
    if (task.id) {
      getTaskProgress(task.id);
    }
  }, [task.id, getTaskProgress]);
  
  // Calculate how many total subtasks there are for the parent
  const parentSubtaskCount = parentTask?.sub_tasks_count || 0;
  
  // Calculate contribution to parent (equal weighting for all subtasks)
  const calculateContribution = () => {
    if (!parentTask || parentSubtaskCount <= 0) return 0;
    
    // Each subtask contributes equally to parent task progress
    const contributionPerSubtask = 100 / parentSubtaskCount;
    
    // This subtask's contribution based on its own progress
    const thisSubtaskContribution = (contributionPerSubtask * (task.complete_ratio || 0)) / 100;
    
    return Math.round(thisSubtaskContribution);
  };
  
  const getTooltipTitle = () => {
    if (!isParentManual) {
      return t('subtaskProgressHidden');
    }
    
    // If task itself is in manual mode
    if (task.is_manual) {
      return `${task.complete_ratio || 0}% (${t('modeManual')})`;
    }
    
    const contribution = calculateContribution();
    
    // Default auto mode with contribution info
    return (
      <div>
        <div>{`${task.completed_count || 0} / ${task.total_tasks_count || 0}`}</div>
        <div style={{ marginTop: '4px', fontSize: '12px' }}>
          {`${t('contributesToParent')}: ${contribution}%`}
        </div>
      </div>
    );
  };
  
  // Determine styling based on parent and self mode
  const progressStyle = {
    opacity: isParentManual ? 1 : 0.5,
    cursor: isParentManual ? 'pointer' : 'default',
  };
  
  // Determine stroke color based on mode and theme
  const getStrokeColor = () => {
    if (!isParentManual) {
      return isDarkMode ? '#444' : '#ccc';
    }
    return undefined; // Use default color
  };
  
  return (
    <Tooltip title={getTooltipTitle()} placement="top">
      <div style={progressStyle}>
        <Progress
          percent={task.complete_ratio || 0}
          type="circle"
          size={20}
          strokeWidth={(task.complete_ratio || 0) >= 100 ? 8 : 6}
          className={task.is_manual ? 'subtask-progress-manual' : 'subtask-progress'}
          strokeColor={getStrokeColor()}
        />
      </div>
    </Tooltip>
  );
};

export default SubtaskProgressCell; 