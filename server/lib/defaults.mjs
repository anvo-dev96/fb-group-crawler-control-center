import os from 'node:os';

export const DEFAULT_SERVER_PORT = Number(process.env.FB_CRAWLER_SERVER_PORT || 8787);
export const DEFAULT_WEB_PORT = Number(process.env.FB_CRAWLER_WEB_PORT || 4173);

export function defaultBrowserChoices() {
  return [
    { type: 'chrome', label: 'Google Chrome', path: '' },
    { type: 'edge', label: 'Microsoft Edge', path: '' },
    { type: 'brave', label: 'Brave', path: '' },
    { type: 'firefox', label: 'Firefox', path: '' },
  ];
}

export function defaultGroupTypes() {
  return [
    { id: 'community-general', label: 'Cộng đồng chung' },
    { id: 'buy-sell-general', label: 'Mua bán tổng hợp' },
    { id: 'real-estate', label: 'Bất động sản' },
    { id: 'vehicles', label: 'Xe cộ' },
    { id: 'jobs-services', label: 'Việc làm dịch vụ' },
    { id: 'mother-baby', label: 'Mẹ và bé' },
    { id: 'technology', label: 'Công nghệ điện tử' },
    { id: 'fashion-beauty', label: 'Thời trang làm đẹp' },
    { id: 'home-living', label: 'Đồ gia dụng nhà cửa' },
    { id: 'food-travel-pets', label: 'Ẩm thực du lịch thú cưng' },
  ];
}

export function defaultProductTypes() {
  return [];
}

export function defaultConfigUi() {
  return {
    chatgptUrl: 'https://chatgpt.com',
    shopeeUrl: 'https://shopee.vn',
    affUrl: 'https://affiliate.shopee.vn/dashboard',
    aiProvider: 'auto',
    aiFallback: true,
    aiRouter9: true,
    routerUrl: '',
    routerToken: '',
    combo: '',
    analyzePrompt: '',
    commentPrompt: '',
    analysisPromptRule: '',
    commentPromptRule: '',
    telemetryEnabled: false,
    telemetryEndpoint: '',
    telemetryApiKey: '',
    telemetryTraceback: true,
    telemetryWarnings: true,
    telemetryRecentLogs: 20,
    tgEnabled: false,
    tgToken: '',
    tgChatId: '',
    tgPreview: true,
    tgNotifyCommentErrors: false,
    tgControl: false,
    affMethod: 'api',
    cvProvider: 'off',
    tinyccWaitSeconds: 8,
    affiliateId: '',
    tinyApiKey: '',
    muahangreApiKey: '',
    muahangreStatus: {},
    tinyRows: [],
    perGroup: 20,
    delay: 10,
    workflow: 'full',
    skipProcessed: true,
    deleteUnapproved: true,
    runMode: 'once',
    cycleWait: 15,
    browserType: 'chrome',
    browserHeadless: false,
    browserProfileId: 'Default',
    browserProfiles: [],
    edgePort: 9222,
    useSeparateProfile: false,
    browserChoices: defaultBrowserChoices(),
    browserPaths: {},
    edgePaths: [],
    chromePaths: [],
    bravePaths: [],
    firefoxPaths: [],
    theme: 'system',
    buyKeywords: '',
    blacklistKeywords: '',
  };
}

export function defaultState() {
  return {
    meta: {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      host: os.hostname(),
    },
    configUi: defaultConfigUi(),
    groups: [],
    groupTypes: defaultGroupTypes(),
    productTypes: defaultProductTypes(),
    facebookAccounts: [],
    groupCollections: [],
    groupSurveys: [],
    products: [],
    history: [],
    runs: [],
    orders: [],
    clicks: [],
    cpcConfig: {
      average_cpc: 0,
      per_subid: {},
    },
    tinyTokens: [],
    favorites: [],
  };
}
