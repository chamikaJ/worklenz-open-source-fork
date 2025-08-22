import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Button,
  Card,
  Col,
  Flex,
  Form,
  Row,
  Select,
  Tag,
  Tooltip,
  Typography,
  message,
  Space,
  CheckCircleFilled,
  Alert,
  InputNumber,
} from '@/shared/antd-imports';
import { useTranslation } from 'react-i18next';

import { adminCenterApiService } from '@/api/admin-center/admin-center.api.service';
import {
  IPricingPlans,
  IUpgradeSubscriptionPlanResponse,
  IPricingOption,
} from '@/types/admin-center/admin-center.types';
import logger from '@/utils/errorLogger';
import { useAppSelector } from '@/hooks/useAppSelector';
import { IPaddlePlans, SUBSCRIPTION_STATUS } from '@/shared/constants';
import { useAuthService } from '@/hooks/useAuth';
import { fetchBillingInfo, toggleUpgradeModal } from '@/features/admin-center/admin-center.slice';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { billingApiService, IPricingPlan } from '@/api/admin-center/billing.api.service';
import { authApiService } from '@/api/auth/auth.api.service';
import { setUser } from '@/features/user/userSlice';
import { setSession } from '@/utils/session-helper';

import './upgrade-plans.css';

// Extend Window interface to include Paddle
declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Setup: (config: { vendor: number; eventCallback: (data: any) => void }) => void;
      Checkout: { open: (params: any) => void };
    };
  }
}

declare const Paddle: any;

const UpgradePlans = () => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['admin-center/current-bill', 'pricing-modal']);
  const [plans, setPlans] = useState<IPricingPlans>({});
  const [backendPlans, setBackendPlans] = useState<IPricingPlan[]>([]);
  const [selectedPlan, setSelectedCard] = useState(IPaddlePlans.ANNUAL);
  const [selectedSeatCount, setSelectedSeatCount] = useState(5);
  const [seatCountOptions, setSeatCountOptions] = useState<number[]>([]);
  const [teamSize, setTeamSize] = useState<number>(1);
  const [switchingToFreePlan, setSwitchingToFreePlan] = useState(false);

  // Single billing frequency for all plans
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'annual'>('annual');

  // Track which plan type is selected
  const [selectedPlanType, setSelectedPlanType] = useState<
    'free' | 'pro' | 'business' | 'enterprise'
  >('pro');

  // Track pricing model selection
  const [selectedPricingModel, setSelectedPricingModel] = useState<'per_user' | 'base_plan'>(
    'per_user'
  );

  // Pricing data state that can be updated from backend
  const [pricingData, setPricingData] = useState({
    free: {
      monthly_price: '0',
      annual_price: '0',
      users_included: '3',
      max_users: '3',
    },
    pro: {
      monthly_price: '69',
      annual_price: '49', // $588/year = $49/month
      annual_total: '588',
      users_included: '15',
      max_users: '50',
    },
    business: {
      monthly_price: '99',
      annual_price: '69', // $828/year = $69/month
      annual_total: '828',
      users_included: '20',
      max_users: '100',
    },
    enterprise: {
      monthly_price: '349',
      annual_price: '299', // $3,588/year = $299/month
      annual_total: '3588',
      users_included: 'Unlimited',
      max_users: 'Unlimited',
    },
  });

  const [switchingToPaddlePlan, setSwitchingToPaddlePlan] = useState(false);
  const [form] = Form.useForm();
  const currentSession = useAuthService().getCurrentSession();
  const paddlePlans = IPaddlePlans;

  const { billingInfo } = useAppSelector(state => state.adminCenterReducer);
  const themeMode = useAppSelector(state => state.themeReducer.mode);

  const [paddleLoading, setPaddleLoading] = useState(false);
  const [paddleError, setPaddleError] = useState<string | null>(null);

  const populateSeatCountOptions = (currentSeats: number) => {
    if (typeof currentSeats !== 'number') return [];

    const step = 5;
    const maxSeats = 90;
    const minValue = currentSeats;
    const options: { value: number; disabled: boolean }[] = [];

    // Always show 1-5, but disable if less than minValue
    for (let i = 1; i <= 5; i++) {
      options.push({ value: i, disabled: i < minValue });
    }

    // Show all multiples of 5 from 10 to maxSeats
    for (let i = 10; i <= maxSeats; i += step) {
      options.push({ value: i, disabled: i < minValue });
    }

    return options;
  };

  // Function to map backend pricing data to our frontend structure
  const mapBackendPlansToFrontend = (backendPlans: IPricingPlan[]) => {
    const mapped: any = {
      free: { monthly_price: '0', annual_price: '0', users_included: '3', max_users: '3' },
      pro: { monthly_price: '0', annual_price: '0', users_included: '15', max_users: '50' },
      business: { monthly_price: '0', annual_price: '0', users_included: '20', max_users: '100' },
      enterprise: {
        monthly_price: '0',
        annual_price: '0',
        users_included: 'Unlimited',
        max_users: 'Unlimited',
      },
    };

    backendPlans.forEach(plan => {
      const planKey = plan.key; // Use the explicit key instead of name matching
      const price = plan.recurring_price.toString(); // Price is already in dollars based on your data

      if (planKey === 'pro') {
        if (plan.billing_type === 'month') {
          mapped.pro.monthly_price = price;
          mapped.pro.monthly_plan_id = plan.id; // Use database UUID id instead of paddle_id
        } else {
          mapped.pro.annual_price = (plan.recurring_price / 12).toFixed(2); // Convert yearly to monthly display
          mapped.pro.annual_total = price;
          mapped.pro.annual_plan_id = plan.id; // Use database UUID id instead of paddle_id
        }
      } else if (planKey === 'business') {
        if (plan.billing_type === 'month') {
          mapped.business.monthly_price = price;
          mapped.business.monthly_plan_id = plan.id; // Use database UUID id instead of paddle_id
        } else {
          mapped.business.annual_price = (plan.recurring_price / 12).toFixed(2);
          mapped.business.annual_total = price;
          mapped.business.annual_plan_id = plan.id; // Use database UUID id instead of paddle_id
        }
      } else if (planKey === 'enterprise') {
        if (plan.billing_type === 'month') {
          mapped.enterprise.monthly_price = price;
          mapped.enterprise.monthly_plan_id = plan.id; // Use database UUID id instead of paddle_id
        } else {
          mapped.enterprise.annual_price = (plan.recurring_price / 12).toFixed(2);
          mapped.enterprise.annual_total = price;
          mapped.enterprise.annual_plan_id = plan.id; // Use database UUID id instead of paddle_id
        }
      } else if (planKey === 'free') {
        // Free plan handling if needed - typically doesn't change from defaults
        // mapped.free.monthly_price = '0'; // Already set in defaults
        // mapped.free.annual_price = '0';   // Already set in defaults
      }
    });

    return mapped;
  };

  // Check if user is AppSumo user based on plan name or other indicators
  const isAppSumoUser = () => {
    const planName = billingInfo?.plan_name?.toLowerCase() || '';
    const subscriptionType = currentSession?.subscription_type?.toLowerCase() || '';

    // Check for AppSumo indicators in plan name or subscription type
    return (
      planName.includes('appsumo') ||
      subscriptionType.includes('appsumo') ||
      planName.includes('lifetime') ||
      subscriptionType.includes('lifetime')
    );
  };

  const fetchPricingPlans = async () => {
    try {
      // For now, use the existing getPlans() method for basic plan info
      const res = await adminCenterApiService.getPlans();
      if (res.done) {
        setPlans(res.body);
      }

      // Backend integration enabled - fetch real pricing data:
      const pricingRes = await billingApiService.getPricingPlans();
      if (pricingRes.done && pricingRes.body) {
        console.log('Backend pricing plans:', pricingRes.body);

        // Filter plans for AppSumo users - only show Business and Enterprise plans
        let filteredPlans = pricingRes.body;
        if (isAppSumoUser()) {
          console.log('AppSumo user detected - filtering plans to Business and Enterprise only');
          filteredPlans = pricingRes.body.filter((plan: IPricingPlan) => {
            const planName = plan.name?.toLowerCase() || '';
            const planKey = plan.key?.toLowerCase() || '';

            // Only show Business and Enterprise plans for AppSumo users
            return (
              planName.includes('business') ||
              planName.includes('enterprise') ||
              planKey.includes('business') ||
              planKey.includes('enterprise')
            );
          });
        }

        setBackendPlans(filteredPlans);
        const mappedPricing = mapBackendPlansToFrontend(filteredPlans);
        console.log('Mapped pricing data:', mappedPricing);
        setPricingData(mappedPricing);
      }
    } catch (error) {
      logger.error('Error fetching pricing plans', error);
      // Fallback to hardcoded data if backend fails
      const mockPricingResponse: IPricingPlans = {
        monthly_plan_id: 'fallback_monthly',
        monthly_plan_name: 'Pro Monthly',
        annual_plan_id: 'fallback_annual',
        annual_plan_name: 'Pro Annual',
        team_member_limit: '3',
        projects_limit: '3',
        free_tier_storage: '100',
        annual_price: '49',
        monthly_price: '69',
      };
      setPlans(mockPricingResponse);
    }
  };

  const switchToFreePlan = async () => {
    const teamId = currentSession?.team_id;
    if (!teamId) return;

    try {
      setSwitchingToFreePlan(true);
      const res = await adminCenterApiService.switchToFreePlan(teamId);
      if (res.done) {
        dispatch(fetchBillingInfo());
        dispatch(toggleUpgradeModal());
        const authorizeResponse = await authApiService.verify();
        if (authorizeResponse.authenticated) {
          setSession(authorizeResponse.user);
          dispatch(setUser(authorizeResponse.user));
          window.location.href = '/worklenz/admin-center/billing';
        }
      }
    } catch (error) {
      logger.error('Error switching to free plan', error);
    } finally {
      setSwitchingToFreePlan(false);
    }
  };

  const handlePaddleCallback = (data: any) => {
    console.log('Paddle event:', data);

    switch (data.event) {
      case 'Checkout.Loaded':
        setSwitchingToPaddlePlan(false);
        setPaddleLoading(false);
        break;
      case 'Checkout.Complete':
        message.success('Subscription updated successfully!');
        setPaddleLoading(true);
        setTimeout(() => {
          dispatch(fetchBillingInfo());
          dispatch(toggleUpgradeModal());
          setSwitchingToPaddlePlan(false);
          setPaddleLoading(false);
        }, 10000);
        break;
      case 'Checkout.Close':
        setSwitchingToPaddlePlan(false);
        setPaddleLoading(false);
        // User closed the checkout without completing
        // message.info('Checkout was closed without completing the subscription');
        break;
      case 'Checkout.Error':
        setSwitchingToPaddlePlan(false);
        setPaddleLoading(false);
        setPaddleError(data.error?.message || 'An error occurred during checkout');
        message.error('Error during checkout: ' + (data.error?.message || 'Unknown error'));
        logger.error('Paddle checkout error', data.error);
        break;
      default:
        // Handle other events if needed
        break;
    }
  };

  const initializePaddle = (data: IUpgradeSubscriptionPlanResponse) => {
    setPaddleLoading(true);
    setPaddleError(null);

    // Check if Paddle is already loaded
    if (window.Paddle) {
      configurePaddle(data);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/paddle.js';
    script.type = 'text/javascript';
    script.async = true;

    script.onload = () => {
      configurePaddle(data);
    };

    script.onerror = () => {
      setPaddleLoading(false);
      setPaddleError('Failed to load Paddle checkout');
      message.error('Failed to load payment processor');
      logger.error('Failed to load Paddle script');
    };

    document.getElementsByTagName('head')[0].appendChild(script);
  };

  const configurePaddle = (data: IUpgradeSubscriptionPlanResponse) => {
    try {
      if (data.sandbox) Paddle.Environment.set('sandbox');
      Paddle.Setup({
        vendor: parseInt(data.vendor_id),
        eventCallback: (eventData: any) => {
          void handlePaddleCallback(eventData);
        },
      });
      Paddle.Checkout.open(data.params);
    } catch (error) {
      setPaddleLoading(false);
      setPaddleError('Failed to initialize checkout');
      message.error('Failed to initialize checkout');
      logger.error('Error initializing Paddle', error);
    }
  };

  const upgradeToPaddlePlan = async (planId: string) => {
    try {
      setSwitchingToPaddlePlan(true);
      setPaddleLoading(true);
      setPaddleError(null);

      // Check if user should use upgrade API (free, trial, or no active paddle subscription)
      const shouldUseUpgradeAPI =
        !billingInfo?.subscription_id || // No paddle subscription
        billingInfo?.status === SUBSCRIPTION_STATUS.TRIALING || // Trial user
        billingInfo?.status === SUBSCRIPTION_STATUS.FREE || // Free plan user
        billingInfo?.status === SUBSCRIPTION_STATUS.PASTDUE || // Past due subscription
        billingInfo?.status === SUBSCRIPTION_STATUS.DELETED; // Deleted subscription

      if (shouldUseUpgradeAPI) {
        // Use upgrade API for users without active paddle subscription
        // Use the selected pricing model and team size
        console.log('Upgrade request:', {
          planId,
          pricingModel: selectedPricingModel,
          teamSize: teamSize,
          isAppSumo: isAppSumoUser(),
          discountApplied: isAppSumoUser() ? '50%' : 'none',
        });

        const res = await billingApiService.upgradeToPaidPlan(
          planId,
          selectedPricingModel,
          selectedPricingModel === 'per_user' ? teamSize : undefined
        );

        console.log('Upgrade API response:', res);

        if (res.done) {
          initializePaddle(res.body);
        } else {
          console.error('Upgrade API failed:', res);
          setSwitchingToPaddlePlan(false);
          setPaddleLoading(false);
          setPaddleError(`Failed to prepare checkout: ${res.message || 'Unknown error'}`);
          message.error(`Failed to prepare checkout: ${res.message || 'Unknown error'}`);
        }
      } else if (
        billingInfo?.status === SUBSCRIPTION_STATUS.ACTIVE ||
        billingInfo?.status === SUBSCRIPTION_STATUS.PAUSED
      ) {
        // For existing active/paused paddle subscriptions, use changePlan endpoint
        const res = await adminCenterApiService.changePlan(planId);
        if (res.done) {
          message.success('Subscription plan changed successfully!');
          dispatch(fetchBillingInfo());
          dispatch(toggleUpgradeModal());
          setSwitchingToPaddlePlan(false);
          setPaddleLoading(false);
        } else {
          setSwitchingToPaddlePlan(false);
          setPaddleLoading(false);
          setPaddleError('Failed to change plan');
          message.error('Failed to change subscription plan');
        }
      } else {
        // Fallback case - should not normally happen
        setSwitchingToPaddlePlan(false);
        setPaddleLoading(false);
        setPaddleError('Unable to process plan selection');
        message.error('Unable to process plan selection. Please contact support.');
      }
    } catch (error) {
      setSwitchingToPaddlePlan(false);
      setPaddleLoading(false);
      setPaddleError('Error upgrading to paid plan');
      message.error('Failed to upgrade to paid plan');
      logger.error('Error upgrading to paddle plan', error);
    }
  };

  const continueWithPaddlePlan = async () => {
    if (selectedPlan && selectedSeatCount.toString() === '100+') {
      message.info('Please contact sales for custom pricing on large teams');
      return;
    }

    try {
      setSwitchingToPaddlePlan(true);
      setPaddleError(null);
      let planId: string | null = null;

      // Use the global billing frequency and selected plan type
      const isAnnual = billingFrequency === 'annual';

      // Get the correct plan ID based on selected plan type, pricing model, and billing frequency
      if (selectedPlanType === 'pro') {
        // Use small team plans if per_user model is selected and available
        if (selectedPricingModel === 'per_user' && pricingData.pro_small) {
          planId = isAnnual ? pricingData.pro_small.annual_plan_id : pricingData.pro_small.monthly_plan_id;
        } else {
          planId = isAnnual ? pricingData.pro.annual_plan_id : pricingData.pro.monthly_plan_id;
        }
      } else if (selectedPlanType === 'business') {
        // Use small team plans if per_user model is selected and available
        if (selectedPricingModel === 'per_user' && pricingData.business_small) {
          planId = isAnnual ? pricingData.business_small.annual_plan_id : pricingData.business_small.monthly_plan_id;
        } else {
          planId = isAnnual ? pricingData.business.annual_plan_id : pricingData.business.monthly_plan_id;
        }
      } else if (selectedPlanType === 'enterprise') {
        planId = isAnnual
          ? pricingData.enterprise.annual_plan_id
          : pricingData.enterprise.monthly_plan_id;
      }

      console.log('Plan selection debug:', {
        selectedPlanType,
        billingFrequency,
        isAnnual,
        planId,
        pricingData: JSON.stringify(pricingData, null, 2),
      });

      // Set the selected plan for the legacy system
      if (isAnnual) {
        setSelectedCard(paddlePlans.ANNUAL);
      } else {
        setSelectedCard(paddlePlans.MONTHLY);
      }

      if (planId) {
        upgradeToPaddlePlan(planId);
      } else {
        setSwitchingToPaddlePlan(false);
        setPaddleError('Plan not available or not configured');
        message.error('Selected plan is not available');
      }
    } catch (error) {
      setSwitchingToPaddlePlan(false);
      setPaddleError('Error processing request');
      message.error('Error processing request');
      logger.error('Error upgrading to paddle plan', error);
    }
  };

  const isSelected = (cardIndex: IPaddlePlans | string) =>
    selectedPlan === cardIndex ? { border: '2px solid #1890ff' } : {};

  const cardStyles = {
    title: {
      color: themeMode === 'dark' ? '#ffffffd9' : '#000000d9',
      fontWeight: 500,
      fontSize: '16px',
      display: 'flex',
      gap: '4px',
      justifyContent: 'center',
    },
    priceContainer: {
      display: 'grid',
      gridTemplateColumns: 'auto',
      rowGap: '10px',
      padding: '20px 20px 0',
    },
    featureList: {
      display: 'grid',
      gridTemplateRows: 'auto auto auto',
      gridTemplateColumns: '200px',
      rowGap: '7px',
      padding: '10px',
      justifyItems: 'start',
      alignItems: 'start',
    },
    checkIcon: { color: '#1890ff' },
  };

  const calculateAnnualTotal = (price: string | undefined) => {
    if (!price) return;
    const basePrice = parseFloat(price);
    let finalPrice = basePrice;
    
    if (selectedPricingModel === 'per_user') {
      finalPrice = basePrice * teamSize;
    }
    
    // Apply 50% discount for AppSumo users within eligibility period
    if (isAppSumoUser()) {
      finalPrice = finalPrice * 0.5;
    }
    
    return finalPrice.toFixed(2);
  };

  const calculateMonthlyTotal = (price: string | undefined) => {
    if (!price) return;
    const basePrice = parseFloat(price);
    let finalPrice = basePrice;
    
    if (selectedPricingModel === 'per_user') {
      finalPrice = basePrice * teamSize;
    }
    
    // Apply 50% discount for AppSumo users within eligibility period
    if (isAppSumoUser()) {
      finalPrice = finalPrice * 0.5;
    }
    
    return finalPrice.toFixed(2);
  };

  const getPriceLabel = (planType: 'annual' | 'monthly') => {
    if (selectedPricingModel === 'per_user') {
      return t('pricing-modal:pricing.perUser') + t('pricing-modal:pricing.perMonth');
    }
    return t('pricing-modal:pricing.perMonth');
  };

  useEffect(() => {
    fetchPricingPlans();
    if (billingInfo?.total_used) {
      setSeatCountOptions(populateSeatCountOptions(billingInfo.total_used));
      form.setFieldsValue({ seatCount: selectedSeatCount });
    }
  }, [billingInfo]);

  const renderFeature = (text: string) => (
    <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <CheckCircleFilled style={{ ...cardStyles.checkIcon, marginTop: '2px', flexShrink: 0 }} />
      <span style={{ lineHeight: '1.4' }}>{text}</span>
    </div>
  );

  useEffect(() => {
    // Cleanup Paddle script when component unmounts
    return () => {
      const paddleScript = document.querySelector('script[src*="paddle.js"]');
      if (paddleScript) {
        paddleScript.remove();
      }
    };
  }, []);

  return (
    <div className="upgrade-plans-responsive">
      <Flex justify="center" align="center">
        <Typography.Title level={2}>
          {billingInfo?.status === SUBSCRIPTION_STATUS.TRIALING
            ? t('selectPlan', 'Select Plan')
            : t('changeSubscriptionPlan', 'Change Subscription Plan')}
        </Typography.Title>
      </Flex>

      {/* AppSumo User Notification */}
      {isAppSumoUser() && (
        <Row justify="center" style={{ marginTop: 24, marginBottom: 16 }}>
          <Alert
            message="AppSumo Lifetime Deal Member"
            description="As an AppSumo lifetime deal member, you have access to upgrade to Business or Enterprise plans with special pricing."
            type="info"
            showIcon
            style={{ maxWidth: 600 }}
          />
        </Row>
      )}

      {/* Global Billing Frequency Toggle */}
      <Row justify="center" style={{ marginTop: isAppSumoUser() ? 8 : 24, marginBottom: 16 }}>
        <Button.Group size="large">
          <Button
            type={billingFrequency === 'monthly' ? 'primary' : 'default'}
            onClick={() => {
              setBillingFrequency('monthly');
              setSelectedCard(paddlePlans.MONTHLY);
            }}
          >
            {t('pricing-modal:billingCycle.monthly')}
          </Button>
          <Button
            type={billingFrequency === 'annual' ? 'primary' : 'default'}
            onClick={() => {
              setBillingFrequency('annual');
              setSelectedCard(paddlePlans.ANNUAL);
            }}
          >
            {t('pricing-modal:billingCycle.yearly')}
          </Button>
        </Button.Group>
      </Row>

      {/* Pricing Model Selection - Only show if both models are available */}
      {!isAppSumoUser() && (pricingData.pro_small || pricingData.business_small) && (
        <Row justify="center" style={{ marginBottom: 16 }}>
          <Space direction="vertical" size="small" style={{ textAlign: 'center' }}>
            <Space size="large">
              <Typography.Text strong>{t('pricing-modal:pricingModel.label')}:</Typography.Text>
              <Button.Group>
                <Button
                  type={selectedPricingModel === 'per_user' ? 'primary' : 'default'}
                  size="small"
                  onClick={() => setSelectedPricingModel('per_user')}
                  disabled={!pricingData.pro_small && !pricingData.business_small}
                >
                  {t('pricing-modal:pricingModel.perUser')} (1-5 users)
                </Button>
                <Button
                  type={selectedPricingModel === 'base_plan' ? 'primary' : 'default'}
                  size="small"
                  onClick={() => setSelectedPricingModel('base_plan')}
                >
                  {t('pricing-modal:pricingModel.basePlan')} (6+ users)
                </Button>
              </Button.Group>
            </Space>

            {billingInfo?.total_used && (
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                {selectedPricingModel === 'per_user'
                  ? `Best for teams with ${billingInfo.total_used} users - pay per user`
                  : `Best for teams with 6+ users - flat monthly rate`}
              </Typography.Text>
            )}
          </Space>
        </Row>
      )}

      <Row className="w-full" gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Free Plan - Hide for AppSumo users */}
        {!isAppSumoUser() && (
          <Col xs={24} lg={6}>
            <Card
              style={{
                height: '100%',
                border: selectedPlanType === 'free' ? '2px solid #1890ff' : '1px solid #d9d9d9',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
              }}
              bodyStyle={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              }}
              onClick={() => {
                setSelectedPlanType('free');
                setSelectedCard(paddlePlans.FREE);
              }}
              hoverable
            >
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <Typography.Title level={4} style={{ marginBottom: 8 }}>
                  {t('pricing-modal:plans.free.name')}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {t('pricing-modal:plans.free.description')}
                </Typography.Text>
              </div>

              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <Typography.Title level={1} style={{ fontSize: '48px', margin: 0 }}>
                  $0
                </Typography.Title>
                <Typography.Text>{t('pricing-modal:plans.free.forever')}</Typography.Text>
              </div>

              <div style={{ flex: 1, marginBottom: 24 }}>
                {renderFeature(`${plans.projects_limit || '3'} ${t('projects', 'Projects')}`)}
                {renderFeature(`${plans.team_member_limit || '3'} ${t('users', 'Users')}`)}
                {renderFeature(t('taskListKanban', 'Task List & Kanban Board'))}
                {renderFeature(t('personalViews', 'Personal Task & Calendar Views'))}
                {renderFeature(t('fileUploads', 'File Uploads & Comments'))}
                {renderFeature(t('labelsFilters', 'Labels & Filters'))}
              </div>

              <div style={{ marginTop: 'auto' }}>
                <Button
                  type="primary"
                  block
                  size="large"
                  onClick={switchToFreePlan}
                  loading={switchingToFreePlan}
                >
                  {t('pricing-modal:buttons.getStartedFree')}
                </Button>
              </div>
            </Card>
          </Col>
        )}

        {/* Pro Plan - Hide for AppSumo users */}
        {!isAppSumoUser() && (
          <Col xs={24} lg={6}>
            <Card
              style={{
                height: '100%',
                border: selectedPlanType === 'pro' ? '2px solid #1890ff' : '1px solid #d9d9d9',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
              }}
              bodyStyle={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              }}
              onClick={() => setSelectedPlanType('pro')}
              hoverable
            >
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <Typography.Title level={4} style={{ marginBottom: 8 }}>
                  {t('pricing-modal:plans.proLarge.name')}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {t('pricing-modal:plans.proLarge.description')}
                </Typography.Text>
              </div>

              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <Typography.Title level={1} style={{ fontSize: '36px', margin: 0 }}>
                  $
                  {billingFrequency === 'annual'
                    ? calculateAnnualTotal(pricingData.pro.annual_price)
                    : calculateMonthlyTotal(pricingData.pro.monthly_price)}
                </Typography.Title>
                <Typography.Text>
                  {getPriceLabel(billingFrequency)}{' '}
                  {billingFrequency === 'annual' ? '(billed annually)' : ''}
                  {isAppSumoUser() && (
                    <span style={{ color: '#52c41a', fontWeight: 'bold', display: 'block', fontSize: '12px' }}>
                      50% AppSumo Discount Applied
                    </span>
                  )}
                </Typography.Text>
                {billingFrequency === 'annual' && (
                  <div style={{ marginTop: 4 }}>
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                      $
                      {selectedPricingModel === 'per_user'
                        ? (
                            parseFloat(pricingData.pro.annual_total || '0') *
                            teamSize * (isAppSumoUser() ? 0.5 : 1)
                          ).toFixed(2)
                        : (parseFloat(pricingData.pro.annual_total || '0') * (isAppSumoUser() ? 0.5 : 1)).toFixed(2)}
                      /year
                      {isAppSumoUser() && (
                        <span style={{ color: '#52c41a', fontWeight: 'bold', marginLeft: 4 }}>
                          (50% AppSumo Discount)
                        </span>
                      )}
                    </Typography.Text>
                  </div>
                )}
                {selectedPricingModel === 'per_user' && (
                  <div style={{ marginTop: 4 }}>
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                      Extra users: $5.99/user/month
                    </Typography.Text>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, marginBottom: 24 }}>
                {renderFeature(t('unlimitedProjects', 'Unlimited Projects'))}
                {renderFeature(`${pricingData.pro.users_included} Users Included`)}
                {renderFeature(`Up to ${pricingData.pro.max_users} Users Max`)}
                {renderFeature(t('timeTracking', 'Time Tracking & Analytics'))}
                {renderFeature(t('projectTemplates', 'Project Templates & Phases'))}
                {renderFeature(t('ganttReadOnly', 'Gantt Charts (Read-only)'))}
                {renderFeature(t('customFields', 'Custom Fields & Subtasks'))}
                {renderFeature(t('projectInsights', 'Project Insights & Reports'))}
              </div>

              <div style={{ marginTop: 'auto' }}>
                <Button
                  type="primary"
                  block
                  size="large"
                  onClick={continueWithPaddlePlan}
                  loading={switchingToPaddlePlan || paddleLoading}
                  disabled={selectedPlanType !== 'pro'}
                >
                  {t('pricing-modal:buttons.choosePlan')}
                </Button>
              </div>
            </Card>
          </Col>
        )}

        {/* Business Plan */}
        <Col xs={24} lg={isAppSumoUser() ? 12 : 6}>
          <Card
            style={{
              height: '100%',
              border: selectedPlanType === 'business' ? '2px solid #1890ff' : '1px solid #d9d9d9',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
            }}
            bodyStyle={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
            onClick={() => setSelectedPlanType('business')}
            hoverable
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Typography.Title level={4} style={{ marginBottom: 8 }}>
                {t('pricing-modal:plans.businessLarge.name')}
              </Typography.Title>
              <Typography.Text type="secondary">
                {t('pricing-modal:plans.businessLarge.description')}
              </Typography.Text>
            </div>

            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Typography.Title level={1} style={{ fontSize: '36px', margin: 0 }}>
                $
                {billingFrequency === 'annual'
                  ? calculateAnnualTotal(
                      selectedPricingModel === 'per_user' && pricingData.business_small 
                        ? pricingData.business_small.annual_price 
                        : pricingData.business.annual_price,
                      selectedPricingModel === 'per_user' && pricingData.business_small 
                        ? pricingData.business_small 
                        : pricingData.business
                    )
                  : calculateMonthlyTotal(
                      selectedPricingModel === 'per_user' && pricingData.business_small 
                        ? pricingData.business_small.monthly_price 
                        : pricingData.business.monthly_price,
                      selectedPricingModel === 'per_user' && pricingData.business_small 
                        ? pricingData.business_small 
                        : pricingData.business
                    )}
              </Typography.Title>
              <Typography.Text>
                {getPriceLabel(billingFrequency)}{' '}
                {billingFrequency === 'annual' ? '(billed annually)' : ''}
                {isAppSumoUser() && (
                  <span style={{ color: '#52c41a', fontWeight: 'bold', display: 'block', fontSize: '12px' }}>
                    50% AppSumo Discount Applied
                  </span>
                )}
              </Typography.Text>
              {billingFrequency === 'annual' && (
                <div style={{ marginTop: 4 }}>
                  <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                    $
                    {selectedPricingModel === 'per_user'
                      ? (
                          parseFloat(pricingData.business.annual_total || '0') *
                          teamSize * (isAppSumoUser() ? 0.5 : 1)
                        ).toFixed(2)
                      : (parseFloat(pricingData.business.annual_total || '0') * (isAppSumoUser() ? 0.5 : 1)).toFixed(2)}
                    /year
                    {isAppSumoUser() && (
                      <span style={{ color: '#52c41a', fontWeight: 'bold', marginLeft: 4 }}>
                        (50% AppSumo Discount)
                      </span>
                    )}
                  </Typography.Text>
                </div>
              )}
              {selectedPricingModel === 'per_user' && (
                <div style={{ marginTop: 4 }}>
                  <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                    Extra users: $5.99/user/month
                  </Typography.Text>
                </div>
              )}
            </div>

            <div style={{ flex: 1, marginBottom: 24 }}>
              <Typography.Text
                strong
                style={{ display: 'block', marginBottom: 12, textAlign: 'center' }}
              >
                {t('everythingInPro', 'Everything in Pro, plus:')}
              </Typography.Text>
              {renderFeature(`${pricingData.business.users_included} Users Included`)}
              {renderFeature(`Up to ${pricingData.business.max_users} Users Max`)}
              {renderFeature(t('fullGanttCharts', 'Full Gantt Charts'))}
              {renderFeature(t('projectHealth', 'Project Health Monitoring'))}
              {renderFeature(t('clientPortal', 'Client Portal'))}
              {renderFeature(t('financeTracking', 'Finance & Billable Tracking'))}
              {renderFeature(t('scheduler', 'Advanced Scheduler'))}
            </div>

            <div style={{ marginTop: 'auto' }}>
              <Button
                type="primary"
                block
                size="large"
                onClick={continueWithPaddlePlan}
                loading={switchingToPaddlePlan || paddleLoading}
                disabled={selectedPlanType !== 'business'}
              >
                {t('pricing-modal:buttons.choosePlan')}
              </Button>
            </div>
          </Card>
        </Col>

        {/* Enterprise Plan */}
        <Col xs={24} lg={isAppSumoUser() ? 12 : 6}>
          <Card
            style={{
              height: '100%',
              border: selectedPlanType === 'enterprise' ? '2px solid #1890ff' : '1px solid #d9d9d9',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
            }}
            bodyStyle={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
            onClick={() => setSelectedPlanType('enterprise')}
            hoverable
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Typography.Title level={4} style={{ marginBottom: 8 }}>
                {t('pricing-modal:plans.enterprise.name')}
              </Typography.Title>
              <Typography.Text type="secondary">
                {t('pricing-modal:plans.enterprise.description')}
              </Typography.Text>
            </div>

            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Typography.Title level={1} style={{ fontSize: '36px', margin: 0 }}>
                $
                {billingFrequency === 'annual'
                  ? calculateAnnualTotal(pricingData.enterprise.annual_price)
                  : calculateMonthlyTotal(pricingData.enterprise.monthly_price)}
              </Typography.Title>
              <Typography.Text>
                {getPriceLabel(billingFrequency)}{' '}
                {billingFrequency === 'annual' ? '(billed annually)' : ''}
                {isAppSumoUser() && (
                  <span style={{ color: '#52c41a', fontWeight: 'bold', display: 'block', fontSize: '12px' }}>
                    50% AppSumo Discount Applied
                  </span>
                )}
              </Typography.Text>
              {billingFrequency === 'annual' && (
                <div style={{ marginTop: 4 }}>
                  <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                    $
                    {selectedPricingModel === 'per_user'
                      ? (
                          parseFloat(pricingData.enterprise.annual_total || '0') *
                          teamSize * (isAppSumoUser() ? 0.5 : 1)
                        ).toFixed(2)
                      : (parseFloat(pricingData.enterprise.annual_total || '0') * (isAppSumoUser() ? 0.5 : 1)).toFixed(2)}
                    /year
                    {isAppSumoUser() && (
                      <span style={{ color: '#52c41a', fontWeight: 'bold', marginLeft: 4 }}>
                        (50% AppSumo Discount)
                      </span>
                    )}
                  </Typography.Text>
                </div>
              )}
            </div>

            <div style={{ flex: 1, marginBottom: 24 }}>
              <Typography.Text
                strong
                style={{ display: 'block', marginBottom: 12, textAlign: 'center' }}
              >
                {t('everythingInBusiness', 'Everything in Business, plus:')}
              </Typography.Text>
              {renderFeature(`${pricingData.enterprise.users_included} Users`)}
              {renderFeature(t('noExtraUserCost', 'No Extra User Cost'))}
              {renderFeature(t('advancedSecurity', 'Advanced Security'))}
              {renderFeature(t('customIntegrations', 'Custom Integrations'))}
              {renderFeature(t('prioritySupport', 'Priority Support'))}
            </div>

            <div style={{ marginTop: 'auto' }}>
              <Button
                type="primary"
                block
                size="large"
                onClick={continueWithPaddlePlan}
                loading={switchingToPaddlePlan || paddleLoading}
                disabled={selectedPlanType !== 'enterprise'}
              >
                {t('pricing-modal:buttons.choosePlan')}
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      {paddleError && (
        <Row justify="center" style={{ marginTop: 16 }}>
          <Alert message={paddleError} type="error" showIcon />
        </Row>
      )}
    </div>
  );
};

export default UpgradePlans;
