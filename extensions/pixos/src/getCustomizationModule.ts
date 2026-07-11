function getCustomizationModule() {
  return [
    {
      name: 'default',
      value: {
        'studyBrowser.thumbnailMenuItems': [],
        'panelSegmentation.hideByDefault': true,
        'cornerstone.windowLevelPresets': {
          CT: [
            { id: 'ct-soft-tissue', description: 'Tejido blando', window: '400', level: '40' },
            { id: 'ct-lung', description: 'Pulmon', window: '1500', level: '-600' },
            { id: 'ct-bone', description: 'Hueso', window: '2500', level: '480' },
            { id: 'ct-brain', description: 'Cerebro', window: '80', level: '40' },
          ],
          MR: [
            { id: 'mr-t1', description: 'T1', window: '800', level: '350' },
            { id: 'mr-t2', description: 'T2', window: '2500', level: '1200' },
            { id: 'mr-flair', description: 'FLAIR', window: '2500', level: '1200' },
          ],
          DX: [{ id: 'dx-default', description: 'Default', window: '2048', level: '1024' }],
          CR: [{ id: 'cr-default', description: 'Default', window: '2048', level: '1024' }],
        },
      },
    },
  ];
}

export default getCustomizationModule;
