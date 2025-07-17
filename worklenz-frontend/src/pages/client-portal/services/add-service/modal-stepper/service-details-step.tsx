import React, { useState, useRef, useCallback } from 'react';
import { Form, Input, Button, Upload, message, Card, Space, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { RcFile } from 'antd/es/upload';
import { Editor } from '@tinymce/tinymce-react';

const { TextArea } = Input;
const { Title, Text } = Typography;

interface ServiceDetailsStepProps {
  form: any;
  onNext: () => void;
  onPrevious: () => void;
}

const ServiceDetailsStep: React.FC<ServiceDetailsStepProps> = ({ form, onNext, onPrevious }) => {
  const { t } = useTranslation('client-portal-services');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);

  const beforeUpload = (file: RcFile) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error(t('addService.serviceDetails.imageUploadError'));
      return false;
    }
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error(t('addService.serviceDetails.imageSizeError'));
      return false;
    }
    return true;
  };

  const handleImageUpload = useCallback((file: RcFile) => {
    if (!beforeUpload(file)) return false;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
      form.setFieldsValue({ serviceImage: file });
      setUploading(false);
    };
    reader.readAsDataURL(file);
    return false;
  }, [form]);

  const removeImage = () => {
    setImageUrl('');
    form.setFieldsValue({ serviceImage: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNext = () => {
    form.validateFields(['serviceName', 'serviceDescription']).then(() => {
      onNext();
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <Card className="shadow-sm border-gray-200 dark:border-gray-700">
          <div className="space-y-4">
            {/* Service Name and Image - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Service Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('addService.serviceDetails.serviceName')} *
                </label>
                <Form.Item
                  name="serviceName"
                  rules={[{ required: true, message: t('addService.serviceDetails.serviceNameRequired') }]}
                  className="!mb-2"
                >
                  <Input
                    placeholder={t('addService.serviceDetails.serviceNamePlaceholder')}
                    className="h-9"
                  />
                </Form.Item>
              </div>

              {/* Service Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('addService.serviceDetails.serviceImage')}
                </label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                  {imageUrl ? (
                    <div className="relative">
                      <img
                        src={imageUrl}
                        alt="Service preview"
                        className="max-h-32 mx-auto rounded object-cover"
                      />
                      <Button
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={removeImage}
                        className="absolute top-1 right-1 bg-red-500 text-white hover:bg-red-600"
                        size="small"
                      />
                    </div>
                  ) : (
                    <div className="py-2">
                      <UploadOutlined className="text-2xl text-gray-400 mb-1" />
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {t('addService.serviceDetails.imageUploadText')}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file as RcFile);
                        }}
                        className="hidden"
                      />
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => fileInputRef.current?.click()}
                        loading={uploading}
                        size="small"
                      >
                        {t('addService.serviceDetails.uploadImage')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Service Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('addService.serviceDetails.serviceDescription')} *
              </label>
              <Form.Item
                name="serviceDescription"
                rules={[{ required: true, message: t('addService.serviceDetails.serviceDescriptionRequired') }]}
                className="!mb-2"
              >
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                  <Editor
                    onInit={(evt, editor) => (editorRef.current = editor)}
                    tinymceScriptSrc="/tinymce/tinymce.min.js"
                    init={{
                      height: 200,
                      menubar: false,
                      plugins: [
                        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                        'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                        'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount'
                      ],
                      toolbar: 'undo redo | blocks | ' +
                        'bold italic forecolor | alignleft aligncenter ' +
                        'alignright alignjustify | bullist numlist outdent indent | ' +
                        'removeformat | help',
                      content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; }',
                      skin: document.documentElement.classList.contains('dark') ? 'oxide-dark' : 'oxide',
                      content_css: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
                      skin_url: `/tinymce/skins/ui/${document.documentElement.classList.contains('dark') ? 'oxide-dark' : 'oxide'}`,
                      placeholder: t('addService.serviceDetails.descriptionPlaceholder'),
                      branding: false,
                      promotion: false,
                      elementpath: false,
                      resize: false,
                      setup: (editor) => {
                        editor.on('change', () => {
                          const content = editor.getContent();
                          form.setFieldsValue({ serviceDescription: content });
                        });
                      }
                    }}
                  />
                </div>
              </Form.Item>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {t('addService.serviceDetails.descriptionHelp')}
              </Text>
            </div>
          </div>
        </Card>
      </div>

      {/* Navigation Buttons - Fixed at bottom */}
      <div className="flex justify-end pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        <Button type="primary" onClick={handleNext} size="middle">
          {t('addService.serviceDetails.next')}
        </Button>
      </div>
    </div>
  );
};

export default ServiceDetailsStep;
