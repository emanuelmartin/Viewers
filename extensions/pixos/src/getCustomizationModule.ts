import { defaults } from '@ohif/core';

// Space plays/pauses the series (upstream: reset viewport, moved to shift+space).
const hotkeyBindings = [
  ...defaults.hotkeyBindings.map(binding =>
    binding.commandName === 'resetViewport' ? { ...binding, keys: ['shift+space'] } : binding
  ),
  { commandName: 'toggleCinePlayback', label: 'Reproducir / pausar', keys: ['space'] },
];

function getCustomizationModule() {
  return [
    {
      name: 'default',
      value: {
        'studyBrowser.thumbnailMenuItems': [],
        'ohif.hotkeyBindings': hotkeyBindings,
        // Playback rate when the series has no FrameTime / RecommendedDisplayFrameRate.
        // Angiography and ultrasound loops are acquired at ~30 fps; cross-sectional
        // stacks read better slower.
        'cinePlayer.defaultFrameRates': {
          XA: 30,
          RF: 30,
          XRF: 30,
          US: 30,
          CT: 10,
          MR: 8,
          PT: 8,
          NM: 8,
          default: 15,
        },
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
