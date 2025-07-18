import { Card, Flex, message, Typography, Upload, UploadProps, Button, Spin } from 'antd';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import { profileSettingsApiService } from '../../../api/settings/profile/profile-settings.api.service';

const ClientPortalSettings = () => {
  // localization
  const { t } = useTranslation('client-portal-settings');
  
  // State for custom logo
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Load client portal settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);
  
  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await profileSettingsApiService.getClientPortalSettings();
      if (response.success && response.body?.logo_url) {
        setCustomLogo(response.body.logo_url);
      }
    } catch (error) {
      console.error('Failed to load client portal settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    // Validate file type
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('You can only upload image files!');
      return false;
    }
    
    // Validate file size (max 2MB)
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error('Image must be smaller than 2MB!');
      return false;
    }
    
    try {
      setUploading(true);
      
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64String = e.target?.result as string;
          
          // Upload to backend
          const response = await profileSettingsApiService.uploadClientPortalLogo(base64String);
          
          if (response.success && response.body?.logo_url) {
            setCustomLogo(response.body.logo_url);
            setLogoFile(file);
            message.success(`${file.name} uploaded successfully!`);
          } else {
            message.error('Failed to upload logo');
          }
        } catch (error) {
          console.error('Logo upload error:', error);
          message.error('Failed to upload logo');
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setUploading(false);
      message.error('Failed to upload logo');
    }
    
    return false; // Prevent default upload
  };
  
  const handleRemoveLogo = async () => {
    try {
      setUploading(true);
      
      // Update settings with null logo_url
      const response = await profileSettingsApiService.updateClientPortalSettings({
        logo_url: null
      });
      
      if (response.success) {
        setCustomLogo(null);
        setLogoFile(null);
        message.success('Custom logo removed successfully!');
      } else {
        message.error('Failed to remove logo');
      }
    } catch (error) {
      console.error('Failed to remove logo:', error);
      message.error('Failed to remove logo');
    } finally {
      setUploading(false);
    }
  };
  
  const props: UploadProps = {
    name: 'file',
    multiple: false,
    accept: 'image/*',
    beforeUpload: handleLogoUpload,
    showUploadList: false,
    onDrop(e) {
      console.log('Dropped files', e.dataTransfer.files);
    },
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ height: 'calc(100vh - 200px)' }}>
        <Spin size="large" />
      </Flex>
    );
  }

  return (
    <Flex vertical gap={24} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" style={{ width: '100%' }}>
        <Typography.Title level={5}>{t('title')}</Typography.Title>
      </Flex>

      <Card style={{ height: 'calc(100vh - 280px)' }}>
        <Flex vertical gap={48}>
          {customLogo && (
            <Flex vertical gap={12}>
              <Typography.Text>{t('currentLogoText')}</Typography.Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <img
                  src={customLogo}
                  alt="company logo"
                  style={{ maxWidth: 180, maxHeight: 100, objectFit: 'contain' }}
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleRemoveLogo}
                  title="Remove custom logo"
                >
                  Remove
                </Button>
              </div>
            </Flex>
          )}
          <Upload.Dragger {...props} style={{ maxWidth: 450 }}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">{t('uploadLogoText')}</p>
            <p className="ant-upload-hint">{t('uploadLogoAltText')}</p>
          </Upload.Dragger>
        </Flex>
      </Card>
    </Flex>
  );
};

export default ClientPortalSettings;
