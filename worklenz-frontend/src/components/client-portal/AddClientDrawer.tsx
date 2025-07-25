import { Button, Drawer, Flex, Form, Input, message, Typography, Select, Spin } from 'antd';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useTranslation } from 'react-i18next';
import { toggleAddClientDrawer } from '../../features/clients-portal/clients/clients-slice';
import { useCreateClientMutation } from '../../api/client-portal/client-portal-api';
import { CopyOutlined } from '@ant-design/icons';

const { Option } = Select;

const AddClientDrawer = () => {
  // localization
  const { t } = useTranslation('client-portal-clients');

  // get drawer state from client reducer
  const isDrawerOpen = useAppSelector(
    (state) => state.clientsPortalReducer.clientsReducer.isAddClientDrawerOpen
  );
  
  const dispatch = useAppDispatch();

  // RTK Query hook
  const [createClient, { isLoading }] = useCreateClientMutation();

  const [form] = Form.useForm();

  // this function for handle form submit
  const handleFormSubmit = async (values: any) => {
    try {
      await createClient({
        name: values.name,
        email: values.email,
        company_name: values.company_name,
        phone: values.phone,
        address: values.address,
      }).unwrap();
      
      form.resetFields();
      
      // Show success message with invitation info
      const successMessage = values.email 
        ? t('createClientSuccessMessageWithInvite') || `Client created successfully! Invitation sent to ${values.email}`
        : t('createClientSuccessMessage') || 'Client created successfully';
      
      message.success(successMessage);
      dispatch(toggleAddClientDrawer());
    } catch (error: any) {
      message.error(error?.data?.message || t('createClientErrorMessage') || 'Failed to create client');
    }
  };

  // function to copy link to clipboard
  const copyLinkToClipboard = () => {
    const link = 'https://app.worklenz.com/worklenz/projects/10889d';
    navigator.clipboard.writeText(link);
    message.success(t('linkCopiedMessage') || 'Link copied to clipboard');
  };

  // function to handle drawer close
  const handleDrawerClose = () => {
    dispatch(toggleAddClientDrawer());
    form.resetFields();
  };

  return (
    <Drawer
      title={t('addClientTitle') || 'Add New Client'}
      placement="right"
      onClose={handleDrawerClose}
      open={isDrawerOpen}
      width={500}
      footer={
        <Flex gap={12} justify="flex-end">
          <Button onClick={handleDrawerClose}>
            {t('cancelButton') || 'Cancel'}
          </Button>
          <Button 
            type="primary" 
            onClick={() => form.submit()}
            loading={isLoading}
          >
            {t('createButton') || 'Create Client'}
          </Button>
        </Flex>
      }
    >
      <Spin spinning={isLoading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="name"
            label={t('clientNameLabel') || 'Client Name'}
            rules={[
              { required: true, message: t('clientNameRequired') || 'Please enter client name' },
              { min: 2, message: t('clientNameMinLength') || 'Name must be at least 2 characters' }
            ]}
          >
            <Input 
              placeholder={t('clientNamePlaceholder') || 'Enter client name'} 
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="email"
            label={t('emailLabel') || 'Email Address'}
            rules={[
              { required: true, message: t('emailRequired') || 'Please enter email address' },
              { type: 'email', message: t('emailInvalid') || 'Please enter a valid email address' }
            ]}
          >
            <Input 
              placeholder={t('emailPlaceholder') || 'Enter email address'} 
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="company_name"
            label={t('companyNameLabel') || 'Company Name'}
          >
            <Input 
              placeholder={t('companyNamePlaceholder') || 'Enter company name (optional)'} 
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="phone"
            label={t('phoneLabel') || 'Phone Number'}
            rules={[
              { pattern: /^[\+]?[1-9][\d]{0,15}$/, message: t('phoneInvalid') || 'Please enter a valid phone number' }
            ]}
          >
            <Input 
              placeholder={t('phonePlaceholder') || 'Enter phone number (optional)'} 
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="address"
            label={t('addressLabel') || 'Address'}
          >
            <Input.TextArea 
              placeholder={t('addressPlaceholder') || 'Enter address (optional)'} 
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="status"
            label={t('statusLabel') || 'Status'}
            initialValue="active"
          >
            <Select size="large">
              <Option value="active">{t('statusActive') || 'Active'}</Option>
              <Option value="inactive">{t('statusInactive') || 'Inactive'}</Option>
              <Option value="pending">{t('statusPending') || 'Pending'}</Option>
            </Select>
          </Form.Item>
        </Form>

        {/* Client Portal Link Section */}
        <Flex vertical gap={16} style={{ marginTop: 24 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('clientPortalAccessTitle') || 'Client Portal Access'}
          </Typography.Title>
          
          <Typography.Text type="secondary">
            {t('clientPortalAccessDescription') || 'Share this link with your client to give them access to their portal'}
          </Typography.Text>
          
          <Flex gap={8} align="center">
            <Input
              value="https://app.worklenz.com/worklenz/projects/10889d"
              readOnly
              size="large"
            />
            <Button
              icon={<CopyOutlined />}
              onClick={copyLinkToClipboard}
              size="large"
            >
              {t('copyButton') || 'Copy'}
            </Button>
          </Flex>
        </Flex>
      </Spin>
    </Drawer>
  );
};

export default AddClientDrawer;
