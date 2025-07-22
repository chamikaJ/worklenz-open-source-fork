import React from 'react';
import { Card, Typography, Flex } from 'antd';

const { Title, Paragraph } = Typography;

const SettingsPage: React.FC = () => {
  return (
    <Flex vertical gap={24} style={{ width: '100%' }}>
      <Flex vertical gap={8}>
        <Title level={1} style={{ margin: 0 }}>Settings</Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Configure your application preferences
        </Paragraph>
      </Flex>
      
      <Card style={{ height: 'calc(100vh - 248px)' }}>
        <p>Settings page coming soon...</p>
      </Card>
    </Flex>
  );
};

export default SettingsPage; 