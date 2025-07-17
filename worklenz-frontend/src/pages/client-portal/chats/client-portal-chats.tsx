import { Flex, Typography, Button, Badge, Tooltip } from 'antd';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ChatBoxWrapper from './chat-container/chat-box/chat-box-wrapper';
import { MessageOutlined, ReloadOutlined } from '@ant-design/icons';
import { useGetChatsQuery } from '../../../api/client-portal/client-portal-api';
import { useAppSelector } from '../../../hooks/useAppSelector';

const ClientPortalChats = () => {
  // localization
  const { t } = useTranslation('client-portal-chats');

  // API hooks
  const { data: chats, isLoading, error, refetch } = useGetChatsQuery();
  
  // Get unread count from local state or API
  const localChatList = useAppSelector(
    (state) => state.clientsPortalReducer.chatsReducer.chatList
  );
  
  // Safely calculate unread count with comprehensive error handling
  const unreadCount = React.useMemo(() => {
    try {
      // Check if chats from API is available and is an array
      if (chats && Array.isArray(chats)) {
        return chats.reduce((total, chat) => {
          const unread = chat?.unreadCount || 0;
          return total + (typeof unread === 'number' ? unread : 0);
        }, 0);
      }
      
      // Fallback to local chat list
      if (localChatList && Array.isArray(localChatList)) {
        return localChatList.filter(chat => chat?.status === 'unread').length;
      }
      
      // Default to 0 if neither is available
      return 0;
    } catch (error) {
      console.error('Error calculating unread count:', error);
      return 0;
    }
  }, [chats, localChatList]);

  const handleRefresh = () => {
    refetch();
  };

  return (
    <Flex vertical gap={24} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" style={{ width: '100%' }}>
        <Flex align="center" gap={12}>
          <MessageOutlined style={{ fontSize: 20 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('title') || 'Messages'}
          </Typography.Title>
          {unreadCount > 0 && (
            <Badge 
              count={unreadCount} 
              style={{ 
                backgroundColor: '#ff4d4f',
                marginLeft: 8 
              }}
            />
          )}
        </Flex>
        
        <Tooltip title={t('refresh') || 'Refresh'}>
          <Button 
            type="text" 
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={isLoading}
          />
        </Tooltip>
      </Flex>

      <ChatBoxWrapper />
    </Flex>
  );
};

export default ClientPortalChats;
