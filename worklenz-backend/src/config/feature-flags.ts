const truthy = new Set(["1", "true", "yes", "on"]);

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  return truthy.has(value.trim().toLowerCase());
};

export const featureFlags = {
  enableBusinessFeatures: parseBoolean(process.env.ENABLE_BUSINESS_FEATURES, true),
  enableProjectFinance: parseBoolean(process.env.ENABLE_PROJECT_FINANCE, true),
  enableSlackIntegration: parseBoolean(process.env.ENABLE_SLACK_INTEGRATION, true),
  enableClientPortal: parseBoolean(process.env.ENABLE_CLIENT_PORTAL, true),
  enableBusinessBilling: parseBoolean(process.env.ENABLE_BUSINESS_BILLING, true),
  enableBusinessPlanTrials: parseBoolean(process.env.ENABLE_BUSINESS_PLAN_TRIALS, true),
  enableBusinessSubscriptions: parseBoolean(process.env.ENABLE_BUSINESS_SUBSCRIPTIONS, true),
};
