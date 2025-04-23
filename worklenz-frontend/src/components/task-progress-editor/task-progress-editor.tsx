import { Modal, Slider, Button, Alert, Segmented, theme, Tooltip } from 'antd';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SocketEvents } from '@/shared/socket-events';
import { ITask } from '@/types/task/taskViewModel.types';
import { InfoCircleOutlined, CheckCircleOutlined, WarningOutlined, CalculatorOutlined } from '@ant-design/icons';
import { useAppSelector } from '@/hooks/useAppSelector'; 
import { useTaskProgress } from '@/hooks/useTaskProgress';
import './task-progress-editor.css';
import { calculateAverageSubtaskProgress, findSubtasks } from '@/utils/task-progress-utils';

type TaskProgressEditorProps = {
  task: ITask;
  onClose: () => void;
};

const TaskProgressEditor = ({ task, onClose }: TaskProgressEditorProps) => {
  const { t } = useTranslation('task-progress');
  const { setManualProgress } = useTaskProgress();
  const themeMode = useAppSelector(state => state.themeReducer.mode);
  const isDarkMode = themeMode === 'dark';
  const [manualProgress, setManualProgressState] = useState(task.is_manual || false);
  const [progressValue, setProgressValue] = useState(task.complete_ratio || 0);
  const [hasSubtasks, setHasSubtasks] = useState((task.sub_tasks_count || 0) > 0);
  const [saving, setSaving] = useState(false);
  
  // Get all tasks from the Redux store to find subtasks
  const allTasks = useAppSelector(state => {
    const taskGroups = state.taskReducer.taskGroups;
    return taskGroups.flatMap(group => group.tasks);
  });

  // Calculate average progress from subtasks
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
    setManualProgressState(task.is_manual || false);
    setProgressValue(task.complete_ratio || 0);
    setHasSubtasks((task.sub_tasks_count || 0) > 0);
  }, [task]);
  
  // When switching to manual mode, automatically calculate average from subtasks
  useEffect(() => {
    if (manualProgress && hasSubtasks) {
      const avgProgress = calculateAverageProgress();
      setProgressValue(avgProgress);
    }
  }, [manualProgress]);

  const handleSave = async () => {
    if (!task.id) return;
    
    setSaving(true);
    
    const success = await setManualProgress(
      task.id,
      manualProgress,
      Math.round(progressValue)
    );
    
    setSaving(false);
    if (success) {
      onClose();
    }
  };
  
  const modeOptions = [
    { 
      label: t('modeAuto'), 
      value: false,
      icon: '🔄'
    },
    { 
      label: t('modeManual'), 
      value: true,
      icon: '✋'
    }
  ];

  const roundedProgress = Math.round(progressValue);
  const isComplete = roundedProgress === 100;
  
  // Color for progress text based on value and theme
  const getProgressColor = () => {
    if (isComplete) return isDarkMode ? '#52c41a' : '#52c41a';
    if (progressValue > 75) return isDarkMode ? '#1890ff' : '#1677ff';
    if (progressValue > 50) return isDarkMode ? '#1890ff' : '#1677ff';
    if (progressValue > 25) return isDarkMode ? '#1890ff' : '#1677ff';
    return isDarkMode ? '#1890ff' : '#1677ff';
  };

  // Custom warning component to match the screenshot
  const CustomWarning = () => (
    <div style={{
      backgroundColor: isDarkMode ? '#472B1E' : '#FFF2E8',
      border: isDarkMode ? '1px solid #6A3C24' : '1px solid #FFCCA7',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '12px'
    }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <WarningOutlined style={{ 
          color: isDarkMode ? '#F79B51' : '#FA8C16', 
          fontSize: '18px',
          marginTop: '2px'
        }} />
        <div>
          <div style={{ 
            fontWeight: 500, 
            marginBottom: '4px',
            color: isDarkMode ? '#F79B51' : '#D46B08'
          }}>
            {t('warningTitle')}
          </div>
          <div style={{
            color: isDarkMode ? '#D9D9D9' : '#434343'
          }}>
            {t('warningManualOverride')}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      title={t('modalTitle')}
      open={true}
      onCancel={onClose}
      width={450}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('cancelButton')}
        </Button>,
        <Button 
          key="save" 
          type="primary" 
          onClick={handleSave}
          loading={saving}
        >
          {t('saveButton')}
        </Button>
      ]}
      centered
      className="task-progress-editor"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <Segmented
            options={modeOptions}
            value={manualProgress}
            onChange={value => setManualProgressState(value as boolean)}
            block
          />
        </div>
        
        <div>
          <div className="progress-label">
            {manualProgress ? t('manualProgressLabel') : t('autoProgressLabel')}
            {manualProgress && hasSubtasks ? (
              <div style={{ fontSize: '13px', color: isDarkMode ? '#a6a6a6' : '#666', fontWeight: 'normal', marginTop: '4px' }}>
                {t('basedOnSubtaskAverage')}
              </div>
            ) : manualProgress ? null : (
              <div style={{ fontSize: '13px', color: isDarkMode ? '#a6a6a6' : '#666', fontWeight: 'normal', marginTop: '4px' }}>
                {t('completedCount', { completed: task.completed_count || 0, total: task.total_tasks_count || 0 })}
              </div>
            )}
          </div>

          {manualProgress ? (
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
              />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                <Button 
                  size="small" 
                  onClick={() => setProgressValue(0)}
                  disabled={progressValue === 0}
                >
                  0%
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setProgressValue(25)}
                  disabled={progressValue === 25}
                >
                  25%
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setProgressValue(50)}
                  disabled={progressValue === 50}
                >
                  50%
                </Button>
                <Button 
                  size="small" 
                  onClick={() => setProgressValue(75)}
                  disabled={progressValue === 75}
                >
                  75%
                </Button>
                <Button 
                  size="small" 
                  type={isComplete ? 'primary' : 'default'}
                  onClick={() => setProgressValue(100)}
                  disabled={progressValue === 100}
                >
                  100%
                </Button>
              </div>
            </div>
          ) : (
            <div className="progress-info-box">
              <InfoCircleOutlined style={{ color: isDarkMode ? '#1890ff' : '#1677ff', marginTop: '2px' }} />
              <div>
                {t('autoProgressInfo')}
              </div>
            </div>
          )}
        </div>

        {hasSubtasks && manualProgress && <CustomWarning />}
      </div>
    </Modal>
  );
};

export default TaskProgressEditor; 