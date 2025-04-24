import { Modal, Slider, Button, theme, Alert } from 'antd';
import { useState, useEffect, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SocketEvents } from '@/shared/socket-events';
import { ITask } from '@/types/task/taskViewModel.types';
import { CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAppSelector } from '@/hooks/useAppSelector'; 
import { useTaskProgress } from '@/hooks/useTaskProgress';
import './task-progress-editor.css';
import { calculateAverageSubtaskProgress, findSubtasks } from '@/utils/task-progress-utils';

type TaskProgressEditorProps = {
  task: ITask;
  onClose: () => void;
};

// Memoize the component to improve performance
const TaskProgressEditor = memo(({ task, onClose }: TaskProgressEditorProps) => {
  const { t } = useTranslation('task-progress');
  const { setManualProgress } = useTaskProgress();
  const themeMode = useAppSelector(state => state.themeReducer.mode);
  const isDarkMode = themeMode === 'dark';
  const [progressValue, setProgressValue] = useState(task.complete_ratio || 0);
  const [hasSubtasks, setHasSubtasks] = useState((task.sub_tasks_count || 0) > 0);
  const [saving, setSaving] = useState(false);
  
  // Get the current project from the Redux store to check if manual progress is enabled
  const { project: currentProject } = useAppSelector(state => state.projectReducer);
  const useManualProgress = currentProject?.use_manual_progress || false;
  
  // Determine if this is a subtask
  const isSubtask = !!task.parent_task_id;
  
  // Get all tasks from the Redux store to find subtasks
  const taskGroups = useAppSelector(state => state.taskReducer.taskGroups);
  // Memoize the task list to prevent unnecessary re-renders
  const allTasks = useMemo(() => {
    return taskGroups.flatMap(group => group.tasks);
  }, [taskGroups]);

  // Calculate progress based on subtasks
  const calculateAverageProgress = () => {
    if (!task.id || !hasSubtasks) return progressValue;
    
    // Find all subtasks for this parent task
    const subtasks = findSubtasks(task.id, allTasks);
    
    if (subtasks.length > 0) {
      return calculateAverageSubtaskProgress(task, subtasks);
    }
    
    return progressValue;
  };

  // Update state when task props change
  useEffect(() => {
    setProgressValue(task.complete_ratio || 0);
    setHasSubtasks((task.sub_tasks_count || 0) > 0);
  }, [task]);
  
  // When component mounts or when manual mode is detected, calculate from subtasks
  useEffect(() => {
    if (hasSubtasks && !isSubtask) {
      const avgProgress = calculateAverageProgress();
      setProgressValue(avgProgress);
    }
  }, []);

  const handleSave = async () => {
    if (!task.id || !useManualProgress) return;
    
    setSaving(true);
    
    const success = await setManualProgress(
      task.id,
      true, // Always enable manual progress when saving
      Math.round(progressValue)
    );
    
    setSaving(false);
    if (success) {
      onClose();
    }
  };

  const roundedProgress = Math.round(progressValue);
  const isComplete = roundedProgress === 100;
  
  // Color for progress text based on value and theme
  const getProgressColor = () => {
    if (isComplete) return '#52c41a';
    return isDarkMode ? '#1890ff' : '#1677ff';
  };
  
  // Gets the title based on whether this is a parent task or subtask
  const getTitle = () => {
    if (isSubtask) {
      return t('subtaskModalTitle');
    }
    return t('modalTitle');
  };

  return (
    <Modal
      title={getTitle()}
      open={true}
      onCancel={onClose}
      width={400}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('cancelButton')}
        </Button>,
        <Button 
          key="save" 
          type="primary" 
          onClick={handleSave}
          loading={saving}
          disabled={!useManualProgress}
        >
          {t('saveButton')}
        </Button>
      ]}
      centered
      className="task-progress-editor"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {!useManualProgress && (
          <Alert
            message={t('manualProgressDisabledTitle')}
            description={t('manualProgressDisabledDescription')}
            type="warning"
            showIcon
            icon={<InfoCircleOutlined />}
          />
        )}
        <div>
          <div className="progress-label">
            {t(isSubtask ? 'subtaskManualProgressLabel' : 'manualProgressLabel')}
          </div>

          <div>
            <div className="progress-current" style={{ color: getProgressColor() }}>
              {isComplete ? (
                <span style={{ color: '#52c41a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <CheckCircleOutlined /> {t('statusComplete')}
                </span>
              ) : (
                `${roundedProgress}%`
              )}
            </div>
            
            <Slider
              min={0}
              max={100}
              value={progressValue}
              onChange={setProgressValue}
              tooltip={{ formatter: value => `${value}%` }}
              marks={{ 0: '0%', 25: '25%', 50: '50%', 75: '75%', 100: '100%' }}
              className="progress-slider"
              disabled={!useManualProgress}
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <Button 
                size="small" 
                onClick={() => setProgressValue(0)}
                disabled={progressValue === 0 || !useManualProgress}
              >
                0%
              </Button>
              <Button 
                size="small" 
                onClick={() => setProgressValue(25)}
                disabled={progressValue === 25 || !useManualProgress}
              >
                25%
              </Button>
              <Button 
                size="small" 
                onClick={() => setProgressValue(50)}
                disabled={progressValue === 50 || !useManualProgress}
              >
                50%
              </Button>
              <Button 
                size="small" 
                onClick={() => setProgressValue(75)}
                disabled={progressValue === 75 || !useManualProgress}
              >
                75%
              </Button>
              <Button 
                size="small" 
                type={isComplete ? 'primary' : 'default'}
                onClick={() => setProgressValue(100)}
                disabled={progressValue === 100 || !useManualProgress}
              >
                100%
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
});

export default TaskProgressEditor; 