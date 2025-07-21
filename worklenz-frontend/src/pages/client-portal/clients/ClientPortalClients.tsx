import {
  Button,
  Flex,
  Typography,
  Card,
  Statistic,
  Spin,
  Row,
  Col,
  Input,
  message,
  Space,
  Alert,
} from '@/shared/antd-imports';
import { PlusOutlined, UserOutlined, TeamOutlined, ProjectOutlined, CopyOutlined, ReloadOutlined, LinkOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { toggleAddClientDrawer } from '@/features/clients-portal/clients/clients-slice';
import { useGetClientsQuery, useGenerateClientInvitationLinkMutation } from '@/api/client-portal/client-portal-api';
import ClientsTable from './ClientsTable';
import AddClientDrawer from '@/components/client-portal/AddClientDrawer';
import EditClientDrawer from '@/components/client-portal/EditClientDrawer';
import ClientDetailsDrawer from '@/components/client-portal/ClientDetailsDrawer';
import ClientTeamsDrawer from '@/components/client-portal/ClientTeamsDrawer';
import ClientSettingsDrawer from '@/components/client-portal/ClientSettingsDrawer';
import { useResponsive } from '@/hooks/useResponsive';
import { createPortal } from 'react-dom';
import React from 'react';

const { Title } = Typography;

const ClientPortalClients = () => {
  const { t } = useTranslation('client-portal-clients');
  const dispatch = useAppDispatch();
  const { isMobile, isTablet, isDesktop } = useResponsive();
  
  // State for organization invite link
  const [orgInviteLink, setOrgInviteLink] = React.useState<string>('');
  const [linkExpiry, setLinkExpiry] = React.useState<string>('');
  
  // RTK Query for generating organization invite link
  const [generateOrgInviteLink, { isLoading: isGeneratingLink }] = useGenerateClientInvitationLinkMutation();

  // RTK Query hook for clients data
  const {
    data: clientsData,
    isLoading,
    error,
  } = useGetClientsQuery({
    page: 1,
    limit: 1000, // Get all clients for stats
  });

  const handleAddClient = () => {
    dispatch(toggleAddClientDrawer());
  };
  
  // Generate organization invite link
  const handleGenerateOrgInviteLink = async () => {
    try {
      // Use a placeholder clientId - the backend should generate organization-level invite
      const response = await generateOrgInviteLink({ clientId: 'organization' }).unwrap();
      setOrgInviteLink(response.invitationLink);
      setLinkExpiry(response.expiresAt);
      message.success('Organization invite link generated successfully!');
    } catch (error) {
      console.error('Failed to generate organization invite link:', error);
      message.error('Failed to generate organization invite link');
    }
  };
  
  // Copy invite link to clipboard
  const handleCopyInviteLink = () => {
    if (orgInviteLink) {
      navigator.clipboard.writeText(orgInviteLink);
      message.success('Invite link copied to clipboard!');
    }
  };
  
  // Format expiry date
  const formatExpiryDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
  };

  // Calculate statistics - properly access the nested structure
  const totalClients = clientsData?.body?.total || 0;
  const activeClients =
    clientsData?.body?.clients?.filter((client: any) => client.status === 'active').length || 0;
  const totalProjects =
    clientsData?.body?.clients?.reduce(
      (sum: number, client: any) => sum + (client.assigned_projects_count || 0),
      0
    ) || 0;
  const totalTeamMembers =
    clientsData?.body?.clients?.reduce(
      (sum: number, client: any) => sum + (client.team_members?.length || 0),
      0
    ) || 0;

  return (
    <div
      style={{
        maxWidth: '100%',
        minHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: isDesktop ? 32 : 24 }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Title
              level={isDesktop ? 2 : 3}
              style={{
                margin: 0,
                marginBottom: 8,
                fontSize: isDesktop ? '28px' : '24px',
              }}
            >
              {t('pageTitle') || 'Clients'}
            </Title>
            <Typography.Text
              type="secondary"
              style={{
                fontSize: isDesktop ? '16px' : '14px',
                lineHeight: 1.5,
              }}
            >
              {t('pageDescription') || 'Manage your clients and their access to the portal'}
            </Typography.Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddClient}
          >
            {t('addClientButton') || 'Add Client'}
          </Button>
        </Flex>
      </div>

      {/* Organization Invite Link Section */}
      <Card
        title={
          <Flex align="center" gap={8}>
            <LinkOutlined />
            <span>{t('organizationInviteLinkTitle') || 'Organization Invite Link'}</span>
          </Flex>
        }
        style={{
          marginBottom: isDesktop ? 32 : 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleGenerateOrgInviteLink}
              loading={isGeneratingLink}
              size={isMobile ? 'small' : 'middle'}
            >
              {orgInviteLink ? (t('regenerateLink') || 'Regenerate') : (t('generateLink') || 'Generate Link')}
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
            {t('organizationInviteLinkDescription') || 'Share this link with clients to allow them to join your organization\'s client portal. The link expires after 7 days for security.'}
          </Typography.Text>
        </div>
        
        {orgInviteLink ? (
          <>
            <Flex gap={8} align="center" style={{ marginBottom: 12 }}>
              <Input
                value={orgInviteLink}
                readOnly
                size="large"
                style={{ flex: 1 }}
              />
              <Button
                icon={<CopyOutlined />}
                onClick={handleCopyInviteLink}
                size="large"
              >
                {t('copyButton') || 'Copy'}
              </Button>
            </Flex>
            {linkExpiry && (
              <Alert
                message={`${t('linkExpiresAt') || 'Link expires at'}: ${formatExpiryDate(linkExpiry)}`}
                type="info"
                showIcon
                style={{ fontSize: '12px' }}
              />
            )}
          </>
        ) : (
          <Alert
            message={t('noInviteLinkGenerated') || 'No invite link generated yet. Click "Generate Link" to create one.'}
            type="warning"
            showIcon
          />
        )}
      </Card>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: isDesktop ? 32 : 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              height: '100%',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <Statistic
              title={t('totalClientsLabel') || 'Total Clients'}
              value={totalClients}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1890ff', fontSize: isDesktop ? '24px' : '20px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              height: '100%',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <Statistic
              title={t('activeClientsLabel') || 'Active Clients'}
              value={activeClients}
              valueStyle={{ color: '#3f8600', fontSize: isDesktop ? '24px' : '20px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              height: '100%',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <Statistic
              title={t('totalProjectsLabel') || 'Total Projects'}
              value={totalProjects}
              prefix={<ProjectOutlined />}
              valueStyle={{ color: '#722ed1', fontSize: isDesktop ? '24px' : '20px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              height: '100%',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <Statistic
              title={t('totalTeamMembersLabel') || 'Team Members'}
              value={totalTeamMembers}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#eb2f96', fontSize: isDesktop ? '24px' : '20px' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Clients Table */}
      <Card
        style={{
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderRadius: 8,
        }}
      >
        <Spin spinning={isLoading}>
          <ClientsTable />
        </Spin>
      </Card>

      {/* Drawers */}
      {createPortal(<AddClientDrawer />, document.body)}
      {createPortal(<EditClientDrawer />, document.body)}
      {createPortal(<ClientDetailsDrawer />, document.body)}
      {createPortal(<ClientTeamsDrawer />, document.body)}
      {createPortal(<ClientSettingsDrawer />, document.body)}
    </div>
  );
};

export default ClientPortalClients;
