import { Progress, Tooltip } from 'antd';
import './task-list-progress-cell.css';
import { IProjectTask } from '@/types/project/projectTasksViewModel.types';
import { useState, useEffect } from 'react';
import TaskProgressEditor from '@/components/task-progress-editor/task-progress-editor';
import { useTaskProgress } from '@/hooks/useTaskProgress';
import SubtaskProgressCell from '../subtask-progress-cell/subtask-progress-cell';
import { useAppSelector } from '@/hooks/useAppSelector';

type TaskListProgressCellProps = {
  task: IProjectTask;
};

const TaskListProgressCell = ({ task }: TaskListProgressCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { getTaskProgress } = useTaskProgress();
  const taskGroups = useAppSelector(state => state.taskReducer.taskGroups);
  
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
  useEffect(() => {
    if (task.id) {
      getTaskProgress(task.id);
    }
  }, [task.id, getTaskProgress]);
  
  // If it's a subtask, use the specialized subtask progress component
  if (task.is_sub_task || task.parent_task_id) {
    return <SubtaskProgressCell task={task} parentTask={parentTask} />;
  }

  const tooltipTitle = task.is_manual 
    ? `${task.complete_ratio || 0}% (Manual)`
    : `${task.completed_count || 0} / ${task.total_tasks_count || 0}`;
  
  return (
    <>
      <Tooltip title={tooltipTitle}>
        <div onClick={() => setIsEditing(true)} style={{ cursor: 'pointer' }}>
          <Progress
            percent={task.complete_ratio || 0}
            type="circle"
            size={24}
            strokeWidth={(task.complete_ratio || 0) >= 100 ? 9 : 7}
            className={task.is_manual ? 'task-progress-manual' : ''}
          />
        </div>
      </Tooltip>
      
      {isEditing && (
        <TaskProgressEditor 
          task={task} 
          onClose={() => setIsEditing(false)} 
        />
      )}
    </>
  );
};

export default TaskListProgressCell;
