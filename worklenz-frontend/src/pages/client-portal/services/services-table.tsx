import { Card, Table, Typography, Spin, Alert, Empty, Button } from 'antd';
import { TableProps } from 'antd/lib';
import { useTranslation } from 'react-i18next';
import ClientPortalStatusTags from '@/components/client-portal/ClientPortalStatusTags';
import { useGetServicesQuery } from '../../../api/client-portal/client-portal-api';
import { PlusOutlined } from '@ant-design/icons';

const ServicesTable = () => {
  // localization
  const { t } = useTranslation('client-portal-services');

  // Fetch services from API
  const { data: servicesData, isLoading, error } = useGetServicesQuery();

  // table columns
  const columns: TableProps['columns'] = [
    {
      key: 'name',
      title: t('nameColumn'),
      render: (record) => <Typography.Text>{record.name}</Typography.Text>,
    },
    {
      key: 'createdBy',
      title: t('createdByColumn'),
      render: (record) => (
        <Typography.Text style={{ textTransform: 'capitalize' }}>
          {record.created_by}
        </Typography.Text>
      ),
    },
    {
      key: 'status',
      title: t('statusColumn'),
      render: (record) => <ClientPortalStatusTags status={record.status} />,
    },
    {
      key: 'noOfRequests',
      title: t('noOfRequestsColumn'),
      render: (record) => (
        <Typography.Text style={{ textTransform: 'capitalize' }}>
          {record.no_of_requests}
        </Typography.Text>
      ),
    },
  ];

  // Handle loading state
  if (isLoading) {
    return (
      <Card style={{ height: 'calc(100vh - 280px)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  // Handle error state
  if (error) {
    return (
      <Card style={{ height: 'calc(100vh - 280px)' }}>
        <Alert
          message={t('errorLoadingServices')}
          description={t('errorLoadingServicesDescription')}
          type="error"
          showIcon
        />
      </Card>
    );
  }

  // Extract services from API response - backend returns IServerResponse with {total, data} structure
  const servicesResponse = (servicesData as any)?.body || { total: 0, data: [] };
  const services = servicesResponse.data || [];

  // Handle empty state
  if (!services || services.length === 0) {
    return (
      <Card style={{ height: 'calc(100vh - 280px)' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <Typography.Title level={4} style={{ marginBottom: 8 }}>
                {t('noServicesTitle')}
              </Typography.Title>
              <Typography.Text type="secondary">
                {t('noServicesDescription')}
              </Typography.Text>
            </div>
          }
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center',
            height: 'calc(100vh - 320px)'
          }}
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              // TODO: Open add service modal/drawer
              console.log('Add service clicked');
            }}
          >
            {t('addServiceButton')}
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <Card style={{ height: 'calc(100vh - 280px)' }}>
      <Table
        columns={columns}
        dataSource={services}
        pagination={{
          size: 'small',
          total: servicesResponse.total || services.length,
          current: 1, // Backend doesn't return current page info
          pageSize: 10, // Default page size
        }}
        scroll={{
          x: 'max-content',
        }}
        onRow={(record) => {
          return {
            style: { cursor: 'pointer' },
          };
        }}
      />
    </Card>
  );
};

export default ServicesTable;
