/**
 * HSRL Orthanc DICOM Viewer Configuration
 * Conecta el visor OHIF con Orthanc sin explorador de estudios
 * Solo viewport principal maximizado para visualizar estudios
 */

/** @type {AppTypes.Config} */
window.config = {
  routerBasename: '/',
  extensions: [],
  modes: [],
  // Desactivar explorador de estudios
  showStudyList: false,
  // Configuración de workers
  maxNumberOfWebWorkers: 3,
  // Indicadores de carga y mensajes
  showLoadingIndicator: true,
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  strictZSpacingForVolumeViewport: true,
  experimentalStudyBrowserSort: false,
  // Prefetcher para optimizar carga de imágenes
  studyPrefetcher: {
    enabled: true,
    displaySetsCount: 2,
    maxNumPrefetchRequests: 10,
    order: 'closest',
  },
  // Data source por defecto
  defaultDataSourceName: 'hsrl',

  // Whitelabelling / Customización UI
  whiteLabeling: {
    createLogoComponentFn: function(React) {
      return React.createElement('div', {
        className: 'font-bold text-white',
        style: { fontSize: '16px' },
      }, 'HSRL Imaging');
    },
    createStudyListFetcher: () => null,
  },

  // Customizaciones de UI
  ui: {
    whiteLabeling: {
      logo: '/images/logo-hsrl.png', // Logo del Hospital Real San Lucas TEPA
      menuTitle: 'HSRL DICOM Viewer',
    },
  },

  // Fuentes de datos: Orthanc
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'hsrl',
      configuration: {
        friendlyName: 'HSRL Orthanc DICOM Server',
        name: 'HSRL',
        // Configuración HSRL - Hospital Real San Lucas
        // Rutas del servidor DICOMWeb
        wadoUriRoot: 'https://imagen.hospitalrealsanlucas.com.mx/wado',
        qidoRoot: 'https://imagen.hospitalrealsanlucas.com.mx/dicom-web',
        wadoRoot: 'https://imagen.hospitalrealsanlucas.com.mx/dicom-web',
        // Configuración de capacidades
        qidoSupportsIncludeField: true,
        supportsReject: true,
        dicomUploadEnabled: true,
        // Rendering
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        // Optimizaciones
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: true,
        omitQuotationForMultipartRequest: true,
        // Bulk data configuration
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
      },
    },
    // Soporte para JSON DICOM (opcional)
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'DICOM JSON',
        name: 'json',
      },
    },
    // Soporte para archivos locales (opcional)
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'Archivos DICOM Locales',
      },
    },
  ],

  // Manejador de errores HTTP
  httpErrorHandler: error => {
    console.warn(`HTTP Error Handler (status: ${error.status})`, error);
  },
  // Disable medical use disclaimer
  investigationalUseDialog: { option: 'never' },
};
