import React from 'react';
import PixOSToolsPanel from './PixOSToolsPanel';
import ReconstructPanel from './ReconstructPanel';

function getPanelModule({ servicesManager, commandsManager, extensionManager }: withAppTypes) {
  return [
    {
      name: 'reconstruct',
      iconName: 'tab-segmentation',
      iconLabel: 'Reconstruir',
      label: 'Reconstruir',
      component: props => (
        <ReconstructPanel {...props} servicesManager={servicesManager} commandsManager={commandsManager} />
      ),
    },
    {
      name: 'pixos',
      iconName: 'tab-linear',
      iconLabel: 'PixOS',
      label: 'Herramientas',
      component: props => (
        <PixOSToolsPanel
          {...props}
          servicesManager={servicesManager}
          commandsManager={commandsManager}
          extensionManager={extensionManager}
        />
      ),
    },
  ];
}

export default getPanelModule;
