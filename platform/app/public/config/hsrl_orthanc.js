/**
 * HSRL Orthanc DICOM Viewer Configuration
 * Conecta el visor OHIF con Orthanc sin explorador de estudios
 * Solo viewport principal maximizado para visualizar estudios
 */

/** @type {AppTypes.Config} */
window.config = {
  routerBasename: '/images',
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
      logo: '/images/logo.png', // Ruta relativa a /images
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
        // Ajusta estas URLs según tu instalación de Orthanc
        // Por ejemplo: http://hsrl.hospital.local:8042/dicom-web
        // O si está en un proxy inverso: http://hsrl.hospital.local/orthanc/dicom-web
        wadoUriRoot: '/orthanc/dicom-web',
        qidoRoot: '/orthanc/dicom-web',
        wadoRoot: '/orthanc/dicom-web',
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
};
