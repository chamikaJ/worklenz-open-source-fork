import { PlusCircleOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ColorPicker,
  DatePicker,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  InputRef,
  message,
  Select,
  SelectProps,
  Spin,
  Typography,
  theme,
} from 'antd';
import { useRef, useState, useEffect } from 'react';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { nanoid } from '@reduxjs/toolkit';
import { createProject } from '@/features/projects/projectsSlice';
import { toggleProjectModal } from '@/features/project/project-modal.slice';
import { IProjectViewModel } from '@/types/project/projectViewModel.types';
import { useTranslation } from 'react-i18next';
import { clientsApiService } from '@/api/clients/clients.api.service';
import { teamMembersApiService } from '@/api/team-members/teamMembers.api.service';
import { IClientViewModel } from '@/types/client.types';
import { ITeamMemberViewModel } from '@/types/teamMembers/teamMembersGetResponse.types';

// Constants for project status, health, and colors
const projectColors = [
  '#ff4d4f', '#ff7a45', '#fa8c16', '#faad14', '#fadb14',
  '#a0d911', '#52c41a', '#13c2c2', '#1677ff', '#2f54eb',
  '#722ed1', '#eb2f96'
];

const statusData = [
  { value: 'proposed', label: 'Proposed', icon: '📝' },
  { value: 'planning', label: 'Planning', icon: '🗓️' },
  { value: 'inProgress', label: 'In Progress', icon: '⏳' },
  { value: 'completed', label: 'Completed', icon: '✅' },
  { value: 'onHold', label: 'On Hold', icon: '⏸️' }
];

const healthStatusData = [
  { value: 'notSet', label: 'Not Set', color: '#d9d9d9' },
  { value: 'onTrack', label: 'On Track', color: '#52c41a' },
  { value: 'atRisk', label: 'At Risk', color: '#faad14' },
  { value: 'offTrack', label: 'Off Track', color: '#ff4d4f' }
];

interface CategoryType {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
}

type ProjectFormTabProps = {
  projectName: string;
  setProjectName: (projectName: string) => void;
};

const ProjectFormTab = ({
  projectName,
  setProjectName,
}: ProjectFormTabProps) => {
  // localization
  const { t } = useTranslation('create-project-modal');
  const { token } = theme.useToken();

  // get currently active team data from team reducer and find the active team
  const teamData = useAppSelector(
    (state) => state.teamReducer.teamsList
  );
  const currentlyActiveTeamData = teamData.length > 0 ? teamData[0] : null;

  // get categories list from categories reducer
  const categoriesList = useAppSelector(
    (state) => state.categoriesReducer.categoriesList || []
  );

  // state for show category add input box
  const [isAddCategoryInputShow, setIsAddCategoryInputShow] = useState<boolean>(false);
  const [categoryText, setCategoryText] = useState<string>('');

  // state for team members and clients
  const [teamMembers, setTeamMembers] = useState<ITeamMemberViewModel[]>([]);
  const [clients, setClients] = useState<IClientViewModel[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);

  const dispatch = useAppDispatch();

  const [form] = Form.useForm();

  // Theme-aware styles
  const cardStyle = {
    background: token.colorBgElevated,
    marginBottom: token.marginXS,
    marginLeft: token.marginXS,
  };

  const cardHeaderStyle = {
    paddingLeft: 24,
    paddingRight: 24,
    borderBottom: `1px solid ${token.colorBorderSecondary}`
  };

  const cardBodyStyle = {
    padding: '16px 24px'
  };

  // Fetch team members and clients on component mount
  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        setLoadingMembers(true);
        const response = await teamMembersApiService.get(1, 100, 'name', 'asc', null);
        if (response.done && response.body) {
          setTeamMembers(response.body.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch team members:', error);
      } finally {
        setLoadingMembers(false);
      }
    };

    const fetchClients = async () => {
      try {
        setLoadingClients(true);
        const response = await clientsApiService.getClients(1, 100, 'name', 'asc', null);
        if (response.done && response.body) {
          setClients(response.body.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch clients:', error);
      } finally {
        setLoadingClients(false);
      }
    };

    fetchTeamMembers();
    fetchClients();
  }, []);

  // function for handle form submit
  const handleFormSubmit = (values: any) => {
    if (projectName === '') {
      message.error(t('projectNameRequiredMessage'));
      return;
    }

    const newProject: Partial<IProjectViewModel> = {
      name: projectName,
      color_code: values.color,
      status_id: values.status,
      health_id: values.health,
      category_id: values.category,
      notes: values.notes,
      client_name: values.client,
      project_manager_id: values.projectManager,
      key: values.key,
      working_days: values.estWorkingDays,
      man_days: values.estManDays,
      hours_per_day: values.hrsPerDay
    };
    
    dispatch(createProject(newProject as IProjectViewModel));
    form.resetFields();
    setProjectName('');
    console.log('newProject', newProject);
    dispatch(toggleProjectModal());
  };

  // status selection options
  const statusOptions = [
    ...statusData.map((status: { value: string, label: string, icon: string }, index: number) => ({
      key: index,
      value: status.value,
      label: (
        <Typography.Text
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {status.icon}
          {status.label}
        </Typography.Text>
      ),
    })),
  ];

  // health selection options
  const healthOptions = [
    ...healthStatusData.map((status: { value: string, label: string, color: string }, index: number) => ({
      key: index,
      value: status.value,
      label: (
        <Typography.Text
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Badge color={status.color} /> {status.label}
        </Typography.Text>
      ),
    })),
  ];

  // project color options
  const projectColorOptions = [
    ...projectColors.map((color: string, index: number) => ({
      key: index,
      value: color,
      label: (
        <div
          style={{
            width: 120,
            height: 24,
            backgroundColor: color,
          }}
        ></div>
      ),
    })),
  ];

  // Team Member options for Select
  const teamMemberOptions: SelectProps['options'] = teamMembers.map(member => ({
    value: member.id,
    label: (
      <Flex align="center" gap={8}>
        <Avatar size="small" icon={<UserOutlined />} />
        <Typography.Text>{member.name}</Typography.Text>
      </Flex>
    )
  }));

  // Client options for Select
  const clientOptions: SelectProps['options'] = clients.map(client => ({
    value: client.id,
    label: client.name
  }));

  // category input ref
  const categoryInputRef = useRef<InputRef>(null);

  const handleCategoryInputFocus = (open: boolean) => {
    setTimeout(() => {
      categoryInputRef.current?.focus();
    }, 0);
  };

  // show input to add new category
  const handleShowAddCategoryInput = () => {
    setIsAddCategoryInputShow(true);
    handleCategoryInputFocus(true);
  };

  // function to handle category add
  const handleAddCategoryItem = (category: string) => {
    const newCategory: CategoryType = {
      categoryId: nanoid(),
      categoryName: category,
      categoryColor: '#ee87c5',
    };

    // Replace with appropriate action if available
    // dispatch(addCategory(newCategory));
    setCategoryText('');
    setIsAddCategoryInputShow(false);
  };

  return (
    <>
      <div style={{ height: '100%', overflowY: 'auto', paddingRight: 8 }}>
        <Form
          form={form}
          layout="horizontal"
          onFinish={handleFormSubmit}
          initialValues={{
            color: projectColors[0],
            status: 'proposed',
            health: 'notSet',
            client: undefined,
            projectManager: undefined,
            estWorkingDays: 0,
            estManDays: 0,
            hrsPerDay: 8,
          }}
        >
          <Flex gap={16} vertical style={{ maxWidth: 700, margin: '0 auto' }}>
            {/* Project Identity Section */}
            <Card 
              title={<Typography.Text strong>{t('projectIdentity')}</Typography.Text>}
              size="small"
              variant="borderless"
              style={cardStyle}
              headStyle={cardHeaderStyle}
              bodyStyle={cardBodyStyle}
            >
              <Flex vertical gap={24}>
                {/* Key and Color */}
                <Form.Item
                  name="key"
                  label={t('keyLabel')}
                  rules={[
                    {
                      required: true,
                      message: t('keyRequiredMessage'),
                    },
                  ]}
                  style={{ marginBottom: 16 }}
                >
                  <Input placeholder={t('examplePlaceholder')} style={{ maxWidth: 500 }} />
                </Form.Item>
                
                <Form.Item
                  name="color"
                  label={t('projectColorLabel')}
                  style={{ marginBottom: 16 }}
                >
                  <ColorPicker defaultValue="#1677ff" />
                </Form.Item>

                {/* Category */}
                <Form.Item
                  name="category"
                  label={
                    <Flex gap={4}>
                      <Typography.Text>{t('categoryLabel')}</Typography.Text>
                      <Typography.Text type="secondary">
                        ({t('optional')})
                      </Typography.Text>
                    </Flex>
                  }
                  style={{ marginBottom: 16 }}
                >
                  {!isAddCategoryInputShow ? (
                    <Select
                      options={categoriesList}
                      placeholder={t('categoryPlaceholder')}
                      style={{ maxWidth: 500 }}
                      dropdownRender={(menu) => (
                        <>
                          {menu}
                          <Divider style={{ margin: '8px 0' }} />
                          <Button
                            style={{ width: '100%' }}
                            type="text"
                            icon={<PlusOutlined />}
                            onClick={handleShowAddCategoryInput}
                          >
                            {t('newCategoryButton')}
                          </Button>
                        </>
                      )}
                    />
                  ) : (
                    <Flex vertical gap={4} style={{ maxWidth: 500 }}>
                      <Input
                        ref={categoryInputRef}
                        placeholder={t('newCategoryPlaceholder')}
                        value={categoryText}
                        onChange={(e) => setCategoryText(e.currentTarget.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && handleAddCategoryItem(categoryText)
                        }
                      />
                      <Typography.Text type="secondary">
                        {t('createCategoryHintText')}
                      </Typography.Text>
                    </Flex>
                  )}
                </Form.Item>
                
                {/* Project Manager */}
                <Form.Item
                  name="projectManager"
                  label={t('projectManagerLabel')}
                  style={{ marginBottom: 16 }}
                >
                  <Select
                    placeholder={t('selectProjectManager')}
                    options={teamMemberOptions}
                    loading={loadingMembers}
                    showSearch
                    style={{ maxWidth: 500 }}
                    filterOption={(input, option) => 
                      (option?.label as any)?.props?.children[1]?.props?.children?.toLowerCase().includes(input.toLowerCase())
                    }
                    notFoundContent={loadingMembers ? <Spin size="small" /> : null}
                  />
                </Form.Item>

                {/* Client */}
                <Form.Item
                  name="client"
                  label={t('clientLabel')}
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    placeholder={t('clientPlaceholder')}
                    options={clientOptions}
                    loading={loadingClients}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    notFoundContent={loadingClients ? <Spin size="small" /> : null}
                    dropdownRender={(menu) => (
                      <>
                        {menu}
                        <Divider style={{ margin: '8px 0' }} />
                        <Button 
                          type="text"
                          icon={<PlusOutlined />}
                          style={{ width: '100%' }}
                          onClick={() => {
                            // Here you would open a client creation modal or redirect
                            message.info("Client creation functionality to be implemented");
                          }}
                        >
                          {t('addNewClient')}
                        </Button>
                      </>
                    )}
                  />
                </Form.Item>
              </Flex>
            </Card>

            {/* Project Status Section */}
            <Card 
              title={<Typography.Text strong>{t('projectStatus')}</Typography.Text>} 
              size="small"
              variant="borderless"
              style={cardStyle}
              headStyle={cardHeaderStyle}
              bodyStyle={cardBodyStyle}
            >
              <Flex vertical gap={16}>
                <Form.Item
                  name="status"
                  label={t('statusLabel')}
                  style={{ marginBottom: 16 }}
                >
                  <Select options={statusOptions} style={{ maxWidth: 500 }} />
                </Form.Item>
                
                <Form.Item
                  name="health"
                  label={t('healthLabel')}
                  style={{ marginBottom: 0 }}
                >
                  <Select options={healthOptions} style={{ maxWidth: 500 }} />
                </Form.Item>
              </Flex>
            </Card>

            {/* Project Timeline Section */}
            <Card 
              title={<Typography.Text strong>{t('projectTimeline')}</Typography.Text>} 
              size="small"
              variant="borderless"
              style={cardStyle}
              headStyle={cardHeaderStyle}
              bodyStyle={cardBodyStyle}
            >
              <Flex vertical gap={16}>
                <Form.Item 
                  name="startDate" 
                  label={t('startDateLabel')}
                  style={{ marginBottom: 16 }}
                >
                  <DatePicker style={{ maxWidth: 500 }} />
                </Form.Item>
                <Form.Item 
                  name="endDate" 
                  label={t('endDateLabel')}
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker style={{ maxWidth: 500 }} />
                </Form.Item>
              </Flex>
            </Card>

            {/* Project Estimation Section */}
            <Card 
              title={<Typography.Text strong>{t('projectEstimation')}</Typography.Text>} 
              size="small"
              variant="borderless"
              style={cardStyle}
              headStyle={cardHeaderStyle}
              bodyStyle={cardBodyStyle}
            >
              <Flex vertical gap={16}>
                <Form.Item
                  name="estWorkingDays"
                  label={t('estimatedWorkingDaysLabel')}
                  style={{ marginBottom: 16 }}
                >
                  <InputNumber
                    min={0}
                    defaultValue={0}
                    style={{ maxWidth: 500 }}
                  />
                </Form.Item>
                
                <Form.Item 
                  name="estManDays" 
                  label={t('estimatedManDaysLabel')}
                  style={{ marginBottom: 16 }}
                >
                  <InputNumber
                    min={0}
                    defaultValue={0}
                    style={{ maxWidth: 500 }}
                  />
                </Form.Item>
                
                <Form.Item 
                  name="hrsPerDay" 
                  label={t('hoursPerDayLabel')}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber
                    min={0}
                    max={24}
                    defaultValue={8}
                    style={{ maxWidth: 500 }}
                  />
                </Form.Item>
              </Flex>
            </Card>

            {/* Additional Information Section */}
            <Card 
              title={<Typography.Text strong>{t('additionalInformation')}</Typography.Text>} 
              size="small"
              variant="borderless"
              style={cardStyle}
              headStyle={cardHeaderStyle}
              bodyStyle={cardBodyStyle}
            >
              <Form.Item
                name="notes"
                label={t('notesLabel')}
                style={{ marginBottom: 0 }}
              >
                <Input.TextArea placeholder={t('notesPlaceholder')} rows={3} style={{ maxWidth: 500 }} />
              </Form.Item>
            </Card>
          </Flex>
        </Form>
      </div>

      {/* footer  */}
      <Divider style={{ marginBlock: 16 }} />
      <Flex justify="flex-end">
        <Button type="primary" onClick={form.submit}>
          {t('createButton')}
        </Button>
      </Flex>
    </>
  );
};

export default ProjectFormTab;