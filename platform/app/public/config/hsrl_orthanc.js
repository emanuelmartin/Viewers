/**
 * HSRL Orthanc DICOM Viewer Configuration
 * Conecta el visor OHIF con Orthanc sin explorador de estudios
 * Solo viewport principal maximizado para visualizar estudios
 */

/** @type {AppTypes.Config} */
window.config = {
  routerBasename: '/images/',
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
        style: { padding: '4px 8px', display: 'flex', alignItems: 'center' },
      }, React.createElement('img', {
        src: '/images/images/logo-hsrl.png',
        alt: 'HSRL',
        style: { height: '28px', width: 'auto', objectFit: 'contain' },
      }));
    },
    createStudyListFetcher: () => null,
  },

  // Customizaciones de UI
  ui: {
    whiteLabeling: {
      logo: '/images/images/logo-hsrl.png', // Logo del Hospital Real San Lucas TEPA
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

  // ---------------------------------------------------------------------------
  // Configuración del panel de interpretaciones
  // Ajusta los nombres de clases y campos si conectas una base de datos diferente.
  // ---------------------------------------------------------------------------
  interpretationsPanel: {
    // URL base del servidor Parse (sin barra al final)
    parseUrl: 'https://imagen.hospitalrealsanlucas.com.mx/server',
    // Application ID de Parse
    appId: '2aa9a978-cae0-4a8d-96f6-036ab4aa13c7',
    // JavaScript client key de Parse (omite si no aplica)
    jsKey: '3f3d7912-270b-4d62-a2b9-d9e895191307',
    // Token de sesión opcional (para acceso restringido)
    // sessionToken: 'r:xxxx',

    // --- Clase que contiene los estudios DICOM ---
    studiesClass: 'Studies',
    // Campo de studiesClass que almacena el StudyInstanceUID DICOM
    studiesUidField: 'instanceUUID',

    // --- Clase que contiene las interpretaciones / informes ---
    interpretationsClass: 'Interpretations',
    // Campo Pointer de interpretationsClass que apunta a studiesClass
    interpretationsStudyField: 'study',
    // Campo con el contenido HTML del informe
    interpretationsContentField: 'content',
    // Campo booleano: indica si el informe está firmado/finalizado
    interpretationsSignedField: 'signed',
    // Campo de fecha: cuándo fue firmado el informe
    interpretationsSignedAtField: 'signedAt',

    // --- Descarga de imágenes DICOM vía Orthanc ---
    // URL base del servidor Orthanc (sin barra al final).
    // Al estar configurada, aparece el botón "Descargar" en el panel.
    // Cada estudio se descarga como ZIP desde: {orthancBaseUrl}/studies/{uuid}/archive
    orthancBaseUrl: 'https://imagen.hospitalrealsanlucas.com.mx/pacs-web',
    // Campo de studiesClass que almacena el UUID interno de Orthanc
    orthancUuidField: 'orthancUUID',
  },
};
