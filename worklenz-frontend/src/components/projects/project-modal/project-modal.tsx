import {
  Badge,
  Card,
  Col,
  Divider,
  Flex,
  Input,
  Modal,
  Radio,
  RadioChangeEvent,
  Row,
  Space,
  Tabs,
  Typography,
  theme,
} from 'antd';
import { TabsProps } from 'antd/lib';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseOutlined } from '@ant-design/icons';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { toggleProjectModal } from '@/features/project/project-modal.slice';
import { saveToLocalStorage } from '@/utils/localStorageFunctions';

import DefaultTemplateTab from './default-template-tab';
import MyTemplateTab from './my-template-tab';
import ProjectFormTab from './project-form-tab';

const CreateProjectModal = () => {
  const [projectName, setProjectName] = useState<string>('');
  const [defaultView, setDefaultView] = useState<'taskList' | 'board'>('taskList');
  const { token } = theme.useToken();

  // localization
  const { t } = useTranslation('create-project-modal');

  // get the project modal open state from project slice
  const isProjectModalOpen = useAppSelector(state => state.projectModalReducer.isProjectModalOpen);

  const dispatch = useAppDispatch();

  const items: TabsProps['items'] = [
    {
      key: 'fromScratch',
      label: t('fromScratch'),
      children: <ProjectFormTab projectName={projectName} setProjectName={setProjectName} />,
    },
    {
      key: 'defaultTemplates',
      label: t('defaultTemplates'),
      children: <DefaultTemplateTab />,
    },
    {
      key: 'myTemplates',
      label: t('myTemplates'),
      children: <MyTemplateTab />,
    },
  ];

  // function to handle view change
  const onViewChange = (e: RadioChangeEvent) => {
    setDefaultView(e.target.value);
  };

  // if view changed, update the state
  useEffect(() => {
    if (defaultView === 'taskList') {
      saveToLocalStorage('pinnedTab', 'taskList');
    } else {
      saveToLocalStorage('pinnedTab', 'board');
    }
  }, [defaultView]);

  // function to close modal
  const handleCloseModal = () => {
    dispatch(toggleProjectModal());
  };

  // Card styles for consistent appearance
  const cardHeaderStyle = {
    paddingLeft: 24,
    paddingRight: 24,
    borderBottom: `1px solid ${token.colorBorderSecondary}`,
  };

  const cardBodyStyle = {
    padding: '16px 24px',
  };

  return (
    <>
      <Modal
        open={isProjectModalOpen}
        onCancel={handleCloseModal}
        title={
          <Flex align="center" justify="space-between" style={{ marginInline: 48 }}>
            <Typography.Title level={5} style={{ marginBlock: 0 }}>
              {t('createProject')}{' '}
            </Typography.Title>

            <CloseOutlined onClick={handleCloseModal} />
          </Flex>
        }
        style={{ top: 20 }}
        width={'75%'}
        closeIcon={null}
        footer={null}
        bodyStyle={{
          height: 'calc(100vh - 180px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Divider style={{ marginBlockStart: 12, marginBottom: 16 }} />

        {/* Project Basic Information Section */}
        <Card
          title={<Typography.Text strong>{t('basicInformation')}</Typography.Text>}
          variant="borderless"
          style={{ marginBottom: 16 }}
          headStyle={cardHeaderStyle}
          bodyStyle={cardBodyStyle}
        >
          <Row gutter={24}>
            <Col span={16}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text type="secondary">{t('projectName')}</Typography.Text>
                <Input
                  placeholder={t('projectName')}
                  style={{ paddingBlock: 12 }}
                  value={projectName}
                  onChange={e => setProjectName(e.currentTarget.value)}
                  required
                />
              </Space>
            </Col>
            <Col span={8}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text>{t('defaultView')}</Typography.Text>
                <Radio.Group
                  name="radiogroup"
                  defaultValue={'taskList'}
                  onChange={onViewChange}
                  options={[
                    { value: 'taskList', label: t('taskList') },
                    { value: 'board', label: t('kanbanBoard') },
                  ]}
                />
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Project Creation Options */}
        <Card
          title={<Typography.Text strong>{t('projectCreationOptions')}</Typography.Text>}
          variant="borderless"
          bodyStyle={{ padding: '0', flex: 1, overflow: 'hidden' }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          headStyle={cardHeaderStyle}
        >
          <Tabs
            defaultActiveKey="fromScratch"
            items={items}
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
            tabBarStyle={{ padding: '0 16px' }}
            className="project-creation-tabs"
          />
        </Card>
      </Modal>

      <style>
        {`
          .project-creation-tabs .ant-tabs-content {
            height: 100%;
            overflow: hidden;
          }
          .project-creation-tabs .ant-tabs-tabpane {
            height: 100%;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .project-creation-tabs .ant-tabs-content-holder {
            flex: 1;
            overflow: hidden;
          }
          .project-creation-tabs .ant-tabs-nav {
            padding-left: 8px;
          }
        `}
      </style>
    </>
  );
};

export default CreateProjectModal;
