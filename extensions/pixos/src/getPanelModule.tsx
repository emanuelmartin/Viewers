import React from 'react';
import PixOSToolsPanel from './PixOSToolsPanel';

function getPanelModule({ servicesManager, commandsManager, extensionManager }: withAppTypes) {
  return [
    {
      name: 'pixos',
      iconName: 'tab-linear',
      iconLabel: 'PixOS',
      label: 'Herramientas PixOS',
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
