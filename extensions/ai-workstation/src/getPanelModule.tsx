import React from 'react';
import AIToolsPanel from './AIToolsPanel';

function getPanelModule({ commandsManager, servicesManager }) {
  return [
    {
      name: 'aiTools',
      iconName: 'tab-patient-info',
      iconLabel: 'AI Tools',
      label: 'AI Tools',
      component: () => (
        <AIToolsPanel
          commandsManager={commandsManager}
          servicesManager={servicesManager}
        />
      ),
    },
  ];
}

export default getPanelModule;
