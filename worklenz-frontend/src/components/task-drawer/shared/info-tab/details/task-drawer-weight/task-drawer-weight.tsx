import { useEffect, useState } from 'react';
import { InputNumber, Tooltip, Flex, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ITaskViewModel } from '@/types/tasks/task.types';
import taskProgressService from '@/services/tasks/task-progress.service';
import { useAppSelector } from '@/hooks/useAppSelector';

// Import the type extension
import '@/types/tasks/task-extensions.d';

interface TaskDrawerWeightProps {
  task: ITaskViewModel | null;
}

const TaskDrawerWeight = ({ task }: TaskDrawerWeightProps) => {
  const { t } = useTranslation('task-progress');
  const [weight, setWeight] = useState<number>(task?.weight || 1);
  const [isSubtask, setIsSubtask] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Get the current project to check if weighted progress is enabled
  const { project: currentProject } = useAppSelector(state => state.projectReducer);
  const useWeightedProgress = currentProject?.use_weighted_progress || false;

  useEffect(() => {
    setWeight(task?.weight || 1);
    setIsSubtask(!!task?.parent_task_id);
  }, [task]);

  // Always show the input field even if not a subtask or weighted progress is disabled
  // The form item itself will handle visibility based on parent

  const handleWeightChange = async (value: number | null) => {
    if (!task?.id || !value) return;

    const newWeight = Math.max(1, Math.round(value || 1));
    if (newWeight === weight) return;

    setSaving(true);
    try {
      await taskProgressService.updateTaskWeight(task.id, newWeight);
      setWeight(newWeight);
    } finally {
      setSaving(false);
    }
  };

  // Always render the component, even if not a subtask
  return (
    <InputNumber
      min={1}
      max={100}
      value={weight}
      onChange={handleWeightChange}
      disabled={saving || !useWeightedProgress || !isSubtask}
      style={{ width: '100%' }}
    />
  );
};

export default TaskDrawerWeight;
