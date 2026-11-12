import React from 'react';
import { PanelPetSUV, PanelROIThresholdExport } from './Panels';
import { Toolbox } from '@ohif/extension-default';
import PanelTMTV from './Panels/PanelTMTV';
import i18n from '@ohif/i18n';

function getPanelModule({ commandsManager, extensionManager, servicesManager }) {
  const { toolbarService } = servicesManager.services;

  const wrappedPanelPetSuv = () => {
    return <PanelPetSUV />;
  };

  const wrappedROIThresholdToolbox = () => {
    return (
      <Toolbox
        buttonSectionId={toolbarService.sections.roiThresholdToolbox}
        title={i18n.t('ROIThresholdConfiguration:Threshold Tools')}
      />
    );
  };

  const wrappedROIThresholdExport = () => {
    return <PanelROIThresholdExport />;
  };

  const wrappedPanelTMTV = () => {
    return (
      <>
        <Toolbox
          buttonSectionId={toolbarService.sections.roiThresholdToolbox}
          title={i18n.t('ROIThresholdConfiguration:Threshold Tools')}
        />
        <PanelTMTV
          commandsManager={commandsManager}
          servicesManager={servicesManager}
        />
      </>
    );
  };

  return [
    {
      name: 'petSUV',
      iconName: 'tab-patient-info',
      iconLabel: 'SUV',
      label: 'Datos SUV',
      component: wrappedPanelPetSuv,
    },
    {
      name: 'tmtv',
      iconName: 'tab-segmentation',
      iconLabel: 'Segmentation',
      label: 'Segmentación',
      component: wrappedPanelTMTV,
    },
    {
      name: 'tmtvBox',
      iconName: 'tab-segmentation',
      iconLabel: 'Segmentation',
      label: 'Herramientas de segmentación',
      component: wrappedROIThresholdToolbox,
    },
    {
      name: 'tmtvExport',
      iconName: 'tab-segmentation',
      iconLabel: 'Segmentation',
      label: 'Exportar segmentación',
      component: wrappedROIThresholdExport,
    },
  ];
}

export default getPanelModule;
