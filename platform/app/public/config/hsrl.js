/**
 * HSRL Orthanc DICOM Viewer — Full Workstation Configuration
 * Viewer DICOM completo con AI Pipeline, segmentacion, MPR/3D, sincronizacion.
 *
 * Server: imagen.hospitalrealsanlucas.com.mx
 * AI:     ai.pixos.com.mx
 * Deploy: ~/imagelink/viewer/images/
 */

/** @type {AppTypes.Config} */
window.config = {
  routerBasename: '/images/',
  extensions: [],
  modes: [],
  showStudyList: false,
  simplifiedUI: true,
  maxNumberOfWebWorkers: 6,
  showLoadingIndicator: true,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  strictZSpacingForVolumeViewport: true,
  autoPlayCine: true,
  autoTriggerAI: true,
  useNorm16Texture: true,
  experimentalStudyBrowserSort: false,
  groupEnabledModesFirst: false,
  maxNumRequests: {
    interaction: 100,
    thumbnail: 10,
    prefetch: 25,
  },
  maxCacheSize: 2 * 1024 * 1024 * 1024,
  studyPrefetcher: {
    enabled: true,
    displaySetsCount: 3,
    maxNumPrefetchRequests: 15,
    order: 'closest',
  },
  defaultDataSourceName: 'hsrl',

  whiteLabeling: {
    createLogoComponentFn: function(React) {
      return React.createElement('div', {
        style: { padding: '4px 8px', display: 'flex', alignItems: 'center' },
      }, React.createElement('img', {
        src: '/images/assets/logo-hsrl.png',
        alt: 'HSRL',
        style: { height: '28px', width: 'auto', objectFit: 'contain' },
      }));
    },
    createStudyListFetcher: () => null,
  },

  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'hsrl',
      configuration: {
        friendlyName: 'HSRL Orthanc DICOM Server',
        name: 'HSRL',
        wadoUriRoot: 'https://imagen.hospitalrealsanlucas.com.mx/wado',
        qidoRoot: 'https://imagen.hospitalrealsanlucas.com.mx/dicom-web',
        wadoRoot: 'https://imagen.hospitalrealsanlucas.com.mx/dicom-web',
        qidoSupportsIncludeField: true,
        supportsReject: true,
        dicomUploadEnabled: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'rendered',
        thumbnailRequestStrategy: 'fetch',
        enableStudyLazyLoad: false,
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

  showPatientInfo: 'visibleCollapsed',
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
