/**
 * HSRL Orthanc DICOM Viewer — Full Workstation Configuration
 * Viewer DICOM completo con AI Pipeline, segmentacion, MPR/3D, sincronizacion.
 *
 * Server: imagen.hospitalrealsanlucas.com.mx
 * AI:     ai.pixos.com.mx
 * Deploy: ~/imagelink/viewer/viewers2/
 */

// iPhone/iPad (iPadOS reports itself as a Mac with touch) and other phones.
// Safari kills tabs that hold more than ~1 GB, so mobile gets a smaller
// cache/prefetch budget.
const HSRL_IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const HSRL_IS_MOBILE = HSRL_IS_IOS || /Android|Mobi/i.test(navigator.userAgent);

/** @type {AppTypes.Config} */
window.config = {
  routerBasename: '/viewers2/',
  extensions: [],
  modes: [],
  showStudyList: false,
  simplifiedUI: true,
  maxNumberOfWebWorkers: HSRL_IS_MOBILE ? 2 : 6,
  showLoadingIndicator: true,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  strictZSpacingForVolumeViewport: true,
  autoPlayCine: true,
  autoTriggerAI: true,
  useNorm16Texture: true,
  experimentalStudyBrowserSort: false,
  groupEnabledModesFirst: false,
  // Concurrent requests per pool. Over HTTP/2 the browser no longer caps a
  // host at 6 connections, and each frame request makes Orthanc load the whole
  // multiframe file (an XA cine is ~60 MB): 100 at once saturated the server.
  // Orthanc-reader also caps itself at 8 HTTP threads.
  maxNumRequests: {
    interaction: HSRL_IS_MOBILE ? 4 : 8,
    thumbnail: HSRL_IS_MOBILE ? 2 : 3,
    prefetch: HSRL_IS_MOBILE ? 2 : 4,
  },
  maxCacheSize: (HSRL_IS_MOBILE ? 512 : 2048) * 1024 * 1024,
  studyPrefetcher: {
    enabled: true,
    // Production values: with HTTP/1.1 (6 connections per host) a larger
    // prefetch starves the series being viewed.
    displaySetsCount: HSRL_IS_MOBILE ? 1 : 2,
    maxNumPrefetchRequests: 10,
    order: 'closest',
  },
  defaultDataSourceName: 'hsrl',

  whiteLabeling: {
    createLogoComponentFn: function(React) {
      return React.createElement('div', {
        style: { padding: '4px 8px', display: 'flex', alignItems: 'center' },
      }, React.createElement('img', {
        src: '/viewers2/assets/logo-hsrl.png',
        alt: 'HSRL',
        style: { height: '28px', width: 'auto', objectFit: 'contain' },
      }));
    },
    createStudyListFetcher: () => null,
  },

  // Logo del indicador de carga
  ui: {
    whiteLabeling: {
      logo: '/viewers2/assets/logo-hsrl.png',
    },
  },

  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'hsrl',
      configuration: {
        friendlyName: 'HSRL Orthanc DICOM Server',
        name: 'HSRL',
        // Same origin as the viewer: on imagen.hospitalrealsanlucas.com.mx this is
        // the same URL as always; on localhost it goes through the dev server's
        // proxy (pnpm dev:hsrl), avoiding a CORS preflight on every frame.
        wadoUriRoot: `${window.location.origin}/wado`,
        qidoRoot: `${window.location.origin}/dicom-web`,
        wadoRoot: `${window.location.origin}/dicom-web`,
        qidoSupportsIncludeField: true,
        // Orthanc no decodifica %2F en QIDO: PatientID como "380/26" se manda como "380*26"
        qidoUnsafeCharsAsWildcard: true,
        supportsReject: true,
        // Public Orthanc paths are read-only (Apache): uploads would fail.
        dicomUploadEnabled: false,
        imageRendering: 'wadors',
        // Phones build thumbnails from the first frame, as the previous viewer
        // did; server-rendered thumbnails make Orthanc open every instance,
        // which on a busy server left the mobile panel empty for a long time.
        thumbnailRendering: HSRL_IS_MOBILE ? 'wadors' : 'rendered',
        thumbnailRequestStrategy: 'fetch',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: true,
        omitQuotationForMultipartRequest: true,
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'DICOM JSON',
        name: 'json',
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'Archivos DICOM Locales',
      },
    },
  ],

  showPatientInfo: 'visible',
  httpErrorHandler: error => {
    console.warn(`HTTP Error (${error.status})`, error);
    if (window.__hsrlNotify) {
      window.__hsrlNotify(
        'error',
        'Error de conexion',
        `Error ${error.status || ''} al comunicarse con el servidor DICOM.`
      );
    }
  },
  investigationalUseDialog: { option: 'never' },
  customizationService: {
    'studyBrowser.thumbnailMenuItems': [],
    'panelSegmentation.hideByDefault': true,
  },

  // ---------------------------------------------------------------------------
  // Configuracion del panel de interpretaciones
  // ---------------------------------------------------------------------------
  interpretationsPanel: {
    showInterpretationsPanel: true,
    parseUrl: 'https://imagen.hospitalrealsanlucas.com.mx/server',
    appId: '2aa9a978-cae0-4a8d-96f6-036ab4aa13c7',
    jsKey: '3f3d7912-270b-4d62-a2b9-d9e895191307',
    studiesClass: 'Studies',
    studiesUidField: 'instanceUUID',
    interpretationsClass: 'Interpretations',
    interpretationsStudyField: 'study',
    interpretationsContentField: 'content',
    interpretationsSignedField: 'signed',
    interpretationsSignedAtField: 'signedAt',
    interpretationsUserField: 'user',
    userClass: '_User',
    userNameField: 'fullName',
    orthancBaseUrl: 'https://imagen.hospitalrealsanlucas.com.mx/pacs-web',
    orthancUuidField: 'orthancUUID',
    interpretationsPdfUrlField: 'pdfUrl',
    interpretationsPdfCloudFunction: 'interpretationPDFById',
    studyViewerBaseUrl: 'https://imagen.hospitalrealsanlucas.com.mx',
  },
};
