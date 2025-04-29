import {
  Modal,
  Slider,
  Button,
  theme,
  Alert,
  InputNumber,
  Typography,
  Flex,
  Divider,
  Tooltip,
  Progress,
  Card,
  Space,
} from 'antd';
import { useState, useEffect, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ITask } from '@/types/task/taskViewModel.types';
import { 
  CheckCircleOutlined, 
  InfoCircleOutlined, 
  QuestionCircleOutlined,
  PercentageOutlined,
  BarChartOutlined 
} from '@ant-design/icons';
import { useAppSelector } from '@/hooks/useAppSelector';
import taskProgressService from '@/services/tasks/task-progress.service';
import './task-progress-editor.css';
import { calculateAverageSubtaskProgress, findSubtasks } from '@/utils/task-progress-utils';
import { getUserSession } from '@/utils/session-helper';

const { Text, Title } = Typography;

type TaskProgressEditorProps = {
  task: ITask;
  onClose: () => void;
};

// Memoize the component to improve performance
const TaskProgressEditor = memo(({ task, onClose }: TaskProgressEditorProps) => {
  const { t } = useTranslation('task-progress');
  const { token } = theme.useToken();
  const themeMode = useAppSelector(state => state.themeReducer.mode);
  const isDarkMode = themeMode === 'dark';
  const [progressValue, setProgressValue] = useState(task.complete_ratio || 0);
  const [weightValue, setWeightValue] = useState(task.weight || 1);
  const [hasSubtasks, setHasSubtasks] = useState((task.sub_tasks_count || 0) > 0);
  const [saving, setSaving] = useState(false);
  const currentSession = getUserSession();

  // Get the current project from the Redux store to check if manual progress is enabled
  const { project: currentProject } = useAppSelector(state => state.projectReducer);
  const useManualProgress = currentProject?.use_manual_progress || false;
  const useWeightedProgress = currentProject?.use_weighted_progress || false;

  // Determine if this is a subtask
  const isSubtask = !!task.parent_task_id;

  // Get all tasks from the Redux store to find subtasks
  const taskGroups = useAppSelector(state => state.taskReducer.taskGroups);
  // Memoize the task list to prevent unnecessary re-renders
  const allTasks = useMemo(() => {
    return taskGroups.flatMap(group => group.tasks);
  }, [taskGroups]);

  // Get fresh task data when component mounts
  useEffect(() => {
    if (task.id) {
      // Request fresh progress data for this task
      taskProgressService.getTaskProgress(task.id);

      // If this is a subtask, also get parent progress
      if (isSubtask && task.parent_task_id) {
        taskProgressService.getTaskProgress(task.parent_task_id);
      }

      // If task has subtasks, fetch their progress too
      if (hasSubtasks) {
        const subtasks = findSubtasks(task.id, allTasks);
        subtasks.forEach(subtask => {
          if (subtask.id) {
            taskProgressService.getTaskProgress(subtask.id);
          }
        });
      }
    }
  }, [task.id, isSubtask, task.parent_task_id, hasSubtasks, allTasks]);

  // Find the most up-to-date task in Redux store
  const updatedTask = useMemo(() => {
    if (!task.id) return task;

    // Look for this task in allTasks to get the latest state
    const latestTask = allTasks.find(t => t.id === task.id);
    return latestTask || task;
  }, [task, task.id, allTasks]);

  // Determine if manual progress is allowed for this task
  const isManualProgressAllowed = useMemo(() => {
    // Always allow manual progress for subtasks
    if (isSubtask) return true;

    // For parent tasks, only allow manual progress if they have no subtasks
    return !hasSubtasks;
  }, [isSubtask, hasSubtasks]);

  // Calculate progress based on subtasks
  const calculateAverageProgress = useMemo(() => {
    if (!task.id || !hasSubtasks) return progressValue;

    // Find all subtasks for this parent task
    const subtasks = findSubtasks(task.id, allTasks);

    if (subtasks.length > 0) {
      return calculateAverageSubtaskProgress(task, subtasks, useWeightedProgress);
    }

    return progressValue;
  }, [task.id, allTasks, hasSubtasks, progressValue, useWeightedProgress]);

  // Update state when task props change
  useEffect(() => {
    // Use the updated task from Redux store to ensure we have the latest progress value
    setProgressValue(updatedTask.complete_ratio || 0);
    setHasSubtasks((updatedTask.sub_tasks_count || 0) > 0);
    setWeightValue(updatedTask.weight || 1);
  }, [updatedTask, updatedTask.complete_ratio, updatedTask.weight]);

  // When component mounts or when dependencies change, calculate from subtasks
  useEffect(() => {
    if (hasSubtasks && !isSubtask) {
      setProgressValue(calculateAverageProgress);
    }
  }, [hasSubtasks, isSubtask, calculateAverageProgress, allTasks, updatedTask.complete_ratio]);

  const handleSave = async () => {
    if (!updatedTask.id || !useManualProgress || !isManualProgressAllowed) return;

    setSaving(true);

    // First update the task's weight if it's a subtask
    if (isSubtask && weightValue !== (updatedTask.weight || 1)) {
      await taskProgressService.updateTaskWeight(updatedTask.id, weightValue);
    }

    // Then update the progress
    const success = await taskProgressService.setManualProgress(
      updatedTask.id,
      true, // Always enable manual progress when saving
      Math.round(progressValue),
      currentSession?.team_id,
      hasSubtasks,
      isSubtask ? updatedTask.parent_task_id : undefined // Pass parent task ID for subtasks
    );

    setSaving(false);
    if (success) {
      // If this is a subtask, also update the parent task's progress
      if (isSubtask && updatedTask.parent_task_id) {
        // Find parent task in allTasks and trigger progress recalculation
        const parentTask = allTasks.find(t => t.id === updatedTask.parent_task_id);
        if (parentTask) {
          // We don't need to wait for this, just trigger the update
          taskProgressService.setManualProgress(
            updatedTask.parent_task_id,
            false, // Don't force manual progress on parent
            -1, // Special value to trigger recalculation based on subtasks
            currentSession?.team_id,
            true // Parent has at least one subtask
          );
        }
      }

      // Get fresh progress information for this task before closing
      taskProgressService.getTaskProgress(updatedTask.id);

      // Use a slight delay before closing to allow the UI to update
      setTimeout(() => {
        onClose();
      }, 300);
    }
  };

  const roundedProgress = useManualProgress ? Math.round(progressValue) : Math.round(task.complete_ratio || 0);
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

  // Calculate if the save button should be disabled
  const isSaveDisabled = !useManualProgress || !isManualProgressAllowed;

  // Get appropriate progress status for Progress component
  const getProgressStatus = () => {
    if (isComplete) return 'success';
    if (roundedProgress > 0) return 'active';
    return 'normal';
  };

  // Color for progress based on theme and completion
  const getProgressStrokeColor = () => {
    if (isComplete) return '#52c41a';
    return isDarkMode ? '#0a84ff' : '#1677ff';
  };

  return (
    <Modal
      title={
        <Flex align="center" gap="small">
          <span>{getTitle()}</span>
        </Flex>
      }
      open={true}
      onCancel={onClose}
      width={640}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('cancelButton')}
        </Button>,
        <Button
          key="save"
          type="primary"
          onClick={handleSave}
          loading={saving}
          disabled={isSaveDisabled}
        >
          {t('saveButton')}
        </Button>,
      ]}
      centered
      className="task-progress-editor"
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {!useManualProgress && (
          <Alert
            message={t('manualProgressDisabledTitle')}
            description={t('manualProgressDisabledDescription')}
            type="warning"
            showIcon
            icon={<InfoCircleOutlined />}
          />
        )}

        {useManualProgress && hasSubtasks && !isSubtask && (
          <Alert
            description={t('parentTaskProgressDescription')}
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
          />
        )}

        {/* Only show weighted progress info if it's enabled for the project */}
        {useWeightedProgress && (
          <Alert
            description={t('weightedProgressEnabledDescription')}
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
          />
        )}

        {/* Task Weight input (only for subtasks) */}
        {isSubtask && useWeightedProgress && (
          <Card 
            className="card-section" 
            size="small" 
            title={
              <Flex align="center" gap="small">
                <BarChartOutlined />
                <Text strong>{t('taskWeightLabel')}</Text>
                <Tooltip title={t('taskWeightTooltip')}>
                  <QuestionCircleOutlined style={{ fontSize: '14px', color: token.colorTextSecondary }} />
                </Tooltip>
              </Flex>
            }
          >
            <Flex align="center" justify="space-between">
              <Text type="secondary" className="weight-description">
                {t('taskWeightDescription')}
              </Text>
              <InputNumber
                min={1}
                max={100}
                value={weightValue}
                onChange={value => setWeightValue(value || 1)}
                disabled={!useWeightedProgress}
                addonAfter={<BarChartOutlined />}
                style={{ width: '120px' }}
              />
            </Flex>
          </Card>
        )}

        <Card 
          className="card-section progress-section" 
          size="small"
          title={
            <Flex align="center" gap="small">
              <Text strong>
                {t(isSubtask ? 'subtaskManualProgressLabel' : 'manualProgressLabel')}
              </Text>
            </Flex>
          }
        >
          <Flex align="center" gap="large">
            <Progress
              type="circle"
              percent={roundedProgress}
              status={getProgressStatus()}
              strokeColor={getProgressStrokeColor()}
              size={100}
            />
            <div style={{ flex: 1 }}>
              <Slider
                min={0}
                max={100}
                value={progressValue}
                onChange={setProgressValue}
                tooltip={{ formatter: value => `${value}%` }}
                marks={{}}
                disabled={!useManualProgress || !isManualProgressAllowed}
              />

              <Flex gap="small" wrap="wrap" justify="space-between" style={{ marginTop: '16px' }}>
                <Button
                  size="small"
                  onClick={() => setProgressValue(0)}
                  disabled={progressValue === 0 || !useManualProgress || !isManualProgressAllowed}
                  type={progressValue === 0 ? 'primary' : 'default'}
                  style={{ minWidth: '60px' }}
                >
                  0%
                </Button>
                <Button
                  size="small"
                  onClick={() => setProgressValue(25)}
                  disabled={progressValue === 25 || !useManualProgress || !isManualProgressAllowed}
                  type={progressValue === 25 ? 'primary' : 'default'}
                  style={{ minWidth: '60px' }}
                >
                  25%
                </Button>
                <Button
                  size="small"
                  onClick={() => setProgressValue(50)}
                  disabled={progressValue === 50 || !useManualProgress || !isManualProgressAllowed}
                  type={progressValue === 50 ? 'primary' : 'default'}
                  style={{ minWidth: '60px' }}
                >
                  50%
                </Button>
                <Button
                  size="small"
                  onClick={() => setProgressValue(75)}
                  disabled={progressValue === 75 || !useManualProgress || !isManualProgressAllowed}
                  type={progressValue === 75 ? 'primary' : 'default'}
                  style={{ minWidth: '60px' }}
                >
                  75%
                </Button>
                <Button
                  size="small"
                  type={isComplete ? 'primary' : 'default'}
                  onClick={() => setProgressValue(100)}
                  disabled={progressValue === 100 || !useManualProgress || !isManualProgressAllowed}
                  icon={isComplete ? <CheckCircleOutlined /> : null}
                  style={{ minWidth: '60px' }}
                >
                  100%
                </Button>
              </Flex>
            </div>
          </Flex>
        </Card>
      </Space>
    </Modal>
  );
});

export default TaskProgressEditor;
