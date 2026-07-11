import React from 'react';

function PixOSPanel() {
  return React.createElement('div', { className: 'p-4 text-white', style: { padding: 20, fontFamily: 'system-ui' } },
    React.createElement('div', { style: { fontWeight: 'bold', fontSize: 14, marginBottom: 8 } }, 'PixOS Panel'),
    React.createElement('div', { style: { fontSize: 12, color: '#aaa' } }, 'Panel cargado correctamente.')
  );
}

function getPanelModule() {
  return [
    { name: 'pixos', iconName: 'tab-patient-info', iconLabel: 'PixOS', label: 'PixOS', component: PixOSPanel },
  ];
}

export default getPanelModule;
