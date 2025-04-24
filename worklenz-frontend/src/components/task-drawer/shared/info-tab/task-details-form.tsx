import { useEffect, useState } from 'react';
import {
  Form,
  InputNumber,
  Select,
  DatePicker,
  Switch,
  Typography,
  Button,
  ConfigProvider,
  Flex,
  Tooltip,
} from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/colors';
import { ITaskFormViewModel, ITaskViewModel } from '@/types/tasks/task.types';
import { IProjectTask } from '@/types/project/projectTasksViewModel.types';
import { simpleDateFormat } from '@/utils/simpleDateFormat';
import { useAppSelector } from '@/hooks/useAppSelector';
import taskProgressService from '@/services/tasks/task-progress.service';

import NotifyMemberSelector from './notify-member-selector';
import TaskDrawerPhaseSelector from './details/task-drawer-phase-selector/task-drawer-phase-selector';
import TaskDrawerKey from './details/task-drawer-key/task-drawer-key';
import TaskDrawerLabels from './details/task-drawer-labels/task-drawer-labels';
import TaskDrawerAssigneeSelector from './details/task-drawer-assignee-selector/task-drawer-assignee-selector';
import Avatars from '@/components/avatars/avatars';
import TaskDrawerDueDate from './details/task-drawer-due-date/task-drawer-due-date';
import TaskDrawerEstimation from './details/task-drawer-estimation/task-drawer-estimation';
import TaskDrawerPrioritySelector from './details/task-drawer-priority-selector/task-drawer-priority-selector';
import TaskDrawerBillable from './details/task-drawer-billable/task-drawer-billable';

// Import the type extension for ITaskViewModel
import '@/types/tasks/task-extensions.d';

interface TaskDetailsFormProps {
  taskFormViewModel?: ITaskFormViewModel | null;
}

const TaskDetailsForm = ({ taskFormViewModel = null }: TaskDetailsFormProps) => {
  const { t } = useTranslation('task-drawer/task-drawer');
  const { t: tProgress } = useTranslation('task-progress');
  const [form] = Form.useForm();
  
  // Add state for weight value and saving status
  const [weightValue, setWeightValue] = useState<number>(
    taskFormViewModel?.task?.weight ? taskFormViewModel.task.weight * 100 : 10
  );
  const [savingWeight, setSavingWeight] = useState<boolean>(false);
  
  // Get the current project to check if weighted progress is enabled
  const { project: currentProject } = useAppSelector((state: any) => state.projectReducer);
  const useWeightedProgress = currentProject?.use_weighted_progress || false;

  useEffect(() => {
    if (!taskFormViewModel) {
      form.resetFields();
      return;
    }

    const { task } = taskFormViewModel;
    
    // Update the weight value state when task changes (convert from decimal to percentage)
    setWeightValue(task?.weight ? task.weight * 100 : 10);
    
    form.setFieldsValue({
      taskId: task?.id,
      phase: task?.phase_id,
      assignees: task?.assignees,
      dueDate: task?.end_date ?? null,
      hours: task?.total_hours || 0,
      minutes: task?.total_minutes || 0,
      priority: task?.priority || 'medium',
      labels: task?.labels || [],
      billable: task?.billable || false,
      notify: [],
      weight: task?.weight ? task.weight * 100 : 10,
    });
  }, [taskFormViewModel, form]);

  const priorityMenuItems = taskFormViewModel?.priorities?.map(priority => ({
    key: priority.id,
    value: priority.id,
    label: priority.name,
  }));

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      console.log('task details form values', values);
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };
  
  // Handle weight value changes
  const handleWeightChange = async (value: number | null) => {
    if (!taskFormViewModel?.task?.id || value === null) return;
    
    // Limit weight to between 10% and 100%
    const newPercentage = Math.min(100, Math.max(10, value));
    setWeightValue(newPercentage);
    
    // Update the form field value
    form.setFieldsValue({ weight: newPercentage });
    
    // Save to server (convert percentage to decimal)
    setSavingWeight(true);
    try {
      await taskProgressService.updateTaskWeight(
        taskFormViewModel.task.id,
        newPercentage / 100
      );
    } finally {
      setSavingWeight(false);
    }
  };

  return (
    <ConfigProvider
      theme={{
        components: {
          Form: { itemMarginBottom: 8 },
        },
      }}
    >
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        initialValues={{
          priority: 'medium',
          hours: 0,
          minutes: 0,
          billable: false,
          weight: weightValue,
        }}
        onFinish={handleSubmit}
      >
        <TaskDrawerKey
          taskKey={taskFormViewModel?.task?.task_key || 'NEW-TASK'}
          label={t('taskInfoTab.details.task-key')}
        />
        <TaskDrawerPhaseSelector
          phases={taskFormViewModel?.phases || []}
          task={taskFormViewModel?.task as ITaskViewModel}
        />

        <Form.Item name="assignees" label={t('taskInfoTab.details.assignees')}>
          <Flex gap={4} align="center">
            <Avatars members={taskFormViewModel?.task?.names || []} />
            <TaskDrawerAssigneeSelector
              task={(taskFormViewModel?.task as ITaskViewModel) || null}
            />
          </Flex>
        </Form.Item>

        <TaskDrawerDueDate task={taskFormViewModel?.task as ITaskViewModel} t={t} form={form} />

        <TaskDrawerEstimation t={t} task={taskFormViewModel?.task as ITaskViewModel} form={form} />

        <Form.Item name="priority" label={t('taskInfoTab.details.priority')}>
          <TaskDrawerPrioritySelector task={taskFormViewModel?.task as ITaskViewModel} />
        </Form.Item>

        <TaskDrawerLabels task={taskFormViewModel?.task as ITaskViewModel} t={t} />

        <Form.Item name="billable" label={t('taskInfoTab.details.billable')}>
          <TaskDrawerBillable task={taskFormViewModel?.task as ITaskViewModel} />
        </Form.Item>

        <Form.Item name="notify" label={t('taskInfoTab.details.notify')}>
          <NotifyMemberSelector task={taskFormViewModel?.task as ITaskViewModel} t={t} />
        </Form.Item>

        {/* Task Weight Input with State Management */}
        <Form.Item 
          name="weight" 
          label={t('taskInfoTab.details.weight')}
          tooltip={{
            title: tProgress('taskWeightTooltip'),
            icon: <QuestionCircleOutlined />,
          }}
        >
          <InputNumber
            min={10}
            max={100}
            step={10}
            precision={0}
            value={weightValue}
            onChange={handleWeightChange}
            style={{ width: '100%' }}
            formatter={value => `${value}%`}
            parser={value => Number.parseFloat(value?.replace('%', '') || '0')}
          />
        </Form.Item>
      </Form>
    </ConfigProvider>
  );
};

export default TaskDetailsForm;
