/**
 * Radiographs side by side (pixOS).
 *
 * Chest PA + lateral, two-view knee, one breast's CC + MLO: a radiologist
 * reads the projections together, so a DX/CR/MG study with two or more image
 * series opens 1×2 (three: 1×3) instead of one image at a time. A full
 * four-view mammogram still opens with OHIF's mammography protocol, which
 * weighs more from four views up.
 */
// No allowUnmatchedView: a stage only activates when every pane has its own
// radiograph (one image never turns into an empty 1×2).
const viewportOptions = {
  toolGroupId: 'default',
};

const RADIOGRAPHY = ['DX', 'CR', 'MG'];

const view = (index: number) => ({
  viewportOptions,
  displaySets: [{ id: 'radiograph', matchedDisplaySetsIndex: index }],
});

const hpPairedViews = {
  id: '@pixos/hpPairedViews',
  name: 'Proyecciones lado a lado',
  description: 'Radiografías y mamografía: las proyecciones del estudio juntas',
  locked: true,
  protocolMatchingRules: [
    {
      id: 'radiography',
      weight: 100,
      attribute: 'ModalitiesInStudy',
      constraint: { contains: RADIOGRAPHY },
      required: true,
    },
    {
      id: 'twoOrMore',
      weight: 1,
      attribute: 'numberOfDisplaySetsWithImages',
      // OHIF's greaterThan is «at least»
      constraint: { greaterThan: { value: 2 } },
      required: true,
    },
    {
      // Two or three views (one breast, PA + lateral): ahead of OHIF's 2×2
      // mammography protocol (weight 150), which would leave empty panes.
      // Four views or more: that protocol wins. lessThan is «at most».
      id: 'fewViews',
      weight: 100,
      attribute: 'numberOfDisplaySetsWithImages',
      constraint: { lessThan: { value: 3 } },
    },
  ],
  toolGroupIds: ['default'],
  displaySetSelectors: {
    radiograph: {
      seriesMatchingRules: [
        {
          attribute: 'Modality',
          constraint: { contains: RADIOGRAPHY },
          required: true,
        },
        {
          attribute: 'numImageFrames',
          constraint: { greaterThan: { value: 0 } },
          required: true,
        },
        // The series named in the URL goes first
        { attribute: 'isDisplaySetFromUrl', weight: 20, constraint: { equals: true } },
      ],
    },
  },
  defaultViewport: {
    viewportOptions: { viewportType: 'stack', toolGroupId: 'default', allowUnmatchedView: true },
    displaySets: [{ id: 'radiograph', matchedDisplaySetsIndex: -1 }],
  },
  stages: [
    {
      id: 'three',
      name: '1×3',
      stageActivation: { enabled: { minViewportsMatched: 3 } },
      viewportStructure: { layoutType: 'grid', properties: { rows: 1, columns: 3 } },
      viewports: [view(0), view(1), view(2)],
    },
    {
      id: 'two',
      name: '1×2',
      stageActivation: { enabled: { minViewportsMatched: 2 } },
      viewportStructure: { layoutType: 'grid', properties: { rows: 1, columns: 2 } },
      viewports: [view(0), view(1)],
    },
  ],
  numberOfPriorsReferenced: -1,
};

export default hpPairedViews;
