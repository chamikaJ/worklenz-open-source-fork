import React, { useState, useRef, useCallback, lazy, Suspense, useEffect } from 'react';
import { Form, Input, Button, Upload, message, Card, Space, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { RcFile } from 'antd/es/upload';
import DOMPurify from 'dompurify';

// Lazy load TinyMCE editor to reduce initial bundle size
const LazyTinyMCEEditor = lazy(() => 
  import('@tinymce/tinymce-react').then(module => ({ default: module.Editor }))
);

const { TextArea } = Input;
const { Title, Text } = Typography;

interface ServiceDetailsStepProps {
  setCurrent: (step: number) => void;
  service: any;
  setService: (service: any) => void;
}

const ServiceDetailsStep: React.FC<ServiceDetailsStepProps> = ({ setCurrent, service, setService }) => {
  const { t } = useTranslation('client-portal-services');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [isEditorLoading, setIsEditorLoading] = useState<boolean>(false);
  const [isTinyMCELoaded, setIsTinyMCELoaded] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load TinyMCE script only when editor is opened
  const loadTinyMCE = async () => {
    if (isTinyMCELoaded) return;
    
    setIsEditorLoading(true);
    try {
      // Load TinyMCE script dynamically
      await new Promise<void>((resolve, reject) => {
        if ((window as any).tinymce) {
          resolve();
          return;
        }
        
        const script = document.createElement('script');
        script.src = '/tinymce/tinymce.min.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load TinyMCE'));
        document.head.appendChild(script);
      });
      
      setIsTinyMCELoaded(true);
    } catch (error) {
      console.error('Failed to load TinyMCE:', error);
      setIsEditorLoading(false);
    }
  };

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
      setService({
        ...service,
        service_data: {
          ...service.service_data,
          images: [e.target?.result as string]
        }
      });
      setUploading(false);
    };
    reader.readAsDataURL(file);
    return false;
  }, [service, setService]);

  const removeImage = () => {
    setImageUrl('');
    setService({
      ...service,
      service_data: {
        ...service.service_data,
        images: []
      }
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNext = () => {
    if (!service.name || !service.service_data?.description) {
      message.error('Please fill in all required fields');
      return;
    }
    setCurrent(1);
  };

  const handleOpenEditor = async () => {
    setIsEditorOpen(true);
    await loadTinyMCE();
  };

  const handleContentClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    
    // Check if clicked element is a link
    if (target.tagName === 'A' || target.closest('a')) {
      event.preventDefault(); // Prevent default link behavior
      event.stopPropagation(); // Prevent opening the editor
      const link = target.tagName === 'A' ? target : target.closest('a');
      if (link) {
        const href = (link as HTMLAnchorElement).href;
        if (href) {
          // Open link in new tab/window for security
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
      return;
    }
    
    // If not a link, open the editor
    handleOpenEditor();
  };

  const handleEditorChange = (content: string) => {
    const sanitizedContent = DOMPurify.sanitize(content);
    setService({
      ...service,
      service_data: {
        ...service.service_data,
        description: sanitizedContent
      }
    });
  };

  const handleInit = (evt: any, editor: any) => {
    editorRef.current = editor;
    editor.on('focus', () => setIsEditorOpen(true));
    setIsEditorLoading(false);
  };

  // Handle outside clicks to close editor
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const wrapper = wrapperRef.current;
      const target = event.target as Node;

      const isClickedInsideWrapper = wrapper && wrapper.contains(target);
      const isClickedInsideEditor = document.querySelector('.tox-tinymce')?.contains(target);
      const isClickedInsideToolbarPopup = document
        .querySelector('.tox-menu, .tox-pop, .tox-collection, .tox-dialog, .tox-dialog-wrap, .tox-silver-sink')
        ?.contains(target);

      if (
        isEditorOpen &&
        !isClickedInsideWrapper &&
        !isClickedInsideEditor &&
        !isClickedInsideToolbarPopup
      ) {
        setIsEditorOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditorOpen]);

  // CSS styles for description content links
  const descriptionStyles = `
    .description-content a {
      color: ${document.documentElement.classList.contains('dark') ? '#4dabf7' : '#1890ff'} !important;
      text-decoration: underline !important;
      cursor: pointer !important;
    }
    .description-content a:hover {
      color: ${document.documentElement.classList.contains('dark') ? '#74c0fc' : '#40a9ff'} !important;
    }
  `;

  const darkModeStyles = document.documentElement.classList.contains('dark')
    ? `
      body { 
        background-color: #1e1e1e !important;
        color: #ffffff !important;
      }
      body.mce-content-body[data-mce-placeholder]:not([contenteditable="false"]):before {
        color: #666666 !important;
      }
    `
    : '';

  return (
    <div className="flex flex-col h-full">
      {/* Inject CSS styles for links */}
      <style>{descriptionStyles}</style>
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
                <Input
                  placeholder={t('addService.serviceDetails.serviceNamePlaceholder')}
                  className="h-9"
                  value={service.name || ''}
                  onChange={(e) => setService({ ...service, name: e.target.value })}
                />
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
              <div ref={wrapperRef}>
                {isEditorOpen ? (
                  <div
                    style={{
                      minHeight: '200px',
                      backgroundColor: document.documentElement.classList.contains('dark') ? '#1e1e1e' : '#ffffff',
                    }}
                  >
                    {isEditorLoading && (
                      <div
                        style={{
                          position: 'absolute',
                          zIndex: 10,
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          width: '100%',
                          height: '200px',
                          backgroundColor: document.documentElement.classList.contains('dark') 
                            ? 'rgba(30, 30, 30, 0.8)' 
                            : 'rgba(255, 255, 255, 0.8)',
                          color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#000000',
                        }}
                      >
                        <div>Loading editor...</div>
                      </div>
                    )}
                    {isTinyMCELoaded && (
                      <Suspense fallback={<div>Loading editor...</div>}>
                        <LazyTinyMCEEditor
                          tinymceScriptSrc="/tinymce/tinymce.min.js"
                          value={service.service_data?.description || ''}
                          onInit={handleInit}
                          licenseKey="gpl"
                          init={{
                            height: 200,
                            menubar: false,
                            branding: false,
                            plugins: [
                              'advlist',
                              'autolink',
                              'lists',
                              'link',
                              'charmap',
                              'preview',
                              'anchor',
                              'searchreplace',
                              'visualblocks',
                              'code',
                              'fullscreen',
                              'insertdatetime',
                              'media',
                              'table',
                              'code',
                              'wordcount',
                            ],
                            toolbar:
                              'blocks |' +
                              'bold italic underline strikethrough | ' +
                              'bullist numlist | link |  removeformat | help',
                            content_style: `
                              body { 
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
                                font-size: 14px;
                              }
                              ${darkModeStyles}
                            `,
                            skin: document.documentElement.classList.contains('dark') ? 'oxide-dark' : 'oxide',
                            content_css: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
                            skin_url: `/tinymce/skins/ui/${document.documentElement.classList.contains('dark') ? 'oxide-dark' : 'oxide'}`,
                            content_css_cors: true,
                            auto_focus: true,
                            placeholder: t('addService.serviceDetails.descriptionPlaceholder'),
                            init_instance_callback: editor => {
                              editor.dom.setStyle(
                                editor.getBody(),
                                'backgroundColor',
                                document.documentElement.classList.contains('dark') ? '#1e1e1e' : '#ffffff'
                              );
                            },
                          }}
                          onEditorChange={handleEditorChange}
                        />
                      </Suspense>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={handleContentClick}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    style={{
                      minHeight: '40px',
                      padding: '8px 12px',
                      border: `1px solid ${document.documentElement.classList.contains('dark') ? '#424242' : '#d9d9d9'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: isHovered
                        ? document.documentElement.classList.contains('dark')
                          ? '#2a2a2a'
                          : '#fafafa'
                        : document.documentElement.classList.contains('dark')
                        ? '#1e1e1e'
                        : '#ffffff',
                      color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#000000',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {service.service_data?.description ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(service.service_data.description),
                        }}
                        className="description-content"
                      />
                    ) : (
                      <div
                        style={{
                          color: document.documentElement.classList.contains('dark') ? '#888888' : '#999999',
                          fontStyle: 'italic',
                        }}
                      >
                        Click to add description...
                      </div>
                    )}
                  </div>
                )}
              </div>
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
